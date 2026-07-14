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
