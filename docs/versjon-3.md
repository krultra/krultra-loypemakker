# Versjon 3 — riktige høyder, utjevning, mer metadata og starttidspunkt

Bygger på [versjon-2.md](versjon-2.md). Implementert og verifisert 8. juli 2026.

## Diagnosen bak høydefiksen (viktig å forstå)

Torgeir observerte at høydeprofilen for MMC 70K (2024) viste bare én topp
over 1000 m, mens løypa reelt har ni, og at Garmin Connect viste riktige
høyder for samme fil. Undersøkelse mot Kartverkets terrengmodell viste:

- Profilen tegnet GPX-filas høyder **korrekt** — det er filas høyder som
  er feil. GPS-målt høyde avvek fra −162 m til +71 m på testpunktene.
- Fila har maks 1104 m og 706 punkter over 1000 m; terrenget på de samme
  koordinatene går til 1247 m med 2550 punkter over 1000 m.
- Garmin Connect viser «riktige» høyder fordi de ignorerer filas høyder
  og slår opp posisjonene i sin egen terrengmodell («Elevation Correction»).

## 1. Høyder fra Kartverkets terrengmodell

Ny knapp i redigeringsvisningen: **«Høyder: GPX-fila / Kartverket»**.
Bytter mellom filas egne høyder og terrenghøyder fra Kartverkets åpne
høyde-API (`ws.geonorge.no/hoydedata/v1/punkt`, gratis, uten nøkkel).

- Backend-modul `backend/elevation.py`: API-et tar maks 50 punkter per
  kall; lange spor samples jevnt (maks 4000 oppslag) og mellomliggende
  punkter interpoleres lineært — ubetydelig feil siden nabopunkter i et
  spor ligger få meter fra hverandre. 5 parallelle kall; ~5–15 s for et
  70 km-spor. Punkter uten dekning (utenfor Norge) beholder originalhøyden.
- Byttet endrer selve punktdataene i arbeidsminnet, så **lagring og
  GPX-eksport bruker de valgte høydene**. Originalene huskes så lenge
  sporet er åpent, og terrenghøydene mellomlagres (hentes bare én gang).
- Endepunkt: `POST /api/elevation/correct` → `{elevations: [...]}`.

## 2. Utjevning av høydeprofilen

To nye kontroller i profil-verktøylinja (kun visning — endrer aldri data):

- **Utjevning** (0–50): hvert punkt erstattes av et vektet snitt av seg
  selv og n punkter på hver side. 0 = av.
- **Vektform** (1–10): formen på gauss-vektingen. 1 = flat kurve (alle
  nabopunkter teller nesten likt, mest utjevning), 10 = spiss (punktet i
  midten dominerer, minst utjevning). Implementert som σ = n/form.

## 3. Metadata: creator og lenke

`creator` og `link` følger nå med gjennom hele kjeden på samme måte som
navn/beskrivelse: GPX-innlesing (fra `creator`-attributtet og
`<link href>`) → dialogen (redigerbare felt) → segmentlagring →
sammenslåing (arves fra A, ellers B) → GPX-eksport (settes som
`creator`-attributt og `<link>` på både fil- og spornivå).
Uten creator brukes «GPS Løypeverktøy». Gamle segmentfiler leses fortsatt.

## 4. Starttidspunkt ved eksport

GPX-eksportdialogen har fått feltet **«Starttidspunkt for første punkt»**
(forhåndsutfylt med sporets eksisterende starttid). Angis det, forskyves
hele tidsserien dit — alle innbyrdes tidsavstander (fart/pauser) bevares.
Tid uten tidssone tolkes som lokal tid på maskinen (naturlig for et
lokalt verktøy); GPX-fila lagrer som alltid UTC. Tomt felt = ingen
forskyvning. Backend: `timestamps.shift_to_start` + `start_time` i
`POST /api/gpx/export`, kjøres ETTER `clean_timestamps`.

## Verifisert

- 30 automatiske tester (nye: shift_to_start ×2, interpolering ×5,
  utvidet metadata-rundtur)
- I nettleser: MMC 70K byttet til Kartverket-høyder (1104→1247 m maks,
  706→2550 punkter over 1000 m — de ni toppene er synlige i profilen),
  utjevning ±10/form 3 gir Garmin-lik glatt profil
- Eksport-API: starttid 10:00 lokal → 08:00Z i fila, 30 s-intervaller
  bevart, creator/link på plass i XML-en
