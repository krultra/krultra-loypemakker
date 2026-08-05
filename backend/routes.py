"""REST-API-et — det tynne HTTP-laget mellom frontend og logikken.

Hvert endepunkt gjør så lite som mulig: validere inndata (Pydantic gjør
det meste automatisk), kalle riktig funksjon i modulene ved siden av,
og oversette Python-feil til fornuftige HTTP-svar (400/404) med
forståelige norske feilmeldinger.
"""
import re
import urllib.parse
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from . import (
    arena_lagring,
    arena_publisering,
    elevation,
    gpx_io,
    kontaktbibliotek,
    publisering,
    punktbibliotek,
    segment_ops,
    storage,
    timestamps,
    video_lagring,
    video_publisering,
)
from .models import (
    ArenaContact,
    ArenaDetail,
    ArenaListResponse,
    ArenaPublishRequest,
    ArenaPublishResponse,
    ArenaSaveRequest,
    DelteKontakterResponse,
    DeltePunkterResponse,
    DeltKontakt,
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
BACKEND_VERSJON = 32


@router.get("/health")
def helse():
    """Enkel statussjekk. Brukes av frontend til å oppdage utdatert server."""
    return {"ok": True, "versjon": BACKEND_VERSJON}


# Øvre grense for opplastede GPX-filer. Romslig (svært lange spor på
# titusenvis av punkter er sjelden over noen få MB), men hindrer at en
# ekstremt stor fil spiser opp minnet.
MAKS_GPX_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/gpx/parse", response_model=ParseGpxResponse)
async def parse_gpx_fil(file: UploadFile = File(...)):
    """Ta imot en opplastet GPX-fil og returner punktene til frontend."""
    # Les inntil grensen + 1 byte, så vi kan avvise for store filer uten
    # å lese hele den store fila inn i minnet.
    innhold = await file.read(MAKS_GPX_BYTES + 1)
    if len(innhold) > MAKS_GPX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="GPX-fila er for stor (maks {} MB)".format(MAKS_GPX_BYTES // (1024 * 1024)))
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


@router.get("/arena-library", response_model=LibraryStructure)
def hent_arena_bibliotek():
    """Hent organiseringen av arenakartbiblioteket (grupper og rekkefølge)."""
    return storage.load_arena_library()


@router.put("/arena-library", response_model=LibraryStructure)
def lagre_arena_bibliotek(struktur: LibraryStructure):
    """Lagre organiseringen etter at brukeren har flyttet/gruppert arenakart."""
    for entry in struktur.root:
        if entry.type not in ("group", "arena"):
            raise HTTPException(status_code=400, detail="Ugyldig oppføringstype")
    return storage.save_arena_library(struktur)


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


@router.put("/waypoints/{bib_id}", response_model=DeltPunkt)
def oppdater_delt_punkt(bib_id: str, punkt: Waypoint):
    """Endre et delt punkt direkte i biblioteket (fra punktbibliotek-dialogen).

    Endringen slår inn i alle løyper som bruker punktet ved neste åpning.
    """
    try:
        return punktbibliotek.oppdater_punkt(bib_id, punkt)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke det delte punktet")


@router.delete("/waypoints/{bib_id}", status_code=204)
def slett_delt_punkt(bib_id: str, fjern_bruk: bool = False):
    """Fjern et delt punkt. Løypene beholder lokale kopier — med ?fjern_bruk=1
    fjernes punktet også fra alle segmenter som bruker det."""
    try:
        punktbibliotek.slett_punkt(bib_id, fjern_bruk=fjern_bruk)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke det delte punktet")


# ---- Kontaktbiblioteket: delte kontakter på tvers av arenakart ----


@router.get("/contacts", response_model=DelteKontakterResponse)
def delte_kontakter(bruk: bool = False):
    """Alle delte kontakter. Med ?bruk=1 følger det med hvilke arenakart
    som bruker hver kontakt (litt tregere — leser alle arenafilene)."""
    return DelteKontakterResponse(
        kontakter=kontaktbibliotek.les_bibliotek(),
        bruk=kontaktbibliotek.bruk_oversikt() if bruk else None,
    )


@router.post("/contacts", response_model=DeltKontakt, status_code=201)
def opprett_delt_kontakt(kontakt: ArenaContact):
    """Legg en kontakt i kontaktbiblioteket, så den kan gjenbrukes."""
    return kontaktbibliotek.opprett_kontakt(kontakt)


@router.put("/contacts/{bib_id}", response_model=DeltKontakt)
def oppdater_delt_kontakt(bib_id: str, kontakt: ArenaContact):
    """Endre en delt kontakt. Slår inn i arenakartene ved neste åpning."""
    try:
        return kontaktbibliotek.oppdater_kontakt(bib_id, kontakt)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke den delte kontakten")


@router.delete("/contacts/{bib_id}", status_code=204)
def slett_delt_kontakt(bib_id: str, fjern_bruk: bool = False):
    """Fjern en delt kontakt. Arenakartene beholder lokale kopier — med
    ?fjern_bruk=1 fjernes kontakten også fra alle arenakart som bruker den."""
    try:
        kontaktbibliotek.slett_kontakt(bib_id, fjern_bruk=fjern_bruk)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke den delte kontakten")


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
    video = _trim(req.video)
    if video and not publisering.GYLDIG_SLUG.match(video.lower()):
        raise HTTPException(
            status_code=400,
            detail="Ugyldig videonavn: bruk små bokstaver a–z, tall og bindestrek")
    meta = {"navn": _trim(req.name), "beskrivelse": _trim(req.description),
            "link": _trim(req.link), "standard_sprak": req.standard_sprak,
            "oversettelser": req.oversettelser,
            "video": video.lower() if video else None}
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


# ============================================================
# Arenakart (helt separat funksjon fra løypene)
# ============================================================

# Øvre grense for opplastede arenabilder. Oversiktskart er sjelden over
# noen få MB, men grensa hindrer at et ekstremt stort bilde spiser minnet.
MAKS_BILDE_BYTES = 25 * 1024 * 1024  # 25 MB


@router.get("/arenas", response_model=ArenaListResponse)
def list_arenaer():
    """List alle lagrede arenakart (til oversikten i editoren)."""
    return ArenaListResponse(arenas=arena_lagring.list_arenaer())


@router.post("/arenas", response_model=ArenaDetail, status_code=201)
def opprett_arena(req: ArenaSaveRequest):
    """Opprett et nytt arenakart. Bildet lastes opp separat etterpå."""
    if not req.navn.strip():
        raise HTTPException(status_code=400, detail="Arenaen må ha et navn")
    return arena_lagring.opprett_arena(req)


@router.get("/arenas/{arena_id}", response_model=ArenaDetail)
def hent_arena(arena_id: str):
    """Hent ett arenakart med typer, elementer og bildeinfo."""
    try:
        return arena_lagring.hent_arena(arena_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke arenaen")


@router.put("/arenas/{arena_id}", response_model=ArenaDetail)
def oppdater_arena(arena_id: str, req: ArenaSaveRequest):
    """Lagre endringer på et arenakart (bildet røres ikke)."""
    if not req.navn.strip():
        raise HTTPException(status_code=400, detail="Arenaen må ha et navn")
    try:
        return arena_lagring.oppdater_arena(arena_id, req)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke arenaen")


@router.delete("/arenas/{arena_id}", status_code=204)
def slett_arena(arena_id: str):
    """Slett et arenakart med bilde og alt."""
    try:
        arena_lagring.slett_arena(arena_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke arenaen")


@router.post("/arenas/{arena_id}/images", response_model=ArenaDetail)
async def last_opp_arenabilde(
    arena_id: str,
    file: UploadFile = File(...),
    navn: str = Form(""),
    bredde: int = Form(...),
    høyde: int = Form(...),
):
    """Legg til et bakgrunnsbilde (kartlag) på en arena.

    `navn` er den forklarende etiketten (f.eks. «Norgeskart», «Satellitt»).
    `bredde`/`høyde` er bildets naturlige mål i piksler (leses av nettleseren)
    og lagres til bruk i CRS.Simple-bounds i visningen.
    """
    ext = arena_lagring.BILDE_TYPER.get(file.content_type or "")
    if not ext:
        raise HTTPException(
            status_code=400, detail="Bildet må være PNG, JPEG eller WebP")
    innhold = await file.read(MAKS_BILDE_BYTES + 1)
    if len(innhold) > MAKS_BILDE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Bildet er for stort (maks {} MB)".format(MAKS_BILDE_BYTES // (1024 * 1024)))
    if bredde < 1 or høyde < 1:
        raise HTTPException(status_code=400, detail="Ugyldige bildemål")
    try:
        return arena_lagring.legg_til_bilde(arena_id, innhold, ext, navn.strip(), bredde, høyde)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke arenaen")


@router.delete("/arenas/{arena_id}/images/{img_id}", response_model=ArenaDetail)
def slett_arenabilde(arena_id: str, img_id: str):
    """Fjern et bakgrunnsbilde fra en arena."""
    try:
        return arena_lagring.slett_bilde(arena_id, img_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke arenaen eller bildet")


@router.get("/arenas/{arena_id}/images/{img_id}")
def hent_arenabilde(arena_id: str, img_id: str):
    """Server ett lagret bilde, så editoren kan vise det."""
    try:
        sti = arena_lagring.bilde_sti_for(arena_id, img_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke bildet")
    return FileResponse(str(sti))


@router.post("/arenas/publish", response_model=ArenaPublishResponse)
def publiser_arena(req: ArenaPublishRequest):
    """Publiser et arenakart til <event>/<arena>/ på valgt mål."""
    try:
        arena = arena_lagring.hent_arena(req.arena_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Fant ikke arenaen")
    # Bruk tittel/beskrivelse fra dialogen (kan avvike fra det lagrede navnet),
    # og husk de brukte slugene på arenaen til neste publisering.
    arena.navn = req.navn.strip() or arena.navn
    arena.beskrivelse = _trim(req.beskrivelse)
    if req.oversettelser is not None:
        arena.oversettelser = req.oversettelser
    try:
        resultat = arena_publisering.publiser_arena(
            req.target, req.event_slug.strip().lower(),
            req.arena_slug.strip().lower(), arena, req.bilde_ids, req.standard_sprak)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # Lagre slugs + bilde-utvalg + eventuell tittelendring for neste gang
    arena.event_slug = req.event_slug.strip().lower()
    arena.arena_slug = req.arena_slug.strip().lower()
    arena.publiser_bilde_ids = req.bilde_ids
    arena_lagring._skriv(arena)
    return ArenaPublishResponse(**resultat)


# ============================================================
# Flyover-videoer
# ============================================================
# Videoene spilles inn i nettleseren og lastes opp hit som en fil.
# De kan bli store, så de tas imot som multipart (strømmes til disk av
# Starlette) i stedet for som JSON med base64.


@router.get("/videos")
def liste_videoer():
    """Alle lagrede videoer, nyeste først."""
    return {"videoer": video_lagring.les_index()}


@router.post("/videos", status_code=201)
async def lagre_video(
    file: UploadFile = File(...),
    navn: str = Form(...),
    loype: str = Form(None),
    varighet: float = Form(None),
    bredde: int = Form(None),
    hoyde: int = Form(None),
):
    innhold = await file.read()
    try:
        return video_lagring.lagre(
            innhold, file.content_type or "", navn,
            loype=loype, varighet=varighet, bredde=bredde, hoyde=hoyde,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/videos/{video_id}/fil")
def hent_videofil(video_id: str):
    """Selve videofila — brukes til avspilling og nedlasting i verktøyet."""
    try:
        sti = video_lagring.sti_for(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    v = video_lagring.hent(video_id)
    return FileResponse(
        sti, media_type=v.get("mime") or "application/octet-stream",
        filename="{}.{}".format(v["navn"], sti.suffix.lstrip(".")),
    )


@router.patch("/videos/{video_id}")
def endre_video(video_id: str, req: dict):
    try:
        return video_lagring.gi_nytt_navn(video_id, req.get("navn", ""))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/videos/{video_id}", status_code=204)
def slett_video(video_id: str):
    try:
        video_lagring.slett(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return Response(status_code=204)


@router.post("/videos/{video_id}/publish")
def publiser_video(video_id: str, req: dict):
    """Publiser en lagret video som en egen side under løypa."""
    try:
        return video_publisering.publiser_video(
            req.get("target", ""),
            (req.get("event_slug") or "").strip().lower(),
            (req.get("video_slug") or "video").strip().lower(),
            video_id,
            (req.get("navn") or "").strip(),
            beskrivelse=_trim(req.get("beskrivelse")),
            standard_sprak=req.get("standard_sprak") or "no",
            oversettelser=req.get("oversettelser") or None,
            link=_trim(req.get("link")),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
