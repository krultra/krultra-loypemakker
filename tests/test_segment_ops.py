"""Tester for klipping (slice) og sammenslåing (merge) av punktlister."""
import pytest

from backend.models import Point
from backend.segment_ops import merge_segments, slice_segment


def _punkter(antall, lon_start=10.0):
    """Lag `antall` punkter med stigende lengdegrad, så de kan skilles fra hverandre."""
    return [Point(lat=59.0, lon=lon_start + i * 0.001) for i in range(antall)]


class TestSliceSegment:
    def test_klipper_inklusivt_i_begge_ender(self):
        punkter = _punkter(10)
        resultat = slice_segment(punkter, 2, 5)
        assert len(resultat) == 4
        assert resultat[0] == punkter[2]
        assert resultat[-1] == punkter[5]

    def test_hele_lista(self):
        punkter = _punkter(5)
        assert slice_segment(punkter, 0, 4) == punkter

    def test_ett_punkt(self):
        punkter = _punkter(5)
        assert slice_segment(punkter, 3, 3) == [punkter[3]]

    def test_ugyldige_grenser_gir_feil(self):
        punkter = _punkter(5)
        with pytest.raises(ValueError):
            slice_segment(punkter, -1, 3)
        with pytest.raises(ValueError):
            slice_segment(punkter, 0, 5)
        with pytest.raises(ValueError):
            slice_segment(punkter, 4, 2)  # start etter slutt


class TestMergeSegments:
    def test_vanlig_sammenslåing(self):
        a = _punkter(10, lon_start=10.0)
        b = _punkter(10, lon_start=20.0)
        resultat = merge_segments(a, 4, b, 6)
        # A fra start til og med indeks 4 (5 punkter) + B fra indeks 6 og ut (4 punkter)
        assert len(resultat) == 5 + 4
        assert resultat[:5] == a[:5]
        assert resultat[5:] == b[6:]

    def test_deling_ved_første_punkt(self):
        a = _punkter(5, lon_start=10.0)
        b = _punkter(5, lon_start=20.0)
        resultat = merge_segments(a, 0, b, 0)
        assert resultat == [a[0]] + b

    def test_deling_ved_siste_punkt(self):
        a = _punkter(5, lon_start=10.0)
        b = _punkter(5, lon_start=20.0)
        resultat = merge_segments(a, 4, b, 4)
        assert resultat == a + [b[4]]

    def test_delingspunkt_utenfor_lista_gir_feil(self):
        a = _punkter(5)
        b = _punkter(5)
        with pytest.raises(ValueError):
            merge_segments(a, 5, b, 0)
        with pytest.raises(ValueError):
            merge_segments(a, 0, b, -1)
