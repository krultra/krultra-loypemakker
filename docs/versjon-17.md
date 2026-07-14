# Versjon 17 — Husk metadata, veipunkter ved sammenslåing, fullskjerm-knapp

*11. juli 2026*

## Metadata huskes

Creator, lenke, copyright, nøkkelord og starttidspunkt slipper å skrives
inn på nytt for hver løype:

- **Sist brukte verdier huskes** (i nettleseren) hver gang et segment
  lagres eller en GPX-fil eksporteres, og **foreslås automatisk** i
  dialogen for spor som mangler egne verdier. Sporets egne metadata
  vinner alltid over de huskede.
- **Verdiene skrives tilbake til det aktive segmentet** ved GPX-eksport
  (creator/lenke/copyright/nøkkelord/starttidspunkt) — åpnes segmentet
  på nytt, kommer de samme verdiene opp igjen.
- Nytt felt `start_time` på segmentene (datetime-local-streng).
  Metadata-endringer som ikke har feltet med (f.eks. «Endre»-dialogen i
  biblioteket) nullstiller det ikke.
- Starttid-forslagets prioritet ved GPX-eksport: segmentets lagrede
  verdi → sporets første tidsstempel → sist brukte verdi.

## Veipunkter følger med ved sammenslåing

Tidligere fikk et sammenslått resultat bare nye Start/Mål — nå følger
**interessepunktene fra begge segmentene** med (ved lagring, GPX-eksport
og «Åpne i redigering»):

- Start/Mål fra kildesegmentene droppes og regenereres for de nye endene.
- Bare punkter som ligger langs den nye traseen (≤ 100 m) tas med.
- Delte punkter (samme `bib_id` i begge segmentene) tas med én gang, og
  lokale duplikater (samme navn innenfor ~20 m) likeså.

## «Vis i full skjerm» i publiserte visninger

Innbygde løypevisninger har fått knappen **«⛶ Vis i full skjerm»**
(under Kart/Satellitt-knappen) som åpner den direkte adressen
(f.eks. `loyper.krultra.no/mmc-70k/`) i en ny fane. Knappen vises **bare
når visningen står i en iframe** — åpnet direkte er den skjult. Ingen
endring trengs i iframe-snuttene på nettsidene: knappen ligger i selve
visningen og dukker opp ved neste republisering (asset-versjon 5).

## Versjoner

`APP_VERSJON` → 17, `BACKEND_VERSJON`/`FORVENTET_BACKEND` → 16
(`start_time`-feltet krever omstart — banneret varsler), asset-versjon
→ 5, cache-busting → `?v=17`.

## Tester

`start_time` lagres/endres/overlever metadata-endringer uten feltet.
Verifisert i nettleser: forslag fra sist brukte verdier (og at sporets
egne vinner), sammenslåingslogikken (duplikater, delte punkter,
fjerntliggende, nye Start/Mål), og fullskjerm-knappen (synlig i iframe,
skjult direkte). 69 tester totalt.
