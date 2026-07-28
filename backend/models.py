"""Datamodeller for hele applikasjonen.

Alle modellene er Pydantic-modeller. Det gir oss to ting gratis:
  1. Automatisk validering av alt som kommer inn fra frontend (feil format -> tydelig feilmelding).
  2. Automatisk konvertering til/fra JSON, inkludert datoer (ISO 8601-strenger).

`Point` er den sentrale byggeklossen: ett GPS-punkt med posisjon, og
valgfri høyde og tid. Alt verktøyet gjør, er i bunn og grunn å flytte
lister av `Point` rundt.
"""
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel


class Point(BaseModel):
    """Ett enkelt GPS-punkt. Høyde (ele) og tidsstempel (time) kan mangle."""

    lat: float
    lon: float
    ele: Optional[float] = None
    time: Optional[datetime] = None


class Waypoint(BaseModel):
    """Et interessepunkt (PoI) i løypa — GPX-standardens <wpt>.

    `types` er lista av våre kategorier for stedet (f.eks.
    ['mat', 'drikke', 'toalett']) — ett sted kan ha flere. Denne brukes
    til visning og til å bygge GPX (der hver kategori blir ett <wpt>).
    `sym`/`type` beholdes for enkeltsymbol og bakoverkompatibilitet med
    eldre lagrede segmenter og med innlest GPX.
    """

    lat: float
    lon: float
    ele: Optional[float] = None
    name: str
    desc: Optional[str] = None
    # GPX-ens <cmt> (kommentar) — fylles ved eksport med en lesbar
    # tjenesteliste («Sjekkpunkt, Drikke — Vann og saft»), siden det er
    # dette feltet Garmin gjerne viser som merknad på punktet.
    cmt: Optional[str] = None
    sym: Optional[str] = None
    type: Optional[str] = None
    types: Optional[List[str]] = None
    # Der brukeren har dratt ikonrammen på kartet (egen posisjon for
    # etiketten, atskilt fra selve løypepunktet). None = standardplassering.
    lab_lat: Optional[float] = None
    lab_lon: Optional[float] = None
    # Om ikonrammen vises på kartet. Selve punktet markeres uansett med en
    # liten prikk (så det kan klikkes fram igjen). Standard: vist.
    vis_ikon: bool = True
    # Referanse til et delt punkt i punktbiblioteket (data/waypoints.json).
    # None = vanlig lokalt punkt. Med referanse hentes ferske verdier fra
    # biblioteket ved åpning, og endringer synkroniseres tilbake ved lagring.
    bib_id: Optional[str] = None
    # «Snap»: vis punktet på nærmeste løypepunkt i stedet for på de lagrede
    # koordinatene. Per løype (IKKE delt via biblioteket) — de lagrede
    # koordinatene røres aldri, så biblioteket og de andre løypene påvirkes
    # ikke. Aktuelt for delte punkter som ligger et stykke unna traseen.
    snap: bool = False
    # Valgfri kobling til et arenakart: arena-slugen (f.eks. «teveltunet»).
    # Er den satt, blir løypepunktet klikkbart i den publiserte visningen og
    # åpner arenakartet på ./<arena>/ (samme event-mappe — se arena_publisering).
    arena: Optional[str] = None
    # Oversettelser av tekstfeltene til andre språk: {språk: {felt: tekst}},
    # f.eks. {"en": {"name": "Finish", "desc": "..."}}. De vanlige feltene er
    # kildespråket (norsk). None/manglende → norsk (bakoverkompatibelt).
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class DeltPunkt(BaseModel):
    """Et delt punkt i punktbiblioteket — gjenbrukes på tvers av løyper.

    Identiteten er `id`, ikke koordinatene: to delte punkter kan ligge på
    samme sted (samme fysiske sjekkpunkt med ulikt tilbud i ulike løp).
    """

    id: str
    lat: float
    lon: float
    ele: Optional[float] = None
    name: str
    desc: Optional[str] = None
    sym: Optional[str] = None
    type: Optional[str] = None
    types: Optional[List[str]] = None
    # Delt arenakart-lenke (se Waypoint.arena) — følger med ved gjenbruk.
    arena: Optional[str] = None
    # Delte oversettelser (se Waypoint.oversettelser) — følger med ved gjenbruk.
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class SegmentSummary(BaseModel):
    """Kortversjon av et lagret segment — det biblioteklista viser.

    `description` er valgfri fritekst (f.eks. «Fra parkeringa til
    drikkestasjonen, merket 2025»). Feltet er valgfritt slik at gamle
    segmentfiler uten beskrivelse fortsatt kan leses.
    """

    id: str
    name: str
    description: Optional[str] = None
    creator: Optional[str] = None
    link: Optional[str] = None
    copyright: Optional[str] = None
    keywords: Optional[str] = None
    # Foretrukket starttidspunkt ved GPX-eksport (datetime-local-streng,
    # f.eks. «2026-08-15T09:00») — huskes så det foreslås neste gang.
    start_time: Optional[str] = None
    created_at: datetime
    point_count: int


class SegmentDetail(SegmentSummary):
    """Fullversjon av et lagret segment, inkludert punkter og interessepunkter."""

    points: List[Point]
    waypoints: List[Waypoint] = []


# ---- Request/response-modeller for API-et ----


class ParseGpxResponse(BaseModel):
    """Svar fra /api/gpx/parse: sporets metadata (om fila hadde noen) og punktene."""

    name: Optional[str] = None
    description: Optional[str] = None
    creator: Optional[str] = None
    link: Optional[str] = None
    copyright: Optional[str] = None
    keywords: Optional[str] = None
    points: List[Point]
    waypoints: List[Waypoint] = []


class SaveSegmentRequest(BaseModel):
    """Forespørsel til /api/segments: lagre en punktliste under et navn."""

    name: str
    description: Optional[str] = None
    creator: Optional[str] = None
    link: Optional[str] = None
    copyright: Optional[str] = None
    keywords: Optional[str] = None
    start_time: Optional[str] = None
    points: List[Point]
    waypoints: List[Waypoint] = []


class UpdateMetaRequest(BaseModel):
    """Forespørsel til PATCH /api/segments/{id}: endre metadata."""

    name: str
    description: Optional[str] = None
    creator: Optional[str] = None
    link: Optional[str] = None
    copyright: Optional[str] = None
    keywords: Optional[str] = None
    start_time: Optional[str] = None


class UpdateWaypointsRequest(BaseModel):
    """Forespørsel til PUT /api/segments/{id}/waypoints: bytt ut PoI-lista."""

    waypoints: List[Waypoint] = []


class DeltePunkterResponse(BaseModel):
    """Svar fra GET /api/waypoints: alle delte punkter i punktbiblioteket.

    `bruk` (kun med ?bruk=1) sier hvilke segmenter som bruker hvert punkt:
    {bib_id: [segmentnavn, ...]}.
    """

    punkter: List[DeltPunkt]
    bruk: Optional[Dict[str, List[str]]] = None


class SegmentListResponse(BaseModel):
    """Svar fra GET /api/segments."""

    segments: List[SegmentSummary]


class MergeRequest(BaseModel):
    """Forespørsel til /api/segments/merge.

    split_a/split_b er indekser (0-basert) inn i hver sin punktliste:
    resultatet blir A fra start til og med split_a, deretter B fra split_b og ut.
    """

    points_a: List[Point]
    split_a: int
    points_b: List[Point]
    split_b: int


class MergeResponse(BaseModel):
    """Svar fra /api/segments/merge: den sammenslåtte punktlista."""

    points: List[Point]


class ExportGpxRequest(BaseModel):
    """Forespørsel til /api/gpx/export: metadata og punkter som skal bli en GPX-fil.

    `start_time` (valgfri): ønsket tidspunkt for FØRSTE punkt. Hele
    tidsserien forskyves dit etter opprydding, med alle innbyrdes
    tidsavstander bevart. Uten tidssone tolkes tida som lokal tid på
    maskinen (naturlig for et lokalt verktøy).
    """

    name: str
    description: Optional[str] = None
    creator: Optional[str] = None
    link: Optional[str] = None
    copyright: Optional[str] = None
    keywords: Optional[str] = None
    start_time: Optional[datetime] = None
    points: List[Point]
    waypoints: List[Waypoint] = []


class LibraryEntry(BaseModel):
    """Én oppføring på rotnivået i biblioteket: en gruppe eller et segment."""

    type: str  # 'group' eller 'segment'
    name: Optional[str] = None  # gruppenavn (når type == 'group')
    id: Optional[str] = None    # segment-id (når type == 'segment')


class LibraryStructure(BaseModel):
    """Organiseringen av segmentbiblioteket: rekkefølge og grupper.

    `root` er den ordnede lista på øverste nivå (grupper og løse
    segmenter om hverandre), `groups` er innholdet i hver gruppe
    (ordnede segment-id-lister). Ett nivå med grupper — ikke hierarki.
    """

    root: List[LibraryEntry] = []
    groups: Dict[str, List[str]] = {}


class PublishTarget(BaseModel):
    """Et publiseringsmål slik frontend ser det (uten påloggingsdetaljer)."""

    navn: str
    type: str
    baseUrl: str = ""


class PublishTargetsResponse(BaseModel):
    """Svar fra GET /api/publish/targets."""

    targets: List[PublishTarget]


class PublishRequest(BaseModel):
    """Forespørsel til POST /api/publish: publiser en løypevisning."""

    target: str
    slug: str
    name: str
    description: Optional[str] = None
    link: Optional[str] = None
    stil: Dict = {}
    points: List[Point]
    waypoints: List[Waypoint] = []
    # Standardspråk for innbygging (no/en). Lagres i course.json og settes som
    # ?lang= i iframe-snutten. None = norsk (bakoverkompatibelt).
    standard_sprak: Optional[str] = None
    # Oversettelser av løypas navn/beskrivelse — se Waypoint.oversettelser.
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class PublishResponse(BaseModel):
    """Svar: offentlig adresse + ferdig iframe-snutt til innliming.

    `advarsel` settes ved gruppepublisering der noen (men ikke alle)
    av målene feilet — publiseringen er da delvis vellykket.
    """

    url: str
    iframe: str
    advarsel: Optional[str] = None


class ElevationRequest(BaseModel):
    """Forespørsel til /api/elevation/correct: punktene som skal slås opp."""

    points: List[Point]


class ElevationResponse(BaseModel):
    """Svar: terrenghøyde per punkt (None = ingen dekning, behold original)."""

    elevations: List[Optional[float]]


# ============================================================
# Arenakart — oversiktskart over et arenaområde (helt separat funksjon)
# ============================================================


class ArenaType(BaseModel):
    """En brukerdefinert kategori for områder/punkter på et arenakart.

    F.eks. «Servering» (grønn) eller «Sanitær» (blå). `farge` er en
    HEX-streng (#rrggbb) som brukes til å tegne og gruppere elementene.
    """

    id: str
    navn: str
    farge: str = "#2563eb"
    # Oversettelser: {språk: {felt: tekst}} — se Waypoint.oversettelser.
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class ArenaImage(BaseModel):
    """Ett bakgrunnsbilde (kartlag) på et arenakart.

    Flere bilder kan legges inn (f.eks. «Norgeskart», «Satellitt», «Flyfoto»)
    som sluttbrukeren kan bytte mellom. Alle forutsettes å dekke samme område
    i samme målestokk, så de normaliserte koordinatene til områder/punkter
    gjelder likt for alle. `fil` er filnavnet i arenaens mappe; `bredde`/
    `høyde` er bildets naturlige mål i piksler.
    """

    id: str
    navn: str
    fil: str
    bredde: int
    høyde: int
    # Oversettelser: {språk: {felt: tekst}} — se Waypoint.oversettelser.
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class ArenaContact(BaseModel):
    """En kontakt på et arenakart (f.eks. løpsleder, sikkerhetsansvarlig).

    Kan knyttes til flere steder (via ArenaFeature.kontakt_ids) og vises også
    i en samlet kontaktliste. `gyldig_fra`/`gyldig_til` er valgfrie
    datetime-local-strenger («2026-08-15T08:00»): er de satt, vises kontakten
    kun når oppslaget gjøres innenfor tidsrommet (tom = ubegrenset).
    """

    id: str
    tittel: str
    navn: Optional[str] = None
    telefon: Optional[str] = None
    epost: Optional[str] = None
    beskrivelse: Optional[str] = None
    gyldig_fra: Optional[str] = None
    gyldig_til: Optional[str] = None
    # Oversettelser: {språk: {felt: tekst}} — se Waypoint.oversettelser.
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class ArenaFeature(BaseModel):
    """Ett element på arenakartet: et område (polygon) eller et punkt.

    `geometri` er NORMALISERTE koordinater i bildet: hvert par er [x, y]
    med x og y i [0, 1] (x fra venstre, y fra topp). Et punkt har ett par,
    et polygon har minst tre. Normaliseringen gjør elementene uavhengige
    av bildets pikseloppløsning, så et bilde kan byttes med en skarpere
    utgave uten at markeringene forskyver seg.
    """

    id: str
    navn: str
    beskrivelse: Optional[str] = None
    # Referanse til en ArenaType.id. None = ingen type (nøytral farge).
    type_id: Optional[str] = None
    form: str  # "polygon" eller "punkt"
    geometri: List[List[float]]
    # Id-ene til kontaktene som er knyttet til dette stedet (ArenaContact.id).
    # En kontakt kan være knyttet til flere steder.
    kontakt_ids: List[str] = []
    # Hvilke bakgrunnsbilder stedet vises på (ArenaImage.id):
    #   None      = alle bilder (standard)
    #   []        = ingen (skjult på alle bakgrunner)
    #   [id, ...] = kun de utvalgte
    bilde_ids: Optional[List[str]] = None
    # Oversettelser: {språk: {felt: tekst}} — se Waypoint.oversettelser.
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class ArenaSummary(BaseModel):
    """Kortversjon av et arenakart — det oversiktslista viser."""

    id: str
    navn: str
    beskrivelse: Optional[str] = None
    created_at: datetime
    har_bilde: bool = False
    feature_count: int = 0


class ArenaDetail(ArenaSummary):
    """Fullversjon av et arenakart, inkludert typer, elementer og bildeinfo."""

    # Bakgrunnsbildene (kartlagene). Alle forutsettes å dekke samme område i
    # samme målestokk. Det første bildet definerer det felles koordinat-
    # systemet (kanoniske mål), så alle bilder og elementer ligger på linje.
    bilder: List[ArenaImage] = []
    # Bakoverkompatible enkeltbilde-felt (eldre arenaer hadde bare ett bilde).
    # Migreres til `bilder` ved lasting; beholdes som reserve for kanoniske mål.
    bilde_fil: Optional[str] = None
    bilde_bredde: Optional[int] = None
    bilde_høyde: Optional[int] = None
    typer: List[ArenaType] = []
    features: List[ArenaFeature] = []
    kontakter: List[ArenaContact] = []
    # Sist brukte slugs, så publiseringsdialogen kan foreslå dem på nytt.
    event_slug: Optional[str] = None
    arena_slug: Optional[str] = None
    # Sist valgte bilder ved publisering (ArenaImage.id) — foreslås på nytt.
    publiser_bilde_ids: Optional[List[str]] = None
    # Oversettelser av arenaens navn/beskrivelse — se Waypoint.oversettelser.
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class ArenaSaveRequest(BaseModel):
    """Forespørsel til POST/PUT /api/arenas: lagre et arenakart.

    Bildene lastes opp separat (POST /api/arenas/{id}/images) — men
    bilde-METADATA (navn/rekkefølge) lagres her, så `bilder` er med.
    """

    navn: str
    beskrivelse: Optional[str] = None
    bilder: List[ArenaImage] = []
    typer: List[ArenaType] = []
    features: List[ArenaFeature] = []
    kontakter: List[ArenaContact] = []
    event_slug: Optional[str] = None
    arena_slug: Optional[str] = None
    publiser_bilde_ids: Optional[List[str]] = None
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class ArenaListResponse(BaseModel):
    """Svar fra GET /api/arenas."""

    arenas: List[ArenaSummary]


class ArenaPublishRequest(BaseModel):
    """Forespørsel til POST /api/arenas/publish: publiser et arenakart.

    Arenaen publiseres til <baseUrl>/<event_slug>/<arena_slug>/, i samme
    event-mappe som løypevisningen — så løypepunkter kan lenke til den med
    en relativ ./<arena_slug>/-adresse.
    """

    arena_id: str
    target: str
    event_slug: str
    arena_slug: str
    navn: str
    beskrivelse: Optional[str] = None
    # Hvilke bakgrunnsbilder som skal publiseres (ArenaImage.id). None = alle.
    # Tom liste = ingen bakgrunn (bare områder/punkter på blank flate).
    bilde_ids: Optional[List[str]] = None
    # Standardspråk for innbygging (no/en). Lagres i arena.json og settes som
    # ?lang= i iframe-snutten. None = norsk (bakoverkompatibelt).
    standard_sprak: Optional[str] = None
    # Oversettelser av arenaens navn/beskrivelse (toppnivå), om noen.
    oversettelser: Optional[Dict[str, Dict[str, str]]] = None


class ArenaPublishResponse(BaseModel):
    """Svar: offentlig adresse + iframe-snutt (som løypepublisering)."""

    url: str
    iframe: str
    advarsel: Optional[str] = None
