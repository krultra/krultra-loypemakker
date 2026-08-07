"""Lagring av segmenter som enkle JSON-filer på disk.

Hvert segment lagres som én fil: data/segments/<id>.json
Fila inneholder id, navn, opprettelsestidspunkt og alle punktene.
Ingen database — for et én-brukers lokalverktøy er flate filer enklest
å forstå, sikkerhetskopiere og feilsøke (de kan åpnes i Notisblokk).
"""
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from . import punktbibliotek
from .models import (
    LibraryEntry,
    LibraryStructure,
    Point,
    SaveSegmentRequest,
    SegmentDetail,
    SegmentSummary,
    UpdateMetaRequest,
)

# Mappa segmentene lagres i: <prosjektrot>/data/segments
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "segments"

# Organiseringen av biblioteket (grupper og rekkefølge): data/library.json
LIBRARY_FILE = Path(__file__).resolve().parent.parent / "data" / "library.json"
# Samme, men for arenakartbiblioteket: data/arena-library.json
ARENA_LIBRARY_FILE = Path(__file__).resolve().parent.parent / "data" / "arena-library.json"
# Samme, men for videobiblioteket: data/video-library.json
VIDEO_LIBRARY_FILE = Path(__file__).resolve().parent.parent / "data" / "video-library.json"

# Gyldige segment-id-er: bare heksadesimale tegn (som uuid4().hex gir oss).
# Sjekken hindrer at rare verdier i URL-en kan peke utenfor data-mappa.
_GYLDIG_ID = re.compile(r"^[a-f0-9]{8}$")


def _sti_for(segment_id: str) -> Path:
    """Bygg filstien for en segment-id, med validering av id-formatet."""
    if not _GYLDIG_ID.match(segment_id):
        raise FileNotFoundError("Ugyldig segment-id: {}".format(segment_id))
    return DATA_DIR / "{}.json".format(segment_id)


def save_segment(req: SaveSegmentRequest) -> SegmentSummary:
    """Lagre en punktliste (med metadata og interessepunkter) som nytt segment.

    Tar hele forespørselsmodellen i stedet for enkeltfelt — metadataene
    har vokst, og dette holder signaturen stabil når nye felt kommer til.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    segment_id = uuid.uuid4().hex[:8]
    detail = SegmentDetail(
        id=segment_id,
        name=req.name,
        description=req.description,
        creator=req.creator,
        link=req.link,
        copyright=req.copyright,
        keywords=req.keywords,
        start_time=req.start_time,
        created_at=datetime.now(timezone.utc),
        point_count=len(req.points),
        points=req.points,
        waypoints=req.waypoints,
    )
    sti = DATA_DIR / "{}.json".format(segment_id)
    sti.write_text(detail.model_dump_json(indent=2), encoding="utf-8")
    punktbibliotek.oppdater_fra_segment(detail.waypoints)

    return _til_sammendrag(detail)


def update_segment_meta(segment_id: str, req: UpdateMetaRequest) -> SegmentSummary:
    """Endre metadata på et lagret segment (punkter og interessepunkter røres ikke)."""
    detail = load_segment(segment_id)
    detail.name = req.name
    detail.description = req.description
    detail.creator = req.creator
    detail.link = req.link
    detail.copyright = req.copyright
    detail.keywords = req.keywords
    # Starttidspunktet beholdes hvis forespørselen ikke har det med —
    # de fleste metadata-endringer (f.eks. «Endre» i biblioteket) angår
    # det ikke, og skal ikke nullstille det.
    if req.start_time is not None:
        detail.start_time = req.start_time
    sti = _sti_for(segment_id)
    sti.write_text(detail.model_dump_json(indent=2), encoding="utf-8")
    return _til_sammendrag(detail)


def update_segment_waypoints(segment_id: str, waypoints) -> SegmentSummary:
    """Bytt ut interessepunktene på et lagret segment (punktene røres ikke).

    Brukes til automatisk lagring når brukeren legger til/endrer et PoI på
    et segment som allerede ligger i biblioteket. Endringer på delte
    punkter (med `bib_id`) synkroniseres samtidig til punktbiblioteket,
    så de andre løypene får dem ved neste åpning.
    """
    detail = load_segment(segment_id)
    detail.waypoints = waypoints
    sti = _sti_for(segment_id)
    sti.write_text(detail.model_dump_json(indent=2), encoding="utf-8")
    punktbibliotek.oppdater_fra_segment(detail.waypoints)
    return _til_sammendrag(detail)


def _til_sammendrag(detail: SegmentDetail) -> SegmentSummary:
    return SegmentSummary(
        id=detail.id,
        name=detail.name,
        description=detail.description,
        creator=detail.creator,
        link=detail.link,
        copyright=detail.copyright,
        keywords=detail.keywords,
        start_time=detail.start_time,
        created_at=detail.created_at,
        point_count=detail.point_count,
    )


def list_segments() -> List[SegmentSummary]:
    """List alle lagrede segmenter, nyeste først.

    Filer som ikke lar seg lese (f.eks. håndredigert og ødelagt JSON)
    hoppes stille over i stedet for å velte hele lista.
    """
    if not DATA_DIR.exists():
        return []

    sammendrag: List[SegmentSummary] = []
    for fil in DATA_DIR.glob("*.json"):
        try:
            detail = SegmentDetail.model_validate_json(fil.read_text(encoding="utf-8"))
        except Exception:
            continue  # ødelagt fil — ignorer, ikke krasj
        sammendrag.append(_til_sammendrag(detail))

    sammendrag.sort(key=lambda s: s.created_at, reverse=True)
    return sammendrag


def load_segment(segment_id: str) -> SegmentDetail:
    """Hent ett segment med alle punktene. FileNotFoundError hvis det ikke finnes.

    Veipunkter med `bib_id` får ferske verdier fra punktbiblioteket, så
    endringer gjort via andre løyper slår inn ved åpning.
    """
    sti = _sti_for(segment_id)
    if not sti.exists():
        raise FileNotFoundError("Fant ikke segment med id {}".format(segment_id))
    detail = SegmentDetail.model_validate_json(sti.read_text(encoding="utf-8"))
    punktbibliotek.flett_inn(detail.waypoints)
    return detail


def delete_segment(segment_id: str) -> None:
    """Slett et lagret segment. FileNotFoundError hvis det ikke finnes."""
    sti = _sti_for(segment_id)
    if not sti.exists():
        raise FileNotFoundError("Fant ikke segment med id {}".format(segment_id))
    sti.unlink()


# ---- Organisering av biblioteket (grupper og rekkefølge) ----


def _avstem_bibliotek(
    struktur: LibraryStructure, kjente_ids: List[str], id_type: str
) -> LibraryStructure:
    """Avstem en bibliotekstruktur mot id-ene som faktisk finnes (self-repair).

    Delt av segment- og arenakartbiblioteket (`id_type` = "segment" / "arena"):
      * id-er som ikke lenger finnes på disk fjernes
      * elementer som ikke er nevnt i strukturen (nye, eller lagt til utenfra)
        legges øverst på rotnivået, nyeste først
      * duplikater fjernes (en id kan bare stå ett sted)
    `kjente_ids` forutsettes sortert nyeste først.
    """
    kjente_sett = set(kjente_ids)
    sett_brukt = set()

    # Gruppene: behold bare gyldige, ubrukte id-er, i lagret rekkefølge
    grupper = {}
    for entry in struktur.root:
        if entry.type == "group" and entry.name and entry.name not in grupper:
            ids = []
            for sid in struktur.groups.get(entry.name, []):
                if sid in kjente_sett and sid not in sett_brukt:
                    ids.append(sid)
                    sett_brukt.add(sid)
            grupper[entry.name] = ids

    # Rotnivået: gyldige grupper og elementer i lagret rekkefølge
    root = []
    for entry in struktur.root:
        if entry.type == "group" and entry.name in grupper:
            if not any(e.type == "group" and e.name == entry.name for e in root):
                root.append(LibraryEntry(type="group", name=entry.name))
        elif entry.type == id_type and entry.id in kjente_sett and entry.id not in sett_brukt:
            root.append(LibraryEntry(type=id_type, id=entry.id))
            sett_brukt.add(entry.id)

    # Elementer som ikke er nevnt noe sted: øverst på rota, nyeste først
    nye = [sid for sid in kjente_ids if sid not in sett_brukt]
    root = [LibraryEntry(type=id_type, id=sid) for sid in nye] + root

    return LibraryStructure(root=root, groups=grupper)


def _les_struktur(fil: Path) -> LibraryStructure:
    try:
        return LibraryStructure.model_validate_json(fil.read_text(encoding="utf-8"))
    except Exception:
        return LibraryStructure()


def load_library() -> LibraryStructure:
    """Les segmentbiblioteket og avstem det mot segmentene som finnes."""
    kjente = [s.id for s in list_segments()]  # nyeste først
    return _avstem_bibliotek(_les_struktur(LIBRARY_FILE), kjente, "segment")


def save_library(struktur: LibraryStructure) -> LibraryStructure:
    """Lagre segmentbiblioteket. Returnerer den avstemte varianten."""
    LIBRARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    LIBRARY_FILE.write_text(struktur.model_dump_json(indent=2), encoding="utf-8")
    # Les tilbake gjennom avstemmingen, så svaret alltid er gyldig
    return load_library()


def load_arena_library() -> LibraryStructure:
    """Les arenakartbiblioteket og avstem det mot arenakartene som finnes."""
    from . import arena_lagring  # lokal import: unngå importsyklus på modulnivå
    kjente = [a.id for a in arena_lagring.list_arenaer()]  # nyeste først
    return _avstem_bibliotek(_les_struktur(ARENA_LIBRARY_FILE), kjente, "arena")


def save_arena_library(struktur: LibraryStructure) -> LibraryStructure:
    """Lagre arenakartbiblioteket. Returnerer den avstemte varianten."""
    ARENA_LIBRARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    ARENA_LIBRARY_FILE.write_text(struktur.model_dump_json(indent=2), encoding="utf-8")
    return load_arena_library()


def load_video_library() -> LibraryStructure:
    """Les videobiblioteket og avstem det mot videoene som finnes."""
    from . import video_lagring  # lokal import: unngå importsyklus på modulnivå
    kjente = [v["id"] for v in video_lagring.les_index()]  # nyeste først
    return _avstem_bibliotek(_les_struktur(VIDEO_LIBRARY_FILE), kjente, "video")


def save_video_library(struktur: LibraryStructure) -> LibraryStructure:
    """Lagre videobiblioteket. Returnerer den avstemte varianten."""
    VIDEO_LIBRARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    VIDEO_LIBRARY_FILE.write_text(struktur.model_dump_json(indent=2), encoding="utf-8")
    return load_video_library()
