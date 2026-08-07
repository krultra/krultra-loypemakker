# Bruksveiledning — KrUltra Løypemakker (KUL)

Denne veiledningen går gjennom alt verktøyet kan. For installasjon, se
[INSTALLASJON.md](INSTALLASJON.md). For nettpublisering, se
[publisering.md](publisering.md).

## Starte og avslutte

- **Start:** dobbeltklikk `KUL.bat` i prosjektmappa. Et svart vindu åpnes,
  og nettleseren åpner verktøyet automatisk på `http://127.0.0.1:8000/`.
  Viser nettleseren en feil rett etter oppstart, vent et par sekunder og
  trykk oppdater (F5) — appen rakk ikke å starte helt før nettleseren åpnet.
- **Avslutt:** lukk det svarte vinduet.

## Klippe ut et segment fra et GPS-spor

1. Klikk **«Last inn GPX-fil…»** og velg fila.
2. Sporet vises på skjermen. Bruk **glidebryteren** eller **pilknappene**
   til å flytte den blå markøren langs sporet. (Piltastene på tastaturet
   virker også — hold Shift for å hoppe 10 punkter om gangen.)
3. Klikk **«Sett start her»** når markøren står der segmentet skal begynne.
4. Flytt markøren videre og klikk **«Sett slutt her»**. Utsnittet markeres
   med grønt, og lengden vises.
5. Klikk **«Lagre segment»** og gi det et navn. Segmentet havner i
   biblioteket til venstre og er der neste gang du åpner appen.

Tips: hold inne **◀/▶**-knappene for å flytte markøren raskt langs sporet —
farten øker jo lenger du holder.

## Sette sammen to segmenter til en løype

1. Bytt til fanen **«Slå sammen segmenter»**.
2. Velg første del med **«A»**-knappen og siste del med **«B»**-knappen i
   biblioteket. De vises i blått og rødt.
3. Sett ett **delingspunkt** på hvert segment (glidebryter + knapp). Tips:
   sett delingspunktet på det ene segmentet der løypene møtes, og klikk
   **«Nærmest … delingspunkt»** på det andre — da finner verktøyet
   automatisk punktet der sporene er nærmest hverandre, og varsler hvis
   avstanden er over 100 meter.
4. Klikk **«Slå sammen»**. Den nye løypa (lilla) går fra starten av A, til
   delingspunktet på A, videre fra delingspunktet på B, til slutten av B.
5. Lagre resultatet som segment, eller eksporter det rett til GPX.
   Interessepunktene fra begge segmentene følger med (de som ligger langs
   den nye traseen); nye start- og målpunkt lages for de nye endene.

## Kartunderlag, kartvisninger og kart som PNG

- **«Kart»**-knappen i topplinja legger Kartverkets kart under sporene
  (krever internett — resten av appen virker uten).
- **Kartvisning:** topografisk, gråtone, papirkart-stil, sjøkart — pluss
  satellittbilde (fra Esri; Kartverket tilbyr ikke satellitt).
- **Kart som PNG:** lagrer kartet med rute (valgfri **rutefarge** og
  **tykkelse**) og interessepunkter som bilde. Bruk **«Velg utsnitt»** og
  dra opp et rektangel på kartet for å eksportere bare det området.

## Flyover: fly gjennom løypa i 3D

**«▶ Flyover»** (gruppa **3D** i kartverktøylinja) viser løypa som en
gjennomkjøring i 3D-terreng: en markør beveger seg gjennom løypa, og
kameraet flyter bak den som en drone som følger etter en løper. Underveis
vises distanse, høyde og høydemeter.

- **Spill av / Pause** — knappen, mellomromstasten, eller bare **klikk på
  3D-kartet**. **↺** starter på nytt.
- **Framdriftslinja** hopper til et sted i løypa (piltastene spoler).
- **0,5× – 8×** styrer farten. **0,5× er standard**, så man rekker å se seg
  om. Korte løyper bruker minst 1,5 minutt, lange maks 5 minutter ved 1× —
  altså det dobbelte ved 0,5×.
- **Kart / Satellitt** bytter hva som drapes over terrenget. Satellittbilde
  er standard, siden det er der 3D-terrenget kommer best til sin rett.
- **Esc** lukker flyoveren.

**Styr kameraet mens det spilles av.** Dra med musa for å svinge kameraet
rundt løperen og vippe det opp og ned. Rull for å zoome — eller knip med
to fingre på berøringsskjerm. Alt dette virker like godt under avspilling
som i pause. Selve retningen følger løypa; du legger din egen vinkel oppå.

Kameraet er laget for å være rolig å se på: det står stille så lenge løypa
videre ligger godt innenfor bildet, og korrigerer bare når den er på vei
ut — omtrent som en dronefører som holder bildet i ro i stedet for å følge
hver sving. Markøren får dessuten flyte fritt innenfor et område midt i
bildet, så kartet ikke er naglet fast til den.

**Stopp ved punkter.** Som standard stanser dronen ved hvert
interessepunkt, står et lite øyeblikk i ro mens kartet rundt lastes
ferdig, og tar så en full runde rundt stedet før turen fortsetter. Vil du
heller fly uavbrutt gjennom, skru av **«Stopp ved punkter»** øverst.
Setter du avspillingen på pause midt i en runde, fortsetter den der den
slapp når du spiller av igjen.

**Bare det neste punktet vises**, som et navneskilt som svever over stedet
med en tynn strek ned til selve punktet. Skiltet skjules når terrenget
står mellom det og kameraet. **Klikk på skiltet** for å sette avspillingen
på pause og få opp detaljene: hvilke tjenester som finnes der,
beskrivelsen, høyde over havet, distanse fra start og høydemeter. Har
punktet et **arenakart** knyttet til seg, ligger det en lenke dit i kortet.
Klikk utenfor kortet — eller trykk Esc — så fortsetter turen der den slapp.

**Hold løperen synlig.** Kameraet passer alltid på å holde seg over
bakken. Med denne innstillingen på heves det også når en kolle kommer
mellom kameraet og løperen, og senkes tilbake til din valgte vinkel så
snart utsikten er fri igjen.

Løypa **foran** løperen er rød, så den skiller seg fra veier og store
stier i satellittbildet; delen som er **tilbakelagt** har løypas egen farge.

Flyoveren venter til landskapet rundt løypa er ferdig lastet før den
starter, så turen ikke begynner i et halvferdig terreng.

Krever at sporet har høydedata (hent gjerne **høyder fra Kartverket**
først), internett, og en nettleser med 3D-støtte (WebGL). Terrengformen
kommer fra åpne globale høydedata, mens høydetallene som vises er
Kartverkets.

Publiserte løypevisninger har den samme flyoveren bak knappen
**«▶ Flyover»**, slik at deltakerne kan fly gjennom løypa selv. Allerede
publiserte løyper får knappen når de republiseres.

## Video av flyoveren

**⏺ Ta opp** nede i flyoveren åpner **opptaksmanuset** — panelet der du
bestemmer hvordan videoen skal bli. Derfra starter du opptaket, som spoler
til start og bygger en videofil av hele gjennomkjøringen. Når manuset er
kjørt ferdig, viser en dialog videoen med lengde, filer og størrelse —
klar til **nedlasting** eller **lagring i KUL**.

### Opptaksmanuset

Panelet (også tilgjengelig med **⚙ Manus** i topplinja) har fire faner:

- **Kamera** — velg steder i løypa og sett kameravinkel, retning, zoom og
  fart for hvert av dem. Mellom punktene glir kameraet og farten mykt
  over. Still kameraet slik du vil ha det på kartet og trykk **＋ Legg til
  her**, så fanges stillingen. Fart 0 gir full stopp med den varigheten du
  velger. Punktene vises som nummererte merker på kartet — klikk for å
  redigere, dra for å flytte. Øverst velger du også hvor mye terrenget får
  overstyre kameravinkelen: flyoveren hever normalt kameraet (ved å senke
  vinkelen) når bakken eller en kolle er i veien, og det kan dempe en bratt
  vinkel du har bedt om.
- **Sjekkpunkter** — for hvert punkt: om markøren skal vises (og hvor langt
  unna den toner inn), om kameraet skal ta en 360, og om vi skal stoppe og
  vise detaljkortet. Punkter du skjuler hoppes helt over.
- **Start & slutt** — plakat med løypenavn, egen undertekst og
  lengde/høydemeter; ventetid før løypa starter eller etter mål; og et
  oversiktsbilde av hele traseen.
- **Språk & video** — norsk, engelsk eller begge, og oppløsning/nettversjon
  (se under).

**▶ Forhåndsvis** kjører manuset i sanntid uten å lage video, så du ser
hva du får før du bruker tid på opptaket — mellomrom pauser, framgangslinja
og piltastene spoler, ↺ starter forfra og Esc avslutter. **Lagre manus** lagrer det
sammen med løypa, så du kan justere en detalj og ta opp på nytt. (Krever
at løypa er lagret som segment — et nylig innlastet GPX-spor har ingen id
å henge manuset på.)

Uten kamerapunkter oppfører opptaket seg som før: dronen følger løperen
med de innstillingene du har på skjermen.

Full beskrivelse i [versjon 4.1.0](versjon-4.1.0.md).

### Størrelse på videofila

Videoen kan ikke bli skarpere enn kartflaten den spilles inn fra. Vil du
ha full HD, må vinduet være minst **1920 piksler bredt** når du starter
opptaket — gjør det gjerne større, eller trykk **F11** for full skjerm.
Fanen **Språk & video** i manuset viser hvor mange piksler flaten faktisk
er, og advarer hvis den er for liten.

I tillegg til hovedfila lages en lettere **nettversjon** (standard
1280 px) i samme opptak. Grunnen er at en vanlig MP4 ikke tilpasser seg
avspilleren: uten nettversjonen ville en video i en liten ramme på mobil
lastet ned hele 1080p-fila. Ved publisering legges begge ut, og videosida
henter den minste som er stor nok for skjermen.

### Språk

Øverst i fanen **Språk & video** krysser du av for norsk, engelsk eller
begge. Velger du begge, spilles de inn samtidig — kartet tegnes bare én
gang, og teksten legges på i begge språk. Du får da to videoer i
biblioteket, én per språk, som publiseres hver for seg.

Den engelske teksten hentes fra oversettelsene på interessepunktene, fra de
engelske plakatfeltene under «Start & slutt», og fra faste ord som
oversettes av seg selv. Mangler en oversettelse, brukes den norske teksten.

Videoen bygges **bilde for bilde**, ikke som et skjermopptak. For hvert
bilde venter KUL til kartet er ferdig tegnet med alle fliser på plass, og
gir bildet et eksakt tidsstempel. Det er derfor videoen blir jevn selv om
maskinen bruker lang tid på et enkelt bilde. To praktiske følger:

- **Eksporten tar lengre tid enn videoen varer.** Forhåndsvisningen går
  rykkvis mens den jobber — det er normalt og påvirker ikke fila.
  Prosenten i hjørnet viser hvor langt den er kommet.
- **Skjuler du vinduet, stanser eksporten bare** og fortsetter når du er
  tilbake. Fila blir nøyaktig den samme.

Videoene havner i **videobiblioteket** i venstre kolonne, der de kan
spilles av (**▶**, åpner i egen fane), lastes ned (**⤓**), døpes om,
slettes og publiseres. Raden viser lengde, oppløsning, størrelse og
hvilke utgaver som finnes.

### Organisere videobiblioteket i grupper

Videobiblioteket har samme gruppering som segment- og arenakartbiblioteket:
**+ Gruppe** lager en gruppe (f.eks. et arrangementnavn), og du drar
videoer inn i den eller ut igjen. Rekkefølgen — både på rotnivået og inni
en gruppe — settes ved å dra. Slett en gruppe, og videoene i den legges
tilbake på rotnivå i stedet for å bli slettet.

### Laste opp en ferdig redigert video

Har du klippet, tekstet eller mikset en video utenfor KUL (f.eks. i
Kdenlive eller DaVinci Resolve) og vil ha den med i videobiblioteket for
publisering, bruker du **⬆ Last opp** i videobibliotekets overskrift.
Fyll inn navn, eventuelt løype og språk, velg fila — og eventuelt en
lettere nettversjon i tillegg, akkurat som et flyover-opptak kan gi to
filer. Lengde og oppløsning leses fra videofila i nettleseren, uten noen
tur om serveren.

Den opplastede videoen havner i biblioteket på lik linje med
flyover-opptak, og publiseres på nøyaktig samme måte.

### Publisere en video

**«Publiser»** i videobiblioteket legger videoen ut som en egen liten side
under løypa, f.eks. `loyper.krultra.no/mmc-100m/video/`. Sida har tittel,
beskrivelse, språkvelger og en lenke tilbake til løypekartet, og du får en
ferdig **iframe-snutt** til innliming på nettsida — akkurat som ved
publisering av løyper.

Vil du at løypekartet skal ha en **🎬-knapp** til videoen, fylles feltet
**«Lenke til flyover-video»** i løypepubliseringen ut automatisk etter at
videoen er publisert. Husk at **løypa må publiseres på nytt** for at
knappen skal dukke opp.

Videoeksport krever en nettleser med WebCodecs-støtte. Mangler den,
skjules knappen. Alle nyere nettlesere på PC har det; på mobil er det mer
ujevnt.


## Høydeprofil

**«Høydeprofil»** (eller visningsmodus **«Delt» / «Bare profil»**) viser
høydeprofilen for sporet du jobber med. Utseendet kan tilpasses fritt —
nyttig for program, plakater og startnummertrykk:

- **Høydeskala** (1× = naturtro målestokk, høyere = mer dramatisk)
- **Linje**, **Fyll** (av/på + farge) og **Bakgrunn** — fritt fargevalg
- **Akser** og **Rutenett** — av/på og fritt fargevalg for hver, pluss egen
  farge på **Tall**ene (sett dem svarte for full kontrast på trykk)
- **Markør** — den loddrette linja som viser markørposisjonen, kan skjules
  eller gis egen farge
- **Tekst** — størrelsen på aksetallene
- **Utjevning** og **Vektform** — jevner ut GPS-støy (kun visningen; dataene
  endres aldri). «Utjevning» velger hvor mange nabopunkter som regnes med,
  «Vektform» hvor spiss gauss-vektingen er (1 = flat/mye, 10 = spiss/lite)
- **«PNG»** lagrer profilen som bilde

Metadatalinja viser også **høydemeter opp og ned**, beregnet fra den aktive
høydekilden og med utjevningen tatt hensyn til. Alle valg huskes.

## Riktige høyder fra Kartverket

GPS-klokker måler høyde upresist — avvik på ±150 m er vanlig, så
høydeprofilen fra en GPX-fil kan se helt feil ut selv om fila er i orden.
Verktøyet henter derfor **automatisk** de riktige terrenghøydene fra
Kartverkets nasjonale terrengmodell når du åpner et spor (samme prinsipp som
Garmin Connect bruker). Knappen **«Høyder: Kartverket / GPX-fila»** viser
hvilken kilde som er aktiv og lar deg bytte tilbake. Henting tar noen
sekunder for lange spor og krever internett — uten nett beholdes filas egne
høyder. De valgte høydene brukes også ved lagring og eksport.

## Interessepunkter (mat, drikke, sjekkpunkter …)

**«Sett punkt her»** oppretter et interessepunkt der markøren står, med
navn, beskrivelse og **ett eller flere symboler** (sjekkpunkt, drikke,
snacks, mat, varm mat, toalett, dusj, drop bag, husly, tidtaking,
informasjon m.fl.). Et sted kan f.eks. ha både mat, drikke og toalett, og
alle symbolene samles i én ramme (som wrapper til flere rader ved mange
ikoner) med en **strek ned til løypepunktet**. **Start- og målpunkt lages
automatisk.** Dialogen viser også avstand og høydemeter fra start og fra
forrige punkt.

Du kan **dra ramma** dit du vil på kartet — streken følger med, og
plasseringen huskes. Klikk på en ramme for å redigere, flytte til markøren
eller slette punktet. Du kan også skjule ikonene for enkeltpunkter (da vises
bare en liten prikk du kan klikke på igjen).

I kartverktøylinja styrer du utseendet: **«📍 Punkter»** skjuler/viser alle,
**«Punktstrek»** setter farge og tykkelse på strekene, og **«Ikonstr.»**
skalerer symbolene 50–200 %. Symbolene blir uansett mindre når du zoomer ut
og større når du zoomer inn.

I **høydeprofilen** kan punktene vises som en loddrett strek opp til punktet,
med **navn** og/eller **ikoner** (velges hver for seg).

Interessepunktene **lagres automatisk**: har du åpnet et segment, oppdateres
det med det samme; har du åpnet en GPX-fil, skrives punktet rett inn i fila.
(Et sammenslått resultat må først lagres før du kan sette punkter på det.)

## Punktbibliotek: gjenbruk punkter på tvers av løyper

Når mange løyper deler de samme stasjonene, kan du gjøre et interessepunkt
**delt**: kryss av **«Delt punkt»** i dialogen, så havner det i
punktbiblioteket. I andre løyper:

- Stå i nærheten og klikk **«Sett punkt her»** — dialogen foreslår delte
  punkter i nærheten; ett klikk gjenbruker punktet.
- Eller bruk **«Velg delte punkter…»** som går gjennom hele løypa og lister
  alle delte punkter innenfor 300 m fra traseen, så du kan huke av mange på
  én gang. Punkter som ligger et stykke fra løypa kan du enten **feste til
  løypa** («snap») eller vise på de eksakte koordinatene.

Endrer du et delt punkt i én løype, gjelder endringen alle løypene som
bruker det. Knappen **«🔗 Punktbibliotek…»** viser alle delte punkter og
hvilke løyper som bruker dem.

## Metadata (navn, beskrivelse, creator, lenke, copyright, nøkkelord)

Alle spor og segmenter har navn, og valgfritt beskrivelse, creator, lenke,
copyright, nøkkelord og starttidspunkt. Disse **arves naturlig**: laster du
inn en GPX-fil, følger metadataene med til segmentet du lagrer — men du får
alltid redigere dem i dialogen. Verdiene du bruker **huskes** og foreslås
neste gang. Bruk **«Endre»**-knappen i biblioteket for å endre metadata på
et lagret segment uten å røre selve sporet.

Om copyright: skriv inn rettighetshaverens navn, så får eksporterte
GPX-filer automatisk årstall og **CC BY-NC 4.0**-lisensen (fri
ikke-kommersiell bruk med navngivelse). Dette gjelder løypedataene dine, og
er uavhengig av programvarens MIT-lisens.

## Lagre som GPX-fil

Klikk **«Lagre som GPX»** (finnes i begge faner). Verktøyet rydder
automatisk opp i tidsstemplene: manglende, dupliserte eller bakovergående
tider fikses, slik at fila alltid er gyldig standard GPX 1.1. Hvert
interessepunkt blir ett `<wpt>` (med alle symbolene i `<type>` og en lesbar
tjenesteliste i kommentarfeltet, som bl.a. Garmin viser som merknad).

- **Starttidspunkt:** i dialogen kan du sette starttid for første punkt
  (f.eks. løpets faktiske starttid). Hele tidsserien flyttes dit, med alle
  innbyrdes tidsavstander bevart. La feltet stå for å beholde sporets
  opprinnelige tider.
- **Lagre hvor du vil:** i Chrome/Edge åpnes en «Lagre som»-dialog der du
  velger mappe og filnavn; andre nettlesere laster ned til nedlastingsmappa.

## Organisere biblioteket i grupper

Med **«+ Gruppe»** lager du grupper i segmentbiblioteket (f.eks. «MMC») og
legger segmenter i dem ved å **dra og slippe**: slipp et segment på en
gruppeoverskrift for å legge det i gruppa, eller over/under andre segmenter
for å endre rekkefølgen — også grupper kan flyttes. Klikk på gruppenavnet
for å vise/skjule innholdet. Sletter du en gruppe, flyttes segmentene trygt
ut på rotnivået.

## Publisere løyper på nettsidene

**«🌐 Publiser løypevisning…»** lager en interaktiv løypeside og laster den
opp til serveren din; nettsidene bygger den inn med en iframe-snutt.
Fullstendig oppsett og bruk: se [publisering.md](publisering.md).

## Hvor ligger tingene mine?

- **Lagrede segmenter:** mappa `data/segments` (én fil per segment — ikke
  rediger dem for hånd).
- **Delte punkter:** `data/waypoints.json`.
- **Eksporterte GPX-filer og PNG-bilder:** der du velger i «Lagre
  som»-dialogen, ellers nettleserens nedlastingsmappe.

## Hvis noe ikke virker

| Problem | Løsning |
|---|---|
| Dobbeltklikk på `KUL.bat` gjør ingenting | Åpne mappa i Filutforsker, høyreklikk `KUL.bat` → «Kjør som administrator» og se hva feilmeldingen sier |
| «Fant ikke Python» | Installer Python fra python.org (se [INSTALLASJON.md](INSTALLASJON.md)) |
| Nettleseren viser feil rett etter oppstart | Vent et par sekunder og trykk F5 |
| Kartet er tomt etter innlasting | GPX-fila inneholdt ingen sporpunkter — sjekk fila i et annet verktøy |
| Kartunderlaget vises ikke | Kartflisene hentes fra Kartverket via internett — sjekk nettforbindelsen |
| Høydeprofilen sier «Ingen høydedata» | Sporet mangler høyde på alle punktene — vanlig for manuelt tegnede ruter |
| En eksportert fil virker rar | Kjør `python scripts\check_gpx.py "sti-til-fila.gpx"` fra det svarte vinduet for en hurtigsjekk |
