# Versjon 4.1.0 — Opptaksmanus

*7. august 2026*

## Hva er nytt

I 4.0.0 spilte du inn videoen ved å *kjøre* flyoveren: det du gjorde med
kameraet underveis ble det du fikk. Det fungerer, men det er vanskelig å
treffe presist, og umulig å gjenta.

**Opptaksmanuset** snur på dette. Du bestemmer på forhånd hvor kameraet
skal stå, hva som skjer ved hvert sjekkpunkt, og hvordan videoen skal
begynne og slutte. Så trykker du på opptak og lar den gå. Manuset lagres
sammen med løypa, så du kan justere en detalj og ta opp på nytt.

I tillegg lages videoen nå i **to størrelser** og kan lages på **begge
språk** i samme runde.

## Slik kommer du i gang

1. Åpne **▶ Flyover** som før.
2. Trykk **⏺ Ta opp** — panelet **Opptaksmanus** åpner seg langs høyre
   kant. (Du kan også åpne det når som helst med **⚙ Manus**.)
3. Sett opp det du vil ha i de fire fanene.
4. **▶ Forhåndsvis** kjører manuset i sanntid uten å lage video, så du ser
   hva du får.
5. **⏺ Start opptak** når du er fornøyd.

Under forhåndsvisningen:

- **Mellomrom** (eller et klikk på kartet) setter på pause. Pausen er et
  fryst bilde — ingenting fortsetter å gli.
- **Framgangslinja** og **piltastene** spoler fritt fram og tilbake. Stopp
  du har passert regnes som tatt, så du kan hoppe rett til den overgangen
  du vil se på.
- **↺** kjører manuset om igjen fra begynnelsen.
- **Esc**, eller knappen som nå står som «⏹ Stopp forhåndsvisning»,
  avslutter og legger løypa tilbake på start med kameraet slik du hadde
  det før.

Panelet er en skuff og ikke en dialog med vilje: du kan dra i kameraet på
kartet ved siden av mens panelet står åpent, og hente stillingen inn i et
kamerapunkt med ett klikk.

## Fanen «Kamera»

Et **kamerapunkt** er et sted i løypa med en bestemt kamerastilling.
Mellom punktene glir kameraet — og farten — mykt fra den ene innstillingen
til den neste. Har du ingen kamerapunkter, oppfører flyoveren seg akkurat
som i 4.0.0.

Slik lager du ett: still kameraet slik du vil ha det (dra for å svinge og
vippe, rull for å zoome), spol til stedet, og trykk **＋ Legg til her,
slik kameraet står nå**.

Punktene vises tre steder samtidig, så du alltid vet hvor de er:

- **Som nummererte merker på kartet.** Klikk på et merke for å redigere
  punktet, eller **dra det** for å flytte det — det festes til nærmeste
  sted på traseen når du slipper. Merkene vises bare mens manuspanelet er
  åpent.
- **På en tidslinje** øverst i Kamera-fanen, som viser hvor i løypa de
  ligger i forhold til hverandre.
- **Som en liste**, der bare det valgte punktet er utfoldet. Hver rad
  viser km, vinkel, retning, zoom og fart i kortform.

For hvert punkt kan du sette:

| Innstilling | Hva den gjør |
| --- | --- |
| **Vinkel over horisonten** | 15° (nesten rett ovenfra) til 80° (nesten i bakkeplan) |
| **Retning** | **Følg løypa** med en forskyvning (−180° til +180°), eller en **fast himmelretning** |
| **Zoom** | Fra hele landsdelen til stinivå — vist som «≈ 12 km bredt», ikke som et zoomtall |
| **Fart langs løypa** | 0× (full stopp) til 8× |
| **Overgang inn hit** | Hvor lang, og hvor den ligger i forhold til punktet |

### Retning: løypa eller himmelretning

**Følg løypa** er det vanlige: kameraet ligger bak løperen og svinger med
løypa. Forskyvningen lar deg legge det ut til siden — +90° gir et
sidebilde av løperen, 180° gir et bilde bakfra.

**Fast himmelretning** låser kameraet mot et kompasspunkt uansett hvor
løypa svinger. Det kler et parti der utsikten mot noe bestemt er poenget.

Går du fra det ene til det andre mellom to punkter, gjøres begge om til
faktiske kompasskurser før overgangen — den blir myk, ikke et hopp.

### Terrenget og kameravinkelen

Kameraet heves ved å **senke** vinkelen. Flyoveren gjør det av seg selv når
kameraet ellers ville havnet under bakken, og — hvis du vil — også når en
kolle kommer mellom det og løperen. Det betyr at en bratt vinkel du har bedt
om (mot 80°) kan bli dempet et hakk i kupert terreng.

Øverst i Kamera-fanen velger du derfor hva som skal gjelde for hele manuset:

| Valg | Hva som skjer |
| --- | --- |
| **Hold løperen synlig** | Som før: hev kameraet både over bakken og over koller i veien |
| **Bare unngå bakken** | Hev bare når kameraet ellers havner under terrenget |
| **Følg vinkelen nøyaktig** | Vinklene dine brukes akkurat som satt |

Med det siste valget står du fritt, men også fritt til å filme fra innsiden
av et fjell — bruk det når du vet at kameraet har luft rundt seg.

### Fart null = full stopp

Setter du farten til 0 på et kamerapunkt, bremser turen mykt ned på vei
inn og blir stående så lenge du har bedt om. Deretter setter den i gang
igjen mot neste kamerapunkt.

### Overganger

En overgang endrer **alt** som er satt på punktet: kameravinkel, retning,
zoom **og fart**. En oppgang fra 0,5× til 2,5× skjer altså gradvis over
overgangsstrekket, ikke som et rykk.

Lengden på en overgang kan måles på tre måter:

- **Rolighet** — som andel av strekket som er ledig: *Svært rolig* bruker
  hele strekket, *Normal* halve, *Øyeblikkelig* ingenting (rent klipp).
- **Sekunder** — regnes om til strekning ut fra farten der.
- **Kilometer** — den nøyaktige strekningen.

Og den kan ligge **før punktet** (ferdig i det du er der), **halvparten
før og halvparten etter**, eller **starte i punktet**.

Et kamerapunkt eier strekket fra punktet før til punktet etter — lenger
enn det rekker en overgang aldri. Vil to overganger bruke det samme
strekket, deles det på midten, så begge beholder en overgang. Du kan
altså sette «svært rolig» overalt uten at noe kolliderer.

Under hvert punkt står det **hva overgangen faktisk ble**: «Går fra
1,20 km til 3,40 km — 2,20 km, omtrent 18 sekunder video.» Ser du
«Blir et rent klipp», er punktene for tett på hverandre til at det er
plass til en overgang — flytt et av dem, eller gjør naboens overgang
kortere.

## Fanen «Sjekkpunkter»

For hvert interessepunkt i løypa, uavhengig av hverandre:

- **Vis markøren på kartet** — og i så fall hvor langt unna den skal dukke
  opp (standard 6 km) og hvor den er helt tydelig (standard 3 km). Mellom
  de to avstandene tones den gradvis inn, i stedet for å blinke fram.
- **Ta en 360 rundt punktet** — med egen kameravinkel og rundetid for
  akkurat dette punktet.
- **Stopp og vis detaljkortet** — samme kort deltakerne får når de klikker
  på punktet, med tjenester, beskrivelse, distanse og høydemeter. Du velger
  hvor lenge det skal stå (1–15 sekunder).

Regelen om at bare **det neste** punktet vises, står ved lag. Punkter du
har skjult teller ikke med i den regningen — de hoppes rett og slett over,
så det neste *synlige* punktet vises i stedet.

Har løypa selv skjult ikonet for et punkt, står det fast: manuset kan
skjule et synlig punkt, men ikke vise fram et løypa har gjemt bort.

## Fanen «Start & slutt»

Tre ting som virker uavhengig av hverandre, både i begynnelsen og slutten:

**Plakat** med løypenavn, en undertekst du skriver selv (f.eks. «Neste
løp: 7. august 2027 · mmctrail.no») og lengde/høydemeter hentet fra løypa.
Plakaten er halvgjennomsiktig med en tonet bunn og skygge under teksten,
så løypa synes bak den samtidig som teksten er lesbar over hva som helst.
Tittelen fylles ut med løypenavnet når du slår på plakaten, og kan så
redigeres. Sluttplakaten har en **⧉ Kopier plakaten fra start**-knapp som
henter tittel, undertekst og varighet, slik at du bare trenger å endre det
som skal være annerledes.

**Ventetid** før løypa starter / etter mål. Er plakaten satt til å stå
lenger enn ventetiden, ruller løypa i gang mens plakaten fortsatt ligger
over bildet. Motsatt vei: står plakaten lenger enn ventetiden etter mål,
venter videoen til plakaten er ferdig før den slutter.

**Oversiktsbilde** av hele traseen. Ved start begynner kameraet der og
glir ned til løypa; ved slutt trekker det seg ut dit etter mål. Bildet
dreier rolig, så det ikke ser ut som om videoen har frosset.

## Fanen «Språk & video»

### Oppløsning følger vinduet

Videoen kan ikke bli skarpere enn kartflaten den spilles inn fra. Panelet
viser derfor hvor mange piksler flaten faktisk er akkurat nå, og advarer
hvis den er under 1920 px bred. Vil du ha ordentlig full HD, gjør vinduet
større (eller trykk F11) **før** du starter opptaket.

Merk at det er *faktiske* piksler som teller: på en skjerm med høy
oppløsning gir et vindu på 1280 CSS-piksler ofte 2560 faktiske. Tallet i
panelet er det som gjelder.

### Nettversjon i tillegg

En vanlig MP4 tilpasser seg **ikke** avspilleren. Er fila 1080p, lastes
hele 1080p-fila ned selv om videoen vises i en liten iframe på en mobil.

Derfor lages det nå to filer i samme opptak: hovedfila og en nedskalert
**nettversjon** (standard 1280 px). Kartet tegnes bare én gang og kopieres
inn i begge, så det koster lite ekstra tid. Ved publisering legges begge
ut, og videosiden velger den minste som er stor nok for skjermen den vises
på.

Vil du bare ha én fil, kan nettversjonen slås av.

### Norsk og engelsk i samme opptak

Øverst i fanen står **🌐 Språk i videoen** med en avkryssing for hvert
språk. Kartbildet er det samme uansett språk — det er bare teksten i bildet
som er ulik. Derfor kan begge språkene spilles inn samtidig: du får to
ferdige videoer i biblioteket, én per språk, av nøyaktig samme
gjennomkjøring. De publiseres hver for seg.

Den engelske teksten kommer fra tre steder:

- **Punktnavn og beskrivelser** — oversettelsene du har lagt inn på
  interessepunktene i løypa.
- **Plakatene** — de engelske feltene under «Start & slutt», som dukker opp
  så snart engelsk er huket av.
- **Faste ord** — Distanse, Høyde, Høydemeter, Neste, Mål og resten
  oversettes av seg selv.

Mangler en oversettelse, brukes den norske teksten.

Med begge språk og nettversjon på blir det fire filer i ett opptak.

## Andre endringer

- **Zoom langt ut:** nedre grense er senket fra zoomnivå 11 til 3, så en
  video kan begynne med å vise hele landsdelen og zoome inn på løypa.
  Gjelder også når du drar i kameraet manuelt.
- **Videobiblioteket** viser nå oppløsning og hvilke utgaver som finnes,
  og har to knapper: **▶** spiller av videoen i egen fane, **⤓** laster ned
  fila. Tidligere lastet ▶ ned videoen i stedet for å spille den av — det
  var serveren som sendte fila som vedlegg.

## For de som lurer på hvordan

Manuset lagres som `data/manus/<segment-id>.json`, ved siden av segmentene
og punktbiblioteket. Det ligger for seg selv og ikke inne i segmentfila,
fordi segmentfilene inneholder alle sporpunktene og skrives om ved hver
minste redigering — et manus skal kunne endres uten å røre punktene.

Manus er bare tilgjengelig for løyper som er **lagret som segment**. Et
spor du nettopp har lastet inn fra en GPX-fil har ingen id å henge
manuset på; da virker panelet som før, men «Lagre manus» er borte.

Selve opptaket er fortsatt bilde-for-bilde med eksakte tidsstempler
(WebCodecs, H.264), slik det ble i 4.0.0. Det nye er at *tida* i videoen
nå styres av en tidslinje med faser og opphold, i stedet for bare å følge
løperen fra start til mål.
