/* ============================================================
   Arenakart-editor (fanen «Arenakart»).

   Et helt separat arbeidsområde: brukeren laster inn et oversiktsbilde,
   tegner områder (polygoner) og punkter, gir dem navn/beskrivelse/type
   (med fargekode), og publiserer arenakartet til en egen nettadresse.

   Bruker Leaflet med CRS.Simple (bildet som «kart»), samme konvensjon som
   den publiserte arena-viewer-en (viewer/arena.js). Gjenbruker api(),
   toast(), ventPåDialog() og lagSlug() fra app.js (lastet før denne fila).
   Alt her er pakket i en IIFE og eksponerer bare window.arenaEditor.
   ============================================================ */
'use strict';

window.arenaEditor = (function () {
  // ---- Tilstand ----
  let arena = tomArena();     // gjeldende arenakart (in-memory)
  let map = null;             // Leaflet-instans (lat-init ved første aktivering)
  let bildeLag = null;        // L.imageOverlay
  let bildeB = 1, bildeH = 1; // kanoniske mål (fra første bilde) — koordinatsystem
  let visBildeId = null;      // hvilket bakgrunnsbilde som vises i editoren
  let punktRenderer = null;   // egen SVG-renderer i høyere pane, så PUNKTER
                              // alltid ligger over OMRÅDER og kan klikkes
  const lagFor = {};          // feature-id -> Leaflet-lag
  let valgtId = null;
  let endret = false;         // ulagrede endringer?

  // Tegnetilstand
  let tegnModus = null;       // null | 'polygon' | 'punkt'
  let tempPunkter = [];       // latlng-liste under polygontegning
  let tempLinje = null, tempPrikker = null;
  let håndtakLag = null;      // dragbare hjørne-/punkt-håndtak for valgt feature

  const NØYTRAL = '#64748b';

  function tomArena() {
    return {
      id: null, navn: '', beskrivelse: null,
      bilder: [], bilde_bredde: null, bilde_høyde: null,
      typer: [], features: [], kontakter: [],
      event_slug: null, arena_slug: null, publiser_bilde_ids: null, oversettelser: null,
    };
  }

  function nyId(prefiks) {
    return prefiks + Math.random().toString(36).slice(2, 8);
  }

  // ============================================================
  // Koordinater: normalisert [x, y] (0–1, y fra topp) <-> CRS.Simple
  // ============================================================

  function tilLatLng(par) {
    return L.latLng(bildeH * (1 - par[1]), bildeB * par[0]);
  }
  function fraLatLng(ll) {
    const klem = (v) => Math.max(0, Math.min(1, v));
    return [klem(ll.lng / bildeB), klem(1 - ll.lat / bildeH)];
  }

  // ============================================================
  // Aktivering (kalles fra byttFane i app.js)
  // ============================================================

  function aktiver() {
    if (!map) initKart();
    settStatus();
    setTimeout(() => map.invalidateSize(), 60);
  }

  function initKart() {
    map = L.map('arena-edit-map', {
      crs: L.CRS.Simple, minZoom: -6, maxZoom: 6,
      zoomSnap: 0.25, attributionControl: false,
    });
    // Eget pane for punkter, med høyere z-indeks enn områdene, så punkter
    // som ligger oppå/inni et område alltid kan klikkes/redigeres.
    map.createPane('arenaPunkter');
    map.getPane('arenaPunkter').style.zIndex = 450;
    punktRenderer = L.svg({ pane: 'arenaPunkter' });
    map.setView([500, 500], 0);
    map.on('click', (e) => {
      if (tegnModus === 'polygon') leggTilHjørne(e.latlng);
      else if (tegnModus === 'punkt') settPunkt(e.latlng);
      else velg(null);
    });
    map.on('dblclick', (e) => {
      if (tegnModus === 'polygon') { L.DomEvent.stop(e); fullførPolygon(); }
    });
    koblKnapper();
  }

  // ============================================================
  // Bakgrunnsbilder (kartlag)
  // ============================================================

  /** Kanoniske mål = første bildets. Alle bilder og elementer deler dette. */
  function settKanonDims() {
    if (arena.bilder.length) {
      bildeB = arena.bilder[0].bredde || 1000;
      bildeH = arena.bilder[0].høyde || 1000;
    }
  }

  /** Vis ett bakgrunnsbilde i editoren (fra serveren). imgId null = tom flate.
   *  `tilpass` = true zoomer/sentrerer til bildet (bare når nødvendig). */
  function visBakgrunn(imgId, tilpass) {
    if (bildeLag) { bildeLag.remove(); bildeLag = null; }
    const bilde = arena.bilder.find((b) => b.id === imgId) || arena.bilder[0] || null;
    const tom = document.getElementById('arena-map-empty');
    if (!bilde) { visBildeId = null; tom.classList.remove('hidden'); oppdaterBakgrunnsvelger(); return; }
    visBildeId = bilde.id;
    const bounds = [[0, 0], [bildeH, bildeB]]; // alltid kanoniske mål
    bildeLag = L.imageOverlay('/api/arenas/' + arena.id + '/images/' + bilde.id, bounds).addTo(map);
    bildeLag.bringToBack();
    map.setMaxBounds(L.latLngBounds(bounds).pad(0.5));
    if (tilpass) map.fitBounds(bounds);
    tom.classList.add('hidden');
    oppdaterBakgrunnsvelger();
  }

  /** Fyll bakgrunnsvelgeren i verktøylinja med arenaens bilder. */
  function oppdaterBakgrunnsvelger() {
    const velger = document.getElementById('arena-bg-select');
    const wrap = document.getElementById('arena-bg-wrap');
    wrap.classList.toggle('hidden', arena.bilder.length < 2);
    velger.innerHTML = '';
    for (const b of arena.bilder) {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.navn;
      if (b.id === visBildeId) o.selected = true;
      velger.appendChild(o);
    }
  }

  /** Last inn dimensjonene til en bildefil i nettleseren (serveren har ingen bildelib). */
  function lesDim(fil) {
    const url = URL.createObjectURL(fil);
    return new Promise((resolve, reject) => {
      const bilde = new Image();
      bilde.onload = () => { URL.revokeObjectURL(url); resolve({ b: bilde.naturalWidth, h: bilde.naturalHeight }); };
      bilde.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Kunne ikke lese bildet')); };
      bilde.src = url;
    });
  }

  /** Legg til et bakgrunnsbilde (spør om et forklarende navn). */
  async function leggTilBilde(fil) {
    let dim;
    try { dim = await lesDim(fil); }
    catch (feil) { toast(feil.message, 'error'); return; }
    const forslag = fil.name.replace(/\.[^.]+$/, '');
    const svar = prompt('Navn på bakgrunnsbildet (f.eks. «Norgeskart», «Satellitt»):', forslag);
    if (svar === null) return; // avbrutt
    const navn = svar.trim() || forslag;
    try {
      if (!arena.id) await opprettPåServer();
      const skjema = new FormData();
      skjema.append('file', fil);
      skjema.append('navn', navn);
      skjema.append('bredde', String(dim.b));
      skjema.append('høyde', String(dim.h));
      const res = await api('/api/arenas/' + arena.id + '/images', { method: 'POST', body: skjema });
      const oppdatert = await res.json();
      const førsteGang = arena.bilder.length === 0;
      arena.bilder = oppdatert.bilder;
      arena.bilde_bredde = oppdatert.bilde_bredde;
      arena.bilde_høyde = oppdatert.bilde_høyde;
      settKanonDims();
      // Første bilde: sett koordinatsystemet og tegn elementene på nytt
      if (førsteGang) { visBakgrunn(arena.bilder[0].id, true); tegnAlle(); }
      else { visBakgrunn(arena.bilder[arena.bilder.length - 1].id, false); }
      toast('Bakgrunnsbildet «' + navn + '» er lagt til');
      settStatus();
    } catch (feil) {
      toast('Kunne ikke lagre bildet: ' + feil.message, 'error');
    }
  }

  // ============================================================
  // Tegning
  // ============================================================

  function harBilde() { return arena.bilder.length > 0; }

  function startTegning(modus) {
    if (!harBilde()) { toast('Last inn et bilde først', 'error'); return; }
    avbrytTegning();
    velg(null);
    tegnModus = modus;
    map.doubleClickZoom.disable();
    L.DomUtil.addClass(map.getContainer(), 'arena-tegner');
    document.getElementById('arena-draw-finish').classList.toggle('hidden', modus !== 'polygon');
    document.getElementById('arena-draw-cancel').classList.remove('hidden');
    visHint(modus === 'polygon'
      ? 'Klikk for å legge hjørner. Dobbeltklikk eller «Fullfør» for å lukke området.'
      : 'Klikk der punktet skal være.');
  }

  function avbrytTegning() {
    tegnModus = null;
    tempPunkter = [];
    if (tempLinje) { tempLinje.remove(); tempLinje = null; }
    if (tempPrikker) { tempPrikker.remove(); tempPrikker = null; }
    if (map) {
      map.doubleClickZoom.enable();
      L.DomUtil.removeClass(map.getContainer(), 'arena-tegner');
    }
    document.getElementById('arena-draw-finish').classList.add('hidden');
    document.getElementById('arena-draw-cancel').classList.add('hidden');
    skjulHint();
  }

  function leggTilHjørne(latlng) {
    tempPunkter.push(latlng);
    if (!tempLinje) {
      tempLinje = L.polyline([], { color: '#2563eb', weight: 2, dashArray: '5,5' }).addTo(map);
      tempPrikker = L.layerGroup().addTo(map);
    }
    tempLinje.setLatLngs(tempPunkter);
    L.circleMarker(latlng, { radius: 4, color: '#2563eb', fillColor: '#fff', fillOpacity: 1 })
      .addTo(tempPrikker);
  }

  async function fullførPolygon() {
    if (tempPunkter.length < 3) {
      toast('Et område må ha minst tre hjørner', 'error');
      return;
    }
    const geometri = tempPunkter.map(fraLatLng);
    avbrytTegning();
    await nyFeature('polygon', geometri);
  }

  async function settPunkt(latlng) {
    const geometri = [fraLatLng(latlng)];
    avbrytTegning();
    await nyFeature('punkt', geometri);
  }

  async function nyFeature(form, geometri) {
    const feature = {
      id: nyId('f'), navn: '', beskrivelse: null,
      type_id: arena.typer.length ? arena.typer[0].id : null,
      form, geometri, kontakt_ids: [], bilde_ids: null, arena: null,
    };
    const svar = await visFeatureDialog(feature, true);
    if (!svar) return; // avbrutt → forkast
    Object.assign(feature, svar);
    arena.features.push(feature);
    tegnFeature(feature);
    byggListe();
    merkEndret();
    velg(feature.id, false);
  }

  // ============================================================
  // Tegn features på kartet
  // ============================================================

  function fargeForFeature(f) {
    const t = arena.typer.find((t) => t.id === f.type_id);
    return (t && t.farge) || NØYTRAL;
  }

  /** Leaflet-stil for et område (polygon), med per-område fyll/kontur:
   *  fyll=false → helt gjennomsiktig fyll; kontur=false → ingen linje;
   *  kontur_farge=null → samme farge som området (uten gjennomsiktighet).
   *  Fyllet holdes «på» (fillOpacity 0) også når det er gjennomsiktig, så
   *  området fortsatt kan klikkes. */
  function polygonStil(f, farge) {
    const visKontur = f.kontur !== false;
    const visFyll = f.fyll !== false;
    return {
      stroke: visKontur,
      color: (visKontur && f.kontur_farge) ? f.kontur_farge : farge,
      weight: 2,
      fill: true,
      fillColor: farge,
      fillOpacity: visFyll ? 0.35 : 0,
    };
  }

  function tegnAlle() {
    for (const id of Object.keys(lagFor)) { lagFor[id].remove(); delete lagFor[id]; }
    for (const f of arena.features) tegnFeature(f);
  }

  function tegnFeature(f) {
    if (lagFor[f.id]) lagFor[f.id].remove();
    const farge = fargeForFeature(f);
    let lag;
    if (f.form === 'polygon' && f.geometri.length >= 3) {
      lag = L.polygon(f.geometri.map(tilLatLng), polygonStil(f, farge));
    } else if (f.geometri.length >= 1) {
      lag = L.circleMarker(tilLatLng(f.geometri[0]), {
        radius: 8, color: '#fff', weight: 2, fillColor: farge, fillOpacity: 1,
        renderer: punktRenderer, // punkter i eget, høyere pane (klikkbare)
      });
    } else return;
    lag.addTo(map);
    lag.bindTooltip(f.navn || '(uten navn)', { direction: 'top', sticky: f.form === 'polygon' });
    lag.on('click', (e) => {
      L.DomEvent.stop(e);
      if (tegnModus === 'polygon') leggTilHjørne(e.latlng);
      else if (tegnModus === 'punkt') settPunkt(e.latlng);
      else redigerFeature(f.id);
    });
    lagFor[f.id] = lag;
  }

  // ============================================================
  // Utvalg + dragbare håndtak
  // ============================================================

  function velg(id, panTil) {
    if (håndtakLag) { håndtakLag.remove(); håndtakLag = null; }
    // Nullstill forrige listemarkering
    document.querySelectorAll('.arena-feature-el.framhevet')
      .forEach((el) => el.classList.remove('framhevet'));
    valgtId = id;
    if (!id) return;
    const lag = lagFor[id];
    const el = document.querySelector('.arena-feature-el[data-id="' + id + '"]');
    if (el) { el.classList.add('framhevet'); el.scrollIntoView({ block: 'nearest' }); }
    if (lag && panTil) {
      if (lag.getBounds) map.flyToBounds(lag.getBounds().pad(1.2), { maxZoom: 3, duration: 0.3 });
      else if (lag.getLatLng) map.panTo(lag.getLatLng(), { duration: 0.3 });
    }
    visHåndtak(id);
  }

  function visHåndtak(id) {
    const f = arena.features.find((f) => f.id === id);
    if (!f) return;
    håndtakLag = L.layerGroup().addTo(map);
    f.geometri.forEach((par, i) => {
      const håndtak = L.marker(tilLatLng(par), {
        draggable: true,
        icon: L.divIcon({ className: 'arena-handle', iconSize: [14, 14] }),
      }).addTo(håndtakLag);
      håndtak.on('drag', (e) => {
        f.geometri[i] = fraLatLng(e.latlng);
        tegnFeature(f);
      });
      håndtak.on('dragend', () => { merkEndret(); });
    });
  }

  // ============================================================
  // Feature-dialog (navn / beskrivelse / type)
  // ============================================================

  async function visFeatureDialog(feature, erNy) {
    const dialog = document.getElementById('arena-feature-dialog');
    document.getElementById('arena-feature-title').textContent =
      (erNy ? 'Nytt ' : 'Rediger ') + (feature.form === 'polygon' ? 'område' : 'punkt');
    document.getElementById('arena-feature-navn').value = feature.navn || '';
    document.getElementById('arena-feature-beskr').value = feature.beskrivelse || '';
    const fEn = (feature.oversettelser && feature.oversettelser.en) || {};
    document.getElementById('arena-feature-navn-en').value = fEn.navn || '';
    document.getElementById('arena-feature-beskr-en').value = fEn.beskrivelse || '';
    document.getElementById('arena-feature-delete').classList.toggle('hidden', erNy);
    fyllTypeVelger(document.getElementById('arena-feature-type'), feature.type_id);
    document.getElementById('arena-feature-arena').value = feature.arena || '';

    // Områdestil (fyll/kontur) — bare relevant for polygoner.
    const erPolygon = feature.form === 'polygon';
    document.getElementById('arena-feature-omraade').classList.toggle('hidden', !erPolygon);
    if (erPolygon) {
      const fyllBoks = document.getElementById('arena-feature-fyll');
      const konturBoks = document.getElementById('arena-feature-kontur');
      const egenBoks = document.getElementById('arena-feature-kontur-egen');
      const fargeFelt = document.getElementById('arena-feature-kontur-farge');
      fyllBoks.checked = feature.fyll !== false;
      konturBoks.checked = feature.kontur !== false;
      egenBoks.checked = !!feature.kontur_farge;
      // Fargevelgeren viser enten egen konturfarge eller områdefargen (referanse).
      fargeFelt.value = feature.kontur_farge || fargeForFeature(feature);
      const oppdaterFargeFelt = () => {
        fargeFelt.disabled = !(konturBoks.checked && egenBoks.checked);
      };
      egenBoks.onchange = konturBoks.onchange = oppdaterFargeFelt;
      oppdaterFargeFelt();
    }
    byggBildeKryss(feature.bilde_ids);
    byggKontaktKryss(feature.kontakt_ids || []);

    const løfte = ventPåDialog(dialog);
    document.getElementById('arena-feature-navn').select();
    const handling = await løfte;
    if (handling === 'delete') return { _slett: true };
    if (handling !== 'ok') return null;
    const kontakt_ids = [...document.querySelectorAll(
      '#arena-feature-kontakter input:checked')].map((b) => b.value);
    // Bilde-synlighet: alle avkrysset → null (=alle, også nye bilder);
    // ingen → []; noen → lista. Bare relevant når det er ≥2 bilder.
    let bilde_ids = feature.bilde_ids || null;
    if (arena.bilder.length >= 2) {
      const valgte = [...document.querySelectorAll('#arena-feature-bilder input:checked')].map((b) => b.value);
      bilde_ids = (valgte.length === arena.bilder.length) ? null : valgte;
    }
    const svar = {
      navn: document.getElementById('arena-feature-navn').value.trim() || 'Uten navn',
      beskrivelse: document.getElementById('arena-feature-beskr').value.trim() || null,
      type_id: document.getElementById('arena-feature-type').value || null,
      kontakt_ids,
      bilde_ids,
      arena: document.getElementById('arena-feature-arena').value.trim().toLowerCase()
        .replace(/\s+/g, '') || null,
      oversettelser: byggOversettelser({
        navn: document.getElementById('arena-feature-navn-en').value,
        beskrivelse: document.getElementById('arena-feature-beskr-en').value,
      }),
    };
    // Områdestil lagres bare for polygoner (punkter bruker ikke fyll/kontur).
    if (feature.form === 'polygon') {
      const konturPa = document.getElementById('arena-feature-kontur').checked;
      const egen = document.getElementById('arena-feature-kontur-egen').checked;
      svar.fyll = document.getElementById('arena-feature-fyll').checked;
      svar.kontur = konturPa;
      svar.kontur_farge = (konturPa && egen)
        ? document.getElementById('arena-feature-kontur-farge').value : null;
    }
    return svar;
  }

  /** Bygg avkryssingslista for hvilke bakgrunnsbilder stedet vises på. */
  function byggBildeKryss(bildeIds) {
    const rad = document.getElementById('arena-feature-bilder-rad');
    const boks = document.getElementById('arena-feature-bilder');
    boks.innerHTML = '';
    rad.classList.toggle('hidden', arena.bilder.length < 2);
    if (arena.bilder.length < 2) return;
    // null = alle → alle avkrysset
    const valgt = (bildeIds === null || bildeIds === undefined)
      ? new Set(arena.bilder.map((b) => b.id)) : new Set(bildeIds);
    for (const b of arena.bilder) {
      const l = document.createElement('label');
      l.className = 'arena-kontakt-kryss-rad';
      const c = document.createElement('input');
      c.type = 'checkbox'; c.value = b.id; c.checked = valgt.has(b.id);
      const s = document.createElement('span'); s.textContent = b.navn;
      l.appendChild(c); l.appendChild(s);
      boks.appendChild(l);
    }
  }

  /** Bygg avkryssingslista med arenaens kontakter i feature-dialogen. */
  function byggKontaktKryss(valgteIds) {
    const boks = document.getElementById('arena-feature-kontakter');
    const tom = document.getElementById('arena-feature-kontakter-tom');
    boks.querySelectorAll('.arena-kontakt-kryss-rad').forEach((el) => el.remove());
    tom.classList.toggle('hidden', arena.kontakter.length > 0);
    const valgt = new Set(valgteIds);
    for (const k of arena.kontakter) {
      const rad = document.createElement('label');
      rad.className = 'arena-kontakt-kryss-rad';
      const boks2 = document.createElement('input');
      boks2.type = 'checkbox'; boks2.value = k.id; boks2.checked = valgt.has(k.id);
      const tekst = document.createElement('span');
      tekst.textContent = k.tittel + (k.navn ? ' — ' + k.navn : '');
      rad.appendChild(boks2); rad.appendChild(tekst);
      boks.appendChild(rad);
    }
  }

  async function redigerFeature(id) {
    const f = arena.features.find((f) => f.id === id);
    if (!f) return;
    velg(id, false);
    const svar = await visFeatureDialog(f, false);
    if (!svar) return;
    if (svar._slett) {
      if (lagFor[id]) { lagFor[id].remove(); delete lagFor[id]; }
      arena.features = arena.features.filter((x) => x.id !== id);
      velg(null);
      byggListe();
      merkEndret();
      toast('Stedet er slettet');
      return;
    }
    Object.assign(f, svar);
    tegnFeature(f);
    byggListe();
    merkEndret();
  }

  function fyllTypeVelger(select, valgtTypeId) {
    select.innerHTML = '';
    const ingen = document.createElement('option');
    ingen.value = ''; ingen.textContent = '(ingen type)';
    select.appendChild(ingen);
    for (const t of arena.typer) {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.navn;
      if (t.id === valgtTypeId) o.selected = true;
      select.appendChild(o);
    }
  }

  // ============================================================
  // Listen over steder
  // ============================================================

  function byggListe() {
    const liste = document.getElementById('arena-feature-liste');
    const tom = document.getElementById('arena-feature-tom');
    liste.innerHTML = '';
    tom.classList.toggle('hidden', arena.features.length > 0);
    for (const f of arena.features) {
      const li = document.createElement('li');
      li.className = 'arena-feature-el';
      li.dataset.id = f.id;
      li.style.setProperty('--farge', fargeForFeature(f));
      const navn = document.createElement('span');
      navn.className = 'arena-feature-navn';
      navn.textContent = f.navn || '(uten navn)';
      const rediger = document.createElement('button');
      rediger.type = 'button';
      rediger.className = 'arena-feature-rediger';
      rediger.title = 'Rediger';
      rediger.textContent = '✎';
      rediger.addEventListener('click', (e) => { e.stopPropagation(); redigerFeature(f.id); });
      li.appendChild(navn);
      li.appendChild(rediger);
      li.addEventListener('click', () => velg(f.id, true));
      li.addEventListener('mouseenter', () => framhevKart(f.id, true));
      li.addEventListener('mouseleave', () => framhevKart(f.id, false));
      liste.appendChild(li);
    }
  }

  function framhevKart(id, på) {
    const lag = lagFor[id];
    if (lag && lag.setStyle) {
      lag.setStyle(på ? { weight: 4 } : { weight: 2 });
    }
  }

  // ============================================================
  // Typer (kategorier med farge)
  // ============================================================

  async function åpneTyper() {
    tegnTypeliste();
    const dialog = document.getElementById('arena-types-dialog');
    await ventPåDialog(dialog);
    // Endringer er allerede lagt inn i arena.typer underveis
    tegnAlle();
    byggListe();
  }

  function tegnTypeliste() {
    const boks = document.getElementById('arena-types-list');
    boks.innerHTML = '';
    if (!arena.typer.length) {
      boks.innerHTML = '<p class="muted">Ingen typer ennå.</p>';
    }
    for (const t of arena.typer) {
      const rad = document.createElement('div');
      rad.className = 'arena-type-rad';
      const farge = document.createElement('input');
      farge.type = 'color'; farge.value = t.farge;
      farge.addEventListener('input', () => { t.farge = farge.value; merkEndret(); });
      const navn = document.createElement('input');
      navn.type = 'text'; navn.value = t.navn; navn.className = 'arena-type-navn';
      navn.title = 'Navn (norsk)';
      navn.addEventListener('input', () => { t.navn = navn.value; merkEndret(); });
      const navnEn = document.createElement('input');
      navnEn.type = 'text'; navnEn.className = 'arena-type-navn';
      navnEn.placeholder = 'engelsk'; navnEn.title = 'Navn (engelsk)';
      navnEn.value = (t.oversettelser && t.oversettelser.en && t.oversettelser.en.navn) || '';
      navnEn.addEventListener('input', () => { settEnFelt(t, 'navn', navnEn.value); merkEndret(); });
      const slett = document.createElement('button');
      slett.type = 'button'; slett.className = 'btn btn-small btn-danger-subtle';
      slett.textContent = 'Slett';
      slett.addEventListener('click', () => {
        arena.typer = arena.typer.filter((x) => x.id !== t.id);
        for (const f of arena.features) if (f.type_id === t.id) f.type_id = null;
        merkEndret();
        tegnTypeliste();
      });
      rad.appendChild(farge); rad.appendChild(navn); rad.appendChild(navnEn); rad.appendChild(slett);
      boks.appendChild(rad);
    }
  }

  function leggTilType() {
    const navnFelt = document.getElementById('arena-type-new-navn');
    const fargeFelt = document.getElementById('arena-type-new-farge');
    const navn = navnFelt.value.trim();
    if (!navn) { toast('Gi typen et navn', 'error'); return; }
    arena.typer.push({ id: nyId('t'), navn, farge: fargeFelt.value });
    navnFelt.value = '';
    merkEndret();
    tegnTypeliste();
  }

  // ============================================================
  // Kontakter
  // ============================================================

  async function åpneKontakter() {
    tegnKontaktliste();
    const dialog = document.getElementById('arena-kontakter-dialog');
    // «+ Ny kontakt» åpner enkeltkontakt-dialogen og kommer tilbake hit
    let handling;
    do {
      handling = await ventPåDialog(dialog);
      if (handling === 'ny') {
        await redigerKontakt(null);
        tegnKontaktliste();
      }
    } while (handling === 'ny');
  }

  function tegnKontaktliste() {
    const boks = document.getElementById('arena-kontakter-list');
    boks.innerHTML = '';
    if (!arena.kontakter.length) {
      boks.innerHTML = '<p class="muted">Ingen kontakter ennå.</p>';
      return;
    }
    for (const k of arena.kontakter) {
      const rad = document.createElement('div');
      rad.className = 'arena-kontakt-rad';
      const info = document.createElement('div');
      info.className = 'arena-kontakt-info';
      info.innerHTML = '<strong></strong><span class="muted"></span>';
      info.querySelector('strong').textContent = k.tittel;
      info.querySelector('.muted').textContent =
        [k.navn, k.telefon, k.epost].filter(Boolean).join(' · ');
      const rediger = document.createElement('button');
      rediger.type = 'button'; rediger.className = 'btn btn-small';
      rediger.textContent = 'Endre';
      rediger.addEventListener('click', async () => { await redigerKontakt(k.id); tegnKontaktliste(); });
      const slett = document.createElement('button');
      slett.type = 'button'; slett.className = 'btn btn-small btn-danger-subtle';
      slett.textContent = 'Slett';
      slett.addEventListener('click', () => {
        arena.kontakter = arena.kontakter.filter((x) => x.id !== k.id);
        for (const f of arena.features) {
          f.kontakt_ids = (f.kontakt_ids || []).filter((id) => id !== k.id);
        }
        merkEndret();
        tegnKontaktliste();
      });
      rad.appendChild(info); rad.appendChild(rediger); rad.appendChild(slett);
      boks.appendChild(rad);
    }
  }

  /** Opprett (id=null) eller rediger en kontakt via enkeltkontakt-dialogen. */
  async function redigerKontakt(id) {
    const k = id ? arena.kontakter.find((x) => x.id === id) : null;
    const g = (felt) => document.getElementById('arena-kontakt-' + felt);
    document.getElementById('arena-kontakt-title').textContent =
      k ? 'Rediger kontakt' : 'Ny kontakt';
    g('tittel').value = (k && k.tittel) || '';
    g('navn').value = (k && k.navn) || '';
    g('telefon').value = (k && k.telefon) || '';
    g('epost').value = (k && k.epost) || '';
    g('beskr').value = (k && k.beskrivelse) || '';
    g('fra').value = (k && k.gyldig_fra) || '';
    g('til').value = (k && k.gyldig_til) || '';
    const kEn = (k && k.oversettelser && k.oversettelser.en) || {};
    g('tittel-en').value = kEn.tittel || '';
    g('beskr-en').value = kEn.beskrivelse || '';

    const dialog = document.getElementById('arena-kontakt-dialog');
    const løfte = ventPåDialog(dialog);
    g('tittel').select();
    const handling = await løfte;
    if (handling !== 'ok') return;
    const tittel = g('tittel').value.trim();
    if (!tittel) { toast('Kontakten må ha en tittel', 'error'); return; }
    const verdier = {
      tittel,
      navn: g('navn').value.trim() || null,
      telefon: g('telefon').value.trim() || null,
      epost: g('epost').value.trim() || null,
      beskrivelse: g('beskr').value.trim() || null,
      gyldig_fra: g('fra').value || null,
      gyldig_til: g('til').value || null,
      oversettelser: byggOversettelser({
        tittel: g('tittel-en').value,
        beskrivelse: g('beskr-en').value,
      }),
    };
    if (k) {
      Object.assign(k, verdier);
    } else {
      arena.kontakter.push(Object.assign({ id: nyId('k') }, verdier));
    }
    merkEndret();
  }

  // ============================================================
  // Lagring / åpning
  // ============================================================

  function lagrePayload() {
    return {
      navn: (document.getElementById('arena-name').value.trim()) || arena.navn || 'Arenakart',
      beskrivelse: arena.beskrivelse,
      bilder: arena.bilder,
      typer: arena.typer,
      features: arena.features,
      kontakter: arena.kontakter,
      event_slug: arena.event_slug,
      arena_slug: arena.arena_slug,
      publiser_bilde_ids: arena.publiser_bilde_ids,
      oversettelser: arena.oversettelser,
    };
  }

  async function opprettPåServer() {
    const res = await api('/api/arenas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lagrePayload()),
    });
    const ny = await res.json();
    arena.id = ny.id;
  }

  async function lagre(stille) {
    arena.navn = document.getElementById('arena-name').value.trim() || arena.navn;
    try {
      if (!arena.id) {
        await opprettPåServer();
      } else {
        await api('/api/arenas/' + arena.id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lagrePayload()),
        });
      }
      endret = false;
      settStatus();
      // Oppdater arenakart-biblioteket i venstre stolpe (nytt kart / endret
      // antall steder / marker det aktive kartet).
      if (window.oppdaterArenabibliotek) window.oppdaterArenabibliotek();
      if (!stille) toast('Arenakartet er lagret');
      return true;
    } catch (feil) {
      toast('Kunne ikke lagre: ' + feil.message, 'error');
      return false;
    }
  }

  function nyttArena() {
    if (endret && !confirm('Du har ulagrede endringer. Vil du forkaste dem?')) return;
    avbrytTegning();
    for (const id of Object.keys(lagFor)) { lagFor[id].remove(); delete lagFor[id]; }
    if (bildeLag) { bildeLag.remove(); bildeLag = null; }
    arena = tomArena();
    valgtId = null; endret = false; visBildeId = null; bildeB = 1; bildeH = 1;
    document.getElementById('arena-name').value = '';
    document.getElementById('arena-map-empty').classList.remove('hidden');
    oppdaterBakgrunnsvelger();
    byggListe();
    settStatus();
    if (window.oppdaterArenabibliotek) window.oppdaterArenabibliotek();
  }

  /** Sett navn/beskrivelse på det åpne arenakartet (etter «Endre» i biblioteket). */
  function settNavn(navn, beskrivelse) {
    arena.navn = navn;
    if (beskrivelse !== undefined) arena.beskrivelse = beskrivelse;
    document.getElementById('arena-name').value = navn || '';
    settStatus();
  }

  /** Id-en til det åpne arenakartet (null hvis ulagret/tomt). */
  function aktivId() { return arena.id; }

  async function åpne(id) {
    if (endret && !confirm('Du har ulagrede endringer. Vil du forkaste dem?')) return;
    try {
      const res = await api('/api/arenas/' + id);
      const data = await res.json();
      avbrytTegning();
      for (const fid of Object.keys(lagFor)) { lagFor[fid].remove(); delete lagFor[fid]; }
      if (bildeLag) { bildeLag.remove(); bildeLag = null; }
      arena = {
        id: data.id, navn: data.navn, beskrivelse: data.beskrivelse,
        bilder: data.bilder || [], bilde_bredde: data.bilde_bredde, bilde_høyde: data.bilde_høyde,
        typer: data.typer || [], features: data.features || [], kontakter: data.kontakter || [],
        event_slug: data.event_slug, arena_slug: data.arena_slug,
        publiser_bilde_ids: data.publiser_bilde_ids,
        oversettelser: data.oversettelser || null,
      };
      valgtId = null; endret = false; visBildeId = null;
      document.getElementById('arena-name').value = arena.navn || '';
      settKanonDims();
      if (arena.bilder.length) {
        visBakgrunn(arena.bilder[0].id, true);
        tegnAlle();
      } else {
        oppdaterBakgrunnsvelger();
        document.getElementById('arena-map-empty').classList.remove('hidden');
      }
      byggListe();
      settStatus();
      // Marker det aktive kartet i venstre stolpe
      if (window.oppdaterArenabibliotek) window.oppdaterArenabibliotek();
      toast('Arenakartet «' + (arena.navn || '') + '» er åpnet');
    } catch (feil) {
      toast('Kunne ikke åpne: ' + feil.message, 'error');
    }
  }

  // ============================================================
  // Publisering
  // ============================================================

  async function åpnePubliser() {
    if (!harBilde()) { toast('Last inn et bilde før du publiserer', 'error'); return; }
    // Lagre først, så det publiserte alltid stemmer med det du ser
    if (!(await lagre(true))) return;

    const dialog = document.getElementById('arena-publish-dialog');
    const målVelger = document.getElementById('arena-publish-target');
    const eventFelt = document.getElementById('arena-publish-event');
    const arenaFelt = document.getElementById('arena-publish-arena');
    const tittelFelt = document.getElementById('arena-publish-title');
    const beskrFelt = document.getElementById('arena-publish-desc');
    const resultat = document.getElementById('arena-publish-result');
    resultat.classList.add('hidden');

    try {
      const res = await api('/api/publish/targets');
      const data = await res.json();
      målVelger.innerHTML = '';
      for (const t of data.targets) {
        const o = document.createElement('option');
        o.value = t.navn;
        o.textContent = t.navn + (t.baseUrl ? ' (' + t.baseUrl + ')' : '');
        målVelger.appendChild(o);
      }
    } catch (feil) {
      toast('Kunne ikke hente publiseringsmål: ' + feil.message, 'error');
      return;
    }

    eventFelt.value = arena.event_slug || '';
    arenaFelt.value = arena.arena_slug || lagSlug(arena.navn || '');
    tittelFelt.value = arena.navn || '';
    beskrFelt.value = arena.beskrivelse || '';
    const aEn = (arena.oversettelser && arena.oversettelser.en) || {};
    document.getElementById('arena-publish-title-en').value = aEn.navn || '';
    document.getElementById('arena-publish-desc-en').value = aEn.beskrivelse || '';
    document.getElementById('arena-publish-sprak').value = arena.standard_sprak || 'no';
    byggPubliserBilder();
    oppdaterSlughint();
    eventFelt.oninput = arenaFelt.oninput = målVelger.onchange = oppdaterSlughint;

    const handling = await ventPåDialog(dialog);
    if (handling !== 'ok') return;

    const event_slug = lagSlug(eventFelt.value.trim());
    const arena_slug = lagSlug(arenaFelt.value.trim());
    if (!event_slug || !arena_slug) { toast('Fyll inn både løype- og arena-navn', 'error'); return; }

    // Valgte bakgrunnsbilder: alle avkrysset → null (=alle); ellers lista.
    // Med færre enn to bilder vises ingen avkryssing — da publiseres alle (null).
    // (Uten dette ble bilde_ids en tom liste = INGEN bilder for enkeltbilde-
    // arenaer, så bakgrunnsbildet forsvant ved publisering.)
    const alle = arena.bilder.map((b) => b.id);
    const valgte = [...document.querySelectorAll('#arena-publish-bilder input:checked')].map((b) => b.value);
    const bilde_ids = (arena.bilder.length < 2 || valgte.length === alle.length) ? null : valgte;
    const standard_sprak = document.getElementById('arena-publish-sprak').value;
    const oversettelser = byggOversettelser({
      navn: document.getElementById('arena-publish-title-en').value,
      beskrivelse: document.getElementById('arena-publish-desc-en').value,
    });

    try {
      const res = await api('/api/arenas/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arena_id: arena.id, target: målVelger.value,
          event_slug, arena_slug,
          navn: tittelFelt.value.trim() || arena.navn || arena_slug,
          beskrivelse: beskrFelt.value.trim() || null,
          bilde_ids, standard_sprak, oversettelser,
        }),
      });
      const svar = await res.json();
      arena.publiser_bilde_ids = bilde_ids;
      arena.standard_sprak = standard_sprak; // husk til neste publisering (samme økt)
      arena.oversettelser = oversettelser;
      // Husk tittel/beskrivelse/slugs i minnet også, så en ny publisering i
      // samme økt (uten å åpne på nytt) foreslår de samme verdiene. Serveren
      // har allerede lagret dem, så gjenåpning senere foreslår dem også.
      arena.event_slug = event_slug; arena.arena_slug = arena_slug;
      arena.navn = tittelFelt.value.trim() || arena.navn;
      arena.beskrivelse = beskrFelt.value.trim() || null;
      document.getElementById('arena-name').value = arena.navn;
      const lenke = document.getElementById('arena-publish-url');
      lenke.href = svar.url; lenke.textContent = svar.url;
      document.getElementById('arena-publish-embed').value = svar.iframe;
      resultat.classList.remove('hidden');
      dialog.showModal(); // vis resultatet i samme dialog
      toast(svar.advarsel || 'Arenakartet er publisert', svar.advarsel ? 'error' : 'success');
    } catch (feil) {
      toast('Publisering feilet: ' + feil.message, 'error');
    }
  }

  /** Bygg avkryssingslista for hvilke bakgrunnsbilder som skal publiseres. */
  function byggPubliserBilder() {
    const rad = document.getElementById('arena-publish-bilder-rad');
    const boks = document.getElementById('arena-publish-bilder');
    boks.innerHTML = '';
    rad.classList.toggle('hidden', arena.bilder.length < 2);
    if (arena.bilder.length < 2) return;
    // Forhåndsvalg: sist publiserte utvalg, ellers alle
    const valgt = arena.publiser_bilde_ids === null || arena.publiser_bilde_ids === undefined
      ? new Set(arena.bilder.map((b) => b.id))
      : new Set(arena.publiser_bilde_ids);
    for (const b of arena.bilder) {
      const l = document.createElement('label');
      l.className = 'arena-kontakt-kryss-rad';
      const c = document.createElement('input');
      c.type = 'checkbox'; c.value = b.id; c.checked = valgt.has(b.id);
      const s = document.createElement('span'); s.textContent = b.navn;
      l.appendChild(c); l.appendChild(s);
      boks.appendChild(l);
    }
  }

  // ============================================================
  // Bakgrunnsbilder — håndteringsdialog
  // ============================================================

  async function åpneBilder() {
    tegnBildeliste();
    await ventPåDialog(document.getElementById('arena-bilder-dialog'));
    // Navneendringer ligger allerede i arena.bilder; oppdater velgeren
    oppdaterBakgrunnsvelger();
  }

  function tegnBildeliste() {
    const boks = document.getElementById('arena-bilder-list');
    boks.innerHTML = '';
    if (!arena.bilder.length) {
      boks.innerHTML = '<p class="muted">Ingen bakgrunnsbilder ennå.</p>';
      return;
    }
    arena.bilder.forEach((b, i) => {
      const rad = document.createElement('div');
      rad.className = 'arena-bilde-rad';
      const navn = document.createElement('input');
      navn.type = 'text'; navn.value = b.navn; navn.className = 'arena-type-navn';
      navn.title = 'Navn (norsk)';
      navn.addEventListener('input', () => { b.navn = navn.value; merkEndret(); });
      const navnEn = document.createElement('input');
      navnEn.type = 'text'; navnEn.className = 'arena-type-navn';
      navnEn.placeholder = 'engelsk'; navnEn.title = 'Navn (engelsk)';
      navnEn.value = (b.oversettelser && b.oversettelser.en && b.oversettelser.en.navn) || '';
      navnEn.addEventListener('input', () => { settEnFelt(b, 'navn', navnEn.value); merkEndret(); });
      const vis = document.createElement('button');
      vis.type = 'button'; vis.className = 'btn btn-small';
      vis.textContent = i === 0 ? 'Vis (referanse)' : 'Vis';
      vis.title = i === 0 ? 'Første bilde definerer målestokken' : 'Vis dette bildet i editoren';
      vis.addEventListener('click', () => visBakgrunn(b.id, false));
      const slett = document.createElement('button');
      slett.type = 'button'; slett.className = 'btn btn-small btn-danger-subtle';
      slett.textContent = 'Slett';
      slett.addEventListener('click', () => slettBilde(b.id));
      rad.appendChild(navn); rad.appendChild(navnEn); rad.appendChild(vis); rad.appendChild(slett);
      boks.appendChild(rad);
    });
  }

  async function slettBilde(imgId) {
    const bilde = arena.bilder.find((b) => b.id === imgId);
    if (!bilde) return;
    if (!confirm('Slette bakgrunnsbildet «' + bilde.navn + '»?')) return;
    try {
      const res = await api('/api/arenas/' + arena.id + '/images/' + imgId, { method: 'DELETE' });
      const oppdatert = await res.json();
      arena.bilder = oppdatert.bilder;
      arena.bilde_bredde = oppdatert.bilde_bredde;
      arena.bilde_høyde = oppdatert.bilde_høyde;
      // Rydd bort referanser lokalt også (serveren har gjort det på disk)
      for (const f of arena.features) {
        if (f.bilde_ids) f.bilde_ids = f.bilde_ids.filter((id) => id !== imgId);
      }
      settKanonDims();
      if (visBildeId === imgId) visBakgrunn(arena.bilder[0] ? arena.bilder[0].id : null, true);
      else oppdaterBakgrunnsvelger();
      tegnBildeliste();
      settStatus();
      toast('Bildet er slettet');
    } catch (feil) {
      toast('Kunne ikke slette: ' + feil.message, 'error');
    }
  }

  function oppdaterSlughint() {
    const hint = document.getElementById('arena-publish-slughint');
    const målVelger = document.getElementById('arena-publish-target');
    const valgt = målVelger.selectedOptions[0];
    const base = (valgt && valgt.textContent.match(/\(([^)]+)\)/)) ?
      valgt.textContent.match(/\(([^)]+)\)/)[1] : '';
    const e = lagSlug(document.getElementById('arena-publish-event').value.trim());
    const a = lagSlug(document.getElementById('arena-publish-arena').value.trim());
    hint.textContent = (e && a)
      ? 'Adresse: ' + (base ? base.replace(/\/$/, '') : '…') + '/' + e + '/' + a + '/'
      : '';
  }

  // ============================================================
  // Status + hint + knapper
  // ============================================================

  function merkEndret() { endret = true; settStatus(); }

  function settStatus() {
    // Speil hva som er åpent i toppbannerets aktiv-indikator (kalles etter
    // åpne/nytt/lagre/navneendring).
    if (window.oppdaterAktivIndikator) window.oppdaterAktivIndikator();
    const el = document.getElementById('arena-status');
    if (!arena.id && !arena.features.length && !harBilde()) { el.textContent = 'Nytt arenakart'; return; }
    el.textContent = (endret ? '● Ulagrede endringer' : 'Lagret') +
      ' · ' + arena.features.length + ' steder';
  }

  /** Navnet på det åpne arenakartet (til aktiv-indikatoren) — null hvis tomt. */
  function aktivNavn() {
    const harInnhold = arena.id || arena.features.length || harBilde();
    return harInnhold ? (arena.navn || 'Uten navn') : null;
  }

  function visHint(tekst) {
    const el = document.getElementById('arena-draw-hint');
    el.textContent = tekst;
    el.classList.remove('hidden');
  }
  function skjulHint() { document.getElementById('arena-draw-hint').classList.add('hidden'); }

  function koblKnapper() {
    const på = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    på('arena-new', nyttArena);
    på('arena-draw-polygon', () => startTegning('polygon'));
    på('arena-draw-point', () => startTegning('punkt'));
    på('arena-draw-finish', fullførPolygon);
    på('arena-draw-cancel', avbrytTegning);
    på('arena-types', åpneTyper);
    på('arena-type-add', leggTilType);
    på('arena-kontakter-btn', åpneKontakter);
    på('arena-bilder-btn', åpneBilder);
    på('arena-save', () => lagre(false));
    på('arena-publish', åpnePubliser);
    document.getElementById('arena-name').addEventListener('input', merkEndret);
    document.getElementById('arena-bg-select').addEventListener('change', (e) => {
      visBakgrunn(e.target.value, false);
    });
    const bildeInn = (e) => {
      const fil = e.target.files[0];
      if (fil) leggTilBilde(fil).then(() => {
        // Oppdater manager-lista hvis den er åpen
        if (document.getElementById('arena-bilder-dialog').open) tegnBildeliste();
      });
      e.target.value = ''; // tillat å velge samme fil igjen
    };
    document.getElementById('arena-image-input').addEventListener('change', bildeInn);
    document.getElementById('arena-bilder-add').addEventListener('change', bildeInn);
    document.getElementById('arena-publish-copy').addEventListener('click', () => {
      const felt = document.getElementById('arena-publish-embed');
      felt.select();
      navigator.clipboard.writeText(felt.value).then(
        () => toast('Snutten er kopiert'),
        () => toast('Kunne ikke kopiere', 'error'));
    });
    // Advar ved lukking med ulagrede endringer
    window.addEventListener('beforeunload', (e) => {
      if (endret) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  return { aktiver, aktivNavn, aktivId, åpne, nyttArena, settNavn };
})();
