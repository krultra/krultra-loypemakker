"""Punktbiblioteket: delte, gjenbrukbare interessepunkter (PoI).

MMC-løypene overlapper mye, og de samme sjekkpunktene/stasjonene går
igjen i flere løyper. I stedet for å legge inn samme punkt på nytt i
hver løype, lagres delte punkter én gang her (data/waypoints.json), og
segmentene refererer til dem med `bib_id`:

  * Segmentfila beholder en LOKAL KOPI av alle feltene (så gamle filer,
    GPX-eksport og publisering virker uendret), pluss `bib_id`.
  * Ved åpning av et segment overskrives kopien med ferske verdier fra
    biblioteket (flett_inn) — endringer gjort via andre løyper slår inn.
  * Ved lagring av et segments veipunkter oppdateres bibliotekpunktene
    fra segmentet (oppdater_fra_segment) — endringer spres til alle.
  * Slettes et bibliotekpunkt, beholder segmentene sine lokale kopier;
    `bib_id` fjernes ved neste åpning og punktet blir et vanlig lokalt.

Identiteten er `bib_id` (ikke koordinatene), så to delte punkter kan
gjerne ligge på nøyaktig samme sted — f.eks. samme fysiske sjekkpunkt
med ulikt tjenestetilbud i ulike løp.
"""
import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional

from .models import DeltPunkt, Waypoint

BIBLIOTEK_FIL = Path(__file__).resolve().parent.parent / "data" / "waypoints.json"

# Feltene som deles på tvers av løyper. Etikettplassering (lab_lat/lab_lon)
# og ikonvisning (vis_ikon) er bevisst IKKE med — de er per løype, siden
# hva som er en ryddig plassering avhenger av resten av kartet.
_DELTE_FELT = ("lat", "lon", "ele", "name", "desc", "sym", "type", "types")


def les_bibliotek() -> List[DeltPunkt]:
    """Alle delte punkter. Manglende/ødelagt fil gir tom liste."""
    try:
        data = json.loads(BIBLIOTEK_FIL.read_text(encoding="utf-8"))
        return [DeltPunkt.model_validate(p) for p in data.get("punkter", [])]
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _skriv_bibliotek(punkter: List[DeltPunkt]) -> None:
    BIBLIOTEK_FIL.parent.mkdir(parents=True, exist_ok=True)
    # Sikkerhetsnett: ta vare på forrige innhold i .bak før vi skriver,
    # så et uhell (feilskriving, håndredigering) aldri koster mer enn
    # én generasjon av biblioteket.
    if BIBLIOTEK_FIL.exists():
        bak = BIBLIOTEK_FIL.with_suffix(".json.bak")
        bak.write_text(BIBLIOTEK_FIL.read_text(encoding="utf-8"), encoding="utf-8")
    data = {"punkter": [p.model_dump() for p in punkter]}
    BIBLIOTEK_FIL.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def opprett_punkt(punkt: Waypoint) -> DeltPunkt:
    """Legg et nytt delt punkt i biblioteket. Returnerer punktet med id."""
    delt = DeltPunkt(id=uuid.uuid4().hex[:8],
                     **{f: getattr(punkt, f) for f in _DELTE_FELT})
    punkter = les_bibliotek()
    punkter.append(delt)
    _skriv_bibliotek(punkter)
    return delt


def slett_punkt(bib_id: str) -> None:
    """Fjern et delt punkt. Segmentene beholder sine lokale kopier."""
    punkter = les_bibliotek()
    gjenstår = [p for p in punkter if p.id != bib_id]
    if len(gjenstår) == len(punkter):
        raise FileNotFoundError("Fant ikke delt punkt med id {}".format(bib_id))
    _skriv_bibliotek(gjenstår)


def flett_inn(waypoints: List[Waypoint]) -> List[Waypoint]:
    """Overskriv lokale kopier med ferske verdier fra biblioteket.

    Kalles når et segment lastes. Punkter med `bib_id` som ikke lenger
    finnes i biblioteket, mister referansen (blir vanlige lokale punkter).
    """
    per_id: Dict[str, DeltPunkt] = {p.id: p for p in les_bibliotek()}
    for w in waypoints:
        if not w.bib_id:
            continue
        delt = per_id.get(w.bib_id)
        if delt is None:
            w.bib_id = None  # bibliotekpunktet er slettet
            continue
        for felt in _DELTE_FELT:
            setattr(w, felt, getattr(delt, felt))
    return waypoints


def oppdater_fra_segment(waypoints: List[Waypoint]) -> None:
    """Synkroniser bibliotekpunkter fra et nettopp lagret segment.

    Endrer brukeren navn, tekst, symboler eller posisjon på et delt punkt
    i én løype, er det denne som sprer endringen til biblioteket — og
    dermed til de andre løypene ved neste åpning.
    """
    per_id = {w.bib_id: w for w in waypoints if w.bib_id}
    if not per_id:
        return
    punkter = les_bibliotek()
    endret = False
    for p in punkter:
        w = per_id.get(p.id)
        if w is None:
            continue
        for felt in _DELTE_FELT:
            if getattr(p, felt) != getattr(w, felt):
                setattr(p, felt, getattr(w, felt))
                endret = True
    if endret:
        _skriv_bibliotek(punkter)


def bruk_oversikt() -> Dict[str, List[str]]:
    """Hvilke segmenter som bruker hvert delte punkt: {bib_id: [segmentnavn]}.

    Leser segmentfilene med vanlig json (ikke pydantic) og rører ikke
    punktlistene — brukes kun av bibliotekdialogen, så et lite ventebilde
    er greit selv med store segmenter.
    """
    from . import storage  # unngå sirkulær import på modulnivå

    bruk: Dict[str, List[str]] = {}
    if not storage.DATA_DIR.exists():
        return bruk
    for fil in storage.DATA_DIR.glob("*.json"):
        try:
            data = json.loads(fil.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        navn = data.get("name") or fil.stem
        for w in data.get("waypoints") or []:
            bib_id = w.get("bib_id")
            if bib_id:
                bruk.setdefault(bib_id, []).append(navn)
    return bruk
