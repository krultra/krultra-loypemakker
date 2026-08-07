"""Lagring av flyover-videoer som filer på disk.

Hver video lagres som to ting:
  data/videoer/<id>.mp4 (eller .webm)  — selve fila
  data/videoer/index.json              — lista med navn, lengde, størrelse …

Samme flate-fil-prinsipp som segmentene: ingen database, alt kan åpnes
og sikkerhetskopieres med vanlige verktøy. Videoene kan bli store, så
lista holdes atskilt fra filene og leses uten å røre dem.

VARIANTER

En video kan finnes i flere oppløsninger av nøyaktig samme opptak: en
full fil og en lettere «nettversjon». Grunnen er at H.264 IKKE tilpasser
seg visningsvinduet — en 1080p-fil lastes ned i sin helhet også når den
spilles av i en liten iframe eller på en mobil. Ved publisering legges
begge ut, og siden velger fila ut fra hvor stor skjermen faktisk er.

Variantene ligger som <id>-<merke>.mp4 ved siden av hovedfila, og
beskrives i `varianter`-lista i indeksen. Toppnivåfeltene (fil, bredde,
hoyde, storrelse, mime) peker fortsatt på fullversjonen, så oppføringer
laget før varianter fantes leses uendret.
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


def _trygt_merke(merke: str) -> str:
    """Merkelappen på en variant («full», «web») — brukes i filnavnet."""
    rent = re.sub(r"[^a-z0-9]+", "", (merke or "full").lower())
    return rent[:12] or "full"


def lagre(
    filer: "list[dict]",
    navn: str,
    loype: Optional[str] = None,
    varighet: Optional[float] = None,
    sprak: Optional[str] = None,
) -> dict:
    """Legg en ny video i biblioteket og returner oppføringa.

    `filer` er én eller flere varianter av det SAMME opptaket:
        [{"innhold": bytes, "mime": str, "merke": "full"|"web",
          "bredde": int, "hoyde": int}, ...]
    Den første regnes som hovedvarianten.
    """
    if not filer:
        raise ValueError("Ingen videofil ble lastet opp.")
    total = sum(len(f.get("innhold") or b"") for f in filer)
    if not total:
        raise ValueError("Videofila var tom.")
    if total > MAKS_BYTE:
        raise ValueError(
            "Videoen er for stor ({} MB). Ta opp en kortere video.".format(
                total // (1024 * 1024)
            )
        )

    _sørg_for_mappe()
    vid = uuid.uuid4().hex[:8]
    varianter = []
    brukte = set()
    for i, f in enumerate(filer):
        innhold = f.get("innhold") or b""
        if not innhold:
            continue
        mime = (f.get("mime") or "").split(";")[0].strip().lower()
        endelse = endelse_for(mime)
        merke = _trygt_merke(f.get("merke") or ("full" if i == 0 else "v{}".format(i)))
        while merke in brukte:                 # to varianter kan ikke dele filnavn
            merke += "x"
        brukte.add(merke)
        filnavn = "{}-{}.{}".format(vid, merke, endelse)
        (DATA_DIR / filnavn).write_bytes(innhold)
        varianter.append({
            "merke": merke,
            "fil": filnavn,
            "mime": mime,
            "bredde": int(f["bredde"]) if f.get("bredde") else None,
            "hoyde": int(f["hoyde"]) if f.get("hoyde") else None,
            "storrelse": len(innhold),
        })

    if not varianter:
        raise ValueError("Videofila var tom.")

    hoved = varianter[0]
    oppføring = {
        "id": vid,
        "navn": _trygt_navn(navn),
        # Toppnivåfeltene speiler hovedvarianten, så eldre kode (og
        # publisering av gamle oppføringer) leser som før.
        "fil": hoved["fil"],
        "mime": hoved["mime"],
        "loype": loype or None,
        "sprak": (sprak or "no").lower()[:5],
        "varighet": round(float(varighet), 1) if varighet else None,
        "bredde": hoved["bredde"],
        "hoyde": hoved["hoyde"],
        "storrelse": hoved["storrelse"],
        "varianter": varianter,
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


def varianter_for(v: dict) -> "list[dict]":
    """Variantene til en oppføring — også for de gamle uten `varianter`."""
    liste = v.get("varianter")
    if isinstance(liste, list) and liste:
        return liste
    return [{
        "merke": "full",
        "fil": v.get("fil"),
        "mime": v.get("mime"),
        "bredde": v.get("bredde"),
        "hoyde": v.get("hoyde"),
        "storrelse": v.get("storrelse"),
    }]


def variant(vid: str, merke: Optional[str] = None) -> dict:
    """Én variant av en video. Ukjent merke faller tilbake til hovedfila."""
    v = hent(vid)
    if not v:
        raise ValueError("Fant ingen video med id {}".format(vid))
    liste = varianter_for(v)
    if merke:
        for var in liste:
            if var.get("merke") == merke:
                return var
    return liste[0]


def sti_for(vid: str, merke: Optional[str] = None) -> Path:
    var = variant(vid, merke)
    if not var.get("fil"):
        raise ValueError("Videoen mangler fil.")
    sti = DATA_DIR / var["fil"]
    if not sti.exists():
        raise ValueError("Videofila mangler på disk: {}".format(var["fil"]))
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
    for var in varianter_for(funnet):
        if not var.get("fil"):
            continue
        fil = DATA_DIR / var["fil"]
        if fil.exists():
            fil.unlink()
    _skriv_index(beholdt)
