# KrUltra Løypemakker (KUL)

Et enkelt, gratis verktøy for **løpsarrangører** som skal lage og dele
løyper fra GPS-spor. Laget for norske forhold, med Kartverkets kart og
høydedata. Kjører lokalt på din egen PC i nettleseren — ingen sky, ingen
konto, ingen abonnement.

> Fri programvare under [MIT-lisens](LICENSE): bruk, endre og del fritt —
> også kommersielt — så lenge opphavsrettsnotisen følger med.

## Hva verktøyet gjør

1. **Klippe og skjøte GPS-spor.** Last inn én eller flere GPX-filer, klipp
   ut delene du vil bruke, og skjøt dem sammen til en ny løype. Eksporter
   en **gyldig, ryddig GPX-fil** med stigende tidsstempler — den typen
   karttjenester og GPS-klokker faktisk godtar.

2. **Lage løypekart og høydeprofiler.** Vis løypa på Kartverkets kart
   (topografisk, gråtone, papirkart, sjøkart) eller satellittbilde, legg
   til interessepunkter (start/mål, drikke, mat, sjekkpunkter, drop bag …),
   rett opp høydene mot Kartverkets terrengmodell, og styr utseendet fritt.
   Lagre kart og høydeprofil som **PNG-bilder** — klare for
   løypebeskrivelser, plakater eller startnummertrykk.

3. **Publisere interaktive løypevisninger på nett.** Lag en visning med
   kart + høydeprofil + klikkbare punkter + en markør som viser distanse og
   høydemeter, og bygg den inn på nettsiden din med en liten iframe-snutt.
   Republiser med samme adresse, så oppdateres nettsidene automatisk.

I tillegg: et **segment-bibliotek** for å organisere løypedeler i grupper,
og et **punktbibliotek** for å gjenbruke de samme interessepunktene på
tvers av løyper (nyttig når mange løyper deler trasé).

## Kom i gang

**Du trenger:** en Windows-PC og Python 3.9 eller nyere.

1. **Installer Python** (hvis du ikke har det): last ned fra
   [python.org/downloads](https://www.python.org/downloads/) og huk av
   *«Add python.exe to PATH»* under installasjonen.
2. **Last ned dette prosjektet:** grønn **«Code»**-knapp → **«Download
   ZIP»**, og pakk ut (eller klon med git).
3. **Dobbeltklikk `KUL.bat`.** Første gang tar et par minutter (nødvendige
   komponenter lastes ned automatisk). Nettleseren åpner verktøyet på
   `http://127.0.0.1:8000/`.

Hver gang senere: bare dobbeltklikk `KUL.bat`. Lukk det svarte vinduet for
å avslutte.

📖 Detaljert, billedlagt installasjon: [docs/INSTALLASJON.md](docs/INSTALLASJON.md)
· Full bruksveiledning: [docs/BRUK.md](docs/BRUK.md)
· Publisering til nett: [docs/publisering.md](docs/publisering.md)

## Vil du ha løypa publisert, men mangler egen server?

KrUltra tilbyr å publisere løyper på `loyper.krultra.no` for arrangører som
ikke har egen nettpublisering. Bruk **«Send til KrUltra»** i verktøyet, så
får du en fil du sender til `post@krultra.no`.

## Teknisk

- **Backend:** Python + FastAPI, kjører lokalt på `127.0.0.1` (ingen data
  forlater maskinen din).
- **Frontend:** ren HTML/CSS/JavaScript med Leaflet-kart — ingen byggesteg,
  ingen npm.
- **Kart og høyde:** Kartverkets åpne tjenester (WMTS + høydedata-API).
- **Tester:** `python -m pytest` (fra prosjektmappa med `.venv` aktivert).

Koden er organisert i `backend/` (server + GPX-logikk), `frontend/` (alt du
ser i nettleseren), `viewer/` (den innebygde løypevisningen), `tests/` og
`docs/`.

## Lisens og kreditering

Utgitt under [MIT-lisensen](LICENSE) — fri å bruke, endre og dele, også
kommersielt, så lenge opphavsrettsnotisen følger med. Opprinnelig laget av
**Torgeir Kruke / [KrUltra](https://krultra.no)**. Setter du pris på
verktøyet, er en kreditering til KrUltra alltid hyggelig.

Kart © [Kartverket](https://www.kartverket.no/).
