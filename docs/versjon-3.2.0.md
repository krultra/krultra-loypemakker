# Versjon 3.2.0 — 3D fly-by: simulert gjennomkjøring av løypa

*4. august 2026*

## Hva er nytt

En **3D fly-by** viser løypa som en simulert gjennomkjøring: en markør
beveger seg gjennom løypa, og kameraet flyter bak den som en drone som
følger etter en løper. Underveis vises distanse, høyde og høydemeter, og
interessepunktene varsles når man passerer dem.

Dette er samme type visualisering som Strava og lignende tjenester
tilbyr, og er ment både som **salgsplakat for løpet** (del den publiserte
visningen, så kan deltakerne fly gjennom løypa selv) og som **arbeidsverktøy**
for arrangøren (se hvordan løypa faktisk ligger i terrenget).

Fly-byen finnes to steder:

- **I verktøyet:** knappen **«▶ Fly-by»** i kartverktøylinja (gruppa **3D**).
  Krever et innlastet spor med høydedata.
- **I den publiserte løypevisningen:** knappen **«▶ 3D»** øverst, ved siden
  av satellitt- og GPX-knappene. Da får også deltakerne fly gjennom løypa.
  - *Merk:* allerede publiserte løyper får knappen når de **republiseres**.

## Kontroller

| Kontroll | Hva den gjør |
| --- | --- |
| **Spill av / Pause** | Knappen, mellomromstasten, eller klikk på 3D-kartet |
| **↺** | Start på nytt fra start |
| **Framdriftslinja** | Dra for å hoppe til et sted i løypa (piltaster spoler) |
| **0,5× – 8×** | Avspillingsfart (0,5× er standard) |
| **Kart / Satellitt** | Bytt underlag som drapes over terrenget (satellitt er standard) |
| **Stopp ved punkter** | Av/på for runden rundt hvert interessepunkt |
| **Hold løperen synlig** | Hev kameraet når terrenget skjuler løperen |
| **Dra med musa** | Sving kameraet rundt løperen, og vipp det opp/ned |
| **Rull / knip** | Zoom inn og ut |
| **Klikk på et punkt** | Pause + detaljkort om stedet |
| **Esc** | Lukk kortet, eller fly-byen |

Avspillingen tilpasser seg lengden på løypa: korte løyper bruker minst
1,5 minutt, lange maks 5 minutter ved 1× fart — og det dobbelte på
standardfarten 0,5×.

## Rundt hvert interessepunkt

Som standard **stopper dronen ved hvert interessepunkt** og tar en full
360°-runde rundt det før turen fortsetter — slik at man rekker å se
hvordan stedet ligger i terrenget. Runden tar ca. 11 sekunder ved 1× fart
og går noe raskere ved høyere fart. Den kan skrus av med **«Stopp ved
punkter»** for løyper med mange punkter.

Før runden begynner står dronen et lite øyeblikk i ro til kartflisene
rundt stedet er lastet, og kameraet senkes litt slik at det ser mer ned på
stedet enn utover. Begge deler er der for å unngå tomme flater når
kameraet svinger inn i områder som ennå ikke er tegnet. Under alle
kartflisene ligger dessuten en dempet terrengfarge, så en flis som er sen
uansett ikke etterlater et blått hull i bakken.

Punktene vises som navneskilt som svever et stykke **over** stedet, med en
tynn strek ned til en liten fot som markerer selve punktet. Klikker du på
skiltet, pauses avspillingen og et **detaljkort** viser tjenester,
beskrivelse, høyde over havet, distanse fra start og høydemeter. Er punktet
knyttet til et **arenakart**, får kortet en lenke dit — den åpnes i ny fane,
så fly-byen står urørt i fanen bak. Klikk utenfor kortet, så fortsetter
turen der den slapp.

Løypa foran løperen tegnes **rød**, så den ikke forveksles med veier og
store stier i satellittbildet, mens den tilbakelagte delen beholder løypas
egen farge fra publiseringen.

## Slik virker det teknisk

- **Kartmotor:** MapLibre GL JS (`frontend/vendor/maplibre-gl.js`), lagt inn
  lokalt på samme måte som Leaflet — fortsatt ingen byggesteg og ingen npm.
  Biblioteket lastes **først når noen faktisk åpner en fly-by**, så den
  vanlige 2D-visningen er like lett som før.
- **Terrengformen** hentes fra åpne, globale høydefliser (Terrarium, AWS Open
  Data). Oppå terrenget drapes de samme kartlagene som ellers i KUL:
  Kartverkets topografiske kart eller Esri-satellitt.
- **Høydene i selve løypa** (profil, høydemeter, avlesningen i fly-byen) er
  fortsatt Kartverkets tall. Terrengflisene former bare landskapet *rundt*
  løypa.
- **Kameraet styres av oss selv**, ikke av MapLibres egne draghåndterere.
  Siden kameraet flyttes hvert eneste bilde for å følge løperen, ville
  bibliotekets egne zoom- og rotasjonsanimasjoner blitt avbrutt hele tiden
  (zoom ville bare virket i pause). I stedet har fly-byen sin egen
  kameratilstand — zoom, vinkel og brukerens dreining — som glir mykt mot
  måltallene sine. Derfor virker zoom og kameravinkel likt enten det
  spilles av eller står stille.
- **Kameraet har en «dødsone».** Retningen løypa går videre i beregnes som
  gjennomsnittet fram til ~350 m foran løperen (ti retningsprøver som
  vektormidles). Men kameraet *følger* ikke den retningen: så lenge løypa
  ligger innenfor 24° fra der kameraet allerede peker, står bildet helt
  stille. Først når løypa er på vei ut av utsnittet dreier kameraet — og
  da bare så mye at løypa kommer innenfor sonen igjen, ikke helt til
  midten. Det gir lange, rolige tagninger med små korreksjoner i svingene,
  slik en dronefører faktisk filmer, i stedet for at bildet vrir seg etter
  hver eneste sving løperen tar.
- **Kameraet går aldri under bakken.** Hvert 120. millisekund måles
  kameraets egen høyde mot terrengmodellen. Blir klaringa mindre enn 25 m,
  senkes kameravinkelen et hakk (som løfter kameraet opp og bakover), og
  brukerens egen vinkel legges gradvis tilbake når terrenget tillater det.
  Med **«Hold løperen synlig»** brukes samme mekanisme også når en kolle
  kommer mellom kameraet og løperen: sikta prøves i åtte punkter, og
  kameraet heves til løperen er fri igjen.
- **All logikk ligger i én delt modul**, `frontend/flyby.js`, som brukes både
  av verktøyet og av de publiserte visningene — på samme måte som
  `felles.js`. Modulen har sine egne tekster på norsk og engelsk.
- `course.json` er **uendret**: fly-byen bruker punktene, avstandene,
  høydemeterne og veipunktene som allerede publiseres.

## Krav

3D-kart krever **WebGL** i nettleseren. Mangler det, vises knappen ikke i
den publiserte visningen (og verktøyet sier fra). Alle nyere nettlesere på
PC og mobil har WebGL.
