"""Rene funksjoner for å klippe og slå sammen punktlister.

"Rene" betyr: ingen filer, ingen nettverk, ingen bivirkninger — bare
liste inn, liste ut. Det gjør dem enkle å teste og umulige å misforstå.

Merk at ingen av funksjonene rører tidsstempler. Sammenslåing er rent
strukturelt; tidsopprydding skjer først ved eksport (timestamps.py).
"""
from typing import List

from .models import Point


def slice_segment(points: List[Point], start_idx: int, end_idx: int) -> List[Point]:
    """Klipp ut punktene fra start_idx til og med end_idx.

    Begge indekser er inkludert i resultatet (0-basert).
    Kaster ValueError hvis indeksene er utenfor lista eller i feil rekkefølge.
    """
    if not (0 <= start_idx <= end_idx < len(points)):
        raise ValueError(
            "Ugyldig utsnitt: start={}, slutt={}, antall punkter={}".format(
                start_idx, end_idx, len(points)
            )
        )
    return points[start_idx : end_idx + 1]


def merge_segments(
    points_a: List[Point], split_a: int, points_b: List[Point], split_b: int
) -> List[Point]:
    """Slå sammen to punktlister ved angitte delingspunkter.

    Resultat: A fra start til og med split_a, deretter B fra split_b og
    ut til slutten. Delingspunktene er 0-baserte indekser inn i hver liste.

    Kaster ValueError hvis et delingspunkt er utenfor sin liste.
    """
    if not (0 <= split_a < len(points_a)):
        raise ValueError(
            "Delingspunktet i segment A ({}) er utenfor lista (0–{})".format(
                split_a, len(points_a) - 1
            )
        )
    if not (0 <= split_b < len(points_b)):
        raise ValueError(
            "Delingspunktet i segment B ({}) er utenfor lista (0–{})".format(
                split_b, len(points_b) - 1
            )
        )
    return points_a[: split_a + 1] + points_b[split_b:]
