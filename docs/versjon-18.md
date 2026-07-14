# Versjon 18 — Mobilvennlig publisert visning

*11. juli 2026*

## Problemet

I en iframe på mobil ble høydeprofilen svært komprimert, og kartet
«fanget» brukeren: når kartet fylte skjermen, panorerte én-finger-sveip
kartet i stedet for å scrolle siden rundt. Knappene lå dessuten oppå
kartet og stjal av den begrensede kartflaten.

## Løsningene (alle i den publiserte visningen, asset-versjon 6)

**Skånsom kartnavigasjon — kun når visningen er innebygd (iframe):**

- Berøring: **én finger scroller siden, to fingre flytter kartet**
  (Google Maps-mønsteret). Kartbeholderen får `touch-action: pan-y`,
  Leaflet-draging slås av og på etter antall fingre, og et kort,
  gjennomsiktig hint («Bruk to fingre for å flytte kartet») vises når
  noen prøver med én finger. Knip-zoom virker som før.
- Mus: **rullehjulet zoomer først etter at kartet er klikket**, og slås
  av igjen når pekeren forlater kartet — så siden kan scrolles forbi.
- Åpnet direkte (via «Vis i full skjerm») beholdes vanlig navigasjon.

**Knappene ut av kartet:** Satellitt- og fullskjerm-knappen ligger nå i
topplinja ved siden av tittelen (alle skjermstørrelser) — hele
kartflaten er kart.

**Høydeprofilen på smale skjermer (< 560 px):**

- Tegnes i lesbar bredde (minst 640 px) og **scroller horisontalt inne
  i sin egen stripe** (`overflow-x: auto` på #profil-wrap — siden selv
  får aldri scrollbar). Canvasen får `touch-action: pan-x`: sveip
  scroller profilen, trykk flytter markøren (slideren virker som før).
- **Punktnavnene droppes** — de spiste høyde og var uansett uleselige.
  Indikatorstrekene og sirklene beholdes, og navnene finnes i
  PoI-popupene på kartet.

**Smartere iframe-høyde:** snutten som genereres ved publisering bruker
nå `height:640px;height:min(85vh,820px)` — opptil 820 px på store
skjermer, 85 % av vinduet på små (640 px-linja er reserve for eldre
nettlesere). Eksisterende innbygginger virker som før; bytt gjerne til
den nye snutten ved anledning.

## Versjoner

`APP_VERSJON` → 18, `BACKEND_VERSJON`/`FORVENTET_BACKEND` → 17
(ny iframe-snutt + asset-versjon 6 krever omstart), cache-busting →
`?v=18`. Endringene når nettsidene ved neste republisering av hver løype.
