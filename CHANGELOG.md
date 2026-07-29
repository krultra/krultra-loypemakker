# Endringslogg

Alle vesentlige endringer i KrUltra Løypemakker (KUL). Detaljerte notater
for hver versjon ligger i [`docs/`](docs/).

## Versjonering

Fra og med **2.0.0** følger prosjektet
[semantisk versjonering](https://semver.org/lang/nb-NO/) (MAJOR.MINOR.PATCH):

- **MAJOR** (f.eks. 2.0.0 → 3.0.0) — store nye hovedfunksjoner eller endringer
  som kan kreve at du gjør noe (f.eks. starter appen på nytt, endrer oppsett).
- **MINOR** (f.eks. 2.0.0 → 2.1.0) — nye funksjoner som bygger videre uten å
  bryte noe eksisterende.
- **PATCH** (f.eks. 2.0.0 → 2.0.1) — feilrettinger og småjusteringer.

Versjonene før 2.0.0 (under **Utviklingshistorikk** nedenfor) ble kalt
«v2»–«v19» underveis i utviklingen og fulgte ikke dette skjemaet.

## 2.12.0 — 29. juli 2026

Opprydding i punkt- og kontaktbiblioteket.

- **Rettet filtreringen:** filteret er nå et **ELLER** — et punkt/en kontakt
  vises hvis den brukes i minst ett av de avkryssede kartene, eller i et kart
  som ligger i en av de avkryssede gruppene. Før måtte begge deler stemme, så
  lista ble tom hvis du fjernet alle gruppene selv om alle løypene var med.
- **Én samlet filtermeny** («Filtrering») i stedet for to: gruppene i én bolk
  øverst, løypene/arenakartene i én bolk under.
- **Ny delt kontakt** kan opprettes rett fra kontaktbiblioteket med **«+ Ny»**,
  uten å knytte den til et arenakart først.
- **Kompakte lister:** antallet står nå i parentes bak navnet — «Guddingsvika
  (4)» — i stedet for en egen «Brukes i …»-linje (full liste i tooltip og i
  «Endre»-dialogen). Knappen heter **«Endre»**, og punktikonene er tatt bort
  for å spare plass.
- **Kontaktkortene** viser tittel på første linje i full bredde, og navn med
  knappene på neste. Ingen bindestrek mellom tittel og navn.
- **Sortering:** punktlista er alltid alfabetisk; for kontaktlista velger du
  selv mellom **tittel** (standard) og **navn**.
- Punktbiblioteket og arenakartbiblioteket har byttet plass i venstre stolpe.

## 2.11.0 — 29. juli 2026

**Delte kontakter** (fase 2) og videre opprydding i venstre stolpe.

- **Kontaktbibliotek:** kontakter kan nå **deles på tvers av arenakart**, slik
  delte punkter deles på tvers av løyper. Samme arrangement har gjerne flere
  arenakart med de samme kontaktene (løpsleder, sekretariat, sikkerhetsvakt) —
  nå legges de inn én gang.
  - Kryss av **«Delt kontakt»** i kontaktdialogen for å legge den i biblioteket.
  - **«🔗 Hent delt kontakt…»** i kontaktlista henter inn en kontakt fra
    biblioteket. Delte kontakter er merket med 🔗.
  - Endrer du en delt kontakt i ett arenakart, slår endringen inn i de andre
    ved neste åpning. Sletter du den fra biblioteket, beholder arenakartene
    egne, frittstående kopier.
  - Nytt **Kontaktbibliotek** i venstre stolpe med samme filtrering som
    punktbiblioteket.
- **Bedre filtrering i punkt- og kontaktbiblioteket:** «Grupper» og «Løyper»
  (henholdsvis «Arenakart») er nå **avkryssingslister** der du kan velge flere
  samtidig, med «Velg / fjern alle» øverst.
- **Ryddigere lister:** hver rad viser nå **«Brukes i N segmenter»** (antall) i
  stedet for hele lista. Full liste vises i **«Vis/Endre»**-dialogen, nederst.
- **Bibliotekene følger modusen:** «Rediger segment» åpner segment- og
  punktbiblioteket, «Slå sammen segmenter» kun segmentbiblioteket, og «Rediger
  arenakart» åpner arenakart- og kontaktbiblioteket. Resten slås sammen.

## 2.10.0 — 29. juli 2026

Videre GUI-opprydding (fase 1, del 2) — tydeligere modusknapper, ryddigere
venstre stolpe og mer kontroll over PNG-eksporten.

- **Modusknappene viser hva som redigeres:** «Rediger segment (MMC 50K)», «Slå
  sammen segmenter (A: …, B: …)» og «Rediger arenakart (Teveltunet)». Tre
  tydelige tilstander: **aktiv** (hvit på blå), **tatt i bruk men ikke aktiv**
  (blå ramme) og **ubrukt** (grå).
- **Venstre stolpe rydder seg selv:** ved oppstart er alle bibliotekene
  sammenslått, og grupper er sammenslått til du åpner dem. Bytter du til en
  segment-modus, ekspanderes segmentbiblioteket og arenakartbiblioteket slås
  sammen (og motsatt for arenakart-modus) — gruppenes åpne/lukket-tilstand
  huskes per bibliotek.
- **Punktbibliotek i venstre stolpe med filter:** de delte punktene ligger nå i
  en egen seksjon (ikke en dialog), med **filter på bruk** — vis punkter brukt i
  en bestemt **løype**, eller i alle løyper i en bestemt **segmentgruppe**.
- **PNG-eksport med valgbart detaljnivå:** «Kart som PNG» åpner nå en dialog der
  du velger zoom/oppløsning (opp til kartkildens maks) — for et utsnitt kan du
  få vesentlig høyere oppløsning enn skjermen viser.
- **«Visning:»-ledetekst** foran kart/delt/profil-vekseren.

## 2.9.0 — 29. juli 2026

Opprydding i brukergrensesnittet (fase 1) — ryddigere toppbanner, arenakart i
venstre stolpe, og flere småforbedringer.

- **Arenakartbibliotek i venstre stolpe:** arenakartene har nå sitt eget
  bibliotek med **gruppering og dra-og-slipp**, akkurat som segmentene — med
  **Åpne / Endre / Slett** på hvert kort. «Åpne…»-dialogen i arena-verktøylinja
  er dermed borte. Bibliotek-seksjonene kan slås sammen for å spare plass.
- **Toppbanneret er rendyrket til en modusveksler:** «Rediger segment», «Slå
  sammen segmenter» og «Rediger arenakart». En **aktiv-indikator** viser hvilket
  segment og hvilket arenakart som er åpent (0–1 av hver samtidig).
  - **«Kart»-knappen** er flyttet inn i **Kartvisning**-nedtrekket som valget
    «Skjul kart».
  - **«Bare kart / Delt / Bare profil»** er flyttet til en kompakt ikonveksler
    ytterst i kartverktøylinja.
- **Rediger delte punkter direkte** fra punktbiblioteket (ikke bare se og
  slette). Endringen slår inn i alle løyper som bruker punktet ved neste åpning.
- **Rettet:** PNG-eksport av kartet viste «&copy; Kartverket» — nå «© Kartverket».
- Hurtigvalgene «Svart/hvitt» og «Rød fylt» for høydeprofilen er fjernet
  (erstattes senere av egne, lagrbare oppsett).

## 2.8.0 — 28. juli 2026

- **Områdestil i arenakart:** hvert område kan nå styres individuelt.
  - **Fyllfarge av/på:** slå av fyllet for et helt **gjennomsiktig** område
    (bakgrunnskartet vises gjennom) — området kan fortsatt klikkes.
  - **Konturlinje av/på**, med valgfri **egen konturfarge**. Uten egen farge
    brukes områdefargen (uten gjennomsiktighet), som før.
- **Rettet:** åpner du et arenakart fra et løypepunkt, bevares nå **språkvalget**
  — en visning åpnet med `?lang=en` åpner arenakartet på engelsk (før falt det
  tilbake til arenaens standardspråk).
- **Rettet:** de **engelske oversettelsene** av løypas tittel og beskrivelse
  huskes nå på sporet, så en ny publisering (og `.loype`-fila til KrUltra)
  beholder dem — publiseringsdialogen fylte dem ikke ut på nytt før, og kunne
  vise en annen løypes engelske tekst.

## 2.7.0 — 28. juli 2026

- **Lenke fra arenakart til arenakart:** et område eller punkt kan nå gjøres om
  til en **lenke til et annet arenakart**. Klikker sluttbrukeren på stedet,
  hopper visningen til det andre kartet (med språket bevart) — nyttig for å la
  et oversiktskart ramme inn et mindre område som fører til et **detaljkart**.
  - I sted-dialogen: nytt felt **«Lenke til annet arenakart»** (bruk «‹arena›»
    for et kart under samme løype, eller «‹løype›/‹arena›»).
  - Lenkede steder vises med en **stiplet kant** og en **→** i lista.

## 2.6.2 — 28. juli 2026

- **Rettet:** punkter ligger nå alltid **over** områder i arenakart (eget
  kartlag med høyere z-indeks), så et punkt som ligger oppå eller inni et
  område kan klikkes/redigeres — før «stjal» området klikket.

## 2.6.1 — 28. juli 2026

- **Rettet:** bakgrunnsbildet forsvant ved publisering av arenakart med bare
  **ett** bilde (publiseringen sendte «ingen bilder» i stedet for «alle»).
- **Rettet:** «Endre» på en kontakt i kontaktlista gjorde ingenting (en
  manglende felt-referanse stoppet dialogen fra å åpne).

## 2.6.0 — 28. juli 2026

- **Flerspråklig innhold i publiserte visninger:** i tillegg til fast GUI-tekst
  (2.5.0) kan nå også ditt eget innhold vises på engelsk — løype-/arenanavn og
  -beskrivelser, punktnavn og -beskrivelser, områder/punkter, typer, kontakter
  og bakgrunnskart-navn.
  - I KUL-verktøyet (fortsatt norsk GUI) er det lagt til **«(engelsk)»-felt**
    ved siden av tekstfeltene i punkt-, sted-, type-, kontakt- og bilde-
    dialogene, samt i publiseringsdialogene (tittel/beskrivelse).
  - Sluttbrukeren bytter språk med språkvelgeren; utfyller du ikke engelsk for
    et felt, vises den norske teksten (bakoverkompatibelt).
  - Engelsk innhold følger med **delte punkter** på tvers av løyper.
  - Arkitekturen lagrer oversettelser språk-agnostisk, så flere språk kan
    støttes senere.

## 2.5.0 — 28. juli 2026

- **Flerspråklige publiserte visninger (norsk + engelsk):** de publiserte
  løype- og arenakartene har nå all fast tekst (Distanse, Høyde, Steder,
  Kontakter, punkttyper, «Full skjerm» osv.) på både norsk og engelsk, med
  tall- og datoformat tilpasset språket.
  - **Språkvelger (NO/EN)** i visningen som leseren kan klikke.
  - **Standardspråk for innbygging** velges i publiseringsdialogen og legges
    inn som `?lang=` i iframe-snutten, så samme kart kan bygges inn med ulikt
    startspråk på ulike sider. Arkitekturen er språk-agnostisk (flere språk kan
    legges til senere).
  - **Bakoverkompatibelt:** publiserte kart uten språkangivelse vises på norsk.
  - (Dette gjelder foreløpig fast GUI-tekst. Oversettelse av eget innhold —
    navn og beskrivelser — kommer i neste steg. Selve KUL-verktøyet er fortsatt
    norsk.)

## 2.4.0 — 26. juli 2026

- **Flere bakgrunnsbilder (kartlag) i arenakart.** Du kan nå legge inn flere
  oversiktsbilder — f.eks. «Norgeskart», «Satellitt», «Flyfoto», «Topo» — som
  dekker samme område i samme målestokk. Inntegnede områder og punkter beholder
  sin plassering på alle bildene (det første bildet definerer målestokken).
  - **«Bakgrunnsbilder…»** i verktøylinja for å legge til, navngi og fjerne
    bilder, og en **bakgrunnsvelger** for å bytte hvilket du tegner på.
  - **Ved publisering** velger du hvilke bilder som skal være med (fra ingen til
    alle). Er det flere enn ett, får sluttbrukeren en **lagvelger** i det
    publiserte arenakartet og kan bytte mellom dem — som på vanlige kart.
  - **Per sted** kan du angi hvilke bakgrunnsbilder området/punktet skal vises
    på (alle, utvalgte, eller ingen). Lista over steder følger det aktive
    bildet.
  - **Lagvelgeren** i det publiserte kartet viser et lite miniatyrbilde av det
    aktive kartet med navn under (som på Norgeskart) — klikk åpner en liste med
    miniatyrer og navn å velge mellom.

## 2.3.0 — 25. juli 2026

- **Kontaktliste i arenakart.** Legg inn kontakter (f.eks. løpsleder,
  sikkerhetsansvarlig) med tittel, navn, telefon, e-post og beskrivelse — og
  valgfritt **gyldig fra/til**, så en kontakt bare vises i det angitte
  tidsrommet.
  - Kontakter kan **knyttes til ett eller flere steder** (områder/punkter).
    Én kontakt kan gjelde flere steder (f.eks. løpslederen på «Løpsledelse»,
    «Sikkerhetsledelse» og «Sekretariat»).
  - I den publiserte visningen får arenakartet en **egen «Kontakter»-fane**
    med en samlet liste over alle kontakter som er gyldige akkurat nå.
  - Når et sted markeres, vises **kontaktene knyttet til stedet** (tittel +
    «…»); klikk på en kontakt åpner et **kontaktkort** med all informasjon
    (telefon og e-post er klikkbare).
- **Arenakart innebygd (iframe):** stedslista åpnes nå automatisk bare på full
  skjermbredde — i smale innebygginger er den skjult som standard (kan alltid
  åpnes med «☰ Liste»). Innebygde arenakart har også fått en **«⛶ Full
  skjerm»**-knapp som åpner kartet i egen fane, slik løypekartene har.

## 2.2.0 — 25. juli 2026

- **Arenakart** — en helt ny, egen funksjon (fanen «🏟️ Arenakart»).
  Arrangører kan lage et interaktivt oversiktskart over et arenaområde
  (f.eks. Teveltunet for MMC):
  - **Last inn et bilde** (oversiktskart) som bakgrunn.
  - **Tegn områder** (polygoner) og **sett punkter**, og gi hvert av dem
    navn, beskrivelse og en **type med fargekode** (f.eks. «Servering» grønn,
    «Sanitær» blå). Områder/punkter kan flyttes ved å dra hjørnene.
  - **Publiser** arenakartet til en egen nettadresse på formen
    `loyper.krultra.no/‹løype›/‹arena›/`.
  - I den publiserte visningen highlightes steder **begge veier**: hold over
    eller klikk/trykk et område på kartet, eller klikk et navn i den
    scrollbare lista — det korresponderende stedet framheves og navnet vises.
- **Kobling fra løypepunkt:** et interessepunkt i en løype kan få en
  **«Arenakart-lenke»**. Bruk `‹løype›/‹arena›` (f.eks. `mmc/teveltunet`) for
  å peke til en arena publisert under en bestemt løype — da beholder et
  **delt punkt riktig lenke også når det gjenbrukes i andre løyper** (arena-
  lenken er nå et delt felt i punktbiblioteket). Bare `‹arena›` peker til en
  arena under samme løype som punktet publiseres i.
- **Bedre åpningsutsnitt i løypevisningen:** kartet zoomer ikke lenger så
  langt inn på svært korte løyper at kartflisene blir borte (hvit bakgrunn),
  og utsnittet tar nå med **alle løypepunkt-ikonene**, ikke bare selve
  traseen.
- **Arenakart-visningen:** beskrivelsen til et markert sted vises nå i sin
  helhet (ikke avkortet med «…»), og stedene kan **kollapses/ekspanderes per
  type** i lista (med egne **«Vis alle»/«Skjul alle»**-knapper) — nyttig når
  det er mange steder.
- **Publiseringsdialogen for arenakart** husker nå tittel og beskrivelse, så
  de foreslås på nytt neste gang samme arenakart publiseres.

## 2.1.0 — 14. juli 2026

- **Utjevning og Vektform: 5/5 er ny standard og anbefaling.** De to
  innstillingene er gruppert sammen i verktøylinja med en **(i)-knapp** som
  forklarer hva de gjør, advarer om at de påvirker beregnede høydemeter, og
  begrunner anbefalingen: 5/5 gir omtrent samme høydemeter som løpernes
  GPS-klokker, og felles innstillinger på tvers av arrangører gjør
  høydetallene sammenlignbare. Dialogen anbefaler også sterkt Kartverkets
  høydedata framfor GPX-filas egne høyder. (Har du selv lagret andre
  verdier fra før, beholdes de.)
- **Enklere «Send til KrUltra»-flyt:** løypefila lastes nå ned automatisk
  til Nedlastinger (ingen lagringsdialog), og e-postutkastet som åpnes har
  riktig mottaker, emne («Løype: ‹navn› - for publisering på
  loyper.krultra.no») og ferdig brødtekst med tydelig påminnelse om å legge
  ved fila. Se over, legg ved, send.

## 2.0.0 — 14. juli 2026 (første offentlige utgivelse)

Verktøyet er nå åpen kildekode under MIT-lisens, med nytt navn og logo.

- **«Send til KrUltra»**: arrangører uten egen server kan lage en `.loype`-fil
  (bærer punkter, veipunkter, stil og alle metadata) og sende den til KrUltra
  for publisering. Tilhørende **importfunksjon**.
- Produktnavn **KrUltra Løypemakker (KUL)**, oppstartsfil `KUL.bat`, logo og favicon.
- **MIT-lisens** — åpen kildekode, fri også kommersielt, med kreditering.
- «Creator» → «Laget av»; adressenavn som båret metadatafelt.
- XSS-herding av publisert visning; opplastingsgrense på GPX-parsing.
- Billedlagt installasjonsguide, bruksveiledning og HTML-versjoner av all dokumentasjon.
- [Detaljer](docs/versjon-19.md)

## Utviklingshistorikk (før 2.0.0)

Interne utviklingsversjoner fra prosjektets MVP fram til første offentlige
utgivelse. Numrene («v2»–«v19») var løpende tellere under utvikling, ikke
semantiske versjoner.

### v18 — Mobilvennlig publisert visning
- Én finger scroller siden, to fingre flytter kartet (i innebygde visninger).
- Knapper flyttet ut av kartet; høydeprofilen scroller horisontalt på smale skjermer.
- Smartere iframe-høyde. [Detaljer](docs/versjon-18.md)

### v17 — Husk metadata, veipunkter ved sammenslåing, fullskjerm
- Metadata (laget av, lenke, copyright, nøkkelord, starttid) huskes og foreslås.
- Interessepunkter følger med når segmenter slås sammen.
- «Vis i full skjerm»-knapp i publiserte visninger. [Detaljer](docs/versjon-17.md)

### v16 — Drop bag, bedre GPX-eksport, sikring av punktbibliotek
- Nytt symbol: Drop bag. Ett `<wpt>` per interessepunkt (ryddigere i Garmin).
- Automatisk sikkerhetskopi av punktbiblioteket. [Detaljer](docs/versjon-16.md)

### v15 — «Velg delte punkter» og snap
- Finn alle delte punkter langs løypa og velg mange på én gang.
- Fest punkter til løypa («snap») eller vis dem på eksakt posisjon. [Detaljer](docs/versjon-15.md)

### v14 — Punktbibliotek
- Delte, gjenbrukbare interessepunkter på tvers av løyper.
- Versjonsnummer i verktøyet; KrUltra-kreditering i publiserte visninger. [Detaljer](docs/versjon-14.md)

### v13 — Publisering av interaktive løypevisninger
- Kart + høydeprofil + klikkbare punkter + markør, innebygd på nettsider via iframe.
- Opplasting via SFTP, med failover-gruppe. [Detaljer](docs/versjon-13.md) · [publisering.md](docs/publisering.md)

### v12 — Ikon-wrapping, flere matvalg, tettere profil-etiketter
- Nye symboler (snacks, mat, varm mat, dusj); ikoner wrapper til flere rader. [Detaljer](docs/versjon-12.md)

### v11 — Visningsmodus
- Bare kart / delt / bare profil. [Detaljer](docs/versjon-11.md)

### v10 — Utdatert-server-varsel og cache-fiks
- Rødt banner når serveren kjører eldre kode; cache-busting. [Detaljer](docs/versjon-10.md)

### v9 — PoI-finpuss og profil-etiketter
- [Detaljer](docs/versjon-9.md)

### v8 — Ikonstørrelse og waypoints i høydeprofilen
- Individuell vis/skjul per punkt. [Detaljer](docs/versjon-8.md)

### v7 — Interessepunkter med ledestrek og flyttbar ramme
- [Detaljer](docs/versjon-7.md)

### v6 — Autorepeat, auto-lagring av punkter, flersymbol, zoom-skalering
- [Detaljer](docs/versjon-6.md)

### v5 — Profilfarger for trykk, høydemeter og gruppert bibliotek
- [Detaljer](docs/versjon-5.md)

### v4 — Interessepunkter, karteksport og flere kartvisninger
- Kartverkets høyder som standard. [Detaljer](docs/versjon-4.md)

### v3 — Riktige høyder, utjevning og starttidspunkt
- Terrenghøyder fra Kartverket; gaussisk utjevning av profilen. [Detaljer](docs/versjon-3.md)

### v2 — Kart, metadata, nærmeste punkt og høydeprofil
- Kartunderlag fra Kartverket; høydeprofil. [Detaljer](docs/versjon-2.md)

### MVP — Klippe, skjøte og eksportere GPX
- Kjernen: last inn GPX, klipp ut segmenter, slå sammen, eksporter ryddig
  GPX 1.1 med stigende tidsstempler. [Plan](docs/mvp-plan.md)
