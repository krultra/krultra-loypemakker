/* ============================================================
   Innbyggbar løypevisning — logikk.

   Leser ./course.json (generert av KrUltra Løypemakker) og viser:
     - kart (Kartverket topo / Esri satellitt) med ruta og PoI-er
     - klikkbare PoI-er med navn, beskrivelse og statistikk
     - høydeprofil med PoI-indikatorer
     - en markør som kan føres gjennom løypa (slider, dra på
       profilen eller klikk på ruta) — synkronisert mellom kart og
       profil, med distanse- og høydemeterdata for punktet

   Bruker de delte funksjonene fra felles.js (samme kode som selve
   verktøyet), så beregninger og symboler er identiske.
   ============================================================ */
'use strict';

// ---- Tilstand (fylles når course.json er lastet) ----
let løype = null;      // hele course.json
let punkter = [];      // [{lat, lon, ele}]
let avstander = [];    // kumulativ km per punkt
let høyder = [];       // interpolerte + utjevnede høyder
let oppAkk = [], nedAkk = []; // akkumulerte høydemeter per punkt
let veipunkter = [];   // [{...wpt, idx}] sortert på idx
let valgtIdx = 0;

let map, sporLinje, posMarkør;
const profilCanvas = document.getElementById('profil');

// ============================================================
// Språk (i18n) — norsk + engelsk, språk-agnostisk oppbygd
// ============================================================
// Faste GUI-strenger per språk. Ukjente språk / manglende nøkler faller
// tilbake til norsk. Nye språk legges til ved å utvide TEKST.
const TEKST = {
  no: {
    satellitt: 'Satellitt', kart: 'Kart', fullskjerm: '⛶ Full skjerm',
    satellittTittel: 'Bytt mellom kart og satellittbilde',
    fullskjermTittel: 'Åpne løypevisningen i egen fane i full størrelse',
    distanse: 'Distanse', hoyde: 'Høyde', hoydemeterFraStart: 'Høydemeter fra start',
    moh: 'moh.', fraForrige: 'Fra forrige punkt', fra: 'Fra', start: 'start',
    distanseFraStart: 'Distanse fra start', seArenakart: '🏟️ Se arenakart',
    oppdatert: 'Oppdatert', kartKilde: 'Kart', publisertAv: 'Laget og publisert av',
    omLopet: 'Om løpet', tofinger: 'Bruk to fingre for å flytte kartet',
    laster: 'Laster løypa …', lasterFeil: 'Kunne ikke laste løypa',
    proevOppdater: 'Prøv å oppdatere siden.', loypekartTittel: 'Løypekart', loype: 'Løype',
  },
  en: {
    satellitt: 'Satellite', kart: 'Map', fullskjerm: '⛶ Full screen',
    satellittTittel: 'Switch between map and satellite imagery',
    fullskjermTittel: 'Open the course view in its own tab at full size',
    distanse: 'Distance', hoyde: 'Elevation', hoydemeterFraStart: 'Ascent/descent from start',
    moh: 'm a.s.l.', fraForrige: 'From previous point', fra: 'From', start: 'start',
    distanseFraStart: 'Distance from start', seArenakart: '🏟️ View arena map',
    oppdatert: 'Updated', kartKilde: 'Map', publisertAv: 'Created and published by',
    omLopet: 'About the race', tofinger: 'Use two fingers to move the map',
    laster: 'Loading the course …', lasterFeil: 'Could not load the course',
    proevOppdater: 'Please refresh the page.', loypekartTittel: 'Course map', loype: 'Course',
  },
};

let lang = 'no';
/** Hvilket språk er valgt: ?lang= (validert) → standardSprak → 'no'. */
function velgSprak(standardSprak) {
  const url = new URLSearchParams(location.search).get('lang');
  const kandidat = String(url || standardSprak || 'no').toLowerCase();
  lang = TEKST[kandidat] ? kandidat : 'no';
  document.documentElement.lang = lang === 'en' ? 'en' : 'nb';
}
/** Oversett en fast GUI-streng (faller tilbake til norsk). */
function t(nokkel) { return (TEKST[lang] && TEKST[lang][nokkel]) || TEKST.no[nokkel]; }
/** Lokaliser et INNHOLDSfelt: obj.oversettelser[lang][felt], ellers kildefeltet. */
function lok(obj, felt) {
  const o = obj && obj.oversettelser && obj.oversettelser[lang];
  return (o && o[felt] != null && o[felt] !== '') ? o[felt] : (obj ? obj[felt] : undefined);
}
/** Locale for tall/dato etter valgt språk. */
function locale() { return lang === 'en' ? 'en-GB' : 'nb-NO'; }
/** Km formatert i riktig locale for valgt språk. */
function kmT(km) { return fmtKm(km, locale()); }

// ============================================================
// Oppstart: hent løypedata
// ============================================================

velgSprak(null); // foreløpig fra URL (for laster-teksten); finpusses ved lasting
document.getElementById('laster').textContent = t('laster');

fetch('./course.json', { cache: 'no-cache' })
  .then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  })
  .then((data) => {
    løype = data;
    if (!new URLSearchParams(location.search).get('lang')) velgSprak(løype.standard_sprak);
    startVisning();
    document.getElementById('laster').remove();
  })
  .catch((feil) => {
    document.getElementById('laster').textContent =
      t('lasterFeil') + ' (' + feil.message + '). ' + t('proevOppdater');
  });

function startVisning() {
  const stil = løype.stil || {};
  const pStil = stil.profil || {};

  // Punktlista kommer som [[lat, lon, ele], ...] for kompakt JSON
  punkter = løype.punkter.map((p) => ({ lat: p[0], lon: p[1], ele: p[2] }));

  // Distanse og høydemeter: bruk de EKSAKTE verdiene fra publiseringen
  // (beregnet fra originalsporet før punktforenkling) når de finnes —
  // ellers beregn fra de forenklede punktene som reserveløsning.
  avstander = (løype.avstander && løype.avstander.length === punkter.length)
    ? løype.avstander : kumulativAvstand(punkter);

  // Høyder til TEGNING av profilen (litt utjevnet for pen kurve)
  const rå = høyderMedInterpolering(punkter) || punkter.map(() => 0);
  høyder = gaussUtjevning(rå, Math.min(5, pStil.utjevning || 0), pStil.vektform || 3);

  if (løype.opp && løype.opp.length === punkter.length) {
    oppAkk = løype.opp;
    nedAkk = løype.ned;
  } else {
    oppAkk = [0]; nedAkk = [0];
    for (let i = 1; i < høyder.length; i++) {
      const d = høyder[i] - høyder[i - 1];
      oppAkk.push(oppAkk[i - 1] + Math.max(0, d));
      nedAkk.push(nedAkk[i - 1] + Math.max(0, -d));
    }
  }

  // Veipunkter, sortert langs løypa (idx er beregnet ved publisering)
  veipunkter = (løype.veipunkter || [])
    .map((w) => Object.assign({}, w, { idx: klem(w.idx || 0, 0, punkter.length - 1) }))
    .sort((a, b) => a.idx - b.idx);

  // Faste GUI-etiketter etter valgt språk
  const settTekst = (id, tekst) => { const el = document.getElementById(id); if (el) el.textContent = tekst; };
  settTekst('lag-knapp', t('satellitt'));
  document.getElementById('lag-knapp').title = t('satellittTittel');
  settTekst('i-lbl-dist', t('distanse'));
  settTekst('i-lbl-hoyde', t('hoyde'));
  settTekst('i-lbl-hm-start', t('hoydemeterFraStart'));
  settTekst('i-lbl-hm-forrige', t('fraForrige'));
  const hint = document.getElementById('kart-hint');
  if (hint) hint.textContent = t('tofinger');
  byggSpraakvelger();

  // Topptekst og nøkkeltall
  const loypeNavn = lok(løype, 'navn');
  const loypeBeskr = lok(løype, 'beskrivelse');
  document.title = t('loypekartTittel') + ' – ' + (loypeNavn || '');
  document.getElementById('tittel').textContent = loypeNavn || t('loype');
  const beskr = document.getElementById('beskrivelse');
  if (loypeBeskr) beskr.textContent = loypeBeskr; else beskr.remove();
  document.getElementById('nokkeltall').textContent =
    kmT(avstander[avstander.length - 1]) +
    ' · ↑ ' + Math.round(oppAkk[oppAkk.length - 1]) + ' m' +
    ' · ↓ ' + Math.round(nedAkk[nedAkk.length - 1]) + ' m';
  document.getElementById('topp').classList.remove('skjult');

  const generert = løype.generert ? new Date(løype.generert) : null;
  // NB: løype.link kan komme fra data andre har sendt inn (import) — den
  // valideres til http(s) og escapes før den settes inn i href, så en
  // ondsinnet lenke ikke kan injisere skript på publiseringsdomenet.
  const trygglenke = tryggUrl(løype.link);
  document.getElementById('bunn').innerHTML =
    (generert ? t('oppdatert') + ' ' + generert.toLocaleDateString(locale()) + ' · ' : '') +
    t('kartKilde') + ': © <a href="https://www.kartverket.no/" target="_blank" rel="noopener">Kartverket</a>' +
    ' · ' + t('publisertAv') + ' <a href="https://krultra.no" target="_blank" rel="noopener">KrUltra</a>' +
    (trygglenke ? ' · <a href="' + escHtml(trygglenke) +
      '" target="_blank" rel="noopener">' + escHtml(t('omLopet')) + '</a>' : '');

  // «Vis i full skjerm»: bare når visningen er bygd inn i en annen side
  // (iframe) — åpner den direkte adressen i en egen fane
  if (window.self !== window.top) {
    const fs = document.getElementById('fullskjerm-knapp');
    fs.textContent = t('fullskjerm');
    fs.title = t('fullskjermTittel');
    fs.classList.remove('skjult');
    fs.addEventListener('click', () =>
      window.open(window.location.href, '_blank', 'noopener'));
  }

  byggKart(stil);
  byggProfilInteraksjon();
  settValgtIdx(0);
  tegnProfilV();
}

// ============================================================
// Kartet
// ============================================================

const KARTLAG_V = {
  topo: L.tileLayer(
    'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
    { maxZoom: 19, attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>' }),
  satellitt: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: '© Esri, Maxar, Earthstar Geographics' }),
};

function byggKart(stil) {
  map = L.map('map', { renderer: L.canvas({ padding: 0.7 }), maxZoom: 19, minZoom: 3 });
  KARTLAG_V.topo.addTo(map);

  let satellitt = false;
  document.getElementById('lag-knapp').addEventListener('click', (e) => {
    satellitt = !satellitt;
    map.removeLayer(satellitt ? KARTLAG_V.topo : KARTLAG_V.satellitt);
    (satellitt ? KARTLAG_V.satellitt : KARTLAG_V.topo).addTo(map);
    e.target.textContent = satellitt ? t('kart') : t('satellitt');
  });

  const latlngs = punkter.map((p) => [p.lat, p.lon]);
  sporLinje = L.polyline(latlngs, {
    color: stil.rutefarge || '#dc2626',
    weight: stil.tykkelse || 4,
    opacity: 0.9,
  }).addTo(map);

  // Åpningsutsnitt: ta med både sporet OG veipunktene (med etikett-
  // plasseringene der de finnes), så ingen ikoner havner utenfor. En
  // pikselmargin reserverer plass til ikonrammene, som tegnes et stykke
  // fra selve punktet. maxZoom hindrer at svært korte spor zoomer forbi
  // kartflisenes nivå (som gir hvit/tom bakgrunn) — 16 gir alltid fliser
  // og et lesbart arena-utsnitt.
  const utsnitt = L.latLngBounds(latlngs);
  for (const w of veipunkter) {
    utsnitt.extend([w.lat, w.lon]);
    if (w.lab_lat != null && w.lab_lon != null) utsnitt.extend([w.lab_lat, w.lab_lon]);
  }
  map.fitBounds(utsnitt, { maxZoom: 16, padding: [70, 70] });

  forsiktigKartNavigasjon();

  // Klikk på/nær ruta flytter markøren dit
  map.on('click', (e) => {
    let besteI = 0, besteD = Infinity;
    const steg = Math.max(1, Math.floor(punkter.length / 3000));
    for (let i = 0; i < punkter.length; i += steg) {
      const d = avstandKm({ lat: e.latlng.lat, lon: e.latlng.lng }, punkter[i]);
      if (d < besteD) { besteD = d; besteI = i; }
    }
    if (besteD < 0.5) settValgtIdx(besteI); // bare hvis man traff i nærheten
  });

  posMarkør = L.circleMarker(latlngs[0], {
    radius: 8, color: '#ffffff', weight: 2,
    fillColor: stil.rutefarge || '#dc2626', fillOpacity: 1,
  }).addTo(map);

  tegnVeipunkterKart(stil);
  map.on('zoomend', () => tegnVeipunkterKart(stil));
}

/**
 * Skånsom kartnavigasjon når visningen er BYGD INN i en annen side:
 * kartet skal ikke «fange» brukeren som prøver å scrolle siden rundt.
 *
 *  - Berøring: én finger scroller siden (touch-action: pan-y), to fingre
 *    flytter/zoomer kartet. Et kort hint forklarer dette ved behov.
 *  - Mus: rullehjulet zoomer først etter at kartet er klikket (og slås
 *    av igjen når pekeren forlater kartet).
 *
 * Åpnet direkte (full skjerm) beholdes vanlig kartnavigasjon.
 */
function forsiktigKartNavigasjon() {
  if (window.self === window.top) return;

  // Hjul-zoom: aktiveres ved klikk, deaktiveres når pekeren forlater kartet
  map.scrollWheelZoom.disable();
  map.on('click', () => map.scrollWheelZoom.enable());
  map.getContainer().addEventListener('mouseleave', () => map.scrollWheelZoom.disable());

  if (!('ontouchstart' in window)) return;

  const kartEl = map.getContainer();
  const hint = document.getElementById('kart-hint');
  let hintTimer = null;
  const visHint = () => {
    hint.classList.remove('skjult', 'usynlig');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add('usynlig'), 1200);
  };

  // Én finger skal scrolle SIDEN: slå av kartdraing og la nettleseren
  // håndtere vertikale sveip selv. To fingre gir vanlig kartnavigasjon.
  map.dragging.disable();
  kartEl.style.touchAction = 'pan-y';
  kartEl.addEventListener('touchstart', (e) => {
    if (e.touches.length >= 2) {
      hint.classList.add('usynlig');
      map.dragging.enable();
    }
  }, { passive: true });
  kartEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && !map.dragging.enabled()) visHint();
  }, { passive: true });
  kartEl.addEventListener('touchend', (e) => {
    if (e.touches.length < 2 && map.dragging.enabled()) {
      map.dragging.disable();
      kartEl.style.touchAction = 'pan-y'; // Leaflet kan ha overstyrt den
    }
  }, { passive: true });
}

// --- PoI-er på kartet: liten prikk + ledestrek + klikkbar ikonramme ---

let wptLagV = null;

function ikonPxV(stil) {
  const t = klem((map.getZoom() - 6) / 10, 0, 1);
  return 15 * (0.6 + 3.4 * t * t) * (stil.ikonSkala || 1);
}

function tegnVeipunkterKart(stil) {
  if (wptLagV) wptLagV.remove();
  wptLagV = L.layerGroup().addTo(map);
  const ikon = ikonPxV(stil);
  const skala = ikon / 15;
  const gap = 3 * skala, pad = 4 * skala;

  for (const w of veipunkter) {
    const pkt = L.latLng(w.lat, w.lon);
    L.circleMarker(pkt, {
      radius: 4, color: '#334155', weight: 2, fillColor: '#ffffff', fillOpacity: 1,
    }).addTo(wptLagV).on('click', () => åpnePopup(w));

    if (w.vis_ikon === false) continue;

    // Rammeposisjon: publisert plassering, ellers rett nordøst for punktet
    let ramme;
    if (w.lab_lat != null && w.lab_lon != null) {
      ramme = L.latLng(w.lab_lat, w.lab_lon);
    } else {
      const px = map.latLngToLayerPoint(pkt);
      ramme = map.layerPointToLatLng(L.point(px.x + 0.7 * (26 + ikon), px.y - 0.7 * (26 + ikon)));
    }
    L.polyline([pkt, ramme], { color: '#334155', weight: 1.5, opacity: 0.85 }).addTo(wptLagV);

    const rader = ikonRader(wptTyper(w), WPT_MAKS_PER_RAD_KART);
    const kolonner = Math.max(...rader.map((r) => r.length));
    const fw = kolonner * ikon + (kolonner - 1) * gap + 2 * pad;
    const fh = rader.length * ikon + (rader.length - 1) * gap + 2 * pad;
    let inner = '';
    for (const rad of rader) {
      let celler = '';
      for (const t of rad) {
        celler += '<span class="wpt-ico" style="width:' + ikon.toFixed(1) + 'px;height:' +
          ikon.toFixed(1) + 'px;font-size:' + (ikon * 0.72).toFixed(1) + 'px">' +
          symbolGlyphHtml(t, ikon) + '</span>';
      }
      inner += '<div class="wpt-rad" style="gap:' + gap.toFixed(1) + 'px">' + celler + '</div>';
    }
    const html = '<div class="wpt-frame" style="width:' + fw.toFixed(1) + 'px;height:' +
      fh.toFixed(1) + 'px;gap:' + gap.toFixed(1) + 'px;padding:' + pad.toFixed(1) +
      'px;border-radius:' + (5 * skala).toFixed(1) + 'px">' + inner + '</div>';
    L.marker(ramme, {
      icon: L.divIcon({ className: 'wpt-ikon', html, iconSize: [fw, fh], iconAnchor: [fw / 2, fh / 2] }),
    }).addTo(wptLagV).on('click', () => åpnePopup(w));
  }
}

/** Statistikk for et gitt punkt på løypa (samme tall som i verktøyet). */
function statistikkFor(idx) {
  // Forrige veipunkt = det med høyest idx FØR dette punktet
  let forrige = null;
  for (const w of veipunkter) {
    if (w.idx < idx && (!forrige || w.idx > forrige.idx)) forrige = w;
  }
  const fIdx = forrige ? forrige.idx : 0;
  return {
    dist: avstander[idx],
    distForrige: avstander[idx] - avstander[fIdx],
    høyde: høyder[idx],
    oppStart: Math.round(oppAkk[idx]),
    nedStart: Math.round(nedAkk[idx]),
    oppForrige: Math.round(oppAkk[idx] - oppAkk[fIdx]),
    nedForrige: Math.round(nedAkk[idx] - nedAkk[fIdx]),
    forrigeNavn: forrige ? (lok(forrige, 'name') || forrige.name) : t('start'),
  };
}

/** Navnet på en punkttype i valgt språk (engelsk faller tilbake til norsk). */
function typeNavn(typeKey) {
  const d = WPT_SYMBOLER[typeKey] || WPT_SYMBOLER.annet;
  return (lang === 'en' && d.navn_en) ? d.navn_en : d.navn;
}

function åpnePopup(w) {
  const st = statistikkFor(w.idx);
  const rad = (n, v) => '<tr><td>' + n + '</td><td>' + v + '</td></tr>';
  // Symbolene med tilhørende tekst («Sjekkpunkt», «Varm mat» …)
  const typer = wptTyper(w).map((typ) =>
    '<span class="wpt-popup-type">' + symbolGlyphHtml(typ, 15) + ' ' +
    escHtml(typeNavn(typ)) + '</span>').join('');
  // Valgfri arenakart-lenke. To former:
  //   «arena»          → samme løype: ./<arena>/  (arenaen ligger under denne
  //                       løypas mappe, <event>/<arena>/)
  //   «løype/arena»    → en bestemt løype: ../<løype>/<arena>/  (peker absolutt
  //                       til arenaen uansett hvilken løype punktet vises i —
  //                       viktig for delte punkter gjenbrukt på flere løyper)
  // Slugene valideres til trygge tegn før de settes i href.
  const arenaMål = medSprak(arenaHref(w.arena));
  const arenaLenke = arenaMål
    ? '<p class="wpt-popup-arena"><a href="' + escHtml(arenaMål) +
      '" target="_blank" rel="noopener">' + escHtml(t('seArenakart')) + '</a></p>' : '';
  const wDesc = lok(w, 'desc');
  const html = '<div class="wpt-popup"><h3>' + escHtml(lok(w, 'name') || '') + '</h3>' +
    '<div class="wpt-popup-typer">' + typer + '</div>' +
    (wDesc ? '<p>' + escHtml(wDesc) + '</p>' : '') +
    arenaLenke +
    '<table>' +
    rad(t('distanseFraStart'), kmT(st.dist)) +
    rad(t('fraForrige') + ' (' + escHtml(st.forrigeNavn) + ')', kmT(st.distForrige)) +
    rad(t('hoyde'), Math.round(st.høyde) + ' ' + t('moh')) +
    rad(t('hoydemeterFraStart'), '↑ ' + st.oppStart + ' m · ↓ ' + st.nedStart + ' m') +
    rad(t('fraForrige'), '↑ ' + st.oppForrige + ' m · ↓ ' + st.nedForrige + ' m') +
    '</table></div>';
  L.popup({ maxWidth: 320 }).setLatLng([w.lat, w.lon]).setContent(html).openOn(map);
  settValgtIdx(w.idx);
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Bygg en trygg relativ lenke til et arenakart fra veipunktets arena-felt.
 * «arena» → ./arena/ (samme løype); «løype/arena» → ../løype/arena/ (absolutt
 * til publiseringsroten). Returnerer null for tomt/ugyldig felt.
 */
function arenaHref(felt) {
  const s = String(felt || '');
  const slug = '[a-z0-9][a-z0-9-]*';
  if (new RegExp('^' + slug + '$').test(s)) return './' + s + '/';
  if (new RegExp('^' + slug + '/' + slug + '$').test(s)) return '../' + s + '/';
  return null;
}

/**
 * Legg til ?lang= på en arenalenke slik at arenakartet åpnes i samme språk som
 * denne visningen — men bare når språket er eksplisitt valgt i URL-en. Uten
 * eksplisitt valg lar vi arenaen bruke sitt eget standardspråk. null → null.
 */
function medSprak(href) {
  if (!href) return href;
  const eksplisitt = new URLSearchParams(location.search).get('lang');
  return eksplisitt ? href + '?lang=' + encodeURIComponent(lang) : href;
}

/** Liten språkvelger (NO/EN) i toppen. Klikk laster siden på nytt med ?lang=. */
function byggSpraakvelger() {
  const knapper = document.getElementById('topp-knapper');
  if (!knapper || document.getElementById('sprakvelger')) return;
  const velger = document.createElement('div');
  velger.id = 'sprakvelger';
  velger.className = 'sprakvelger';
  for (const kode of ['no', 'en']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sprakvelger-knapp' + (kode === lang ? ' aktiv' : '');
    b.textContent = kode.toUpperCase();
    b.addEventListener('click', () => {
      if (kode === lang) return;
      const url = new URL(location.href);
      url.searchParams.set('lang', kode);
      location.href = url.href; // last på nytt med nytt språk
    });
    velger.appendChild(b);
  }
  knapper.insertBefore(velger, knapper.firstChild);
}

/** Godta bare http(s)-lenker; alt annet (javascript:, data: …) forkastes. */
function tryggUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (e) { /* ugyldig URL */ }
  return null;
}

// ============================================================
// Markøren (slider + profil + kart, alltid i synk)
// ============================================================

const slider = document.getElementById('slider');

function settValgtIdx(idx) {
  valgtIdx = klem(idx, 0, punkter.length - 1);
  slider.max = punkter.length - 1;
  slider.value = valgtIdx;
  if (posMarkør) posMarkør.setLatLng([punkter[valgtIdx].lat, punkter[valgtIdx].lon]);

  const st = statistikkFor(valgtIdx);
  document.getElementById('i-dist').textContent = kmT(st.dist);
  document.getElementById('i-forrige-navn').textContent = t('fra') + ' ' + st.forrigeNavn;
  document.getElementById('i-dist-forrige').textContent = kmT(st.distForrige);
  document.getElementById('i-hoyde').textContent = Math.round(st.høyde) + ' ' + t('moh');
  document.getElementById('i-hm-start').textContent = '↑ ' + st.oppStart + ' · ↓ ' + st.nedStart + ' m';
  document.getElementById('i-hm-forrige').textContent = '↑ ' + st.oppForrige + ' · ↓ ' + st.nedForrige + ' m';
  document.getElementById('info').classList.remove('skjult');

  tegnProfilV();
}

slider.addEventListener('input', () => settValgtIdx(Number(slider.value)));

// ============================================================
// Høydeprofilen
// ============================================================

let profilGeom = null; // {margVenstre, plotB, ...} — for klikk→indeks

function tegnProfilV() {
  if (!løype) return;
  const pStil = (løype.stil && løype.stil.profil) || {};
  const tekstPx = 11;
  const canvas = profilCanvas;
  // Tilgjengelig bredde = beholderens innhold UTEN padding — clientWidth
  // inkluderer padding, og en canvas som er bredere enn innholdsboksen
  // ville gitt hele siden en horisontal scrollbar.
  const wrap = canvas.parentElement;
  const ws = getComputedStyle(wrap);
  const indre = Math.max(240, wrap.clientWidth -
    (parseFloat(ws.paddingLeft) || 0) - (parseFloat(ws.paddingRight) || 0));
  // Smal skjerm (mobil): tegn profilen i lesbar bredde og la den scrolle
  // horisontalt INNE i stripa si — og dropp punktnavnene, som ellers
  // spiser høyden og uansett blir uleselige så smått.
  const smal = indre < 560;
  const bredde = smal ? Math.max(640, indre) : indre;
  canvas.style.touchAction = bredde > indre ? 'pan-x' : 'none';

  const marg = { venstre: Math.round(tekstPx * 3.4 + 8), høyre: 14, topp: 8, bunn: Math.round(tekstPx * 1.6 + 6) };

  const totalKm = avstander[avstander.length - 1] || 1;
  let minH = Math.min(...høyder), maksH = Math.max(...høyder);
  if (maksH - minH < 1) maksH = minH + 1;

  // Etiketter (kun navn — ikoner i profilen ble for rotete i den
  // publiserte visningen; ikonene finnes på kartet og i popupene).
  // På smale skjermer vises indikatorstrekene uten navn.
  const visWpts = veipunkter.filter((w) => w.vis_ikon !== false);
  const målCtx = canvas.getContext('2d');
  målCtx.font = tekstPx + 'px "Segoe UI", sans-serif';
  const DIAG = Math.SQRT1_2;
  const navnFall = marg.bunn + 4;
  let etikettNed = 0;
  const etiketter = visWpts.map((w) => {
    const navnB = smal ? 0 : 4 + målCtx.measureText(w.name).width;
    etikettNed = Math.max(etikettNed, navnFall + navnB * DIAG);
    return { w, høyre: navnB * DIAG, andel: avstander[w.idx] / totalKm };
  });
  // Dynamisk høyremarg så etiketten lengst til høyre ikke kuttes
  for (let i = 0; i < 3 && etiketter.length; i++) {
    const plotB0 = bredde - marg.venstre - marg.høyre;
    let behov = 14;
    for (const e of etiketter) behov = Math.max(behov, e.høyre - (1 - e.andel) * plotB0 + 4);
    const ny = Math.round(klem(behov, 14, bredde * 0.4));
    if (ny === marg.høyre) break;
    marg.høyre = ny;
  }
  const wptBunn = etiketter.length
    ? Math.min(240, Math.max(0, etikettNed - marg.bunn) + 6) : 0;

  const plotB = bredde - marg.venstre - marg.høyre;
  const yPad = etiketter.length ? (maksH - minH) * 0.08 : 0;
  const minVis = minH - yPad, spennVis = (maksH - minH) + yPad;
  const plotH = klem(bredde * 0.16, 70, 170);
  const høydePx = plotH + marg.topp + marg.bunn + wptBunn;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = bredde * dpr;
  canvas.height = høydePx * dpr;
  canvas.style.width = bredde + 'px';
  canvas.style.height = høydePx + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const xFor = (i) => marg.venstre + (avstander[i] / totalKm) * plotB;
  const yFor = (h) => marg.topp + plotH - ((h - minVis) / spennVis) * plotH;
  profilGeom = { margVenstre: marg.venstre, plotB, totalKm };

  // Bakgrunn
  ctx.fillStyle = pStil.bakgrunn || '#ffffff';
  ctx.fillRect(0, 0, bredde, høydePx);

  // Rutenett + akser + tall
  ctx.font = tekstPx + 'px "Segoe UI", sans-serif';
  ctx.lineWidth = 1;
  const stegKm = fintSteg(totalKm, 8);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let km = 0; km <= totalKm + 1e-9; km += stegKm) {
    const x = marg.venstre + (km / totalKm) * plotB;
    ctx.strokeStyle = pStil.rutenettFarge || '#e2e8f0';
    ctx.beginPath(); ctx.moveTo(x, marg.topp); ctx.lineTo(x, marg.topp + plotH); ctx.stroke();
    ctx.fillStyle = pStil.tallFarge || '#64748b';
    ctx.fillText(km.toLocaleString('nb-NO'), x, marg.topp + plotH + 5);
  }
  ctx.fillText('km', marg.venstre + plotB, marg.topp + plotH + 5);
  const stegM = fintSteg(maksH - minH, 4);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let h = Math.ceil(minH / stegM) * stegM; h <= maksH + 1e-9; h += stegM) {
    const y = yFor(h);
    ctx.strokeStyle = pStil.rutenettFarge || '#e2e8f0';
    ctx.beginPath(); ctx.moveTo(marg.venstre, y); ctx.lineTo(marg.venstre + plotB, y); ctx.stroke();
    ctx.fillStyle = pStil.tallFarge || '#64748b';
    ctx.fillText(Math.round(h) + ' m', marg.venstre - 5, y);
  }
  ctx.strokeStyle = pStil.akseFarge || '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(marg.venstre, marg.topp);
  ctx.lineTo(marg.venstre, marg.topp + plotH);
  ctx.lineTo(marg.venstre + plotB, marg.topp + plotH);
  ctx.stroke();

  // Selve profilen
  const linje = () => {
    ctx.beginPath();
    ctx.moveTo(xFor(0), yFor(høyder[0]));
    for (let i = 1; i < høyder.length; i++) ctx.lineTo(xFor(i), yFor(høyder[i]));
  };
  if (pStil.fyllPå) {
    linje();
    ctx.lineTo(xFor(høyder.length - 1), marg.topp + plotH);
    ctx.lineTo(xFor(0), marg.topp + plotH);
    ctx.closePath();
    ctx.fillStyle = pStil.fyll || '#f4b8b8';
    ctx.fill();
  }
  linje();
  ctx.strokeStyle = pStil.linje || '#0f172a';
  ctx.lineWidth = pStil.fyllPå ? 2 : 1.5;
  ctx.stroke();

  // Veipunkt-indikatorer: strek opp til profilen, navn i 45°
  const aksenY = marg.topp + plotH;
  for (const e of etiketter) {
    const x = xFor(e.w.idx);
    const yP = yFor(høyder[e.w.idx]);
    ctx.strokeStyle = pStil.punktFarge || '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, aksenY); ctx.lineTo(x, yP); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, yP, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();

    if (!smal) {
      ctx.save();
      ctx.translate(x, aksenY + navnFall);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = pStil.tallFarge || '#64748b';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(e.w.name, 4, 0);
      ctx.restore();
    }
  }

  // Markørlinja
  const mx = xFor(valgtIdx);
  ctx.strokeStyle = pStil.markørFarge || '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mx, marg.topp); ctx.lineTo(mx, aksenY); ctx.stroke();
  ctx.fillStyle = pStil.markørFarge || '#2563eb';
  ctx.beginPath(); ctx.arc(mx, yFor(høyder[valgtIdx]), 4, 0, 2 * Math.PI); ctx.fill();
}

// --- Klikk/dra på profilen flytter markøren ---

function byggProfilInteraksjon() {
  let drar = false;
  const tilIdx = (clientX) => {
    const rekt = profilCanvas.getBoundingClientRect();
    const x = clientX - rekt.left;
    const andel = klem((x - profilGeom.margVenstre) / profilGeom.plotB, 0, 1);
    const målKm = andel * profilGeom.totalKm;
    // Binærsøk i den voksende avstandslista
    let lo = 0, hi = avstander.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (avstander[mid] < målKm) lo = mid + 1; else hi = mid;
    }
    return lo;
  };
  profilCanvas.addEventListener('pointerdown', (e) => {
    drar = true;
    profilCanvas.setPointerCapture(e.pointerId);
    settValgtIdx(tilIdx(e.clientX));
  });
  profilCanvas.addEventListener('pointermove', (e) => {
    if (drar) settValgtIdx(tilIdx(e.clientX));
  });
  for (const ev of ['pointerup', 'pointercancel']) {
    profilCanvas.addEventListener(ev, () => { drar = false; });
  }
  window.addEventListener('resize', tegnProfilV);
  // Iframes kan endre størrelse uten at window-resize fyrer (f.eks. når
  // siden rundt endrer layout) — overvåk derfor beholderen direkte.
  let sistBredde = 0;
  new ResizeObserver(() => {
    const b = profilCanvas.parentElement.clientWidth;
    if (Math.abs(b - sistBredde) > 2) { sistBredde = b; tegnProfilV(); map.invalidateSize(); }
  }).observe(profilCanvas.parentElement);
}
