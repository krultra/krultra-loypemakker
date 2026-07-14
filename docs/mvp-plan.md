# GPS-verktøy for løypeplanlegging — MVP-plan

## Context

Torgeir arrangerer løp og planlegger/rekombinerer løyper ofte ut fra flere GPS-spor. Dagens problem: GPX-filer som er "spleiset" sammen manuelt får ofte rotete eller inkonsistente timestamps, og enkelte karttjenester og GPS-klokker nekter å laste dem. Målet med dette verktøyet er et lokalt, en-brukers program som lar ham laste inn GPX-spor, klippe ut segmenter, sette dem sammen til nye løyper, og eksportere et garantert gyldig, standard GPX-format med ryddig, strengt økende tidssekvens — uavhengig av hvor rotete kildedataene var.

Dette er et helt nytt prosjekt (tom mappe, ikke git-repo). Ingen eksisterende kode gjenbrukes.

**Valgt stack** (bekreftet med bruker, som ikke er profesjonell utvikler — oppsett/kjøring må spesifiseres tydelig og kode og funksjonalitet må være godt dokumentert og forståelig):
- Backend: Python + FastAPI/Uvicorn, serverer både REST-API og statiske frontend-filer
- GPX parsing/skriving: `gpxpy` — output bygges alltid via gpxpy sitt objektmodell (aldri rå XML-templating), som garanterer skjemagyldig GPX 1.1
- Frontend: vanlig HTML/CSS/vanilla JS, ingen build-steg, Leaflet.js via CDN for sporvisning (uten kartlag i MVP — `L.CRS.Simple` — trivielt å legge til ekte kartfliser senere)
- Lagring: flate JSON-filer lokalt (ingen database), ett-bruker-verktøy

## MVP-brukerflyt (validert)

1. Last inn GPX-fil → sporet vises som en linje
2. Slider/piltaster flytter et punkt langs sporet → merk startpunkt
3. Samme for sluttpunkt
4. Lagre segmentet (trenger ikke være gyldig GPX ennå — bare gjenfinnbart JSON)
5. Restart app → tidligere lagrede segmenter er fortsatt tilgjengelige
6. Last inn to lagrede segmenter samtidig, vist i ulike farger
7. Merk ett delingspunkt på hvert segment
8. Slå sammen: ny rute = segment1 fra start t.o.m. merket punkt + segment2 fra merket punkt til slutt
9. Lagre den sammenslåtte ruta med nytt navn
10. "Lagre som GPX" — når som helst, for enkeltsegment eller sammenslått rute — genererer en standard, ryddig GPX-fil

## Prosjektstruktur

```
GPS-tool/
├── docs/
│   └── mvp-plan.md           # denne planen
├── run.bat                  # dobbeltklikk for å starte appen (Windows)
├── requirements.txt          # fastapi, uvicorn[standard], gpxpy, python-multipart, pytest
├── README.md                 # oppsett/bruk for ikke-teknisk bruker
├── data/segments/            # lagrede segment-JSON-filer (opprettes automatisk)
├── backend/
│   ├── main.py                # FastAPI-app, monterer statiske filer + API-router
│   ├── models.py               # Pydantic: Point, SegmentSummary, SegmentDetail, request/response-modeller
│   ├── gpx_io.py                # eneste modul som importerer gpxpy: parse_gpx, build_clean_gpx
│   ├── segment_ops.py            # rene funksjoner: slice_segment, merge_segments
│   ├── timestamps.py              # clean_timestamps — kjernelogikken for det egentlige problemet
│   ├── storage.py                  # save_segment, list_segments, load_segment (flat-fil JSON)
│   └── routes.py                    # tynt HTTP-lag over modulene over
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js                        # all interaktiv logikk (Leaflet, slider/marker-sync, API-kall)
├── scripts/check_gpx.py                # manuelt spot-check-script for eksporterte filer
└── tests/
    ├── test_timestamps.py
    ├── test_segment_ops.py
    └── test_gpx_roundtrip.py
```

## Backend — nøkkelfunksjoner

**`gpx_io.py`** (eneste modul som rører gpxpy):
- `parse_gpx(file_bytes: bytes) -> list[Point]` — tolerant parsing, flater ut alle track/segment til én punktsekvens, normaliserer naive/aware timestamps til UTC. Kaster `ValueError` ved uleselig fil (→ 400).
- `build_clean_gpx(points: list[Point], name: str) -> str` — bygger `gpxpy.gpx.GPX` → én `GPXTrack` → én `GPXTrackSegment` via objektmodellen (aldri strengmanipulasjon), returnerer `gpx.to_xml()`. Forutsetter at `clean_timestamps` allerede er kjørt.

**`segment_ops.py`** (rene funksjoner, ingen I/O):
- `slice_segment(points, start_idx, end_idx) -> list[Point]` — `points[start:end+1]`, validerer range
- `merge_segments(points_a, split_a, points_b, split_b) -> list[Point]` — `points_a[0:split_a+1] + points_b[split_b:]`

**`timestamps.py`** — selve kjerneløsningen på brukerens problem:
- `clean_timestamps(points, default_interval_seconds=1.0, fallback_base_time=None) -> list[Point]`
- Algoritme: iterer punktene i rekkefølge, hold styr på `last_time` (forrige *utdata*-tidsstempel). For hvert punkt: bruk rå tid som den er hvis den er strengt større enn `last_time`; ellers sett `last_time + interval`. Ingen rå-tid i det hele tatt → samme fallback. Denne ene fremoverrettede regelen dekker automatisk: manglende tidsstempler, sammenslåtte segmenter der del 2 er "tidligere" enn del 1, dupliserte tidsstempler, og delvis manglende tid midt i et spor — uten spesialtilfeller for hver situasjon.
- Kjøres kun ved eksport (`/api/gpx/export`), ikke ved lagring av segmenter — lagrede segmenter beholder rå (evt. manglende) tid.

**`storage.py`** — flate JSON-filer i `data/segments/<id>.json`: `save_segment`, `list_segments`, `load_segment`.

## REST-API (6 endepunkter)

| Endepunkt | Formål |
|---|---|
| `POST /api/gpx/parse` | Last opp GPX-fil → punktliste til frontend |
| `POST /api/segments` | Lagre navngitt punktliste som segment |
| `GET /api/segments` | List lagrede segmenter (biblioteksvisning) |
| `GET /api/segments/{id}` | Hent ett segments punkter (for merge-visning) |
| `POST /api/segments/merge` | Slå sammen to punktlister ved gitte delingsindekser → returnerer punktliste (lagres separat) |
| `POST /api/gpx/export` | Kjør `clean_timestamps` + `build_clean_gpx`, returner nedlastbar `.gpx`-fil |

Slicing skjer klient-side i JS (triviell array-slice, unngår unødvendige rundturer mens bruker drar i slider); `segment_ops.slice_segment` finnes likevel server-side, testet og gjenbrukbar.

## Frontend — interaksjonsdesign

- Leaflet-kart med `L.CRS.Simple` (ingen kartfliser i MVP — bytte til ekte kart senere er én linje: fjern `crs`-opsjonen, legg til `L.tileLayer(...)`)
- Spor tegnes som `L.polyline`; to segmenter i merge-visning får faste, distinkte farger
- Én delt funksjon `setSelectedIndex(idx)` synker slider, piltaster, markørposisjon og punktteller — ingen mulighet for at de kommer ut av synk
- Faste markører (`startMarker`/`endMarker`, hhv. `splitMarker` per segment) med egne ikonfarger, satt via "Merk som start/slutt/delingspunkt"-knapper; fremhevet halvgjennomsiktig linje viser segmentet som er i ferd med å velges
- Segmentbibliotek: enkel liste (navn, dato, punktantall, "Last inn"-knapp), hentet fra `GET /api/segments`
- "Lagre som GPX": `fetch` → `blob` → syntetisk `<a download>`-klikk (nødvendig fordi endepunktet krever en POST-body, en vanlig lenke holder ikke)

## Kjøring på Windows (`run.bat`)

Bruker `py -3` (Windows-launcheren, mer robust enn å anta `python` er på PATH), oppretter/aktiverer et lokalt venv, installerer avhengigheter (rask no-op om allerede installert — selvreparerende ved avbrutt tidligere install), åpner nettleseren mot `http://127.0.0.1:8000/`, og starter Uvicorn i forgrunnen (lukk konsollvinduet = stopp appen, ingen egen stoppmekanisme nødvendig). README dokumenterer én-gangs Python-installasjon, daglig bruk, feilsøking, og hvor filer havner.

## Ting som bevisst er utelatt fra MVP

Autentisering, fler-bruker, database, kartfliser, klient-side rammeverk/build-steg, server-side sesjonssporing for ulagrede endringer, høydedata-interpolering, angre/gjøre-om, editere meta-data for gpx-filer.

## Verifisering

**Automatiserte tester** (`pytest`, inkludert i `requirements.txt`):
- `test_timestamps.py`: én test per kanttilfelle (ingen tid, dupliserte tider, bakover-hopp ved sammenslåing, blandet naive/aware, tom/enkeltpunkts liste) — assert strengt økende rekkefølge
- `test_segment_ops.py`: slice inklusiv-grenser, merge ved grenseindekser
- `test_gpx_roundtrip.py`: bygg punkter → `clean_timestamps` → `build_clean_gpx` → **re-parse med `gpxpy.parse()`** → assert punktantall bevart, strengt økende tid, ingen exception. Dette er den viktigste testen — den beviser direkte at eksportert fil er gyldig GPX.

**Manuell ende-til-ende-gjennomgang** (det som faktisk teller for et personlig verktøy):
1. Kjør `run.bat`, bekreft at nettleseren åpner appen uten feil
2. Last inn en ekte (helst tidligere problematisk) GPX-fil, bekreft at sporet vises riktig
3. Dra slider/bruk piler, merk start- og sluttpunkt, bekreft visuell fremheving
4. Lagre segmentet, bekreft ny fil i `data/segments/`
5. Lukk og restart appen, bekreft at segmentet fortsatt er i biblioteket
6. Last to segmenter i merge-visning, bekreft ulike farger
7. Merk delingspunkter, slå sammen, bekreft at overgangen ser sammenhengende ut
8. Lagre sammenslått rute, bekreft i biblioteket
9. "Lagre som GPX" på både enkeltsegment og sammenslått rute
10. **Last de eksporterte filene inn i det verktøyet som opprinnelig avviste dem** (karttjeneste/GPS-klokke-app) — den reelle bekreftelsen på at problemet er løst

**Spot-check-script** (`scripts/check_gpx.py`): kjør `python scripts\check_gpx.py <fil.gpx>` for raskt å bekrefte at en gitt eksportert fil har gyldige, strengt økende tidsstempler, uten å måtte gå via nettleseren.
