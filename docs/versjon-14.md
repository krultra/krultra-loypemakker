# Versjon 14 — Punktbibliotek: delte interessepunkter

*11. juli 2026*

## Behovet

MMC består av ni løp og åtte løyper med mye overlappende trasé — de samme
sjekkpunktene og stasjonene går igjen i mange løyper. Å legge inn samme
punkt på nytt i hver løype gir mye arbeid og fare for avvik ved endringer.
Samtidig må to punkter kunne ligge på nøyaktig samme sted: samme fysiske
sjekkpunkt kan ha ulikt tjenestetilbud eller ulik tekst i ulike løp.

## Løsningen

Delte punkter lagres én gang i **punktbiblioteket** (`data/waypoints.json`)
og identifiseres med en id (`bib_id`) — ikke koordinatene. Derfor kan to
delte punkter fint ligge på samme koordinat.

Løypesegmentene lagrer en **referanse + lokal kopi**:

- Segmentfila har alle feltene som før (så GPX-eksport, publisering og
  gamle filer virker uendret), pluss `bib_id` på delte punkter.
- **Ved åpning** av et segment overskrives kopien med ferske verdier fra
  biblioteket — endringer gjort via andre løyper slår inn automatisk.
- **Ved lagring** synkroniseres endringer på delte punkter tilbake til
  biblioteket — og sprer seg dermed til de andre løypene.
- **Delt på tvers:** posisjon, navn, beskrivelse og symboler.
  **Per løype:** ikonrammens plassering (`lab_lat`/`lab_lon`) og
  vis/skjul ikoner (`vis_ikon`) — hva som er ryddig plassering avhenger
  av resten av kartet i hver løype.
- Slettes et bibliotekpunkt, beholder løypene frittstående lokale kopier
  (`bib_id` fjernes ved neste åpning).

## Bruk

- **Nytt delt punkt:** kryss av **«Delt punkt»** i interessepunkt-dialogen.
- **Gjenbruk:** stå i nærheten (≤ 300 m) av et delt punkt og klikk
  «Sett punkt her» — dialogen foreslår delte punkter i nærheten med
  navn, symboler og avstand; ett klikk legger punktet inn i løypa.
  Punkter løypa alt bruker foreslås ikke på nytt.
- **Redigere:** åpne punktet i hvilken som helst løype som bruker det —
  dialogen viser en tydelig merknad om at endringer (også flytting)
  gjelder alle løypene. Fjern avkryssingen for å koble punktet fra
  (løypa får en frittstående kopi); kryss av på et lokalt punkt for å
  dele det.
- **Slette fra en løype:** fjerner bare referansen — bibliotekpunktet og
  de andre løypene berøres ikke.
- **Oversikt:** knappen **«🔗 Punktbibliotek…»** i venstre kolonne lister
  alle delte punkter med symboler og hvilke segmenter som bruker dem,
  og lar deg slette punkter som ikke lenger trengs.

## API

- `GET /api/waypoints` — alle delte punkter (`?bruk=1` tar med hvilke
  segmenter som bruker hvert punkt)
- `POST /api/waypoints` — nytt delt punkt (fra et veipunkt)
- `DELETE /api/waypoints/{id}` — fjern delt punkt
- Synkroniseringen skjer i `backend/storage.py` (inn ved `load_segment`,
  ut ved `update_segment_waypoints`/`save_segment`) via den nye modulen
  `backend/punktbibliotek.py`.

## Annet i denne versjonen

- **Versjonsnummer i verktøyet:** topplinja viser «versjon 14»
  (`APP_VERSJON` i `frontend/app.js`, følger versjon-N-dokumentene her
  i docs/).
- **Kreditering i publisert visning:** bunnlinja viser nå «Laget og
  publisert av KrUltra» med lenke til https://krultra.no, på linje med
  Kartverket-krediteringen (asset-versjon 3 — tas i bruk ved neste
  republisering av hver løype).
- `BACKEND_VERSJON`/`FORVENTET_BACKEND` → 13, cache-busting → `?v=14`.

## Tester (tests/test_punktbibliotek.py)

Opprett/les/slett, to punkter på samme koordinat, fersk-verdier ved
åpning, synkronisering ved lagring, spredning mellom løyper, frakobling
når bibliotekpunktet slettes, lokale punkter røres ikke,
etikettplassering forblir per løype, og bruksoversikten. 63 tester totalt.
