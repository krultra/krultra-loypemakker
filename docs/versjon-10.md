# Versjon 10 — utdatert-server-varsel, cache-fiks og profil-avstand

Bygger på [versjon-9.md](versjon-9.md). Implementert og verifisert 9. juli 2026.

## Rotårsak: gammel kode i minnet + cachet frontend

De gjentatte «waypoints lagres ikke / bare ett ikon»-symptomene skyldtes
IKKE feil i koden (auto-lagring og flersymbol er verifisert å virke på
fersk kode), men to lag av utdatert kjørende kode:

1. **Backend i minnet**: Uvicorn laster ikke inn kodeendringer uten
   omstart. En server startet før v6 mangler PUT-endepunktet og
   `types`-feltet. Løst i v9 med `--reload --reload-dir backend`, men det
   krever én manuell omstart for å tre i kraft.
2. **Cachet frontend**: nettleseren kunne kjøre en gammel, cachet `app.js`
   selv etter server-omstart.

## Tiltak i denne versjonen

- **`Cache-Control: no-cache` på alle frontend-filer** (`NoCacheStaticFiles`
  i `backend/main.py`). Nettleseren revaliderer alltid ved F5 og henter ny
  kode når den er endret (uendret → rask 304). Fil-referansene i
  `index.html` fikk `?v=9` for å bryte ut av eksisterende cache én gang.
- **Selv-diagnose av utdatert server**: nytt `GET /api/health` returnerer
  `{versjon: N}`. Frontend sammenligner mot `FORVENTET_BACKEND` ved
  oppstart og viser en tydelig rød banner «Serveren kjører en eldre
  versjon — start run.bat på nytt» hvis serveren er for gammel (eller
  mangler endepunktet helt). Da slipper brukeren å gjette.
- **Synlig kvittering på auto-lagring**: når et PoI lagres til et segment
  vises nå «Interessepunktene er lagret i segmentet», så det er tydelig at
  det faktisk skjer.
- **Større avstand navn↔ikoner i høydeprofilen**: ikonene under
  waypoint-navnene fikk mer klaring (fra 1,4× til 2,8× tekststørrelse ned),
  så de ikke ligger tett opp i teksten.

## Verifisert (fersk server, cache-bustet frontend)

- 38 automatiske tester passerer
- `/api/health` → `{ok, versjon: 9}`; `Cache-Control: no-cache` på app.js
- Auto-lagring: PoI lagt til på åpnet segment gir toast «lagret i
  segmentet», og et flersymbol-punkt (mat+drikke+sjekkpunkt) beholder alle
  tre ved gjenåpning
- Banner skjult mot ny server, vist når health rapporterer versjon < 9
- Høydeprofil: ikoner nå tydelig adskilt fra navnene (skjermbilde)
