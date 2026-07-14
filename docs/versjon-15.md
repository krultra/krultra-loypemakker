# Versjon 15 — «Velg delte punkter» og snap

*11. juli 2026*

## Behovet

Med punktbiblioteket (versjon 14) kunne delte punkter gjenbrukes ett og
ett via «Sett punkt her». For en ny løype som overlapper eksisterende
traseer er det mer effektivt å hente alle aktuelle punkter i én operasjon.

## «Velg delte punkter…»

Ny knapp ved siden av «Sett punkt her». Den traverserer hele løypa og
finner alle delte punkter i punktbiblioteket som ligger **innenfor 300 m
fra traseen** (punkter løypa allerede bruker utelates). Dialogen viser
dem i løypas rekkefølge med symboler, navn, posisjon langs løypa og —
for punkter som ikke ligger direkte på traseen — avstanden fra løypa.
Alle er forhåndsvalgt, med «Velg alle» for å snu hele lista. Ett klikk
på «Legg til valgte» legger punktene inn og lagrer automatisk.

## Snap eller eksakt posisjon

For delte punkter som ligger et stykke unna traseen (> 15 m) velger
brukeren per punkt:

- **Fest til løypa (snap)** — punktet tegnes på nærmeste løypepunkt,
  både i verktøyet og i publiserte visninger. Standardvalget.
- **Eksakt posisjon** — punktet vises på koordinatene fra
  punktbiblioteket (f.eks. ei hytte 90 m fra stien).

Valget kan endres senere i punkt-dialogen («Fest til løypa (snap)»,
vises bare når punktet faktisk ligger unna løypa, med avstanden oppgitt).

**Viktig designvalg:** `snap` lagres *per løype* (som `vis_ikon` og
etikettplasseringen) og er IKKE et delt felt. De lagrede koordinatene
røres aldri — ellers ville en snapping i én løype synkronisert de
snappede koordinatene tilbake til punktbiblioteket og flyttet punktet
for alle løypene. Visningsposisjonen beregnes i stedet ved tegning
(`wptPosisjon()` i frontend, og ved bygging av course.json i
`backend/publisering.py`). Statistikk og profilforankring bruker som
før nærmeste løypepunkt og påvirkes ikke av valget.

## Annet

- `Waypoint`-modellen har fått feltet `snap` (bool, standard false).
- «Flytt til markøren» nullstiller snap (punktet står da på løypa).
- `BACKEND_VERSJON`/`FORVENTET_BACKEND` → 14 (serveren må kjenne
  `snap`-feltet for at det skal lagres), cache-busting → `?v=15`,
  `APP_VERSJON` → 15. Publiserte visninger trenger ingen ny
  asset-versjon (course.json bærer ferdig beregnede koordinater).

## Tester

- Publisering: snappet punkt publiseres på selve løypepunktet, eksakt
  punkt beholder bibliotekkoordinatene.
- Punktbiblioteket: `snap` består ved åpning, og lagring flytter ikke
  bibliotekpunktet. 65 tester totalt.
