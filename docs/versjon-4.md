# Versjon 4 — interessepunkter, karteksport, flere kartvisninger og mer metadata

Bygger på [versjon-3.md](versjon-3.md). Implementert og verifisert 8. juli 2026.

## Kartverkets høyder er nå standard

Ved innlasting av GPX-fil eller åpning av segment i redigeringsvisningen
hentes terrenghøydene fra Kartverket automatisk. Feiler hentingen (f.eks.
uten nett) beholdes GPX-filas høyder, og knappen kan brukes til å prøve
igjen. Knappen viser alltid hvilken kilde som er aktiv.

## 1. Utvidet metadata: copyright, time, keywords

- **Copyright**: tekstfelt for rettighetshaver i dialogen (forhåndsutfylt
  med creator hvis ikke arvet). I eksportert GPX blir dette
  `<copyright author>` med årstall og **CC BY-NC 4.0** som standardlisens —
  fri ikke-kommersiell bruk så lenge opphavsperson navngis
  (https://creativecommons.org/licenses/by-nc/4.0/).
- **Keywords**: fritt nøkkelord-felt → `<keywords>`.
- **Time**: `<metadata><time>` settes automatisk til eksporttidspunktet
  (sporet har sine egne tidsstempler).
- Alt arves gjennom kjeden som før (GPX → segment → sammenslåing → eksport).

## 2. Valgfritt lagringssted og filnavn

Alle fillagringer (GPX, høydeprofil-PNG, kart-PNG) bruker nå nettleserens
«Lagre som»-dialog (`showSaveFilePicker`, Chrome/Edge) der brukeren velger
mappe og filnavn. I nettlesere uten støtte faller det tilbake til vanlig
nedlasting. Felles funksjon `lagreFil()` i `frontend/app.js`.

## 3. Interessepunkter (PoI / `<wpt>`) — første iterasjon

- Ny `Waypoint`-modell (lat/lon/ele/name/desc/sym/type) hele veien:
  parse → segmentlagring (JSON) → eksport (`<wpt>`-elementer).
- **«Sett punkt her»**-knapp: oppretter PoI der markøren står, med dialog
  for navn, beskrivelse, symbol og type.
- **Symboler** (bygges ut senere): mat, drikke, toalett, husly, tidtaking,
  sjekkpunkt, informasjon, start, mål, annet. `<sym>` bruker Garmin-kjente
  navn (Restaurant, Drinking Water, Restroom, Lodging, Flag …), `type`
  er vår norske kategorisering.
- **Automatisk start/mål**: opprettes ved innlasting hvis de mangler, med
  passende navn/beskrivelse/symbol.
- **Redigere/flytte/slette**: klikk på et punkt på kartet åpner dialogen
  med Lagre / Flytt til markøren / Slett.
- **Ved utsnitt**: manuelle punkter innenfor 100 m av utsnittet beholdes,
  start/mål regenereres for de nye endene. Sammenslåtte løyper får
  automatisk start/mål (A/B-enes punkter følger ikke med i første versjon).
- Dialoghåndteringen ble samtidig gjort om til å lytte på skjemaets
  submit-hendelse i stedet for dialogens close-hendelse (mer robust).

## 4. PNG-eksport av kartet med utsnitt

Ny kartverktøylinje over kartet:
- **Rutefarge** og **Tykkelse**: styrer rutestreken i eksporten.
- **Velg utsnitt**: dra opp et rektangel på kartet; kun det området
  eksporteres. «Fjern utsnitt» går tilbake til hele kartvisningen.
- **Kart som PNG**: bygger bildet selv — henter kartflisene direkte
  (tjenestene har åpen CORS), tegner rute, interessepunkter og påkrevd
  kildeangivelse («© Kartverket» / «© Esri …») på et canvas.
  Zoomnivået tas fra kartet, men reduseres automatisk om bildet ville
  blitt over ~4000 px. Web Mercator-matematikken ligger i
  `merkatorX/merkatorY` i `frontend/app.js`.

## 5. Flere kartvisninger

Nedtrekksvalg i kartverktøylinja (valget huskes):
| Visning | Kilde |
|---|---|
| Topografisk | Kartverket (`topo`) |
| Gråtone | Kartverket (`topograatone`) |
| Papirkart-stil | Kartverket (`toporaster`) |
| Sjøkart | Kartverket (`sjokartraster`) |
| Satellittbilde | Esri World Imagery |

Kartverket tilbyr **ikke** satellittbilder — derfor Esri (gratis med
kildeangivelse). Norge i bilder (norgeibilder.no) har norske ortofoto,
men krever egen avtale/nøkkel for API-bruk; kan vurderes senere.

## Feilrettinger (8. juli 2026, etter tilbakemelding)

- **Rutefarge/-tykkelse vises nå live på kartet**: sporet i redigerings-
  visningen og det sammenslåtte resultatet tegnes med valgene fra
  kartverktøylinja og oppdateres umiddelbart (`oppdaterRuteStil`), slik
  at skjermen viser nøyaktig det som havner i PNG-en. Segment A/B i
  sammenslåingsvisningen beholder blå/rød for å kunne skilles fra
  hverandre.
- **Dobbel lagringsdialog ved karteksport fikset**, to årsaker: (1) hvis
  «Lagre som»-dialogen åpnet, men skrivingen feilet, falt koden videre
  til vanlig nedlasting → dialog nummer to; nå gis en feilmelding i
  stedet. (2) Eksportknappen kunne fyres på nytt mens flisene ble hentet;
  nå er den sperret til lagringen er helt ferdig.
- **Mindre PoI-markører**: punktet markeres med en liten sirkel (10 px),
  og symbolet (15 px, ca. halvert) står ved siden av — forskjøvet
  vinkelrett på løyperetningen slik at det ikke dekker traseen. Samme
  design i PNG-eksporten.

## Verifisert

- 31 automatiske tester, inkl. rundtur med copyright/lisens/keywords/wpt
- Eksport-API: `<copyright author>` med år + CC BY-NC-lisens, `<keywords>`,
  `<metadata><time>`, tre `<wpt>` med riktige symboler, strengt økende tid
- I nettleser: automatisk DEM-bytte ved åpning, auto start/mål-punkter,
  ny PoI via dialog (💧 på kartet), kart-PNG (264 KB med rute og punkter),
  utsnittsvalg → mindre PNG, alle fem kartvisninger, lagvalg husket
