# Versjon 9 — PoI-finpuss og profil-etiketter

Bygger på [versjon-8.md](versjon-8.md). Implementert og verifisert 9. juli 2026.

## 1. Ledestreken skinner ikke lenger gjennom rammen

Ikonrammen hadde halvgjennomsiktig bakgrunn, så ledestreken (som ender i
rammens sentrum) syntes gjennom. Bakgrunnen er gjort **helt hvit** — både
på kartet (`.wpt-frame` i CSS) og i PNG-eksporten (rammefyllet på canvas).

## 2. Auto-lagring av waypoints — ingen kodefeil, men stale-server

Feilen «Method Not Allowed» og at et flersymbol-punkt ble redusert til ett
ikon skyldtes at den kjørende serveren hadde **gammel kode i minnet**:
Uvicorn laster ikke inn kodeendringer uten omstart, så en server startet
før v6/v8 manglet både PUT-endepunktet og `types`-feltet (Pydantic
forkastet det ukjente feltet stille). På fersk kode ble det verifisert at
PUT gir `200` og at alle tre symbolene overlever lagring og gjenåpning.

For å unngå at dette gjentar seg er `run.bat` endret til å starte Uvicorn
med `--reload --reload-dir backend`: backend-endringer tas i bruk
automatisk, mens lagring av segmenter i `data\` ikke trigger omstart.
Frontend-endringer krever fortsatt bare F5.

## 3. Veipunkt-streker i profilen stopper ved profilen

Indikatorstreken går nå fra x-aksen kun opp til profilens høyde der
punktet ligger (til f.eks. 200-metersnivået), ikke til toppen av vinduet.
Den lille sirkelen sitter der streken møter profillinja. Y-aksen får litt
luft under laveste punkt (8 % av høydespennet), slik at også lavtliggende
punkter (som start/mål) får en synlig strek. Verifisert ved pikselavlesing:
tre streker, den høyeste stopper godt under toppen, de lave start/mål-
strekene er korte men synlige.

## 4. Profil-etiketter: navn lenger ned, ikoner under navnet

Navnene starter nå et stykke under x-aksens km-tall (under margen for
km-tallene), så de ikke kolliderer. Ikonene tegnes på en parallell 45°-
diagonal **under** navnet i stedet for etter det. Canvas-høyden utvides
automatisk til å romme både navn og ikoner.

## Verifisert

- 38 automatiske tester passerer
- Fersk server: PoI-auto-lagring gir PUT 200; flersymbol (mat+drikke+
  toalett) overlever lagring og gjenåpning
- Profil (pikselavlesing): tre veipunkt-streker, alle stopper ved profilen
  (ingen når toppen), lave punkter synlige takket være y-akse-luften
- Ingen konsollfeil (skjermbilde-verktøyet i forhåndsvisningen hang, men
  eval-basert verifisering bekreftet geometrien)
