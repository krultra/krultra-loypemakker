# Versjon 11 — kompakt profil-etikett og visningsmodus

Bygger på [versjon-10.md](versjon-10.md). Implementert og verifisert 10. juli 2026.

## 1. Mindre tomrom under profilen når waypoints vises

Feltet under høydeprofilen (som gir plass til de skrå waypoint-etikettene)
reserverte for mye. To feil i beregningen: den la til plass *uten* å
trekke fra `marg.bunn` (km-tallenes bånd, som allerede finnes under aksen),
og la på ekstra padding (`+ wptIkonStr + 10`). Nå måles navnebreddene
presist (i stedet for et grovt tegnanslag), og bare det som faktisk mangler
under aksen reserveres. Ekstra høyde falt fra ~118 px til ~63 px for et spor
med korte navn. Ikon-avstanden under navnet ble samtidig litt strammere
(2,2× i stedet for 2,8× tekststørrelse).

## 2. Visningsmodus: bare kart / delt / bare profil

Ny segmentkontroll i topplinja (erstatter den gamle «Høydeprofil»-
av/på-knappen):
- **Bare kart** — kartet fyller hele flaten (profilen skjules).
- **Delt** — kart øverst, høydeprofil nederst (som før).
- **Bare profil** — høydeprofilen fyller hele flaten (kartet og
  kartverktøylinja skjules); profilen strekkes til å bruke tilgjengelig
  høyde i stedet for å stoppe ved standard maks.

Valget huskes lokalt. Første gang utledes modusen av om profilen var
synlig fra før (synlig → «delt», skjult → «bare kart»).

Teknisk: `.content` får klassen `modus-kart` / `modus-split` /
`modus-profil`; CSS styrer hva som vises. I «bare profil» beregner
`tegnProfil` en `plotH` som fyller `profile-canvas-wrap` sin høyde.

## Verifisert (bred skjerm 1600×900)

- 38 automatiske tester passerer
- Etikett-tillegg redusert (139 px med punkter vs 76 px uten → 63 px, mot
  ~118 px før)
- Bare kart: kart 563 px, profil skjult; Bare profil: kart skjult, profil-
  canvas 541 px (fyller); Delt: begge synlige (uendret oppførsel)
- Kartverktøylinja skjules i «bare profil»; aktiv knapp markeres; ingen
  konsollfeil
- (Skjermbilde-verktøyet i forhåndsvisningen hang igjen — verifisert via
  eval/DOM-måling i stedet)

## Merk

`index.html` refererer nå `style.css?v=10` og `app.js?v=10` for å bryte ut
av eventuell gammel nettleser-cache. Sammen med `Cache-Control: no-cache`
(v10) henter F5 alltid nyeste frontend.
