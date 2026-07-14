# Versjon 13 — publisering av interaktive løypevisninger

Bygger på [versjon-12.md](versjon-12.md). Implementert 10. juli 2026.
Se [publisering.md](publisering.md) for oppsett og daglig bruk.

## Hva som er nytt

Verktøyet kan nå publisere en **innbyggbar, interaktiv løypevisning**
(for nettsidene til MMC og krultra): kart + høydeprofil, klikkbare
PoI-er med navn/beskrivelse/statistikk, og en markør som kan føres
gjennom løypa (slider, dra på profilen, klikk på ruta) med distanse- og
høydemeterdata — synkronisert mellom kart og profil. Avklart arkitektur:
alt hostes på Raspberry Pi-en; begge nettstedene bygger inn med iframe.

## Delene

1. **`frontend/felles.js` (ny)** — de rene funksjonene og symboltabellen
   er trukket ut av `app.js` (geometri, utjevning, høydemeter, fintSteg,
   WPT_SYMBOLER m.m.) og deles mellom verktøyet og vieweren. `app.js`
   har tynne skall der API-et var knyttet til verktøyets tilstand
   (`høydemeter` → `beregnHøydemeter(punkter, utjevning, vektform)`).

2. **`viewer/` (ny)** — den innbyggbare visningen: `index.html` (mal der
   `__V__` byttes med asset-versjonen ved publisering), `viewer.js`,
   `viewer.css`. Leser `./course.json` med `cache: 'no-cache'` så
   republiseringer slår gjennom umiddelbart. Gjenbruker felles.js for
   identiske beregninger/symboler som i verktøyet. Akkumulerte
   høydemeter per punkt precomputeres så markør-statistikken er
   øyeblikkelig under draing.

3. **`backend/publisering.py` (ny)**
   - `forenkle_punkter`: Ramer–Douglas–Peucker (iterativ), toleranse 3 m
     → 16 000 punkter blir typisk 1 500–3 000.
   - Veipunktenes ankerpunkter tvinges inn i den forenklede lista —
     RDP fjerner punkter langs rette strekk, og uten dette kunne et
     veipunkt bli forankret flere hundre meter feil langs løypa
     (avdekket av testen `test_struktur_og_idx_remapping`).
   - `bygg_course_json`: kompakt JSON (`[[lat,lon,ele],…]`, avrundet)
     med metadata, stilvalg (rute + profil) og remappede veipunkter.
   - Publiseringsmål i `data/publisering.json`: type `mappe` (lokal
     test/manuell opplasting) eller `sftp` (paramiko; passord eller
     SSH-nøkkel). Delte viewer-assets lastes opp til `assets/v<N>/` kun
     når versjonen mangler; per løype skrives bare `index.html` +
     `course.json`.
   - `ASSET_VERSJON` bumpes når viewer-koden endres.

4. **API**: `GET /api/publish/targets` (mål uten påloggingsdetaljer),
   `POST /api/publish` → `{url, iframe}`. `BACKEND_VERSJON` → 10.

5. **Verktøyet**: ny knapp «🌐 Publiser løypevisning…» i redigerings-
   visningen. Dialog med mål, adressenavn (slug, foreslås fra navnet),
   tittel og beskrivelse; bruker gjeldende punkter (utsnitt hvis merket),
   veipunkter og alle stilvalg. Resultatboks med offentlig URL og
   iframe-snutt med kopieringsknapp. Dialogen står åpen etter publisering
   (egen submit-håndtering, ikke ventPåDialog).

6. **`requirements.txt`**: + paramiko.

## Oppfølging etter brukertest: lokal-test må gå over HTTP

Torgeir åpnet den lokalt publiserte visningen som filsti — da viser
nettleseren bare katalogen, og selv `index.html` ville feilet fordi
nettlesere blokkerer `fetch()` av `course.json` fra `file://`-sider.
Fikset ved at **verktøyet selv serverer den publiserte mappa** på
`/publisert/<slug>/` (`NoCacheStaticFiles`-mount i `backend/main.py`):

- lokal-test-målets `baseUrl` er nå `http://127.0.0.1:8000/publisert`
  (oppdatert både i malen og i eksisterende `data/publisering.json`),
  så lenken og iframe-snutten fra publiseringsdialogen faktisk virker.
- `data/publisert/embed-test.html` peker på http-adressen og forklarer
  hvorfor filstier ikke kan brukes.
- `BACKEND_VERSJON`/`FORVENTET_BACKEND` → 11 (mounten krever omstart —
  banneret varsler).

Verifisert: MMC 70K publisert lokalt (16 222 → 1 796 punkter), åpnet via
`/publisert/mmc-70k/` med korrekte tall (69,81 km · ↑ 4155 · ↓ 4115),
kart, 17 punktrammer og profil med indikatorer (skjermbilde).

## Tester (tests/test_publisering.py)

RDP: endepunkter bevart, rett linje kollapser, formavvik ≤ toleranse,
avstikkere bevart. course.json: struktur, idx-remapping (< 30 m avvik),
JSON-serialiserbarhet. Publisering til mappe-mål: filstruktur, `__V__`
byttet, republisering overskriver course.json, slug-/målvalidering.

## Oppfølging etter brukertest 2 (10. juli 2026)

**Sletting av veipunkter «forsvant ikke»:** selve slettingen ble lagret
riktig, men `sørgForStartOgMål()` gjenopprettet slettede Start/Mål-punkter
hver gang segmentet ble åpnet. Nå legges Start/Mål bare til automatisk på
spor som ikke har noen veipunkter fra før — slettinger respekteres.

**Publisert visning (asset-versjon 2):**

- PoI-popupen viser nå symbolene med tilhørende tekst («🚩 Sjekkpunkt»,
  «🍲 Varm mat» …) under navnet.
- Ikonene under punktnavnene i høydeprofilen er fjernet (ble rotete) —
  de finnes på kartet og i popupene.
- Horisontal scrollbar i iframe fikset: profilcanvasen ble tegnet med
  beholderens `clientWidth` (som inkluderer padding) og stakk 32 px ut.
  Bredden beregnes nå uten padding, og `overflow-x: hidden` er lagt på
  html/body som sikkerhetsnett.
- Eksisterende publiserte løyper oppgraderes ved første republisering
  (index.html peker da på `assets/v2/`).

**Failover-publisering:** nytt måltype `gruppe` i `data/publisering.json`
publiserer til flere mål i én operasjon (prod- og failover-Pi). Feiler
noen — men ikke alle — fullføres resten, og dialogen viser en advarsel
(`advarsel`-felt i PublishResponse). Konfigfila hadde også en JSON-feil
(manglende komma) som er rettet; gruppa «krultra (prod + failover)» er
satt opp med de to Pi-ene som medlemmer.

**Verktøyet:** «Punkter»-valget i profilverktøylinja er delt i
**Punktnavn** og **Punktikoner** som kan slås av/på hver for seg
(ingen/navn/ikoner/begge). Uten navn rykker ikonene opp til navnenes
plass. Gamle lagrede valg arves.

`BACKEND_VERSJON`/`FORVENTET_BACKEND` → 12, cache-busting → `?v=13`.
Nye tester for gruppepublisering (53 totalt).
