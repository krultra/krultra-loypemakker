# Versjon 19 — Send/importér løyper, produktnavn, lisens og logo

*11. juli 2026*

Første offentlige versjon. Verktøyet har fått navn, lisens, logo og en
funksjon for at arrangører uten egen server kan få løyper publisert av
KrUltra.

## Send til KrUltra / importér .loype-fil

Arrangører som ikke publiserer selv kan bruke **«📧 Send til KrUltra…»**:
verktøyet samler alle opplysninger (adressenavn, navn, beskrivelse, laget
av, lenke, copyright, nøkkelord, starttidspunkt), stil og punkter/veipunkter
i en **`.loype`-fil** (JSON) og åpner en ferdig e-post til `post@krultra.no`.
Brukeren vedlegger fila selv (mailto kan ikke vedlegge automatisk).

KrUltra åpner fila med **«📥 Importer .loype-fil…»** i sidemenyen. Løypa
lastes med opphavspersonens **eksakte høyder** (henter ikke DEM på nytt) og
**stil** (`importertStil` overstyrer lokal UI ved publisering), og
publiseringsdialogen forhåndsutfyller det ønskede **adressenavnet** — slik
at løypa havner på `loyper.krultra.no/<adressenavn>` og republisering treffer
samme adresse.

En ren GPX ville tapt stil, snap og etikettplasseringer; `.loype`-fila er
derfor et lite JSON-format som bærer alt tapsfritt. Formatet er `kul-loype`
versjon 1.

## Metadata

- **Adressenavn** er nå et metadatafelt som bæres med (arves/importeres og
  gjenbrukes ved republisering). Vises i meta-dialogen i «Send»-modus, og
  forhåndsutfylles i publiseringsdialogen.
- **«Creator» → «Laget av»** i dialogen (feltet brukes ved GPX-eksport og
  segment-lagring, som før).
- Alle publiseringsrelevante metadata følger med i `.loype`-eksporten og
  brukes ved import/publisering, slik at KrUltra publiserer med de verdiene
  opphavspersonen ønsker.

## Produktnavn, lisens og logo

- **Navn:** «KrUltra Løypemakker», forkortet **KUL**. Oppstartsfil
  `run.bat` → **`KUL.bat`**. Vist i topplinja med logo + versjonsnummer.
- **Lisens:** [MIT](../LICENSE) — fri bruk, også kommersielt, med bevart
  opphavsrettsnotis (kreditering). GPX-eksportens rutedata-lisens er fortsatt
  CC BY-NC 4.0 (en separat ting — arrangørens løypedata, ikke programvaren).
- **Logo:** `brand/KUL_logo.png`. Sol/måne-emblemet er beskåret til favicon
  (`frontend/favicon.png` + `.ico`, og i den publiserte visningen via
  asset-pakken) og vist i appens topplinje.

## Klar for GitHub

- `.gitignore` holder `/data/` og credentials ute; `data/publisering.json.mal`
  som mal.
- XSS-herding av publisert visning (validerer/escaper `løype.link`).
- Ny README (front page) + `docs/BRUK.md` (full bruksveiledning) + MIT LICENSE.
- GitHub-tilgang bekreftet: `gh` innlogget som `krultra` (repo-scope).

## Versjoner

`APP_VERSJON` → 19, cache-busting → `?v=19`. Backend-API-et er uendret
(`BACKEND_VERSJON` = 17) — send/import er ren frontend, og publisering bruker
det eksisterende endepunktet. Asset-versjon 7 (favicon + tidligere
mobil-/XSS-endringer) tas i bruk ved neste republisering.

## Gjenstår før lansering

`docs/INSTALLASJON.md` (billedlagt), `CHANGELOG.md` (fra `versjon-*.md`),
siste herding (opplastingsgrense på GPX-parsing, SFTP-vertsnøkkel-note), og
selve git-push (venter på klarsignal).
