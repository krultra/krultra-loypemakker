# Versjon 2 — kart, metadata, nærmeste punkt og høydeprofil

Bygger videre på MVP-en (se [mvp-plan.md](mvp-plan.md)). Fire funksjoner,
alle implementert og verifisert 7. juli 2026.

## 1. «Nærmest det andre delingspunktet» (sammenslåing)

Når man slår sammen segmenter vil man typisk dele der løypene møtes.
Ny knapp i hvert segmentkort: sett delingspunktet på det ene segmentet,
og klikk «Nærmest ...» på det andre — verktøyet finner punktet med kortest
avstand (haversine) til det andre delingspunktet, flytter glidebryteren
dit, og viser avstanden i meter. Er avstanden over 100 m vises et varsel,
siden det tyder på at sporene ikke faktisk møtes der.

Ren frontend-funksjon (`settNærmesteDelingspunkt` i `frontend/app.js`).

## 2. Metadata (navn + beskrivelse) med naturlig arv

- `Point`-listene har fått følge av `name` + `description` gjennom hele
  kjeden: GPX-innlesing → redigering → segmentlagring → sammenslåing →
  GPX-eksport.
- Innlest GPX: navn/beskrivelse leses fra `<trk>`, med `<metadata>` som
  reserve. Mangler navn brukes filnavnet.
- Lagringsdialogen (navn + beskrivelse) forhåndsutfylles med arvede
  verdier; brukeren kan alltid redigere før lagring/eksport.
- Sammenslåing: navneforslag «A + B», beskrivelse arves fra A (ellers B).
- «Endre»-knapp i biblioteket endrer metadata på et lagret segment uten å
  røre punktene (`PATCH /api/segments/{id}`).
- Eksportert GPX får navn/beskrivelse både på fil- og spornivå.
- Gamle segmentfiler uten beskrivelse leses fortsatt (feltet er valgfritt).

## 3. Kartunderlag fra Kartverket (av/på)

Kartfliser hentes fra Kartverkets åpne flisetjeneste (WMTS, laget «topo»):
`https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png`

- Gratis, uten API-nøkkel, hele Norge, alltid oppdatert. Krever internett.
- Av/på-knapp i topplinja; valget huskes (localStorage).
- Kartet byttet samtidig fra `L.CRS.Simple` til standard webprojeksjon
  (EPSG:3857), så sporene har riktig fasong med og uten kartunderlag —
  den gamle cos(breddegrad)-skaleringen er fjernet.

**Veivalg:** Den nedlastede N50-pakka (PostGIS-format, i `data/maps/`)
er vektordata som ville krevd PostgreSQL/PostGIS + egen karttegnings-
motor med stilark — en tung GIS-løsning som ikke står i forhold til
behovet. Kartverkets flisetjeneste gir samme kart uten noe oppsett.
Hvis offline-kart blir et reelt behov senere, er Kartverkets ferdig-
tegnede rasterpakker fra Geonorge veien å gå (ikke PostGIS/FGDB).

## 4. Høydeprofil

Egen seksjon under kartet (av/på-knapp i topplinja), tegnet på canvas:

- **Høydeskala 1–20×**: forholdet mellom vertikal og horisontal måle-
  stokk. 1× er naturtro (px per meter likt begge veier); profilhøyden
  beregnes fra ekte målestokk og begrenses til 30–340 px.
- **Akser av/på**: distanse (km) på x, høyde (m) på y, med «pene»
  tick-intervaller (1/2/2,5/5 × tierpotens) og lett rutenett.
- **Stil**: svart/hvit strek eller rød fylt profil.
- Punkter uten høyde interpoleres lineært mellom nærmeste kjente naboer;
  spor helt uten høydedata gir en forklarende melding.
- I redigeringsvisningen vises markørposisjonen (blå strek + punkt) og
  valgt utsnitt (grønt bånd) også i profilen. I sammenslåingsvisningen
  vises resultatet (ellers segment A/B).
- Alle innstillingene huskes (localStorage).

## API-endringer

| Endring | Detalj |
|---|---|
| `POST /api/gpx/parse` | + `description` i svaret |
| `POST /api/segments` | + `description` i forespørselen |
| `PATCH /api/segments/{id}` | NY: endre navn/beskrivelse |
| `POST /api/gpx/export` | + `description` i forespørselen |

## Oppfølging (samme dag): rendringsfiks og profil-design

**Rendringsfiks.** Deler av kart og spor kunne utebli ved zooming/
panorering. To årsaker, to grep i `frontend/app.js`:
- Spor tegnes nå med Leaflets canvas-tegner (`L.canvas({padding: 1.0})`)
  i stedet for standard SVG. SVG-tegneren klipper linja til et begrenset
  område rundt synsfeltet, og med spor på mange tusen punkter rakk den
  ikke alltid å tegne på nytt under bevegelse — derfor «forsvant» løypa.
- En `ResizeObserver` på kartelementet kaller `map.invalidateSize()`
  ved alle størrelsesendringer (høydeprofil av/på, panelbytte, vindus-
  endring), så flisene alltid hentes for hele det synlige området.
  I tillegg `keepBuffer: 6` og `updateWhenIdle: false` på flislaget.

**Høydeprofil-design** (for bruk i profileringsmateriell): fritt fargevalg
for linje, fyll (av/på + farge) og bakgrunn; rutenett og akser kan slås
av/på hver for seg; tekststørrelse på aksetall (8–24 px, margene skalerer
med); aksetekst tilpasser seg lys/mørk bakgrunn automatisk; to hurtigvalg
(«Svart/hvitt», «Rød fylt»); og nedlasting av profilen som PNG-bilde.
Alle valg huskes i nettleseren.

## Ikke gjort (bevisst)

- Offline kartfliser (se veivalget over)
- Høydeprofil-eksport som bilde (kan legges til om ønskelig)
- Automatisk snapping av delingspunkter (brukeren bestemmer alltid selv;
  «nærmest»-knappen er et forslag, ikke en tvang)
