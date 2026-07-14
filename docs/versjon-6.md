# Versjon 6 — slider-autorepeat, auto-lagring av PoI, flersymbol og zoom-skalering

Bygger på [versjon-5.md](versjon-5.md). Implementert og verifisert 8. juli 2026.

## 1. Slider-knapper med akselererende autorepeat

«◀/▶»-knappene (både i redigering og sammenslåing) kan nå holdes inne og
repeterer da automatisk. `koblAutoRepeat(knapp, påSteg)` i `frontend/app.js`:
ett kjapt trykk = ett steg (10 med Shift, som før); holdes knappen, øker
både stegstørrelsen (1→4→12→30→70 punkter) og hastigheten (pause
110→70→45 ms) jo lenger man holder. Bygget på pointer-events med
pointer-capture; stopper på slipp/forlat.

## 2. Automatisk lagring av interessepunkter

Løypa husker nå hvor den kom fra (`editorState.kilde`):
- **Åpnet segment** → nytt/endret/slettet PoI lagres straks til segmentet
  via nytt endepunkt `PUT /api/segments/{id}/waypoints` (punktene røres
  ikke). Ingen ekstra «lagre»-steg.
- **Åpnet GPX-fil** → fila oppdateres direkte på disk. GPX lastes nå via
  File System Access-velgeren (`showOpenFilePicker`) som gir skrivetilgang
  tilbake til fila; PoI-endringer skrives gjennom den ryddige
  eksport-kjeden. Nettlesere uten støtte faller tilbake til vanlig
  fil-input (da må «Lagre som GPX» brukes, med en tydelig melding).
- **Sammenslått, ulagret resultat** → «Sett punkt her» er deaktivert med
  forklarende tekst; PoI kan først settes etter at resultatet er lagret
  som segment eller GPX. Lagrer man som segment, knyttes videre
  PoI-endringer automatisk til det.

## 3. Flere symboler per interessepunkt

PoI-dialogen har byttet enkeltvalg-nedtrekk med **avkrysningsruter** — ett
sted kan ha f.eks. mat + drikke + toalett + sjekkpunkt samtidig. Alle
valgte symboler tegnes på kartet, stablet ved siden av punktet langs
retningen bort fra traseen. Lagres i `Waypoint.types` (liste) i segment-
JSON; ved GPX-eksport utvides hvert punkt til ett `<wpt>` per symbol
(`utvidVeipunkter`) på samme koordinat, så GPS-klokker viser alle.
Eldre punkter med bare `type`/`sym` leses fortsatt (gir ett symbol).

## 4. Symboler skalerer med zoom

Symbolstørrelsen følger nå zoomnivået: 1× (15 px, minimum) når man er
zoomet langt ut (z ≤ 8), lineært opp til 4× (60 px) langt inn (z ≥ 16).
`wptSkala(zoom)` styrer både kartvisningen (re-tegnes på `zoomend` via et
eget `wptLag`, uten å tegne hele sporet på nytt) og PNG-eksporten.

## 5. Nøkkeltall i PoI-dialogen

Når et punkt opprettes eller redigeres, viser dialogen:
- Avstand fra start
- Avstand fra forrige interessepunkt
- Høydemeter (opp/ned) akkumulert fra start
- Høydemeter (opp/ned) fra forrige interessepunkt

Beregnet på samme grunnlag som profilen (aktiv høydekilde + utjevning).
«Forrige punkt» er interessepunktet med høyest sporindeks før dette
(start regnes med).

## Backend

- `Waypoint.types: Optional[List[str]]` (flersymbol), bakoverkompatibelt.
- `PUT /api/segments/{id}/waypoints` + `storage.update_segment_waypoints`.

## Verifisert

- 38 automatiske tester (2 nye: oppdatering av waypoints + ukjent segment)
- I nettleser: autorepeat (1 trykk = 1 steg, 1,5 s hold = 38 steg,
  stopper ved slipp); flersymbol-PoI (mat+drikke+toalett+sjekkpunkt)
  auto-lagret til segmentet på serveren med alle fire kategoriene og vist
  som fire symboler på kartet; zoom-skalering 15 px (z8) → 60 px (z16);
  «Sett punkt her» deaktivert for ulagret sammenslåing med forklaring;
  dialogens nøkkeltall (avstand + høydemeter fra start/forrige)
