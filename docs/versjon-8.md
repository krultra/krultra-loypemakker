# Versjon 8 — PoI-finpuss, ikonstørrelse og waypoints i høydeprofilen

Bygger på [versjon-7.md](versjon-7.md). Implementert og verifisert 8. juli 2026.

## 1. Individuell vis/skjul per PoI

PoI-dialogen har fått avkryssingen **«Vis ikonene på kartet»**. Skjules
ikonene for et punkt, tegnes bare en liten prikk på løypepunktet (fortsatt
klikkbar, så punktet kan hentes fram igjen). Lagres per punkt i
`Waypoint.vis_ikon`. Gjelder også PNG-eksport og høydeprofilen.

## 2. Mindre ikoner når man zoomer ut

Zoom-kurven (`wptSkala`) er gjort kvadratisk og starter lavere: ~0,7× ved
utzoomet (z 8), 1,5× ved z 11, opp til 4× langt inn (z 16). Ikonene holder
seg små på oversiktsnivå og vokser først når man zoomer godt inn.

## 3. Manuell ikonstørrelse (50–200 %)

Ny glidebryter **«Ikonstr.»** i kartverktøylinja multipliserer standard-
størrelsen (`wptIkonPx = WPT_BASIS × zoom-skala × brukervalg`). Verifisert:
ramme 77 px ved 100 %, 154 px ved 200 %, 38,6 px ved 50 %. Huskes lokalt.

## 4. Farge og tykkelse på ledestreken

**«Punktstrek»** (farge) og en tykkelses-glidebryter i kartverktøylinja
styrer strekene fra ikon til løypepunkt — på samme måte som for
løypetraseen. Gjelder kart, PNG og de loddrette strekene i profilen. Løser
at streken var vanskelig å se.

## 5. Start-ikon som grønn play-knapp

Start tegnes nå som en grønn sirkel med hvit trekant («play») i stedet for
en grønn sirkel. Tegnes både i kartrammene (inline SVG) og på canvas
(PNG + profil) via felles hjelpere `symbolGlyphHtml` / `tegnSymbolCanvas`.

## 6. Interessepunkter i høydeprofilen

Ny avkryssing **«Punkter»** i profil-verktøylinja. Når på:
- en **loddrett strek** fra x-aksen opp til toppen av profilen ved punktets
  distanse, med en **liten sirkel** på toppen,
- **navnet** skrevet i 45° nedover fra der streken møter x-aksen,
- de **relevante ikonene** videre langs samme 45°-diagonal (oppreist).

Canvas-høyden utvides automatisk for å gi plass til de skrå etikettene.
Individuelt skjulte punkter tas ikke med. Huskes lokalt.

## Backend

- `Waypoint.vis_ikon: bool = True` (bakoverkompatibelt).

## Verifisert

- 38 automatiske tester passerer
- I nettleser: skjult punkt får bare prikk (3 rammer + 4 prikker for 4
  punkter); start vist som play (SVG-trekant); ikonstørrelse 50/100/200 %;
  zoom-kurve gir mindre ikoner utzoomet; rød tykk ledestrek slår gjennom
  på kart og i profil; profilen viser loddrett strek + sirkel + 45°-navn
  + ikoner; PNG-eksport (296 KB) gjenspeiler alt; ingen konsollfeil
