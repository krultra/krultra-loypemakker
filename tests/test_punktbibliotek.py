"""Tester for punktbiblioteket: delte interessepunkter på tvers av løyper."""
import json

import pytest

from backend import punktbibliotek, storage
from backend.models import Point, SaveSegmentRequest, Waypoint


@pytest.fixture
def miljø(tmp_path, monkeypatch):
    """Isolert bibliotekfil og segmentmappe for hver test."""
    monkeypatch.setattr(punktbibliotek, "BIBLIOTEK_FIL", tmp_path / "waypoints.json")
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path / "segments")
    monkeypatch.setattr(storage, "LIBRARY_FILE", tmp_path / "library.json")
    return tmp_path


def _wpt(navn="Sjekkpunkt X", lat=63.0, lon=11.0, **ekstra):
    return Waypoint(lat=lat, lon=lon, ele=500.0, name=navn,
                    desc="Test", sym="Flag", type="sjekkpunkt",
                    types=["sjekkpunkt"], **ekstra)


def _segment(navn, waypoints):
    return storage.save_segment(SaveSegmentRequest(
        name=navn,
        points=[Point(lat=63.0 + i * 0.001, lon=11.0, ele=100.0) for i in range(3)],
        waypoints=waypoints,
    ))


class TestBibliotek:
    def test_opprett_og_les(self, miljø):
        delt = punktbibliotek.opprett_punkt(_wpt())
        assert len(delt.id) == 8
        punkter = punktbibliotek.les_bibliotek()
        assert [p.id for p in punkter] == [delt.id]
        assert punkter[0].name == "Sjekkpunkt X"

    def test_to_punkter_på_samme_koordinat(self, miljø):
        """Samme fysiske sted kan ha to delte punkter (ulikt tilbud per løp)."""
        a = punktbibliotek.opprett_punkt(_wpt("Skurdalssjøen 20K"))
        b = punktbibliotek.opprett_punkt(_wpt("Skurdalssjøen 70K"))
        assert a.id != b.id
        assert len(punktbibliotek.les_bibliotek()) == 2

    def test_slett(self, miljø):
        delt = punktbibliotek.opprett_punkt(_wpt())
        punktbibliotek.slett_punkt(delt.id)
        assert punktbibliotek.les_bibliotek() == []
        with pytest.raises(FileNotFoundError):
            punktbibliotek.slett_punkt(delt.id)

    def test_skriving_tar_sikkerhetskopi(self, miljø):
        """Hver skriving legger forrige innhold i .bak — så et uhell aldri
        koster mer enn én generasjon av biblioteket."""
        a = punktbibliotek.opprett_punkt(_wpt("Første"))
        punktbibliotek.opprett_punkt(_wpt("Andre"))

        bak = punktbibliotek.BIBLIOTEK_FIL.with_suffix(".json.bak")
        assert bak.exists()
        forrige = json.loads(bak.read_text(encoding="utf-8"))
        assert [p["id"] for p in forrige["punkter"]] == [a.id]  # kun «Første»


class TestFlettOgSynk:
    def test_åpning_henter_ferske_verdier(self, miljø):
        delt = punktbibliotek.opprett_punkt(_wpt("Gammelt navn"))
        seg = _segment("Løype A", [_wpt("Gammelt navn", bib_id=delt.id)])

        # Endre bibliotekpunktet «utenfra» (som om en annen løype endret det)
        punkter = punktbibliotek.les_bibliotek()
        punkter[0].name = "Nytt navn"
        punkter[0].desc = "Ny tekst"
        punktbibliotek._skriv_bibliotek(punkter)

        lastet = storage.load_segment(seg.id)
        assert lastet.waypoints[0].name == "Nytt navn"
        assert lastet.waypoints[0].desc == "Ny tekst"

    def test_lagring_synkroniserer_til_biblioteket(self, miljø):
        delt = punktbibliotek.opprett_punkt(_wpt("Før"))
        seg = _segment("Løype A", [_wpt("Før", bib_id=delt.id)])

        endret = _wpt("Etter", lat=63.001, bib_id=delt.id)
        storage.update_segment_waypoints(seg.id, [endret])

        bib = punktbibliotek.les_bibliotek()[0]
        assert bib.name == "Etter"
        assert bib.lat == 63.001

    def test_endring_spres_mellom_løyper(self, miljø):
        """Kjernebehovet: endre i én løype → de andre får det ved åpning."""
        delt = punktbibliotek.opprett_punkt(_wpt("Drikkestasjon"))
        a = _segment("MMC 20K", [_wpt("Drikkestasjon", bib_id=delt.id)])
        b = _segment("MMC 70K", [_wpt("Drikkestasjon", bib_id=delt.id)])

        storage.update_segment_waypoints(
            a.id, [_wpt("Drikkestasjon Sulsjøan", bib_id=delt.id)])

        assert storage.load_segment(b.id).waypoints[0].name == "Drikkestasjon Sulsjøan"

    def test_arena_lenke_deles_og_beholdes(self, miljø):
        """Et delt punkt tar med arenakart-lenken til andre løyper, uendret.

        Slik frontend gjør det: ved gjenbruk kopieres arena fra biblioteket
        inn i den lokale kopien, så lenken følger med til den nye løypa.
        """
        delt = punktbibliotek.opprett_punkt(_wpt("Mål", arena="mmc/teveltunet"))
        assert delt.arena == "mmc/teveltunet"

        # Gjenbrukt i «MMC 8K» med arena kopiert fra det delte punktet
        seg = _segment("MMC 8K",
                       [_wpt("Mål", bib_id=delt.id, arena=delt.arena)])
        lastet = storage.load_segment(seg.id)
        assert lastet.waypoints[0].arena == "mmc/teveltunet"

    def test_arena_endring_flettes_inn_ved_apning(self, miljø):
        """Endres arena-lenken på det delte punktet, får de andre løypene
        den ferske verdien ved åpning (flett_inn)."""
        delt = punktbibliotek.opprett_punkt(_wpt("Mål", arena="mmc/teveltunet"))
        seg = _segment("MMC 8K",
                       [_wpt("Mål", bib_id=delt.id, arena="mmc/teveltunet")])

        # Endre lenken «utenfra» (som om en annen løype endret den)
        punkter = punktbibliotek.les_bibliotek()
        punkter[0].arena = "mmc/nytt-omraade"
        punktbibliotek._skriv_bibliotek(punkter)

        lastet = storage.load_segment(seg.id)
        assert lastet.waypoints[0].arena == "mmc/nytt-omraade"

    def test_slettet_bibliotekpunkt_gir_lokal_kopi(self, miljø):
        delt = punktbibliotek.opprett_punkt(_wpt("Midlertidig"))
        seg = _segment("Løype A", [_wpt("Midlertidig", bib_id=delt.id)])
        punktbibliotek.slett_punkt(delt.id)

        lastet = storage.load_segment(seg.id)
        assert lastet.waypoints[0].bib_id is None  # frakoblet
        assert lastet.waypoints[0].name == "Midlertidig"  # kopien består

    def test_lokale_punkter_røres_ikke(self, miljø):
        punktbibliotek.opprett_punkt(_wpt("Delt"))
        seg = _segment("Løype A", [_wpt("Lokalt punkt")])  # uten bib_id
        lastet = storage.load_segment(seg.id)
        assert lastet.waypoints[0].name == "Lokalt punkt"
        assert lastet.waypoints[0].bib_id is None

    def test_etikettplassering_er_per_løype(self, miljø):
        """lab_lat/lab_lon og vis_ikon skal IKKE overskrives fra biblioteket."""
        delt = punktbibliotek.opprett_punkt(_wpt())
        seg = _segment("Løype A", [
            _wpt(bib_id=delt.id, lab_lat=63.5, lab_lon=11.5, vis_ikon=False)])
        lastet = storage.load_segment(seg.id)
        assert lastet.waypoints[0].lab_lat == 63.5
        assert lastet.waypoints[0].vis_ikon is False

    def test_snap_er_per_løype(self, miljø):
        """«Snap» beholdes lokalt, og koordinatene i biblioteket røres ikke
        selv om løypa viser punktet på nærmeste løypepunkt."""
        delt = punktbibliotek.opprett_punkt(_wpt(lat=63.0005, lon=11.002))
        seg = _segment("Løype A", [
            _wpt(lat=63.0005, lon=11.002, bib_id=delt.id, snap=True)])

        lastet = storage.load_segment(seg.id)
        assert lastet.waypoints[0].snap is True          # per løype-valget består
        assert lastet.waypoints[0].lat == 63.0005        # delt posisjon fra biblioteket

        # Lagring skal heller ikke flytte bibliotekpunktet
        storage.update_segment_waypoints(seg.id, lastet.waypoints)
        assert punktbibliotek.les_bibliotek()[0].lon == 11.002


class TestBrukOversikt:
    def test_teller_bruk_per_segment(self, miljø):
        delt = punktbibliotek.opprett_punkt(_wpt())
        _segment("MMC 20K", [_wpt(bib_id=delt.id)])
        _segment("MMC 70K", [_wpt(bib_id=delt.id)])
        _segment("MMC 8K", [_wpt()])  # lokalt punkt — telles ikke

        bruk = punktbibliotek.bruk_oversikt()
        assert sorted(bruk[delt.id]) == ["MMC 20K", "MMC 70K"]
