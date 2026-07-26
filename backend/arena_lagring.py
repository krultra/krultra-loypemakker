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

from .models import ArenaDetail, ArenaImage, ArenaSaveRequest, ArenaSummary

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
        har_bilde=bool(detail.bilder or detail.bilde_fil),
        feature_count=len(detail.features),
    )


def _migrer(detail: ArenaDetail) -> ArenaDetail:
    """Migrer eldre enkeltbilde-arenaer til bilder-lista (ved lasting).

    Hadde arenaen bare `bilde_fil` (før flere bakgrunnsbilder), lages ett
    ArenaImage av det, så resten av koden kan forholde seg til `bilder`.
    """
    if not detail.bilder and detail.bilde_fil:
        detail.bilder = [ArenaImage(
            id="hoved", navn="Kart", fil=detail.bilde_fil,
            bredde=detail.bilde_bredde or 1000,
            høyde=detail.bilde_høyde or 1000,
        )]
    # Kanoniske mål = første bildets, så koordinatsystemet er stabilt
    if detail.bilder:
        detail.bilde_bredde = detail.bilder[0].bredde
        detail.bilde_høyde = detail.bilder[0].høyde
        detail.bilde_fil = detail.bilder[0].fil
    return detail


def _ferdig(detail: ArenaDetail) -> ArenaDetail:
    """Sett de utledede feltene (har_bilde/feature_count) før retur.

    De lagres ikke pålitelig i arena.json (avhenger av bilde og elementer),
    så vi regner dem alltid ut fra gjeldende innhold når en detalj hentes."""
    _migrer(detail)
    detail.har_bilde = bool(detail.bilder)
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
        bilder=req.bilder,
        typer=req.typer,
        features=req.features,
        kontakter=req.kontakter,
        event_slug=req.event_slug,
        arena_slug=req.arena_slug,
        publiser_bilde_ids=req.publiser_bilde_ids,
    )
    _skriv(detail)
    return _ferdig(detail)


def oppdater_arena(arena_id: str, req: ArenaSaveRequest) -> ArenaDetail:
    """Lagre endringer på et arenakart (bildefilene røres ikke).

    `bilder`-lista lagres (navn/rekkefølge kan endres i editoren), men selve
    bildefilene legges til/fjernes via egne bilde-endepunkter.
    """
    detail = hent_arena(arena_id)
    detail.navn = req.navn
    detail.beskrivelse = req.beskrivelse
    detail.bilder = req.bilder
    detail.typer = req.typer
    detail.features = req.features
    detail.kontakter = req.kontakter
    if req.event_slug is not None:
        detail.event_slug = req.event_slug
    if req.arena_slug is not None:
        detail.arena_slug = req.arena_slug
    detail.publiser_bilde_ids = req.publiser_bilde_ids
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


def legg_til_bilde(arena_id: str, innhold: bytes, ext: str, navn: str,
                   bredde: int, høyde: int) -> ArenaDetail:
    """Legg til et bakgrunnsbilde på en arena og oppdater arena.json.

    Bildet lagres som bilde-<img_id>.<ext>, så flere bilder kan ligge side
    om side. Det første bildet definerer arenaens kanoniske mål (koordinat-
    systemet alle bilder og elementer deler).
    """
    detail = hent_arena(arena_id)
    mappe = _mappe_for(arena_id)
    img_id = uuid.uuid4().hex[:8]
    filnavn = "bilde-{}.{}".format(img_id, ext)
    (mappe / filnavn).write_bytes(innhold)
    detail.bilder.append(ArenaImage(
        id=img_id, navn=navn or "Bilde {}".format(len(detail.bilder) + 1),
        fil=filnavn, bredde=bredde, høyde=høyde))
    _skriv(detail)
    return _ferdig(detail)


def slett_bilde(arena_id: str, img_id: str) -> ArenaDetail:
    """Fjern et bakgrunnsbilde (fil + referanser). FileNotFoundError hvis ukjent."""
    detail = hent_arena(arena_id)
    bilde = next((b for b in detail.bilder if b.id == img_id), None)
    if bilde is None:
        raise FileNotFoundError("Fant ikke bilde {}".format(img_id))
    mappe = _mappe_for(arena_id)
    filsti = mappe / bilde.fil
    if filsti.exists():
        filsti.unlink()
    detail.bilder = [b for b in detail.bilder if b.id != img_id]
    # Rydd bort referanser til det slettede bildet
    for f in detail.features:
        if f.bilde_ids is not None:
            f.bilde_ids = [i for i in f.bilde_ids if i != img_id]
    if detail.publiser_bilde_ids is not None:
        detail.publiser_bilde_ids = [i for i in detail.publiser_bilde_ids if i != img_id]
    _skriv(detail)
    return _ferdig(detail)


def bilde_sti_for(arena_id: str, img_id: str) -> Path:
    """Full sti til ett bestemt bilde. FileNotFoundError hvis det mangler."""
    detail = hent_arena(arena_id)
    bilde = next((b for b in detail.bilder if b.id == img_id), None)
    if bilde is None:
        raise FileNotFoundError("Fant ikke bilde {}".format(img_id))
    return _mappe_for(arena_id) / bilde.fil
