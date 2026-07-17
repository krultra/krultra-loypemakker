# Versjon 2.1.0 — Anbefalt utjevning 5/5 og enklere KrUltra-innsending

*14. juli 2026*

## Utjevning og Vektform: 5/5 som standard og anbefaling

Bakgrunn: de beregnede høydemeterne (↑ opp / ↓ ned) avhenger av
utjevningsinnstillingene — mer utjevning gir lavere tall. Hvis norske
løpsarrangører opererer med svært forskjellige innstillinger, blir det
vanskelig for løperne å forholde seg til de oppgitte høydetallene på tvers
av løp. 5/5 gir tilnærmet samme resultat som løpernes GPS-klokker
rapporterer (med forbehold om klokkenes egne innstillinger).

- **Standardverdiene** for Utjevning og Vektform er endret fra 0/3 til
  **5/5**. Brukere som selv har lagret andre verdier beholder dem —
  implementert med `lagretTall()`-hjelperen som skiller «ikke satt» fra en
  bevisst lagret 0 (den gamle `|| standard`-varianten ville overstyrt 0).
- **Gruppering:** de to innstillingene ligger nå i en felles ramme
  (`.profile-group`) i profilverktøylinja, siden de virker sammen.
- **(i)-knapp** (`.info-btn`) åpner en dialog som forklarer hva
  innstillingene gjør, med:
  - ⚠️ advarsel om at beregnede høydemeter påvirkes (metadatalinja,
    eksport og publiserte visninger),
  - anbefalingen om 5/5 og hvorfor (sammenlignbarhet på tvers av
    arrangører, samsvar med GPS-klokker),
  - sterk anbefaling om å bruke Kartverkets høydedata («Høyder:
    Kartverket», som er standard) framfor GPX-filas egne høyder.

## Enklere «Send til KrUltra»-flyt

Tidligere åpnet «Send til KrUltra» en «Lagre som»-dialog. Nå:

1. Løypefila (`<adressenavn>.loype`) **lastes ned automatisk** til
   nettleserens nedlastingsmappe (ny hjelper `lastNedFil()` — ankernedlasting
   uten dialog).
2. Standard e-postprogram åpnes med **riktig mottaker** (post@krultra.no),
   **riktig emne** («Løype: ‹løypenavn› - for publisering på
   loyper.krultra.no») og **ferdig brødtekst** med løypedetaljene, en
   tydelig påminnelse om hvor fila ligger og at den må legges ved, og
   plass til tilleggsopplysninger.
3. Brukeren ser over, drar inn fila fra Nedlastinger, og sender.

Merk: `mailto:` kan ikke legge ved filer automatisk — det er en bevisst
sikkerhetsbegrensning i alle nettlesere og e-postprogrammer. Påminnelsen i
brødteksten (og en toast i verktøyet) gjør vedleggssteget så tydelig som
mulig.

## Versjoner

`APP_VERSJON` → 2.1.0, cache-busting → `?v=20`. Backend uendret
(`BACKEND_VERSJON` = 17) — begge endringene er ren frontend.
