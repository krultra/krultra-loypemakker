# Versjon 12 — ikon-wrapping, flere matvalg og tettere profil-etiketter

Bygger på [versjon-11.md](versjon-11.md). Implementert og verifisert 10. juli 2026.

## Rotårsak til det store tomrommet under profilen

MMC 70K sitt «Mål»-punkt har **åtte ikoner**. De ble tegnet på én lang
45°-diagonal, som presset canvas-høyden ned med ~160 px — og siden
høyden styres av den *lengste* etiketten, ble det mye hvitt under alle de
korte etikettene (som «Start»). Wrapping løser dette ved roten.

## Endringer

1. **Ikon-wrapping.** Kartrammen wrapper til ny rad etter tre ikoner
   (`WPT_MAKS_PER_RAD_KART = 3`), høydeprofilen etter fire
   (`WPT_MAKS_PER_RAD_PROFIL = 4`). «Mål» med åtte ikoner blir 3+3+2 i
   kartrammen og 4+4 i profilen. Ekstrahøyden under profilen falt fra
   ~160 px til ~109 px. Speiles i PNG-eksporten.

2. **Egen fargevelger for veipunkt-markøren i profilen.** `profilState.punktFarge`
   (kontroll ved siden av «Punkter»-avkryssingen). Kartets «Punktstrek» styrer
   nå kun kartet. Verifisert uavhengige: grønn i profilen, blå på kartet.

3. **Nye symboler.** «Mat» er delt i **Snacks** (🍫), **Mat** (🍴) og
   **Varm mat** (🍲), og **Dusj** (🚿) er lagt til. GPX-symboler:
   `Convenience Store`, `Restaurant`, `Restaurant`, `Shower`.
   `mat` står før `varmmat` i tabellen, så eldre punkter med GPX-symbolet
   «Restaurant» fortsatt leses som `mat`.

4. **Fast ikon-rekkefølge.** Start/mål → sjekkpunkt → drikke → snacks →
   mat → varm mat → resten. Rekkefølgen er selve nøkkelrekkefølgen i
   `WPT_SYMBOLER`; `sorterTyper()` sorterer etter den overalt (kart,
   profil, PNG, GPX-eksport og dialogen).

5. **Dynamisk høyremarg i profilen.** Høyremargen beregnes fra den faktiske
   bredden til etikettene (målt tekst + ikonrader), så målgangens navn og
   ikoner aldri kuttes — men uten unødig tomrom når etiketten er kort.
   Beregningen itererer et par runder siden `plotB` avhenger av margen.

## Verifisert (1600×900, MMC 70K med 18 veipunkter)

- 38 automatiske tester passerer
- Pikselmåling av profil-canvas: innhold slutter 7 px fra høyre kant og
  8 px fra bunnen — ingen kutting, intet unødig tomrom
- Kartramme for «Mål» (8 ikoner) → rader [3, 3, 2]
- `sorterTyper` gir riktig rekkefølge; dialogen viser alle 13 symboler
- Profilfarge grønn ⇒ 1179 grønne piksler, 0 blå (kartets farge lekker ikke)
- Ingen konsollfeil

`index.html` refererer nå `?v=11` for å bryte nettleser-cache.
