"""Lagring av opptaksmanus — én fil per segment.

Et manus beskriver hvordan en flyover-video skal spilles inn:
kamerapunkter, hva som skjer ved hvert sjekkpunkt, plakater ved start og
slutt, språk og oppløsninger. Det hører til LØYPA, ikke til den enkelte
videoen — man justerer manuset og tar opp på nytt.

  data/manus/<segment_id>.json

Samme flate-fil-prinsipp som ellers i KUL: ingen database, alt kan åpnes
i Notisblokk. Manuset ligger for seg selv og ikke inne i segmentfila,
fordi segmentfilene er store (alle sporpunktene) og skrives om ved hver
minste redigering — et manus skal kunne endres uten å røre punktene.

Innholdet lagres slik frontend sendte det. Frontend (manus.js) har sin
egen normalisering som fyller inn felt som mangler og klemmer verdier på
plass, og den kjøres på alt som leses inn. Da kan manusformatet vokse
uten at backend må vite noe om det.
"""
import json
import re
from pathlib import Path
from typing import Optional

from .data_paths import DATA_ROOT

DATA_DIR = DATA_ROOT / "manus"

# Samme id-format som segmentene (uuid4().hex[:8]). Sjekken hindrer at
# rare verdier i URL-en kan peke utenfor data-mappa.
_GYLDIG_ID = re.compile(r"^[a-f0-9]{8}$")

# Et manus er noen få kilobyte. Taket er en sikring mot at et ødelagt
# eller ondsinnet kall fyller opp disken.
MAKS_BYTE = 512 * 1024


def _sti_for(segment_id: str) -> Path:
    if not _GYLDIG_ID.match(segment_id or ""):
        raise ValueError("Ugyldig segment-id: {}".format(segment_id))
    return DATA_DIR / "{}.json".format(segment_id)


def les(segment_id: str) -> Optional[dict]:
    """Manuset for et segment, eller None hvis det ikke finnes."""
    sti = _sti_for(segment_id)
    if not sti.exists():
        return None
    try:
        data = json.loads(sti.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None          # ødelagt fil — behandles som «ikke satt»
    return data if isinstance(data, dict) else None


def skriv(segment_id: str, manus: dict) -> dict:
    """Lagre manuset for et segment. Returnerer det som ble lagret."""
    sti = _sti_for(segment_id)
    if not isinstance(manus, dict):
        raise ValueError("Manuset må være et objekt.")
    tekst = json.dumps(manus, ensure_ascii=False, indent=2)
    if len(tekst.encode("utf-8")) > MAKS_BYTE:
        raise ValueError("Manuset er for stort.")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    sti.write_text(tekst, encoding="utf-8")
    return manus


def slett(segment_id: str) -> None:
    """Fjern manuset for et segment. Stille hvis det ikke fantes."""
    sti = _sti_for(segment_id)
    if sti.exists():
        sti.unlink()
