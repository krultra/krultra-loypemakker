"""Lagring av arenakart som enkle filer på disk.

Hvert arenakart får sin egen mappe: data/arenaer/<id>/
  arena.json      — navn, typer, elementer (features) og bildeinfo
  bilde.<ext>     — bakgrunnsbildet (oversiktskartet), lastet opp separat

Én mappe per arena (i motsetning til segmentenes flate filer) fordi en
arena eier et bildevedlegg i tillegg til JSON-en. Ingen database — flate
filer er enklest å forstå, sikkerhetskopiere og feilsøke for et
lokalverktøy for én bruker.
"""
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from .models import ArenaDetail, ArenaSaveRequest, ArenaSummary

# Rotmappa arenaene lagres i: <prosjektrot>/data/arenaer
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "arenaer"

# Gyldige arena-id-er: bare heksadesimale tegn (som uuid4().hex gir oss).
# Hindrer at rare verdier i en URL kan peke utenfor data-mappa.
_GYLDIG_ID = re.compile(r"^[a-f0-9]{8}$")

# Tillatte bildeformater ved opplasting -> filendelse som lagres.
BILDE_TYPER = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


def _mappe_for(arena_id: str) -> Path:
    """Bygg mappestien for en arena-id, med validering av id-formatet."""
    if not _GYLDIG_ID.match(arena_id):
        raise FileNotFoundError("Ugyldig arena-id: {}".format(arena_id))
    return DATA_DIR / arena_id


def _fil_for(arena_id: str) -> Path:
    return _mappe_for(arena_id) / "arena.json"


def _til_sammendrag(detail: ArenaDetail) -> ArenaSummary:
    return ArenaSummary(
        id=detail.id,
        navn=detail.navn,
        beskrivelse=detail.beskrivelse,
        created_at=detail.created_at,
        har_bilde=bool(detail.bilde_fil),
        feature_count=len(detail.features),
    )


def _ferdig(detail: ArenaDetail) -> ArenaDetail:
    """Sett de utledede feltene (har_bilde/feature_count) før retur.

    De lagres ikke pålitelig i arena.json (avhenger av bilde og elementer),
    så vi regner dem alltid ut fra gjeldende innhold når en detalj hentes."""
    detail.har_bilde = bool(detail.bilde_fil)
    detail.feature_count = len(detail.features)
    return detail


def opprett_arena(req: ArenaSaveRequest) -> ArenaDetail:
    """Opprett et nytt (tomt) arenakart og returner det med ny id."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    arena_id = uuid.uuid4().hex[:8]
    detail = ArenaDetail(
        id=arena_id,
        navn=req.navn,
        beskrivelse=req.beskrivelse,
        created_at=datetime.now(timezone.utc),
        typer=req.typer,
        features=req.features,
        kontakter=req.kontakter,
        event_slug=req.event_slug,
        arena_slug=req.arena_slug,
    )
    _skriv(detail)
    return _ferdig(detail)


def oppdater_arena(arena_id: str, req: ArenaSaveRequest) -> ArenaDetail:
    """Lagre endringer på et arenakart. Bildet og created_at bevares."""
    detail = hent_arena(arena_id)
    detail.navn = req.navn
    detail.beskrivelse = req.beskrivelse
    detail.typer = req.typer
    detail.features = req.features
    detail.kontakter = req.kontakter
    if req.event_slug is not None:
        detail.event_slug = req.event_slug
    if req.arena_slug is not None:
        detail.arena_slug = req.arena_slug
    _skriv(detail)
    return _ferdig(detail)


def _skriv(detail: ArenaDetail) -> None:
    mappe = _mappe_for(detail.id)
    mappe.mkdir(parents=True, exist_ok=True)
    (mappe / "arena.json").write_text(
        detail.model_dump_json(indent=2), encoding="utf-8")


def hent_arena(arena_id: str) -> ArenaDetail:
    """Hent ett arenakart. FileNotFoundError hvis det ikke finnes."""
    fil = _fil_for(arena_id)
    if not fil.exists():
        raise FileNotFoundError("Fant ikke arena med id {}".format(arena_id))
    return _ferdig(ArenaDetail.model_validate_json(fil.read_text(encoding="utf-8")))


def list_arenaer() -> List[ArenaSummary]:
    """List alle lagrede arenakart, nyeste først.

    Mapper med ødelagt/uleselig arena.json hoppes stille over.
    """
    if not DATA_DIR.exists():
        return []
    sammendrag: List[ArenaSummary] = []
    for mappe in DATA_DIR.iterdir():
        fil = mappe / "arena.json"
        if not fil.is_file():
            continue
        try:
            detail = ArenaDetail.model_validate_json(fil.read_text(encoding="utf-8"))
        except Exception:
            continue  # ødelagt fil — ignorer, ikke krasj
        sammendrag.append(_til_sammendrag(detail))
    sammendrag.sort(key=lambda s: s.created_at, reverse=True)
    return sammendrag


def slett_arena(arena_id: str) -> None:
    """Slett et arenakart med bilde og alt. FileNotFoundError hvis det mangler."""
    mappe = _mappe_for(arena_id)
    if not mappe.exists():
        raise FileNotFoundError("Fant ikke arena med id {}".format(arena_id))
    for fil in mappe.iterdir():
        fil.unlink()
    mappe.rmdir()


def lagre_bilde(arena_id: str, innhold: bytes, ext: str, bredde: int, høyde: int) -> ArenaDetail:
    """Lagre bakgrunnsbildet for en arena og oppdater arena.json.

    Et tidligere bilde (med annen filendelse) fjernes, så mappa alltid
    har nøyaktig ett bilde. `bredde`/`høyde` er bildets naturlige mål i
    piksler (leses ut av kalleren) og lagres til bruk i CRS.Simple-bounds.
    """
    detail = hent_arena(arena_id)
    mappe = _mappe_for(arena_id)
    for gammelt in mappe.glob("bilde.*"):
        gammelt.unlink()
    filnavn = "bilde.{}".format(ext)
    (mappe / filnavn).write_bytes(innhold)
    detail.bilde_fil = filnavn
    detail.bilde_bredde = bredde
    detail.bilde_høyde = høyde
    _skriv(detail)
    return _ferdig(detail)


def bilde_sti(arena_id: str) -> Path:
    """Full sti til det lagrede bildet. FileNotFoundError hvis det mangler."""
    detail = hent_arena(arena_id)
    if not detail.bilde_fil:
        raise FileNotFoundError("Arenaen har ikke noe bilde ennå")
    return _mappe_for(arena_id) / detail.bilde_fil
