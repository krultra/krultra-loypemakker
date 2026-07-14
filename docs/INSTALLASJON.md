# Installasjon — KrUltra Løypemakker (KUL)

Denne guiden er skrevet for deg som **ikke** er så vant med teknikk. Du
trenger ikke kunne noe om programmering. Følg stegene i rekkefølge, så er
du i gang på noen få minutter.

> Du gjør dette **én gang**. Etterpå starter du verktøyet ved å
> dobbeltklikke `KUL.bat` (se nederst).

<!-- Tips til vedlikeholder: legg gjerne inn skjermbilder der det står
     «Skjermbilde: …» under. Bruk f.eks.  ![](bilder/steg2.png) -->

---

## Steg 1: Installer Python (gratis)

Python er «motoren» verktøyet kjører på. Det er gratis og trygt.

1. Gå til **[python.org/downloads](https://www.python.org/downloads/)** i
   nettleseren.
2. Klikk den store gule knappen **«Download Python»** (versjonsnummeret
   spiller ingen rolle så lenge det er 3.9 eller nyere).
3. Åpne fila som lastes ned (den heter noe som `python-3.x.x.exe`).
4. **VIKTIG:** helt nederst i installasjonsvinduet, huk av
   **«Add python.exe to PATH»** *før* du klikker videre. Dette er det
   eneste du må huske på.
5. Klikk **«Install Now»** og vent til det står «Setup was successful».
   Lukk vinduet.

<!-- Skjermbilde: installasjonsvinduet med «Add python.exe to PATH» avhuket -->

> Har du Python fra før? Da kan du hoppe over dette steget.

---

## Steg 2: Last ned KrUltra Løypemakker

1. Gå til prosjektets side på GitHub.
2. Klikk den grønne knappen **«Code»**, og velg **«Download ZIP»**.
3. Finn ZIP-fila i nedlastingsmappa, **høyreklikk** den og velg
   **«Pakk ut alle»** (Extract All). Velg en mappe du finner igjen, for
   eksempel `Dokumenter`.

<!-- Skjermbilde: den grønne «Code»-knappen med «Download ZIP» -->

Nå har du en mappe som heter `krultra-loypemakker` (eller lignende) med
alle filene i.

---

## Steg 3: Start verktøyet

1. Åpne mappa du pakket ut.
2. Dobbeltklikk fila **`KUL.bat`**.
3. Et **svart vindu** åpner seg. Første gang tar det et par minutter —
   verktøyet henter automatisk det det trenger. La vinduet være åpent.
4. Nettleseren åpner seg av seg selv på verktøyet. Skjer det ikke, skriv
   inn **`http://127.0.0.1:8000`** i nettleseren.

<!-- Skjermbilde: KUL.bat i mappa, og det svarte vinduet -->

> **Ser du en advarsel fra Windows** («Windows beskyttet PC-en din»)?
> Det er fordi fila er ny og ukjent for Windows, ikke fordi noe er galt.
> Klikk **«Mer info»** og deretter **«Kjør likevel»**.

Det var alt! Verktøyet kjører nå lokalt på din egen PC. Ingen data sendes
ut på nett — alt bor på maskinen din.

---

## Hver gang senere

- **Start:** dobbeltklikk `KUL.bat`. (Nå går det fort — nedlastingen i
  steg 3 skjer bare første gang.)
- **Avslutt:** lukk det svarte vinduet.

Tips: høyreklikk `KUL.bat` → **«Send til» → «Skrivebord (opprett
snarvei)»**, så har du en snarvei på skrivebordet du kan starte fra.

---

## Hvis noe ikke virker

| Problem | Løsning |
|---|---|
| «Fant ikke Python på denne maskinen» | Python er ikke installert, eller «Add to PATH» ble ikke huket av i steg 1. Installer på nytt og husk avhukingen. |
| Det svarte vinduet lukker seg med en gang | Start på nytt og les hva som står før det lukkes — som regel handler det om Python (se over). |
| Nettleseren viser en feil rett etter oppstart | Vent noen sekunder og trykk **F5** (oppdater). Appen rakk ikke å starte helt. |
| «Windows beskyttet PC-en din» | Klikk «Mer info» → «Kjør likevel» (se over). |

Trenger du mer hjelp? Se [BRUK.md](BRUK.md) for hvordan du bruker
verktøyet, eller ta kontakt med KrUltra.
