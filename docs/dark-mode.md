# Fargetema i publiserte kart

Publiserte løypekart og arenakart følger nettleserens fargetema som standard.
Leseren kan velge **Automatisk tema**, **Lyst** eller **Mørkt** i toppen av
kartet. Valget legges i nettadressen, og beholdes ved språkbytte, åpning i
egen fane og navigering videre til et arenakart.

Når kartet bygges inn, kan nettsiden styre temaet med en URL-parameter:

- `?theme=dark` for mørkt tema.
- `?theme=light` for lyst tema.
- `?theme=auto` (eller ingen parameter) følger nettleserens preferanse.

Har adressen allerede en språkparameter, bruk for eksempel
`?lang=no&theme=dark`. I HTML-koden til en iframe skrives dette som
`?lang=no&amp;theme=dark`.

En nettside med egen temavelger kan sette `theme` i iframe-adressen når
nettsidens tema endres. Automatisk tema følger nettleserens preferanse;
KUL leser ikke CSS-klasser på nettsiden som bygger inn kartet.

Temaet gjelder rammeverket rundt kartet, popupvinduer, kontroller og
høydeprofil. Bakgrunnskart, satellittbilder, arenaillustrasjoner og
fargekodingen av løypa og arenaelementene beholder originalfargene.

Eksisterende løypekart og arenakart må publiseres på nytt for å få støtten.
Ingen eksisterende innbyggingsadresser trenger å endres for automatisk tema.

Utviklersjekk: `node --test tests/js/theme.test.cjs` tester temavalg,
OS-endringer og videreføring av tema i lenker.
