# Versjon 5 — profilfarger for trykk, høydemeter og gruppert bibliotek

Bygger på [versjon-4.md](versjon-4.md). Implementert og verifisert 8. juli 2026.

## Høydeprofil

- **Frie farger på akser, rutenett og tall**: tre nye fargevelgere i
  verktøylinja (ved siden av av/på-valgene). Standardverdiene er de gamle
  grå tonene; for startnummertrykk kan de settes helsvarte for full
  kontrast. Den automatiske lys/mørk-tilpasningen er erstattet av
  brukerens egne valg (som huskes). Hurtigvalgene «Svart/hvitt» og
  «Rød fylt» tilbakestiller også disse til standard.
- **Markørlinja kan skjules og farges**: nytt «Markør»-valg (av/på +
  farge) for den loddrette linja som viser markørposisjonen. Skjult
  markør gjelder både skjerm og PNG-eksport.
- **«km»-tittelen kuttes ikke lenger**: høyremargen skalerer nå med
  tekststørrelsen (`tekst × 1,4 + 8 px`), så aksetittelen alltid får
  plass — også ved 24 px i lagret PNG.
- **Høydemeter opp/ned i metadatalinja**: «4510 punkter · 7,57 km ·
  ↑ 512 m · ↓ 512 m». Beregnes fra gjeldende høydekilde (GPX eller
  Kartverket — punktenes faktiske verdier) og med brukerens
  utjevningsvalg, altså nøyaktig samme grunnlag som profilen tegnes med.
  Oppdateres ved høydekildebytte og når utjevningen endres. Vises også
  for sammenslåtte resultater.

## Segmentbibliotek med grupper og fri rekkefølge

- **Ett nivå med grupper** (f.eks. «MMC») + segmenter direkte på
  rotnivået. «+ Gruppe»-knapp oppretter; gruppene kan endres navn på og
  slettes (segmentene flyttes da ut på rota — de slettes aldri).
- **Kollaps/ekspander** per gruppe (chevron eller klikk på navnet);
  tilstanden huskes lokalt i nettleseren.
- **Dra og slipp**: segmenter kan flyttes fritt — over/under andre
  segmenter (også på tvers av grupper) eller slippes midt på en
  gruppeoverskrift for å legges i gruppa. Grupper kan flyttes som helhet
  på rotnivået.
- **Lagring**: organiseringen ligger i `data/library.json`
  (`{root: [...], groups: {...}}`) og lagres ved hver endring via
  `GET/PUT /api/library`. Innlesingen er selvreparerende: slettede
  segmenter fjernes fra strukturen, nye/ukjente legges øverst på rota,
  duplikater lukes ut — så fila kan aldri «komme i utakt» med
  segmentmappa.

## Verifisert

- 36 automatiske tester (5 nye for avstemmingen av biblioteksstrukturen:
  tom start, bevart struktur + nye øverst, slettede fjernes, duplikater,
  ødelagt fil)
- I nettleser: gruppe opprettet og to segmenter flyttet inn, kollaps +
  ekspander, struktur intakt etter omlasting; svarte akser/tall og mørkt
  rutenett; skjult markørlinje; «km» innenfor kanten ved 24 px tekst;
  høydemeter i metadatalinja som reagerer på utjevning (512 → 499 m ved ±20)
