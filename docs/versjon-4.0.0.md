# Versjon 4.0.0 — Flyover og video

*6. august 2026*

## Hva er nytt

**Flyover** viser løypa som en gjennomkjøring i 3D-terreng: en markør
beveger seg gjennom løypa, og kameraet flyter bak den som en drone som
følger etter en løper. Underveis vises distanse, høyde og høydemeter, og
dronen tar en runde rundt hvert interessepunkt.

**Videoeksport** bygger en ferdig MP4-fil av flyoveren slik du kjørte
den — med kamerabevegelsene du gjorde underveis. Videoen kan lagres i
KUL, publiseres på egen nettadresse med innbyggingskode, og lenkes fra
løypekartet.

Dette er samme type visualisering som Strava og lignende tjenester
tilbyr, og er ment både som **salgsplakat for løpet** og som
**arbeidsverktøy** for arrangøren.

> **Om navnet:** Strava bruker «Flyby» om noe helt annet — funksjonen som
> finner andre utøvere som var i nærheten under økta. Vi bruker derfor
> **Flyover**, som er det etablerte begrepet for animert 3D-gjennomflyging
> (Apple Maps, Google Maps, FATMAP, komoot). Samme ord på begge språk.

Flyoveren finnes to steder:

- **I verktøyet:** knappen **«▶ Flyover»** i kartverktøylinja (gruppa **3D**).
  Krever et innlastet spor med høydedata.
- **I den publiserte løypevisningen:** knappen **«▶ Flyover»** øverst.
  - *Merk:* allerede publiserte løyper får knappen når de **republiseres**.

Videoeksport finnes foreløpig bare i verktøyet. Å la deltakerne lage sine
egne videoer fra en publisert visning er planlagt, og skal kunne slås av
og på per løype.

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
| **⏺ Ta opp** | Bygg en videofil av gjennomkjøringen |
| **Esc** | Lukk kortet, eller flyoveren |

Avspillingen tilpasser seg lengden på løypa: korte løyper bruker minst
1,5 minutt, lange maks 5 minutter ved 1× fart — og det dobbelte på
standardfarten 0,5×.

## Interessepunkter

Som standard **stopper dronen ved hvert interessepunkt** og tar en full
360°-runde rundt det før turen fortsetter. Runden tar ca. 11 sekunder ved
1× fart. Den kan skrus av med **«Stopp ved punkter»** for løyper med
mange punkter.

Før runden begynner står dronen et lite øyeblikk i ro til kartflisene
rundt stedet er lastet. Inn- og utgangen av runden er myke: kamerapunktet
glir inn mot stedet i stedet for å hoppe dit, og kameravinkelen legges
rolig ned mot stedet over halvannet sekund.

**Bare det neste punktet vises.** Å tegne alle punktene og luke bort dem
som ikke skulle synes holdt ikke — punkter langt bortenfor horisonten
projiseres over horisontlinja og ble hengende i lufta. Ett skilt om gangen
er både enklere å få riktig og lettere å lese: man ser hva som kommer, ikke
en skog av navn. Skiltet svever et stykke **over** stedet, med en tynn
strek ned til en liten fot som markerer selve punktet, og skjules når
terrenget står mellom det og kameraet.

Klikker du på skiltet, pauses avspillingen og et **detaljkort** viser
tjenester, beskrivelse, høyde over havet, distanse fra start og
høydemeter. Er punktet knyttet til et **arenakart**, får kortet en lenke
dit. Klikk utenfor kortet, så fortsetter turen der den slapp.

Løypa foran løperen tegnes **rød**, så den ikke forveksles med veier og
store stier i satellittbildet, mens den tilbakelagte delen beholder løypas
egen farge fra publiseringen.

## Videoeksport

**⏺ Ta opp** spoler til start og bygger videoen bilde for bilde. Når du når
mål, er fila ferdig, og en dialog viser den med lengde, oppløsning og
størrelse — klar til nedlasting eller lagring i KUL. Kamerabevegelsene du
gjør underveis blir med, og det samme gjør pauser du selv tar.

Videoene havner i **videobiblioteket** i venstre kolonne, der de kan
spilles av, døpes om, slettes og publiseres.

### Publisering av video

En lagret video kan publiseres som en egen liten side under løypa:

```
https://loyper.krultra.no/<løype>/video/
```

Sida har tittel, beskrivelse, språkvelger (norsk/engelsk), fullskjermknapp
når den er innbygd, og en lenke tilbake til løypekartet. Du får ferdig
iframe-snutt, akkurat som ved løypepublisering.

Vil du at løypekartet skal lenke til videoen, fylles feltet **«Lenke til
flyover-video»** i løypepubliseringen ut automatisk etter at videoen er
publisert — men **løypa må publiseres på nytt** for at 🎬-knappen skal
dukke opp.

## Slik virker det teknisk

### Kartet og terrenget

- **Kartmotor:** MapLibre GL JS (`frontend/vendor/maplibre-gl.js`), lagt inn
  lokalt på samme måte som Leaflet — fortsatt ingen byggesteg og ingen npm.
  Biblioteket lastes **først når noen faktisk åpner en flyover**, så den
  vanlige 2D-visningen er like lett som før.
- **Terrengformen** hentes fra åpne, globale høydefliser (Terrarium, AWS Open
  Data). Oppå terrenget drapes de samme kartlagene som ellers i KUL:
  Kartverkets topografiske kart eller Esri-satellitt.
- **Høydene i selve løypa** (profil, høydemeter, avlesningen) er fortsatt
  Kartverkets tall. Terrengflisene former bare landskapet *rundt* løypa.
- Under alle kartflisene ligger en dempet terrengfarge, så en flis som er
  sen ikke etterlater et blått hull i bakken.

### Kameraet

- **Kameraet styres av oss selv**, ikke av MapLibres egne draghåndterere.
  Siden kameraet flyttes hvert eneste bilde for å følge løperen, ville
  bibliotekets egne zoom- og rotasjonsanimasjoner blitt avbrutt hele tiden
  (zoom ville bare virket i pause). Flyoveren har derfor sin egen
  kameratilstand som glir mykt mot måltallene sine.
- **Retningen har en «dødsone».** Retningen løypa går videre i beregnes som
  gjennomsnittet fram til ~350 m foran løperen. Men kameraet *følger* ikke
  den retningen: så lenge løypa ligger innenfor 24° fra der kameraet
  allerede peker, står bildet helt stille. Først når løypa er på vei ut av
  utsnittet dreier kameraet — og da bare så mye at løypa kommer innenfor
  sonen igjen. Det gir lange, rolige tagninger med små korreksjoner i
  svingene, slik en dronefører faktisk filmer.
- **Prikken flyter i bildet.** Kartet er ikke naglet til løperen. Innenfor
  en indre perimeter står kartet helt i ro og prikken beveger seg fritt;
  mellom indre og ytre perimeter henter kartet gradvis inn avviket; ved den
  ytre tar kartet alt, så prikken aldri forsvinner ut. Alt regnes i
  skjermpiksler, så zoom, kameravinkel og terreng tas hensyn til av seg selv.
- **Kameraet går aldri under bakken.** Kameraets egen høyde måles mot
  terrengmodellen, og vinkelen senkes midlertidig om klaringa blir for
  liten. Med **«Hold løperen synlig»** brukes samme mekanisme når en kolle
  kommer mellom kameraet og løperen.

### Videoen

Dette er den delen som ble omarbeidet mest, og grunnen er verdt å kjenne
til:

Første utgave brukte `canvas.captureStream()` + `MediaRecorder`, altså
**opptak i sanntid**. Da følger videoens tid klokka på veggen, og tre ting
følger av det: bruker ett bilde lengre enn 1/30 sekund å tegne — og det
gjør det stadig, når kartfliser lastes — blir bildet enten hoppet over
eller stående dobbelt; `pause()`/`resume()` etterlater et lite rykk ved
hvert klipp; og bildeavstanden blir ujevn uansett. Ingen justering av fart
eller venting kunne rette dette.

Nå er videoens tid **koblet helt fra klokka**. Eksporten ber om ett bilde
av gangen: turen flyttes et fast tidssteg (1/30 s), kameraet settes, og så
ventes det så lenge som nødvendig på at kartet er ferdig tegnet med alle
fliser inne. Bildet kodes med et eksakt tidsstempel — bilde *n* ligger på
*n*/30 sekunder uansett om det tok to millisekunder eller to sekunder å
lage. Resultatet er en fil med helt jevn bildeavstand.

- **Koding:** WebCodecs (`VideoEncoder`), H.264 High profile, 12 Mbit/s,
  maks 1920 px bredde. Pakkes i MP4 med `mp4-muxer` (MIT, lagt inn lokalt).
- **Overlegget tegnes på nytt i lerretet.** `captureStream` fanger bare
  WebGL-lerretet; løperprikk, punktskilt og avlesning er HTML *oppå*
  kartet og ville falt ut av videoen. De tegnes derfor en gang til med
  canvas-kall, og gjenbruker symbolene fra `felles.js`.
- **Skjuler du vinduet** stanser eksporten bare, og fila blir nøyaktig den
  samme — tida telles i bilder, ikke i sekunder.
- Eksporten tar **lengre tid enn videoen varer**, siden hvert bilde venter
  på kartet. En video på ni minutter er ~16 000 bilder.

### Felles

- **All logikk ligger i delte moduler:** `frontend/flyby.js` (visningen) og
  `frontend/opptak.js` (videoen), brukt både av verktøyet og av de
  publiserte visningene — på samme måte som `felles.js`. Modulene har sine
  egne tekster på norsk og engelsk.
- `course.json` er **uendret** bortsett fra ett valgfritt `video`-felt:
  flyoveren bruker punktene, avstandene, høydemeterne og veipunktene som
  allerede publiseres.

## Andre endringer i denne versjonen

- **Arenakart og video åpnes i samme vindu** som løypevisningen. Er visningen
  bygd inn på en side, dukker de opp i den samme iframen i stedet for å
  sprette ut i en ny fane — som flyoveren alltid har gjort. Vil leseren ha
  stor skjerm, tar hun «Full skjerm» først. Arenakartet har fått en
  **«← Tilbake»**-knapp, så det ikke blir en blindvei.
- **Versjonene vises i topplinja:** «versjon 4.0.0 · b39», der b-tallet er
  backend slik den *kjører*. Hold musa over for å se alle asset-versjonene.
  Frontend-filene leses fra disk ved hver forespørsel og ser derfor alltid
  ferske ut, mens backend ligger i minnet fra oppstart — uten dette er det
  umulig å se på skjermen at en omstart ikke tok.
- **Publisering sjekker at alle viewer-filene finnes** på målet, ikke bare
  én av dem. Da pakka vokste med nye filer, kunne en publisering ellers
  hoppe over opplastingen og etterlate en side som peker på filer som aldri
  ble lastet opp.

## Krav

3D-kart krever **WebGL**, og videoeksport krever **WebCodecs**. Mangler
det, skjules knappene. Alle nyere nettlesere på PC har begge deler;
videoeksport er ikke tilgjengelig på alle mobiler.
