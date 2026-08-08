/* ============================================================
   Opptaksmanus — «scripting» av en flyover-innspilling.

   Et manus beskriver HVORDAN videoen skal bli, uavhengig av hvordan
   man tilfeldigvis dro i kameraet mens man så på:

     * kamerapunkter  — vinkel, retning, zoom og fart på valgte steder
                        i løypa, med myke overganger mellom dem
     * sjekkpunkter   — per punkt: vises markøren, tas det en 360,
                        stopper vi og viser detaljkortet
     * start og slutt — splash-plakat, forsinkelse, oversiktsbilde
     * video          — språk (norsk/engelsk/begge) og oppløsninger

   Modulen er DELT I TO:

     1. En ren datadel (standard/normaliser/kompiler) som gjør et manus
        om til en «plan» — oppslagsfunksjoner flyby.js kaller per bilde.
     2. Et panel (åpne) som lar brukeren sette manuset opp. Panelet
        legger seg inne i flyover-overlegget, så man kan dra kameraet
        i bakgrunnen og hente inn stillingen med ett klikk.

   Fila lastes BARE i verktøyet — publiserte løypevisninger spiller ikke
   inn video, og har verken opptak.js eller denne. flyby.js må derfor
   tåle at KULManus er udefinert (samme mønster som KULOpptak).
   ============================================================ */
'use strict';

var KULManus = (function () {

  // ============================================================
  // Standardverdier
  // ============================================================

  // Speiler startverdiene i flyby.js. Holdes her også, så et manus kan
  // leses og forstås uten å kjenne flyby-koden.
  var STD = {
    pitch: 68, zoom: 15, fart: 0.5,
    orbitPitch: 55, orbitSek: 11,
    visKm: 6, fullKm: 3,
    kortSek: 3,
  };

  var MIN_ZOOM = 3, MAKS_ZOOM = 18;
  var MIN_PITCH = 15, MAKS_PITCH = 80;
  var MAKS_FART = 8;

  // Relative overgangslengder, som andel av strekket som er ledig.
  // «Øyeblikkelig» = 0 gir et rent klipp fra én innstilling til neste.
  var REL = {
    svaert_rolig: 1.0,
    rolig: 0.75,
    normal: 0.5,
    rask: 0.25,
    svaert_rask: 0.1,
    momentan: 0,
  };

  var REL_NAVN = {
    svaert_rolig: 'Svært rolig', rolig: 'Rolig', normal: 'Normal',
    rask: 'Rask', svaert_rask: 'Svært rask', momentan: 'Øyeblikkelig',
  };

  var KOMPASS = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];

  function klem(v, min, maks) { return Math.max(min, Math.min(maks, v)); }

  function tall(v, standard) {
    var n = Number(v);
    return isFinite(n) ? n : standard;
  }

  /** Korteste vei fra vinkel a til b, i grader ([-180, 180]). */
  function vinkelDiff(a, b) { return ((b - a + 540) % 360) - 180; }

  /** Mykt inn og mykt ut (smoothstep) — ingen rykk i endene. */
  function mykt(u) { return u * u * (3 - 2 * u); }

  // ============================================================
  // Datamodellen
  // ============================================================

  function standardStartSlutt(oversiktSek) {
    return {
      splash: false,
      tittel: { no: '', en: '' },
      undertekst: { no: '', en: '' },
      splashSek: 5,
      forsinkelse: 0,
      oversikt: false,
      oversiktSek: oversiktSek,
    };
  }

  function standard() {
    return {
      versjon: 1,
      sprak: ['no', 'en'],
      maksBredde: 1920,
      nettversjon: true,
      nettBredde: 1280,
      // Hvor mye terrenget får lov til å overstyre kameravinkelen:
      //   'sikt'  — hev kameraet både over bakken og over koller i veien
      //   'bakke' — hev bare når kameraet ellers havner under terrenget
      //   'ingen' — følg vinkelen nøyaktig, uansett hva som er i veien
      terreng: 'sikt',
      kamera: [],
      sjekkpunkter: {},
      start: standardStartSlutt(6),
      slutt: standardStartSlutt(8),
    };
  }

  /**
   * Stabil nøkkel for et veipunkt.
   *
   * Indeksen i lista duger ikke: legger man til et punkt lenger framme,
   * forskyves alle de andre og innstillingene ville fulgt feil punkt.
   * Navn + koordinat er stabilt gjennom redigering av resten av løypa.
   */
  function nøkkelFor(w) {
    if (!w) return '';
    if (w.bib_id) return 'b:' + w.bib_id;
    return 'p:' + (w.name || '') + '@' +
      Number(w.lat).toFixed(5) + ',' + Number(w.lon).toFixed(5);
  }

  function standardKamerapunkt(km) {
    return {
      km: km || 0,
      pitch: STD.pitch,
      zoom: STD.zoom,
      fart: STD.fart,
      retningModus: 'loype',   // 'loype' = forskyvning fra løyperetningen
      retning: 0,              // grader: forskyvning, eller fast kompasskurs
      lengdeModus: 'rel',      // 'rel' | 'sek' | 'km'
      lengdeRel: 'normal',
      lengdeSek: 5,
      lengdeKm: 0.5,
      plassering: 'for',       // 'for' | 'midt' | 'etter'
      stoppSek: 3,
    };
  }

  function standardSjekkpunkt(orbitStandard) {
    return {
      vis: true,
      visKm: STD.visKm,
      fullKm: STD.fullKm,
      orbit: !!orbitStandard,
      orbitPitch: STD.orbitPitch,
      orbitSek: STD.orbitSek,
      kort: false,
      kortSek: STD.kortSek,
    };
  }

  /** Rydd et innlest manus: fyll inn manglende felt, klem verdier på plass. */
  function normaliser(rå) {
    var m = standard();
    if (!rå || typeof rå !== 'object') return m;

    if (Array.isArray(rå.sprak)) {
      var s = rå.sprak.filter(function (k) { return k === 'no' || k === 'en'; });
      if (s.length) m.sprak = s;
    }
    m.maksBredde = klem(Math.round(tall(rå.maksBredde, 1920)), 320, 3840);
    m.nettversjon = rå.nettversjon !== false;
    m.nettBredde = klem(Math.round(tall(rå.nettBredde, 1280)), 320, 3840);
    m.terreng = (rå.terreng === 'bakke' || rå.terreng === 'ingen')
      ? rå.terreng : 'sikt';

    if (Array.isArray(rå.kamera)) {
      m.kamera = rå.kamera.map(function (k) {
        var d = standardKamerapunkt(tall(k.km, 0));
        d.pitch = klem(tall(k.pitch, d.pitch), MIN_PITCH, MAKS_PITCH);
        d.zoom = klem(tall(k.zoom, d.zoom), MIN_ZOOM, MAKS_ZOOM);
        d.fart = klem(tall(k.fart, d.fart), 0, MAKS_FART);
        d.retningModus = k.retningModus === 'fast' ? 'fast' : 'loype';
        d.retning = tall(k.retning, 0);
        d.lengdeModus = (k.lengdeModus === 'sek' || k.lengdeModus === 'km')
          ? k.lengdeModus : 'rel';
        d.lengdeRel = REL[k.lengdeRel] != null ? k.lengdeRel : 'normal';
        d.lengdeSek = klem(tall(k.lengdeSek, 5), 0, 120);
        d.lengdeKm = klem(tall(k.lengdeKm, 0.5), 0, 500);
        d.plassering = (k.plassering === 'midt' || k.plassering === 'etter')
          ? k.plassering : 'for';
        d.stoppSek = klem(tall(k.stoppSek, 3), 0.5, 120);
        return d;
      }).sort(function (a, b) { return a.km - b.km; });
    }

    if (rå.sjekkpunkter && typeof rå.sjekkpunkter === 'object') {
      Object.keys(rå.sjekkpunkter).forEach(function (n) {
        var k = rå.sjekkpunkter[n] || {};
        var d = standardSjekkpunkt(false);
        d.vis = k.vis !== false;
        d.visKm = klem(tall(k.visKm, d.visKm), 0.1, 60);
        d.fullKm = klem(tall(k.fullKm, d.fullKm), 0, d.visKm);
        d.orbit = !!k.orbit;
        d.orbitPitch = klem(tall(k.orbitPitch, d.orbitPitch), MIN_PITCH, MAKS_PITCH);
        d.orbitSek = klem(tall(k.orbitSek, d.orbitSek), 2, 60);
        d.kort = !!k.kort;
        d.kortSek = klem(tall(k.kortSek, d.kortSek), 1, 15);
        m.sjekkpunkter[n] = d;
      });
    }

    ['start', 'slutt'].forEach(function (felt) {
      var k = rå[felt] || {};
      var d = m[felt];
      d.splash = !!k.splash;
      d.tittel = { no: String((k.tittel && k.tittel.no) || ''),
        en: String((k.tittel && k.tittel.en) || '') };
      d.undertekst = { no: String((k.undertekst && k.undertekst.no) || ''),
        en: String((k.undertekst && k.undertekst.en) || '') };
      d.splashSek = klem(tall(k.splashSek, d.splashSek), 1, 60);
      d.forsinkelse = klem(tall(k.forsinkelse, 0), 0, 60);
      d.oversikt = !!k.oversikt;
      d.oversiktSek = klem(tall(k.oversiktSek, d.oversiktSek), 2, 60);
    });

    return m;
  }

  // ============================================================
  // Kompilering: manus → oppslagbar plan
  // ============================================================

  /**
   * Regn ut overgangsvinduene [a, b] i km for hvert kamerapunkt.
   *
   * Kravet fra brukeren er at en overgang alltid skal være FERDIG før
   * neste begynner. Derfor klippes hvert vindu mot naboene sine: mot
   * forrige punkts vindu på venstre side, og mot neste punkt på høyre.
   * Da kan man sette «svært rolig» overalt uten at overgangene vokser
   * inn i hverandre — de blir bare så lange det er plass til.
   */
  function byggVinduer(kf, totalKm, kmPerSek) {
    var vinduer = [];

    // ---- Første runde: hvor overgangen VIL ligge, uten hensyn til naboer ----
    for (var i = 1; i < kf.length; i++) {
      var k = kf[i], f = kf[i - 1];
      var nesteKm = (i + 1 < kf.length) ? kf[i + 1].km : totalKm;
      var gapFør = Math.max(0, k.km - f.km);
      var gapEtter = Math.max(0, nesteKm - k.km);

      var L;
      if (k.lengdeModus === 'km') {
        L = k.lengdeKm;
      } else if (k.lengdeModus === 'sek') {
        // Sekunder må gjøres om til km. Farten varierer, så vi bruker
        // snittfarten inn mot punktet som anslag — godt nok til å treffe
        // en overgang som «tar omtrent fem sekunder».
        var fartRef = Math.max(0.25, (f.fart + k.fart) / 2);
        L = k.lengdeSek * kmPerSek * fartRef;
      } else {
        var andel = REL[k.lengdeRel] != null ? REL[k.lengdeRel] : 0.5;
        // «Rolighet» er en andel av strekket som er ledig. For en overgang
        // som ligger MIDT over punktet er det ledige strekket summen av
        // det før og det etter — ikke det minste av dem. Med det minste
        // ville et punkt som ligger tett inntil naboen sin fått en
        // overgang på nesten ingenting, selv med god plass på andre sida.
        var rom = k.plassering === 'etter' ? gapEtter
          : k.plassering === 'midt' ? (gapFør + gapEtter)
            : gapFør;
        L = andel * rom;
      }

      var a, b;
      if (k.plassering === 'etter') { a = k.km; b = k.km + L; }
      else if (k.plassering === 'midt') { a = k.km - L / 2; b = k.km + L / 2; }
      else { a = k.km - L; b = k.km; }

      vinduer.push({ a: a, b: b, fra: f, til: k, km: k.km, nesteKm: nesteKm });
    }

    // ---- Andre runde: hold overgangen innenfor sine egne naboer ----
    // Et kamerapunkt eier strekket fra punktet før til punktet etter.
    // Lenger enn det kan en overgang aldri rekke, uansett hva som er valgt.
    for (var j = 0; j < vinduer.length; j++) {
      var v = vinduer[j];
      v.a = Math.max(v.a, v.fra.km);
      v.b = Math.min(v.b, v.nesteKm);
      if (v.b < v.a) v.b = v.a;
    }

    // ---- Tredje runde: del et omstridt strekk på midten ----
    // Vil to overganger bruke det samme strekket, tok den første før alt
    // og den andre ble stående igjen med null — altså et brått klipp
    // brukeren ikke hadde bedt om. Nå møtes de på midten, så begge
    // beholder en overgang.
    for (var q = 1; q < vinduer.length; q++) {
      var fr = vinduer[q - 1], et = vinduer[q];
      if (et.a >= fr.b) continue;
      var midt = (et.a + fr.b) / 2;
      fr.b = Math.max(fr.a, midt);
      et.a = Math.min(et.b, midt);
    }

    return vinduer;
  }

  /**
   * Lag en plan av et manus.
   *
   * ctx: { totalKm, varighet, veipunkter, orbitStandard }
   *   varighet = sekunder løypa tar ved fart 1× (flyby regner den ut)
   */
  function kompiler(manus, ctx) {
    var m = normaliser(manus);
    var totalKm = Math.max(0.001, ctx.totalKm || 0.001);
    var kmPerSek = totalKm / Math.max(1, ctx.varighet || 1);

    // Kamerapunktene. Er det ingen, lar vi flyby styre kameraet som før.
    // `_i` husker hvilket kamerapunkt i brukerens liste kopien kom fra, så
    // panelet kan slå opp hva overgangen til akkurat det punktet ble.
    var kf = m.kamera.map(function (k, i) {
      var kopi = Object.assign({}, k);
      kopi.km = klem(kopi.km, 0, totalKm);
      kopi._i = i;
      return kopi;
    }).sort(function (a, b) { return a.km - b.km; });
    var harKamera = kf.length > 0;
    if (harKamera && kf[0].km > 0.0001) {
      // Alt starter et sted. Mangler et punkt på km 0, legger vi inn
      // flyovers vanlige startstilling der, så den første overgangen har
      // noe å gå UT FRA.
      kf.unshift(standardKamerapunkt(0));
    }
    var vinduer = harKamera ? byggVinduer(kf, totalKm, kmPerSek) : [];

    /** Verdiene ved en gitt km — mellom to kamerapunkt, mykt blandet. */
    function tilstand(km) {
      if (!harKamera) return null;
      for (var i = 0; i < vinduer.length; i++) {
        var v = vinduer[i];
        if (km < v.a) return { fra: v.fra, til: v.fra, u: 0 };
        if (km < v.b) {
          return { fra: v.fra, til: v.til, u: mykt((km - v.a) / (v.b - v.a)) };
        }
      }
      var sist = kf[kf.length - 1];
      return { fra: sist, til: sist, u: 1 };
    }

    function bland(a, b, u) { return a + (b - a) * u; }

    /**
     * Kameraet ved en gitt km. `løypeKurs` er retningen løypa går i der
     * (flyby regner den ut med sin egen utjevning) — den trengs for å
     * gjøre en forskyvning om til en faktisk kompasskurs.
     *
     * Retningen løses ALLTID opp til en absolutt kurs før blandingen.
     * Da kan et punkt som følger løypa gli over i et med fast
     * himmelretning uten at overgangen hopper.
     */
    function kamera(km, løypeKurs) {
      var t = tilstand(km);
      if (!t) return null;
      var grunn = (løypeKurs == null) ? 0 : løypeKurs;
      var kA = t.fra.retningModus === 'fast' ? t.fra.retning : grunn + t.fra.retning;
      var kB = t.til.retningModus === 'fast' ? t.til.retning : grunn + t.til.retning;
      var bearing = (kA + vinkelDiff(kA, kB) * t.u + 360) % 360;
      return {
        pitch: bland(t.fra.pitch, t.til.pitch, t.u),
        zoom: bland(t.fra.zoom, t.til.zoom, t.u),
        fart: bland(t.fra.fart, t.til.fart, t.u),
        bearing: bearing,
      };
    }

    function fartVed(km) {
      var t = tilstand(km);
      return t ? bland(t.fra.fart, t.til.fart, t.u) : null;
    }

    // Stoppene: kamerapunkter med fart 0. Farten blandes MOT null på vei
    // inn, så løperen bremser av seg selv — men en eksponentiell
    // innbremsing når aldri helt fram. Derfor er stoppene egne
    // hendelser: når farten er nede i nesten ingenting, låser vi
    // posisjonen til punktet og teller ned oppholdet.
    var stopp = [];
    for (var q = 0; q < kf.length; q++) {
      if (kf[q].fart < 0.02) {
        stopp.push({
          km: kf[q].km,
          sek: kf[q].stoppSek,
          // Farten vi tvinger igjennom etterpå, så vi kommer oss videre
          etter: Math.max(0.25, (q + 1 < kf.length) ? kf[q + 1].fart : 1),
        });
      }
    }

    var sjekk = m.sjekkpunkter;
    var orbitStandard = !!ctx.orbitStandard;

    return {
      manus: m,
      harKamera: harKamera,
      kamerapunkter: kf,
      kamera: kamera,
      fartVed: fartVed,
      stopp: stopp,
      /**
       * Hvor overgangen inn til kamerapunkt nummer `brukerIdx` faktisk
       * havnet, etter at den er klippet mot naboene sine. Panelet viser
       * dette, så man ser hva innstillingene ble til i praksis i stedet
       * for å måtte gjette.
       */
      overgang: function (brukerIdx) {
        for (var i = 0; i < vinduer.length; i++) {
          var v = vinduer[i];
          if (v.til._i !== brukerIdx) continue;
          var fartSnitt = (v.fra.fart + v.til.fart) / 2;
          // Ender overgangen i et stopp, er tida på strekket ikke et
          // fornuftig tall: farten går mot null, og hvor lenge det tar
          // avhenger av hvor nær null vi lar den komme. Da sier vi det i
          // stedet for å oppgi et tall som ser presist ut og ikke er det.
          var brems = v.til.fart < 0.02;
          return {
            a: v.a, b: v.b, km: v.km,
            lengde: v.b - v.a,
            brems: brems,
            // Kommer overgangen fra det innskutte startpunktet (og ikke fra
            // et av brukerens egne), er det verdt å si fra — da er det
            // flyoverens standardstilling man glir ut av.
            fraStandard: v.fra._i == null,
            sek: brems ? null
              : (v.b - v.a) / Math.max(1e-6, kmPerSek * Math.max(0.25, fartSnitt)),
          };
        }
        return null;
      },
      /** Innstillingene for ett veipunkt (standard hvis ikke satt). */
      sjekkpunkt: function (w) {
        var d = sjekk[nøkkelFor(w)];
        return d || standardSjekkpunkt(orbitStandard);
      },
      start: m.start,
      slutt: m.slutt,
      sprak: m.sprak,
      terreng: m.terreng,
      /** Hvor lenge videoen skal fortsette etter at løypa er kjørt ferdig. */
      sluttVarighet: function () {
        var d = m.slutt;
        return Math.max(
          d.forsinkelse,
          d.splash ? d.splashSek : 0,
          d.oversikt ? d.oversiktSek : 0);
      },
    };
  }

  // ============================================================
  // Panelet
  // ============================================================

  function el(tag, klasse, tekst) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  /** Kompassnavn for en kurs, f.eks. 135 → «SØ». */
  function kompass(grader) {
    var i = Math.round(((grader % 360) + 360) % 360 / 45) % 8;
    return KOMPASS[i];
  }

  /**
   * Omtrent hvor bredt utsnitt en zoomverdi gir.
   *
   * Zoomtall sier ingenting til folk flest. Bredden på det man ser gjør
   * det: «≈ 400 km bredt» er hele landsdelen, «≈ 1,2 km bredt» er nede
   * på stinivå. Regnet ut av flisoppløsningen ved breddegraden.
   */
  function zoomTekst(zoom, lat, pikselbredde) {
    var mPerPx = 156543.03392 * Math.cos((lat || 60) * Math.PI / 180) / Math.pow(2, zoom);
    var km = mPerPx * (pikselbredde || 1200) / 1000;
    if (km >= 100) return '≈ ' + Math.round(km / 10) * 10 + ' km bredt';
    if (km >= 10) return '≈ ' + Math.round(km) + ' km bredt';
    if (km >= 1) return '≈ ' + km.toFixed(1).replace('.', ',') + ' km bredt';
    return '≈ ' + Math.round(km * 1000) + ' m bredt';
  }

  function fartTekst(f) {
    if (f < 0.02) return 'stopp';
    return f.toFixed(1).replace('.', ',') + '×';
  }

  /** Et merket felt med en skyveknapp og en levende avlesning ved siden av. */
  function skyver(etikett, min, maks, steg, verdi, format, ved) {
    var rad = el('label', 'fb-m-felt');
    rad.appendChild(el('span', 'fb-m-etikett', etikett));
    var inn = document.createElement('input');
    inn.type = 'range';
    inn.min = String(min); inn.max = String(maks); inn.step = String(steg);
    inn.value = String(verdi);
    var ut = el('span', 'fb-m-verdi', format(Number(verdi)));
    inn.addEventListener('input', function () {
      var v = Number(inn.value);
      ut.textContent = format(v);
      ved(v);
    });
    rad.appendChild(inn);
    rad.appendChild(ut);
    rad.oppdater = function (v) {
      inn.value = String(v);
      ut.textContent = format(Number(v));
    };
    return rad;
  }

  function tallfelt(etikett, min, maks, steg, verdi, suffiks, ved) {
    var rad = el('label', 'fb-m-felt fb-m-tall');
    rad.appendChild(el('span', 'fb-m-etikett', etikett));
    var inn = document.createElement('input');
    inn.type = 'number';
    inn.min = String(min); inn.max = String(maks); inn.step = String(steg);
    inn.value = String(verdi);
    inn.addEventListener('change', function () {
      var v = klem(tall(inn.value, verdi), min, maks);
      inn.value = String(v);
      ved(v);
    });
    rad.appendChild(inn);
    if (suffiks) rad.appendChild(el('span', 'fb-m-suffiks', suffiks));
    rad.felt = inn;
    return rad;
  }

  function velger(etikett, valg, verdi, ved) {
    var rad = el('label', 'fb-m-felt');
    rad.appendChild(el('span', 'fb-m-etikett', etikett));
    var s = document.createElement('select');
    valg.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v[0];
      o.textContent = v[1];
      s.appendChild(o);
    });
    s.value = verdi;
    s.addEventListener('change', function () { ved(s.value); });
    rad.appendChild(s);
    rad.felt = s;
    return rad;
  }

  function bryter(etikett, på, ved) {
    var rad = el('label', 'fb-m-bryter');
    var inn = document.createElement('input');
    inn.type = 'checkbox';
    inn.checked = !!på;
    inn.addEventListener('change', function () { ved(inn.checked); });
    rad.appendChild(inn);
    rad.appendChild(el('span', null, etikett));
    rad.felt = inn;
    return rad;
  }

  function tekstfelt(etikett, verdi, plassholder, ved) {
    var rad = el('label', 'fb-m-felt fb-m-tekst');
    rad.appendChild(el('span', 'fb-m-etikett', etikett));
    var inn = document.createElement('input');
    inn.type = 'text';
    inn.value = verdi || '';
    if (plassholder) inn.placeholder = plassholder;
    inn.addEventListener('input', function () { ved(inn.value); });
    rad.appendChild(inn);
    return rad;
  }

  /**
   * Bygg og vis panelet.
   *
   * opts:
   *   rot         elementet panelet legges i (flyover-overlegget)
   *   manus       gjeldende manus (normaliseres)
   *   ctx         { totalKm, varighet, veipunkter, avstander, midtLat,
   *                 kartBredde, løypenavn, opptakBredde, opptakHøyde }
   *   nåKm()      hvor løperen står nå (km)
   *   nåKamera()  { pitch, zoom, retning, fart } slik kameraet står nå
   *   spolTil(km) spol visningen til en km
   *   påStart()   brukeren trykket «Start opptak»
   *   påForhånd() brukeren trykket «Forhåndsvis»
   *   påLagre(m)  lagre manuset (Promise) — utelates hvis lagring ikke går
   *   påEndret(m) kalles ved hver endring, så flyby kan bruke manuset med en gang
   */
  function åpne(opts) {
    var m = normaliser(opts.manus);
    var ctx = opts.ctx || {};
    var totalKm = Math.max(0.001, ctx.totalKm || 0.001);

    var rot = el('div', 'fb-manus');
    rot.innerHTML =
      '<div class="fb-m-topp">' +
        '<strong>Opptaksmanus</strong>' +
        '<span class="fb-m-loype"></span>' +
        '<button type="button" class="fb-knapp fb-m-lukk" title="Lukk">✕</button>' +
      '</div>' +
      '<div class="fb-m-faner">' +
        '<button type="button" data-f="kamera" class="fb-m-fane aktiv">Kamera</button>' +
        '<button type="button" data-f="punkter" class="fb-m-fane">Sjekkpunkter</button>' +
        '<button type="button" data-f="ende" class="fb-m-fane">Start &amp; slutt</button>' +
        '<button type="button" data-f="video" class="fb-m-fane">Språk &amp; video</button>' +
      '</div>' +
      '<div class="fb-m-kropp"></div>' +
      '<div class="fb-m-bunn">' +
        '<button type="button" class="fb-knapp fb-m-lagre">Lagre manus</button>' +
        '<button type="button" class="fb-knapp fb-m-forhand">▶ Forhåndsvis</button>' +
        '<button type="button" class="fb-knapp fb-primaer fb-m-start">⏺ Start opptak</button>' +
      '</div>' +
      '<p class="fb-m-status"></p>';
    rot.querySelector('.fb-m-loype').textContent = ctx.løypenavn || '';
    (opts.rot || document.body).appendChild(rot);

    var kropp = rot.querySelector('.fb-m-kropp');
    var status = rot.querySelector('.fb-m-status');
    var lagreKnapp = rot.querySelector('.fb-m-lagre');
    if (!opts.påLagre) lagreKnapp.style.display = 'none';

    function endret() {
      if (opts.påEndret) opts.påEndret(m);
    }

    // ---- Fanebytte ----
    var aktivFane = 'kamera';
    var faner = rot.querySelectorAll('.fb-m-fane');
    for (var i = 0; i < faner.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          aktivFane = b.getAttribute('data-f');
          for (var j = 0; j < faner.length; j++) {
            faner[j].classList.toggle('aktiv', faner[j] === b);
          }
          tegnFane();
        });
      })(faner[i]);
    }

    function tegnFane() {
      kropp.innerHTML = '';
      if (aktivFane === 'kamera') tegnKamera();
      else if (aktivFane === 'punkter') tegnPunkter();
      else if (aktivFane === 'ende') tegnEnde();
      else tegnVideo();
      kropp.scrollTop = 0;
    }

    function hjelp(tekst) {
      var p = el('p', 'fb-m-hjelp');
      p.innerHTML = tekst;
      kropp.appendChild(p);
    }

    // ============================================================
    // Fane: Kamera
    // ============================================================

    var valgtKf = 0;

    /** Si fra til kartet hvor kamerapunktene ligger, så de kan vises der. */
    function oppdaterPunktliste() {
      if (!opts.påKamerapunkter) return;
      opts.påKamerapunkter(m.kamera.map(function (k) { return { km: k.km }; }), valgtKf);
    }

    function velgKf(i) {
      valgtKf = klem(i, 0, Math.max(0, m.kamera.length - 1));
      if (aktivFane !== 'kamera') {
        aktivFane = 'kamera';
        for (var j = 0; j < faner.length; j++) {
          faner[j].classList.toggle('aktiv', faner[j].getAttribute('data-f') === 'kamera');
        }
      }
      tegnFane();
      oppdaterPunktliste();
      // Spol dit, så man ser stedet man redigerer
      if (opts.spolTil && m.kamera[valgtKf]) opts.spolTil(m.kamera[valgtKf].km);
      var åpent = kropp.querySelector('.fb-m-kort');
      if (åpent && åpent.scrollIntoView) åpent.scrollIntoView({ block: 'nearest' });
    }

    /** Flytt et kamerapunkt til en ny km (brukes av dragging på kartet). */
    function settKm(idx, km) {
      var k = m.kamera[idx];
      if (!k) return;
      k.km = klem(tall(km, k.km), 0, totalKm);
      m.kamera.sort(function (a, b) { return a.km - b.km; });
      valgtKf = m.kamera.indexOf(k);
      endret();
      tegnFane();
      oppdaterPunktliste();
    }

    function nyttKamerapunkt() {
      var nå = opts.nåKamera ? opts.nåKamera() : {};
      var k = standardKamerapunkt(opts.nåKm ? opts.nåKm() : 0);
      if (nå.pitch != null) k.pitch = klem(nå.pitch, MIN_PITCH, MAKS_PITCH);
      if (nå.zoom != null) k.zoom = klem(nå.zoom, MIN_ZOOM, MAKS_ZOOM);
      if (nå.retning != null) k.retning = Math.round(nå.retning * 10) / 10;
      if (nå.fart != null) k.fart = klem(nå.fart, 0, MAKS_FART);
      m.kamera.push(k);
      m.kamera.sort(function (a, b) { return a.km - b.km; });
      valgtKf = m.kamera.indexOf(k);
      endret();
      tegnFane();
      oppdaterPunktliste();
    }

    function kmTekst(km) {
      return km.toFixed(2).replace('.', ',') + ' km';
    }

    /** Kort oppsummering av et kamerapunkt, til lista. */
    function sammendrag(k) {
      var deler = [Math.round(k.pitch) + '°'];
      deler.push(k.retningModus === 'fast'
        ? kompass(k.retning)
        : (k.retning > 0 ? '+' : '') + Math.round(k.retning) + '°');
      deler.push('z' + k.zoom.toFixed(1).replace('.', ','));
      deler.push(k.fart < 0.02
        ? 'stopp ' + k.stoppSek + ' s' : fartTekst(k.fart));
      return deler.join(' · ');
    }

    function tegnKamera() {
      hjelp('Sett kameraet der du vil ha det, og lagre stillingen som et ' +
        '<b>kamerapunkt</b>. Mellom punktene glir kameraet — og farten — ' +
        'mykt over fra den ene innstillingen til den neste. Punktene vises ' +
        'som nummererte merker på kartet: klikk for å redigere, dra for å ' +
        'flytte. Uten kamerapunkter oppfører flyoveren seg som før.');

      var knapper = el('div', 'fb-m-knapprad');
      var leggTil = el('button', 'fb-knapp fb-primaer',
        '＋ Legg til her, slik kameraet står nå');
      leggTil.type = 'button';
      leggTil.addEventListener('click', nyttKamerapunkt);
      knapper.appendChild(leggTil);
      kropp.appendChild(knapper);

      // Terrenghensynet må stå her, ikke gjemt bort: det er dette som
      // avgjør om en bratt vinkel du har bedt om faktisk blir brukt.
      var tk = el('div', 'fb-m-kort');
      tk.appendChild(el('div', 'fb-m-kort-hode', 'Terrenget og kameravinkelen'));
      tk.appendChild(velger('Når terrenget er i veien', [
        ['sikt', 'Hold løperen synlig — hev kameraet over koller'],
        ['bakke', 'Bare unngå bakken'],
        ['ingen', 'Følg vinkelen nøyaktig'],
      ], m.terreng, function (v) { m.terreng = v; endret(); tegnFane(); }));
      tk.appendChild(el('p', 'fb-m-note', m.terreng === 'ingen'
        ? 'Vinklene dine brukes akkurat som satt. Advarsel: står kameraet '
          + 'lavt i bratt terreng, kan det havne under bakken — da fylles '
          + 'bildet av innsiden av fjellet.'
        : 'Kameraet heves ved å SENKE vinkelen. Ber du om en bratt vinkel '
          + '(mot 80°) i kupert terreng, kan den derfor bli dempet et hakk '
          + 'her. Velg «Følg vinkelen nøyaktig» hvis du vil ha den du satte.'));
      kropp.appendChild(tk);

      if (!m.kamera.length) {
        kropp.appendChild(el('p', 'fb-m-tom',
          'Ingen kamerapunkter ennå — flyoveren styrer kameraet selv.'));
        oppdaterPunktliste();
        return;
      }

      // ---- Tidslinja: hvor punktene ligger i løypa, i ett blikk ----
      var strip = el('div', 'fb-m-strip');
      strip.title = 'Kamerapunktene langs løypa';
      m.kamera.forEach(function (k, i) {
        var pin = el('button', 'fb-m-pin' + (i === valgtKf ? ' valgt' : ''),
          String(i + 1));
        pin.type = 'button';
        pin.title = kmTekst(k.km) + ' — ' + sammendrag(k);
        pin.style.left = (100 * klem(k.km / totalKm, 0, 1)) + '%';
        pin.addEventListener('click', function () { velgKf(i); });
        strip.appendChild(pin);
      });
      kropp.appendChild(strip);

      // ---- Lista, med bare det valgte punktet utfoldet ----
      var liste = el('div', 'fb-m-kfliste');
      m.kamera.forEach(function (k, i) {
        liste.appendChild(kfRad(k, i));
        if (i === valgtKf) liste.appendChild(kamerakort(k, i));
      });
      kropp.appendChild(liste);
      oppdaterPunktliste();
    }

    /** Sammenklappet rad for ett kamerapunkt. */
    function kfRad(k, i) {
      var rad = el('div', 'fb-m-kfrad' + (i === valgtKf ? ' valgt' : ''));
      rad.appendChild(el('span', 'fb-m-nr', String(i + 1)));
      rad.appendChild(el('span', 'fb-m-kfkm', kmTekst(k.km)));
      rad.appendChild(el('span', 'fb-m-kfsum', sammendrag(k)));

      var gå = el('button', 'fb-knapp fb-m-mini', '⇥');
      gå.type = 'button';
      gå.title = 'Spol visningen hit';
      gå.addEventListener('click', function (e) {
        e.stopPropagation();
        if (opts.spolTil) opts.spolTil(k.km);
      });
      rad.appendChild(gå);

      var slett = el('button', 'fb-knapp fb-m-mini fb-m-slett', '✕');
      slett.type = 'button';
      slett.title = 'Fjern kamerapunktet';
      slett.addEventListener('click', function (e) {
        e.stopPropagation();
        m.kamera.splice(i, 1);
        if (valgtKf >= m.kamera.length) valgtKf = Math.max(0, m.kamera.length - 1);
        endret();
        tegnFane();
        oppdaterPunktliste();
      });
      rad.appendChild(slett);

      rad.addEventListener('click', function () { velgKf(i); });
      return rad;
    }

    function kamerakort(k, idx) {
      var kort = el('div', 'fb-m-kort');
      var hode = el('div', 'fb-m-kort-hode');
      hode.appendChild(el('span', 'fb-m-etikett2', 'Ligger på'));

      var kmFelt = document.createElement('input');
      kmFelt.type = 'number';
      kmFelt.className = 'fb-m-km';
      kmFelt.min = '0'; kmFelt.max = String(totalKm.toFixed(2)); kmFelt.step = '0.01';
      kmFelt.value = k.km.toFixed(2);
      kmFelt.title = 'Hvor i løypa punktet ligger (km fra start)';
      kmFelt.addEventListener('change', function () {
        settKm(idx, tall(kmFelt.value, k.km));
      });
      hode.appendChild(kmFelt);
      hode.appendChild(el('span', 'fb-m-enhet', 'km'));

      var her = el('button', 'fb-knapp fb-m-mini', '◎');
      her.type = 'button';
      her.title = 'Flytt punktet dit løperen står nå';
      her.addEventListener('click', function () {
        settKm(idx, opts.nåKm ? opts.nåKm() : k.km);
      });
      hode.appendChild(her);

      var hent = el('button', 'fb-knapp fb-m-mini', '⤓');
      hent.type = 'button';
      hent.title = 'Hent vinkel, retning og zoom fra kameraet slik det står nå';
      hent.addEventListener('click', function () {
        var nå = opts.nåKamera ? opts.nåKamera() : {};
        if (nå.pitch != null) k.pitch = klem(nå.pitch, MIN_PITCH, MAKS_PITCH);
        if (nå.zoom != null) k.zoom = klem(nå.zoom, MIN_ZOOM, MAKS_ZOOM);
        if (nå.retning != null && k.retningModus === 'loype') {
          k.retning = Math.round(nå.retning * 10) / 10;
        } else if (nå.kurs != null && k.retningModus === 'fast') {
          k.retning = Math.round(nå.kurs);
        }
        endret();
        tegnFane();
      });
      hode.appendChild(hent);
      kort.appendChild(hode);

      kort.appendChild(skyver('Vinkel over horisonten', MIN_PITCH, MAKS_PITCH, 1, k.pitch,
        function (v) { return Math.round(v) + '°'; },
        function (v) { k.pitch = v; endret(); }));

      kort.appendChild(velger('Retning', [
        ['loype', 'Følg løypa'],
        ['fast', 'Fast himmelretning'],
      ], k.retningModus, function (v) {
        k.retningModus = v;
        // Ny modus, ny betydning av tallet. Fast himmelretning starter på
        // den kursen kameraet faktisk peker nå, så man har noe å justere
        // fra; «følg løypa» starter rett fram.
        var nå = opts.nåKamera ? opts.nåKamera() : {};
        k.retning = (v === 'fast' && nå.kurs != null) ? Math.round(nå.kurs) : 0;
        endret();
        tegnFane();
      }));

      if (k.retningModus === 'fast') {
        kort.appendChild(skyver('Himmelretning', 0, 359, 1, ((k.retning % 360) + 360) % 360,
          function (v) { return Math.round(v) + '° ' + kompass(v); },
          function (v) { k.retning = v; endret(); }));
      } else {
        kort.appendChild(skyver('Dreid fra løyperetningen', -180, 180, 1, k.retning,
          function (v) {
            return (v > 0 ? '+' : '') + Math.round(v) + '°' +
              (Math.abs(v) < 1 ? ' (rett fram)' : '');
          },
          function (v) { k.retning = v; endret(); }));
      }

      kort.appendChild(skyver('Zoom', MIN_ZOOM, MAKS_ZOOM, 0.1, k.zoom,
        function (v) { return zoomTekst(v, ctx.midtLat, ctx.kartBredde); },
        function (v) { k.zoom = v; endret(); }));

      var fartRad = skyver('Fart langs løypa', 0, MAKS_FART, 0.1, k.fart,
        function (v) { return fartTekst(v); },
        function (v) {
          var var0 = k.fart < 0.02, nå0 = v < 0.02;
          k.fart = v;
          endret();
          if (var0 !== nå0) tegnFane();       // stoppfeltet skal av/på
        });
      kort.appendChild(fartRad);

      if (k.fart < 0.02) {
        var stoppRad = tallfelt('Stå stille i', 0.5, 120, 0.5, k.stoppSek, 'sek',
          function (v) { k.stoppSek = v; endret(); });
        stoppRad.classList.add('fb-m-inn');
        kort.appendChild(stoppRad);
        var note = el('p', 'fb-m-note',
          'Farten går mykt ned mot null på vei inn hit. Etter oppholdet ' +
          'setter turen i gang igjen mot neste kamerapunkt.');
        kort.appendChild(note);
      }

      // ---- Overgangen inn til dette punktet ----
      if (idx > 0 || k.km > 0.0001) {
        var skille = el('div', 'fb-m-skille', 'Overgang inn hit');
        kort.appendChild(skille);

        kort.appendChild(velger('Lengde måles i', [
          ['rel', 'Rolighet (andel av strekket)'],
          ['sek', 'Sekunder'],
          ['km', 'Kilometer'],
        ], k.lengdeModus, function (v) { k.lengdeModus = v; endret(); tegnFane(); }));

        if (k.lengdeModus === 'rel') {
          kort.appendChild(velger('Rolighet', Object.keys(REL).map(function (n) {
            return [n, REL_NAVN[n]];
          }), k.lengdeRel, function (v) { k.lengdeRel = v; endret(); }));
        } else if (k.lengdeModus === 'sek') {
          kort.appendChild(tallfelt('Varer i', 0, 120, 0.5, k.lengdeSek, 'sek',
            function (v) { k.lengdeSek = v; endret(); }));
        } else {
          kort.appendChild(tallfelt('Varer i', 0, totalKm, 0.05, k.lengdeKm, 'km',
            function (v) { k.lengdeKm = v; endret(); }));
        }

        kort.appendChild(velger('Skjer', [
          ['for', 'Før punktet (ferdig når vi er der)'],
          ['midt', 'Halvparten før, halvparten etter'],
          ['etter', 'Starter i punktet'],
        ], k.plassering, function (v) { k.plassering = v; endret(); tegnFane(); }));

        // Hva innstillingene FAKTISK ble til. Uten dette er det umulig å se
        // at en overgang har blitt klippet ned fordi naboen ligger tett på.
        kort.appendChild(el('p', 'fb-m-overgang', overgangTekst(idx)));
      }

      return kort;
    }

    /** Beskriv overgangen slik den faktisk ble, etter klipping mot naboene. */
    function overgangTekst(idx) {
      var v;
      try {
        v = kompiler(m, { totalKm: totalKm, varighet: ctx.varighet || 120 })
          .overgang(idx);
      } catch (e) { v = null; }
      if (!v) return '';
      var fra = v.fraStandard
        ? ' Den går ut fra flyoverens standardstilling — legg til et ' +
          'kamerapunkt på 0 km hvis du vil bestemme den også.'
        : '';
      if (v.lengde < 0.005) {
        return 'Blir et rent klipp ved ' + kmTekst(v.km) +
          ' — det er ikke plass til en overgang her. Flytt punktet, eller ' +
          'gi naboen en kortere overgang.';
      }
      var hvor = 'Går fra ' + kmTekst(v.a) + ' til ' + kmTekst(v.b) + ' — ' +
        v.lengde.toFixed(2).replace('.', ',') + ' km';
      if (v.brems) {
        return hvor + '. Kameraet glir over, og farten bremses jevnt ned ' +
          'mot stoppet på dette strekket.' + fra;
      }
      return hvor + ', omtrent ' + Math.max(1, Math.round(v.sek)) +
        ' sekunder video. Både kameraet og farten glir over på dette ' +
        'strekket.' + fra;
    }

    // ============================================================
    // Fane: Sjekkpunkter
    // ============================================================

    // Bare ett sjekkpunkt utvidet av gangen — samme mønster som kamerapunktene
    // (indeks i ctx.veipunkter, eller null når alle står kollapset).
    var valgtSjekkpunkt = null;

    function tegnPunkter() {
      hjelp('For hvert punkt kan du velge om markøren skal vises på vei inn, ' +
        'om kameraet skal ta en runde rundt punktet, og om vi skal stoppe og ' +
        'vise detaljkortet. Punkter du skjuler teller heller ikke som ' +
        '«neste punkt» — da hoppes de rett og slett over. Klikk et punkt for ' +
        'å åpne innstillingene.');

      var wp = ctx.veipunkter || [];
      if (!wp.length) {
        kropp.appendChild(el('p', 'fb-m-tom', 'Løypa har ingen interessepunkter.'));
        return;
      }
      wp.forEach(function (w, i) {
        var rad = sjekkpunktRad(w, i);
        kropp.appendChild(rad);
        if (i === valgtSjekkpunkt) {
          // Toggle-bryterne i kortet endrer sammendraget på raden over —
          // uten denne kroken ville raden stått igjen med utdatert tekst
          // til man lukker og åpner igjen (bare tegnFane() bygger den på nytt).
          kropp.appendChild(punktkort(w, function () {
            var sum = rad.querySelector('.fb-m-kfsum');
            if (sum) sum.textContent = sjekkpunktSammendrag(innstillingFor(w));
          }));
        }
      });
    }

    function velgSjekkpunkt(i) {
      // Klikk på det som alt er åpent lukker det igjen
      valgtSjekkpunkt = (valgtSjekkpunkt === i) ? null : i;
      tegnFane();
    }

    function innstillingFor(w) {
      var n = nøkkelFor(w);
      if (!m.sjekkpunkter[n]) {
        m.sjekkpunkter[n] = standardSjekkpunkt(ctx.orbitStandard);
      }
      return m.sjekkpunkter[n];
    }

    /** Kort oppsummering av et sjekkpunkts innstillinger, til den kollapsede raden. */
    function sjekkpunktSammendrag(d) {
      var deler = [];
      if (!d.vis) deler.push('Skjult');
      if (d.orbit) deler.push('360°');
      if (d.kort) deler.push('Kort ' + d.kortSek + ' s');
      return deler.length ? deler.join(' · ') : 'Standard';
    }

    /** Sammenklappet rad for ett sjekkpunkt — klikk for å utvide/lukke. */
    function sjekkpunktRad(w, i) {
      var d = innstillingFor(w);
      var rad = el('div', 'fb-m-kfrad' + (i === valgtSjekkpunkt ? ' valgt' : ''));
      var sym = el('span', 'fb-m-cp-sym');
      if (typeof wptTyper === 'function' && typeof symbolGlyphHtml === 'function') {
        sym.innerHTML = wptTyper(w).map(function (tp) {
          return symbolGlyphHtml(tp, 15);
        }).join(' ');
      }
      rad.appendChild(sym);
      rad.appendChild(el('span', 'fb-m-cp-navn', w.name || '(uten navn)'));
      var km = (ctx.avstander && w.idx != null) ? ctx.avstander[w.idx] : null;
      rad.appendChild(el('span', 'fb-m-cp-km',
        km == null ? '' : km.toFixed(2).replace('.', ',') + ' km'));
      rad.appendChild(el('span', 'fb-m-kfsum', sjekkpunktSammendrag(d)));
      rad.addEventListener('click', function () { velgSjekkpunkt(i); });
      return rad;
    }

    function punktkort(w, oppdaterRad) {
      var d = innstillingFor(w);
      var kort = el('div', 'fb-m-kort');

      var visRad = bryter('Vis markøren på kartet', d.vis, function (v) {
        d.vis = v; endret(); byggVisDel(); oppdaterRad();
      });
      kort.appendChild(visRad);

      var visDel = el('div', 'fb-m-inn');
      kort.appendChild(visDel);
      function byggVisDel() {
        visDel.innerHTML = '';
        visDel.style.display = d.vis ? '' : 'none';
        if (!d.vis) return;
        visDel.appendChild(tallfelt('Dukker opp', 0.2, 60, 0.5, d.visKm, 'km før',
          function (v) {
            d.visKm = v;
            if (d.fullKm > v) d.fullKm = v;
            endret(); byggVisDel();
          }));
        visDel.appendChild(tallfelt('Helt tydelig', 0, d.visKm, 0.5, d.fullKm, 'km før',
          function (v) { d.fullKm = Math.min(v, d.visKm); endret(); }));
        visDel.appendChild(el('p', 'fb-m-note',
          'Mellom de to avstandene tones markøren gradvis inn.'));
      }
      byggVisDel();

      var orbitRad = bryter('Ta en 360 rundt punktet', d.orbit, function (v) {
        d.orbit = v; endret(); byggOrbitDel(); oppdaterRad();
      });
      kort.appendChild(orbitRad);
      var orbitDel = el('div', 'fb-m-inn');
      kort.appendChild(orbitDel);
      function byggOrbitDel() {
        orbitDel.innerHTML = '';
        orbitDel.style.display = d.orbit ? '' : 'none';
        if (!d.orbit) return;
        orbitDel.appendChild(skyver('Kameravinkel under runden',
          MIN_PITCH, MAKS_PITCH, 1, d.orbitPitch,
          function (v) { return Math.round(v) + '°'; },
          function (v) { d.orbitPitch = v; endret(); }));
        orbitDel.appendChild(tallfelt('Rundetid', 2, 60, 0.5, d.orbitSek, 'sek',
          function (v) { d.orbitSek = v; endret(); }));
      }
      byggOrbitDel();

      var kortRad = bryter('Stopp og vis detaljkortet', d.kort, function (v) {
        d.kort = v; endret(); byggKortDel(); oppdaterRad();
      });
      kort.appendChild(kortRad);
      var kortDel = el('div', 'fb-m-inn');
      kort.appendChild(kortDel);
      function byggKortDel() {
        kortDel.innerHTML = '';
        kortDel.style.display = d.kort ? '' : 'none';
        if (!d.kort) return;
        kortDel.appendChild(tallfelt('Vises i', 1, 15, 0.5, d.kortSek, 'sek',
          function (v) { d.kortSek = v; endret(); oppdaterRad(); }));
      }
      byggKortDel();

      return kort;
    }

    // ============================================================
    // Fane: Start og slutt
    // ============================================================

    function tegnEnde() {
      hjelp('Plakat, ventetid og oversiktsbilde er uavhengige av hverandre. ' +
        'Står plakaten lenger enn ventetiden, ruller løypa i gang mens ' +
        'plakaten fortsatt ligger over bildet.');
      kropp.appendChild(endekort('start', 'Start'));
      kropp.appendChild(endekort('slutt', 'Slutt'));
    }

    function endekort(felt, tittel) {
      var d = m[felt];
      var kort = el('div', 'fb-m-kort');
      kort.appendChild(el('div', 'fb-m-kort-hode', tittel));

      kort.appendChild(bryter('Vis plakat', d.splash, function (v) {
        d.splash = v;
        // Løypenavnet er nesten alltid tittelen man vil ha. Fyll det inn
        // første gang plakaten slås på, så står det klart til å redigeres
        // i stedet for å måtte skrives fra bunnen.
        if (v && !d.tittel.no) d.tittel.no = ctx.løypenavn || '';
        endret(); byggSplash();
      }));
      var splashDel = el('div', 'fb-m-inn');
      kort.appendChild(splashDel);
      function byggSplash() {
        splashDel.innerHTML = '';
        splashDel.style.display = d.splash ? '' : 'none';
        if (!d.splash) return;
        if (felt === 'slutt') {
          var kopi = el('button', 'fb-knapp fb-m-kopi', '⧉ Kopier plakaten fra start');
          kopi.type = 'button';
          kopi.title = 'Hent tittel, undertekst og varighet fra startplakaten ' +
            '— du kan redigere dem etterpå';
          kopi.addEventListener('click', function () {
            var s = m.start;
            d.tittel = { no: s.tittel.no, en: s.tittel.en };
            d.undertekst = { no: s.undertekst.no, en: s.undertekst.en };
            d.splashSek = s.splashSek;
            endret();
            tegnFane();
          });
          splashDel.appendChild(kopi);
        }
        splashDel.appendChild(tekstfelt('Tittel', d.tittel.no, ctx.løypenavn || 'Løypenavn',
          function (v) { d.tittel.no = v; endret(); }));
        splashDel.appendChild(tekstfelt('Undertekst', d.undertekst.no,
          'F.eks. «Neste løp: 7. august 2027 · mmctrail.no»',
          function (v) { d.undertekst.no = v; endret(); }));
        if (m.sprak.indexOf('en') >= 0) {
          splashDel.appendChild(tekstfelt('Tittel (engelsk)', d.tittel.en,
            'Tom = samme som norsk', function (v) { d.tittel.en = v; endret(); }));
          splashDel.appendChild(tekstfelt('Undertekst (engelsk)', d.undertekst.en,
            'Tom = samme som norsk', function (v) { d.undertekst.en = v; endret(); }));
        }
        splashDel.appendChild(tallfelt('Står i', 1, 60, 0.5, d.splashSek, 'sek',
          function (v) { d.splashSek = v; endret(); }));
        splashDel.appendChild(el('p', 'fb-m-note',
          'Lengde og høydemeter hentes fra løypa og legges på plakaten ' +
          'automatisk.'));
      }
      byggSplash();

      kort.appendChild(tallfelt(
        felt === 'start' ? 'Vent før løypa starter' : 'Vent etter mål',
        0, 60, 0.5, d.forsinkelse, 'sek',
        function (v) { d.forsinkelse = v; endret(); }));

      kort.appendChild(bryter('Vis hele løypa fra oversikt', d.oversikt, function (v) {
        d.oversikt = v; endret(); byggOversikt();
      }));
      var oversiktDel = el('div', 'fb-m-inn');
      kort.appendChild(oversiktDel);
      function byggOversikt() {
        oversiktDel.innerHTML = '';
        oversiktDel.style.display = d.oversikt ? '' : 'none';
        if (!d.oversikt) return;
        oversiktDel.appendChild(tallfelt('Varer i', 2, 60, 0.5, d.oversiktSek, 'sek',
          function (v) { d.oversiktSek = v; endret(); }));
        oversiktDel.appendChild(el('p', 'fb-m-note', felt === 'start'
          ? 'Kameraet starter i oversiktsbildet og glir ned til løypa.'
          : 'Kameraet trekker seg ut til oversiktsbildet etter mål.'));
      }
      byggOversikt();

      return kort;
    }

    // ============================================================
    // Fane: Video
    // ============================================================

    function tegnVideo() {
      // Språkvalget står FØRST: det avgjør hvor mange videoer opptaket gir,
      // og det er lett å overse hvis det ligger nederst under oppløsning.
      var sk = el('div', 'fb-m-kort');
      sk.appendChild(el('div', 'fb-m-kort-hode', '🌐 Språk i videoen'));
      sk.appendChild(el('p', 'fb-m-note',
        'Velg ett eller begge. Med begge spilles de inn i samme runde — ' +
        'kartet tegnes bare én gang, og teksten legges på i hvert sitt ' +
        'språk. Du får da to videoer i biblioteket, én per språk.'));
      [['no', 'Norsk'], ['en', 'Engelsk']].forEach(function (par) {
        var på = m.sprak.indexOf(par[0]) >= 0;
        sk.appendChild(bryter(par[1], på, function (v) {
          var idx = m.sprak.indexOf(par[0]);
          if (v && idx < 0) m.sprak.push(par[0]);
          if (!v && idx >= 0 && m.sprak.length > 1) m.sprak.splice(idx, 1);
          m.sprak.sort();
          endret();
          tegnFane();
        }));
      });
      if (m.sprak.indexOf('en') >= 0) {
        sk.appendChild(el('p', 'fb-m-note',
          'Engelsk tekst hentes fra oversettelsene du har lagt inn på ' +
          'punktene i løypa, og fra de engelske feltene under «Start & ' +
          'slutt». Mangler en oversettelse, brukes den norske teksten. ' +
          'Faste ord — Distanse, Høyde, Neste, Mål — oversettes av seg selv.'));
      }
      kropp.appendChild(sk);

      hjelp('Oppløsningen på videoen følger størrelsen på kartflaten her og ' +
        'nå. Vil du ha 1080p, må vinduet være minst 1920 piksler bredt når ' +
        'du starter opptaket.');

      var kort = el('div', 'fb-m-kort');
      kort.appendChild(el('div', 'fb-m-kort-hode', 'Oppløsning'));

      var b = ctx.opptakBredde || 0, h = ctx.opptakHøyde || 0;
      var måling = el('p', 'fb-m-maaling',
        'Kartflaten er nå ' + b + ' × ' + h + ' piksler.');
      kort.appendChild(måling);
      if (b < 1920) {
        var vars = el('p', 'fb-m-varsel',
          '⚠ Mindre enn 1920 px bredt. Gjør vinduet større (eller full skjerm ' +
          'med F11) før du starter opptaket — videoen kan ikke bli skarpere ' +
          'enn kartflaten er nå.');
        kort.appendChild(vars);
      } else {
        kort.appendChild(el('p', 'fb-m-ok', '✓ Stort nok for full HD.'));
      }

      kort.appendChild(velger('Maks bredde på hovedfila', [
        ['1920', '1920 px (full HD)'],
        ['1440', '1440 px'],
        ['1280', '1280 px (HD)'],
        ['960', '960 px'],
      ], String(m.maksBredde), function (v) { m.maksBredde = Number(v); endret(); }));

      kort.appendChild(bryter('Lag også en lettere nettversjon', m.nettversjon,
        function (v) { m.nettversjon = v; endret(); tegnFane(); }));
      if (m.nettversjon) {
        var nd = el('div', 'fb-m-inn');
        nd.appendChild(velger('Bredde på nettversjonen', [
          ['1280', '1280 px'],
          ['960', '960 px'],
          ['854', '854 px'],
          ['640', '640 px'],
        ], String(m.nettBredde), function (v) { m.nettBredde = Number(v); endret(); }));
        nd.appendChild(el('p', 'fb-m-note',
          'Begge lages i samme opptak — kartet tegnes bare én gang, så det ' +
          'koster lite ekstra tid. Ved publisering laster små skjermer og ' +
          'innbygde rammer ned den lette fila i stedet for hovedfila.'));
        kort.appendChild(nd);
      }
      kropp.appendChild(kort);

      var antall = m.sprak.length * (m.nettversjon ? 2 : 1);
      var linjer = ['Dette opptaket gir ' + antall + ' videofil' +
        (antall === 1 ? '' : 'er') + '.'];
      // Hvor stor fila blir er det spørsmålet folk faktisk har. Vi kan
      // ikke vite lengden på forhånd, men MB per minutt er et tall man
      // kan regne med — og som gjør nytten av nettversjonen tydelig.
      linjer.push('Hovedfila: ' + mbPerMinutt(m.maksBredde) + ' per minutt video.');
      if (m.nettversjon) {
        linjer.push('Nettversjonen: ' + mbPerMinutt(m.nettBredde) + ' per minutt.');
      }
      kropp.appendChild(el('p', 'fb-m-note', linjer.join(' ')));
    }

    /** Omtrent hvor mye ett minutt video veier ved en gitt bredde. */
    function mbPerMinutt(maksBredde) {
      if (typeof KULOpptak === 'undefined' || !KULOpptak.målFor) return '?';
      var mål = KULOpptak.målFor(
        { b: ctx.opptakBredde || 1920, h: ctx.opptakHøyde || 1080 }, maksBredde);
      var bit = KULOpptak.bitrateFor(mål.bredde, mål.høyde);
      var mb = (bit * 60) / 8 / (1024 * 1024);
      return mål.bredde + '×' + mål.høyde + ', ≈ ' + Math.round(mb) + ' MB';
    }

    // ============================================================
    // Bunnknapper
    // ============================================================

    rot.querySelector('.fb-m-lukk').addEventListener('click', function () { lukk(); });

    lagreKnapp.addEventListener('click', function () {
      if (!opts.påLagre) return;
      lagreKnapp.disabled = true;
      status.textContent = 'Lagrer …';
      Promise.resolve(opts.påLagre(m))
        .then(function () { status.textContent = 'Manuset er lagret.'; })
        .catch(function (f) { status.textContent = 'Klarte ikke å lagre: ' + (f.message || f); })
        .then(function () { lagreKnapp.disabled = false; });
    });

    var forhandKnapp = rot.querySelector('.fb-m-forhand');
    forhandKnapp.addEventListener('click', function () {
      if (opts.påForhånd) opts.påForhånd(m);
    });

    rot.querySelector('.fb-m-start').addEventListener('click', function () {
      if (opts.påStart) opts.påStart(m);
    });

    function lukk() {
      rot.remove();
      if (opts.påKamerapunkter) opts.påKamerapunkter([], -1);
      if (opts.påLukk) opts.påLukk();
    }

    tegnFane();

    return {
      manus: m,
      lukk: lukk,
      el: rot,
      /** Oppdater målingen i video-fanen (vinduet kan ha endret seg). */
      frisk: function (nyCtx) {
        Object.assign(ctx, nyCtx || {});
        if (aktivFane === 'video') tegnFane();
      },
      status: function (tekst) { status.textContent = tekst || ''; },
      /** Velg et kamerapunkt — brukes når man klikker merket på kartet. */
      velg: velgKf,
      /** Flytt et kamerapunkt — brukes når merket dras på kartet. */
      settKm: settKm,
      /** Bytt forhåndsvisningsknappen mellom «start» og «stopp». */
      forhåndPå: function (på) {
        forhandKnapp.textContent = på ? '⏹ Stopp forhåndsvisning' : '▶ Forhåndsvis';
      },
    };
  }

  return {
    standard: standard,
    normaliser: normaliser,
    kompiler: kompiler,
    nøkkelFor: nøkkelFor,
    zoomTekst: zoomTekst,
    åpne: åpne,
    MIN_ZOOM: MIN_ZOOM,
    MAKS_ZOOM: MAKS_ZOOM,
  };
})();
