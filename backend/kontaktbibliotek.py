"""Kontaktbiblioteket: delte, gjenbrukbare kontakter for arenakart.

Samme arrangement har gjerne flere arenakart (oversikt + detaljkart), og de
samme kontaktene går igjen på alle: løpsleder, sekretariat, sikkerhetsvakt.
I stedet for å legge inn kontakten på nytt i hvert arenakart, lagres delte
kontakter én gang her (data/contacts.json), og arenakartene refererer til
dem med `bib_id` — nøyaktig samme mønster som punktbiblioteket:

  * Arenafila beholder en LOKAL KOPI av alle feltene (så gamle filer og
    publisering virker uendret), pluss `bib_id`.
  * Ved åpning av et arenakart overskrives kopien med ferske verdier fra
    biblioteket (flett_inn) — endringer gjort via andre arenakart slår inn.
  * Ved lagring oppdateres bibliotekkontaktene fra arenakartet
    (oppdater_fra_arena) — endringer spres til alle.
  * Slettes en bibliotekkontakt, beholder arenakartene sine lokale kopier;
    `bib_id` fjernes ved neste åpning og kontakten blir en vanlig lokal.

Identiteten er `bib_id` (ikke tittelen), så to delte kontakter gjerne kan
ha samme tittel — f.eks. «Sekretariat» for to ulike arrangementer.
"""
import json
import uuid
from pathlib import Path
from typing import Dict, List

from .models import ArenaContact, DeltKontakt

BIBLIOTEK_FIL = Path(__file__).resolve().parent.parent / "data" / "contacts.json"

# Feltene som deles på tvers av arenakart. Alt innhold deles — det er nettopp
# gjenbruk av selve kontaktopplysningene som er poenget.
_DELTE_FELT = ("tittel", "navn", "telefon", "epost", "beskrivelse",
               "gyldig_fra", "gyldig_til", "oversettelser")


def les_bibliotek() -> List[DeltKontakt]:
    """Alle delte kontakter. Manglende/ødelagt fil gir tom liste."""
    try:
        data = json.loads(BIBLIOTEK_FIL.read_text(encoding="utf-8"))
        return [DeltKontakt.model_validate(k) for k in data.get("kontakter", [])]
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _skriv_bibliotek(kontakter: List[DeltKontakt]) -> None:
    BIBLIOTEK_FIL.parent.mkdir(parents=True, exist_ok=True)
    # Sikkerhetsnett: forrige innhold tas vare på i .bak før vi skriver, så et
    # uhell aldri koster mer enn én generasjon (som i punktbiblioteket).
    if BIBLIOTEK_FIL.exists():
        bak = BIBLIOTEK_FIL.with_suffix(".json.bak")
        bak.write_text(BIBLIOTEK_FIL.read_text(encoding="utf-8"), encoding="utf-8")
    data = {"kontakter": [k.model_dump() for k in kontakter]}
    BIBLIOTEK_FIL.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def opprett_kontakt(kontakt: ArenaContact) -> DeltKontakt:
    """Legg en ny delt kontakt i biblioteket. Returnerer den med ny id."""
    delt = DeltKontakt(id=uuid.uuid4().hex[:8],
                       **{f: getattr(kontakt, f) for f in _DELTE_FELT})
    kontakter = les_bibliotek()
    kontakter.append(delt)
    _skriv_bibliotek(kontakter)
    return delt


def oppdater_kontakt(bib_id: str, kontakt: ArenaContact) -> DeltKontakt:
    """Endre en delt kontakt direkte i biblioteket (fra kontaktbiblioteket).

    Endringen slår inn i alle arenakart som bruker kontakten ved neste åpning.
    FileNotFoundError hvis id-en er ukjent.
    """
    kontakter = les_bibliotek()
    delt = next((k for k in kontakter if k.id == bib_id), None)
    if delt is None:
        raise FileNotFoundError("Fant ikke delt kontakt med id {}".format(bib_id))
    for felt in _DELTE_FELT:
        setattr(delt, felt, getattr(kontakt, felt))
    _skriv_bibliotek(kontakter)
    return delt


def slett_kontakt(bib_id: str) -> None:
    """Fjern en delt kontakt. Arenakartene beholder sine lokale kopier."""
    kontakter = les_bibliotek()
    gjenstår = [k for k in kontakter if k.id != bib_id]
    if len(gjenstår) == len(kontakter):
        raise FileNotFoundError("Fant ikke delt kontakt med id {}".format(bib_id))
    _skriv_bibliotek(gjenstår)


def flett_inn(kontakter: List[ArenaContact]) -> List[ArenaContact]:
    """Overskriv lokale kopier med ferske verdier fra biblioteket.

    Kalles når et arenakart lastes. Kontakter med `bib_id` som ikke lenger
    finnes i biblioteket, mister referansen (blir vanlige lokale kontakter).
    """
    per_id: Dict[str, DeltKontakt] = {k.id: k for k in les_bibliotek()}
    for k in kontakter:
        if not k.bib_id:
            continue
        delt = per_id.get(k.bib_id)
        if delt is None:
            k.bib_id = None  # bibliotekkontakten er slettet
            continue
        for felt in _DELTE_FELT:
            setattr(k, felt, getattr(delt, felt))
    return kontakter


def oppdater_fra_arena(kontakter: List[ArenaContact]) -> None:
    """Synkroniser bibliotekkontakter fra et nettopp lagret arenakart.

    Endrer brukeren telefonnummeret på en delt kontakt i ett arenakart, er
    det denne som sprer endringen til biblioteket — og dermed til de andre
    arenakartene ved neste åpning.
    """
    per_id = {k.bib_id: k for k in kontakter if k.bib_id}
    if not per_id:
        return
    lagrede = les_bibliotek()
    endret = False
    for delt in lagrede:
        k = per_id.get(delt.id)
        if k is None:
            continue
        for felt in _DELTE_FELT:
            if getattr(delt, felt) != getattr(k, felt):
                setattr(delt, felt, getattr(k, felt))
                endret = True
    if endret:
        _skriv_bibliotek(lagrede)


def bruk_oversikt() -> Dict[str, List[str]]:
    """Hvilke arenakart som bruker hver delte kontakt: {bib_id: [arenanavn]}.

    Leser arena.json-filene med vanlig json (ikke pydantic) — brukes kun av
    kontaktbiblioteket i venstre stolpe, så litt lesing er greit.
    """
    from . import arena_lagring  # unngå sirkulær import på modulnivå

    bruk: Dict[str, List[str]] = {}
    if not arena_lagring.DATA_DIR.exists():
        return bruk
    for mappe in arena_lagring.DATA_DIR.iterdir():
        fil = mappe / "arena.json"
        if not fil.is_file():
            continue
        try:
            data = json.loads(fil.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        navn = data.get("navn") or mappe.name
        for k in data.get("kontakter") or []:
            bib_id = k.get("bib_id")
            if bib_id:
                bruk.setdefault(bib_id, []).append(navn)
    return bruk
