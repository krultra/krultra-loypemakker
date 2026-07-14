# Versjon 16 — Drop bag, bedre GPX-eksport og sikring av punktbiblioteket

*11. juli 2026*

## Nytt symbol: Drop bag

Interessepunktene har fått symbolet **🎒 Drop bag** (GPX-symbol «Bag»),
plassert mellom Dusj og Husly i den faste visningsrekkefølgen. Publiserte
visninger trenger ny asset-versjon for å kjenne symbolet — derfor
asset-versjon 4 (tas i bruk ved neste republisering av hver løype).

## GPX-eksport: ett punkt per sted

Tidligere ble hvert interessepunkt eksportert som ETT `<wpt>` PER SYMBOL
(et punkt med sjekkpunkt + drikke + snacks ble tre GPX-punkter). I
Garmin Connect ga det et mylder av «Generelt punkt» uten beskrivelse.

Nå eksporteres **ett `<wpt>` per interessepunkt**:

- `<sym>` = primærsymbolet (første kategori) — for GPS-enheter som
  forstår symbolnavn.
- `<type>` = alle kategoriene, kommaseparert («sjekkpunkt,drikke,snacks»).
  Standard GPX-felt (fritekst). **Leses tilbake ved import**, så en
  GPX-fil eksportert fra verktøyet gjenskaper hele symbollista —
  tapsfri rundtur.
- `<cmt>` (kommentar) = lesbar tjenesteliste + beskrivelsen, f.eks.
  «Sjekkpunkt, Drikke, Snacks — Vann og saft». Både `<cmt>` og `<desc>`
  er del av GPX 1.1-standarden; det er kommentarfeltet Garmin gjerne
  viser som merknad på punktet. `<desc>` holder seg til brukerens egen
  beskrivelse (uforurenset ved reimport).
- Punkter med «snap» eksporteres på nærmeste løypepunkt, slik de vises.
- Ved import brukes `<cmt>` som beskrivelse hvis `<desc>` mangler
  (noen verktøy skriver bare kommentaren).

Merk: hva Garmin Connect viser, styrer Garmin selv — men med ett punkt
per sted, navn og merknadstekst er grunnlaget så godt som GPX-formatet
tillater.

## Sikring av punktbiblioteket

Hver skriving til `data/waypoints.json` legger nå forrige innhold i
`data/waypoints.json.bak` — et uhell (feilskriving, håndredigering)
koster aldri mer enn én generasjon av biblioteket. Bakgrunnen var at
delte punkter lagret med versjon 14 forsvant: det var IKKE en feil i
verktøyet, men testdata som ved en glipp overskrev bibliotekfila under
utviklingen av versjon 15. Skulle noe liknende skje igjen, kan
biblioteket også gjenoppbygges fra segmentene (de lagrer lokale kopier
med `bib_id`), eller hentes fra OneDrives versjonslogg.

## Versjoner

`APP_VERSJON` → 16, `BACKEND_VERSJON`/`FORVENTET_BACKEND` → 15
(eksportendringen og `cmt`-feltet krever omstart — banneret varsler),
asset-versjon → 4, cache-busting → `?v=16`.

## Tester

Rundtur for flersymbolpunkt (ett `<wpt>`, types gjenskapt fra `<type>`,
`<cmt>` uten å forurense beskrivelsen), `<cmt>` som reservebeskrivelse,
og sikkerhetskopien av punktbiblioteket. 68 tester totalt.
