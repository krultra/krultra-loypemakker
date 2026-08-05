"""Lagring av flyover-videoer som filer på disk.

Hver video lagres som to ting:
  data/videoer/<id>.mp4 (eller .webm)  — selve fila
  data/videoer/index.json              — lista med navn, lengde, størrelse …

Samme flate-fil-prinsipp som segmentene: ingen database, alt kan åpnes
og sikkerhetskopieres med vanlige verktøy. Videoene kan bli store, så
lista holdes atskilt fra filene og leses uten å røre dem.
"""
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "videoer"
INDEX_FIL = DATA_DIR / "index.json"

# Formatene vi tar imot fra nettleseren. MP4 er førstevalget (spilles av
# overalt); WebM er reserven i nettlesere som ikke kan spille inn MP4.
ENDELSER = {
    "video/mp4": "mp4",
    "video/webm": "webm",
}

MAKS_BYTE = 800 * 1024 * 1024   # romslig tak, men ikke ubegrenset


def _sørg_for_mappe() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def endelse_for(mime: str) -> str:
    """Filendelsen for en mimetype. Ukjent type avvises."""
    grunn = (mime or "").split(";")[0].strip().lower()
    if grunn not in ENDELSER:
        raise ValueError("Ukjent videoformat: {}".format(mime))
    return ENDELSER[grunn]


def les_index() -> List[dict]:
    if not INDEX_FIL.exists():
        return []
    try:
        data = json.loads(INDEX_FIL.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return []
    return data if isinstance(data, list) else []


def _skriv_index(liste: List[dict]) -> None:
    _sørg_for_mappe()
    INDEX_FIL.write_text(
        json.dumps(liste, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _trygt_navn(navn: str) -> str:
    """Rydd et brukeroppgitt navn til noe som er greit å vise og lagre."""
    rent = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", (navn or "").strip())
    return rent[:120] or "Flyover"


def lagre(
    innhold: bytes,
    mime: str,
    navn: str,
    loype: Optional[str] = None,
    varighet: Optional[float] = None,
    bredde: Optional[int] = None,
    hoyde: Optional[int] = None,
) -> dict:
    """Legg en ny video i biblioteket og returner oppføringa."""
    if not innhold:
        raise ValueError("Videofila var tom.")
    if len(innhold) > MAKS_BYTE:
        raise ValueError(
            "Videoen er for stor ({} MB). Ta opp en kortere video.".format(
                len(innhold) // (1024 * 1024)
            )
        )
    endelse = endelse_for(mime)

    _sørg_for_mappe()
    vid = uuid.uuid4().hex[:8]
    filnavn = "{}.{}".format(vid, endelse)
    (DATA_DIR / filnavn).write_bytes(innhold)

    oppføring = {
        "id": vid,
        "navn": _trygt_navn(navn),
        "fil": filnavn,
        "mime": (mime or "").split(";")[0].strip().lower(),
        "loype": loype or None,
        "varighet": round(float(varighet), 1) if varighet else None,
        "bredde": int(bredde) if bredde else None,
        "hoyde": int(hoyde) if hoyde else None,
        "storrelse": len(innhold),
        "laget": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    liste = les_index()
    liste.insert(0, oppføring)   # nyeste først
    _skriv_index(liste)
    return oppføring


def hent(vid: str) -> Optional[dict]:
    for v in les_index():
        if v.get("id") == vid:
            return v
    return None


def sti_for(vid: str) -> Path:
    v = hent(vid)
    if not v:
        raise ValueError("Fant ingen video med id {}".format(vid))
    sti = DATA_DIR / v["fil"]
    if not sti.exists():
        raise ValueError("Videofila mangler på disk: {}".format(v["fil"]))
    return sti


def gi_nytt_navn(vid: str, navn: str) -> dict:
    liste = les_index()
    for v in liste:
        if v.get("id") == vid:
            v["navn"] = _trygt_navn(navn)
            _skriv_index(liste)
            return v
    raise ValueError("Fant ingen video med id {}".format(vid))


def slett(vid: str) -> None:
    liste = les_index()
    beholdt = []
    funnet = None
    for v in liste:
        if v.get("id") == vid:
            funnet = v
        else:
            beholdt.append(v)
    if not funnet:
        raise ValueError("Fant ingen video med id {}".format(vid))
    fil = DATA_DIR / funnet["fil"]
    if fil.exists():
        fil.unlink()
    _skriv_index(beholdt)
