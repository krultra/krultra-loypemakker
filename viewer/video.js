/* ============================================================
   Publisert flyover-video — logikk.

   Leser opplysningene som ble bakt inn i index.html ved publisering
   (<script type="application/json" id="video-data">) og setter opp
   siden: tittel, beskrivelse, selve videoen, språkvelger og en
   fullskjermknapp når visningen er bygd inn i en annen side.

   Ingen nettverkskall — alt som trengs ligger allerede i sida, og
   videofila hentes av <video>-elementet selv.
   ============================================================ */
'use strict';

// ---- Faste GUI-strenger, samme mønster som løypevisningen ----
var TEKST = {
  no: {
    fullskjerm: '⛶ Full skjerm',
    fullskjermTittel: 'Åpne videoen i egen fane i full størrelse',
    seLoypekart: '🗺️ Se løypekartet',
    publisertAv: 'Laget og publisert av',
    oppdatert: 'Oppdatert',
    kartKilde: 'Kart',
    ingenStotte: 'Nettleseren din kan ikke spille av denne videoen.',
    lastNed: 'Last ned videoen',
    tittelFall: 'Flyover',
  },
  en: {
    fullskjerm: '⛶ Full screen',
    fullskjermTittel: 'Open the video in its own tab at full size',
    seLoypekart: '🗺️ View the course map',
    publisertAv: 'Created and published by',
    oppdatert: 'Updated',
    kartKilde: 'Map',
    ingenStotte: 'Your browser cannot play this video.',
    lastNed: 'Download the video',
    tittelFall: 'Flyover',
  },
};

var data = {};
try {
  data = JSON.parse(document.getElementById('video-data').textContent) || {};
} catch (e) { data = {}; }

var lang = 'no';

/** Hvilket språk er valgt: ?lang= (validert) → standard_sprak → 'no'. */
function velgSprak() {
  var url = new URLSearchParams(location.search).get('lang');
  var kandidat = String(url || data.standard_sprak || 'no').toLowerCase();
  lang = TEKST[kandidat] ? kandidat : 'no';
  document.documentElement.lang = lang === 'en' ? 'en' : 'nb';
}

function t(nokkel) { return (TEKST[lang] && TEKST[lang][nokkel]) || TEKST.no[nokkel]; }

/** Lokaliser et innholdsfelt: data.oversettelser[lang][felt], ellers kildefeltet. */
function lok(felt) {
  var o = data.oversettelser && data.oversettelser[lang];
  if (o && o[felt] != null && o[felt] !== '') return o[felt];
  return data[felt];
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/** Godta bare http(s)-lenker; alt annet (javascript:, data: …) forkastes. */
function tryggUrl(u) {
  if (!u) return null;
  try {
    var url = new URL(u, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (e) { /* ugyldig URL */ }
  return null;
}

velgSprak();

// ---- Tittel og beskrivelse ----
var navn = lok('navn') || t('tittelFall');
document.title = navn;
document.getElementById('tittel').textContent = navn;
var beskr = lok('beskrivelse');
var beskrEl = document.getElementById('beskrivelse');
if (beskr) beskrEl.textContent = beskr; else beskrEl.remove();

/**
 * Velg hvilken oppløsning som skal hentes.
 *
 * En vanlig MP4 tilpasser seg IKKE avspilleren: er fila 1080p, lastes
 * hele 1080p-fila ned selv om videoen vises i en liten iframe på en
 * mobil. Ved publisering legges derfor flere utgaver av samme opptak ut,
 * og her velges den minste som er stor nok for skjermen — regnet i
 * FAKTISKE piksler (CSS-bredde × pikselforhold), for det er dét som
 * avgjør om bildet ser skarpt ut.
 *
 * Valget tas før src settes, så det blir aldri to nedlastinger.
 */
function velgVariant() {
  var liste = Array.isArray(data.varianter) ? data.varianter.slice() : [];
  if (!liste.length) {
    return { fil: data.fil, mime: data.mime, bredde: data.bredde, hoyde: data.hoyde };
  }
  liste.sort(function (a, b) { return (a.bredde || 0) - (b.bredde || 0); });
  var behov = Math.round(
    (window.innerWidth || 1280) * (window.devicePixelRatio || 1));
  for (var i = 0; i < liste.length; i++) {
    // 10 % slingringsmonn: en 1280-fil på en 1366 px bred flate ser fin
    // ut, og er langt billigere enn å hente 1920.
    if ((liste[i].bredde || 0) >= behov * 0.9) return liste[i];
  }
  return liste[liste.length - 1];
}

// ---- Selve videoen ----
var spiller = document.getElementById('spiller');
var valgt = velgVariant();
spiller.src = valgt.fil || data.fil || '';
if (valgt.mime || data.mime) spiller.setAttribute('type', valgt.mime || data.mime);
// Sideforholdet tas fra HOVEDvarianten: alle utgavene har samme
// sideforhold, og da står plassen riktig uansett hvilken som ble valgt.
if (data.bredde && data.hoyde) {
  // Riktig sideforhold fra første stund, så sida ikke hopper når
  // videoen er ferdig lastet
  spiller.setAttribute('width', data.bredde);
  spiller.setAttribute('height', data.hoyde);
  spiller.style.aspectRatio = data.bredde + ' / ' + data.hoyde;
}
spiller.appendChild(document.createTextNode(t('ingenStotte')));

// ---- Språkvelger (NO/EN) ----
(function byggSpraakvelger() {
  var knapper = document.getElementById('topp-knapper');
  if (!knapper) return;
  var velger = document.createElement('div');
  velger.className = 'sprakvelger';
  ['no', 'en'].forEach(function (kode) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sprakvelger-knapp' + (kode === lang ? ' aktiv' : '');
    b.textContent = kode.toUpperCase();
    b.addEventListener('click', function () {
      if (kode === lang) return;
      var url = new URL(location.href);
      url.searchParams.set('lang', kode);
      location.href = url.href;
    });
    velger.appendChild(b);
  });
  knapper.insertBefore(velger, knapper.firstChild);
})();

// ---- «Full skjerm»: bare når videoen er bygd inn i en annen side ----
if (window.self !== window.top) {
  var fs = document.getElementById('fullskjerm-knapp');
  fs.textContent = t('fullskjerm');
  fs.title = t('fullskjermTittel');
  fs.classList.remove('skjult');
  fs.addEventListener('click', function () {
    window.open(window.location.href, '_blank', 'noopener');
  });
}

// ---- Bunntekst: dato, lenke tilbake til løypekartet, kreditering ----
(function byggBunn() {
  var generert = data.generert ? new Date(data.generert) : null;
  var locale = lang === 'en' ? 'en-GB' : 'nb-NO';
  var deler = [];
  if (generert) {
    deler.push(t('oppdatert') + ' ' + generert.toLocaleDateString(locale));
  }
  // Lenke tilbake til løypa videoen hører til. Adressen er alltid ett
  // nivå opp (videoen ligger i <løype>/<video>/), så den er trygg.
  if (data.loype_url) {
    var mål = data.loype_url;
    var eksplisitt = new URLSearchParams(location.search).get('lang');
    if (eksplisitt) mål += '?lang=' + encodeURIComponent(lang);
    deler.push('<a href="' + escHtml(mål) + '">' + escHtml(t('seLoypekart')) + '</a>');
  }
  deler.push(t('kartKilde') + ': © <a href="https://www.kartverket.no/" ' +
    'target="_blank" rel="noopener">Kartverket</a>');
  deler.push(t('publisertAv') + ' <a href="https://krultra.no" ' +
    'target="_blank" rel="noopener">KrUltra</a>');
  var lenke = tryggUrl(data.link);
  if (lenke) {
    deler.push('<a href="' + escHtml(lenke) + '" target="_blank" rel="noopener">' +
      escHtml(lok('navn') || navn) + '</a>');
  }
  document.getElementById('bunn').innerHTML = deler.join(' · ');
})();
