"""Opprydding av tidsstempler — kjernen i hele verktøyet.

Problemet dette løser: GPX-filer som er spleiset sammen av biter fra
flere spor får ofte tidsstempler som hopper bakover, står stille eller
mangler helt. Mange karttjenester og GPS-klokker nekter å laste slike
filer. Løsningen er å garantere at hvert punkt har et tidsstempel som
er STRENGT STØRRE enn punktet før.

Algoritmen er én enkel, fremoverrettet regel (vi ser aldri fremover i
lista, bare på forrige UTDATA-tidsstempel):

  * Har punktet et ekte tidsstempel som er større enn forrige?
    -> Behold det (ekte fart/pauser bevares der dataene er fornuftige).
  * Ellers (tidsstempel mangler, er likt, eller går bakover)?
    -> Sett forrige tidsstempel + et fast intervall (standard 1 sekund).

Denne ene regelen dekker automatisk alle kjente problemtilfeller:
manglende tid, duplikater, spleiseskjøter der del 2 er "eldre" enn
del 1, og delvis manglende tid midt i et spor — uten spesialkode for
hvert tilfelle.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from .models import Point


def clean_timestamps(
    points: List[Point],
    default_interval_seconds: float = 1.0,
    fallback_base_time: Optional[datetime] = None,
) -> List[Point]:
    """Returner en NY punktliste der alle tidsstempler er strengt økende.

    Endrer aldri innsendt liste. Kaster aldri feil på rotete data —
    poenget er nettopp å tåle alt.

    Args:
        points: Punktene som skal ryddes, i sporrekkefølge.
        default_interval_seconds: Sekunder mellom punkter når vi må
            dikte opp tid (og minste tillatte gap ved duplikater).
        fallback_base_time: Starttid som brukes hvis første punkt
            mangler tidsstempel. Standard: nå (UTC).
    """
    if not points:
        return []

    if fallback_base_time is None:
        fallback_base_time = datetime.now(timezone.utc).replace(microsecond=0)
    elif fallback_base_time.tzinfo is None:
        fallback_base_time = fallback_base_time.replace(tzinfo=timezone.utc)

    intervall = timedelta(seconds=default_interval_seconds)
    forrige: Optional[datetime] = None
    resultat: List[Point] = []

    for p in points:
        raa = p.time
        # Sikkerhetsnett: normaliser til UTC selv om parse_gpx normalt
        # allerede har gjort det (punkter kan også komme rett fra frontend).
        if raa is not None and raa.tzinfo is None:
            raa = raa.replace(tzinfo=timezone.utc)

        if forrige is None:
            # Første punkt: bruk ekte tid om den finnes, ellers starttida.
            ny_tid = raa if raa is not None else fallback_base_time
        elif raa is not None and raa > forrige:
            # Ekte tid som går riktig vei — behold den.
            ny_tid = raa
        else:
            # Manglende, duplisert eller bakovergående tid — dytt fremover.
            ny_tid = forrige + intervall

        resultat.append(p.model_copy(update={"time": ny_tid}))
        forrige = ny_tid

    return resultat


def shift_to_start(points: List[Point], new_start: datetime) -> List[Point]:
    """Forskyv hele tidsserien slik at FØRSTE punkt får tida `new_start`.

    Alle innbyrdes tidsavstander (fart, pauser) bevares — serien flyttes
    bare i tid. Brukes når man vil at ei eksportert løype skal "starte"
    på et bestemt tidspunkt, f.eks. løpets faktiske starttid.

    Forutsetter at alle punktene har tidsstempel (kjør clean_timestamps
    først). Uten tidssone tolkes `new_start` som lokal tid på maskinen —
    det naturlige for et lokalt verktøy der bruker og server er samme PC.
    """
    if not points:
        return []
    if new_start.tzinfo is None:
        new_start = new_start.astimezone()  # tolkes som maskinens lokale tid
    delta = new_start - points[0].time
    return [p.model_copy(update={"time": p.time + delta}) for p in points]
