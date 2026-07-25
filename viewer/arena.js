/* ============================================================
   Innbyggbart arenakart — logikk.

   Leser ./arena.json (generert av KrUltra Løypemakker) og viser et
   oversiktsbilde av et arenaområde med inntegnede områder (polygoner) og
   punkter. Elementene fargelegges etter type, listes i en scrollbar
   oversikt, og highlightes begge veier: hover/klikk/trykk på kartet ↔
   klikk i lista.

   Bruker Leaflet med CRS.Simple (bildet som «kart»). Ingen avhengighet av
   felles.js — arenakartet er en helt selvstendig visning.
   ============================================================ */
'use strict';

let arena = null;          // hele arena.json
let map = null;
let bildeB = 1, bildeH = 1; // bildets naturlige mål (piksler)
const lagFor = {};         // feature-id -> Leaflet-lag (polygon/circleMarker)
const listeElFor = {};     // feature-id -> DOM-listeelement
let valgtId = null;

const NØYTRAL = '#64748b'; // farge for elementer uten type

// ============================================================
// Oppstart: hent arenadata
// ============================================================

fetch('./arena.json', { cache: 'no-cache' })
  .then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  })
  .then((data) => {
    arena = data;
    startVisning();
    document.getElementById('arena-laster').remove();
  })
  .catch((feil) => {
    document.getElementById('arena-laster').textContent =
      'Kunne ikke laste arenakartet (' + feil.message + '). Prøv å oppdatere siden.';
  });

function startVisning() {
  bildeB = arena.bilde_bredde || 1000;
  bildeH = arena.bilde_høyde || 1000;

  document.title = 'Arenakart – ' + (arena.navn || '');
  document.getElementById('arena-tittel').textContent = arena.navn || 'Arenakart';
  const beskr = document.getElementById('arena-beskrivelse');
  if (arena.beskrivelse) beskr.textContent = arena.beskrivelse; else beskr.remove();

  const generert = arena.generert ? new Date(arena.generert) : null;
  document.getElementById('arena-bunn').innerHTML =
    (generert ? 'Oppdatert ' + generert.toLocaleDateString('nb-NO') + ' · ' : '') +
    'Laget og publisert av <a href="https://krultra.no" target="_blank" rel="noopener">KrUltra</a>';

  document.getElementById('arena-app').classList.remove('skjult');

  byggKart();
  byggListe();
  byggListeToggle();
}

// ============================================================
// Koordinater: normalisert [x, y] (0–1, y fra topp) <-> Leaflet CRS.Simple
// ============================================================
//
// I CRS.Simple øker «lat» oppover. Bildet fyller bounds [[0,0],[H,W]], så
// bildets øverste kant ligger på lat = H. Et normalisert punkt (nx, ny) med
// ny målt fra TOPPEN blir da: lat = H·(1 − ny), lng = W·nx.

function tilLatLng(par) {
  return L.latLng(bildeH * (1 - par[1]), bildeB * par[0]);
}

// ============================================================
// Kartet
// ============================================================

function fargeFor(feature) {
  const t = (arena.typer || []).find((t) => t.id === feature.type_id);
  return (t && t.farge) || NØYTRAL;
}

function byggKart() {
  map = L.map('arena-map', {
    crs: L.CRS.Simple,
    minZoom: -6,
    maxZoom: 6,
    zoomSnap: 0.25,
    attributionControl: false,
  });

  const bounds = [[0, 0], [bildeH, bildeB]];
  if (arena.bilde_fil) {
    L.imageOverlay('./' + arena.bilde_fil, bounds).addTo(map);
  }
  map.fitBounds(bounds);
  map.setMaxBounds(L.latLngBounds(bounds).pad(0.5));

  forsiktigKartNavigasjon();

  for (const f of (arena.features || [])) tegnFeature(f);

  // Klikk på tomt kart lukker valget
  map.on('click', () => velg(null));
}

function tegnFeature(f) {
  const farge = fargeFor(f);
  let lag;
  if (f.form === 'polygon' && f.geometri && f.geometri.length >= 3) {
    lag = L.polygon(f.geometri.map(tilLatLng), {
      color: farge, weight: 2, fillColor: farge, fillOpacity: 0.35,
    });
  } else if (f.geometri && f.geometri.length >= 1) {
    lag = L.circleMarker(tilLatLng(f.geometri[0]), {
      radius: 8, color: '#ffffff', weight: 2,
      fillColor: farge, fillOpacity: 1,
    });
  } else {
    return; // ugyldig geometri — hopp over
  }
  lag.addTo(map);
  lag.bindTooltip(f.navn, { direction: 'top', sticky: f.form === 'polygon' });
  lag.on('click', (e) => { L.DomEvent.stop(e); velg(f.id, true); });
  lag.on('mouseover', () => framhev(f.id, true));
  lag.on('mouseout', () => { if (valgtId !== f.id) framhev(f.id, false); });
  lagFor[f.id] = lag;
}

/** Skånsom kartnavigasjon når visningen er BYGD INN i en annen side. */
function forsiktigKartNavigasjon() {
  if (window.self === window.top) return;
  map.scrollWheelZoom.disable();
  map.on('click', () => map.scrollWheelZoom.enable());
  map.getContainer().addEventListener('mouseleave', () => map.scrollWheelZoom.disable());

  if (!('ontouchstart' in window)) return;
  const kartEl = map.getContainer();
  const hint = document.getElementById('arena-kart-hint');
  let hintTimer = null;
  const visHint = () => {
    hint.classList.remove('skjult', 'usynlig');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add('usynlig'), 1200);
  };
  map.dragging.disable();
  kartEl.style.touchAction = 'pan-y';
  kartEl.addEventListener('touchstart', (e) => {
    if (e.touches.length >= 2) { hint.classList.add('usynlig'); map.dragging.enable(); }
  }, { passive: true });
  kartEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && !map.dragging.enabled()) visHint();
  }, { passive: true });
  kartEl.addEventListener('touchend', (e) => {
    if (e.touches.length < 2 && map.dragging.enabled()) {
      map.dragging.disable();
      kartEl.style.touchAction = 'pan-y';
    }
  }, { passive: true });
}

// ============================================================
// Listen over steder
// ============================================================

function byggListe() {
  const liste = document.getElementById('arena-liste');
  liste.innerHTML = '';
  const features = arena.features || [];
  if (!features.length) {
    liste.innerHTML = '<p class="arena-liste-tom">Ingen steder er markert ennå.</p>';
    return;
  }

  // Grupper etter type; typene i definert rekkefølge, «uten type» til slutt
  const typer = (arena.typer || []).slice();
  const grupper = typer.map((t) => ({
    tittel: t.navn, farge: t.farge,
    features: features.filter((f) => f.type_id === t.id),
  })).filter((g) => g.features.length);
  const utenType = features.filter(
    (f) => !typer.some((t) => t.id === f.type_id));
  if (utenType.length) grupper.push({ tittel: 'Annet', farge: NØYTRAL, features: utenType });

  // Verktøylinje: kollaps/ekspander alle gruppene på én gang (vises når det
  // er mer enn én type å styre)
  if (grupper.length > 1) {
    const verktøy = document.createElement('div');
    verktøy.className = 'arena-liste-verktoy';
    const knapp = (tekst, kollaps) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arena-liste-verktoy-knapp';
      b.textContent = tekst;
      b.addEventListener('click', () => settAlleGrupper(kollaps));
      return b;
    };
    verktøy.appendChild(knapp('▾ Vis alle', false));
    verktøy.appendChild(knapp('▸ Skjul alle', true));
    liste.appendChild(verktøy);
  }

  for (const g of grupper) {
    const bolk = document.createElement('div');
    bolk.className = 'arena-gruppe';
    // Gruppetittelen er en knapp som kollapser/ekspanderer typen — nyttig
    // når det er mange steder i lista.
    const h = document.createElement('button');
    h.type = 'button';
    h.className = 'arena-gruppe-tittel';
    h.setAttribute('aria-expanded', 'true');
    h.innerHTML = '<span class="arena-karet">▾</span>' +
      '<span class="arena-prikk" style="background:' + escHtml(g.farge) + '"></span>' +
      '<span class="arena-gruppe-navn">' + escHtml(g.tittel) + '</span>' +
      '<span class="arena-gruppe-antall">' + g.features.length + '</span>';
    h.addEventListener('click', () => {
      const kollaps = bolk.classList.toggle('kollapset');
      h.setAttribute('aria-expanded', String(!kollaps));
    });
    bolk.appendChild(h);
    for (const f of g.features) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'arena-liste-el';
      el.style.setProperty('--farge', g.farge);
      el.innerHTML = '<span class="arena-liste-navn">' + escHtml(f.navn) + '</span>' +
        (f.beskrivelse ? '<span class="arena-liste-beskr">' + escHtml(f.beskrivelse) + '</span>' : '');
      el.addEventListener('click', () => velg(f.id, true));
      el.addEventListener('mouseenter', () => { if (valgtId !== f.id) framhev(f.id, true); });
      el.addEventListener('mouseleave', () => { if (valgtId !== f.id) framhev(f.id, false); });
      bolk.appendChild(el);
      listeElFor[f.id] = el;
    }
    liste.appendChild(bolk);
  }
}

/** Kollaps eller ekspander alle type-gruppene i steder-lista på én gang. */
function settAlleGrupper(kollaps) {
  document.querySelectorAll('#arena-liste .arena-gruppe').forEach((g) => {
    g.classList.toggle('kollapset', kollaps);
    const t = g.querySelector('.arena-gruppe-tittel');
    if (t) t.setAttribute('aria-expanded', String(!kollaps));
  });
}

// ============================================================
// Highlighting (begge veier)
// ============================================================

/** Midlertidig framheving (hover) uten å endre selve valget. */
function framhev(id, på) {
  const lag = lagFor[id];
  if (!lag) return;
  if (lag.setStyle) {
    lag.setStyle(på
      ? { weight: 4, fillOpacity: lag instanceof L.Polygon ? 0.55 : 1 }
      : { weight: 2, fillOpacity: lag instanceof L.Polygon ? 0.35 : 1 });
  }
  const el = listeElFor[id];
  if (el) el.classList.toggle('framhevet', på || valgtId === id);
}

/** Velg et sted: framhev vedvarende, pan/zoom til det, vis navn. */
function velg(id, flyTil) {
  // Nullstill forrige valg
  if (valgtId && valgtId !== id) {
    framhev(valgtId, false);
    const lag = lagFor[valgtId];
    if (lag && lag.closeTooltip) lag.closeTooltip();
  }
  valgtId = id;
  if (!id) return;

  const lag = lagFor[id];
  if (!lag) return;
  framhev(id, true);
  const el = listeElFor[id];
  if (el) {
    el.classList.add('framhevet');
    // Er stedets type-gruppe kollapset, ekspander den så elementet (med
    // full beskrivelse) faktisk vises.
    const grp = el.closest('.arena-gruppe');
    if (grp && grp.classList.contains('kollapset')) {
      grp.classList.remove('kollapset');
      const tittel = grp.querySelector('.arena-gruppe-tittel');
      if (tittel) tittel.setAttribute('aria-expanded', 'true');
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  if (flyTil) {
    if (lag.getBounds) {
      map.flyToBounds(lag.getBounds().pad(1.2), { maxZoom: 3, duration: 0.4 });
    } else if (lag.getLatLng) {
      map.flyTo(lag.getLatLng(), Math.min(3, map.getZoom() + 1), { duration: 0.4 });
    }
  }
  if (lag.openTooltip) lag.openTooltip();
}

// ============================================================
// Liste-panel av/på (mobil, og valgfritt på store skjermer)
// ============================================================

function byggListeToggle() {
  const knapp = document.getElementById('arena-liste-toggle');
  const app = document.getElementById('arena-app');
  knapp.addEventListener('click', () => {
    const skjult = app.classList.toggle('liste-skjult');
    knapp.setAttribute('aria-expanded', String(!skjult));
    setTimeout(() => map.invalidateSize(), 250);
  });
}

// ============================================================
// Småhjelpere
// ============================================================

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

window.addEventListener('resize', () => { if (map) map.invalidateSize(); });
