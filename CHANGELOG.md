# Endringslogg

Alle vesentlige endringer i KrUltra Løypemakker (KUL). Detaljerte notater
for hver versjon ligger i [`docs/`](docs/).

## Versjonering

Fra og med **2.0.0** følger prosjektet
[semantisk versjonering](https://semver.org/lang/nb-NO/) (MAJOR.MINOR.PATCH):

- **MAJOR** (f.eks. 2.0.0 → 3.0.0) — store nye hovedfunksjoner eller endringer
  som kan kreve at du gjør noe (f.eks. starter appen på nytt, endrer oppsett).
- **MINOR** (f.eks. 2.0.0 → 2.1.0) — nye funksjoner som bygger videre uten å
  bryte noe eksisterende.
- **PATCH** (f.eks. 2.0.0 → 2.0.1) — feilrettinger og småjusteringer.

Versjonene før 2.0.0 (under **Utviklingshistorikk** nedenfor) ble kalt
«v2»–«v19» underveis i utviklingen og fulgte ikke dette skjemaet.

## 2.0.0 — 14. juli 2026 (første offentlige utgivelse)

Verktøyet er nå åpen kildekode under MIT-lisens, med nytt navn og logo.

- **«Send til KrUltra»**: arrangører uten egen server kan lage en `.loype`-fil
  (bærer punkter, veipunkter, stil og alle metadata) og sende den til KrUltra
  for publisering. Tilhørende **importfunksjon**.
- Produktnavn **KrUltra Løypemakker (KUL)**, oppstartsfil `KUL.bat`, logo og favicon.
- **MIT-lisens** — åpen kildekode, fri også kommersielt, med kreditering.
- «Creator» → «Laget av»; adressenavn som båret metadatafelt.
- XSS-herding av publisert visning; opplastingsgrense på GPX-parsing.
- Billedlagt installasjonsguide, bruksveiledning og HTML-versjoner av all dokumentasjon.
- [Detaljer](docs/versjon-19.md)

## Utviklingshistorikk (før 2.0.0)

Interne utviklingsversjoner fra prosjektets MVP fram til første offentlige
utgivelse. Numrene («v2»–«v19») var løpende tellere under utvikling, ikke
semantiske versjoner.

### v18 — Mobilvennlig publisert visning
- Én finger scroller siden, to fingre flytter kartet (i innebygde visninger).
- Knapper flyttet ut av kartet; høydeprofilen scroller horisontalt på smale skjermer.
- Smartere iframe-høyde. [Detaljer](docs/versjon-18.md)

### v17 — Husk metadata, veipunkter ved sammenslåing, fullskjerm
- Metadata (laget av, lenke, copyright, nøkkelord, starttid) huskes og foreslås.
- Interessepunkter følger med når segmenter slås sammen.
- «Vis i full skjerm»-knapp i publiserte visninger. [Detaljer](docs/versjon-17.md)

### v16 — Drop bag, bedre GPX-eksport, sikring av punktbibliotek
- Nytt symbol: Drop bag. Ett `<wpt>` per interessepunkt (ryddigere i Garmin).
- Automatisk sikkerhetskopi av punktbiblioteket. [Detaljer](docs/versjon-16.md)

### v15 — «Velg delte punkter» og snap
- Finn alle delte punkter langs løypa og velg mange på én gang.
- Fest punkter til løypa («snap») eller vis dem på eksakt posisjon. [Detaljer](docs/versjon-15.md)

### v14 — Punktbibliotek
- Delte, gjenbrukbare interessepunkter på tvers av løyper.
- Versjonsnummer i verktøyet; KrUltra-kreditering i publiserte visninger. [Detaljer](docs/versjon-14.md)

### v13 — Publisering av interaktive løypevisninger
- Kart + høydeprofil + klikkbare punkter + markør, innebygd på nettsider via iframe.
- Opplasting via SFTP, med failover-gruppe. [Detaljer](docs/versjon-13.md) · [publisering.md](docs/publisering.md)

### v12 — Ikon-wrapping, flere matvalg, tettere profil-etiketter
- Nye symboler (snacks, mat, varm mat, dusj); ikoner wrapper til flere rader. [Detaljer](docs/versjon-12.md)

### v11 — Visningsmodus
- Bare kart / delt / bare profil. [Detaljer](docs/versjon-11.md)

### v10 — Utdatert-server-varsel og cache-fiks
- Rødt banner når serveren kjører eldre kode; cache-busting. [Detaljer](docs/versjon-10.md)

### v9 — PoI-finpuss og profil-etiketter
- [Detaljer](docs/versjon-9.md)

### v8 — Ikonstørrelse og waypoints i høydeprofilen
- Individuell vis/skjul per punkt. [Detaljer](docs/versjon-8.md)

### v7 — Interessepunkter med ledestrek og flyttbar ramme
- [Detaljer](docs/versjon-7.md)

### v6 — Autorepeat, auto-lagring av punkter, flersymbol, zoom-skalering
- [Detaljer](docs/versjon-6.md)

### v5 — Profilfarger for trykk, høydemeter og gruppert bibliotek
- [Detaljer](docs/versjon-5.md)

### v4 — Interessepunkter, karteksport og flere kartvisninger
- Kartverkets høyder som standard. [Detaljer](docs/versjon-4.md)

### v3 — Riktige høyder, utjevning og starttidspunkt
- Terrenghøyder fra Kartverket; gaussisk utjevning av profilen. [Detaljer](docs/versjon-3.md)

### v2 — Kart, metadata, nærmeste punkt og høydeprofil
- Kartunderlag fra Kartverket; høydeprofil. [Detaljer](docs/versjon-2.md)

### MVP — Klippe, skjøte og eksportere GPX
- Kjernen: last inn GPX, klipp ut segmenter, slå sammen, eksporter ryddig
  GPX 1.1 med stigende tidsstempler. [Plan](docs/mvp-plan.md)
