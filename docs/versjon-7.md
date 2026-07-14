# Versjon 7 — PoI med ledestrek, flyttbar ramme og vis/skjul

Bygger på [versjon-6.md](versjon-6.md). Implementert og verifisert 8. juli 2026.

## Ny visning av interessepunkter

Interessepunktene tegnes nå som:
- en **liten sirkel** på selve løypepunktet,
- en **ledestrek** derfra til
- en **ramme** som samler alle symbolene for punktet (ett sted med mat +
  drikke + toalett + sjekkpunkt vises som fire ikoner side om side i én
  felles, avrundet ramme).

Dette erstatter de løse, frittstående symbolene fra forrige versjon.

## Flyttbar ramme

Ramma kan **dras** dit brukeren vil på kartet, og ledestreken følger
fortløpende med. Plasseringen lagres per punkt i `lab_lat`/`lab_lon` og
auto-lagres til segmentet (som PoI-ene ellers). Har punktet ingen egen
plassering ennå, brukes en standardplassering et lite stykke vinkelrett
ut fra løypa. For GPX-kilder beholdes plasseringen kun i minnet (GPX-
formatet har ikke noe felt for etikettplassering), så draing der utløser
ikke en filskriving.

Teknisk: rammene er dragbare `L.marker`-er med divIcon; ledestrek og
punktmarkør ligger på en **egen canvas-renderer** (`wptTegner`), slik at
det å dra en ramme ikke tvinger fram ny tegning av hele sporet (som kan
ha titusenvis av punkter).

## Vis/skjul

Ny knapp **«📍 Punkter»** i kartverktøylinja slår interessepunktene av og
på. Valget huskes lokalt.

## PNG-eksport gjenspeiler alt

Kart-til-PNG tegner nå samme design: punktsirkel, ledestrek og ramme med
symbolene — på den plasseringen brukeren har dratt dem til, skalert etter
eksportens zoomnivå. Er punktene skjult, tas de ikke med i bildet.

## Backend

- `Waypoint.lab_lat` / `lab_lon` (valgfrie) — etikettens plassering.
  Lagres i segment-JSON, ignoreres i GPX-eksport. Bakoverkompatibelt.

## Verifisert

- 38 automatiske tester passerer (uendret — nye felt er valgfrie)
- I nettleser: flersymbol-punkt vist som fire ikoner i én ramme med
  ledestrek; draing flytter ramma, streken følger, og plasseringen ble
  lagret til segmentet på serveren; vis/skjul (3 rammer → 0 → 3);
  PNG-eksport laget både med skjulte og synlige punkter
