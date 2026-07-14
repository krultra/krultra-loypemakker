# Publisere interaktive løypevisninger på nettsidene

KrUltra Løypemakker kan publisere en **interaktiv løypevisning** (kart +
høydeprofil + klikkbare punkter + markør med distanse-/høydedata) som
bygges inn på nettsider med en liten iframe-snutt. Republiserer du en
løype med samme adressenavn, oppdateres nettsidene automatisk.

## Slik virker det

```
Løypemakker (PC)                Raspberry Pi                nettsidene
«Publiser»-knapp  ──SFTP──►  /var/www/loyper/  ◄──iframe──  mmctrail.no (Drupal)
                              ├─ assets/v1/                  krultra.no (Node/Strapi)
                              └─ mmc-70k/
                                  ├─ index.html   (liten, endres aldri)
                                  └─ course.json  (løypedataene — overskrives
                                                    ved republisering)
```

Kartfliser hentes rett fra Kartverket/Esri i besøkerens nettleser — det
trengs ingen serverprogramvare på Pi-en, bare statiske filer.

## Engangsoppsett

### 1. På Raspberry Pi-en

Lag mappa som skal inneholde løypene, og gi SFTP-brukeren din skrivetilgang:

```bash
sudo mkdir -p /var/www/loyper
sudo chown <din-bruker>:<din-bruker> /var/www/loyper
```

Pek webserveren på mappa. **Med nginx** (anbefalt — legg i server-blokken
for f.eks. `loyper.krultra.no`, med HTTPS via certbot som ellers):

```nginx
server {
    server_name loyper.krultra.no;
    root /var/www/loyper;

    # course.json skal alltid revalideres, så republiseringer vises straks
    location ~ \.json$ { add_header Cache-Control "no-cache"; }
    # Viewer-assets er versjonerte og kan caches lenge
    location /assets/ { add_header Cache-Control "public, max-age=604800"; }
}
```

**Alternativ uten nginx** (hvis Node-frontenden er eneste webserver):
legg til en statisk rute i Node-appen, f.eks. med Express:
`app.use('/loyper', express.static('/var/www/loyper'))` — da blir adressen
`https://krultra.no/loyper/<slug>/`.

> HTTPS er påkrevd: en HTTPS-side (som mmctrail.no) kan ikke bygge inn en
> iframe som serveres over ren HTTP.

### 2. På PC-en: `data/publisering.json`

Fila opprettes med en mal første gang du åpner publiseringsdialogen (eller
starter serveren og kaller publisering). Fyll inn:

```json
{
  "mål": [
    { "navn": "lokal-test", "type": "mappe",
      "mappe": "data/publisert", "baseUrl": "" },
    { "navn": "min-server", "type": "sftp",
      "host": "loyper.eksempel.no", "port": 22, "bruker": "brukernavn",
      "nøkkelfil": "C:/Users/<ditt-brukernavn>/.ssh/id_ed25519",
      "fjernmappe": "/var/www/loyper",
      "baseUrl": "https://loyper.eksempel.no" }
  ]
}
```

- Bruk helst `nøkkelfil` (SSH-nøkkel) i stedet for `passord`.
- **Flere servere i én operasjon (failover):** lag et mål med
  `"type": "gruppe"` og lista `"medlemmer"` med navnene på målene som
  skal få samme innhold, f.eks. prod- og failover-Pi:

  ```json
  { "navn": "krultra (prod + failover)", "type": "gruppe",
    "medlemmer": ["krultra-prod (pi-amk)", "krultra-failover (pi-tok)"],
    "baseUrl": "https://loyper.krultra.no" }
  ```

  Velg gruppa i publiseringsdialogen, så publiseres det til alle
  medlemmene. Feiler ett av målene (f.eks. failover-Pi-en er avslått),
  fullføres de andre, og dialogen viser en advarsel om hvilket mål som
  feilet — publiser på nytt når serveren er oppe igjen.
- `lokal-test`-målet skriver til en mappe på PC-en, og verktøyet serverer
  den selv på `http://127.0.0.1:8000/publisert/<slug>/` — klikk lenken i
  publiseringsdialogen for å se resultatet (verktøyet må kjøre).
  **Viktig:** ikke åpne `index.html` direkte fra mappa — nettlesere nekter
  å laste løypedataene fra `file://`-sider, så da vises ingenting.
  Visningen må alltid nås via en http-adresse.
- Fila ligger kun lokalt på din PC.

### 3. På nettsidene (én gang per løypeside)

Publiseringsdialogen gir deg en ferdig snutt, f.eks.:

```html
<iframe src="https://loyper.krultra.no/mmc-70k/"
        style="width:100%;height:640px;height:min(85vh,820px);border:0"
        loading="lazy" title="Løypekart MMC 70K"></iframe>
```

Høyden tilpasser seg skjermen (opptil 820 px på store, 85 % av vinduet
på små; 640 px-linja er reserve for eldre nettlesere). Innebygde
visninger har egen fullskjerm-knapp og mobilvennlig navigasjon (én
finger scroller siden, to fingre flytter kartet).

- **Drupal (mmctrail.no):** rediger siden, bytt tekstformat til
  *Full HTML*, og lim inn snutten der kartet skal stå. (Formatet
  «Basic HTML» stripper iframes.)
- **krultra.no (Node/Strapi):** lim snutten inn i rikteksfeltet i Strapi
  (må tillate iframe), eller legg den i en komponent i frontenden.

Juster gjerne `height` etter smak (640 px passer de fleste).

## Daglig bruk

1. Åpne segmentet i løypeverktøyet, gjør endringer (utsnitt, veipunkter,
   farger — alt du ser er det som publiseres).
2. Klikk **«🌐 Publiser løypevisning…»**, velg mål, behold samme
   **adressenavn** som sist (f.eks. `mmc-70k`) og klikk Publiser.
3. Ferdig — nettsidene viser den nye versjonen ved neste sidelast.
   (Bruk et nytt adressenavn hvis det skal bli en ny, separat løypeside.)

> Når selve visningskoden er forbedret (ny «asset-versjon»), tas den i
> bruk ved første republisering av hver løype — publiser løypa på nytt
> med samme adressenavn, så oppgraderes den automatisk.

## Feilsøking

| Problem | Løsning |
|---|---|
| «SFTP: feil brukernavn/passord/nøkkel» | Sjekk `data/publisering.json`; test påloggingen med WinSCP/`ssh` |
| «SFTP: fikk ikke kontakt» | Er Pi-en på nett? Riktig host/port? Brannmur? |
| Iframen er tom på nettsiden | Åpne iframe-adressen direkte i nettleseren — virker den der, er det tekstformatet i CMS-et som stripper iframes |
| Gammel versjon vises | Hard-oppdater (Ctrl+F5); sjekk at nginx har `no-cache` på .json (se over) |
| Kartet mangler, profilen vises | Kartverkets flisetjeneste er nede eller blokkert — prøv igjen senere |
