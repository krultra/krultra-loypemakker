/* ============================================================
   Felles kodebibliotek for KrUltra Løypemakker (KUL)

   Rene funksjoner og symboldefinisjoner som brukes BÅDE av selve
   verktøyet (app.js) og av den publiserbare løypevisningen
   (viewer/viewer.js). Ingenting her rører DOM-tilstand eller
   globale variabler — alt er inn/ut-funksjoner, så de kan lastes
   trygt i begge miljøer med en vanlig <script>-tagg.

   Endrer du noe her: husk at endringen først når de publiserte
   løypevisningene når viewer-assets publiseres på nytt
   (ASSET_VERSJON i backend/publisering.py).
   ============================================================ */
'use strict';

// ============================================================
// Geometri og statistikk
// ============================================================

/** Avstand i km mellom to punkter (haversine-formelen). */
function avstandKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Kumulativ avstand (km) fra start til hvert punkt. */
function kumulativAvstand(punkter) {
  const d = [0];
  for (let i = 1; i < punkter.length; i++) {
    d.push(d[i - 1] + avstandKm(punkter[i - 1], punkter[i]));
  }
  return d;
}

/** Formater km pent på norsk, f.eks. "3,42 km". */
function fmtKm(km) {
  return km.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
}

/** Begrens en verdi til intervallet [min, maks]. */
function klem(v, min, maks) { return Math.max(min, Math.min(maks, v)); }

/**
 * Gaussisk utjevning av høydene: hvert punkt erstattes av et vektet
 * snitt av seg selv og `n` punkter på hver side. Vektene følger en
 * gauss-kurve med punktet selv i midten; `form` (1–10) styrer hvor
 * spiss kurven er: 1 = flat (alle nabopunktene teller nesten likt),
 * 10 = spiss (punktet i midten dominerer, minimal utjevning).
 * Fjerner GPS-artefakter (enkeltpunkter med ville høydeutslag) uten å
 * flate ut reelle topper mer enn nødvendig.
 */
function gaussUtjevning(høyder, n, form) {
  if (n <= 0) return høyder;
  const sigma = n / form;
  const vekter = [];
  for (let j = -n; j <= n; j++) vekter.push(Math.exp(-(j * j) / (2 * sigma * sigma)));

  const resultat = new Array(høyder.length);
  for (let i = 0; i < høyder.length; i++) {
    let sum = 0, vektsum = 0;
    // Ved kantene brukes bare de nabopunktene som faktisk finnes
    for (let j = -n; j <= n; j++) {
      const k = i + j;
      if (k < 0 || k >= høyder.length) continue;
      const v = vekter[j + n];
      sum += høyder[k] * v;
      vektsum += v;
    }
    resultat[i] = sum / vektsum;
  }
  return resultat;
}

/**
 * Høyder klare til tegning: hull (punkter uten høyde) fylles med
 * lineær interpolering mellom nærmeste kjente naboer.
 * Returnerer null hvis sporet ikke har høydedata i det hele tatt.
 */
function høyderMedInterpolering(punkter) {
  const ele = punkter.map((p) => (p.ele == null ? null : p.ele));
  const kjente = [];
  for (let i = 0; i < ele.length; i++) if (ele[i] != null) kjente.push(i);
  if (kjente.length === 0) return null;

  const res = ele.slice();
  for (let i = 0; i < kjente[0]; i++) res[i] = ele[kjente[0]];
  for (let i = kjente[kjente.length - 1] + 1; i < ele.length; i++) {
    res[i] = ele[kjente[kjente.length - 1]];
  }
  for (let k = 0; k < kjente.length - 1; k++) {
    const i0 = kjente[k], i1 = kjente[k + 1];
    for (let i = i0 + 1; i < i1; i++) {
      res[i] = ele[i0] + ((ele[i1] - ele[i0]) * (i - i0)) / (i1 - i0);
    }
  }
  return res;
}

/**
 * Høydemeter opp og ned for en punktliste, beregnet med samme
 * utjevning som profilen tegnes med. Returnerer {opp, ned} i hele
 * meter, eller null hvis sporet mangler høydedata.
 */
function beregnHøydemeter(punkter, utjevning, vektform) {
  const høyder = høyderMedInterpolering(punkter);
  if (!høyder) return null;
  const glatte = gaussUtjevning(høyder, utjevning, vektform);
  let opp = 0, ned = 0;
  for (let i = 1; i < glatte.length; i++) {
    const diff = glatte[i] - glatte[i - 1];
    if (diff > 0) opp += diff; else ned -= diff;
  }
  return { opp: Math.round(opp), ned: Math.round(ned) };
}

/** Velg et "pent" intervall for akseticks (1/2/2,5/5 × tierpotens). */
function fintSteg(spenn, målAntall) {
  const rå = spenn / målAntall;
  const mag = Math.pow(10, Math.floor(Math.log10(rå || 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (rå <= m * mag) return m * mag;
  return 10 * mag;
}

// ============================================================
// Symboler for interessepunkter (PoI / waypoints)
// ============================================================

// Symbolvalgene: nøkkel = vår type, sym = GPX-symbolnavnet GPS-enheter
// forstår, emoji = visningen på kartet. Bygges ut etter behov.
// Rekkefølgen her er også visningsrekkefølgen for ikonene (og i dialogen):
// start/mål først, så sjekkpunkt, drikke, de tre matvalgene, så resten.
// NB: `mat` må stå før `varmmat` — begge har GPX-symbolet «Restaurant», og
// wptType() velger det første treffet når eldre punkter leses inn.
const WPT_SYMBOLER = {
  // Start tegnes som en grønn «play»-knapp (grønn sirkel + hvit trekant)
  start: { sym: 'Flag, Green', emoji: '\u{25B6}', navn: 'Start', form: 'play' },
  maal: { sym: 'Flag, Checkered', emoji: '\u{1F3C1}', navn: 'Mål' },
  sjekkpunkt: { sym: 'Flag, Blue', emoji: '\u{1F6A9}', navn: 'Sjekkpunkt' },
  drikke: { sym: 'Drinking Water', emoji: '\u{1F4A7}', navn: 'Drikke' },
  snacks: { sym: 'Convenience Store', emoji: '\u{1F36B}', navn: 'Snacks' },
  mat: { sym: 'Restaurant', emoji: '\u{1F374}', navn: 'Mat' },
  varmmat: { sym: 'Restaurant', emoji: '\u{1F372}', navn: 'Varm mat' },
  toalett: { sym: 'Restroom', emoji: '\u{1F6BB}', navn: 'Toalett' },
  dusj: { sym: 'Shower', emoji: '\u{1F6BF}', navn: 'Dusj' },
  dropbag: { sym: 'Bag', emoji: '\u{1F392}', navn: 'Drop bag' },
  husly: { sym: 'Lodging', emoji: '\u{1F3E0}', navn: 'Husly' },
  tidtaking: { sym: 'Stopwatch', emoji: '⏱', navn: 'Tidtaking' },
  informasjon: { sym: 'Information', emoji: 'ℹ', navn: 'Informasjon' },
  annet: { sym: 'Waypoint', emoji: '\u{1F4CD}', navn: 'Annet' },
};

/** Fast visningsrekkefølge for symbolene (rekkefølgen i WPT_SYMBOLER). */
const WPT_REKKEFØLGE = Object.keys(WPT_SYMBOLER);

function sorterTyper(typer) {
  return [...typer].sort(
    (a, b) => WPT_REKKEFØLGE.indexOf(a) - WPT_REKKEFØLGE.indexOf(b));
}

/** Del symbolene i rader med maks `maksPerRad` ikoner (wrapping). */
function ikonRader(typer, maksPerRad) {
  const rader = [];
  for (let i = 0; i < typer.length; i += maksPerRad) {
    rader.push(typer.slice(i, i + maksPerRad));
  }
  return rader;
}

const WPT_MAKS_PER_RAD_KART = 3;   // ikoner per rad i kartrammen
const WPT_MAKS_PER_RAD_PROFIL = 4; // ikoner per rad i høydeprofilen

/** HTML-innhold for ett symbol i en ikonramme (emoji, eller tegnet SVG). */
function symbolGlyphHtml(type, px) {
  const def = WPT_SYMBOLER[type] || WPT_SYMBOLER.annet;
  if (def.form === 'play') {
    const s = (px * 0.98).toFixed(1);
    return '<svg viewBox="0 0 100 100" width="' + s + '" height="' + s + '" style="display:block">' +
      '<circle cx="50" cy="50" r="47" fill="#16a34a"/>' +
      '<polygon points="40,28 74,50 40,72" fill="#ffffff"/></svg>';
  }
  return def.emoji;
}

/** Tegn ett symbol på et canvas (brukt i PNG-eksport og høydeprofil). */
function tegnSymbolCanvas(ctx, type, cx, cy, px) {
  const def = WPT_SYMBOLER[type] || WPT_SYMBOLER.annet;
  if (def.form === 'play') {
    const r = px / 2;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.98, 0, 2 * Math.PI);
    ctx.fillStyle = '#16a34a'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.24, cy - r * 0.44);
    ctx.lineTo(cx + r * 0.48, cy);
    ctx.lineTo(cx - r * 0.24, cy + r * 0.44);
    ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
    return;
  }
  ctx.fillStyle = '#0f172a';
  ctx.font = (px * 0.72).toFixed(0) + 'px "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.emoji, cx, cy + 0.5);
}

/** Finn vår type ut fra et lagret veipunkt (type-feltet, ev. sym-feltet). */
function wptType(w) {
  if (w.type && WPT_SYMBOLER[w.type]) return w.type;
  for (const [type, def] of Object.entries(WPT_SYMBOLER)) {
    if (w.sym === def.sym) return type;
  }
  return 'annet';
}

/**
 * Symbol-kategoriene et veipunkt har. Nye punkter lagrer flere i
 * `types`; eldre punkter (og innlest GPX) har bare `type`/`sym` og
 * gir da én kategori. Returnerer alltid minst én.
 */
function wptTyper(w) {
  if (Array.isArray(w.types) && w.types.length) {
    const gyldige = w.types.filter((t) => WPT_SYMBOLER[t]);
    if (gyldige.length) return sorterTyper(gyldige);
  }
  return [wptType(w)];
}
