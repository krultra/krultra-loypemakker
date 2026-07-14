"""REST-API-et — det tynne HTTP-laget mellom frontend og logikken.

Hvert endepunkt gjør så lite som mulig: validere inndata (Pydantic gjør
det meste automatisk), kalle riktig funksjon i modulene ved siden av,
og oversette Python-feil til fornuftige HTTP-svar (400/404) med
forståelige norske feilmeldinger.
"""
import re
import urllib.parse
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from . import elevation, gpx_io, publisering, punktbibliotek, segment_ops, storage, timestamps
from .models import (
    DeltePunkterResponse,
    DeltPunkt,
    ElevationRequest,
    ElevationResponse,
    ExportGpxRequest,
    LibraryStructure,
    PublishRequest,
    PublishResponse,
    PublishTarget,
    PublishTargetsResponse,
    MergeRequest,
    MergeResponse,
    ParseGpxResponse,
    SaveSegmentRequest,
    SegmentDetail,
    SegmentListResponse,
    SegmentSummary,
    UpdateMetaRequest,
    UpdateWaypointsRequest,
    Waypoint,
)

router = APIRouter()

# Økes når backend får ny funksjonalitet frontend er avhengig av. Frontend
# sjekker dette ved oppstart og varsler tydelig hvis den kjørende serveren
# er eldre enn koden på disk (dvs. må startes på nytt).
BACKEND_VERSJON = 17


@router.get("/health")
def helse():
    """Enkel statussjekk. Brukes av frontend til å oppdage utdatert server."""
    return {"ok": True, "versjon": BACKEND_VERSJON}


@router.post("/gpx/parse", response_model=ParseGpxResponse)
async def parse_gpx_fil(file: UploadFile = File(...)):
    """Ta imot en opplastet GPX-fil og returner punktene til frontend."""
    innhold = await file.read()
    try:
        resultat = gpx_io.parse_gpx(innhold)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Har ikke fila noe spornavn, bruker vi filnavnet (uten .gpx) som forslag.
    navn = resultat.name
    if navn is None and file.filename:
        navn = Path(file.filename).stem

    return ParseGpxResponse(
        name=navn,
        description=resultat.description,
        creator=resultat.creator,
        link=resultat.link,
        copyright=resultat.copyright,
        keywords=resultat.keywords,
        points=resultat.points,
        waypoints=resultat.waypoints,
    )


@router.post("/segments", response_model=SegmentSummary, status_code=201)
def lagre_segment(req: SaveSegmentRequest):
    """Lagre en punktliste som et navngitt segment i biblioteket."""
    navn = req.name.strip()
    if not navn:
        raise HTTPException(status_code=400, detail="Segmentet må ha et navn")
    if len(req.points) < 2:
        raise HTTPException(status_code=400, detail="Et segment må ha minst to punkter")
    return storage.save_segment(_trimmet(req))


def _trim(verdi):
    """Trim tekst og gjør tomme strenger om til None (ryddigere lagring)."""
    if verdi is None:
        return None
    verdi = verdi.strip()
    return verdi or None


def _trimmet(req):
    """Returner en kopi av forespørselen med alle metadata-tekstfelt trimmet."""
    return req.model_copy(update={
        "name": req.name.strip(),
        "description": _trim(req.description),
        "creator": _trim(req.creator),
        "link": _trim(req.link),
        "copyright": _trim(req.copyright),
        "keywords": _trim(req.keywords),
    })


@router.patch("/segments/{segment_id}", response_model=SegmentSummary)
def endre_segment_metadata(segment_id: str, req: UpdateMetaRequest):
    """Endre metadata på et lagret segment uten å røre punktene."""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Segmentet må ha et navn")
    try:
        return storage.update_segment_meta(segment_id, _trimmet(req))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke segmentet")


@router.get("/segments", response_model=SegmentListResponse)
def list_segmenter():
    """List alle lagrede segmenter (til biblioteksvisningen)."""
    return SegmentListResponse(segments=storage.list_segments())


@router.get("/library", response_model=LibraryStructure)
def hent_bibliotek():
    """Hent organiseringen av biblioteket (grupper og rekkefølge)."""
    return storage.load_library()


@router.put("/library", response_model=LibraryStructure)
def lagre_bibliotek(struktur: LibraryStructure):
    """Lagre organiseringen etter at brukeren har flyttet/gruppert segmenter."""
    for entry in struktur.root:
        if entry.type not in ("group", "segment"):
            raise HTTPException(status_code=400, detail="Ugyldig oppføringstype")
    return storage.save_library(struktur)


@router.get("/segments/{segment_id}", response_model=SegmentDetail)
def hent_segment(segment_id: str):
    """Hent ett segment med alle punktene."""
    try:
        return storage.load_segment(segment_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke segmentet")


@router.put("/segments/{segment_id}/waypoints", response_model=SegmentSummary)
def oppdater_segment_waypoints(segment_id: str, req: UpdateWaypointsRequest):
    """Lagre interessepunktene på et segment (for automatisk PoI-lagring)."""
    try:
        return storage.update_segment_waypoints(segment_id, req.waypoints)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke segmentet")


@router.delete("/segments/{segment_id}", status_code=204)
def slett_segment(segment_id: str):
    """Slett et lagret segment fra biblioteket."""
    try:
        storage.delete_segment(segment_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke segmentet")


@router.post("/segments/merge", response_model=MergeResponse)
def slaa_sammen(req: MergeRequest):
    """Slå sammen to punktlister ved angitte delingspunkter.

    Ren beregning — resultatet lagres IKKE her. Frontend kaller
    POST /api/segments etterpå hvis brukeren vil beholde resultatet
    (å slå sammen og å lagre er to separate valg i brukerflyten).
    """
    try:
        punkter = segment_ops.merge_segments(
            req.points_a, req.split_a, req.points_b, req.split_b
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return MergeResponse(points=punkter)


# ---- Punktbiblioteket: delte interessepunkter på tvers av løyper ----


@router.get("/waypoints", response_model=DeltePunkterResponse)
def delte_punkter(bruk: bool = False):
    """Alle delte punkter. Med ?bruk=1 følger det med hvilke segmenter
    som bruker hvert punkt (litt tregere — leser alle segmentfilene)."""
    return DeltePunkterResponse(
        punkter=punktbibliotek.les_bibliotek(),
        bruk=punktbibliotek.bruk_oversikt() if bruk else None,
    )


@router.post("/waypoints", response_model=DeltPunkt, status_code=201)
def opprett_delt_punkt(punkt: Waypoint):
    """Legg et punkt i punktbiblioteket, så det kan gjenbrukes i andre løyper."""
    return punktbibliotek.opprett_punkt(punkt)


@router.delete("/waypoints/{bib_id}", status_code=204)
def slett_delt_punkt(bib_id: str):
    """Fjern et delt punkt. Løypene som brukte det beholder lokale kopier."""
    try:
        punktbibliotek.slett_punkt(bib_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke det delte punktet")


@router.get("/publish/targets", response_model=PublishTargetsResponse)
def publiseringsmål():
    """List publiseringsmålene (uten påloggingsdetaljer) til dialogen."""
    mål = [
        PublishTarget(navn=m.get("navn", "?"), type=m.get("type", "?"),
                      baseUrl=m.get("baseUrl", ""))
        for m in publisering.les_konfig().get("mål", [])
    ]
    return PublishTargetsResponse(targets=mål)


@router.post("/publish", response_model=PublishResponse)
def publiser_løype(req: PublishRequest):
    """Publiser en interaktiv løypevisning til valgt mål.

    Bygger course.json (forenklede punkter + veipunkter + stil) og
    skriver den, sammen med viewer-filene, til målet. Republisering til
    samme slug overskriver dataene — innbygde iframes viser da ny
    versjon uten endringer på websidene.
    """
    if len(req.points) < 2:
        raise HTTPException(status_code=400, detail="Løypa må ha minst to punkter")
    meta = {"navn": _trim(req.name), "beskrivelse": _trim(req.description),
            "link": _trim(req.link)}
    course = publisering.bygg_course_json(req.points, req.waypoints, meta, req.stil)
    try:
        resultat = publisering.publiser(req.target, req.slug.strip().lower(), course)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return PublishResponse(**resultat)


@router.post("/elevation/correct", response_model=ElevationResponse)
def korriger_høyder(req: ElevationRequest):
    """Slå opp terrenghøyden hos Kartverket for hvert punkt.

    GPS-målte høyder kan avvike ±150 m fra terrenget; dette gir de
    riktige høydene fra den nasjonale terrengmodellen. Punkter uten
    dekning (utenfor Norge) får null — frontend beholder da originalen.
    Krever internett.
    """
    if not req.points:
        return ElevationResponse(elevations=[])
    try:
        høyder = elevation.hent_terrenghøyder(req.points)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return ElevationResponse(elevations=høyder)


@router.post("/gpx/export")
def eksporter_gpx(req: ExportGpxRequest):
    """«Lagre som GPX» — rydd tidsstemplene og returner en nedlastbar fil.

    Fungerer likt for et enkeltsegment og en fersk sammenslått rute:
    det er bare en punktliste inn, og en garantert gyldig GPX-fil ut.
    """
    navn = req.name.strip()
    if not navn:
        raise HTTPException(status_code=400, detail="Fila må ha et navn")
    if len(req.points) < 2:
        raise HTTPException(status_code=400, detail="En løype må ha minst to punkter")

    ryddige_punkter = timestamps.clean_timestamps(req.points)
    if req.start_time is not None:
        # Brukeren har bedt om et bestemt starttidspunkt: flytt hele
        # tidsserien dit, med alle innbyrdes avstander bevart.
        ryddige_punkter = timestamps.shift_to_start(ryddige_punkter, req.start_time)
    xml = gpx_io.build_clean_gpx(
        ryddige_punkter,
        navn,
        description=_trim(req.description),
        creator=_trim(req.creator),
        link=_trim(req.link),
        copyright=_trim(req.copyright),
        keywords=_trim(req.keywords),
        waypoints=req.waypoints,
    )

    # Filnavn: fjern tegn Windows ikke tillater, og lag en ren ASCII-variant
    # som reserve for eldre nettlesere (norske tegn håndteres av filename*).
    trygt_navn = re.sub(r'[\\/:*?"<>|]', "_", navn).strip() or "loype"
    ascii_navn = trygt_navn.encode("ascii", "ignore").decode() or "loype"
    utf8_navn = urllib.parse.quote(trygt_navn)

    return Response(
        content=xml,
        media_type="application/gpx+xml",
        headers={
            "Content-Disposition": (
                'attachment; filename="{}.gpx"; '.format(ascii_navn)
                + "filename*=UTF-8''{}.gpx".format(utf8_navn)
            )
        },
    )
