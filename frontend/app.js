/* ============================================================
   KrUltra Løypemakker (KUL) — all frontend-logikk

   Grovt kart over fila:
     1. Hjelpefunksjoner (API-kall, toast, metadata-dialog, avstand)
     2. Kartet, kartfliser fra Kartverket, og tegning av spor
     3. Høydeprofilen (canvas-tegning med egne kontroller)
     4. Segmentbiblioteket (venstre kolonne)
     5. Redigeringsvisningen (last spor, velg start/slutt, lagre)
     6. Sammenslåingsvisningen (to segmenter, delingspunkter, merge)
     7. Fanebytte og oppstart

   All "sannhet" ligger i vanlige JS-variabler (editorState,
   mergeState, profilState). Kartet, profilen og kontrollene er
   bare visninger av dem.
   ============================================================ */
'use strict';

// Verktøyets versjon — vises i topplinja, følger semantisk versjonering
// (MAJOR.MINOR.PATCH, se CHANGELOG.md) og oppdateres i git-tag ved
// hver GitHub-release. Helt uavhengig av BACKEND_VERSJON/FORVENTET_BACKEND
// under, som bare er en intern teller for å oppdage utdatert server.
const APP_VERSJON = '3.2.0';

// ---------- Farger (speiler variablene i style.css) ----------
const FARGE_A = '#2563eb';        // segment A / vanlig spor
const FARGE_B = '#dc2626';        // segment B
const FARGE_UTSNITT = '#16a34a';  // valgt utsnitt / startmerke
const FARGE_SAMMENSLAATT = '#7c3aed';

// ============================================================
// 1. Hjelpefunksjoner
// ============================================================

/** Kall API-et og kast en forståelig feil hvis noe går galt. */
async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detalj = 'Ukjent feil (' + res.status + ')';
    try { detalj = (await res.json()).detail || detalj; } catch (e) { /* ikke JSON */ }
    throw new Error(detalj);
  }
  return res;
}

/** Vis en kort beskjed nede i hjørnet. type: 'success' eller 'error'. */
let toastTimer = null;
function toast(melding, type) {
  const el = document.getElementById('toast');
  el.textContent = melding;
  el.className = 'toast ' + (type || 'success');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, type === 'error' ? 6000 : 3000);
}

/**
 * Sist brukte metadata (creator, lenke, copyright, nøkkelord, starttid) —
 * huskes i nettleseren og foreslås når et spor mangler egne verdier,
 * så faste opplysninger slipper å skrives inn på nytt for hver løype.
 */
function hentSisteMeta() {
  return {
    creator: localStorage.getItem('gps-tool.meta.creator') || '',
    link: localStorage.getItem('gps-tool.meta.link') || '',
    copyright: localStorage.getItem('gps-tool.meta.copyright') || '',
    nøkkelord: localStorage.getItem('gps-tool.meta.nokkelord') || '',
    starttid: localStorage.getItem('gps-tool.meta.starttid') || '',
  };
}

function huskSisteMeta(meta) {
  const felt = {
    creator: meta.creator, link: meta.link, copyright: meta.copyright,
    nokkelord: meta.nøkkelord, starttid: meta.starttid,
  };
  for (const [navn, verdi] of Object.entries(felt)) {
    if (verdi) localStorage.setItem('gps-tool.meta.' + navn, verdi);
  }
}

/**
 * Spør brukeren om metadata (navn, beskrivelse, creator, lenke) via dialogen.
 * `forslag` forhåndsutfylles — slik arves metadata: det som ble lest inn,
 * følger med videre til lagring, men kan alltid redigeres. Felt sporet
 * mangler verdi for, foreslås fra sist brukte verdier (hentSisteMeta).
 * `medStarttid` = true viser i tillegg starttidspunkt-feltet (kun for
 * GPX-eksport, der tidsstempler faktisk betyr noe).
 * `medAdresse` = true viser adressenavn-feltet (for «Send til KrUltra»,
 * der løypa skal publiseres på en bestemt nettadresse).
 * Returnerer {navn, beskrivelse, creator, link, copyright, nøkkelord,
 * starttid, adressenavn} — eller null ved avbryt.
 */
async function spørOmMeta(tittel, forslag, medStarttid, medAdresse) {
  const dialog = document.getElementById('meta-dialog');
  const navnFelt = document.getElementById('meta-name');
  const beskrFelt = document.getElementById('meta-desc');
  const creatorFelt = document.getElementById('meta-creator');
  const linkFelt = document.getElementById('meta-link');
  const copyrightFelt = document.getElementById('meta-copyright');
  const nøkkelordFelt = document.getElementById('meta-keywords');
  const startFelt = document.getElementById('meta-start');
  const slugFelt = document.getElementById('meta-slug');
  const sist = hentSisteMeta();
  document.getElementById('meta-dialog-title').textContent = tittel;
  document.getElementById('meta-slug-row').classList.toggle('hidden', !medAdresse);
  slugFelt.value = (forslag && forslag.adressenavn) ||
    (medAdresse ? lagSlug((forslag && forslag.navn) || '') : '');
  navnFelt.value = (forslag && forslag.navn) || '';
  beskrFelt.value = (forslag && forslag.beskrivelse) || '';
  creatorFelt.value = (forslag && forslag.creator) || sist.creator || '';
  linkFelt.value = (forslag && forslag.link) || sist.link || '';
  // Copyright-forslag: arvet verdi, ellers sist brukte, ellers creator
  // (rettighetshaver er som regel den som laget sporet).
  // CC BY-NC 4.0 legges til av serveren.
  copyrightFelt.value = (forslag && forslag.copyright) || sist.copyright ||
    creatorFelt.value || '';
  nøkkelordFelt.value = (forslag && forslag.nøkkelord) || sist.nøkkelord || '';
  startFelt.value = (forslag && forslag.starttid) ||
    (medStarttid ? sist.starttid : '') || '';
  document.getElementById('meta-start-row').classList.toggle('hidden', !medStarttid);

  const løfte = ventPåDialog(dialog); // åpner dialogen
  navnFelt.select();
  const handling = await løfte;
  const navn = navnFelt.value.trim();
  if (handling !== 'ok' || !navn) return null;
  return {
    navn,
    beskrivelse: beskrFelt.value.trim() || null,
    creator: creatorFelt.value.trim() || null,
    link: linkFelt.value.trim() || null,
    copyright: copyrightFelt.value.trim() || null,
    nøkkelord: nøkkelordFelt.value.trim() || null,
    starttid: medStarttid ? (startFelt.value || null) : null,
    adressenavn: medAdresse ? (slugFelt.value.trim() || lagSlug(navn)) : null,
  };
}

/**
 * Vent på at brukeren lukker en dialog, og returner hvilken knapp som
 * ble brukt ('ok', 'delete', 'cancel', …). Lytter på skjemaets
 * submit-hendelse (dekker både knappeklikk og Enter) i stedet for
 * dialogens close-hendelse, som ikke fyrer pålitelig i alle nettlesere.
 */
function ventPåDialog(dialog) {
  return new Promise((resolve) => {
    const skjema = dialog.querySelector('form');
    function ferdig(verdi) {
      skjema.removeEventListener('submit', vedSubmit);
      dialog.removeEventListener('cancel', vedEsc);
      if (dialog.open) dialog.close();
      resolve(verdi);
    }
    function vedSubmit(e) {
      e.preventDefault(); // vi lukker selv — unngå avhengighet av close-event
      ferdig((e.submitter && e.submitter.value) || 'ok');
    }
    function vedEsc(e) {
      e.preventDefault();
      ferdig('cancel');
    }
    skjema.addEventListener('submit', vedSubmit);
    dialog.addEventListener('cancel', vedEsc);
    dialog.showModal();
  });
}

/**
 * Lagre en blob som fil. Bruker nettleserens «Lagre som»-dialog
 * (showSaveFilePicker) der den finnes (Chrome/Edge), slik at brukeren
 * kan velge mappe og filnavn selv. Ellers vanlig nedlasting til
 * nedlastingsmappa. Returnerer false hvis brukeren avbrøt.
 */
async function lagreFil(blob, forslagNavn, beskrivelse, mimeTilEndelse) {
  if (window.showSaveFilePicker) {
    // Skillet mellom «dialogen lot seg ikke åpne» og «skrivingen feilet»
    // er viktig: har dialogen først vært åpen, skal vi ALDRI i tillegg
    // utløse vanlig nedlasting — det ga to lagringsdialoger etter hverandre.
    let handle = null;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: forslagNavn,
        types: [{ description: beskrivelse, accept: mimeTilEndelse }],
      });
    } catch (feil) {
      if (feil.name === 'AbortError') return false; // brukeren avbrøt
      handle = null; // dialogen lot seg ikke åpne → bruk vanlig nedlasting
    }
    if (handle) {
      try {
        const skriver = await handle.createWritable();
        await skriver.write(blob);
        await skriver.close();
        return true;
      } catch (feil) {
        toast('Klarte ikke å skrive fila: ' + feil.message, 'error');
        return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = forslagNavn;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Formater et tidspunkt for et <input type="datetime-local">-felt (lokal tid). */
function tilDatetimeLocal(isoStreng) {
  if (!isoStreng) return '';
  const d = new Date(isoStreng);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

// Geometri-/statistikkfunksjonene (avstandKm, kumulativAvstand, fmtKm,
// klem, gaussUtjevning, høyderMedInterpolering, fintSteg, beregnHøydemeter)
// og symboltabellen (WPT_SYMBOLER m.fl.) ligger i felles.js, som lastes
// før denne fila — de deles med den publiserbare løypevisningen (viewer/).

function fmtDato(isoStreng) {
  return new Date(isoStreng).toLocaleDateString('nb-NO', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Gjør en «forrige/neste»-knapp til å repetere når den holdes inne, med
 * akselerasjon: jo lenger man holder, jo større steg og kortere pause.
 * `påSteg(antall)` flytter markøren `antall` punkter i knappens retning.
 * Ett kjapt trykk (uten å holde) gir nøyaktig ett steg (10 med Shift).
 */
function koblAutoRepeat(knapp, påSteg) {
  let timer = null;
  let tikk = 0;
  let medShift = false;

  function ettSteg() {
    const grunn = medShift ? 10 : 1;
    // Trappetrinn: stegstørrelsen vokser jo lenger knappen holdes inne
    const fart = tikk < 6 ? 1 : tikk < 16 ? 4 : tikk < 32 ? 12 : tikk < 60 ? 30 : 70;
    påSteg(grunn * fart);
  }
  function løkke() {
    tikk++;
    ettSteg();
    const pause = tikk < 6 ? 110 : tikk < 16 ? 70 : 45; // kortere pause = raskere
    timer = setTimeout(løkke, pause);
  }
  function stopp() {
    if (timer) { clearTimeout(timer); timer = null; }
    tikk = 0;
  }

  knapp.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return; // kun venstre knapp
    e.preventDefault();
    medShift = e.shiftKey;
    tikk = 0;
    ettSteg();                       // umiddelbart ett steg (dekker vanlig klikk)
    timer = setTimeout(løkke, 320);  // så en liten pause før repetering starter
    knapp.setPointerCapture && knapp.setPointerCapture(e.pointerId);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    knapp.addEventListener(ev, stopp);
  }
}

// ============================================================
// 2. Kartet og kartfliser fra Kartverket
// ============================================================
// Kartet bruker vanlig web-projeksjon (EPSG:3857), så sporene har
// riktig fasong både med og uten kartunderlag. Kartflisene hentes
// gratis fra Kartverkets åpne flisetjeneste (krever internett) og
// kan slås av/på — valget huskes til neste gang.

// Spor tegnes med canvas-tegneren i stedet for standard SVG: med spor på
// mange tusen punkter klipper SVG-tegneren bort deler av linja under
// panorering/zooming (den tegner bare et begrenset område rundt synsfeltet).
// Canvas med romslig `padding` tegner godt utenfor skjermkanten, så løypa
// aldri "forsvinner" mens man flytter seg rundt.
const sporTegner = L.canvas({ padding: 1.0 });

const map = L.map('map', {
  attributionControl: false,
  maxZoom: 19,
  minZoom: 3,
  renderer: sporTegner,
});
map.setView([65.0, 13.0], 4); // Norge, til noe annet lastes

// Kartet ligger i et fleksibelt oppsett der høydeprofil og paneler endrer
// størrelsen på kartområdet. Leaflet må få beskjed hver gang det skjer,
// ellers henter det ikke fliser for det "nye" området — dette var årsaken
// til at deler av kartet kunne stå urendret. En ResizeObserver fanger alle
// størrelsesendringer automatisk.
new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById('map'));

// Tilgjengelige kartvisninger. Kartverket tilbyr fire varianter (men ikke
// satellittbilder) — satellitt hentes derfor fra Esris åpne flisetjeneste.
// Alle tillater bruk i PNG-eksport (CORS åpen), og bruker {z}/{y}/{x}-mønster.
const KARTLAG = {
  topo: {
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
    maxZoom: 19,
  },
  topograatone: {
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
    maxZoom: 19,
  },
  toporaster: {
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/toporaster/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
    maxZoom: 19,
  },
  sjokartraster: {
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
    maxZoom: 19,
  },
  satellitt: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
};

let aktivtKartlag = KARTLAG[localStorage.getItem('gps-tool.kartlag')] ? localStorage.getItem('gps-tool.kartlag') : 'topo';

function lagKartfliser(navn) {
  const def = KARTLAG[navn];
  return L.tileLayer(def.url, {
    maxZoom: def.maxZoom,
    keepBuffer: 6,        // behold fliser et godt stykke utenfor skjermen ved panorering
    updateWhenIdle: false, // hent nye fliser fortløpende mens man drar, ikke først etterpå
    attribution: def.attribution,
  });
}

let kartfliser = lagKartfliser(aktivtKartlag);
const kartAttribusjon = L.control.attribution({ prefix: false });

function settKartfliser(på) {
  if (på) {
    kartfliser.addTo(map);
    kartAttribusjon.addTo(map);
  } else {
    map.removeLayer(kartfliser);
    kartAttribusjon.remove();
  }
  // Speil tilstanden i Kartvisning-dropdownen: «Skjul kart» når av, ellers laget.
  const velger = document.getElementById('map-layer-select');
  if (velger) velger.value = på ? aktivtKartlag : '__skjul__';
  localStorage.setItem('gps-tool.kart', på ? '1' : '0');
}

function kartErPå() { return map.hasLayer(kartfliser); }

// Kartvisning-dropdownen styrer både HVILKET kartlag som vises og om kartet
// vises i det hele tatt («Skjul kart» = jobb uten Kartverket-laget, f.eks. uten
// internett — erstatter den gamle «Kart»-knappen i toppbanneret).
document.getElementById('map-layer-select').addEventListener('change', (e) => {
  if (e.target.value === '__skjul__') { settKartfliser(false); return; }
  if (kartErPå()) map.removeLayer(kartfliser);
  aktivtKartlag = e.target.value;
  localStorage.setItem('gps-tool.kartlag', aktivtKartlag);
  kartfliser = lagKartfliser(aktivtKartlag);
  settKartfliser(true); // å velge et kartlag betyr at man vil se kartet
});

function tilLatLng(p) { return [p.lat, p.lon]; }

/** Alt som tegnes på kartet legges i denne gruppa, så én clear rydder alt. */
const kartlag = L.layerGroup().addTo(map);

// Interessepunktene ligger i et eget lag, så de kan tegnes på nytt ved
// zoom (for å skalere symbolene) uten å tegne hele sporet på nytt.
const wptLag = L.layerGroup().addTo(map);
// Egen canvas-renderer for PoI-vektorene (ledestrek + punktmarkør), slik
// at det å dra en ramme ikke tvinger fram ny tegning av hele sporet.
const wptTegner = L.canvas({ padding: 0.5 });

function tømKartet() { kartlag.clearLayers(); wptLag.clearLayers(); }

function visKartmelding(vis) {
  document.getElementById('map-empty').style.display = vis ? 'flex' : 'none';
}

function tegnSpor(punkter, farge, tykkelse, gjennomsiktighet) {
  return L.polyline(punkter.map(tilLatLng), {
    color: farge,
    weight: tykkelse || 3,
    opacity: gjennomsiktighet == null ? 0.9 : gjennomsiktighet,
  }).addTo(kartlag);
}

function lagPosisjonsmarkør(punkt, farge) {
  return L.circleMarker(tilLatLng(punkt), {
    radius: 8, color: '#ffffff', weight: 2, fillColor: farge, fillOpacity: 1,
  }).addTo(kartlag);
}

function lagFastMarkør(punkt, farge) {
  return L.circleMarker(tilLatLng(punkt), {
    radius: 7, color: farge, weight: 3, fillColor: '#ffffff', fillOpacity: 1,
  }).addTo(kartlag);
}

function zoomTil(punktlister) {
  const alle = [];
  for (const punkter of punktlister) for (const p of punkter) alle.push(tilLatLng(p));
  if (alle.length > 0) map.fitBounds(L.latLngBounds(alle).pad(0.08));
}

// ============================================================
// 3. Høydeprofilen
// ============================================================
// Tegnes på et <canvas> under kartet. Profilen brukes også i
// profileringsmateriell, så utseendet kan styres fritt:
//   - Høydeskala: hvor mye høyden overdrives ift. distansen
//     (1× = naturtro — da ser de fleste løyper nesten flate ut)
//   - Linjefarge, fyllfarge (av/på) og bakgrunnsfarge — fritt valg
//   - Akser (linjer + tall) og rutenett, hver for seg
//   - Tekststørrelse på aksetallene
//   - Nedlasting som PNG-bilde
// Alle innstillingene huskes i nettleseren til neste gang.

/** Lagret tallverdi fra localStorage, eller standardverdien hvis nøkkelen
 *  ikke finnes. (I motsetning til «Number(...) || standard» overlever en
 *  bevisst lagret 0 — 0 er falsy og ville ellers blitt til standarden.) */
function lagretTall(nøkkel, standard) {
  const verdi = localStorage.getItem(nøkkel);
  return verdi === null ? standard : Number(verdi);
}

const profilState = {
  synlig: localStorage.getItem('gps-tool.profil') === '1',
  overdrivelse: Number(localStorage.getItem('gps-tool.profil.skala')) || 5,
  akser: localStorage.getItem('gps-tool.profil.akser') !== '0',
  rutenett: localStorage.getItem('gps-tool.profil.rutenett') !== '0',
  linje: localStorage.getItem('gps-tool.profil.linje') || '#0f172a',
  fyllPå: localStorage.getItem('gps-tool.profil.fyllPaa') === '1',
  fyll: localStorage.getItem('gps-tool.profil.fyll') || '#f4b8b8',
  bakgrunn: localStorage.getItem('gps-tool.profil.bakgrunn') || '#ffffff',
  tekst: Number(localStorage.getItem('gps-tool.profil.tekst')) || 11,
  // Utjevning/vektform: 5/5 er standard og ANBEFALT — gir høydemeter
  // omtrent som løpernes GPS-klokker rapporterer, og felles innstillinger
  // på tvers av arrangører gjør tallene sammenlignbare. (lagretTall, ikke
  // «|| 5»: en bevisst lagret 0 skal ikke overstyres av standarden.)
  utjevning: lagretTall('gps-tool.profil.utjevning', 5),
  vektform: lagretTall('gps-tool.profil.vektform', 5),
  // Farger på akser, rutenett, tall og posisjonsmarkør — fritt valgbare,
  // så profilen kan gjøres kontrastrik nok til f.eks. startnummertrykk
  akseFarge: localStorage.getItem('gps-tool.profil.akseFarge') || '#94a3b8',
  rutenettFarge: localStorage.getItem('gps-tool.profil.rutenettFarge') || '#e2e8f0',
  tallFarge: localStorage.getItem('gps-tool.profil.tallFarge') || '#64748b',
  markørFarge: localStorage.getItem('gps-tool.profil.markoerFarge') || '#2563eb',
  markørVis: localStorage.getItem('gps-tool.profil.markoerVis') !== '0',
  // Veipunkter i profilen: navn og ikoner kan vises/skjules hver for seg.
  // (Eldre lagret valg «visPunkter» styrte begge — arves som utgangspunkt.)
  visNavn: (localStorage.getItem('gps-tool.profil.visNavn')
    || localStorage.getItem('gps-tool.profil.visPunkter')) === '1',
  visIkoner: (localStorage.getItem('gps-tool.profil.visIkoner')
    || localStorage.getItem('gps-tool.profil.visPunkter')) === '1',
  // Egen farge på veipunkt-markørene i profilen (uavhengig av kartets ledestrek)
  punktFarge: localStorage.getItem('gps-tool.profil.punktFarge') || '#334155',
};

function lagreProfilValg() {
  const p = profilState;
  localStorage.setItem('gps-tool.profil.skala', String(p.overdrivelse));
  localStorage.setItem('gps-tool.profil.akser', p.akser ? '1' : '0');
  localStorage.setItem('gps-tool.profil.rutenett', p.rutenett ? '1' : '0');
  localStorage.setItem('gps-tool.profil.linje', p.linje);
  localStorage.setItem('gps-tool.profil.fyllPaa', p.fyllPå ? '1' : '0');
  localStorage.setItem('gps-tool.profil.fyll', p.fyll);
  localStorage.setItem('gps-tool.profil.bakgrunn', p.bakgrunn);
  localStorage.setItem('gps-tool.profil.tekst', String(p.tekst));
  localStorage.setItem('gps-tool.profil.utjevning', String(p.utjevning));
  localStorage.setItem('gps-tool.profil.vektform', String(p.vektform));
  localStorage.setItem('gps-tool.profil.akseFarge', p.akseFarge);
  localStorage.setItem('gps-tool.profil.rutenettFarge', p.rutenettFarge);
  localStorage.setItem('gps-tool.profil.tallFarge', p.tallFarge);
  localStorage.setItem('gps-tool.profil.markoerFarge', p.markørFarge);
  localStorage.setItem('gps-tool.profil.markoerVis', p.markørVis ? '1' : '0');
  localStorage.setItem('gps-tool.profil.visNavn', p.visNavn ? '1' : '0');
  localStorage.setItem('gps-tool.profil.visIkoner', p.visIkoner ? '1' : '0');
  localStorage.setItem('gps-tool.profil.punktFarge', p.punktFarge);
}

/**
 * Høydemeter opp/ned med verktøyets gjeldende utjevningsvalg — tynt
 * skall rundt beregnHøydemeter i felles.js.
 */
function høydemeter(punkter) {
  return beregnHøydemeter(punkter, profilState.utjevning, profilState.vektform);
}

/** Tekstsnutt som «↑ 512 m · ↓ 498 m», eller tom streng uten høydedata. */
function høydemeterTekst(punkter) {
  const hm = høydemeter(punkter);
  return hm ? ' · ↑ ' + hm.opp + ' m · ↓ ' + hm.ned + ' m' : '';
}

/**
 * Finn dataene profilen skal vise, avhengig av aktiv fane:
 * redigering -> det innlastede sporet (med utsnitt og markørposisjon),
 * sammenslåing -> resultatet hvis det finnes, ellers segment A eller B.
 */
function profilKilde() {
  if (aktivFane === 'editor' && editorState.punkter) {
    const [lo, hi] = utsnittsgrenser();
    return {
      punkter: editorState.punkter,
      avstander: editorState.avstander,
      navn: editorState.navn,
      posIdx: editorState.valgtIdx,
      lo, hi,
    };
  }
  if (aktivFane === 'merge') {
    if (mergeState.resultat) {
      return {
        punkter: mergeState.resultat,
        avstander: mergeState.resultatAvstander,
        navn: 'Sammenslått resultat',
        posIdx: null, lo: null, hi: null,
      };
    }
    for (const bokstav of ['a', 'b']) {
      const plass = mergeState[bokstav];
      if (plass.punkter) {
        return {
          punkter: plass.punkter,
          avstander: plass.avstander,
          navn: plass.navn + ' (' + bokstav.toUpperCase() + ')',
          posIdx: plass.valgtIdx, lo: null, hi: null,
        };
      }
    }
  }
  return null;
}

// (høyderMedInterpolering og fintSteg ligger i felles.js)

function settProfilSynlig(synlig) {
  profilState.synlig = synlig;
  document.getElementById('profile-section').classList.toggle('hidden', !synlig);
  localStorage.setItem('gps-tool.profil', synlig ? '1' : '0');
  setTimeout(() => { map.invalidateSize(); tegnProfil(); }, 50);
}

function tegnProfil() {
  if (!profilState.synlig) return;
  const canvas = document.getElementById('profile-canvas');
  const tomMelding = document.getElementById('profile-empty');
  const kildeLabel = document.getElementById('profile-source');
  const kilde = profilKilde();

  if (!kilde) {
    canvas.style.display = 'none';
    tomMelding.textContent = 'Last inn et spor for å se høydeprofilen.';
    tomMelding.classList.remove('hidden');
    kildeLabel.textContent = '';
    return;
  }

  let høyder = høyderMedInterpolering(kilde.punkter);
  if (høyder) {
    høyder = gaussUtjevning(høyder, profilState.utjevning, profilState.vektform);
  }
  kildeLabel.textContent = kilde.navn || '';
  if (!høyder) {
    canvas.style.display = 'none';
    tomMelding.textContent = 'Ingen høydedata i dette sporet.';
    tomMelding.classList.remove('hidden');
    return;
  }
  tomMelding.classList.add('hidden');
  canvas.style.display = 'block';

  // ---- Geometri: bredde fra vinduet, høyde fra ekte målestokk ----
  const wrap = canvas.parentElement;
  const breddePx = Math.max(200, wrap.clientWidth - 40);
  // Margene må vokse med tekststørrelsen, ellers kappes aksetallene.
  // Høyremargen gir plass til «km»-tittelen (halve bredden av teksten
  // stikker ut til høyre for siste tick), så den aldri kuttes i PNG-en.
  const tekstPx = profilState.tekst;
  const basisHøyre = profilState.akser ? Math.round(tekstPx * 1.4 + 8) : 6;
  const marg = profilState.akser
    ? { venstre: Math.round(tekstPx * 3.4 + 12), høyre: basisHøyre, topp: 10, bunn: Math.round(tekstPx * 1.6 + 8) }
    : { venstre: 6, høyre: 6, topp: 6, bunn: 6 };

  const totalM = kilde.avstander[kilde.avstander.length - 1] * 1000;
  const totalKm = totalM / 1000 || 1;

  // ---- Interessepunkter i profilen (kun i redigering, med eget spor) ----
  // Loddrett strek opp til profilen + navn i 45° og ikoner under, i rader.
  // Navn og ikoner kan vises/skjules hver for seg. Vi måler hver etikett
  // presist, så vi verken kutter den eller reserverer mer plass enn
  // nødvendig — verken under eller til høyre for profilen.
  const profilWpts = ((profilState.visNavn || profilState.visIkoner) &&
    aktivFane === 'editor' &&
    editorState.veipunkter && kilde.punkter === editorState.punkter)
    ? editorState.veipunkter.filter((w) => w.vis_ikon !== false) : [];
  const wptIkonStr = tekstPx * 1.5;
  // Alle avstander er målt fra x-aksen (aksenY).
  const wptNavnFall = marg.bunn + 4;                 // ned til under km-tallene
  // Uten navn rykker ikonene opp dit navnene ellers ville stått
  const wptIkonFall = wptNavnFall + (profilState.visNavn ? tekstPx * 2.2 : 0);
  const DIAG = Math.SQRT1_2;                          // cos(45°) = sin(45°)

  const etiketter = [];
  if (profilWpts.length) {
    const målCtx = document.createElement('canvas').getContext('2d');
    målCtx.font = tekstPx + 'px "Segoe UI", sans-serif';
    for (const w of profilWpts) {
      const navnB = profilState.visNavn ? 4 + målCtx.measureText(w.name).width : 0;
      let ned = wptNavnFall + navnB * DIAG;  // hvor langt ned etiketten går
      let høyre = navnB * DIAG;              // hvor langt til høyre for streken
      const rader = profilState.visIkoner
        ? ikonRader(wptTyper(w), WPT_MAKS_PER_RAD_PROFIL) : [];
      rader.forEach((rad, r) => {
        const base = wptIkonFall + r * (wptIkonStr + 4);
        const sisteLangs = wptIkonStr / 2 + 2 + (rad.length - 1) * (wptIkonStr + 3);
        ned = Math.max(ned, base + sisteLangs * DIAG + wptIkonStr / 2);
        høyre = Math.max(høyre, sisteLangs * DIAG + wptIkonStr / 2);
      });
      const idx = nærmesteSporIndeks(w);
      etiketter.push({ w, rader, ned, høyre, idx, andel: kilde.avstander[idx] / totalKm });
    }
  }

  // marg.bunn gir allerede plass under aksen; reserver bare det som mangler
  const wptBunn = etiketter.length
    ? Math.min(260, Math.max(0, Math.max(...etiketter.map((e) => e.ned)) - marg.bunn) + 6)
    : 0;

  // Dynamisk høyremarg: akkurat nok til at etiketten lengst til høyre
  // (som regel målgangen) får plass — ellers ikke noe ekstra tomrom.
  // plotB avhenger av margen, så vi justerer et par runder til den setter seg.
  if (etiketter.length) {
    for (let i = 0; i < 3; i++) {
      const plotB0 = breddePx - marg.venstre - marg.høyre;
      let behov = basisHøyre;
      for (const e of etiketter) {
        behov = Math.max(behov, e.høyre - (1 - e.andel) * plotB0 + 4);
      }
      const ny = Math.round(klem(behov, basisHøyre, breddePx * 0.4));
      if (ny === marg.høyre) break;
      marg.høyre = ny;
    }
  }

  const plotB = breddePx - marg.venstre - marg.høyre;

  let minH = Math.min(...høyder), maksH = Math.max(...høyder);
  if (maksH - minH < 1) maksH = minH + 1; // helt flatt spor: unngå deling på null
  const spennH = maksH - minH;

  // px per meter horisontalt × overdrivelsesfaktor = px per meter vertikalt.
  // Det er dette som gjør at "Høydeskala 1×" er naturtro målestokk.
  const pxPerM = plotB / (totalM || 1);
  let plotH = klem(spennH * pxPerM * profilState.overdrivelse, 30, 340);

  // I «delt» og «bare profil» fyller profilen den tilgjengelige høyden i panelet
  // (som brukeren styrer ved å dra delelinja), ikke bare det en fast skala tilsier.
  if (visModus === 'profil' || visModus === 'split') {
    const tilgjengelig = canvas.parentElement.clientHeight - 16 - marg.topp - marg.bunn - wptBunn;
    plotH = Math.max(120, tilgjengelig);
  }

  // Litt luft under laveste punkt når veipunkter vises, så indikatorlinjene
  // er synlige også der løypa er på sitt laveste (ellers null lengde).
  const yPad = etiketter.length ? spennH * 0.08 : 0;
  const minVis = minH - yPad;
  const spennVis = spennH + yPad;

  const høydePx = plotH + marg.topp + marg.bunn + wptBunn;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = breddePx * dpr;
  canvas.height = høydePx * dpr;
  canvas.style.width = breddePx + 'px';
  canvas.style.height = høydePx + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const xFor = (i) => marg.venstre + (kilde.avstander[i] * 1000 * plotB) / (totalM || 1);
  const yFor = (h) => marg.topp + plotH - ((h - minVis) / spennVis) * plotH;

  // ---- Bakgrunn ----
  ctx.fillStyle = profilState.bakgrunn;
  ctx.fillRect(0, 0, breddePx, høydePx);

  // Farger på akser, rutenett og tall er brukerens egne valg
  const tekstFarge = profilState.tallFarge;
  const rutenettFarge = profilState.rutenettFarge;
  const rammeFarge = profilState.akseFarge;

  // ---- Akser (tall + ramme) og rutenett — kan slås av/på hver for seg ----
  if (profilState.akser || profilState.rutenett) {
    ctx.font = tekstPx + 'px "Segoe UI", sans-serif';
    ctx.lineWidth = 1;

    const totalKm = totalM / 1000;
    const stegKm = fintSteg(totalKm, 8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let km = 0; km <= totalKm + 1e-9; km += stegKm) {
      const x = marg.venstre + ((km * 1000) / (totalM || 1)) * plotB;
      if (profilState.rutenett) {
        ctx.strokeStyle = rutenettFarge;
        ctx.beginPath(); ctx.moveTo(x, marg.topp); ctx.lineTo(x, marg.topp + plotH); ctx.stroke();
      }
      if (profilState.akser) {
        ctx.fillStyle = tekstFarge;
        ctx.fillText(km.toLocaleString('nb-NO'), x, marg.topp + plotH + 6);
      }
    }
    if (profilState.akser) ctx.fillText('km', marg.venstre + plotB, marg.topp + plotH + 6);

    const stegM = fintSteg(spennH, 5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const førsteTick = Math.ceil(minH / stegM) * stegM;
    for (let h = førsteTick; h <= maksH + 1e-9; h += stegM) {
      const y = yFor(h);
      if (profilState.rutenett) {
        ctx.strokeStyle = rutenettFarge;
        ctx.beginPath(); ctx.moveTo(marg.venstre, y); ctx.lineTo(marg.venstre + plotB, y); ctx.stroke();
      }
      if (profilState.akser) {
        ctx.fillStyle = tekstFarge;
        ctx.fillText(Math.round(h) + ' m', marg.venstre - 6, y);
      }
    }

    // Rammelinjer for selve aksene
    if (profilState.akser) {
      ctx.strokeStyle = rammeFarge;
      ctx.beginPath();
      ctx.moveTo(marg.venstre, marg.topp);
      ctx.lineTo(marg.venstre, marg.topp + plotH);
      ctx.lineTo(marg.venstre + plotB, marg.topp + plotH);
      ctx.stroke();
    }
  }

  // ---- Grønt bånd for valgt utsnitt (kun i redigeringsvisningen) ----
  if (kilde.lo != null && kilde.hi != null) {
    ctx.fillStyle = 'rgba(22, 163, 74, 0.13)';
    ctx.fillRect(xFor(kilde.lo), marg.topp, xFor(kilde.hi) - xFor(kilde.lo), plotH);
  }

  // ---- Selve profilen: valgfritt fyll under, valgfri linjefarge oppå ----
  const tegnProfillinje = () => {
    ctx.beginPath();
    ctx.moveTo(xFor(0), yFor(høyder[0]));
    for (let i = 1; i < høyder.length; i++) ctx.lineTo(xFor(i), yFor(høyder[i]));
  };

  if (profilState.fyllPå) {
    tegnProfillinje();
    ctx.lineTo(xFor(høyder.length - 1), marg.topp + plotH);
    ctx.lineTo(xFor(0), marg.topp + plotH);
    ctx.closePath();
    ctx.fillStyle = profilState.fyll;
    ctx.fill();
  }
  tegnProfillinje();
  ctx.strokeStyle = profilState.linje;
  ctx.lineWidth = profilState.fyllPå ? 2 : 1.5;
  ctx.stroke();

  // ---- Loddrett strek der markøren står (kan skjules/farges av brukeren) ----
  if (kilde.posIdx != null && profilState.markørVis) {
    const x = xFor(kilde.posIdx);
    ctx.strokeStyle = profilState.markørFarge;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, marg.topp); ctx.lineTo(x, marg.topp + plotH); ctx.stroke();
    ctx.fillStyle = profilState.markørFarge;
    ctx.beginPath();
    ctx.arc(x, yFor(høyder[kilde.posIdx]), 4, 0, 2 * Math.PI);
    ctx.fill();
  }

  // ---- Interessepunkter i profilen ----
  if (etiketter.length) {
    const aksenY = marg.topp + plotH;
    for (const e of etiketter) {
      const x = xFor(e.idx);
      const yProfil = yFor(høyder[e.idx]); // høyden på profilen akkurat her

      // Loddrett strek fra x-aksen opp til profilen (ikke helt til toppen).
      // Egen farge for profilen, uavhengig av kartets ledestrek.
      ctx.strokeStyle = profilState.punktFarge;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, aksenY); ctx.lineTo(x, yProfil); ctx.stroke();
      // Liten sirkel som markerer punktet der streken møter profilen
      ctx.beginPath(); ctx.arc(x, yProfil, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = profilState.punktFarge; ctx.lineWidth = 1.5; ctx.stroke();

      // Navnet i 45° nedover, et stykke under km-tallene på x-aksen
      if (profilState.visNavn) {
        ctx.save();
        ctx.translate(x, aksenY + wptNavnFall);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = profilState.tallFarge;
        ctx.font = tekstPx + 'px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.w.name, 4, 0);
        ctx.restore();
      }

      // Ikonene UNDER navnet, på parallelle diagonaler — én rad per
      // WPT_MAKS_PER_RAD_PROFIL ikoner. Selve symbolene tegnes oppreist.
      e.rader.forEach((rad, r) => {
        const base = aksenY + wptIkonFall + r * (wptIkonStr + 4);
        rad.forEach((t, j) => {
          const langs = wptIkonStr / 2 + 2 + j * (wptIkonStr + 3);
          tegnSymbolCanvas(ctx, t, x + DIAG * langs, base + DIAG * langs, wptIkonStr);
        });
      });
    }
  }
}

// --- Visningsmodus: bare kart / delt / bare profil ---

let visModus = localStorage.getItem('gps-tool.visModus')
  || (profilState.synlig ? 'split' : 'kart');

function settVisModus(m) {
  visModus = m;
  localStorage.setItem('gps-tool.visModus', m);
  const c = document.querySelector('.content');
  c.classList.toggle('modus-kart', m === 'kart');
  c.classList.toggle('modus-split', m === 'split');
  c.classList.toggle('modus-profil', m === 'profil');
  for (const [id, mode] of [['view-kart', 'kart'], ['view-split', 'split'], ['view-profil', 'profil']]) {
    document.getElementById(id).classList.toggle('active', mode === m);
  }
  // Profilen tegnes i «delt» og «bare profil», skjules i «bare kart»
  settProfilSynlig(m !== 'kart');
  if (m === 'split') settProfilhøyde(lagretProfilhøyde());
  else document.getElementById('profile-section').style.height = '';
  // La flexbox legge om, be så kartet måle på nytt og profilen tegnes
  setTimeout(() => { map.invalidateSize(); tegnProfil(); }, 60);
}

// --- Dragbar delelinje kart/høydeprofil (delt visning). Profilens panelhøyde
//     huskes lokalt; kartet får resten av flaten. ---
const PROFILHØYDE_NØKKEL = 'gps-tool.profilhoyde';

function lagretProfilhøyde() {
  return Number(localStorage.getItem(PROFILHØYDE_NØKKEL)) || 260;
}

/** Sett profilpanelets høyde, klemt så både kart og profil beholder plass. */
function settProfilhøyde(px) {
  const innhold = document.querySelector('.content');
  const maks = innhold.clientHeight - 200; // la kartet + verktøylinjene beholde plass
  const h = Math.max(90, Math.min(px, Math.max(90, maks)));
  document.getElementById('profile-section').style.height = h + 'px';
  return h;
}

(function koblProfilGutter() {
  const gutter = document.getElementById('profil-gutter');
  let startY = 0, startH = 0, drar = false;
  gutter.addEventListener('mousedown', (e) => {
    drar = true;
    startY = e.clientY;
    startH = document.getElementById('profile-section').getBoundingClientRect().height;
    gutter.classList.add('drar');
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!drar) return;
    // Dra opp = større profil (mer høyde), dra ned = mindre
    settProfilhøyde(startH + (startY - e.clientY));
    tegnProfil();
  });
  document.addEventListener('mouseup', () => {
    if (!drar) return;
    drar = false;
    gutter.classList.remove('drar');
    document.body.style.cursor = '';
    const h = Math.round(document.getElementById('profile-section').getBoundingClientRect().height);
    localStorage.setItem(PROFILHØYDE_NØKKEL, String(h));
    setTimeout(() => { map.invalidateSize(); tegnProfil(); }, 20);
  });
})();

document.getElementById('view-kart').addEventListener('click', () => settVisModus('kart'));
document.getElementById('view-split').addEventListener('click', () => settVisModus('split'));
document.getElementById('view-profil').addEventListener('click', () => settVisModus('profil'));

// (Høydeskala-slideren er fjernet — i delt og «bare profil» fyller profilen nå
// den tilgjengelige høyden, som brukeren justerer ved å dra delelinja.)

document.getElementById('profile-axes').addEventListener('change', (e) => {
  profilState.akser = e.target.checked;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-grid').addEventListener('change', (e) => {
  profilState.rutenett = e.target.checked;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-line-color').addEventListener('input', (e) => {
  profilState.linje = e.target.value;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-fill-on').addEventListener('change', (e) => {
  profilState.fyllPå = e.target.checked;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-fill-color').addEventListener('input', (e) => {
  profilState.fyll = e.target.value;
  profilState.fyllPå = true; // å velge fyllfarge betyr at man vil ha fyll
  document.getElementById('profile-fill-on').checked = true;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-bg-color').addEventListener('input', (e) => {
  profilState.bakgrunn = e.target.value;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-font').addEventListener('input', (e) => {
  profilState.tekst = Number(e.target.value);
  document.getElementById('profile-font-val').textContent = profilState.tekst;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-smooth').addEventListener('input', (e) => {
  profilState.utjevning = Number(e.target.value);
  document.getElementById('profile-smooth-val').textContent =
    profilState.utjevning === 0 ? '0' : '±' + profilState.utjevning;
  lagreProfilValg();
  tegnProfil();
  oppdaterEditorMeta(); // høydemeterne beregnes med utjevningen
});

document.getElementById('profile-shape').addEventListener('input', (e) => {
  profilState.vektform = Number(e.target.value);
  document.getElementById('profile-shape-val').textContent = profilState.vektform;
  lagreProfilValg();
  tegnProfil();
  oppdaterEditorMeta();
});

// (i)-knappen: forklaring av utjevningsinnstillingene og 5/5-anbefalingen
document.getElementById('smooth-info-btn').addEventListener('click', () => {
  ventPåDialog(document.getElementById('smooth-info-dialog'));
});

document.getElementById('profile-axis-color').addEventListener('input', (e) => {
  profilState.akseFarge = e.target.value;
  profilState.akser = true; // å velge farge betyr at man vil se aksene
  document.getElementById('profile-axes').checked = true;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-grid-color').addEventListener('input', (e) => {
  profilState.rutenettFarge = e.target.value;
  profilState.rutenett = true;
  document.getElementById('profile-grid').checked = true;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-tick-color').addEventListener('input', (e) => {
  profilState.tallFarge = e.target.value;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-marker-on').addEventListener('change', (e) => {
  profilState.markørVis = e.target.checked;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-marker-color').addEventListener('input', (e) => {
  profilState.markørFarge = e.target.value;
  profilState.markørVis = true;
  document.getElementById('profile-marker-on').checked = true;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-wpt-names').addEventListener('change', (e) => {
  profilState.visNavn = e.target.checked;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-wpt-icons').addEventListener('change', (e) => {
  profilState.visIkoner = e.target.checked;
  lagreProfilValg();
  tegnProfil();
});

document.getElementById('profile-wpt-color').addEventListener('input', (e) => {
  profilState.punktFarge = e.target.value;
  if (!profilState.visNavn && !profilState.visIkoner) {
    profilState.visNavn = true; // å velge farge betyr at man vil se punktene
    document.getElementById('profile-wpt-names').checked = true;
  }
  lagreProfilValg();
  tegnProfil();
});

/** Sett flere profilvalg på én gang og oppdater kontrollene i verktøylinja. */
function brukProfilPreset(valg) {
  Object.assign(profilState, valg);
  document.getElementById('profile-line-color').value = profilState.linje;
  document.getElementById('profile-fill-on').checked = profilState.fyllPå;
  document.getElementById('profile-fill-color').value = profilState.fyll;
  document.getElementById('profile-bg-color').value = profilState.bakgrunn;
  document.getElementById('profile-axis-color').value = profilState.akseFarge;
  document.getElementById('profile-grid-color').value = profilState.rutenettFarge;
  document.getElementById('profile-tick-color').value = profilState.tallFarge;
  document.getElementById('profile-marker-color').value = profilState.markørFarge;
  lagreProfilValg();
  tegnProfil();
}

// Standardfargene for akser/rutenett/tall følger med i begge hurtigvalgene
const STANDARD_AKSEFARGER = {
  akseFarge: '#94a3b8', rutenettFarge: '#e2e8f0', tallFarge: '#64748b',
};

// (Hurtigvalgene «Svart/hvitt» og «Rød fylt» er fjernet — erstattes senere av
// brukerens egne lagrede oppsett. brukProfilPreset beholdes til det.)

/** Last ned profilen slik den vises nå, som PNG-bilde. */
document.getElementById('profile-download').addEventListener('click', () => {
  const canvas = document.getElementById('profile-canvas');
  const kilde = profilKilde();
  if (!kilde || canvas.style.display === 'none') {
    toast('Ingen profil å laste ned — last inn et spor først', 'error');
    return;
  }
  canvas.toBlob(async (blob) => {
    const navn = (kilde.navn || 'høydeprofil').replace(/[\\/:*?"<>|]/g, '_');
    const lagret = await lagreFil(blob, navn + ' - høydeprofil.png', 'PNG-bilde', {
      'image/png': ['.png'],
    });
    if (lagret) toast('Høydeprofilen er lagret som PNG');
  });
});

window.addEventListener('resize', () => { if (profilState.synlig) tegnProfil(); });

// ============================================================
// 4. Segmentbiblioteket
// ============================================================

// Biblioteket finnes i to varianter med lik oppførsel: segmenter (data/segments
// + data/library.json) og arenakart (data/arenaer + data/arena-library.json).
// Brukeren omorganiserer med dra-og-slipp; hver endring lagres straks.
// lagBibliotek() lager én kontroller — konfigurasjonen sier hvor lista bor,
// hvilken entry-type løse oppføringer har, hvordan et kort bygges osv.
function lagBibliotek(cfg) {
  const ktrl = {
    cfg,
    data: { root: [], groups: {} },
    info: {}, // id -> sammendrag

    async oppdater() {
      const { struktur, info } = await cfg.hent();
      ktrl.data = struktur;
      ktrl.info = info;
      ktrl.tegn();
    },

    async lagre() {
      try {
        const res = await api(cfg.endepunkt, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ktrl.data),
        });
        ktrl.data = await res.json();
      } catch (feil) {
        toast(feil.message, 'error');
      }
      ktrl.tegn();
    },

    // Grupper er kollapset som standard; hvilke brukeren har UTVIDET huskes
    // lokalt per bibliotek (så det restaureres når man bytter modus fram og
    // tilbake). Tomt sett → alle grupper kollapset.
    utvidede() {
      try { return new Set(JSON.parse(localStorage.getItem(cfg.utvidetNøkkel) || '[]')); }
      catch (e) { return new Set(); }
    },
    settUtvidet(navn, utvidet) {
      const s = ktrl.utvidede();
      if (utvidet) s.add(navn); else s.delete(navn);
      localStorage.setItem(cfg.utvidetNøkkel, JSON.stringify([...s]));
    },

    tegn() {
      const liste = document.getElementById(cfg.listeId);
      liste.innerHTML = '';
      const tomEl = document.getElementById(cfg.emptyId);
      if (tomEl) tomEl.style.display = ktrl.data.root.length === 0 ? 'block' : 'none';
      const utvidet = ktrl.utvidede();
      for (const entry of ktrl.data.root) {
        if (entry.type === 'group') {
          const erK = !utvidet.has(entry.name); // kollapset med mindre utvidet
          liste.appendChild(lagGruppeElement(ktrl, entry.name, erK));
          if (!erK) {
            for (const id of ktrl.data.groups[entry.name] || []) {
              liste.appendChild(lagBibElement(ktrl, id, entry.name));
            }
          }
        } else {
          liste.appendChild(lagBibElement(ktrl, entry.id, null));
        }
      }
    },
  };
  return ktrl;
}

// Ett kort (segment eller arenakart). Skallet + dra-og-slipp er felles; selve
// innholdet (navn, meta, knapper) fylles av cfg.fyllKort.
function lagBibElement(ktrl, id, gruppe) {
  const data = ktrl.info[id];
  const li = document.createElement('li');
  li.className = 'segment-item' + (gruppe ? ' i-gruppe' : '');
  li.draggable = true;
  li.dataset.dnd = ktrl.cfg.dndPrefiks + ':' + id;
  if (!data) return li; // skal ikke skje (strukturen avstemmes på serveren)
  ktrl.cfg.fyllKort(li, data, ktrl);
  kobleDragOgSlipp(li, ktrl);
  return li;
}

function lagGruppeElement(ktrl, navn, erKollapset) {
  const li = document.createElement('li');
  li.className = 'group-item';
  li.draggable = true;
  li.dataset.dnd = 'grp:' + navn;

  const chevron = document.createElement('span');
  chevron.className = 'group-chevron';
  chevron.textContent = erKollapset ? '▶' : '▼';

  const tittel = document.createElement('span');
  tittel.className = 'group-name';
  tittel.textContent = navn;

  const antall = document.createElement('span');
  antall.className = 'group-count';
  antall.textContent = (ktrl.data.groups[navn] || []).length + ' ' + ktrl.cfg.enhet;

  const veksle = () => { ktrl.settUtvidet(navn, !ktrl.utvidede().has(navn)); ktrl.tegn(); };
  chevron.addEventListener('click', veksle);
  tittel.addEventListener('click', veksle);

  li.append(chevron, tittel, antall,
    lagKnapp('Endre', 'btn', () => giGruppeNyttNavn(ktrl, navn)),
    lagKnapp('Slett', 'btn btn-danger-subtle', () => slettGruppe(ktrl, navn)));
  kobleDragOgSlipp(li, ktrl);
  return li;
}

// --- Kortinnhold per bibliotektype ---

function fyllSegmentKort(li, seg, ktrl) {
  const navn = document.createElement('div');
  navn.className = 'seg-name';
  navn.textContent = seg.name;

  const meta = document.createElement('div');
  meta.className = 'seg-meta';
  meta.textContent = fmtDato(seg.created_at) + ' · ' + seg.point_count + ' punkter';
  li.append(navn, meta);

  if (seg.description) {
    const beskr = document.createElement('div');
    beskr.className = 'seg-desc';
    beskr.textContent = seg.description;
    beskr.title = seg.description;
    li.appendChild(beskr);
  }
  // Marker segmentet som er åpent i redigeringen
  if (editorState.kilde && editorState.kilde.type === 'segment' &&
      editorState.kilde.id === seg.id) {
    li.classList.add('aktiv');
  }

  const knapper = document.createElement('div');
  knapper.className = 'seg-buttons';
  // A/B-valg hører bare til «Slå sammen segmenter». I redigering OG i arenakart-
  // modus vises «Åpne» i stedet, så A/B forsvinner når man forlater merge (men
  // selve merge-utvalget beholdes i minnet til man kommer tilbake).
  if (aktivFane === 'merge') {
    knapper.appendChild(lagKnapp('A', 'btn btn-small btn-primary', () => lastMergeSegment('a', seg.id)));
    knapper.appendChild(lagKnapp('B', 'btn btn-small btn-red', () => lastMergeSegment('b', seg.id)));
  } else {
    knapper.appendChild(lagKnapp('Åpne', 'btn btn-small btn-primary', () => åpneSegmentIRedigering(seg.id)));
  }
  knapper.appendChild(lagKnapp('Endre', 'btn btn-small', () => endreMetadata(seg)));
  knapper.appendChild(lagKnapp('Slett', 'btn btn-small btn-danger-subtle', () => slettSegment(seg)));
  li.appendChild(knapper);
}

function fyllArenaKort(li, a, ktrl) {
  const navn = document.createElement('div');
  navn.className = 'seg-name';
  navn.textContent = a.navn || 'Uten navn';

  const meta = document.createElement('div');
  meta.className = 'seg-meta';
  meta.textContent = a.feature_count + ' steder' + (a.har_bilde ? '' : ' · uten bilde');
  li.append(navn, meta);

  if (a.beskrivelse) {
    const beskr = document.createElement('div');
    beskr.className = 'seg-desc';
    beskr.textContent = a.beskrivelse;
    beskr.title = a.beskrivelse;
    li.appendChild(beskr);
  }
  if (window.arenaEditor && window.arenaEditor.aktivId &&
      window.arenaEditor.aktivId() === a.id) {
    li.classList.add('aktiv');
  }

  const knapper = document.createElement('div');
  knapper.className = 'seg-buttons';
  knapper.appendChild(lagKnapp('Åpne', 'btn btn-small btn-primary', () => åpneArena(a.id)));
  knapper.appendChild(lagKnapp('Endre', 'btn btn-small', () => endreArenaMetadata(a)));
  knapper.appendChild(lagKnapp('Slett', 'btn btn-small btn-danger-subtle', () => slettArena(a)));
  li.appendChild(knapper);
}

/** Bytt til arenakart-modus og åpne det valgte arenakartet. */
function åpneArena(id) {
  byttFane('arena');
  if (window.arenaEditor && window.arenaEditor.åpne) window.arenaEditor.åpne(id);
}

// --- Gruppehåndtering ---

async function spørOmGruppenavn(tittel, forslag) {
  const dialog = document.getElementById('group-dialog');
  const felt = document.getElementById('group-name');
  document.getElementById('group-dialog-title').textContent = tittel;
  felt.value = forslag || '';
  const løfte = ventPåDialog(dialog);
  felt.select();
  const handling = await løfte;
  const navn = felt.value.trim();
  return handling === 'ok' && navn ? navn : null;
}

async function nyGruppe(ktrl) {
  const navn = await spørOmGruppenavn('Ny gruppe', '');
  if (!navn) return;
  if (ktrl.data.groups[navn] !== undefined) {
    toast('Det finnes allerede en gruppe som heter «' + navn + '»', 'error');
    return;
  }
  ktrl.data.root.unshift({ type: 'group', name: navn });
  ktrl.data.groups[navn] = [];
  await ktrl.lagre();
}

async function giGruppeNyttNavn(ktrl, gammelt) {
  const nytt = await spørOmGruppenavn('Endre gruppenavn', gammelt);
  if (!nytt || nytt === gammelt) return;
  if (ktrl.data.groups[nytt] !== undefined) {
    toast('Det finnes allerede en gruppe som heter «' + nytt + '»', 'error');
    return;
  }
  for (const entry of ktrl.data.root) {
    if (entry.type === 'group' && entry.name === gammelt) entry.name = nytt;
  }
  ktrl.data.groups[nytt] = ktrl.data.groups[gammelt];
  delete ktrl.data.groups[gammelt];
  ktrl.settUtvidet(nytt, ktrl.utvidede().has(gammelt));
  ktrl.settUtvidet(gammelt, false);
  await ktrl.lagre();
}

async function slettGruppe(ktrl, navn) {
  const antall = (ktrl.data.groups[navn] || []).length;
  if (antall > 0 && !confirm(
    'Slette gruppa «' + navn + '»? De ' + antall + ' ' + ktrl.cfg.enhet +
    ' i den beholdes og flyttes ut på rotnivået.'
  )) return;
  const indeks = ktrl.data.root.findIndex((e) => e.type === 'group' && e.name === navn);
  if (indeks === -1) return;
  // Elementene i gruppa legges ut der gruppa sto
  const løse = (ktrl.data.groups[navn] || []).map((id) => ({ type: ktrl.cfg.entryType, id }));
  ktrl.data.root.splice(indeks, 1, ...løse);
  delete ktrl.data.groups[navn];
  ktrl.settUtvidet(navn, false);
  await ktrl.lagre();
}

// --- De to biblioteks-instansene ---

const segmentBib = lagBibliotek({
  listeId: 'segment-list', emptyId: 'library-empty',
  entryType: 'segment', dndPrefiks: 'seg', enhet: 'segmenter',
  endepunkt: '/api/library', utvidetNøkkel: 'gps-tool.seg-utvidede',
  hent: async () => {
    const [segRes, libRes] = await Promise.all([api('/api/segments'), api('/api/library')]);
    const info = {};
    for (const s of (await segRes.json()).segments) info[s.id] = s;
    return { struktur: await libRes.json(), info };
  },
  fyllKort: fyllSegmentKort,
});

const arenaBib = lagBibliotek({
  listeId: 'arena-list', emptyId: 'arena-library-empty',
  entryType: 'arena', dndPrefiks: 'arn', enhet: 'arenakart',
  endepunkt: '/api/arena-library', utvidetNøkkel: 'gps-tool.arena-utvidede',
  hent: async () => {
    const [arRes, libRes] = await Promise.all([api('/api/arenas'), api('/api/arena-library')]);
    const info = {};
    for (const a of (await arRes.json()).arenas) info[a.id] = a;
    return { struktur: await libRes.json(), info };
  },
  fyllKort: fyllArenaKort,
});

// Wrappere med de gamle navnene, så resten av koden (og arena.js via window)
// kan be om en oppfriskning uten å kjenne kontrollerne.
async function oppdaterBibliotek() { await segmentBib.oppdater(); }
async function oppdaterArenabibliotek() { await arenaBib.oppdater(); }
window.oppdaterArenabibliotek = oppdaterArenabibliotek;

document.getElementById('btn-new-group').addEventListener('click', () => nyGruppe(segmentBib));
document.getElementById('btn-new-arena-group').addEventListener('click', () => nyGruppe(arenaBib));

// Sammenleggbare bibliotek-seksjoner. Alle starter kollapset (satt i HTML);
// modusbytte ekspanderer det relevante biblioteket (se byttFane). Manuell
// klikking på overskriften veksler også.
// De delte bibliotekene hentes ferskt hver gang de åpnes (bruk og grupper kan
// ha endret seg mens seksjonen var lukket).
const BIB_LASTERE = {
  'library-punkt': () => oppdaterPunktbibliotek(),
  'library-kontakt': () => oppdaterKontaktbibliotek(),
};

for (const knapp of document.querySelectorAll('.library-toggle')) {
  const seksjon = document.getElementById(knapp.dataset.lib);
  knapp.addEventListener('click', () => {
    const skjult = seksjon.classList.toggle('kollapset');
    const laster = BIB_LASTERE[knapp.dataset.lib];
    if (!skjult && laster) laster();
  });
}

/**
 * Ekspander bibliotekene som hører til modusen, og kollaps de andre:
 *   Rediger segment      → kun segment (punktlista er lang; åpnes ved behov)
 *   Slå sammen segmenter → kun segment
 *   Rediger arenakart    → arenakart + kontakt (kontaktene hører til arenaene)
 * Gruppenes utvidet-tilstand ligger i hvert biblioteks eget minne og
 * restaureres automatisk når seksjonen åpnes igjen.
 */
function visBibliotekFor(modus) {
  const åpne = {
    editor: ['library-segment'],
    merge: ['library-segment'],
    arena: ['library-arena', 'library-kontakt'],
  }[modus] || [];
  for (const id of ['library-segment', 'library-arena', 'library-punkt', 'library-kontakt']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const skalÅpnes = åpne.includes(id);
    const varKollapset = el.classList.contains('kollapset');
    el.classList.toggle('kollapset', !skalÅpnes);
    // Frisk data når et delt bibliotek går fra lukket til åpent
    if (skalÅpnes && varKollapset && BIB_LASTERE[id]) BIB_LASTERE[id]();
  }
}

// --- Dra og slipp: fritt endre rekkefølge og gruppetilhørighet ---
// Hvert element bærer '<prefiks>:<id>' (seg/arn) eller 'grp:<navn>' i
// dataset.dnd. Slipp OVER/UNDER et element = ny plassering; slipp PÅ en
// gruppeoverskrift = legg elementet i gruppa. dndKtrl holder hvilket bibliotek
// draget gjelder, så man ikke kan dra på tvers av segment- og arenalista.

let dndKilde = null; // dataset.dnd for elementet som dras
let dndKtrl = null;  // bibliotek-kontrolleren draget hører til

function kobleDragOgSlipp(el, ktrl) {
  el.addEventListener('dragstart', (e) => {
    dndKilde = el.dataset.dnd;
    dndKtrl = ktrl;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dndKilde);
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    ryddDndMarkering();
    dndKilde = null;
    dndKtrl = null;
  });
  el.addEventListener('dragover', (e) => {
    // Bare innenfor samme bibliotek (kan ikke dra segment til arena-lista)
    if (!dndKilde || dndKtrl !== ktrl || dndKilde === el.dataset.dnd) return;
    // Grupper kan bare plasseres på rotnivået
    if (dndKilde.startsWith('grp:') && el.classList.contains('i-gruppe')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    ryddDndMarkering();
    const rekt = el.getBoundingClientRect();
    if (!dndKilde.startsWith('grp:') && el.dataset.dnd.startsWith('grp:')) {
      // Element over gruppeoverskrift: midten = inn i gruppa, kantene = før/etter
      const relativ = (e.clientY - rekt.top) / rekt.height;
      if (relativ > 0.3 && relativ < 0.7) { el.classList.add('dnd-into'); return; }
    }
    el.classList.add(e.clientY < rekt.top + rekt.height / 2 ? 'dnd-over-top' : 'dnd-over-bottom');
  });
  el.addEventListener('dragleave', () => {
    el.classList.remove('dnd-over-top', 'dnd-over-bottom', 'dnd-into');
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dndKilde || dndKtrl !== ktrl || dndKilde === el.dataset.dnd) return;
    const innIGruppe = el.classList.contains('dnd-into');
    const før = el.classList.contains('dnd-over-top');
    ryddDndMarkering();
    utførSlipp(ktrl, dndKilde, el.dataset.dnd, { innIGruppe, før });
  });
}

function ryddDndMarkering() {
  for (const el of document.querySelectorAll('.dnd-over-top, .dnd-over-bottom, .dnd-into')) {
    el.classList.remove('dnd-over-top', 'dnd-over-bottom', 'dnd-into');
  }
}

/** Fjern et element fra strukturen (uansett hvor det står). */
function fjernFraStruktur(ktrl, id) {
  const t = ktrl.cfg.entryType;
  ktrl.data.root = ktrl.data.root.filter((e) => !(e.type === t && e.id === id));
  for (const navn of Object.keys(ktrl.data.groups)) {
    ktrl.data.groups[navn] = ktrl.data.groups[navn].filter((x) => x !== id);
  }
}

function utførSlipp(ktrl, kilde, mål, valg) {
  const t = ktrl.cfg.entryType;
  const prefiks = ktrl.cfg.dndPrefiks + ':';
  if (kilde.startsWith(prefiks)) {
    const id = kilde.slice(prefiks.length);
    fjernFraStruktur(ktrl, id);

    if (valg.innIGruppe && mål.startsWith('grp:')) {
      // Slippt på en gruppeoverskrift: legg elementet bakerst i gruppa
      ktrl.data.groups[mål.slice(4)].push(id);
    } else if (mål.startsWith(prefiks)) {
      const målId = mål.slice(prefiks.length);
      // Ligger målelementet i en gruppe, havner vi i samme gruppe
      const gruppe = Object.keys(ktrl.data.groups)
        .find((g) => ktrl.data.groups[g].includes(målId));
      if (gruppe) {
        const i = ktrl.data.groups[gruppe].indexOf(målId);
        ktrl.data.groups[gruppe].splice(valg.før ? i : i + 1, 0, id);
      } else {
        const i = ktrl.data.root.findIndex((e) => e.type === t && e.id === målId);
        ktrl.data.root.splice(valg.før ? i : i + 1, 0, { type: t, id });
      }
    } else {
      // Før/etter en gruppeoverskrift på rotnivået
      const i = ktrl.data.root.findIndex((e) => e.type === 'group' && e.name === mål.slice(4));
      ktrl.data.root.splice(valg.før ? i : i + 1, 0, { type: t, id });
    }
  } else {
    // Flytte en hel gruppe på rotnivået
    const navn = kilde.slice(4);
    const fra = ktrl.data.root.findIndex((e) => e.type === 'group' && e.name === navn);
    if (fra === -1) return;
    const [entry] = ktrl.data.root.splice(fra, 1);
    let i;
    if (mål.startsWith('grp:')) {
      i = ktrl.data.root.findIndex((e) => e.type === 'group' && e.name === mål.slice(4));
    } else {
      i = ktrl.data.root.findIndex((e) => e.type === t && e.id === mål.slice(prefiks.length));
    }
    if (i === -1) { ktrl.data.root.splice(fra, 0, entry); return; }
    ktrl.data.root.splice(valg.før ? i : i + 1, 0, entry);
  }
  ktrl.lagre();
}

function lagKnapp(tekst, klasse, onClick) {
  const b = document.createElement('button');
  b.textContent = tekst;
  b.className = klasse;
  b.addEventListener('click', onClick);
  return b;
}

/** Endre metadata på et lagret segment (punktene røres ikke). */
async function endreMetadata(seg) {
  const meta = await spørOmMeta('Endre segmentet', {
    navn: seg.name, beskrivelse: seg.description,
    creator: seg.creator, link: seg.link,
    copyright: seg.copyright, nøkkelord: seg.keywords,
  });
  if (!meta) return;
  try {
    await api('/api/segments/' + seg.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: meta.navn, description: meta.beskrivelse,
        creator: meta.creator, link: meta.link,
        copyright: meta.copyright, keywords: meta.nøkkelord,
      }),
    });
    toast('Segmentet er oppdatert');
    oppdaterBibliotek();
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

async function slettSegment(seg) {
  if (!confirm('Slette segmentet «' + seg.name + '»? Dette kan ikke angres.')) return;
  try {
    await api('/api/segments/' + seg.id, { method: 'DELETE' });
    toast('Segmentet «' + seg.name + '» er slettet');
    oppdaterBibliotek();
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

/** Liten dialog for arenakartets navn + beskrivelse. Returnerer {navn,
 *  beskrivelse} eller null ved avbryt. */
async function spørOmArenaMeta(forslag) {
  const dialog = document.getElementById('arena-meta-dialog');
  const navnFelt = document.getElementById('arena-meta-navn');
  const beskrFelt = document.getElementById('arena-meta-beskr');
  navnFelt.value = forslag.navn || '';
  beskrFelt.value = forslag.beskrivelse || '';
  const løfte = ventPåDialog(dialog);
  navnFelt.select();
  const handling = await løfte;
  const navn = navnFelt.value.trim();
  if (handling !== 'ok' || !navn) return null;
  return { navn, beskrivelse: beskrFelt.value.trim() || null };
}

/** Endre navn/beskrivelse på et arenakart uten å laste hele editoren.
 *  Leser arenaen, bytter feltene og lagrer den tilbake (PUT /api/arenas/{id}). */
async function endreArenaMetadata(a) {
  const meta = await spørOmArenaMeta({ navn: a.navn, beskrivelse: a.beskrivelse });
  if (!meta) return;
  try {
    const arena = await (await api('/api/arenas/' + a.id)).json();
    arena.navn = meta.navn;
    arena.beskrivelse = meta.beskrivelse;
    await api('/api/arenas/' + a.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(arena),
    });
    toast('Arenakartet er oppdatert');
    oppdaterArenabibliotek();
    // Er det samme arenakart som er åpent i editoren, oppdater navnet der også
    if (window.arenaEditor && window.arenaEditor.aktivId
        && window.arenaEditor.aktivId() === a.id && window.arenaEditor.settNavn) {
      window.arenaEditor.settNavn(meta.navn, meta.beskrivelse);
    }
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

async function slettArena(a) {
  if (!confirm('Slette arenakartet «' + (a.navn || 'Uten navn') +
    '»? Dette kan ikke angres.')) return;
  try {
    await api('/api/arenas/' + a.id, { method: 'DELETE' });
    toast('Arenakartet «' + (a.navn || 'Uten navn') + '» er slettet');
    // Er det åpne arenakartet slettet, nullstill editoren
    if (window.arenaEditor && window.arenaEditor.aktivId
        && window.arenaEditor.aktivId() === a.id && window.arenaEditor.nyttArena) {
      window.arenaEditor.nyttArena();
    }
    oppdaterArenabibliotek();
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

// ============================================================
// 5. Redigeringsvisningen
// ============================================================

const editorState = {
  navn: null,        // sporets navn (arves til lagring/eksport)
  beskrivelse: null, // sporets beskrivelse (arves på samme måte)
  creator: null,     // hvem/hva som laget sporet (arves)
  link: null,        // tilhørende lenke (arves)
  copyright: null,   // rettighetshaver (arves)
  nøkkelord: null,   // nøkkelord (arves)
  starttid: null,    // starttidspunkt for første punkt (arves)
  adressenavn: null, // ønsket publiseringsadresse (slug) — arves/importeres
  oversettelser: null, // engelsk tittel/beskrivelse for visningen {en:{navn,beskrivelse}} — huskes/importeres
  standard_sprak: null, // standardspråk for den publiserte visningen (no/en) — huskes/importeres
  importertStil: null, // stil fra en importert .loype-fil (overstyrer lokal UI ved publisering)
  punkter: null,     // hele punktlista
  veipunkter: [],    // interessepunkter (PoI) — {lat, lon, ele, name, desc, types}
  kilde: null,       // hvor løypa kom fra: {type:'segment',id} | {type:'gpx',håndtak,filnavn} | {type:'ulagret'}
  avstander: null,   // kumulativ avstand per punkt
  valgtIdx: 0,       // hvor markøren står
  startIdx: null,    // merket startpunkt (null = ikke satt)
  sluttIdx: null,    // merket sluttpunkt
  høydekilde: 'gpx', // 'gpx' = filas egne høyder, 'dem' = Kartverkets terrengmodell
  gpxHøyder: null,   // originalhøydene, så man kan bytte tilbake
  demHøyder: null,   // mellomlagrede terrenghøyder (hentes bare én gang per spor)
  // Kartlag:
  spor: null, utsnitt: null, posMarkør: null, startMarkør: null, sluttMarkør: null,
  wptMarkører: [],
};

const eSlider = document.getElementById('editor-slider');

/** Metadataene som arves videre til lagring/eksport fra redigeringsvisningen. */
function editorMeta() {
  return {
    navn: editorState.navn,
    beskrivelse: editorState.beskrivelse,
    creator: editorState.creator,
    link: editorState.link,
    copyright: editorState.copyright,
    nøkkelord: editorState.nøkkelord,
    starttid: editorState.starttid,
    adressenavn: editorState.adressenavn,
  };
}

function lastSporIRedigering(navn, beskrivelse, punkter, creator, link, meta) {
  meta = meta || {};
  editorState.navn = navn;
  editorState.beskrivelse = beskrivelse || null;
  editorState.creator = creator || null;
  editorState.link = link || null;
  editorState.copyright = meta.copyright || null;
  editorState.nøkkelord = meta.nøkkelord || null;
  editorState.starttid = meta.starttid || null;
  editorState.adressenavn = meta.adressenavn || null;
  editorState.oversettelser = meta.oversettelser || null;
  editorState.standard_sprak = meta.standard_sprak || null;
  editorState.importertStil = meta.importertStil || null;
  editorState.veipunkter = meta.veipunkter || [];
  editorState.kilde = meta.kilde || null;
  oppdaterWptKnapp();
  editorState.høydekilde = 'gpx';
  editorState.gpxHøyder = null;
  editorState.demHøyder = null;
  oppdaterHøydekildeKnapp();
  editorState.punkter = punkter;
  editorState.avstander = kumulativAvstand(punkter);
  editorState.valgtIdx = 0;
  editorState.startIdx = null;
  editorState.sluttIdx = null;

  document.getElementById('editor-controls').classList.remove('hidden');
  document.getElementById('editor-hint').classList.add('hidden');
  const navnEl = document.getElementById('editor-track-name');
  navnEl.textContent = navn || 'Uten navn';
  navnEl.title = beskrivelse || '';
  oppdaterEditorMeta();

  eSlider.max = punkter.length - 1;
  eSlider.value = 0;

  sørgForStartOgMål();
  byttFane('editor');
  tegnRedigeringsscene();
  settRedigeringsIndeks(0);

  // Kartverkets terrenghøyder er standard: GPS-målte høyder er upresise,
  // så vi bytter automatisk. Feiler hentingen (f.eks. uten nett) beholdes
  // GPX-filas høyder, og knappen kan brukes til å prøve igjen senere.
  // En importert .loype-fil har allerede opphavspersonens valgte høyder —
  // dem beholder vi som de er (henter ikke på nytt), så visningen blir
  // nøyaktig slik den ble sendt inn.
  if (!meta.beholdHøyder) {
    byttHøydekilde().catch(() => { /* beholder GPX-høydene */ });
  }
}

/**
 * Metadatalinja for sporet: punkter, distanse og høydemeter opp/ned.
 * Høydemeterne beregnes fra gjeldende høydekilde (GPX eller Kartverket)
 * og med brukerens utjevningsvalg — samme grunnlag som profilen viser.
 */
function oppdaterEditorMeta() {
  const s = editorState;
  if (!s.punkter) return;
  document.getElementById('editor-track-meta').textContent =
    s.punkter.length + ' punkter · ' +
    fmtKm(s.avstander[s.punkter.length - 1]) +
    høydemeterTekst(s.punkter);
}

// ---- Interessepunkter (PoI / waypoints) ----
// (WPT_SYMBOLER, sorterTyper, ikonRader, symbolGlyphHtml, tegnSymbolCanvas,
//  wptType og wptTyper ligger i felles.js — delt med løypevisningen)

/**
 * Veipunktene slik de skrives til GPX: ETT <wpt> per interessepunkt
 * (tidligere ble det ett per symbol — det ga et mylder av «Generelt
 * punkt» i Garmin Connect). Primærsymbolet legges i <sym>, alle
 * kategoriene i <type> (kommaseparert — leses tilbake ved import), og
 * en lesbar tjenesteliste + beskrivelsen i <cmt>/kommentarfeltet, som
 * er det Garmin viser som merknad. Punkter med «snap» eksporteres på
 * nærmeste løypepunkt, slik de vises.
 */
function eksportVeipunkter(veipunkter) {
  return veipunkter.map((w) => {
    const typer = wptTyper(w);
    const def = WPT_SYMBOLER[typer[0]] || WPT_SYMBOLER.annet;
    const tjenester = typer
      .map((t) => (WPT_SYMBOLER[t] || WPT_SYMBOLER.annet).navn).join(', ');
    const pos = wptPosisjon(w);
    return {
      lat: pos.lat, lon: pos.lng, ele: w.ele == null ? null : w.ele,
      name: w.name, desc: w.desc || null,
      sym: def.sym, type: typer.join(','),
      cmt: tjenester + (w.desc ? ' — ' + w.desc : ''),
    };
  });
}

/** Indeksen til sporpunktet som ligger nærmest et lat/lon-punkt. */
function nærmesteSporIndeks(punkt) {
  const pts = editorState.punkter;
  if (!pts || pts.length === 0) return 0;
  const steg = Math.max(1, Math.floor(pts.length / 4000));
  let besteI = 0, besteD = Infinity;
  for (let i = 0; i < pts.length; i += steg) {
    const d = avstandKm(punkt, pts[i]);
    if (d < besteD) { besteD = d; besteI = i; }
  }
  return besteI;
}

/** Sørg for at spor UTEN veipunkter får start- og målpunkt automatisk. */
function sørgForStartOgMål() {
  const s = editorState;
  if (!s.punkter || s.punkter.length === 0) return;
  // Har sporet veipunkter fra før, respekteres de som de er — også at
  // brukeren har slettet Start/Mål. (Uten denne sjekken ble slettede
  // Start/Mål-punkter gjenopprettet hver gang segmentet ble åpnet.)
  if (s.veipunkter.length > 0) return;
  const typer = s.veipunkter.map(wptType);
  if (!typer.includes('start')) {
    const p = s.punkter[0];
    s.veipunkter.unshift({
      lat: p.lat, lon: p.lon, ele: p.ele, name: 'Start',
      desc: 'Start for ' + (s.navn || 'løypa'),
      sym: WPT_SYMBOLER.start.sym, type: 'start',
    });
  }
  if (!typer.includes('maal')) {
    const p = s.punkter[s.punkter.length - 1];
    s.veipunkter.push({
      lat: p.lat, lon: p.lon, ele: p.ele, name: 'Mål',
      desc: 'Mål for ' + (s.navn || 'løypa'),
      sym: WPT_SYMBOLER.maal.sym, type: 'maal',
    });
  }
}

/**
 * Nøkkeltall for et veipunkt som vises i dialogen: avstand fra start og
 * fra forrige punkt, samt høydemeter (opp/ned) fra start og fra forrige.
 * `idx` er sporindeksen der punktet ligger. «Forrige» er veipunktet med
 * høyest sporindeks før dette (start regnes som et veipunkt).
 */
function wptStatistikk(idx, hoppOverIndeks) {
  const s = editorState;
  const avst = s.avstander;

  // Finn forrige veipunkts sporindeks (ekskluder punktet vi redigerer selv)
  let forrigeIdx = 0;
  s.veipunkter.forEach((w, i) => {
    if (i === hoppOverIndeks) return;
    const wi = nærmesteSporIndeks(w);
    if (wi < idx && wi > forrigeIdx) forrigeIdx = wi;
  });

  const hmStart = høydemeter(s.punkter.slice(0, idx + 1)) || { opp: 0, ned: 0 };
  const hmForrige = høydemeter(s.punkter.slice(forrigeIdx, idx + 1)) || { opp: 0, ned: 0 };
  return {
    avstandStart: avst[idx],
    avstandForrige: avst[idx] - avst[forrigeIdx],
    hmStart, hmForrige,
  };
}

function visWptStatistikk(idx, hoppOverIndeks) {
  const st = wptStatistikk(idx, hoppOverIndeks);
  const rad = (navn, verdi) =>
    '<div class="stat-rad"><span class="stat-navn">' + navn +
    '</span><span class="stat-verdi">' + verdi + '</span></div>';
  document.getElementById('wpt-stats').innerHTML =
    rad('Avstand fra start', fmtKm(st.avstandStart)) +
    rad('Avstand fra forrige punkt', fmtKm(st.avstandForrige)) +
    rad('Høydemeter fra start', '↑ ' + st.hmStart.opp + ' m · ↓ ' + st.hmStart.ned + ' m') +
    rad('Høydemeter fra forrige punkt', '↑ ' + st.hmForrige.opp + ' m · ↓ ' + st.hmForrige.ned + ' m');
}

/**
 * Delte punkter i nærheten av et punkt på sporet — kandidater for
 * gjenbruk. Punkter løypa allerede bruker (samme bib_id) utelates.
 */
async function deltePunkterNær(punkt, maksKm) {
  let delte = [];
  try {
    delte = (await (await api('/api/waypoints')).json()).punkter || [];
  } catch (feil) {
    return []; // gammel server e.l. — bare skjul gjenbruksforslagene
  }
  const brukte = new Set(editorState.veipunkter.map((w) => w.bib_id).filter(Boolean));
  return delte
    .filter((p) => !brukte.has(p.id))
    .map((p) => ({ punkt: p, km: avstandKm(punkt, p) }))
    .filter((k) => k.km < maksKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, 6);
}

/**
 * Dialog for å opprette/redigere et veipunkt (med flere symboler mulig).
 * `wpt` = null betyr nytt punkt (ved markøren). `idx` er sporindeksen
 * punktet ligger på (for statistikken). Returnerer {handling, verdier}
 * — eller {handling:'reuse', delt} når brukeren gjenbruker et delt punkt.
 */
async function visWptDialog(wpt, idx, hoppOverIndeks) {
  const dialog = document.getElementById('wpt-dialog');
  const navnFelt = document.getElementById('wpt-name');
  const beskrFelt = document.getElementById('wpt-desc');
  document.getElementById('wpt-dialog-title').textContent =
    wpt ? 'Rediger interessepunkt' : 'Nytt interessepunkt';
  document.getElementById('wpt-move-btn').classList.toggle('hidden', !wpt);
  document.getElementById('wpt-delete-btn').classList.toggle('hidden', !wpt);
  navnFelt.value = (wpt && wpt.name) || '';
  beskrFelt.value = (wpt && wpt.desc) || '';
  const enO = (wpt && wpt.oversettelser && wpt.oversettelser.en) || {};
  document.getElementById('wpt-name-en').value = enO.name || '';
  document.getElementById('wpt-desc-en').value = enO.desc || '';
  document.getElementById('wpt-vis-ikon').checked = !wpt || wpt.vis_ikon !== false;
  document.getElementById('wpt-del-bib').checked = !!(wpt && wpt.bib_id);
  document.getElementById('wpt-shared-note').classList
    .toggle('hidden', !(wpt && wpt.bib_id));

  // «Snap» tilbys bare for delte punkter som ligger et stykke unna løypa
  // (ellers er det ingen synlig forskjell på snap og eksakt posisjon)
  const avstandFraSpor = wpt ? avstandKm(wpt, editorState.punkter[idx]) : 0;
  const snapAktuelt = !!(wpt && wpt.bib_id && avstandFraSpor > 0.015);
  document.getElementById('wpt-snap-rad').classList.toggle('hidden', !snapAktuelt);
  document.getElementById('wpt-snap').checked = !!(wpt && wpt.snap);
  document.getElementById('wpt-snap-avstand').textContent = snapAktuelt
    ? '(punktet ligger ' + Math.round(avstandFraSpor * 1000) + ' m fra løypa)' : '';
  document.getElementById('wpt-arena').value = (wpt && wpt.arena) || '';

  // Nytt punkt: foreslå delte punkter i nærheten av markøren (ett klikk
  // gjenbruker punktet i denne løypa — samme sted, navn og symboler)
  const gjenbrukBoks = document.getElementById('wpt-reuse');
  const gjenbrukListe = document.getElementById('wpt-reuse-list');
  gjenbrukBoks.classList.add('hidden');
  gjenbrukListe.innerHTML = '';
  let kandidater = [];
  if (!wpt) {
    const her = editorState.punkter[idx];
    kandidater = await deltePunkterNær(her, 0.3);
    for (const k of kandidater) {
      const knapp = document.createElement('button');
      knapp.value = 'reuse-' + k.punkt.id; // ventPåDialog leser submitter.value
      knapp.className = 'wpt-reuse-item';
      knapp.title = k.punkt.desc || '';
      const symboler = wptTyper(k.punkt)
        .map((t) => symbolGlyphHtml(t, 14)).join(' ');
      knapp.innerHTML = '<span class="wpt-reuse-sym">' + symboler + '</span>' +
        '<span class="wpt-reuse-navn"></span>' +
        '<span class="muted">' + Math.round(k.km * 1000) + ' m unna</span>';
      knapp.querySelector('.wpt-reuse-navn').textContent = k.punkt.name;
      gjenbrukListe.appendChild(knapp);
    }
    gjenbrukBoks.classList.toggle('hidden', kandidater.length === 0);
  }

  // Bygg symbol-avkrysningene (én rute per kategori)
  byggSymbolValg(wpt ? wptTyper(wpt) : ['sjekkpunkt']);

  visWptStatistikk(idx, hoppOverIndeks);

  const løfte = ventPåDialog(dialog); // åpner dialogen
  navnFelt.select();
  const handling = await løfte;

  // Gjenbruk av delt punkt: knappene i forslagslista har value 'reuse-<id>'
  if (typeof handling === 'string' && handling.startsWith('reuse-')) {
    const valgt = kandidater.find((k) => 'reuse-' + k.punkt.id === handling);
    return valgt ? { handling: 'reuse', delt: valgt.punkt } : { handling: null };
  }

  if (handling === 'cancel' || (handling === 'ok' && !navnFelt.value.trim())) {
    return { handling: null };
  }
  let typer = [...document.getElementById('wpt-symbols').querySelectorAll('input:checked')]
    .map((b) => b.value);
  if (typer.length === 0) typer.push('annet');
  typer = sorterTyper(typer); // fast visningsrekkefølge
  const primær = WPT_SYMBOLER[typer[0]];
  return {
    handling,
    verdier: {
      name: navnFelt.value.trim() || primær.navn,
      desc: beskrFelt.value.trim() || null,
      types: typer,
      sym: primær.sym,   // representativt enkeltsymbol (bakoverkompat.)
      type: typer[0],
      vis_ikon: document.getElementById('wpt-vis-ikon').checked,
      delBib: document.getElementById('wpt-del-bib').checked,
      // undefined = snap-valget var ikke aktuelt — behold eksisterende verdi
      snap: snapAktuelt ? document.getElementById('wpt-snap').checked : undefined,
      // Arena-lenke (valgfri): «arena» eller «løype/arena». Fjern mellomrom
      // (også rundt skråstreken) og små bokstaver — matcher slug-formatet.
      arena: document.getElementById('wpt-arena').value.trim().toLowerCase()
        .replace(/\s+/g, '') || null,
      // Engelske oversettelser (name/desc) for den publiserte visningen
      oversettelser: byggOversettelser({
        name: document.getElementById('wpt-name-en').value,
        desc: document.getElementById('wpt-desc-en').value,
      }),
    },
  };
}

/** Bygg symbol-avkrysningene (én rute per kategori) i wpt-dialogen, med de
 *  oppgitte typene forhåndsvalgt. Delt av interessepunkt- og delt-punkt-dialogen. */
function byggSymbolValg(valgteTyper) {
  const valgte = new Set(valgteTyper);
  const beholder = document.getElementById('wpt-symbols');
  beholder.innerHTML = '';
  for (const [type, def] of Object.entries(WPT_SYMBOLER)) {
    const rute = document.createElement('label');
    rute.className = valgte.has(type) ? 'valgt' : '';
    rute.innerHTML =
      '<input type="checkbox" value="' + type + '"' + (valgte.has(type) ? ' checked' : '') +
      '><span>' + def.emoji + ' ' + def.navn + '</span>';
    const boks = rute.querySelector('input');
    boks.addEventListener('change', () => rute.classList.toggle('valgt', boks.checked));
    beholder.appendChild(rute);
  }
}

/** Rediger et delt punkt direkte i punktbiblioteket. Gjenbruker wpt-dialogen,
 *  men skjuler alt som bare gir mening i løypekontekst (snap, vis-ikon,
 *  del-bib, gjenbruk, flytt) og viser i stedet hvilke segmenter som bruker
 *  punktet, nederst. Returnerer et Waypoint-formet objekt til
 *  PUT /api/waypoints/{id}, eller null ved avbryt. */
async function redigerDeltPunkt(p, bruktI) {
  const dialog = document.getElementById('wpt-dialog');
  const visIkonRad = document.getElementById('wpt-vis-ikon').closest('.wpt-vis-rad');
  const delBibRad = document.getElementById('wpt-del-bib').closest('.wpt-vis-rad');
  document.getElementById('wpt-dialog-title').textContent = 'Rediger delt punkt';
  for (const id of ['wpt-reuse', 'wpt-shared-note', 'wpt-snap-rad', 'wpt-move-btn']) {
    document.getElementById(id).classList.add('hidden');
  }
  // «Slett» fjerner punktet fra punktbiblioteket (kalleren håndterer det)
  document.getElementById('wpt-delete-btn').classList.remove('hidden');
  visIkonRad.classList.add('hidden');
  delBibRad.classList.add('hidden');
  // Nederst: hvilke segmenter bruker dette delte punktet
  fyllBrukListe('wpt-stats', bruktI || [], (n) => (n === 1 ? 'segment' : 'segmenter'));

  document.getElementById('wpt-name').value = p.name || '';
  document.getElementById('wpt-desc').value = p.desc || '';
  const enO = (p.oversettelser && p.oversettelser.en) || {};
  document.getElementById('wpt-name-en').value = enO.name || '';
  document.getElementById('wpt-desc-en').value = enO.desc || '';
  document.getElementById('wpt-arena').value = p.arena || '';
  byggSymbolValg(wptTyper(p));

  const løfte = ventPåDialog(dialog);
  document.getElementById('wpt-name').select();
  const handling = await løfte;
  // Vis radene igjen så den vanlige interessepunkt-dialogen ikke arver skjult tilstand
  visIkonRad.classList.remove('hidden');
  delBibRad.classList.remove('hidden');
  if (handling === 'delete') return { _slett: true };
  if (handling !== 'ok' || !document.getElementById('wpt-name').value.trim()) return null;

  let typer = [...document.getElementById('wpt-symbols').querySelectorAll('input:checked')]
    .map((b) => b.value);
  if (typer.length === 0) typer.push('annet');
  typer = sorterTyper(typer);
  const primær = WPT_SYMBOLER[typer[0]];
  return {
    lat: p.lat, lon: p.lon, ele: p.ele == null ? null : p.ele,
    name: document.getElementById('wpt-name').value.trim() || primær.navn,
    desc: document.getElementById('wpt-desc').value.trim() || null,
    types: typer, sym: primær.sym, type: typer[0],
    arena: document.getElementById('wpt-arena').value.trim().toLowerCase()
      .replace(/\s+/g, '') || null,
    oversettelser: byggOversettelser({
      name: document.getElementById('wpt-name-en').value,
      desc: document.getElementById('wpt-desc-en').value,
    }),
  };
}

/** Bygg et oversettelser-objekt {en:{felt:tekst}} fra engelske felt (trimmet).
 *  Returnerer null hvis ingen engelske verdier er fylt ut. */
function byggOversettelser(enFelter) {
  const en = {};
  for (const [felt, verdi] of Object.entries(enFelter)) {
    const v = (verdi || '').trim();
    if (v) en[felt] = v;
  }
  return Object.keys(en).length ? { en } : null;
}

/** Sett/fjern én engelsk oversettelse på et objekt in-place (for felt som
 *  redigeres direkte i lister, som typer og bilder). Rydder tomme strukturer. */
function settEnFelt(obj, felt, verdi) {
  const v = (verdi || '').trim();
  if (v) {
    obj.oversettelser = obj.oversettelser || {};
    obj.oversettelser.en = obj.oversettelser.en || {};
    obj.oversettelser.en[felt] = v;
  } else if (obj.oversettelser && obj.oversettelser.en) {
    delete obj.oversettelser.en[felt];
    if (!Object.keys(obj.oversettelser.en).length) delete obj.oversettelser.en;
    if (obj.oversettelser && !Object.keys(obj.oversettelser).length) obj.oversettelser = null;
  }
}

/** Nytt veipunkt der markøren står. */
async function leggTilWpt() {
  const s = editorState;
  if (!s.punkter || !kanRedigereWpt()) return;
  const svar = await visWptDialog(null, s.valgtIdx, -1);

  // Gjenbruk av delt punkt fra punktbiblioteket: legg inn en referanse
  // (med lokal kopi av verdiene) — posisjonen er det delte punktets egen
  if (svar.handling === 'reuse') {
    const d = svar.delt;
    s.veipunkter.push({
      bib_id: d.id, lat: d.lat, lon: d.lon, ele: d.ele,
      name: d.name, desc: d.desc, sym: d.sym, type: d.type, types: d.types,
      arena: d.arena || null, // arenakart-lenken følger med det delte punktet
      oversettelser: d.oversettelser || null, // oversettelsene følger med
      vis_ikon: true,
    });
    tegnVeipunkter();
    if (profilState.synlig) tegnProfil();
    toast('Det delte punktet «' + d.name + '» er lagt til i løypa');
    lagreVeipunkterAuto();
    return;
  }

  if (svar.handling !== 'ok') return;
  const delBib = svar.verdier.delBib;
  delete svar.verdier.delBib; // skal ikke inn i selve veipunktet
  delete svar.verdier.snap;   // nye punkter står på markøren — snap uaktuelt
  const p = s.punkter[s.valgtIdx];
  const wpt = Object.assign({ lat: p.lat, lon: p.lon, ele: p.ele }, svar.verdier);

  // «Delt punkt» avkrysset: legg det i punktbiblioteket først, så
  // veipunktet får referansen (bib_id) med seg i lagringen
  if (delBib) {
    try {
      const res = await api('/api/waypoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wpt),
      });
      wpt.bib_id = (await res.json()).id;
    } catch (feil) {
      toast('Kunne ikke dele punktet: ' + feil.message, 'error');
    }
  }

  s.veipunkter.push(wpt);
  tegnVeipunkter();
  if (profilState.synlig) tegnProfil();
  toast('Punktet «' + wpt.name + '» er lagt til' +
    (wpt.bib_id ? ' (delt — kan gjenbrukes i andre løyper)' : ''));
  lagreVeipunkterAuto();
}

/** Rediger/flytt/slett et eksisterende veipunkt (åpnes ved klikk på kartet). */
async function redigerWpt(indeks) {
  const s = editorState;
  const wpt = s.veipunkter[indeks];
  const idx = nærmesteSporIndeks(wpt);
  const svar = await visWptDialog(wpt, idx, indeks);
  if (!svar.handling) return;
  if (svar.handling === 'delete') {
    s.veipunkter.splice(indeks, 1);
    toast('Punktet «' + wpt.name + '» er slettet' +
      (wpt.bib_id ? ' fra denne løypa (ligger fortsatt i punktbiblioteket)' : ''));
  } else {
    const delBib = svar.verdier.delBib;
    // Behold posisjonen; erstatt bare metadata (navn/beskr/symboler)
    wpt.name = svar.verdier.name;
    wpt.desc = svar.verdier.desc;
    wpt.types = svar.verdier.types;
    wpt.sym = svar.verdier.sym;
    wpt.type = svar.verdier.type;
    wpt.vis_ikon = svar.verdier.vis_ikon;
    wpt.arena = svar.verdier.arena;
    wpt.oversettelser = svar.verdier.oversettelser;
    if (svar.verdier.snap !== undefined) wpt.snap = svar.verdier.snap;
    if (svar.handling === 'move') {
      const p = s.punkter[s.valgtIdx];
      wpt.lat = p.lat; wpt.lon = p.lon; wpt.ele = p.ele;
      wpt.snap = false; // står nå på løypa — snap er uaktuelt
      toast('Punktet «' + wpt.name + '» er flyttet til markøren');
    } else {
      toast('Punktet «' + wpt.name + '» er oppdatert');
    }
    // Delingsstatus endret? Av → koble fra (bibliotekpunktet består, denne
    // løypa får en frittstående kopi). På → legg punktet i biblioteket.
    if (wpt.bib_id && !delBib) {
      wpt.bib_id = null;
      toast('Punktet er koblet fra punktbiblioteket — endringer her gjelder nå bare denne løypa');
    } else if (!wpt.bib_id && delBib) {
      try {
        const res = await api('/api/waypoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wpt),
        });
        wpt.bib_id = (await res.json()).id;
        toast('Punktet «' + wpt.name + '» er delt og kan gjenbrukes i andre løyper');
      } catch (feil) {
        toast('Kunne ikke dele punktet: ' + feil.message, 'error');
      }
    }
  }
  tegnVeipunkter();
  if (profilState.synlig) tegnProfil();
  lagreVeipunkterAuto();
}

/** Fjern et delt punkt fra den åpne segmentvisningen etter at det er slettet
 *  «overalt» fra biblioteket (serveren har alt fjernet det fra segmentfila).
 *  Uten dette ville punktet blitt stående på kartet til segmentet lastes på nytt. */
function fjernSlettetPunktFraEditor(bibId) {
  if (!editorState.veipunkter) return;
  const før = editorState.veipunkter.length;
  editorState.veipunkter = editorState.veipunkter.filter((w) => w.bib_id !== bibId);
  if (editorState.veipunkter.length === før) return; // punktet var ikke i denne løypa
  if (aktivFane === 'editor') {
    tegnVeipunkter();
    if (profilState.synlig) tegnProfil();
  }
}

/** Kan brukeren legge til/endre PoI nå? (Ikke for ulagrede sammenslåinger.) */
function kanRedigereWpt() {
  const k = editorState.kilde;
  if (!k || k.type === 'ulagret') {
    toast('Lagre løypa som segment eller GPX-fil før du legger til interessepunkter', 'error');
    return false;
  }
  return true;
}

/**
 * Lagre veipunktene automatisk til kilden løypa kom fra:
 *  - segment  → PUT til segmentet i biblioteket
 *  - gpx-fil  → skriv oppdatert GPX tilbake til fila (om vi har skrivetilgang)
 */
async function lagreVeipunkterAuto() {
  const k = editorState.kilde;
  if (!k) return;
  try {
    if (k.type === 'segment') {
      await api('/api/segments/' + k.id + '/waypoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: editorState.veipunkter }),
      });
      toast('Interessepunktene er lagret i segmentet');
    } else if (k.type === 'gpx' && k.håndtak) {
      const blob = await byggGpxBlob(
        editorState.punkter, editorMeta(),
        eksportVeipunkter(editorState.veipunkter), null);
      const skriver = await k.håndtak.createWritable();
      await skriver.write(blob);
      await skriver.close();
      toast('GPX-fila «' + k.filnavn + '» er oppdatert');
    } else if (k.type === 'gpx') {
      // Lastet inn uten skrivetilgang (eldre nettleser): kan ikke auto-lagre
      toast('Punktet er lagt til. Bruk «Lagre som GPX» for å skrive det til fil.', 'error');
    }
  } catch (feil) {
    toast('Kunne ikke lagre automatisk: ' + feil.message, 'error');
  }
}

// ---- «Velg delte punkter»: gjenbruk mange punkter langs løypa i ett jafs ----

async function velgDeltePunkter() {
  const s = editorState;
  if (!s.punkter || !kanRedigereWpt()) return;

  // Kandidater: delte punkter innenfor 300 m fra løypa som ikke alt er i bruk
  let delte = [];
  try {
    delte = (await (await api('/api/waypoints')).json()).punkter || [];
  } catch (feil) {
    toast(feil.message, 'error');
    return;
  }
  const brukte = new Set(s.veipunkter.map((w) => w.bib_id).filter(Boolean));
  const kandidater = delte
    .filter((p) => !brukte.has(p.id))
    .map((p) => {
      const idx = nærmesteSporIndeks(p);
      return { punkt: p, idx, fraSporM: avstandKm(p, s.punkter[idx]) * 1000 };
    })
    .filter((k) => k.fraSporM < 300)
    .sort((a, b) => a.idx - b.idx); // i løypas rekkefølge

  if (kandidater.length === 0) {
    toast('Fant ingen nye delte punkter innenfor 300 m fra løypa');
    return;
  }

  // Én rad per kandidat: avkryssing, symboler, navn, posisjon langs løypa —
  // og snap/eksakt-valg for punkter som ligger et stykke unna traseen
  const liste = document.getElementById('wpt-bulk-list');
  liste.innerHTML = '';
  kandidater.forEach((k, i) => {
    const unna = k.fraSporM > 15;
    const rad = document.createElement('div');
    rad.className = 'wpt-bulk-rad';
    const symboler = wptTyper(k.punkt).map((t) => symbolGlyphHtml(t, 14)).join(' ');
    rad.innerHTML =
      '<label class="wpt-bulk-hoved">' +
      '<input type="checkbox" class="wpt-bulk-velg" checked>' +
      '<span class="wpt-reuse-sym">' + symboler + '</span>' +
      '<span class="wpt-reuse-navn"></span>' +
      '<span class="muted">ved ' + fmtKm(s.avstander[k.idx]) +
      (unna ? ' · ' + Math.round(k.fraSporM) + ' m fra løypa' : '') + '</span>' +
      '</label>' +
      (unna
        ? '<span class="wpt-bulk-snapvalg">' +
          '<label><input type="radio" name="snapvalg-' + i +
          '" value="snap" checked> Fest til løypa (snap)</label>' +
          '<label><input type="radio" name="snapvalg-' + i +
          '" value="eksakt"> Eksakt posisjon</label></span>'
        : '');
    rad.querySelector('.wpt-reuse-navn').textContent = k.punkt.name;
    rad.title = k.punkt.desc || '';
    liste.appendChild(rad);
    k.rad = rad;
  });

  // «Velg alle» styrer alle radene
  const alle = document.getElementById('wpt-bulk-alle');
  alle.checked = true;
  alle.onchange = () => liste.querySelectorAll('.wpt-bulk-velg')
    .forEach((b) => { b.checked = alle.checked; });

  const handling = await ventPåDialog(document.getElementById('wpt-bulk-dialog'));
  if (handling !== 'ok') return;

  let lagt = 0;
  for (const k of kandidater) {
    if (!k.rad.querySelector('.wpt-bulk-velg').checked) continue;
    const snapValg = k.rad.querySelector('input[type=radio]:checked');
    const d = k.punkt;
    s.veipunkter.push({
      bib_id: d.id, lat: d.lat, lon: d.lon, ele: d.ele,
      name: d.name, desc: d.desc, sym: d.sym, type: d.type, types: d.types,
      arena: d.arena || null, // arenakart-lenken følger med det delte punktet
      oversettelser: d.oversettelser || null, // oversettelsene følger med
      vis_ikon: true,
      snap: !!(snapValg && snapValg.value === 'snap'),
    });
    lagt++;
  }
  if (lagt === 0) return;
  tegnVeipunkter();
  if (profilState.synlig) tegnProfil();
  toast(lagt === 1 ? 'Ett delt punkt er lagt til i løypa'
    : lagt + ' delte punkter er lagt til i løypa');
  lagreVeipunkterAuto();
}

document.getElementById('btn-pick-shared').addEventListener('click', velgDeltePunkter);

// ============================================================
// Delte bibliotek i venstre stolpe (punkter og kontakter)
// ============================================================
// Punkt- og kontaktbiblioteket oppfører seg likt: en liste med delte elementer
// der antallet kart de brukes i står i parentes, og ÉN samlet filtermeny med
// to bolker — gruppene (fra segment-/arenakartbiblioteket) øverst og de
// enkelte kartene under. Filteret er et ELLER: et element vises hvis det
// brukes i minst ett av de avkryssede kartene, eller i et kart som ligger i
// en av de avkryssede gruppene. lagDeltBibliotek() lager én slik kontroller.

function lagDeltBibliotek(cfg) {
  const ktrl = {
    cfg,
    elementer: [],
    bruk: {},            // {id: [kartnavn]}
    valgtFilter: null,   // Set med «g:<gruppe>»/«e:<kart>», null = alt (ingen filtrering)
    sortering: cfg.sorteringer ? cfg.sorteringer[0].verdi : null,

    async oppdater() {
      try {
        const svar = await (await api(cfg.endepunkt + '?bruk=1')).json();
        ktrl.elementer = svar[cfg.dataNøkkel] || [];
        ktrl.bruk = svar.bruk || {};
      } catch (feil) {
        toast(feil.message, 'error');
        return;
      }
      ktrl.byggFilter();
      ktrl.tegn();
    },

    /** {kartnavn: gruppenavn} fra det tilhørende kart-biblioteket. */
    gruppeForKart() {
      const kilde = cfg.kartBibliotek();
      const kart = {};
      for (const [gruppe, ids] of Object.entries(kilde.data.groups || {})) {
        for (const id of ids) {
          const navn = kilde.info[id] && cfg.kartNavn(kilde.info[id]);
          if (navn) kart[navn] = gruppe;
        }
      }
      return kart;
    },

    byggFilter() {
      const grupper = Object.keys(cfg.kartBibliotek().data.groups || {})
        .sort((a, b) => a.localeCompare(b, 'no'));
      const enheter = [...new Set(Object.values(ktrl.bruk).flat())]
        .sort((a, b) => a.localeCompare(b, 'no'));
      byggFiltermeny(cfg.filterId, [
        { etikett: 'Grupper', prefiks: 'g', verdier: grupper },
        { etikett: cfg.enhetEtikett, prefiks: 'e', verdier: enheter },
      ], ktrl.valgtFilter, (valgt) => { ktrl.valgtFilter = valgt; ktrl.tegn(); });
    },

    /**
     * Passerer elementet filteret? Alt avkrysset (valgtFilter === null) betyr
     * ingen filtrering — da vises også elementer som ikke er i bruk noe sted.
     * Ellers holder det at elementet brukes i ETT avkrysset kart, eller i et
     * kart som ligger i en avkrysset gruppe (ELLER, ikke OG).
     */
    passerer(el) {
      if (!ktrl.valgtFilter) return true;
      const bruktI = ktrl.bruk[el.id] || [];
      const gruppeFor = ktrl.gruppeForKart();
      return bruktI.some((navn) =>
        ktrl.valgtFilter.has('e:' + navn) ||
        ktrl.valgtFilter.has('g:' + gruppeFor[navn]));
    },

    tegn() {
      const liste = document.getElementById(cfg.listeId);
      const tom = document.getElementById(cfg.tomId);
      if (!liste) return;
      liste.innerHTML = '';
      if (ktrl.elementer.length === 0) {
        tom.textContent = cfg.tomTekst;
        tom.classList.remove('hidden');
        return;
      }
      const synlige = ktrl.elementer.filter((el) => ktrl.passerer(el));
      if (synlige.length === 0) {
        tom.textContent = 'Ingen treff med dette filteret.';
        tom.classList.remove('hidden');
        return;
      }
      // Stigende alfabetisk på valgt sorteringsnøkkel
      const nøkkel = cfg.sorteringsnøkkel(ktrl.sortering);
      synlige.sort((a, b) => String(nøkkel(a) || '')
        .localeCompare(String(nøkkel(b) || ''), 'no', { sensitivity: 'base' }));
      tom.classList.add('hidden');
      for (const el of synlige) liste.appendChild(ktrl.lagRad(el));
    },

    /** Én kompakt linje: navn (med antall i parentes) og en «…»-meny med
     *  Endre/Slett, så lista tar minst mulig plass i venstre stolpe.
     *  Klikk på selve linja åpner redigeringen (som «Endre»). */
    lagRad(el) {
      const bruktI = ktrl.bruk[el.id] || [];
      const rad = document.createElement('div');
      rad.className = 'lib-linje';

      const navn = document.createElement('span');
      navn.className = 'lib-linje-navn';
      navn.textContent = cfg.radTekst(el, ktrl.sortering) +
        (bruktI.length ? ' (' + bruktI.length + ')' : '');
      navn.title = cfg.radTittel(el) + '\n' +
        (bruktI.length ? 'Brukes i: ' + bruktI.join(', ') : 'Ikke i bruk');
      navn.addEventListener('click', () => ktrl.visEndre(el, bruktI));

      rad.append(navn, lagRadMeny([
        { tekst: 'Endre', handling: () => ktrl.visEndre(el, bruktI) },
        { tekst: 'Slett', klasse: 'farlig', handling: () => ktrl.slett(el) },
      ]));
      return rad;
    },

    async visEndre(el, bruktI) {
      const verdier = await cfg.rediger(el, bruktI);
      if (!verdier) return;
      // «Slett» i redigeringsdialogen kommer tilbake hit som en markør
      if (verdier._slett) { ktrl.slett(el); return; }
      try {
        await api(cfg.endepunkt + '/' + el.id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(verdier),
        });
        toast(cfg.lagretTekst(verdier));
        ktrl.oppdater();
      } catch (feil) { toast(feil.message, 'error'); }
    },

    /** Opprett et nytt delt element rett i biblioteket (uten å koble det til
     *  noe kart ennå). cfg.nytt() gir verdiene, eller null ved avbryt. */
    async nytt() {
      const verdier = await cfg.nytt();
      if (!verdier) return;
      try {
        await api(cfg.endepunkt, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(verdier),
        });
        toast(cfg.opprettetTekst(verdier));
        ktrl.oppdater();
      } catch (feil) { toast(feil.message, 'error'); }
    },

    async slett(el) {
      const bruktI = ktrl.bruk[el.id] || [];
      const valg = await spørSlettDelt(cfg, el, bruktI.length);
      if (!valg) return; // avbrutt
      const url = cfg.endepunkt + '/' + el.id + (valg === 'alle' ? '?fjern_bruk=1' : '');
      try {
        await api(url, { method: 'DELETE' });
        toast('«' + cfg.navnFor(el) + '» er fjernet' +
          (valg === 'alle' && bruktI.length ? ' fra biblioteket og alle ' + bruktI.length + ' ' + cfg.enhetFlertall : ''));
        ktrl.oppdater();
        if (cfg.etterSlett) cfg.etterSlett(el, valg);
      } catch (feil) { toast(feil.message, 'error'); }
    },
  };
  return ktrl;
}

/**
 * En liten «…»-meny for en listelinje. Sparer plassen to knapper ville tatt.
 * `valg` = [{tekst, handling, klasse}]. Bare én meny er åpen om gangen;
 * dokument-lytteren nedenfor lukker den ved klikk utenfor eller Escape.
 */
function lagRadMeny(valg) {
  const meny = document.createElement('div');
  meny.className = 'rad-meny';
  const knapp = document.createElement('button');
  knapp.type = 'button';
  knapp.className = 'rad-meny-knapp';
  knapp.textContent = '…';
  knapp.title = 'Flere valg';
  const innhold = document.createElement('div');
  innhold.className = 'rad-meny-innhold';
  for (const v of valg) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rad-meny-valg' + (v.klasse ? ' ' + v.klasse : '');
    b.textContent = v.tekst;
    b.addEventListener('click', () => { lukkRadMenyer(); v.handling(); });
    innhold.appendChild(b);
  }
  knapp.addEventListener('click', (e) => {
    e.stopPropagation();
    const var_åpen = meny.classList.contains('apen');
    lukkRadMenyer();
    if (!var_åpen) meny.classList.add('apen');
  });
  meny.append(knapp, innhold);
  return meny;
}

function lukkRadMenyer() {
  for (const m of document.querySelectorAll('.rad-meny.apen')) m.classList.remove('apen');
}
document.addEventListener('click', lukkRadMenyer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lukkRadMenyer(); });

/**
 * Spør hvordan et delt punkt/en delt kontakt skal slettes: bare fjernes som
 * delt (kartene beholder egne kopier) eller slettes fra alle kartene også.
 * Er elementet ikke i bruk noen steder, holder det med en enkel bekreftelse.
 * Returnerer 'bare' | 'alle' | null (avbrutt).
 */
async function spørSlettDelt(cfg, el, antallBruk) {
  const dialog = document.getElementById('slett-delt-dialog');
  document.getElementById('slett-delt-tittel').textContent =
    'Slette «' + cfg.navnFor(el) + '»';
  const bare = document.getElementById('slett-delt-bare');
  const alle = document.getElementById('slett-delt-alle');
  if (antallBruk === 0) {
    // Ikke i bruk noe sted — da er «bare fjerne» og «slette overalt» det samme
    document.getElementById('slett-delt-tekst').textContent =
      cfg.deltEnhet + ' er ikke i bruk i noen ' + cfg.enhetFlertall + '. Slette den?';
    bare.textContent = 'Slett';
    alle.classList.add('hidden');
  } else {
    document.getElementById('slett-delt-tekst').textContent =
      cfg.deltEnhet + ' brukes i ' + antallBruk + ' ' +
      (antallBruk === 1 ? cfg.enhetEntall : cfg.enhetFlertall) + '. Hva vil du gjøre?';
    bare.textContent = 'Kun fjern som delt';
    bare.title = 'Fjern fra biblioteket, men behold en frittstående kopi i hvert ' +
      cfg.enhetEntall;
    alle.textContent = 'Slett overalt';
    alle.title = 'Slett fra biblioteket OG fra alle ' + cfg.enhetFlertall + ' som bruker den';
    alle.classList.remove('hidden');
  }
  const handling = await ventPåDialog(dialog);
  alle.classList.remove('hidden'); // rydd tilbake til utgangstilstand
  if (handling === 'bare' || handling === 'alle') return handling;
  return null;
}

/**
 * Bygg den samlede filtermenyen: «Velg / fjern alle» øverst, så én bolk per
 * kategori (grupper, deretter kartene). Verdiene lagres med prefiks («g:»/«e:»)
 * så et gruppenavn og et kartnavn kan være like uten å kollidere.
 * `valgt` er et Set med prefiksede verdier, eller null = alt valgt.
 * `onEndret` får nytt Set — eller null når ALT er avkrysset (ingen filtrering).
 */
function byggFiltermeny(beholderId, bolker, valgt, onEndret) {
  const boks = document.getElementById(beholderId);
  if (!boks) return;
  boks.innerHTML = '';
  const alleNøkler = [];
  for (const b of bolker) for (const v of b.verdier) alleNøkler.push(b.prefiks + ':' + v);
  // Behold bare valg som fortsatt finnes (grupper/kart kan ha blitt slettet)
  const gyldige = valgt ? new Set([...valgt].filter((v) => alleNøkler.includes(v))) : null;
  const alleValgt = !gyldige || gyldige.size === alleNøkler.length;

  const sammendrag = document.createElement('summary');
  const settSammendrag = (antall) => {
    sammendrag.textContent = 'Filtrering: ' +
      (antall === alleNøkler.length ? 'alle' : antall + ' av ' + alleNøkler.length);
  };
  settSammendrag(alleValgt ? alleNøkler.length : gyldige.size);
  boks.appendChild(sammendrag);

  if (alleNøkler.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Ingen å filtrere på ennå.';
    boks.appendChild(p);
    return;
  }

  const meld = () => {
    const nye = new Set([...boks.querySelectorAll('.filter-verdi:checked')]
      .map((b) => b.value));
    const alle = nye.size === alleNøkler.length;
    settSammendrag(nye.size);
    alleBoks.checked = alle;
    onEndret(alle ? null : nye); // alle = ingen filtrering
  };

  const alleRad = document.createElement('label');
  alleRad.className = 'filter-rad filter-alle';
  const alleBoks = document.createElement('input');
  alleBoks.type = 'checkbox';
  alleBoks.checked = alleValgt;
  alleBoks.addEventListener('change', () => {
    for (const b of boks.querySelectorAll('.filter-verdi')) b.checked = alleBoks.checked;
    meld();
  });
  alleRad.append(alleBoks, document.createTextNode('Velg / fjern alle'));
  boks.appendChild(alleRad);

  for (const bolk of bolker) {
    if (!bolk.verdier.length) continue;
    const tittel = document.createElement('div');
    tittel.className = 'filter-bolk-tittel';
    tittel.textContent = bolk.etikett;
    boks.appendChild(tittel);
    for (const v of bolk.verdier) {
      const nøkkel = bolk.prefiks + ':' + v;
      const rad = document.createElement('label');
      rad.className = 'filter-rad';
      const b = document.createElement('input');
      b.type = 'checkbox';
      b.className = 'filter-verdi';
      b.value = nøkkel;
      b.checked = alleValgt || gyldige.has(nøkkel);
      b.addEventListener('change', meld);
      rad.append(b, document.createTextNode(v));
      boks.appendChild(rad);
    }
  }
}

/** Fyll en «brukes i»-liste i en redigeringsdialog (nederst). */
function fyllBrukListe(beholderId, bruktI, enhetOrd) {
  const boks = document.getElementById(beholderId);
  if (!boks) return;
  boks.innerHTML = '';
  const tittel = document.createElement('span');
  tittel.className = 'field-label';
  tittel.textContent = bruktI.length
    ? 'Brukes i ' + bruktI.length + ' ' + enhetOrd(bruktI.length)
    : 'Ikke i bruk';
  boks.appendChild(tittel);
  if (!bruktI.length) return;
  const ul = document.createElement('ul');
  ul.className = 'bruk-liste';
  for (const navn of bruktI) {
    const li = document.createElement('li');
    li.textContent = navn;
    ul.appendChild(li);
  }
  boks.appendChild(ul);
}

const punktBib = lagDeltBibliotek({
  endepunkt: '/api/waypoints', dataNøkkel: 'punkter',
  listeId: 'wpt-sidebar-list', tomId: 'wpt-lib-empty',
  filterId: 'wpt-filter', enhetEtikett: 'Løyper',
  deltEnhet: 'Punktet', enhetEntall: 'segment', enhetFlertall: 'segmenter',
  tomTekst: 'Ingen delte punkter ennå. Kryss av «Delt punkt» når du lager et interessepunkt.',
  kartBibliotek: () => segmentBib,
  kartNavn: (seg) => seg.name,
  navnFor: (p) => p.name,
  radTekst: (p) => p.name,
  radTittel: (p) => p.name + (p.desc ? ' — ' + p.desc : ''),
  sorteringsnøkkel: () => (p) => p.name, // alltid alfabetisk på navn
  // «Slett overalt» fjerner punktet fra segmentene på serveren — speil det i
  // den åpne segmentvisningen, så det ikke ser ut som om punktet består.
  etterSlett: (p, valg) => { if (valg === 'alle') fjernSlettetPunktFraEditor(p.id); },
  rediger: (p, bruktI) => redigerDeltPunkt(p, bruktI),
  lagretTekst: (v) => '«' + v.name + '» er oppdatert (slår inn i løypene ved neste åpning)',
  slettSpørsmål: (p) => 'Slette det delte punktet «' + p.name + '»? Løypene som ' +
    'bruker det beholder egne, frittstående kopier.',
});

async function oppdaterPunktbibliotek() { await punktBib.oppdater(); }
window.oppdaterPunktbibliotek = oppdaterPunktbibliotek;

/**
 * Rediger en delt kontakt fra kontaktbiblioteket. Gjenbruker arena-kontakt-
 * dialogen (samme DOM som arena-editoren bruker), men skjuler «Delt kontakt»-
 * avkryssingen (den ER delt) og viser hvilke arenakart som bruker den.
 * Returnerer et ArenaContact-formet objekt, eller null ved avbryt.
 */
async function redigerDeltKontakt(k, bruktI, erNy) {
  const g = (felt) => document.getElementById('arena-kontakt-' + felt);
  document.getElementById('arena-kontakt-title').textContent =
    erNy ? 'Ny delt kontakt' : 'Rediger delt kontakt';
  g('tittel').value = k.tittel || '';
  g('navn').value = k.navn || '';
  g('telefon').value = k.telefon || '';
  g('epost').value = k.epost || '';
  g('beskr').value = k.beskrivelse || '';
  g('fra').value = k.gyldig_fra || '';
  g('til').value = k.gyldig_til || '';
  const kEn = (k.oversettelser && k.oversettelser.en) || {};
  g('tittel-en').value = kEn.tittel || '';
  g('beskr-en').value = kEn.beskrivelse || '';
  document.getElementById('arena-kontakt-del-bib-rad').classList.add('hidden');
  // Slett-knappen gjelder bare en kontakt som allerede ligger i biblioteket
  document.getElementById('arena-kontakt-delete').classList.toggle('hidden', !!erNy);
  // Ny kontakt er ikke i bruk noe sted ennå — da er brukslista bare støy
  if (erNy) document.getElementById('arena-kontakt-bruk').innerHTML = '';
  else fyllBrukListe('arena-kontakt-bruk', bruktI || [], () => 'arenakart');

  const dialog = document.getElementById('arena-kontakt-dialog');
  const løfte = ventPåDialog(dialog);
  g('tittel').select();
  const handling = await løfte;
  // Rydd opp så arena-editorens egen kontaktdialog ikke arver tilstanden
  document.getElementById('arena-kontakt-del-bib-rad').classList.remove('hidden');
  document.getElementById('arena-kontakt-delete').classList.add('hidden');
  document.getElementById('arena-kontakt-bruk').innerHTML = '';
  if (handling === 'delete') return { _slett: true };
  if (handling !== 'ok' || !g('tittel').value.trim()) return null;
  return {
    // Serveren tildeler ny id ved opprettelse; feltet er påkrevd i modellen
    id: k.id || 'ny',
    tittel: g('tittel').value.trim(),
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
}

const kontaktBib = lagDeltBibliotek({
  endepunkt: '/api/contacts', dataNøkkel: 'kontakter',
  listeId: 'kontakt-sidebar-list', tomId: 'kontakt-lib-empty',
  filterId: 'kontakt-filter', enhetEtikett: 'Arenakart',
  deltEnhet: 'Kontakten', enhetEntall: 'arenakart', enhetFlertall: 'arenakart',
  tomTekst: 'Ingen delte kontakter ennå. Lag en med «+ Ny», eller kryss av «Delt kontakt» på en kontakt i et arenakart.',
  kartBibliotek: () => arenaBib,
  kartNavn: (a) => a.navn,
  navnFor: (k) => k.tittel,
  // Lista viser det man sorterer på — tittel eller navn, ikke begge
  radTekst: (k, sortering) => (sortering === 'navn' ? (k.navn || k.tittel) : k.tittel),
  radTittel: (k) => [k.tittel, k.navn, k.telefon, k.epost].filter(Boolean).join(' · '),
  // Brukeren velger om lista sorteres (og vises) på rolletittel eller navn
  sorteringer: [
    { verdi: 'tittel', tekst: 'Tittel' },
    { verdi: 'navn', tekst: 'Navn' },
  ],
  sorteringsnøkkel: (valgt) => (k) => (valgt === 'navn' ? (k.navn || k.tittel) : k.tittel),
  rediger: (k, bruktI) => redigerDeltKontakt(k, bruktI),
  nytt: () => redigerDeltKontakt({ id: null, tittel: '' }, [], true),
  opprettetTekst: (v) => 'Den delte kontakten «' + v.tittel + '» er opprettet',
  lagretTekst: (v) => '«' + v.tittel + '» er oppdatert (slår inn i arenakartene ved neste åpning)',
  slettSpørsmål: (k) => 'Slette den delte kontakten «' + k.tittel + '»? Arenakartene ' +
    'som bruker den beholder egne, frittstående kopier.',
});

async function oppdaterKontaktbibliotek() { await kontaktBib.oppdater(); }
window.oppdaterKontaktbibliotek = oppdaterKontaktbibliotek;

document.getElementById('btn-ny-kontakt').addEventListener('click', () => kontaktBib.nytt());
document.getElementById('kontakt-sortering').addEventListener('change', (e) => {
  kontaktBib.sortering = e.target.value;
  kontaktBib.tegn();
});

/** Aktiver/deaktiver punktknappene ut fra om løypa er lagret. */
function oppdaterWptKnapp() {
  const knapp = document.getElementById('btn-add-wpt');
  const velgKnapp = document.getElementById('btn-pick-shared');
  const k = editorState.kilde;
  const ulagret = !k || k.type === 'ulagret';
  knapp.disabled = ulagret;
  velgKnapp.disabled = ulagret;
  knapp.title = ulagret
    ? 'Lagre løypa som segment eller GPX-fil før du kan legge til interessepunkter'
    : 'Legg til et interessepunkt (mat, drikke, sjekkpunkt …) der markøren står';
}

/**
 * Enhetsvektor (i skjermkoordinater: x øst, y sør) som peker vinkelrett
 * ut fra løypas retning der veipunktet ligger — slik at symbolene kan
 * plasseres ved siden av traseen, ikke oppå den. Velger sida som peker
 * mest oppover (mot nord), der symbolene oftest er minst i veien.
 */
function wptOffsetEnhet(w) {
  const pts = editorState.punkter;
  if (!pts || pts.length < 2) return [0.7, -0.7];
  const besteI = nærmesteSporIndeks(w);
  const i0 = Math.max(0, besteI - 3);
  const i1 = Math.min(pts.length - 1, besteI + 3);
  const k = Math.cos((pts[besteI].lat * Math.PI) / 180);
  const dx = (pts[i1].lon - pts[i0].lon) * k;
  const dy = -(pts[i1].lat - pts[i0].lat);
  const lengde = Math.hypot(dx, dy);
  if (lengde === 0) return [0.7, -0.7];
  let px = -dy / lengde, py = dx / lengde;
  if (py > 0) { px = -px; py = -py; }
  return [px, py];
}

/**
 * Zoom-avhengig skalering av symbolene: små når man er zoomet ut, opp til
 * full størrelse langt inn (z ≥ 16). Kurven er kvadratisk så symbolene
 * holder seg små på mellomnivå og først vokser når man zoomer godt inn.
 */
function wptSkala(zoom) {
  const t = klem((zoom - 6) / (16 - 6), 0, 1);
  return 0.6 + 3.4 * t * t;
}

const WPT_BASIS = 15;  // grunnstørrelse (px) som skaleres av zoom + brukervalg

/** Faktisk symbolstørrelse i px: zoom-skala × brukerens ikonstørrelse-valg. */
function wptIkonPx(zoom) {
  return WPT_BASIS * wptSkala(zoom) * kartEksport.ikonSkala;
}

// Om interessepunktene vises på kartet i det hele tatt (huskes lokalt)
let wptVis = localStorage.getItem('gps-tool.wptVis') !== '0';

/**
 * Posisjonen et veipunkt VISES på: normalt de lagrede koordinatene, men
 * med «snap» (delte punkter som ligger et stykke unna denne løypa) tegnes
 * det på nærmeste løypepunkt. De lagrede koordinatene røres ikke — de er
 * delt med punktbiblioteket og de andre løypene.
 */
function wptPosisjon(w) {
  if (w.snap && editorState.punkter) {
    const p = editorState.punkter[nærmesteSporIndeks(w)];
    return L.latLng(p.lat, p.lon);
  }
  return L.latLng(w.lat, w.lon);
}

/**
 * Posisjonen til ikonrammen for et veipunkt. Har brukeren dratt den, er
 * den lagret i lab_lat/lab_lon. Ellers en standardplassering et lite
 * stykke vinkelrett ut fra løypa (så ramma ikke dekker traseen).
 */
function rammePosisjon(w) {
  if (w.lab_lat != null && w.lab_lon != null) return L.latLng(w.lab_lat, w.lab_lon);
  const [ux, uy] = wptOffsetEnhet(w);
  const dist = 26 + wptIkonPx(map.getZoom());
  const pPix = map.latLngToLayerPoint(wptPosisjon(w));
  return map.layerPointToLatLng(L.point(pPix.x + ux * dist, pPix.y + uy * dist));
}

/**
 * Bygg divIcon for ikonrammen (alle symbolene samlet), skalert med zoom.
 * Symbolene wrapper til flere rader når det er mer enn tre av dem.
 */
function byggRammeIkon(w) {
  const ikon = wptIkonPx(map.getZoom());
  const skala = ikon / WPT_BASIS;
  const gap = 3 * skala, pad = 4 * skala;
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
  const html = '<div class="wpt-frame" title="' + w.name.replace(/"/g, '&quot;') +
    '" style="width:' + fw.toFixed(1) + 'px;height:' + fh.toFixed(1) + 'px;gap:' +
    gap.toFixed(1) + 'px;padding:' + pad.toFixed(1) + 'px;border-radius:' +
    (5 * skala).toFixed(1) + 'px">' + inner + '</div>';
  return L.divIcon({ className: 'wpt-ikon', html, iconSize: [fw, fh], iconAnchor: [fw / 2, fh / 2] });
}

function tegnVeipunkter() {
  const s = editorState;
  wptLag.clearLayers();
  s.wptMarkører = [];
  if (!s.punkter || !wptVis) return;

  s.veipunkter.forEach((w, i) => {
    const pkt = wptPosisjon(w); // «snap»-punkter tegnes på selve løypa

    // Liten markør på selve løypepunktet — alltid synlig og klikkbar,
    // også når ikonene er skjult for dette punktet (så det kan hentes fram)
    const prikk = L.circleMarker(pkt, {
      radius: 4, color: '#334155', weight: 2, fillColor: '#ffffff', fillOpacity: 1,
      renderer: wptTegner,
    }).addTo(wptLag);
    prikk.on('click', () => redigerWpt(i));

    if (w.vis_ikon === false) return; // ikonene skjult for dette punktet

    const ramme = rammePosisjon(w);
    // Ledestrek fra løypepunktet til ramma (farge/tykkelse fra verktøylinja)
    const strek = L.polyline([pkt, ramme], {
      color: kartEksport.strekFarge, weight: kartEksport.strekTykkelse,
      opacity: 0.9, renderer: wptTegner,
    }).addTo(wptLag);
    // Selve ikonrammen — kan dras, og streken følger med
    const markør = L.marker(ramme, {
      icon: byggRammeIkon(w), draggable: true, autoPan: false,
    }).addTo(wptLag);
    markør.on('drag', (e) => strek.setLatLngs([pkt, e.target.getLatLng()]));
    markør.on('dragend', (e) => {
      const ll = e.target.getLatLng();
      w.lab_lat = ll.lat; w.lab_lon = ll.lng;
      // Rammeplasseringen lagres bare for segmenter (GPX-formatet har
      // ikke noe felt for det — der beholdes den kun i minnet).
      if (editorState.kilde && editorState.kilde.type === 'segment') lagreVeipunkterAuto();
    });
    markør.on('click', () => redigerWpt(i));
    s.wptMarkører.push(markør);
  });
}

// Skaler symbolene når brukeren zoomer (kun i redigeringsvisningen,
// der veipunktene finnes). Bruker 'zoomend' for å unngå tung re-tegning
// under selve zoom-animasjonen.
map.on('zoomend', () => {
  if (aktivFane === 'editor' && editorState.punkter && editorState.veipunkter.length) {
    tegnVeipunkter();
  }
});

/**
 * Veipunktene som hører til punktutvalget som lagres/eksporteres.
 * Ved utsnitt: manuelle punkter innenfor utsnittet beholdes, og
 * start/mål regenereres for utsnittets nye ender.
 */
function aktuelleVeipunkter(punkter) {
  const s = editorState;
  if (punkter === s.punkter) return s.veipunkter;

  // Utsnitt: behold manuelle punkter som ligger nær selve utsnittet
  const beholdte = s.veipunkter.filter((w) => {
    const type = wptType(w);
    if (type === 'start' || type === 'maal') return false; // regenereres
    let minst = Infinity;
    for (const p of punkter) {
      const d = avstandKm(w, p);
      if (d < minst) minst = d;
    }
    return minst < 0.1; // innenfor 100 m fra utsnittet
  });
  const første = punkter[0], siste = punkter[punkter.length - 1];
  return [
    { lat: første.lat, lon: første.lon, ele: første.ele, name: 'Start',
      desc: 'Start for ' + (s.navn || 'løypa'), sym: WPT_SYMBOLER.start.sym, type: 'start' },
    ...beholdte,
    { lat: siste.lat, lon: siste.lon, ele: siste.ele, name: 'Mål',
      desc: 'Mål for ' + (s.navn || 'løypa'), sym: WPT_SYMBOLER.maal.sym, type: 'maal' },
  ];
}

/** Tegn hele redigeringsscenen på nytt (spor, utsnitt, markører). */
function tegnRedigeringsscene() {
  tømKartet();
  visKartmelding(false);
  const s = editorState;

  // Ruta tegnes med brukerens valgte farge/tykkelse (kartverktøylinja),
  // slik at skjermen viser nøyaktig det som havner i PNG-eksporten.
  s.spor = tegnSpor(s.punkter, kartEksport.farge, kartEksport.tykkelse);

  // Grønt, tykkere lag oppå sporet viser utsnittet brukeren er i ferd med å velge
  const [lo, hi] = utsnittsgrenser();
  s.utsnitt = (lo != null)
    ? tegnSpor(s.punkter.slice(lo, hi + 1), FARGE_UTSNITT, kartEksport.tykkelse + 3, 0.85)
    : null;

  s.startMarkør = s.startIdx != null ? lagFastMarkør(s.punkter[s.startIdx], FARGE_UTSNITT) : null;
  s.sluttMarkør = s.sluttIdx != null ? lagFastMarkør(s.punkter[s.sluttIdx], FARGE_B) : null;
  tegnVeipunkter();
  s.posMarkør = lagPosisjonsmarkør(s.punkter[s.valgtIdx], FARGE_A);

  zoomTil([s.punkter]);
  oppdaterUtsnittstekst();
  tegnProfil();
}

/** Start/slutt kan settes i valgfri rekkefølge — vi sorterer dem her. */
function utsnittsgrenser() {
  const s = editorState;
  if (s.startIdx == null || s.sluttIdx == null) return [null, null];
  return [Math.min(s.startIdx, s.sluttIdx), Math.max(s.startIdx, s.sluttIdx)];
}

function settRedigeringsIndeks(idx) {
  const s = editorState;
  if (!s.punkter) return;
  s.valgtIdx = klem(idx, 0, s.punkter.length - 1);
  eSlider.value = s.valgtIdx;
  s.posMarkør.setLatLng(tilLatLng(s.punkter[s.valgtIdx]));
  document.getElementById('editor-pos').textContent =
    'Punkt ' + (s.valgtIdx + 1) + ' / ' + s.punkter.length +
    ' · ' + fmtKm(s.avstander[s.valgtIdx]) + ' fra start';
  tegnProfil();
}

function oppdaterUtsnittstekst() {
  const s = editorState;
  const el = document.getElementById('editor-selection');
  const [lo, hi] = utsnittsgrenser();
  if (lo != null) {
    el.textContent = 'Utsnitt: punkt ' + (lo + 1) + ' → ' + (hi + 1) +
      ' (' + fmtKm(s.avstander[hi] - s.avstander[lo]) + ')';
  } else if (s.startIdx != null) {
    el.textContent = 'Start satt ved punkt ' + (s.startIdx + 1) + ' — sett slutt for å velge utsnitt';
  } else if (s.sluttIdx != null) {
    el.textContent = 'Slutt satt ved punkt ' + (s.sluttIdx + 1) + ' — sett start for å velge utsnitt';
  } else {
    el.textContent = '';
  }
}

/** Punktene som lagres/eksporteres: utsnittet hvis merket, ellers alt. */
function valgtePunkter() {
  const [lo, hi] = utsnittsgrenser();
  return lo != null ? editorState.punkter.slice(lo, hi + 1) : editorState.punkter;
}

async function åpneSegmentIRedigering(id) {
  try {
    const res = await api('/api/segments/' + id);
    const seg = await res.json();
    lastSporIRedigering(seg.name, seg.description, seg.points, seg.creator, seg.link, {
      copyright: seg.copyright, nøkkelord: seg.keywords, starttid: seg.start_time,
      veipunkter: seg.waypoints || [],
      kilde: { type: 'segment', id: seg.id },
    });
    toast('«' + seg.name + '» er åpnet for redigering');
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

/**
 * Bytt mellom GPX-filas egne høyder og terrenghøyder fra Kartverket.
 * Terrenghøydene hentes fra API-et første gang (kan ta noen sekunder
 * for lange spor) og mellomlagres så lenge sporet er åpent. Byttet
 * endrer selve punktdataene, så lagring/eksport bruker de valgte høydene.
 */
async function byttHøydekilde() {
  const s = editorState;
  if (!s.punkter) return;
  const knapp = document.getElementById('btn-elevation-source');

  if (s.høydekilde === 'dem') {
    // Tilbake til GPX-filas originale høyder
    s.punkter.forEach((p, i) => { p.ele = s.gpxHøyder[i]; });
    s.høydekilde = 'gpx';
  } else {
    if (!s.demHøyder) {
      knapp.disabled = true;
      toast('Henter terrenghøyder fra Kartverket — dette kan ta noen sekunder…');
      try {
        const res = await api('/api/elevation/correct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: s.punkter }),
        });
        s.demHøyder = (await res.json()).elevations;
      } catch (feil) {
        toast(feil.message, 'error');
        return;
      } finally {
        knapp.disabled = false;
      }
      const dekning = s.demHøyder.filter((h) => h != null).length;
      if (dekning === 0) {
        toast('Kartverket har ingen høydedekning for dette området', 'error');
        s.demHøyder = null;
        return;
      }
    }
    if (!s.gpxHøyder) s.gpxHøyder = s.punkter.map((p) => p.ele);
    // Bruk terrenghøyden der den finnes; behold originalen ellers
    s.punkter.forEach((p, i) => {
      if (s.demHøyder[i] != null) p.ele = s.demHøyder[i];
    });
    s.høydekilde = 'dem';
    toast('Høydene er byttet til Kartverkets terrengmodell');
  }
  oppdaterHøydekildeKnapp();
  tegnProfil();
  oppdaterEditorMeta(); // høydemeterne avhenger av høydekilden
}

function oppdaterHøydekildeKnapp() {
  const knapp = document.getElementById('btn-elevation-source');
  const dem = editorState.høydekilde === 'dem';
  knapp.innerHTML = dem ? '&#9968; Høyder: Kartverket' : '&#9968; Høyder: GPX-fila';
  knapp.classList.toggle('btn-primary', dem);
}

async function lagreSegment() {
  const punkter = valgtePunkter();
  const meta = await spørOmMeta('Lagre segment', editorMeta());
  if (!meta) return;
  try {
    const res = await api('/api/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: meta.navn, description: meta.beskrivelse,
        creator: meta.creator, link: meta.link,
        copyright: meta.copyright, keywords: meta.nøkkelord,
        start_time: editorState.starttid,
        points: punkter, waypoints: aktuelleVeipunkter(punkter),
      }),
    });
    const nytt = await res.json();
    // Det brukeren skrev inn, blir de nye "arvede" metadataene —
    // og huskes som forslag for neste løype som mangler dem
    huskSisteMeta(meta);
    editorState.navn = meta.navn;
    editorState.beskrivelse = meta.beskrivelse;
    editorState.creator = meta.creator;
    editorState.link = meta.link;
    editorState.copyright = meta.copyright;
    editorState.nøkkelord = meta.nøkkelord;
    // Videre PoI-endringer skal nå auto-lagres til det nye segmentet
    // (med mindre vi lagret et utsnitt — da er punktene i minnet ikke
    // lenger de samme som det lagrede segmentet, så vi lar kilden stå).
    if (punkter === editorState.punkter) {
      editorState.kilde = { type: 'segment', id: nytt.id };
      oppdaterWptKnapp();
    }
    toast('Segmentet «' + meta.navn + '» er lagret (' + punkter.length + ' punkter)');
    oppdaterBibliotek();
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

/** Bygg en ryddig GPX-fil (blob) på serveren fra punkter + metadata + PoI. */
async function byggGpxBlob(punkter, meta, veipunkter, starttid) {
  const res = await api('/api/gpx/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: meta.navn, description: meta.beskrivelse,
      creator: meta.creator, link: meta.link,
      copyright: meta.copyright, keywords: meta.nøkkelord,
      start_time: starttid, points: punkter,
      waypoints: veipunkter || [],
    }),
  });
  return res.blob();
}

/** Felles GPX-eksport: rydder tidsstempler på serveren og lagrer fila.
 *  Returnerer metadataene brukeren la inn ved vellykket lagring (så
 *  kalleren kan huske dem på det aktive sporet), ellers null. */
async function eksporterGpx(punkter, forslag, veipunkter) {
  // Starttid-forslag: sporets/segmentets egen verdi, ellers sporets
  // første tidsstempel (sist brukte verdi foreslås av spørOmMeta)
  const utfylt = Object.assign({}, forslag);
  if (!utfylt.starttid && punkter.length && punkter[0].time) {
    utfylt.starttid = tilDatetimeLocal(punkter[0].time);
  }
  const meta = await spørOmMeta('Lagre som GPX-fil', utfylt, true);
  if (!meta) return null;
  try {
    const blob = await byggGpxBlob(punkter, meta, eksportVeipunkter(veipunkter || []), meta.starttid);
    const lagret = await lagreFil(blob, meta.navn + '.gpx', 'GPX-fil', {
      'application/gpx+xml': ['.gpx'],
    });
    if (!lagret) return null;
    toast('GPX-fila «' + meta.navn + '.gpx» er lagret');
    huskSisteMeta(meta); // foreslås neste gang et spor mangler verdiene
    return meta;
  } catch (feil) {
    toast(feil.message, 'error');
    return null;
  }
}

// --- Hendelser i redigeringsvisningen ---

/** Parse en innlastet GPX-fil og vis den i redigering. `håndtak` gir
 *  skrivetilgang tilbake til fila (auto-lagring av PoI) når tilgjengelig. */
async function behandleGpxFil(fil, håndtak) {
  const skjema = new FormData();
  skjema.append('file', fil);
  try {
    const res = await api('/api/gpx/parse', { method: 'POST', body: skjema });
    const data = await res.json();
    lastSporIRedigering(
      data.name || fil.name.replace(/\.gpx$/i, ''),
      data.description, data.points, data.creator, data.link, {
        copyright: data.copyright, nøkkelord: data.keywords,
        veipunkter: data.waypoints || [],
        kilde: { type: 'gpx', håndtak: håndtak || null, filnavn: fil.name },
      });
    toast('Lastet inn ' + data.points.length + ' punkter' +
      (håndtak ? ' — nye interessepunkter lagres rett i fila' : ''));
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

// Innlasting: bruk File System Access-velgeren der den finnes (gir
// skrivetilgang tilbake til fila), ellers vanlig fil-input som fallback.
document.getElementById('gpx-load-label').addEventListener('click', async (e) => {
  if (!window.showOpenFilePicker) return; // fallback: la <label> åpne fil-input
  e.preventDefault();
  let håndtak;
  try {
    [håndtak] = await window.showOpenFilePicker({
      types: [{ description: 'GPX-fil', accept: { 'application/gpx+xml': ['.gpx'], 'application/xml': ['.gpx'] } }],
    });
  } catch (feil) {
    return; // brukeren avbrøt
  }
  const fil = await håndtak.getFile();
  behandleGpxFil(fil, håndtak);
});

document.getElementById('gpx-file').addEventListener('change', (e) => {
  const fil = e.target.files[0];
  if (!fil) return;
  e.target.value = ''; // så samme fil kan lastes på nytt senere
  behandleGpxFil(fil, null); // vanlig input gir ikke skrivetilgang
});

eSlider.addEventListener('input', () => settRedigeringsIndeks(Number(eSlider.value)));

koblAutoRepeat(document.getElementById('editor-prev'),
  (antall) => settRedigeringsIndeks(editorState.valgtIdx - antall));
koblAutoRepeat(document.getElementById('editor-next'),
  (antall) => settRedigeringsIndeks(editorState.valgtIdx + antall));

document.getElementById('btn-mark-start').addEventListener('click', () => {
  editorState.startIdx = editorState.valgtIdx;
  tegnRedigeringsscene();
});
document.getElementById('btn-mark-end').addEventListener('click', () => {
  editorState.sluttIdx = editorState.valgtIdx;
  tegnRedigeringsscene();
});
document.getElementById('btn-clear-marks').addEventListener('click', () => {
  editorState.startIdx = null;
  editorState.sluttIdx = null;
  tegnRedigeringsscene();
});

document.getElementById('btn-save-segment').addEventListener('click', lagreSegment);
document.getElementById('btn-export-gpx').addEventListener('click', async () => {
  const punkter = valgtePunkter();
  const meta = await eksporterGpx(punkter, editorMeta(), aktuelleVeipunkter(punkter));
  if (!meta) return;
  // Verdiene brukeren la inn skal huskes på det aktive sporet — og
  // skrives tilbake til segmentet, så de foreslås neste gang det åpnes.
  editorState.creator = meta.creator;
  editorState.link = meta.link;
  editorState.copyright = meta.copyright;
  editorState.nøkkelord = meta.nøkkelord;
  editorState.starttid = meta.starttid;
  const k = editorState.kilde;
  if (k && k.type === 'segment') {
    try {
      await api('/api/segments/' + k.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editorState.navn, description: editorState.beskrivelse,
          creator: meta.creator, link: meta.link,
          copyright: meta.copyright, keywords: meta.nøkkelord,
          start_time: meta.starttid,
        }),
      });
    } catch (feil) {
      // Eksporten lyktes — at tilbakeskrivingen feilet skal ikke skjule det
      toast('Metadataene ble ikke lagret på segmentet: ' + feil.message, 'error');
    }
  }
});

// --- Publisering av interaktiv løypevisning (til nettsider) ---

/** Lag et nettvennlig adressenavn fra løypenavnet: «MMC 70K» → «mmc-70k». */
function lagSlug(navn) {
  return (navn || 'loype').toLowerCase()
    .replace(/[æå]/g, 'a').replace(/ø/g, 'o')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'loype';
}

/** Stilvalgene som følger med publiseringen, så visningen matcher verktøyet.
 *  For en importert .loype-fil brukes opphavspersonens stil, ikke den
 *  lokale verktøytilstanden — slik at visningen blir slik de designet den. */
function gjeldendeStil() {
  if (editorState.importertStil) return editorState.importertStil;
  return {
    rutefarge: kartEksport.farge,
    tykkelse: kartEksport.tykkelse,
    ikonSkala: kartEksport.ikonSkala,
    profil: {
      linje: profilState.linje, fyll: profilState.fyll, fyllPå: profilState.fyllPå,
      bakgrunn: profilState.bakgrunn, akseFarge: profilState.akseFarge,
      rutenettFarge: profilState.rutenettFarge, tallFarge: profilState.tallFarge,
      punktFarge: profilState.punktFarge, markørFarge: profilState.markørFarge,
      utjevning: profilState.utjevning, vektform: profilState.vektform,
    },
  };
}

async function åpnePubliseringsdialog() {
  if (!editorState.punkter) return;
  const dialog = document.getElementById('publish-dialog');
  const målValg = document.getElementById('publish-target');

  try {
    const res = await api('/api/publish/targets');
    const mål = (await res.json()).targets;
    målValg.innerHTML = '';
    for (const m of mål) {
      const opt = document.createElement('option');
      opt.value = m.navn;
      opt.textContent = m.navn + (m.baseUrl ? ' — ' + m.baseUrl : ' (lokal mappe)');
      målValg.appendChild(opt);
    }
    if (mål.length === 0) {
      toast('Ingen publiseringsmål er satt opp — se data/publisering.json', 'error');
      return;
    }
  } catch (feil) {
    toast(feil.message, 'error');
    return;
  }

  // Adressenavn: bruk et arvet/importert ønske hvis det finnes (så
  // republisering og innsendte løyper havner på samme adresse), ellers
  // et forslag utledet fra navnet.
  document.getElementById('publish-slug').value =
    editorState.adressenavn || lagSlug(editorState.navn);
  document.getElementById('publish-name').value = editorState.navn || '';
  document.getElementById('publish-desc').value = editorState.beskrivelse || '';
  // Engelsk tittel/beskrivelse + standardspråk huskes på sporet, så en ny
  // publisering (eller gjenåpning) foreslår det som ble skrevet sist. Feltene
  // settes ALLTID (også til tomt), så en annen løype ikke arver stale verdier.
  const enO = (editorState.oversettelser && editorState.oversettelser.en) || {};
  document.getElementById('publish-name-en').value = enO.navn || '';
  document.getElementById('publish-desc-en').value = enO.beskrivelse || '';
  document.getElementById('publish-sprak').value = editorState.standard_sprak || 'no';
  document.getElementById('publish-video').value = editorState.video || '';
  document.getElementById('publish-result').classList.add('hidden');
  dialog.showModal();
}

async function utførPublisering() {
  const knapp = document.getElementById('publish-go');
  const punkter = valgtePunkter();
  knapp.disabled = true;
  knapp.textContent = 'Publiserer …';
  const standard_sprak = document.getElementById('publish-sprak').value;
  const oversettelser = byggOversettelser({
    navn: document.getElementById('publish-name-en').value,
    beskrivelse: document.getElementById('publish-desc-en').value,
  });
  try {
    const res = await api('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: document.getElementById('publish-target').value,
        slug: document.getElementById('publish-slug').value.trim(),
        name: document.getElementById('publish-name').value.trim(),
        description: document.getElementById('publish-desc').value.trim() || null,
        link: editorState.link,
        stil: gjeldendeStil(),
        standard_sprak,
        oversettelser,
        points: punkter,
        waypoints: aktuelleVeipunkter(punkter),
        video: document.getElementById('publish-video').value.trim().toLowerCase() || null,
      }),
    });
    const data = await res.json();
    const lenke = document.getElementById('publish-url');
    lenke.textContent = data.url;
    lenke.href = data.url;
    document.getElementById('publish-embed').value = data.iframe;
    document.getElementById('publish-result').classList.remove('hidden');
    // Husk språkvalget på sporet, så en ny publisering (eller .loype-eksport)
    // i samme økt beholder den engelske tittelen/beskrivelsen og standardspråket.
    editorState.oversettelser = oversettelser;
    editorState.standard_sprak = standard_sprak;
    editorState.video = document.getElementById('publish-video').value.trim().toLowerCase() || null;
    // Ved gruppepublisering kan noen av målene ha feilet (delvis suksess)
    if (data.advarsel) toast(data.advarsel, 'error');
    else toast('Løypevisningen er publisert');
  } catch (feil) {
    toast(feil.message, 'error');
  } finally {
    knapp.disabled = false;
    knapp.textContent = 'Publiser';
  }
}

// ============================================================
// Videobibliotek: innspilte flyover-videoer
// ============================================================

let videoBibliotek = [];

/** Hent lista med lagrede videoer og tegn den i venstre kolonne. */
async function oppdaterVideobibliotek() {
  try {
    const res = await api('/api/videos');
    videoBibliotek = (await res.json()).videoer || [];
  } catch (feil) {
    videoBibliotek = [];   // eldre server uten videostøtte — bare tom liste
  }
  tegnVideobibliotek();
}

function videoStørrelse(byte) {
  return (byte / (1024 * 1024)).toFixed(1) + ' MB';
}

function videoVarighet(sek) {
  if (!sek) return '';
  const m = Math.floor(sek / 60), r = Math.round(sek % 60);
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function tegnVideobibliotek() {
  const liste = document.getElementById('video-sidebar-list');
  const tom = document.getElementById('video-lib-empty');
  if (!liste) return;
  liste.innerHTML = '';
  if (!videoBibliotek.length) {
    tom.textContent = 'Ingen videoer ennå. Åpne Flyover og trykk «Ta opp».';
    tom.classList.remove('hidden');
    return;
  }
  tom.classList.add('hidden');

  for (const v of videoBibliotek) {
    const rad = document.createElement('div');
    rad.className = 'wpt-lib-item';
    const fakta = [videoVarighet(v.varighet), videoStørrelse(v.storrelse),
      v.loype].filter(Boolean).join(' · ');
    rad.innerHTML =
      '<div class="wpt-lib-tekst">' +
        '<span class="wpt-lib-navn"></span>' +
        '<span class="wpt-lib-meta"></span>' +
      '</div>' +
      '<div class="wpt-lib-knapper">' +
        '<a class="btn btn-small" target="_blank" rel="noopener" title="Spill av videoen i egen fane">▶</a>' +
        '<button class="btn btn-small" data-h="publiser" title="Publiser videoen på nett">Publiser</button>' +
        '<button class="btn btn-small" data-h="navn" title="Gi videoen et nytt navn">Endre</button>' +
        '<button class="btn btn-small btn-danger-subtle" data-h="slett" title="Slett videoen">Slett</button>' +
      '</div>';
    rad.querySelector('.wpt-lib-navn').textContent = v.navn;
    rad.querySelector('.wpt-lib-meta').textContent = fakta;
    rad.querySelector('a').href = '/api/videos/' + v.id + '/fil';
    rad.querySelector('[data-h="publiser"]').addEventListener(
      'click', () => åpneVideoPublisering(v));
    rad.querySelector('[data-h="navn"]').addEventListener(
      'click', () => endreVideonavn(v));
    rad.querySelector('[data-h="slett"]').addEventListener(
      'click', () => slettVideo(v));
    liste.appendChild(rad);
  }
}

async function endreVideonavn(v) {
  const nytt = prompt('Nytt navn på videoen:', v.navn);
  if (nytt === null || !nytt.trim()) return;
  try {
    await api('/api/videos/' + v.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navn: nytt.trim() }),
    });
    await oppdaterVideobibliotek();
  } catch (feil) { toast(feil.message, 'error'); }
}

async function slettVideo(v) {
  if (!confirm('Slette videoen «' + v.navn + '»?\n\nFila blir borte for godt. ' +
    'Er den publisert, blir den liggende på nett til du fjerner den der.')) return;
  try {
    await api('/api/videos/' + v.id, { method: 'DELETE' });
    await oppdaterVideobibliotek();
    toast('Videoen er slettet');
  } catch (feil) { toast(feil.message, 'error'); }
}

/** Publiseringsdialogen for én video. */
let videoSomPubliseres = null;

async function åpneVideoPublisering(v) {
  videoSomPubliseres = v;
  const dialog = document.getElementById('video-publish-dialog');
  const målValg = document.getElementById('video-publish-target');
  try {
    const res = await api('/api/publish/targets');
    const mål = (await res.json()).targets;
    målValg.innerHTML = '';
    for (const m of mål) {
      const opt = document.createElement('option');
      opt.value = m.navn;
      opt.textContent = m.navn + (m.baseUrl ? ' — ' + m.baseUrl : ' (lokal mappe)');
      målValg.appendChild(opt);
    }
    if (!mål.length) {
      toast('Ingen publiseringsmål er satt opp — se data/publisering.json', 'error');
      return;
    }
  } catch (feil) {
    toast(feil.message, 'error');
    return;
  }

  document.getElementById('video-publish-om').textContent =
    v.navn + ' · ' + [videoVarighet(v.varighet), videoStørrelse(v.storrelse)]
      .filter(Boolean).join(' · ');
  // Løypa foreslås fra den åpne løypa, ellers fra videoens egen merking
  document.getElementById('video-publish-event').value =
    editorState.adressenavn || lagSlug(v.loype || editorState.navn || '');
  document.getElementById('video-publish-slug').value = 'video';
  document.getElementById('video-publish-name').value = v.navn;
  document.getElementById('video-publish-name-en').value = '';
  document.getElementById('video-publish-desc').value = '';
  document.getElementById('video-publish-desc-en').value = '';
  document.getElementById('video-publish-sprak').value =
    editorState.standard_sprak || 'no';
  document.getElementById('video-publish-result').classList.add('hidden');
  dialog.showModal();
}

async function utførVideoPublisering() {
  if (!videoSomPubliseres) return;
  const knapp = document.getElementById('video-publish-go');
  knapp.disabled = true;
  knapp.textContent = 'Publiserer …';
  const videoSlug = document.getElementById('video-publish-slug').value.trim().toLowerCase();
  const oversettelser = byggOversettelser({
    navn: document.getElementById('video-publish-name-en').value,
    beskrivelse: document.getElementById('video-publish-desc-en').value,
  });
  try {
    const res = await api('/api/videos/' + videoSomPubliseres.id + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: document.getElementById('video-publish-target').value,
        event_slug: document.getElementById('video-publish-event').value.trim().toLowerCase(),
        video_slug: videoSlug,
        navn: document.getElementById('video-publish-name').value.trim(),
        beskrivelse: document.getElementById('video-publish-desc').value.trim() || null,
        standard_sprak: document.getElementById('video-publish-sprak').value,
        oversettelser,
        link: editorState.link,
      }),
    });
    const data = await res.json();
    const lenke = document.getElementById('video-publish-url');
    lenke.textContent = data.url;
    lenke.href = data.url;
    document.getElementById('video-publish-embed').value = data.iframe;
    document.getElementById('video-publish-hint').textContent =
      'Vil du at løypekartet skal lenke til videoen, skriv «' + videoSlug +
      '» i feltet «Lenke til flyover-video» når du publiserer løypa på nytt.';
    document.getElementById('video-publish-result').classList.remove('hidden');
    if (data.advarsel) toast(data.advarsel, 'error');
    else toast('Videoen er publisert');
  } catch (feil) {
    toast(feil.message, 'error');
  } finally {
    knapp.disabled = false;
    knapp.textContent = 'Publiser';
  }
}

document.querySelector('#video-publish-dialog form').addEventListener('submit', (e) => {
  e.preventDefault();
  const handling = (e.submitter && e.submitter.value) || 'ok';
  if (handling === 'cancel') document.getElementById('video-publish-dialog').close();
  else utførVideoPublisering();
});

document.getElementById('video-publish-copy').addEventListener('click', async () => {
  const felt = document.getElementById('video-publish-embed');
  try {
    await navigator.clipboard.writeText(felt.value);
    toast('Snutten er kopiert til utklippstavla');
  } catch (feil) {
    felt.select();
    toast('Kopier med Ctrl+C (teksten er markert)', 'error');
  }
});

document.getElementById('btn-publish').addEventListener('click', åpnePubliseringsdialog);

// Publiseringsdialogen håndterer submit selv (dialogen skal stå åpen og
// vise resultatet etter publisering — derfor ikke ventPåDialog-mønsteret).
document.querySelector('#publish-dialog form').addEventListener('submit', (e) => {
  e.preventDefault();
  const handling = (e.submitter && e.submitter.value) || 'ok';
  if (handling === 'cancel') {
    document.getElementById('publish-dialog').close();
  } else {
    utførPublisering();
  }
});

document.getElementById('publish-copy').addEventListener('click', async () => {
  const felt = document.getElementById('publish-embed');
  try {
    await navigator.clipboard.writeText(felt.value);
    toast('Snutten er kopiert til utklippstavla');
  } catch (feil) {
    felt.select(); // reserveløsning: marker teksten så Ctrl+C er nok
    toast('Kopier med Ctrl+C (teksten er markert)', 'error');
  }
});
// --- Send til KrUltra for publisering (for arrangører uten egen server) ---

const LOYPE_FORMAT = 'kul-loype';

/** Bygg .loype-bunten: alt KrUltra trenger for å publisere løypa (punkter,
 *  veipunkter, stil og alle metadata opphavspersonen har valgt). */
function byggLoypeBunt(meta) {
  const punkter = valgtePunkter();
  return {
    format: LOYPE_FORMAT,
    versjon: 1,
    generert: new Date().toISOString(),
    adressenavn: meta.adressenavn,
    navn: meta.navn,
    beskrivelse: meta.beskrivelse,
    laget_av: meta.creator,
    lenke: meta.link,
    copyright: meta.copyright,
    nøkkelord: meta.nøkkelord,
    starttid: meta.starttid,
    // Engelsk tittel/beskrivelse + standardspråk for visningen huskes på
    // sporet (fylles i publiseringsdialogen), så de følger med til KrUltra.
    oversettelser: editorState.oversettelser || null,
    standard_sprak: editorState.standard_sprak || null,
    stil: gjeldendeStil(),
    punkter: punkter.map((p) => (
      { lat: p.lat, lon: p.lon, ele: p.ele == null ? null : p.ele })),
    veipunkter: aktuelleVeipunkter(punkter),
  };
}

/** Last ned en blob rett til nettleserens nedlastingsmappe (uten
 *  «Lagre som»-dialog) — brukt der filnavnet og målet er gitt på forhånd. */
function lastNedFil(blob, filnavn) {
  const url = URL.createObjectURL(blob);
  const lenke = document.createElement('a');
  lenke.href = url;
  lenke.download = filnavn;
  document.body.appendChild(lenke);
  lenke.click();
  lenke.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function sendTilKrUltra() {
  if (!editorState.punkter) return;
  const meta = await spørOmMeta(
    'Send til KrUltra for publisering', editorMeta(), true, true);
  if (!meta) return;
  meta.adressenavn = lagSlug(meta.adressenavn); // alltid et gyldig adressenavn

  const bunt = byggLoypeBunt(meta);
  const filnavn = (meta.adressenavn || 'loype') + '.loype';
  const blob = new Blob([JSON.stringify(bunt, null, 2)], { type: 'application/json' });
  // Rett i nedlastingsmappa — ingen dialog, så flyten blir: se over
  // e-posten, dra inn fila fra Nedlastinger, send.
  lastNedFil(blob, filnavn);

  huskSisteMeta(meta);
  editorState.adressenavn = meta.adressenavn; // huskes på sporet

  // Åpne en ferdig e-post i brukerens standard e-postprogram. Vedlegg kan
  // ikke legges ved automatisk (mailto støtter ikke vedlegg — en bevisst
  // sikkerhetsbegrensning i alle nettlesere/e-postprogrammer), så utkastet
  // sier tydelig hvor fila ligger og at den må legges ved.
  const emne = 'Løype: ' + meta.navn + ' - for publisering på loyper.krultra.no';
  const kropp =
    'Hei KrUltra!\n\n' +
    'Jeg ønsker å få publisert denne løypa på loyper.krultra.no:\n\n' +
    'Navn: ' + meta.navn + '\n' +
    'Ønsket adresse: loyper.krultra.no/' + meta.adressenavn + '\n' +
    (meta.creator ? 'Laget av: ' + meta.creator + '\n' : '') +
    (meta.copyright ? 'Copyright/lisens: ' + meta.copyright + '\n' : '') +
    (meta.link ? 'Lenke til løpet: ' + meta.link + '\n' : '') +
    '\n*** HUSK VEDLEGGET: Løypefila «' + filnavn + '» ligger i ' +
    'nedlastingsmappa di (Nedlastinger/Downloads). Dra den inn i denne ' +
    'e-posten eller bruk vedleggsknappen før du sender. ***\n\n' +
    'Eventuelle tilleggsopplysninger:\n\n\n' +
    'Hilsen\n';
  window.location.href = 'mailto:post@krultra.no?subject=' +
    encodeURIComponent(emne) + '&body=' + encodeURIComponent(kropp);
  toast('Løypefila «' + filnavn + '» er lastet ned til Nedlastinger. ' +
    'Legg den ved e-posten som åpnet seg, og send.');
}

document.getElementById('btn-send-krultra').addEventListener('click', sendTilKrUltra);

// --- Importere en .loype-fil (mottatt for publisering) ---

async function importerLoype(fil) {
  let bunt;
  try {
    bunt = JSON.parse(await fil.text());
  } catch (feil) {
    toast('Kunne ikke lese fila som .loype (ugyldig JSON)', 'error');
    return;
  }
  if (!bunt || bunt.format !== LOYPE_FORMAT || !Array.isArray(bunt.punkter)
      || bunt.punkter.length < 2) {
    toast('Dette ser ikke ut som en gyldig .loype-fil', 'error');
    return;
  }
  const punkter = bunt.punkter.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele }));
  lastSporIRedigering(bunt.navn || 'Importert løype', bunt.beskrivelse, punkter,
    bunt.laget_av, bunt.lenke, {
      copyright: bunt.copyright, nøkkelord: bunt.nøkkelord, starttid: bunt.starttid,
      adressenavn: bunt.adressenavn, importertStil: bunt.stil || null,
      oversettelser: bunt.oversettelser || null, standard_sprak: bunt.standard_sprak || null,
      veipunkter: bunt.veipunkter || [],
      beholdHøyder: true, // bruk opphavspersonens høyder som de er
      kilde: { type: 'ulagret' }, // importert — publiser, eller lagre som segment
    });
  toast('Importerte «' + (bunt.navn || 'løype') + '» — klar til publisering' +
    (bunt.adressenavn ? ' (adresse: ' + bunt.adressenavn + ')' : ''));
}

document.getElementById('loype-file').addEventListener('change', (e) => {
  const fil = e.target.files[0];
  e.target.value = ''; // så samme fil kan velges igjen
  if (fil) importerLoype(fil);
});

document.getElementById('btn-elevation-source').addEventListener('click', byttHøydekilde);
document.getElementById('btn-add-wpt').addEventListener('click', leggTilWpt);

// Piltaster flytter markøren når redigeringsvisningen er aktiv
// (Shift = 10 punkter om gangen). Ignoreres når et skrivefelt har fokus.
document.addEventListener('keydown', (e) => {
  if (aktivFane !== 'editor' || !editorState.punkter) return;
  if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
  if (e.target.tagName === 'TEXTAREA') return;
  const steg = e.shiftKey ? 10 : 1;
  if (e.key === 'ArrowLeft') { settRedigeringsIndeks(editorState.valgtIdx - steg); e.preventDefault(); }
  if (e.key === 'ArrowRight') { settRedigeringsIndeks(editorState.valgtIdx + steg); e.preventDefault(); }
});

// ============================================================
// 6. Sammenslåingsvisningen
// ============================================================
// To "plasser" (a og b) som hver holder ett lastet segment med egen
// slider og eget delingspunkt. Når begge delingspunkter er satt kan
// segmentene slås sammen; resultatet vises lilla og kan lagres/eksporteres.

function lagMergePlass(bokstav, farge) {
  return {
    bokstav, farge,
    navn: null, beskrivelse: null, creator: null, link: null,
    copyright: null, nøkkelord: null,
    punkter: null, avstander: null, veipunkter: null,
    valgtIdx: 0, splitIdx: null,
    // DOM-referanser:
    slider: document.getElementById('merge-slider-' + bokstav),
    pos: document.getElementById('merge-pos-' + bokstav),
    splitLabel: document.getElementById('merge-split-label-' + bokstav),
    // Kartlag:
    spor: null, posMarkør: null, splitMarkør: null,
  };
}

const mergeState = {
  a: lagMergePlass('a', FARGE_A),
  b: lagMergePlass('b', FARGE_B),
  resultat: null,           // punktliste etter sammenslåing
  resultatAvstander: null,  // kumulativ avstand for resultatet (til profilen)
  resultatSpor: null,       // polylinja på kartet (for live stiloppdatering)
};

async function lastMergeSegment(bokstav, id) {
  try {
    const res = await api('/api/segments/' + id);
    const seg = await res.json();
    const plass = mergeState[bokstav];
    plass.navn = seg.name;
    plass.beskrivelse = seg.description || null;
    plass.creator = seg.creator || null;
    plass.link = seg.link || null;
    plass.copyright = seg.copyright || null;
    plass.nøkkelord = seg.keywords || null;
    plass.punkter = seg.points;
    plass.veipunkter = seg.waypoints || [];
    plass.avstander = kumulativAvstand(seg.points);
    plass.valgtIdx = 0;
    plass.splitIdx = null;
    plass.splitLabel.textContent = '';
    plass.slider.max = seg.points.length - 1;
    plass.slider.value = 0;

    document.getElementById('merge-hint-' + bokstav).classList.add('hidden');
    document.getElementById('merge-controls-' + bokstav).classList.remove('hidden');
    document.getElementById('merge-name-' + bokstav).textContent = seg.name;
    document.getElementById('merge-meta-' + bokstav).textContent =
      seg.points.length + ' punkter · ' + fmtKm(plass.avstander[seg.points.length - 1]);

    nullstillMergeResultat();
    tegnMergeScene();
    oppdaterAktivIndikator(); // «Slå sammen segmenter (A: …, B: …)» + brukt-tilstand
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

function tegnMergeScene() {
  tømKartet();
  const { a, b, resultat } = mergeState;
  const lister = [];
  if (a.punkter) lister.push(a.punkter);
  if (b.punkter) lister.push(b.punkter);
  if (lister.length === 0) { visKartmelding(true); tegnProfil(); return; }
  visKartmelding(false);

  // Er resultatet klart, dempes A og B så det lilla resultatet dominerer.
  const demp = resultat ? 0.25 : 0.9;

  for (const plass of [a, b]) {
    if (!plass.punkter) continue;
    plass.spor = tegnSpor(plass.punkter, plass.farge, 3, demp);
    plass.splitMarkør = plass.splitIdx != null && !resultat
      ? lagFastMarkør(plass.punkter[plass.splitIdx], plass.farge) : null;
    plass.posMarkør = resultat ? null : lagPosisjonsmarkør(plass.punkter[plass.valgtIdx], plass.farge);
  }

  if (resultat) {
    // Resultatruta bruker valgt rutefarge/-tykkelse (som i PNG-eksporten)
    mergeState.resultatSpor = tegnSpor(resultat, kartEksport.farge, kartEksport.tykkelse + 1, 0.95);
    zoomTil([resultat]);
  } else {
    mergeState.resultatSpor = null;
    zoomTil(lister);
  }

  if (!resultat) {
    for (const bokstav of ['a', 'b']) settMergeIndeks(bokstav, mergeState[bokstav].valgtIdx);
  }
  oppdaterMergeKnapper();
  tegnProfil();
}

function settMergeIndeks(bokstav, idx) {
  const plass = mergeState[bokstav];
  if (!plass.punkter) return;
  plass.valgtIdx = klem(idx, 0, plass.punkter.length - 1);
  plass.slider.value = plass.valgtIdx;
  if (plass.posMarkør) plass.posMarkør.setLatLng(tilLatLng(plass.punkter[plass.valgtIdx]));
  plass.pos.textContent =
    'Punkt ' + (plass.valgtIdx + 1) + ' / ' + plass.punkter.length +
    ' · ' + fmtKm(plass.avstander[plass.valgtIdx]);
}

function settDelingspunkt(bokstav) {
  const plass = mergeState[bokstav];
  if (!plass.punkter) return;
  plass.splitIdx = plass.valgtIdx;
  plass.splitLabel.textContent = 'Delingspunkt: punkt ' + (plass.splitIdx + 1);
  nullstillMergeResultat();
  tegnMergeScene();
}

/**
 * «Nærmest det andre delingspunktet»: finn punktet på dette segmentet
 * som ligger nærmest delingspunktet på det andre segmentet, og bruk
 * det som delingspunkt her. Typisk brukt der løypene krysser hverandre.
 */
function settNærmesteDelingspunkt(bokstav) {
  const denne = mergeState[bokstav];
  const andre = mergeState[bokstav === 'a' ? 'b' : 'a'];
  if (!denne.punkter || !andre.punkter || andre.splitIdx == null) return;

  const mål = andre.punkter[andre.splitIdx];
  let besteIdx = 0, besteKm = Infinity;
  for (let i = 0; i < denne.punkter.length; i++) {
    const d = avstandKm(mål, denne.punkter[i]);
    if (d < besteKm) { besteKm = d; besteIdx = i; }
  }

  denne.splitIdx = besteIdx;
  const meter = Math.round(besteKm * 1000);
  denne.splitLabel.textContent =
    'Delingspunkt: punkt ' + (besteIdx + 1) + ' (' + meter + ' m fra det andre delingspunktet)';
  nullstillMergeResultat();
  tegnMergeScene();
  settMergeIndeks(bokstav, besteIdx); // flytt slider/markør dit også
  if (meter > 100) {
    toast('Obs: sporene er ' + meter + ' m fra hverandre på det nærmeste', 'error');
  }
}

function nullstillMergeResultat() {
  mergeState.resultat = null;
  mergeState.resultatAvstander = null;
  document.getElementById('merge-result-info').textContent = '';
}

function oppdaterMergeKnapper() {
  const { a, b, resultat } = mergeState;
  document.getElementById('btn-merge').disabled =
    !(a.punkter && b.punkter && a.splitIdx != null && b.splitIdx != null) || !!resultat;
  // «Nærmest»-knappen på den ene sida krever delingspunkt på den andre
  document.getElementById('btn-nearest-a').disabled = !(a.punkter && b.splitIdx != null) || !!resultat;
  document.getElementById('btn-nearest-b').disabled = !(b.punkter && a.splitIdx != null) || !!resultat;
  for (const id of ['btn-save-merged', 'btn-export-merged', 'btn-edit-merged']) {
    document.getElementById(id).classList.toggle('hidden', !resultat);
  }
}

async function slåSammen() {
  const { a, b } = mergeState;
  try {
    const res = await api('/api/segments/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points_a: a.punkter, split_a: a.splitIdx,
        points_b: b.punkter, split_b: b.splitIdx,
      }),
    });
    const data = await res.json();
    mergeState.resultat = data.points;
    mergeState.resultatAvstander = kumulativAvstand(data.points);
    document.getElementById('merge-result-info').textContent =
      'Resultat: ' + data.points.length + ' punkter · ' +
      fmtKm(mergeState.resultatAvstander[data.points.length - 1]) +
      høydemeterTekst(data.points);
    tegnMergeScene();
    toast('Segmentene er slått sammen — husk å lagre resultatet');
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

/** Metadata-forslag for resultatet: navn settes sammen, resten arves fra A (ellers B). */
function foreslåttMergeMeta() {
  const { a, b } = mergeState;
  return {
    navn: (a.navn && b.navn) ? a.navn + ' + ' + b.navn : 'Sammenslått løype',
    beskrivelse: a.beskrivelse || b.beskrivelse || null,
    creator: a.creator || b.creator || null,
    link: a.link || b.link || null,
    copyright: a.copyright || b.copyright || null,
    nøkkelord: a.nøkkelord || b.nøkkelord || null,
  };
}

/** Minste avstand (km) fra et punkt til sporet — samplet, for fart. */
function minAvstandTilSpor(punkt, punkter) {
  const steg = Math.max(1, Math.floor(punkter.length / 4000));
  let beste = Infinity;
  for (let i = 0; i < punkter.length; i += steg) {
    const d = avstandKm(punkt, punkter[i]);
    if (d < beste) beste = d;
  }
  return beste;
}

/**
 * Veipunktene for et sammenslått resultat: interessepunktene fra begge
 * segmentene følger med — de som ligger langs den nye traseen. Start/Mål
 * regenereres for de nye endene, delte punkter (samme bib_id) og lokale
 * duplikater (samme navn på samme sted i begge segmentene) tas med én gang.
 */
function mergeVeipunkter(punkter, navn) {
  const alle = [...(mergeState.a.veipunkter || []), ...(mergeState.b.veipunkter || [])];
  const beholdte = [];
  const bruktBib = new Set();
  for (const w of alle) {
    const type = wptType(w);
    if (type === 'start' || type === 'maal') continue; // regenereres for den nye løypa
    if (w.bib_id && bruktBib.has(w.bib_id)) continue;  // samme delte punkt i begge
    if (minAvstandTilSpor(w, punkter) > 0.1) continue; // ligger ikke langs resultatet
    if (!w.bib_id && beholdte.some((b) =>
      !b.bib_id && b.name === w.name && avstandKm(b, w) < 0.02)) continue;
    if (w.bib_id) bruktBib.add(w.bib_id);
    beholdte.push(Object.assign({}, w));
  }
  const [start, mål] = startMålFor(punkter, navn);
  return [start, ...beholdte, mål];
}

/** Automatiske start-/målpunkter for en punktliste (brukes for sammenslåtte løyper). */
function startMålFor(punkter, navn) {
  if (!punkter || punkter.length === 0) return [];
  const første = punkter[0], siste = punkter[punkter.length - 1];
  return [
    { lat: første.lat, lon: første.lon, ele: første.ele, name: 'Start',
      desc: 'Start for ' + (navn || 'løypa'), sym: WPT_SYMBOLER.start.sym, type: 'start' },
    { lat: siste.lat, lon: siste.lon, ele: siste.ele, name: 'Mål',
      desc: 'Mål for ' + (navn || 'løypa'), sym: WPT_SYMBOLER.maal.sym, type: 'maal' },
  ];
}

async function lagreSammenslått() {
  const meta = await spørOmMeta('Lagre sammenslått segment', foreslåttMergeMeta());
  if (!meta) return;
  try {
    await api('/api/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: meta.navn, description: meta.beskrivelse,
        creator: meta.creator, link: meta.link,
        copyright: meta.copyright, keywords: meta.nøkkelord,
        points: mergeState.resultat,
        waypoints: mergeVeipunkter(mergeState.resultat, meta.navn),
      }),
    });
    huskSisteMeta(meta);
    toast('Segmentet «' + meta.navn + '» er lagret');
    oppdaterBibliotek();
  } catch (feil) {
    toast(feil.message, 'error');
  }
}

// --- Hendelser i sammenslåingsvisningen ---

for (const bokstav of ['a', 'b']) {
  const plass = mergeState[bokstav];
  plass.slider.addEventListener('input', () => settMergeIndeks(bokstav, Number(plass.slider.value)));
  koblAutoRepeat(document.getElementById('merge-prev-' + bokstav),
    (antall) => settMergeIndeks(bokstav, plass.valgtIdx - antall));
  koblAutoRepeat(document.getElementById('merge-next-' + bokstav),
    (antall) => settMergeIndeks(bokstav, plass.valgtIdx + antall));
  document.getElementById('btn-split-' + bokstav).addEventListener('click', () => settDelingspunkt(bokstav));
  document.getElementById('btn-nearest-' + bokstav).addEventListener('click', () => settNærmesteDelingspunkt(bokstav));
}

document.getElementById('btn-merge').addEventListener('click', slåSammen);
document.getElementById('btn-save-merged').addEventListener('click', lagreSammenslått);
document.getElementById('btn-export-merged').addEventListener('click', () => {
  const meta = foreslåttMergeMeta();
  eksporterGpx(mergeState.resultat, meta, mergeVeipunkter(mergeState.resultat, meta.navn));
});
document.getElementById('btn-edit-merged').addEventListener('click', () => {
  const meta = foreslåttMergeMeta();
  lastSporIRedigering(meta.navn, meta.beskrivelse, mergeState.resultat, meta.creator, meta.link, {
    copyright: meta.copyright, nøkkelord: meta.nøkkelord,
    veipunkter: mergeVeipunkter(mergeState.resultat, meta.navn),
    kilde: { type: 'ulagret' }, // må lagres som segment/GPX før PoI kan endres
  });
  toast('Resultatet er åpnet i redigeringsvisningen (med interessepunktene fra begge segmentene) — lagre det for å kunne endre punktene');
});

// ============================================================
// 7. PNG-eksport av kartet (med valgfritt utsnitt)
// ============================================================
// Bygger kartbildet selv: henter de samme kartflisene som Leaflet viser
// (tillatt — tjenestene har åpen CORS) og tegner dem på et canvas sammen
// med ruta (i valgt farge/tykkelse) og interessepunktene. Brukeren kan
// begrense eksporten til et rektangulært utsnitt tegnet rett på kartet.

const kartEksport = {
  farge: localStorage.getItem('gps-tool.kart.rutefarge') || '#dc2626',
  tykkelse: Number(localStorage.getItem('gps-tool.kart.tykkelse')) || 4,
  // Ledestrek fra ikon til løypepunkt (farge + tykkelse, som for løypa)
  strekFarge: localStorage.getItem('gps-tool.wpt.strekfarge') || '#334155',
  strekTykkelse: Number(localStorage.getItem('gps-tool.wpt.strektykkelse')) || 2,
  // Manuell ikonstørrelse: 0.5–2.0 × standardstørrelsen
  ikonSkala: Number(localStorage.getItem('gps-tool.wpt.ikonskala')) || 1,
  utsnitt: null,   // L.LatLngBounds eller null (= hele kartvisningen)
  rekt: null,      // rektangelet som viser utsnittet på kartet
  velger: false,   // er vi i "dra opp utsnitt"-modus?
};

// --- Web Mercator-regning (standard flisematematikk) ---
function merkatorX(lon, z) { return ((lon + 180) / 360) * 256 * Math.pow(2, z); }
function merkatorY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * Math.pow(2, z);
}

function flisUrl(mal, z, x, y) {
  return mal.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

/** Hent én kartflis som bilde (CORS-aktivert så den kan tegnes på canvas). */
function hentFlis(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // manglende flis: hopp over, ikke stopp alt
    img.src = url;
  });
}

/** Dekod HTML-entiteter i en ren tekststreng (brukes på kartattribusjonene
 *  før de tegnes på canvas, der «&copy;» ellers vises literalt). */
function avkodEntiteter(tekst) {
  const ta = document.createElement('textarea');
  ta.innerHTML = tekst;
  return ta.value;
}

// Sikkerhetstak for PNG-canvas (for stort sprenger nettleseren): maks sidelengde
// og maks totalt antall piksler.
const PNG_MAKS_SIDE = 10000;
const PNG_MAKS_PIKSLER = 80e6;

/** Pikselmål (Web-Mercator, 256px-fliser) for et kartutsnitt ved gitt zoom. */
function pngMål(grenser, z) {
  const x0 = merkatorX(grenser.getWest(), z), x1 = merkatorX(grenser.getEast(), z);
  const y0 = merkatorY(grenser.getNorth(), z), y1 = merkatorY(grenser.getSouth(), z);
  return { x0, x1, y0, y1, bredde: Math.round(x1 - x0), høyde: Math.round(y1 - y0) };
}

function pngForStort(m) {
  return m.bredde > PNG_MAKS_SIDE || m.høyde > PNG_MAKS_SIDE ||
    m.bredde * m.høyde > PNG_MAKS_PIKSLER;
}

async function eksporterKartPng() {
  // Vern mot dobbeltklikk: flisehentingen tar noen sekunder, og et nytt
  // klikk i mellomtida ville startet enda en eksport.
  if (kartEksport.pågår) return;
  const grenser = kartEksport.utsnitt || map.getBounds();
  const lagDef = KARTLAG[aktivtKartlag];

  // Zoom-området: fra litt under nåværende og opp til det høyeste kartkilden
  // tilbyr som fortsatt holder seg innenfor sikkerhetstaket (mer zoom = mer
  // detalj og høyere oppløsning). Default = høyest tilgjengelig.
  const zNå = Math.round(map.getZoom());
  const zMaksKilde = lagDef.maxZoom || zNå;
  let zMaks = zNå;
  for (let z = zNå; z <= zMaksKilde; z++) {
    if (pngForStort(pngMål(grenser, z))) break;
    zMaks = z;
  }
  const zMin = Math.max(3, Math.min(zNå, zMaks) - 3);

  const slider = document.getElementById('png-zoom');
  const info = document.getElementById('png-zoom-info');
  slider.min = zMin; slider.max = zMaks; slider.value = zMaks;
  const oppdaterInfo = () => {
    const z = Number(slider.value);
    const m = pngMål(grenser, z);
    const mp = (m.bredde * m.høyde / 1e6).toFixed(1);
    info.textContent = 'Zoom ' + z + ' · ' + m.bredde + '×' + m.høyde +
      ' px (~' + mp + ' megapiksler)' + (z >= zMaks ? ' — høyest tilgjengelig' : '');
  };
  slider.oninput = oppdaterInfo;
  oppdaterInfo();

  const handling = await ventPåDialog(document.getElementById('png-export-dialog'));
  if (handling !== 'ok') return;

  kartEksport.pågår = true;
  const eksportKnapp = document.getElementById('btn-export-map');
  eksportKnapp.disabled = true;
  try {
    await lagKartPngOgLagre(Number(slider.value));
  } finally {
    kartEksport.pågår = false;
    eksportKnapp.disabled = false;
  }
}

async function lagKartPngOgLagre(zValgt) {
  const grenser = kartEksport.utsnitt || map.getBounds();
  const lagDef = KARTLAG[aktivtKartlag];

  // Bruk brukerens valgte zoom (fra dialogen), men reduser om noe skulle
  // sprenge sikkerhetstaket (defensivt — dialogen tilbyr aldri for stort).
  let z = (zValgt != null) ? zValgt : Math.round(map.getZoom());
  const dim = (zz) => ({
    x0: merkatorX(grenser.getWest(), zz), x1: merkatorX(grenser.getEast(), zz),
    y0: merkatorY(grenser.getNorth(), zz), y1: merkatorY(grenser.getSouth(), zz),
  });
  let d = dim(z);
  while (pngForStort(pngMål(grenser, z)) && z > 3) { z--; d = dim(z); }

  const bredde = Math.round(d.x1 - d.x0);
  const høyde = Math.round(d.y1 - d.y0);
  if (bredde < 10 || høyde < 10) {
    toast('Utsnittet er for lite — dra opp et større område', 'error');
    return;
  }

  toast('Lager kartbilde (' + bredde + '×' + høyde + ' px)…');

  const canvas = document.createElement('canvas');
  canvas.width = bredde;
  canvas.height = høyde;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, bredde, høyde);

  // ---- Kartfliser ----
  const flisJobber = [];
  for (let ty = Math.floor(d.y0 / 256); ty <= Math.floor((d.y1 - 1) / 256); ty++) {
    for (let tx = Math.floor(d.x0 / 256); tx <= Math.floor((d.x1 - 1) / 256); tx++) {
      flisJobber.push(
        hentFlis(flisUrl(lagDef.url, z, tx, ty)).then((img) => {
          if (img) ctx.drawImage(img, Math.round(tx * 256 - d.x0), Math.round(ty * 256 - d.y0));
        })
      );
    }
  }
  await Promise.all(flisJobber);

  const tilPx = (lat, lon) => [merkatorX(lon, z) - d.x0, merkatorY(lat, z) - d.y0];

  // ---- Rutestreken(e) — alle sporene som vises nå, i valgt farge/tykkelse ----
  ctx.strokeStyle = kartEksport.farge;
  ctx.lineWidth = kartEksport.tykkelse;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  kartlag.eachLayer((lag) => {
    // Kun spor (polylinjer) — markører og annet tegnes ikke her
    if (!(lag instanceof L.Polyline) || lag instanceof L.Polygon) return;
    const latlngs = lag.getLatLngs();
    if (latlngs.length < 2) return;
    ctx.beginPath();
    latlngs.forEach((ll, i) => {
      const [x, y] = tilPx(ll.lat, ll.lng);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // ---- Interessepunkter (i redigeringsvisningen) ----
  // Samme design som på skjermen: liten sirkel på løypepunktet, ledestrek
  // til en ramme med alle symbolene — der brukeren har plassert den, og
  // skalert etter eksportens zoomnivå. Skjulte punkter tas ikke med.
  if (aktivFane === 'editor' && editorState.punkter && wptVis) {
    const ikon = wptIkonPx(z);
    const skala = ikon / WPT_BASIS;
    const gap = 3 * skala, pad = 4 * skala;
    for (const w of editorState.veipunkter) {
      const [x, y] = tilPx(w.lat, w.lon);
      // Punktmarkøren tegnes alltid
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (w.vis_ikon === false) continue; // ikonene skjult for dette punktet

      // Rammeposisjon: brukerens plassering, ellers standard vinkelrett ut
      let lx, ly;
      if (w.lab_lat != null && w.lab_lon != null) {
        [lx, ly] = tilPx(w.lab_lat, w.lab_lon);
      } else {
        const [ux, uy] = wptOffsetEnhet(w);
        const dist = 26 + ikon;
        lx = x + ux * dist; ly = y + uy * dist;
      }
      if (Math.max(x, lx) < -120 || Math.max(y, ly) < -120 ||
          Math.min(x, lx) > bredde + 120 || Math.min(y, ly) > høyde + 120) continue;

      const rader = ikonRader(wptTyper(w), WPT_MAKS_PER_RAD_KART);
      const kolonner = Math.max(...rader.map((r) => r.length));
      const fw = kolonner * ikon + (kolonner - 1) * gap + 2 * pad;
      const fh = rader.length * ikon + (rader.length - 1) * gap + 2 * pad;

      // Ledestrek fra løypepunkt til ramme (brukervalgt farge/tykkelse)
      ctx.strokeStyle = kartEksport.strekFarge;
      ctx.lineWidth = kartEksport.strekTykkelse;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly); ctx.stroke();
      // Punktmarkøren tegnes på nytt oppå streken
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();

      // Selve ramma (sentrert på rammeposisjonen) med symbolene på rad.
      // Helt hvit bakgrunn så ledestreken ikke skinner gjennom.
      const rx = lx - fw / 2, ry = ly - fh / 2;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(rx, ry, fw, fh, 5 * skala); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(rx, ry, fw, fh); ctx.strokeRect(rx, ry, fw, fh); }

      // Symbolene rad for rad, hver rad sentrert i ramma
      rader.forEach((rad, r) => {
        const radBredde = rad.length * ikon + (rad.length - 1) * gap;
        const startX = lx - radBredde / 2 + ikon / 2;
        const cy = ry + pad + ikon / 2 + r * (ikon + gap);
        rad.forEach((t, j) => {
          tegnSymbolCanvas(ctx, t, startX + j * (ikon + gap), cy, ikon);
        });
      });
    }
  }

  // ---- Kildeangivelse (kreves av karttjenestene) ----
  // Strip HTML-tagger, og dekod entitetene som brukes i attribusjonene
  // (ellers havner literalen «&copy; Kartverket» i PNG-en i stedet for «©»).
  const kilde = avkodEntiteter(lagDef.attribution.replace(/<[^>]*>/g, ''));
  ctx.font = '11px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const tb = ctx.measureText(kilde);
  ctx.fillRect(bredde - tb.width - 10, høyde - 18, tb.width + 10, 18);
  ctx.fillStyle = '#334155';
  ctx.fillText(kilde, bredde - 5, høyde - 4);

  // Vent på PNG-en før vi returnerer, slik at dobbeltklikk-vernet i
  // eksporterKartPng holder helt til lagringen faktisk er ferdig.
  const blob = await new Promise((resolve) => canvas.toBlob(resolve));
  const navn = ((aktivFane === 'editor' && editorState.navn) || 'kart')
    .replace(/[\\/:*?"<>|]/g, '_');
  const lagret = await lagreFil(blob, navn + ' - kart.png', 'PNG-bilde', {
    'image/png': ['.png'],
  });
  if (lagret) toast('Kartet er lagret som PNG (' + bredde + '×' + høyde + ' px)');
}

// --- Velge utsnitt: dra opp et rektangel rett på kartet ---

function startUtsnittsvalg() {
  if (kartEksport.velger) { avsluttUtsnittsvalg(); return; }
  kartEksport.velger = true;
  document.getElementById('btn-select-crop').classList.add('active', 'btn-primary');
  document.getElementById('map').classList.add('velger-utsnitt');
  map.dragging.disable();
  toast('Dra opp et rektangel på kartet for å velge utsnitt');

  let startPunkt = null;

  function vedNed(e) { startPunkt = e.latlng; }
  function vedFlytt(e) {
    if (!startPunkt) return;
    const grenser = L.latLngBounds(startPunkt, e.latlng);
    if (kartEksport.rekt) kartEksport.rekt.setBounds(grenser);
    else kartEksport.rekt = L.rectangle(grenser, {
      color: '#0f172a', weight: 2, dashArray: '6 4', fillOpacity: 0.08,
    }).addTo(map);
  }
  function vedOpp(e) {
    if (!startPunkt) return;
    kartEksport.utsnitt = L.latLngBounds(startPunkt, e.latlng);
    avsluttUtsnittsvalg();
    document.getElementById('btn-clear-crop').classList.remove('hidden');
    toast('Utsnitt valgt — «Kart som PNG» eksporterer nå bare dette området');
  }

  map.on('mousedown', vedNed);
  map.on('mousemove', vedFlytt);
  map.on('mouseup', vedOpp);
  kartEksport.ryddOpp = () => {
    map.off('mousedown', vedNed);
    map.off('mousemove', vedFlytt);
    map.off('mouseup', vedOpp);
  };
}

function avsluttUtsnittsvalg() {
  kartEksport.velger = false;
  if (kartEksport.ryddOpp) kartEksport.ryddOpp();
  document.getElementById('btn-select-crop').classList.remove('active', 'btn-primary');
  document.getElementById('map').classList.remove('velger-utsnitt');
  map.dragging.enable();
}

function fjernUtsnitt() {
  kartEksport.utsnitt = null;
  if (kartEksport.rekt) { map.removeLayer(kartEksport.rekt); kartEksport.rekt = null; }
  document.getElementById('btn-clear-crop').classList.add('hidden');
}

document.getElementById('btn-toggle-wpt').addEventListener('click', () => {
  wptVis = !wptVis;
  localStorage.setItem('gps-tool.wptVis', wptVis ? '1' : '0');
  document.getElementById('btn-toggle-wpt').classList.toggle('active', wptVis);
  if (aktivFane === 'editor' && editorState.punkter) tegnVeipunkter();
});
document.getElementById('btn-select-crop').addEventListener('click', startUtsnittsvalg);
document.getElementById('btn-clear-crop').addEventListener('click', fjernUtsnitt);
document.getElementById('btn-export-map').addEventListener('click', () =>
  eksporterKartPng().catch((feil) => toast(feil.message, 'error')));

/** Oppdater rutestreken(e) på skjermen så de speiler valgt farge/tykkelse. */
function oppdaterRuteStil() {
  const stil = { color: kartEksport.farge, weight: kartEksport.tykkelse };
  if (editorState.spor) editorState.spor.setStyle(stil);
  if (editorState.utsnitt) editorState.utsnitt.setStyle({ weight: kartEksport.tykkelse + 3 });
  if (mergeState.resultatSpor) {
    mergeState.resultatSpor.setStyle({ color: kartEksport.farge, weight: kartEksport.tykkelse + 1 });
  }
}

// ============================================================
// 3D fly-by (forhåndsvisning i verktøyet)
// ============================================================

/**
 * Åpne en simulert gjennomkjøring av sporet som vises nå — samme
 * visning som deltakerne får i den publiserte løypa, så arrangøren kan
 * se resultatet før publisering.
 *
 * Veipunktene lagres med lat/lon (uten indeks — den beregnes først ved
 * publisering), så her forankres de i sporet med `nærmesteSporIndeks`.
 */
function åpneFlybyEditor() {
  const kilde = profilKilde();
  if (!kilde || !kilde.punkter || kilde.punkter.length < 4) {
    alert('Last inn et spor først — fly-by trenger en løype å følge.');
    return;
  }
  const punkter = kilde.punkter;
  const høyder = høyderMedInterpolering(punkter);
  if (!høyder) {
    alert('Sporet mangler høydedata. Hent høyder fra Kartverket først, ' +
      'så kan fly-byen vise stigningene riktig.');
    return;
  }

  // Høydemeter akkumulert per punkt, med samme utjevning som profilen
  const glatte = gaussUtjevning(høyder, profilState.utjevning, profilState.vektform);
  const oppAkk = [0], nedAkk = [0];
  for (let i = 1; i < glatte.length; i++) {
    const d = glatte[i] - glatte[i - 1];
    oppAkk.push(oppAkk[i - 1] + Math.max(0, d));
    nedAkk.push(nedAkk[i - 1] + Math.max(0, -d));
  }

  // Veipunkter: bare for det innlastede sporet i redigeringsfanen
  let veipunkter = [];
  if (aktivFane === 'editor' && punkter === editorState.punkter) {
    veipunkter = editorState.veipunkter.map((w) =>
      Object.assign({}, w, { idx: nærmesteSporIndeks(w) }));
  }

  KULFlyby.åpne({
    punkter,
    avstander: kilde.avstander,
    oppAkk,
    nedAkk,
    veipunkter,
    stil: { rutefarge: kartEksport.farge, tykkelse: kartEksport.tykkelse },
    navn: kilde.navn || 'Løype',
    lang: 'no',
    lagreVideo: lagreFlyoverVideo,
  });
}

/** Legg en ferdig innspilt flyover-video i KUL sitt videobibliotek. */
async function lagreFlyoverVideo(res, navn) {
  const skjema = new FormData();
  // Filnavnet her betyr lite — serveren gir videoen sin egen id — men
  // endelsen må stemme med formatet nettleseren spilte inn i.
  skjema.append('file', res.blob, 'flyover.' + res.endelse);
  skjema.append('navn', navn);
  skjema.append('varighet', String(Math.round(res.varighet * 10) / 10));
  skjema.append('bredde', String(res.bredde));
  skjema.append('hoyde', String(res.høyde));
  const kilde = profilKilde();
  if (kilde && kilde.navn) skjema.append('loype', kilde.navn);

  const svar = await fetch('/api/videos', { method: 'POST', body: skjema });
  if (!svar.ok) {
    const feil = await svar.json().catch(() => ({}));
    throw new Error(feil.detail || ('HTTP ' + svar.status));
  }
  const video = await svar.json();
  toast('Videoen «' + video.navn + '» er lagret i KUL.', 'success');
  oppdaterVideobibliotek();   // vis den med én gang i biblioteket
  return video;
}

document.getElementById('btn-flyby').addEventListener('click', åpneFlybyEditor);

document.getElementById('map-track-color').addEventListener('input', (e) => {
  kartEksport.farge = e.target.value;
  localStorage.setItem('gps-tool.kart.rutefarge', kartEksport.farge);
  oppdaterRuteStil();
});
document.getElementById('map-track-width').addEventListener('input', (e) => {
  kartEksport.tykkelse = Number(e.target.value);
  document.getElementById('map-track-width-val').textContent = kartEksport.tykkelse;
  localStorage.setItem('gps-tool.kart.tykkelse', String(kartEksport.tykkelse));
  oppdaterRuteStil();
});

/** Tegn veipunktene på nytt (i redigering) etter en stilendring. */
function oppdaterWptStil() {
  if (aktivFane === 'editor' && editorState.punkter) tegnVeipunkter();
  if (profilState.synlig) tegnProfil();
}

document.getElementById('wpt-line-color').addEventListener('input', (e) => {
  kartEksport.strekFarge = e.target.value;
  localStorage.setItem('gps-tool.wpt.strekfarge', kartEksport.strekFarge);
  oppdaterWptStil();
});
document.getElementById('wpt-line-width').addEventListener('input', (e) => {
  kartEksport.strekTykkelse = Number(e.target.value);
  document.getElementById('wpt-line-width-val').textContent = kartEksport.strekTykkelse;
  localStorage.setItem('gps-tool.wpt.strektykkelse', String(kartEksport.strekTykkelse));
  oppdaterWptStil();
});
document.getElementById('wpt-size').addEventListener('input', (e) => {
  kartEksport.ikonSkala = Number(e.target.value) / 100;
  document.getElementById('wpt-size-val').textContent = e.target.value + '%';
  localStorage.setItem('gps-tool.wpt.ikonskala', String(kartEksport.ikonSkala));
  oppdaterWptStil();
});

// ============================================================
// 7b. Hjelpekortet for «Slå sammen segmenter»
// ============================================================
// Et flytende kort som forklarer framgangsmåten. Det kan dras dit det ikke
// skjuler kartdetaljer, og lukkes helt («? Hjelp» henter det fram igjen).
// Både posisjon og lukket-tilstand huskes lokalt.

const mergeHjelp = {
  el: document.getElementById('merge-hjelp'),
  NØKKEL_SKJULT: 'gps-tool.merge-hjelp-skjult',
  NØKKEL_POS: 'gps-tool.merge-hjelp-pos',

  erSkjult() { return localStorage.getItem(mergeHjelp.NØKKEL_SKJULT) === '1'; },

  /** Vis kortet (om det ikke er lukket av brukeren) — kun i merge-modus. */
  oppdater(fane) {
    const vis = fane === 'merge' && !mergeHjelp.erSkjult();
    mergeHjelp.el.classList.toggle('hidden', !vis);
    if (vis) mergeHjelp.plasser();
  },

  /** Sett posisjonen fra minnet, klemt innenfor vinduet (så et kort som ble
   *  lagt igjen utenfor kanten etter en vindusendring alltid er synlig). */
  plasser() {
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(mergeHjelp.NØKKEL_POS) || 'null'); }
    catch (e) { pos = null; }
    const b = mergeHjelp.el.getBoundingClientRect();
    const maksX = Math.max(0, window.innerWidth - b.width);
    const maksY = Math.max(0, window.innerHeight - b.height);
    // Standardplassering: øverst til høyre, godt klar av toppbanneret
    const x = pos ? Math.min(Math.max(0, pos.x), maksX) : maksX - 24;
    const y = pos ? Math.min(Math.max(0, pos.y), maksY) : 96;
    mergeHjelp.el.style.left = x + 'px';
    mergeHjelp.el.style.top = y + 'px';
  },

  lukk() {
    localStorage.setItem(mergeHjelp.NØKKEL_SKJULT, '1');
    mergeHjelp.el.classList.add('hidden');
  },

  vis() {
    localStorage.setItem(mergeHjelp.NØKKEL_SKJULT, '0');
    mergeHjelp.el.classList.remove('hidden');
    mergeHjelp.plasser();
  },
};

document.getElementById('merge-hjelp-lukk').addEventListener('click', mergeHjelp.lukk);
document.getElementById('merge-hjelp-vis').addEventListener('click', mergeHjelp.vis);

// Dra kortet etter overskriftslinja
(function koblMergeHjelpDrag() {
  const håndtak = document.getElementById('merge-hjelp-drahandtak');
  let dx = 0, dy = 0, drar = false;
  håndtak.addEventListener('mousedown', (e) => {
    if (e.target.id === 'merge-hjelp-lukk') return; // lukkeknappen er ikke draing
    const b = mergeHjelp.el.getBoundingClientRect();
    dx = e.clientX - b.left;
    dy = e.clientY - b.top;
    drar = true;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!drar) return;
    const b = mergeHjelp.el.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - dx), window.innerWidth - b.width);
    const y = Math.min(Math.max(0, e.clientY - dy), window.innerHeight - b.height);
    mergeHjelp.el.style.left = x + 'px';
    mergeHjelp.el.style.top = y + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!drar) return;
    drar = false;
    const b = mergeHjelp.el.getBoundingClientRect();
    localStorage.setItem(mergeHjelp.NØKKEL_POS,
      JSON.stringify({ x: Math.round(b.left), y: Math.round(b.top) }));
  });
})();

// ============================================================
// 8. Fanebytte og oppstart
// ============================================================

let aktivFane = 'editor';

/** Oppdater modusknappene i toppbanneret: navnet på det som redigeres vises i
 *  parentes bak modusnavnet, og hver knapp får riktig tilstand:
 *    • aktiv    = modusen vi jobber i nå (hvit på blå)
 *    • brukt    = modusen har innhold, men er ikke aktiv (blå ramme)
 *    • (ingen)  = ubrukt modus (hvit på grå)
 *  Kalles ved fanebytte og når segment/merge/arena endres (arena.js via window). */
function oppdaterAktivIndikator() {
  const segNavn = (editorState.punkter && editorState.navn) || null;
  const arenaNavn = (window.arenaEditor && window.arenaEditor.aktivNavn
    && window.arenaEditor.aktivNavn()) || null;
  // Merge-modus: «(A: X, B: Y)» når A og/eller B er valgt
  const mergeDeler = [];
  if (mergeState.a.navn) mergeDeler.push('A: ' + mergeState.a.navn);
  if (mergeState.b.navn) mergeDeler.push('B: ' + mergeState.b.navn);
  const mergeSuffiks = mergeDeler.length ? ' (' + mergeDeler.join(', ') + ')' : '';

  const knapper = {
    editor: { navn: '✎ Rediger segment', suffiks: segNavn ? ' (' + segNavn + ')' : '',
      brukt: !!editorState.punkter },
    merge: { navn: '🔗 Slå sammen segmenter', suffiks: mergeSuffiks,
      brukt: !!(mergeState.a.punkter || mergeState.b.punkter) },
    arena: { navn: '🏟️ Rediger arenakart', suffiks: arenaNavn ? ' (' + arenaNavn + ')' : '',
      brukt: !!arenaNavn },
  };
  for (const [modus, info] of Object.entries(knapper)) {
    const b = document.getElementById('tab-' + modus);
    b.textContent = info.navn + info.suffiks;
    const aktiv = modus === aktivFane;
    b.classList.toggle('active', aktiv);
    b.classList.toggle('brukt', info.brukt && !aktiv);
  }
}
window.oppdaterAktivIndikator = oppdaterAktivIndikator;

function byttFane(fane) {
  aktivFane = fane;
  const erArena = fane === 'arena';
  oppdaterAktivIndikator(); // navn + aktiv/brukt-tilstand på modusknappene
  visBibliotekFor(fane); // ekspander riktig bibliotek, kollaps det andre
  mergeHjelp.oppdater(fane); // flytende hjelpekort kun i merge-modus
  document.getElementById('editor-panel').classList.toggle('hidden', fane !== 'editor');
  document.getElementById('merge-panel').classList.toggle('hidden', fane !== 'merge');

  // Arenakart er et helt separat arbeidsområde: skjul løype-/profilflaten og
  // vis arena-workspace i stedet. All arena-logikk ligger i arena.js.
  document.querySelector('.map-toolbar').classList.toggle('hidden', erArena);
  document.getElementById('map').classList.toggle('hidden', erArena);
  document.getElementById('profile-section').classList.toggle('arena-tvunget-skjult', erArena);
  document.getElementById('arena-workspace').classList.toggle('hidden', !erArena);

  if (erArena) {
    oppdaterBibliotek(); // fjern A/B-merkene fra segmentkortene i arenakart-modus
    if (window.arenaEditor) window.arenaEditor.aktiver();
    return; // arena styrer sin egen scene
  }

  // Tegn scenen som hører til fanen (state beholdes ved fanebytte)
  if (fane === 'editor') {
    if (editorState.punkter) { tegnRedigeringsscene(); settRedigeringsIndeks(editorState.valgtIdx); }
    else { tømKartet(); visKartmelding(true); tegnProfil(); }
  } else {
    tegnMergeScene();
  }
  oppdaterBibliotek(); // knappene i biblioteket avhenger av fanen
  // Kartet kan ha endret størrelse mens panelet byttet — be Leaflet måle på nytt
  setTimeout(() => map.invalidateSize(), 50);
}

document.getElementById('tab-editor').addEventListener('click', () => byttFane('editor'));
document.getElementById('tab-merge').addEventListener('click', () => byttFane('merge'));
document.getElementById('tab-arena').addEventListener('click', () => byttFane('arena'));

// Oppstart: gjenopprett lagrede valg, hent biblioteket, vis tom-tilstand
// settKartfliser speiler selv riktig verdi i Kartvisning-dropdownen («Skjul
// kart» når kartet er av, ellers det aktive laget).
settKartfliser(localStorage.getItem('gps-tool.kart') === '1');
document.getElementById('map-track-color').value = kartEksport.farge;
document.getElementById('map-track-width').value = kartEksport.tykkelse;
document.getElementById('map-track-width-val').textContent = kartEksport.tykkelse;
document.getElementById('wpt-line-color').value = kartEksport.strekFarge;
document.getElementById('wpt-line-width').value = kartEksport.strekTykkelse;
document.getElementById('wpt-line-width-val').textContent = kartEksport.strekTykkelse;
document.getElementById('wpt-size').value = Math.round(kartEksport.ikonSkala * 100);
document.getElementById('wpt-size-val').textContent = Math.round(kartEksport.ikonSkala * 100) + '%';
document.getElementById('profile-axes').checked = profilState.akser;
document.getElementById('profile-grid').checked = profilState.rutenett;
document.getElementById('profile-line-color').value = profilState.linje;
document.getElementById('profile-fill-on').checked = profilState.fyllPå;
document.getElementById('profile-fill-color').value = profilState.fyll;
document.getElementById('profile-bg-color').value = profilState.bakgrunn;
document.getElementById('profile-font').value = profilState.tekst;
document.getElementById('profile-font-val').textContent = profilState.tekst;
document.getElementById('profile-smooth').value = profilState.utjevning;
document.getElementById('profile-smooth-val').textContent =
  profilState.utjevning === 0 ? '0' : '±' + profilState.utjevning;
document.getElementById('profile-shape').value = profilState.vektform;
document.getElementById('profile-shape-val').textContent = profilState.vektform;
document.getElementById('profile-axis-color').value = profilState.akseFarge;
document.getElementById('profile-grid-color').value = profilState.rutenettFarge;
document.getElementById('profile-tick-color').value = profilState.tallFarge;
document.getElementById('profile-marker-on').checked = profilState.markørVis;
document.getElementById('profile-marker-color').value = profilState.markørFarge;
document.getElementById('profile-wpt-names').checked = profilState.visNavn;
document.getElementById('profile-wpt-icons').checked = profilState.visIkoner;
document.getElementById('profile-wpt-color').value = profilState.punktFarge;
settVisModus(visModus); // setter visningsmodus og profilens synlighet

visKartmelding(true);
document.getElementById('btn-toggle-wpt').classList.toggle('active', wptVis);
oppdaterWptKnapp(); // deaktivert til en løype er lastet
oppdaterBibliotek().catch((feil) => toast(feil.message, 'error'));
oppdaterArenabibliotek().catch((feil) => toast(feil.message, 'error'));
oppdaterPunktbibliotek().catch((feil) => toast(feil.message, 'error'));
oppdaterKontaktbibliotek().catch((feil) => toast(feil.message, 'error'));
oppdaterVideobibliotek();   // feiler stille på eldre server uten videostøtte

// Versjonen frontend forventer av backend. Økes i takt med BACKEND_VERSJON
// i backend/routes.py når nye endepunkter/felter tas i bruk.
const FORVENTET_BACKEND = 30;

/** Sjekk at den kjørende serveren har ny nok kode; ellers varsle tydelig. */
async function sjekkServerversjon() {
  const banner = document.getElementById('stale-banner');
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error('health svarte ' + res.status);
    const data = await res.json();
    if ((data.versjon || 0) < FORVENTET_BACKEND) throw new Error('gammel versjon');
    banner.classList.add('hidden'); // alt i orden
  } catch (feil) {
    // /api/health mangler (gammel server) eller for lav versjon → varsle
    banner.classList.remove('hidden');
  }
}
sjekkServerversjon();

// Vis verktøyets versjon i topplinja
document.getElementById('app-version').textContent = 'versjon ' + APP_VERSJON;
