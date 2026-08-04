/* ============================================================
   3D fly-by — simulert gjennomkjøring av løypa.

   Viser løypa i 3D-terreng med et kamera som flyter bak en markør
   som beveger seg gjennom løypa, omtrent som en drone som følger en
   løper. Samme modul brukes BÅDE av verktøyet (frontend/app.js) og av
   den publiserte løypevisningen (viewer/viewer.js) — kalleren sender
   inn ferdig beregnede data, så ingen beregningslogikk dupliseres.

   Bruk:
     KULFlyby.åpne({ punkter, avstander, oppAkk, nedAkk, veipunkter,
                     stil, navn, lang, lok });

   Kartmotor: MapLibre GL JS (ligger i vendor/ ved siden av denne fila
   og lastes FØRST når brukeren faktisk åpner en fly-by — biblioteket er
   på ~800 kB, og den vanlige 2D-visningen skal være like lett som før).

   Terrengformen kommer fra åpne, globale høydefliser (Terrarium /
   AWS Open Data), mens selve bildet som legges oppå er de samme
   kartlagene som ellers i KUL: Esri-satellitt (standard) eller
   Kartverkets topografiske kart. Høydene i løypa selv (profil,
   høydemeter) er fortsatt Kartverkets tall — terrengflisene brukes bare
   til å forme landskapet rundt løypa.

   KAMERAET styres helt av oss, ikke av MapLibres egne draghåndterere.
   Grunnen: vi flytter kameraet hvert bilde for å følge løperen, og da
   ville MapLibres egen zoom-/rotasjonsanimasjon blitt avbrutt hele
   tiden (zoom virket bare når avspillingen sto i pause). I stedet har
   vi vår egen kameratilstand — zoom, pitch og en kursforskyvning
   brukeren kan dra på — som glir mykt mot måltallene sine hvert bilde.
   Da virker zoom og kameravinkel likt enten det spilles av eller ikke.

   Endrer du noe her: husk at endringen først når de publiserte
   løypevisningene når viewer-assets publiseres på nytt
   (ASSET_VERSJON i backend/publisering.py).
   ============================================================ */
'use strict';

var KULFlyby = (function () {

  // Hvor maplibre-filene ligger. I verktøyet ligger de i vendor/ ved
  // siden av flyby.js; i en publisert løype ligger alt sammen i
  // assets/v<N>/. Sida si egen script-tagg sier fra med data-maplibre
  // (relativt til sida), ellers antar vi samme mappe som denne fila.
  // Leses ved innlasting, mens document.currentScript ennå peker på oss
  // (den er null senere, inne i funksjonskall).
  var BASE = (function () {
    var s = document.currentScript;
    if (s) {
      var oppgitt = s.getAttribute('data-maplibre');
      if (oppgitt) return new URL(oppgitt, document.baseURI).href;
    }
    if (!s || !s.src) return '';
    return s.src.slice(0, s.src.lastIndexOf('/') + 1);
  })();

  // ============================================================
  // Tekster (norsk + engelsk, samme mønster som viewer.js)
  // ============================================================
  // Modulen har sine EGNE tekster i stedet for å kreve nye nøkler hos
  // kallerne — da virker den uendret i verktøyet (norsk) og i de
  // publiserte visningene (no/en) uten at begge må vedlikeholde lista.
  var TEKST = {
    no: {
      spill: 'Spill av', pause: 'Pause', omstart: 'Start på nytt', lukk: 'Lukk',
      fart: 'Fart', kart: 'Kart', satellitt: 'Satellitt',
      distanse: 'Distanse', hoyde: 'Høyde', stigning: 'Høydemeter',
      neste: 'Neste', mal: 'Mål',
      laster: 'Laster 3D-terreng …', klargjor: 'Henter landskapet rundt løypa …',
      feilLast: 'Kunne ikke laste 3D-visningen.',
      feilWebgl: 'Nettleseren din støtter ikke 3D-kart (WebGL).',
      moh: 'moh.',
      hjelp: 'Klikk på kartet for pause · dra for å svinge kameraet · rull for å zoome · Esc = lukk',
      stopp: 'Stopp ved punkter',
      stoppTittel: 'Ta en runde rundt hvert interessepunkt underveis',
      sikt: 'Hold løperen synlig',
      siktTittel: 'Hev kameraet når terrenget kommer mellom det og løperen',
      seArenakart: '🏟️ Se arenakart',
      distanseFraStart: 'Distanse fra start', fraForrige: 'Fra forrige punkt',
      hoydemeterFraStart: 'Høydemeter fra start', start: 'start',
      lukkKort: 'Lukk', klikkForMer: 'Klikk for detaljer',
    },
    en: {
      spill: 'Play', pause: 'Pause', omstart: 'Restart', lukk: 'Close',
      fart: 'Speed', kart: 'Map', satellitt: 'Satellite',
      distanse: 'Distance', hoyde: 'Elevation', stigning: 'Ascent/descent',
      neste: 'Next', mal: 'Finish',
      laster: 'Loading 3D terrain …', klargjor: 'Fetching the landscape around the course …',
      feilLast: 'Could not load the 3D view.',
      feilWebgl: 'Your browser does not support 3D maps (WebGL).',
      moh: 'm a.s.l.',
      hjelp: 'Click the map to pause · drag to turn the camera · scroll to zoom · Esc = close',
      stopp: 'Stop at points',
      stoppTittel: 'Circle each point of interest along the way',
      sikt: 'Keep runner visible',
      siktTittel: 'Raise the camera when terrain comes between it and the runner',
      seArenakart: '🏟️ View arena map',
      distanseFraStart: 'Distance from start', fraForrige: 'From previous point',
      hoydemeterFraStart: 'Ascent/descent from start', start: 'start',
      lukkKort: 'Close', klikkForMer: 'Click for details',
    },
  };

  // ============================================================
  // Innstillinger for «drone»-følelsen
  // ============================================================
  var SEK_PER_KM = 8.0;      // avspillingstid ved 1× fart
  var MIN_VARIGHET = 90;     // korte løyper skal ikke suse forbi
  var MAKS_VARIGHET = 300;   // lange løyper skal ikke bli en evighet
  var START_ZOOM = 15.0;
  var MIN_ZOOM = 11, MAKS_ZOOM = 18;
  var START_PITCH = 68;
  var MIN_PITCH = 15, MAKS_PITCH = 80;
  var OVERDRIVELSE = 1.3;    // terrengoverdrivelse — gir tydeligere relieff

  // Kursutjevning. Sikkevinduet er bevisst LANGT: kursen beregnes som
  // gjennomsnittsretningen fram til ~350 m foran løperen, ikke retningen
  // mellom to nabopunkter. Da forsvinner sikk-sakk og hårnålssvinger ut
  // av kameraet, og man slipper å bli sjøsyk.
  var SIKT_FRAM_KM = 0.35;
  var SIKT_BAK_KM = 0.05;
  var SIKT_PRØVER = 10;      // antall retningsprøver som midles
  // DØDSONE er kjernen i kamerastyringen: så lenge løypa foran ligger
  // innenfor så mange grader fra der kameraet allerede peker, står
  // kameraet HELT stille. Det er slik en dronefører filmer — man holder
  // bildet i ro og korrigerer bare når motivet er på vei ut av utsnittet,
  // i stedet for å følge hver eneste sving løperen tar.
  var DØDSONE = 24;          // grader slingringsmonn før kameraet gjør noe
  var KURS_TAU = 1.3;        // hvor mykt korreksjonen skjer (sekunder)
  var MAKS_SVING = 18;       // maks grader kameraet svinger per sekund

  var KAMERA_TAU = 0.28;     // hvor kjapt zoom/pitch/dra-vinkel glir på plass
  var ORBIT_SEK = 11.0;      // full runde rundt et punkt ved 1× fart
  var ORBIT_VENT_MS = 2500;  // maks venting på fliser før runden settes i gang
  var ORBIT_PITCH = 55;      // kameraet senkes til dette under runden
  var MAKS_LINJEPUNKTER = 2500;
  var FARTER = [0.5, 1, 2, 4, 8];
  var STANDARD_FART = 0.5;   // rolig som standard — man skal rekke å se seg om
  var FLISFRIST_MS = 12000;  // gir opp ventingen på fliser etter dette

  // Kameraet skal aldri havne under bakken, og kan i tillegg heves når
  // terreng står mellom det og løperen. Begge deler løses ved å SENKE
  // kameravinkelen midlertidig (lavere pitch = kameraet løftes opp og
  // bakover), og legge brukerens egen vinkel tilbake når det er trygt.
  var KLARING_M = 25;        // meter kameraet minst skal ha over bakken
  var KLARING_SJEKK_MS = 120; // hvor ofte vi sjekker (per bilde blir for dyrt)
  var KLARING_STEG = 7;      // grader vinkelen senkes per sjekk ved behov
  var KLARING_TILBAKE = 3.5; // grader vinkelen legges tilbake per sjekk
  var KLARING_MAKS = 45;     // hvor mye vinkelen maks kan senkes
  var SIKT_PRØVER_TERRENG = 8; // punkter langs sikta kamera → løper

  // Løypa foran løperen tegnes i en tydelig rød, så den ikke forveksles
  // med veier og store stier i satellittbildet. Den tilbakelagte delen
  // beholder løypas egen farge fra publiseringen.
  var FORAN_FARGE = '#ef4444';

  // Farge under kartflisene. Når kameraet svinger fort rundt et punkt,
  // rekker ikke alltid nye fliser å komme inn — da er det denne som vises
  // i stedet for at himmelen lyser gjennom bakken som blå «hull».
  var BUNNFARGE = { satellitt: '#43503f', topo: '#e8e4dc' };

  // Terrengfliser: åpne globale høydedata (Terrarium-koding).
  var TERRENG_URL =
    'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
  var TOPO_URL =
    'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
  var SATELLITT_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  var instans = null;        // gjeldende åpne fly-by (bare én om gangen)
  var maplibreLastet = null; // Promise, slik at vi bare laster biblioteket én gang

  // ============================================================
  // Små hjelpere
  // ============================================================

  var RAD = Math.PI / 180;

  function begrens(v, min, maks) { return Math.max(min, Math.min(maks, v)); }

  /** Kompasskurs (grader) fra a til b. */
  function kurs(a, b) {
    var φ1 = a.lat * RAD, φ2 = b.lat * RAD, Δλ = (b.lon - a.lon) * RAD;
    var y = Math.sin(Δλ) * Math.cos(φ2);
    var x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }

  /** Korteste vinkelforskjell (grader) fra a til b, i [-180, 180]. */
  function vinkelDiff(a, b) { return ((b - a + 540) % 360) - 180; }

  function lastSkript(url) {
    return new Promise(function (ok, feil) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = ok;
      s.onerror = function () { feil(new Error('Kunne ikke laste ' + url)); };
      document.head.appendChild(s);
    });
  }

  function lastStil(url) {
    if (document.querySelector('link[href="' + url + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    document.head.appendChild(l);
  }

  /** Last MapLibre ved behov (én gang per side). */
  function sikreMaplibre() {
    if (window.maplibregl) return Promise.resolve();
    if (!maplibreLastet) {
      lastStil(BASE + 'maplibre-gl.css');
      maplibreLastet = lastSkript(BASE + 'maplibre-gl.js');
    }
    return maplibreLastet;
  }

  /** Har nettleseren WebGL? (3D-kart krever det.) */
  function harWebgl() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  /**
   * Kan en fly-by kjøres for disse punktene? Kallerne bruker denne til å
   * skjule/deaktivere knappen. Krever et spor med litt lengde og WebGL.
   */
  function tilgjengelig(punkter) {
    return !!(punkter && punkter.length >= 4 && harWebgl());
  }

  /** Har kameraet flyttet seg nok til at det er verdt å tegne på nytt? */
  function endret(a, b) {
    return Math.abs(a.lon - b.lon) > 1e-7 || Math.abs(a.lat - b.lat) > 1e-7 ||
      Math.abs(a.bearing - b.bearing) > 0.01 || Math.abs(a.zoom - b.zoom) > 0.001 ||
      Math.abs(a.pitch - b.pitch) > 0.01;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ============================================================
  // Åpne fly-by
  // ============================================================

  /**
   * @param {object} o
   *   punkter    [{lat, lon, ele}]  — sporet (høyde valgfri)
   *   avstander  kumulativ km per punkt
   *   oppAkk/nedAkk  akkumulerte høydemeter per punkt (valgfri)
   *   veipunkter [{idx, lat, lon, name, desc, types}] (valgfri)
   *   stil       {rutefarge, tykkelse} (valgfri)
   *   navn       løypenavn til topplinja (valgfri)
   *   lang       'no' | 'en' (standard 'no')
   *   lok        funksjon (obj, felt) for oversatt innhold (valgfri)
   */
  function åpne(o) {
    if (instans) return;                 // én om gangen
    var punkter = o.punkter || [];
    if (punkter.length < 2) return;

    var lang = TEKST[o.lang] ? o.lang : 'no';
    var t = function (n) { return TEKST[lang][n] || TEKST.no[n]; };
    var lok = o.lok || function (obj, felt) { return obj ? obj[felt] : undefined; };
    // Kalleren avgjør om (og hvordan) et punkt kan lenke til et arenakart
    o.arenaUrl = o.arenaUrl || function () { return null; };

    var ui = byggOverlegg(o, t);
    instans = { ui: ui, ødelagt: false };

    if (!harWebgl()) {
      ui.laster.textContent = t('feilWebgl');
      return;
    }

    sikreMaplibre()
      .then(function () {
        if (instans && !instans.ødelagt) start(o, ui, t, lok, lang);
      })
      .catch(function (feil) {
        ui.laster.textContent = t('feilLast') + ' (' + feil.message + ')';
      });
  }

  // ============================================================
  // Overlegget (DOM)
  // ============================================================

  function byggOverlegg(o, t) {
    var rot = document.createElement('div');
    rot.id = 'kul-flyby';
    rot.className = 'kul-flyby';

    rot.innerHTML =
      '<div class="fb-topp">' +
        '<div class="fb-tittel"><span class="fb-merke">3D</span>' +
          '<span class="fb-navn"></span></div>' +
        '<div class="fb-topp-hoyre">' +
          '<label class="fb-bryter" title="' + escHtml(t('stoppTittel')) + '">' +
            '<input type="checkbox" class="fb-stopp" checked>' +
            '<span>' + escHtml(t('stopp')) + '</span></label>' +
          '<label class="fb-bryter" title="' + escHtml(t('siktTittel')) + '">' +
            '<input type="checkbox" class="fb-sikt" checked>' +
            '<span>' + escHtml(t('sikt')) + '</span></label>' +
          '<button type="button" class="fb-knapp fb-lag"></button>' +
          '<button type="button" class="fb-knapp fb-lukk" aria-label="' +
            escHtml(t('lukk')) + '" title="' + escHtml(t('lukk')) + '">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="fb-scene">' +
        '<div class="fb-kart"></div>' +
        '<div class="fb-laster"></div>' +
        '<div class="fb-toast"></div>' +
        '<div class="fb-kort fb-skjult"></div>' +
        '<div class="fb-avlesning">' +
          '<div class="fb-celle"><span class="fb-navn2">' + escHtml(t('distanse')) +
            '</span><span class="fb-verdi fb-dist">–</span></div>' +
          '<div class="fb-celle"><span class="fb-navn2">' + escHtml(t('hoyde')) +
            '</span><span class="fb-verdi fb-hoyde">–</span></div>' +
          '<div class="fb-celle"><span class="fb-navn2">' + escHtml(t('stigning')) +
            '</span><span class="fb-verdi fb-hm">–</span></div>' +
          '<div class="fb-celle fb-celle-neste"><span class="fb-navn2">' + escHtml(t('neste')) +
            '</span><span class="fb-verdi fb-neste">–</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="fb-bunn">' +
        '<button type="button" class="fb-knapp fb-spill" disabled></button>' +
        '<button type="button" class="fb-knapp fb-omstart" title="' +
          escHtml(t('omstart')) + '">↺</button>' +
        '<input type="range" class="fb-scrubber" min="0" max="1000" value="0" ' +
          'aria-label="' + escHtml(t('distanse')) + '">' +
        '<div class="fb-farter"></div>' +
      '</div>' +
      '<div class="fb-hjelp">' + escHtml(t('hjelp')) + '</div>';

    rot.querySelector('.fb-navn').textContent = o.navn ? String(o.navn) : '';
    document.body.appendChild(rot);
    document.body.classList.add('kul-flyby-aapen');

    var ui = {
      rot: rot,
      kart: rot.querySelector('.fb-kart'),
      laster: rot.querySelector('.fb-laster'),
      toast: rot.querySelector('.fb-toast'),
      kort: rot.querySelector('.fb-kort'),
      dist: rot.querySelector('.fb-dist'),
      hoyde: rot.querySelector('.fb-hoyde'),
      hm: rot.querySelector('.fb-hm'),
      neste: rot.querySelector('.fb-neste'),
      spill: rot.querySelector('.fb-spill'),
      omstart: rot.querySelector('.fb-omstart'),
      scrubber: rot.querySelector('.fb-scrubber'),
      farter: rot.querySelector('.fb-farter'),
      lag: rot.querySelector('.fb-lag'),
      lukk: rot.querySelector('.fb-lukk'),
      stopp: rot.querySelector('.fb-stopp'),
      sikt: rot.querySelector('.fb-sikt'),
    };
    ui.laster.textContent = t('laster');
    ui.lag.textContent = t('kart');      // satellitt er standard → tilbyr «Kart»
    ui.spill.textContent = t('spill');
    return ui;
  }

  // ============================================================
  // Selve fly-byen
  // ============================================================

  function start(o, ui, t, lok, lang) {
    var punkter = o.punkter;
    var n = punkter.length;
    var avstander = (o.avstander && o.avstander.length === n)
      ? o.avstander : kumulativAvstand(punkter);
    var totalKm = avstander[n - 1] || 0.001;
    var oppAkk = (o.oppAkk && o.oppAkk.length === n) ? o.oppAkk : null;
    var nedAkk = (o.nedAkk && o.nedAkk.length === n) ? o.nedAkk : null;
    var stil = o.stil || {};
    var arenaUrl = o.arenaUrl;
    var rutefarge = stil.rutefarge || '#dc2626';
    var lokale = lang === 'en' ? 'en-GB' : 'nb-NO';
    var veipunkter = (o.veipunkter || [])
      .filter(function (w) { return w && w.idx != null; })
      .map(function (w) {
        return Object.assign({}, w, { idx: begrens(w.idx, 0, n - 1) });
      })
      .sort(function (a, b) { return a.idx - b.idx; });

    var høyder = (typeof høyderMedInterpolering === 'function')
      ? høyderMedInterpolering(punkter) : null;

    // Rutelinja tegnes forenklet — 2500 punkter er mer enn nok visuelt,
    // og holder oppdateringen av «tilbakelagt»-linja billig på lange løyper.
    var visIdx = [];
    if (n <= MAKS_LINJEPUNKTER) {
      for (var i = 0; i < n; i++) visIdx.push(i);
    } else {
      var sett = {};
      for (var k = 0; k < MAKS_LINJEPUNKTER; k++) {
        sett[Math.round(k * (n - 1) / (MAKS_LINJEPUNKTER - 1))] = 1;
      }
      visIdx = Object.keys(sett).map(Number).sort(function (a, b) { return a - b; });
    }
    var visKoord = visIdx.map(function (i) { return [punkter[i].lon, punkter[i].lat]; });

    var varighet = begrens(totalKm * SEK_PER_KM, MIN_VARIGHET, MAKS_VARIGHET);

    // ---- Tilstand ----
    var s = 0;                 // tilbakelagt distanse (km)
    var spiller = false;
    var klar = false;          // er fliser lastet og avspilling tillatt?
    var fart = STANDARD_FART;
    var pekIdx = 0;            // vandrende indekspeker (unngår søk per frame)
    var kursNå = null;         // tidsutjevnet kurs langs løypa
    var sistVisIdx = -1;
    var nesteWpt = 0;
    var rafId = null;
    var sistTid = 0;
    var satellitt = true;      // satellitt er standard (som hos Strava m.fl.)
    var brukerHarStyrt = false;
    var orbit = null;          // {wpt, tid, varighet} når vi går runden rundt et punkt
    var kortWpt = null;        // veipunktet som vises i detaljkortet
    var kortFortsett = false;  // skal avspillingen gjenopptas når kortet lukkes?

    // Kameraet vårt: faktiske verdier glir mot «mål»-verdiene hvert bilde.
    var kam = {
      zoom: START_ZOOM, zoomMål: START_ZOOM,
      pitch: START_PITCH, pitchMål: START_PITCH,
      dreie: 0, dreieMål: 0,   // brukerens egen dreining rundt løperen (grader)
      orbitVinkel: 0,          // automatisk runde rundt et punkt
      // Midlertidig senking av vinkelen når kameraet ellers ville havnet
      // under bakken eller fått en kolle mellom seg og løperen. Legges
      // tilbake av seg selv når terrenget tillater det igjen.
      korr: 0, korrMål: 0,
    };
    var sistKlaring = 0;       // når vi sist sjekket terrenget

    // ---- Kartet ----
    var map = new maplibregl.Map({
      container: ui.kart,
      antialias: true,
      maxPitch: MAKS_PITCH,
      attributionControl: { compact: true },
      // Romslig flis-cache: under en runde rundt et punkt kommer vi tilbake
      // til de samme retningene, og da skal flisene fortsatt ligge klare.
      maxTileCacheSize: 600,
      fadeDuration: 0,
      // Vi styrer kameraet selv hvert bilde — MapLibres egne håndterere
      // ville hele tiden blitt avbrutt av det (og zoom virket da bare i
      // pause). De slås av her og erstattes av våre egne lenger nede.
      interactive: false,
      style: {
        version: 8,
        sources: {
          terreng: {
            type: 'raster-dem', tiles: [TERRENG_URL], tileSize: 256,
            encoding: 'terrarium', maxzoom: 14,
            attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" ' +
              'target="_blank" rel="noopener">Terrain Tiles</a> (AWS Open Data)',
          },
          topo: {
            type: 'raster', tiles: [TOPO_URL], tileSize: 256, maxzoom: 18,
            attribution: '© <a href="https://www.kartverket.no/" ' +
              'target="_blank" rel="noopener">Kartverket</a>',
          },
          satellitt: {
            type: 'raster', tiles: [SATELLITT_URL], tileSize: 256, maxzoom: 18,
            attribution: '© Esri, Maxar, Earthstar Geographics',
          },
          rute: { type: 'geojson', data: tomLinje() },
          gjort: { type: 'geojson', data: tomLinje() },
        },
        layers: [
          // Bunnfarge under flisene: fyller bakken der fliser ennå ikke er
          // lastet, så man ser en dempet terrengfarge i stedet for at
          // himmelen lyser gjennom som blå hull.
          { id: 'bunn', type: 'background',
            paint: { 'background-color': BUNNFARGE.satellitt } },
          // `raster-fade-duration: 0` gjør at nye fliser dukker opp med en
          // gang i stedet for å tone inn — under et fade ville bunnfargen
          // skint gjennom den halvgjennomsiktige flisa.
          { id: 'satellitt', type: 'raster', source: 'satellitt',
            layout: { visibility: 'visible' },
            paint: { 'raster-fade-duration': 0 } },
          { id: 'topo', type: 'raster', source: 'topo',
            layout: { visibility: 'none' },
            paint: { 'raster-fade-duration': 0 } },
          // Hele løypa, dempet: viser hvor turen går videre
          { id: 'rute', type: 'line', source: 'rute',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': FORAN_FARGE, 'line-opacity': 0.85,
              'line-width': (stil.tykkelse || 4) + 1,
            } },
          // Tilbakelagt del, i løypas egen farge
          { id: 'gjort', type: 'line', source: 'gjort',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': rutefarge, 'line-width': (stil.tykkelse || 4) + 2.5,
            } },
        ],
        // Ingen tekstlag → ingen glyph-tjeneste nødvendig. Veipunktnavn
        // vises som vanlige HTML-markører i stedet.
      },
      center: [punkter[0].lon, punkter[0].lat],
      zoom: START_ZOOM,
      pitch: START_PITCH,
      bearing: 0,
    });

    function tomLinje() {
      return {
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      };
    }

    // Kameraet peker mot midten av lerretet. Ved å legge på padding i
    // toppen havner «løperen» i nedre tredjedel, med landskapet foran —
    // samme bildeutsnitt som droneopptak av løp.
    function settPadding() {
      var h = ui.kart.clientHeight || 400;
      map.setPadding({ top: Math.round(h * 0.42), bottom: 0, left: 0, right: 0 });
    }

    // ---- Markører (HTML — følger terrenget, og slipper glyph-tjeneste) ----
    var løperEl = document.createElement('div');
    løperEl.className = 'fb-loper';
    løperEl.innerHTML = '<span class="fb-loper-glod" style="background:' + rutefarge +
      '"></span><span class="fb-loper-prikk" style="background:' + rutefarge + '"></span>';
    var løperMark = new maplibregl.Marker({
      element: løperEl, pitchAlignment: 'map', subpixelPositioning: true,
    }).setLngLat([punkter[0].lon, punkter[0].lat]);

    var wptMarkører = [];

    map.on('error', function (e) {
      // Enkeltfliser som ikke lastes skal ikke velte visningen; logg stille.
      if (window.console && console.debug) console.debug('flyby:', e && e.error);
    });

    map.on('load', function () {
      if (instans && instans.ødelagt) return;

      map.setTerrain({ source: 'terreng', exaggeration: OVERDRIVELSE });
      map.getSource('rute').setData({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: visKoord },
      });
      løperMark.addTo(map);
      byggVeipunktMarkører();
      settPadding();
      tegn(true);          // ett enkelt oppslag som setter i gang flislastingen

      // Vent til landskapet faktisk er lastet før dronen setter av gårde —
      // ellers starter turen midt i et halvferdig terreng med hull i.
      // NB: animasjonsløkka må IKKE gå ennå. Den flytter kameraet hvert
      // bilde, og da regner MapLibre kartet som «i bevegelse» og sender
      // aldri «idle» — vi ville endt med å vente til fristen hver gang.
      ui.laster.textContent = t('klargjor');
      ventPåFliser(function () {
        if (!instans || instans.ødelagt) return;
        klar = true;
        ui.laster.classList.add('fb-skjult');
        ui.spill.disabled = false;
        if (!brukerHarStyrt) settSpiller(true);
        sistTid = performance.now();
        rafId = requestAnimationFrame(løkke);
      });
    });

    /**
     * Kall `ferdig` når kartet har fått lastet det det trenger.
     * MapLibre sier fra med «idle» når alle fliser er inne og ingenting
     * animeres. Vi legger på en liten ekstra pust (terrenget tegnes om
     * når høydeflisene kommer), og en frist så vi aldri blir hengende
     * om nettet er tregt eller borte.
     */
    function ventPåFliser(ferdig) {
      var gjort = false;
      var fullfør = function () {
        if (gjort) return;
        gjort = true;
        clearTimeout(frist);
        ferdig();
      };
      var frist = setTimeout(fullfør, FLISFRIST_MS);
      map.once('idle', function () { setTimeout(fullfør, 350); });
    }

    // ============================================================
    // Posisjon langs løypa
    // ============================================================

    /** Punktindeksen rett før distansen `km`. Vandrer normalt bare framover. */
    function indeksVed(km) {
      if (km < avstander[pekIdx]) {
        // Spolt bakover: finn plassen med binærsøk i stedet for å gå tilbake
        var lo = 0, hi = n - 1;
        while (lo < hi) {
          var mid = (lo + hi) >> 1;
          if (avstander[mid] < km) lo = mid + 1; else hi = mid;
        }
        pekIdx = Math.max(0, lo - 1);
      }
      while (pekIdx < n - 2 && avstander[pekIdx + 1] <= km) pekIdx++;
      return pekIdx;
    }

    /** Interpolert posisjon (lat/lon/idx/andel) ved distansen `km`. */
    function posVed(km) {
      km = begrens(km, 0, totalKm);
      var i = indeksVed(km);
      var a = punkter[i], b = punkter[Math.min(i + 1, n - 1)];
      var d0 = avstander[i], d1 = avstander[Math.min(i + 1, n - 1)];
      var f = d1 > d0 ? (km - d0) / (d1 - d0) : 0;
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
        idx: i, f: f,
      };
    }

    /**
     * Retningen løypa går i ved `km` — midlet over et LANGT stykke framover.
     *
     * I stedet for retningen mellom to nabopunkter (som spretter fram og
     * tilbake i hver sving) legger vi sammen retningsvektorene til flere
     * punkter utover mot ~350 m foran løperen. Sikk-sakk og hårnåler
     * kansellerer da hverandre, og igjen står den retningen løypa
     * «egentlig» går. Vektorsummering håndterer også overgangen 359°→0°
     * riktig, som et snitt av gradtall ikke ville gjort.
     */
    function råKurs(km) {
      var peker = pekIdx;     // oppslagene under flytter den vandrende pekeren
      var fra = posVed(Math.max(0, km - SIKT_BAK_KM));
      var x = 0, y = 0;
      for (var j = 1; j <= SIKT_PRØVER; j++) {
        var mål = km + (SIKT_FRAM_KM * j) / SIKT_PRØVER;
        if (mål > totalKm) mål = totalKm;
        var p = posVed(mål);
        if (p.lat === fra.lat && p.lon === fra.lon) continue;
        // Punkter lenger framme veier litt mindre: nærmeste retning
        // bestemmer mest, de fjerne demper bare svingene.
        var vekt = 1 - 0.5 * (j / SIKT_PRØVER);
        var k = kurs(fra, p) * RAD;
        x += Math.sin(k) * vekt;
        y += Math.cos(k) * vekt;
      }
      pekIdx = peker;         // legg pekeren tilbake der løperen faktisk er
      if (x === 0 && y === 0) return null;
      return (Math.atan2(x, y) / RAD + 360) % 360;
    }

    /**
     * Pass på at kameraet har fri bane: aldri under bakken, og — hvis
     * brukeren vil — heller ikke med en kolle mellom seg og løperen.
     *
     * Vi måler på transformen slik den ble tegnet forrige bilde og
     * justerer til neste. Er det for trangt, senkes kameravinkelen et
     * hakk (som løfter kameraet opp og bakover); er det fritt, legges
     * brukerens egen vinkel gradvis tilbake. Fordi korreksjonen glir
     * mykt i `glideKamera`, merkes den som en naturlig dronebevegelse.
     *
     * Sjekken er throttlet: hvert oppslag mot terrengmodellen koster,
     * og terrenget endrer seg lite fra bilde til bilde.
     */
    function sjekkKlaring(p, nå) {
      if (nå - sistKlaring < KLARING_SJEKK_MS) return;
      sistKlaring = nå;
      if (!map.getTerrain || !map.getTerrain()) return;

      var fc;
      try { fc = map.getFreeCameraOptions(); } catch (e) { return; }
      if (!fc || !fc.position) return;

      var kamLL, kamAlt;
      try {
        kamLL = fc.position.toLngLat();
        kamAlt = fc.position.toAltitude();
      } catch (e) { return; }

      var bakkeVedKamera = map.queryTerrainElevation(kamLL);
      var trangt = (bakkeVedKamera != null &&
        kamAlt < bakkeVedKamera + KLARING_M);

      // Valgfritt: er løperen gjemt bak en kolle, løfter vi oss over den
      if (!trangt && ui.sikt && ui.sikt.checked) {
        var løperLL = { lng: p.lon, lat: p.lat };
        var løperBakke = map.queryTerrainElevation(løperLL);
        if (løperBakke != null && bakkeVedKamera != null) {
          trangt = skjultAvTerreng(kamLL, kamAlt, løperLL, løperBakke + 2);
        }
      }

      kam.korrMål = trangt
        ? Math.min(KLARING_MAKS, kam.korrMål + KLARING_STEG)
        : Math.max(0, kam.korrMål - KLARING_TILBAKE);
    }

    /** Står terrenget i veien for sikta fra kameraet til løperen? */
    function skjultAvTerreng(kamLL, kamAlt, målLL, målAlt) {
      for (var i = 1; i < SIKT_PRØVER_TERRENG; i++) {
        var f = i / SIKT_PRØVER_TERRENG;
        var h = map.queryTerrainElevation({
          lng: kamLL.lng + (målLL.lng - kamLL.lng) * f,
          lat: kamLL.lat + (målLL.lat - kamLL.lat) * f,
        });
        if (h != null && h > kamAlt + (målAlt - kamAlt) * f + 2) return true;
      }
      return false;
    }

    function høydeVed(p) {
      if (!høyder) return null;
      var a = høyder[p.idx], b = høyder[Math.min(p.idx + 1, n - 1)];
      return a + (b - a) * p.f;
    }

    function akkVed(liste, p) {
      if (!liste) return null;
      var a = liste[p.idx], b = liste[Math.min(p.idx + 1, n - 1)];
      return a + (b - a) * p.f;
    }

    // ============================================================
    // Animasjonsløkka
    // ============================================================
    // Løkka går HELE tiden mens fly-byen er åpen — også i pause. Da kan
    // brukeren zoome og dreie kameraet like fint når det står stille som
    // når det spilles av.

    function løkke(nå) {
      if (!instans || instans.ødelagt) return;
      var dt = begrens((nå - sistTid) / 1000, 0, 0.1);
      sistTid = nå;

      // Pause fryser ALT, også en pågående runde rundt et punkt — da
      // fortsetter runden der den slapp når man spiller av igjen.
      if (spiller && klar) {
        if (orbit) {
          if (orbit.venter) {
            // Stå stille til flisene rundt punktet er inne (eller vi gir opp)
            orbit.ventet += dt * 1000;
            if (map.areTilesLoaded() || orbit.ventet >= ORBIT_VENT_MS) {
              orbit.venter = false;
            }
          } else {
            orbit.tid += dt;
            var a = begrens(orbit.tid / orbit.varighet, 0, 1);
            // Mykt i gang og mykt ut igjen, så runden ikke rykker til
            kam.orbitVinkel = 360 * (a * a * (3 - 2 * a));
            if (a >= 1) avsluttOrbit();
          }
        } else {
          s += (totalKm / varighet) * fart * dt;
          if (s >= totalKm) { s = totalKm; settSpiller(false); ferdigTekst(); }
          sjekkVeipunkt();
        }
      }

      glideKamera(dt);
      sjekkKlaring(posVed(orbit ? avstander[orbit.wpt.idx] : s), nå);
      tegn(false, dt);
      rafId = requestAnimationFrame(løkke);
    }

    /** Glid kameraverdiene mot måltallene sine (eksponentiell demping). */
    function glideKamera(dt) {
      var a = 1 - Math.exp(-dt / KAMERA_TAU);
      kam.zoom += (kam.zoomMål - kam.zoom) * a;
      kam.pitch += (kam.pitchMål - kam.pitch) * a;
      kam.dreie += (kam.dreieMål - kam.dreie) * a;
      kam.korr += (kam.korrMål - kam.korr) * a;
    }

    /**
     * Sett kamera, markør, rutelinje og avlesning etter gjeldende tilstand.
     * `dt` er tida siden forrige bilde (sekunder) — den styrer hvor mye
     * kursen får lov til å endre seg, så utjevningen blir den samme
     * uansett hvor rask maskinen er.
     */
    var sistKamera = null;
    function tegn(hopp, dt) {
      var km = orbit ? avstander[orbit.wpt.idx] : s;
      var p = posVed(km);
      løperMark.setLngLat([p.lon, p.lat]);

      // Kameraretningen: hold bildet i ro, korriger bare ved behov.
      //
      // `mål` er retningen løypa går videre i. I stedet for å følge den
      // hele tida sammenligner vi den med der kameraet allerede peker:
      // ligger løypa innenfor dødsonen, gjør vi INGENTING — da står
      // bildet helt stille selv om løperen svinger fram og tilbake.
      // Først når løypa er på vei ut av utsnittet dreier vi, og bare så
      // mye at den kommer innenfor sonen igjen (ikke helt til midten).
      // Resultatet er lange, rolige tagninger med små korreksjoner i
      // svingene — slik en drone faktisk filmer en løype.
      var mål = råKurs(km);
      if (mål != null) {
        if (kursNå == null || hopp) {
          kursNå = mål;
        } else {
          var d = vinkelDiff(kursNå, mål);
          var utenfor = Math.abs(d) - DØDSONE;
          if (utenfor > 0) {
            var ønsket = (d < 0 ? -1 : 1) * utenfor;
            var endring = ønsket * (1 - Math.exp(-dt / KURS_TAU));
            var tak = MAKS_SVING * dt;
            kursNå = (kursNå + begrens(endring, -tak, tak) + 360) % 360;
          }
        }
      }

      // Bare flytt kartet når noe faktisk har endret seg — står fly-byen
      // i pause med kameraet i ro, er det ingen grunn til å tegne om.
      var nyKam = {
        lon: p.lon, lat: p.lat,
        bearing: (kursNå == null ? 0 : kursNå) + kam.dreie + kam.orbitVinkel,
        zoom: kam.zoom,
        pitch: begrens(kam.pitch - kam.korr, MIN_PITCH, MAKS_PITCH),
      };
      if (hopp || !sistKamera || endret(sistKamera, nyKam)) {
        map.jumpTo({
          center: [nyKam.lon, nyKam.lat],
          bearing: nyKam.bearing, zoom: nyKam.zoom, pitch: nyKam.pitch,
        });
        sistKamera = nyKam;
      }

      oppdaterRuteLinje(p, hopp);
      oppdaterAvlesning(orbit ? avstander[orbit.wpt.idx] : s, p);
      ui.scrubber.value = String(Math.round(
        ((orbit ? avstander[orbit.wpt.idx] : s) / totalKm) * 1000));
    }

    /** Tilbakelagt del av ruta — bare når den forenklede linja har vokst. */
    function oppdaterRuteLinje(p, hopp) {
      var lo = 0, hi = visIdx.length - 1;
      while (lo < hi) {                      // siste visIdx <= p.idx
        var mid = (lo + hi + 1) >> 1;
        if (visIdx[mid] <= p.idx) lo = mid; else hi = mid - 1;
      }
      if (lo === sistVisIdx && !hopp) return;
      sistVisIdx = lo;
      var koord = visKoord.slice(0, lo + 1);
      koord.push([p.lon, p.lat]);
      var kilde = map.getSource('gjort');
      if (kilde) {
        kilde.setData({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: koord },
        });
      }
    }

    function kmT(km) {
      return (typeof fmtKm === 'function') ? fmtKm(km, lokale) : km.toFixed(2) + ' km';
    }

    function oppdaterAvlesning(km, p) {
      ui.dist.textContent = kmT(km);
      var h = høydeVed(p);
      ui.hoyde.textContent = h == null ? '–' : Math.round(h) + ' ' + t('moh');
      var opp = akkVed(oppAkk, p), ned = akkVed(nedAkk, p);
      ui.hm.textContent = (opp == null) ? '–'
        : '↑ ' + Math.round(opp) + ' · ↓ ' + Math.round(ned || 0) + ' m';

      var neste = null;
      for (var j = 0; j < veipunkter.length; j++) {
        if (veipunkter[j].idx > p.idx) { neste = veipunkter[j]; break; }
      }
      if (neste) {
        ui.neste.textContent = (lok(neste, 'name') || neste.name || '') +
          ' · ' + Math.max(0, avstander[neste.idx] - km).toFixed(1) + ' km';
      } else {
        ui.neste.textContent = t('mal') + ' · ' + Math.max(0, totalKm - km).toFixed(1) + ' km';
      }
    }

    function ferdigTekst() { ui.spill.textContent = t('omstart'); }

    // ============================================================
    // Veipunkter: markører, runden rundt, og detaljkortet
    // ============================================================

    function symbolerHtml(w, px) {
      if (typeof wptTyper !== 'function' || typeof symbolGlyphHtml !== 'function') return '';
      var typer = wptTyper(w), ut = '';
      for (var q = 0; q < typer.length; q++) {
        ut += '<span class="fb-wpt-ico">' + symbolGlyphHtml(typer[q], px) + '</span>';
      }
      return ut;
    }

    /** Navnet på en punkttype i valgt språk (engelsk faller tilbake til norsk). */
    function typeNavn(nøkkel) {
      var d = (typeof WPT_SYMBOLER !== 'undefined') ? WPT_SYMBOLER[nøkkel] : null;
      if (!d) return nøkkel;
      return (lang === 'en' && d.navn_en) ? d.navn_en : d.navn;
    }

    /**
     * Punktmerkene står et stykke OVER selve punktet, med en tynn strek
     * ned til det. Da legger de seg ikke oppå terrenget eller hverandre,
     * og de er lette å lese mens kameraet beveger seg.
     * `subpixelPositioning` gjør at de glir jevnt i stedet for å hakke
     * seg fram piksel for piksel når kameraet dreier.
     */
    function byggVeipunktMarkører() {
      for (var j = 0; j < veipunkter.length; j++) {
        var w = veipunkter[j];
        if (w.vis_ikon === false) continue;
        var el = document.createElement('div');
        el.className = 'fb-wpt';
        el.innerHTML =
          '<div class="fb-wpt-boks" title="' + escHtml(t('klikkForMer')) + '">' +
            '<span class="fb-wpt-sym">' + symbolerHtml(w, 15) + '</span>' +
            '<span class="fb-wpt-navn"></span>' +
          '</div>' +
          '<div class="fb-wpt-strek"></div>' +
          '<div class="fb-wpt-fot"></div>';
        el.querySelector('.fb-wpt-navn').textContent = lok(w, 'name') || w.name || '';
        (function (wpt) {
          el.querySelector('.fb-wpt-boks').addEventListener('click', function (e) {
            e.stopPropagation();
            visKort(wpt);
          });
        })(w);
        wptMarkører.push(new maplibregl.Marker({
          element: el, anchor: 'bottom', subpixelPositioning: true,
        }).setLngLat([w.lon, w.lat]).addTo(map));
      }
    }

    /** Statistikk for et punkt på løypa (samme tall som i løypevisningen). */
    function statistikkFor(idx) {
      var forrige = null;
      for (var j = 0; j < veipunkter.length; j++) {
        var w = veipunkter[j];
        if (w.idx < idx && (!forrige || w.idx > forrige.idx)) forrige = w;
      }
      var fIdx = forrige ? forrige.idx : 0;
      return {
        dist: avstander[idx],
        distForrige: avstander[idx] - avstander[fIdx],
        høyde: høyder ? høyder[idx] : null,
        oppStart: oppAkk ? Math.round(oppAkk[idx]) : null,
        nedStart: nedAkk ? Math.round(nedAkk[idx]) : null,
        forrigeNavn: forrige ? (lok(forrige, 'name') || forrige.name) : t('start'),
      };
    }

    /**
     * Start runden rundt et punkt: avspillingen står stille mens vi snurrer.
     *
     * Runden begynner ikke med en gang — vi står først et øyeblikk i ro
     * («venter») til kartflisene rundt punktet er lastet. Uten den pausen
     * svinger kameraet inn i områder som ennå ikke har fliser, og bakken
     * blir stående tom. Ventinga leses som en naturlig ankomst til stedet.
     */
    function startOrbit(w) {
      orbit = {
        wpt: w, tid: 0, venter: true, ventet: 0,
        pitchFør: kam.pitchMål,
        // Runden går raskere ved høy fart, men ikke proporsjonalt — ved 8×
        // ville en firedels runde blitt for kjapp til at flisene henger med.
        varighet: ORBIT_SEK / Math.sqrt(Math.max(1, fart)),
      };
      kam.orbitVinkel = 0;
      // Senk kameraet litt under runden: da ser vi mer ned på stedet og
      // mindre langt utover, som både kler et sjekkpunkt og krever langt
      // færre fjerne fliser — hovedgrunnen til tomme flater under svingen.
      kam.pitchMål = Math.min(kam.pitchMål, ORBIT_PITCH);
      s = avstander[w.idx];
      visToast(w);
    }

    function avsluttOrbit() {
      if (orbit) kam.pitchMål = orbit.pitchFør;
      orbit = null;
      kam.orbitVinkel = 0;
      skjulToast();
      if (s >= totalKm) { settSpiller(false); ferdigTekst(); }
    }

    /** Sjekk om vi har passert et interessepunkt, og reager på det. */
    function sjekkVeipunkt() {
      var p = posVed(s);
      while (nesteWpt < veipunkter.length && veipunkter[nesteWpt].idx <= p.idx) {
        var w = veipunkter[nesteWpt];
        nesteWpt++;
        if (w.idx === 0) continue;              // start trenger ingen stopp
        if (ui.stopp.checked && w.vis_ikon !== false) { startOrbit(w); return; }
        visToast(w);                            // ellers bare en kort melding
      }
    }

    var toastTimer = null;
    function visToast(w) {
      ui.toast.innerHTML = '<span class="fb-toast-sym">' + symbolerHtml(w, 18) + '</span>' +
        '<span class="fb-toast-navn"></span><span class="fb-toast-dist"></span>';
      ui.toast.querySelector('.fb-toast-navn').textContent = lok(w, 'name') || w.name || '';
      ui.toast.querySelector('.fb-toast-dist').textContent = kmT(avstander[w.idx]);
      ui.toast.classList.add('fb-toast-vis');
      clearTimeout(toastTimer);
      // Under runden rundt punktet blir meldingen stående til vi er ferdige
      if (!orbit) toastTimer = setTimeout(skjulToast, 3200);
    }

    function skjulToast() {
      clearTimeout(toastTimer);
      ui.toast.classList.remove('fb-toast-vis');
    }

    /** Detaljkortet for et punkt: pause + all informasjonen om stedet. */
    function visKort(w) {
      kortFortsett = spiller || !!orbit;
      if (orbit) avsluttOrbit();
      settSpiller(false);
      kortWpt = w;

      var st = statistikkFor(w.idx);
      var typer = (typeof wptTyper === 'function') ? wptTyper(w) : [];
      var typeRad = '';
      for (var q = 0; q < typer.length; q++) {
        typeRad += '<span class="fb-kort-type">' +
          symbolGlyphHtml(typer[q], 15) + ' ' + escHtml(typeNavn(typer[q])) + '</span>';
      }
      var beskr = lok(w, 'desc');
      // Arenakart-lenke, når kalleren kan bygge en (den publiserte
      // visningen kan; verktøyet har ingen publisert arena å peke på).
      // Adressen valideres av kalleren — vi escaper den uansett her.
      var arena = arenaUrl(w);
      var arenaDel = arena
        ? '<p class="fb-kort-arena"><a href="' + escHtml(arena) +
          '" target="_blank" rel="noopener">' + escHtml(t('seArenakart')) + '</a></p>'
        : '';
      var rad = function (navn, verdi) {
        return '<tr><td>' + escHtml(navn) + '</td><td>' + escHtml(verdi) + '</td></tr>';
      };
      var tabell =
        rad(t('distanseFraStart'), kmT(st.dist)) +
        rad(t('fraForrige') + ' (' + st.forrigeNavn + ')', kmT(st.distForrige)) +
        (st.høyde == null ? '' : rad(t('hoyde'), Math.round(st.høyde) + ' ' + t('moh'))) +
        (st.oppStart == null ? '' : rad(t('hoydemeterFraStart'),
          '↑ ' + st.oppStart + ' m · ↓ ' + st.nedStart + ' m'));

      ui.kort.innerHTML =
        '<button type="button" class="fb-kort-lukk" aria-label="' +
          escHtml(t('lukkKort')) + '">✕</button>' +
        '<h3></h3>' +
        '<div class="fb-kort-typer">' + typeRad + '</div>' +
        (beskr ? '<p class="fb-kort-beskr"></p>' : '') +
        arenaDel +
        '<table>' + tabell + '</table>';
      ui.kort.querySelector('h3').textContent = lok(w, 'name') || w.name || '';
      if (beskr) ui.kort.querySelector('.fb-kort-beskr').textContent = beskr;
      ui.kort.querySelector('.fb-kort-lukk').addEventListener('click', function (e) {
        e.stopPropagation();
        skjulKort();
      });
      ui.kort.classList.remove('fb-skjult');
      skjulToast();
    }

    /** Lukk kortet og fortsett der vi slapp (hvis det spilte av før). */
    function skjulKort() {
      if (!kortWpt) return;
      kortWpt = null;
      ui.kort.classList.add('fb-skjult');
      if (kortFortsett) settSpiller(true);
      kortFortsett = false;
    }

    // ============================================================
    // Avspilling
    // ============================================================

    function settSpiller(på) {
      if (på && !klar) return;               // vent til landskapet er lastet
      // Ferdig løype: start forfra. (Men ikke midt i en runde rundt
      // målpunktet — da skal runden bare fortsette der den ble satt på pause.)
      if (på && !orbit && s >= totalKm) nullstill();
      spiller = på;
      ui.spill.textContent = på ? t('pause') : t('spill');
      ui.spill.classList.toggle('fb-spiller', på);
    }

    function nullstill() {
      s = 0; pekIdx = 0; kursNå = null; sistVisIdx = -1; nesteWpt = 0;
      orbit = null; kam.orbitVinkel = 0;
      skjulToast();
      tegn(true);
    }

    function spolTil(km) {
      if (orbit) avsluttOrbit();
      s = begrens(km, 0, totalKm);
      var p = posVed(s);
      nesteWpt = 0;
      while (nesteWpt < veipunkter.length && veipunkter[nesteWpt].idx <= p.idx) nesteWpt++;
      tegn(true);
    }

    // ============================================================
    // Kontroller
    // ============================================================

    /** Spill av ↔ pause. Brukes av knappen, mellomrom og klikk på kartet. */
    function vekslAvspilling() {
      brukerHarStyrt = true;
      settSpiller(!spiller);
    }

    ui.spill.addEventListener('click', vekslAvspilling);

    ui.omstart.addEventListener('click', function () {
      brukerHarStyrt = true;
      nullstill();
      ferdigTekst();
      settSpiller(true);
    });

    ui.scrubber.addEventListener('input', function () {
      brukerHarStyrt = true;
      spolTil((Number(ui.scrubber.value) / 1000) * totalKm);
    });

    for (var f = 0; f < FARTER.length; f++) {
      (function (v) {
        var merke = v.toLocaleString(lokale) + '×';   // «0,5×» / «0.5×»
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fb-fart' + (v === STANDARD_FART ? ' fb-fart-aktiv' : '');
        b.textContent = merke;
        b.title = t('fart') + ' ' + merke;
        b.addEventListener('click', function () {
          fart = v;
          if (orbit) orbit.varighet = ORBIT_SEK / Math.sqrt(Math.max(1, fart));
          var alle = ui.farter.querySelectorAll('.fb-fart');
          for (var q = 0; q < alle.length; q++) alle[q].classList.remove('fb-fart-aktiv');
          b.classList.add('fb-fart-aktiv');
        });
        ui.farter.appendChild(b);
      })(FARTER[f]);
    }

    ui.lag.addEventListener('click', function () {
      satellitt = !satellitt;
      map.setLayoutProperty('topo', 'visibility', satellitt ? 'none' : 'visible');
      map.setLayoutProperty('satellitt', 'visibility', satellitt ? 'visible' : 'none');
      map.setPaintProperty('bunn', 'background-color',
        satellitt ? BUNNFARGE.satellitt : BUNNFARGE.topo);
      ui.lag.textContent = satellitt ? t('kart') : t('satellitt');
    });

    // ---- Vårt eget kamerastyre: hjul zoomer, dra dreier/vipper ----
    // (MapLibres egne håndterere er slått av, se `interactive: false`.)

    var lerret = map.getCanvasContainer();

    lerret.addEventListener('wheel', function (e) {
      e.preventDefault();
      var steg = e.deltaMode === 1 ? 0.12 : 0.0032;   // linjer vs. piksler
      kam.zoomMål = begrens(kam.zoomMål - e.deltaY * steg, MIN_ZOOM, MAKS_ZOOM);
    }, { passive: false });

    var pekere = {};        // aktive fingre/musepekere
    var sistPinch = 0;

    function antallPekere() { return Object.keys(pekere).length; }

    lerret.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.fb-wpt')) return; // punktmerker
      pekere[e.pointerId] = { x: e.clientX, y: e.clientY, flyttet: false };
      if (antallPekere() === 2) sistPinch = pinchAvstand();
      lerret.setPointerCapture(e.pointerId);
      lerret.classList.add('fb-drar');
    });

    function pinchAvstand() {
      var v = Object.keys(pekere).map(function (id) { return pekere[id]; });
      if (v.length < 2) return 0;
      return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
    }

    lerret.addEventListener('pointermove', function (e) {
      var p = pekere[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) p.flyttet = true;

      if (antallPekere() >= 2) {
        // To fingre: knip for å zoome
        var d = pinchAvstand();
        if (sistPinch > 0 && d > 0) {
          kam.zoomMål = begrens(kam.zoomMål + Math.log2(d / sistPinch), MIN_ZOOM, MAKS_ZOOM);
        }
        sistPinch = d;
        return;
      }
      // Én peker: vannrett drar kameraet rundt løperen, loddrett vipper det
      kam.dreieMål += dx * 0.28;
      kam.pitchMål = begrens(kam.pitchMål - dy * 0.22, MIN_PITCH, MAKS_PITCH);
    });

    function slippPeker(e) {
      var p = pekere[e.pointerId];
      delete pekere[e.pointerId];
      sistPinch = 0;
      if (!antallPekere()) lerret.classList.remove('fb-drar');
      if (!p || p.flyttet) return;             // dra er ikke klikk
      // Klikk på kartet: lukk et åpent detaljkort — ellers virker det som
      // spill/pause, så man slipper å treffe knappen nede i hjørnet.
      if (kortWpt) skjulKort();
      else vekslAvspilling();
    }
    lerret.addEventListener('pointerup', slippPeker);
    lerret.addEventListener('pointercancel', slippPeker);

    // Klikk utenfor kortet (men inne i overlegget) lukker det også
    ui.rot.addEventListener('click', function (e) {
      if (!kortWpt) return;
      if (e.target.closest('.fb-kort') || e.target.closest('.fb-wpt')) return;
      if (e.target.closest('.fb-bunn') || e.target.closest('.fb-topp')) return;
      skjulKort();
    });

    function påTast(e) {
      if (e.key === 'Escape') {
        if (kortWpt) { skjulKort(); return; }
        lukk();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        vekslAvspilling();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); brukerHarStyrt = true; spolTil(s + totalKm * 0.02);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); brukerHarStyrt = true; spolTil(s - totalKm * 0.02);
      }
    }
    document.addEventListener('keydown', påTast);

    function påResize() { settPadding(); map.resize(); }
    window.addEventListener('resize', påResize);

    // ============================================================
    // Lukking og opprydding
    // ============================================================

    function lukk() {
      if (!instans || instans.ødelagt) return;
      instans.ødelagt = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(toastTimer);
      document.removeEventListener('keydown', påTast);
      window.removeEventListener('resize', påResize);
      for (var j = 0; j < wptMarkører.length; j++) wptMarkører[j].remove();
      løperMark.remove();
      try { map.remove(); } catch (e) { /* kartet kan alt være borte */ }
      ui.rot.remove();
      document.body.classList.remove('kul-flyby-aapen');
      instans = null;
    }

    instans.lukk = lukk;
    ui.lukk.addEventListener('click', lukk);
  }

  // Lukk-knappen må virke også FØR kartet er lastet (mens vi venter på
  // MapLibre) — derfor en enkel nødutgang som byggOverlegg kobler på.
  document.addEventListener('click', function (e) {
    if (!instans || instans.lukk) return;      // start() har tatt over
    var mål = e.target;
    if (mål && mål.classList && mål.classList.contains('fb-lukk')) {
      instans.ødelagt = true;
      instans.ui.rot.remove();
      document.body.classList.remove('kul-flyby-aapen');
      instans = null;
    }
  }, true);

  return { åpne: åpne, tilgjengelig: tilgjengelig };
})();
