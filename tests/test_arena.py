"""Tester for arenakart: lagring (round-trip) og publisering (filstruktur)."""
import json

import pytest

from backend import arena_lagring, arena_publisering, publisering
from backend.models import ArenaContact, ArenaFeature, ArenaSaveRequest, ArenaType


@pytest.fixture
def arena_datamappe(tmp_path, monkeypatch):
    """Isoler arena-lagringen til en midlertidig mappe."""
    monkeypatch.setattr(arena_lagring, "DATA_DIR", tmp_path / "arenaer")
    return tmp_path / "arenaer"


def _lag_request():
    return ArenaSaveRequest(
        navn="Teveltunet",
        typer=[ArenaType(id="t1", navn="Servering", farge="#22c55e")],
        kontakter=[
            ArenaContact(id="k1", tittel="Løpsleder", navn="Torgeir Kruke",
                         telefon="913 51 909", epost="t@mmctrail.no",
                         gyldig_fra="2026-08-15T08:00"),
        ],
        features=[
            ArenaFeature(id="f1", navn="Mål", type_id="t1", form="punkt",
                         geometri=[[0.5, 0.5]], kontakt_ids=["k1"]),
            ArenaFeature(id="f2", navn="Messeområde", type_id="t1", form="polygon",
                         geometri=[[0.1, 0.1], [0.3, 0.1], [0.2, 0.3]]),
        ],
    )


class TestArenaLagring:
    def test_opprett_og_hent_round_trip(self, arena_datamappe):
        opprettet = arena_lagring.opprett_arena(_lag_request())
        hentet = arena_lagring.hent_arena(opprettet.id)
        assert hentet.navn == "Teveltunet"
        assert len(hentet.features) == 2
        assert hentet.typer[0].farge == "#22c55e"
        assert hentet.har_bilde is False

    def test_kontakter_round_trip(self, arena_datamappe):
        """Kontakter og kobling til steder (kontakt_ids) bevares."""
        opprettet = arena_lagring.opprett_arena(_lag_request())
        hentet = arena_lagring.hent_arena(opprettet.id)
        assert [k.tittel for k in hentet.kontakter] == ["Løpsleder"]
        assert hentet.kontakter[0].telefon == "913 51 909"
        assert hentet.kontakter[0].gyldig_fra == "2026-08-15T08:00"
        f1 = next(f for f in hentet.features if f.id == "f1")
        assert f1.kontakt_ids == ["k1"]

    def test_oppdater_bevarer_bilde(self, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        arena_lagring.lagre_bilde(a.id, b"\x89PNG-fake", "png", 800, 600)
        req = _lag_request()
        req.navn = "Nytt navn"
        oppdatert = arena_lagring.oppdater_arena(a.id, req)
        assert oppdatert.navn == "Nytt navn"
        assert oppdatert.bilde_fil == "bilde.png"
        assert oppdatert.bilde_bredde == 800

    def test_list_nyeste_forst(self, arena_datamappe):
        a1 = arena_lagring.opprett_arena(_lag_request())
        a2 = arena_lagring.opprett_arena(_lag_request())
        ider = [s.id for s in arena_lagring.list_arenaer()]
        assert set(ider) == {a1.id, a2.id}

    def test_slett(self, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        arena_lagring.slett_arena(a.id)
        with pytest.raises(FileNotFoundError):
            arena_lagring.hent_arena(a.id)

    def test_ugyldig_id_gir_feil(self, arena_datamappe):
        with pytest.raises(FileNotFoundError):
            arena_lagring.hent_arena("../etc")


class TestArenaPublisering:
    @pytest.fixture
    def mål(self, tmp_path, monkeypatch, arena_datamappe):
        konfig = {"mål": [{"navn": "test", "type": "mappe",
                           "mappe": str(tmp_path / "ut"), "baseUrl": "https://x.no"}]}
        konfigfil = tmp_path / "publisering.json"
        konfigfil.write_text(json.dumps(konfig), encoding="utf-8")
        monkeypatch.setattr(publisering, "KONFIG_FIL", konfigfil)
        return tmp_path / "ut"

    def test_publiser_filstruktur(self, mål, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        arena_lagring.lagre_bilde(a.id, b"\x89PNG-fake", "png", 800, 600)
        arena = arena_lagring.hent_arena(a.id)

        res = arena_publisering.publiser_arena("test", "mmc-70k", "teveltunet", arena)
        assert res["url"] == "https://x.no/mmc-70k/teveltunet/"

        v = arena_publisering.ARENA_ASSET_VERSJON
        assert (mål / "arena-assets" / f"v{v}" / "arena.js").exists()
        assert (mål / "arena-assets" / f"v{v}" / "leaflet.js").exists()
        index = (mål / "mmc-70k" / "teveltunet" / "index.html").read_text(encoding="utf-8")
        assert f"../../arena-assets/v{v}/" in index
        assert "__V__" not in index
        arena_json = json.loads(
            (mål / "mmc-70k" / "teveltunet" / "arena.json").read_text(encoding="utf-8"))
        assert arena_json["navn"] == "Teveltunet"
        assert len(arena_json["features"]) == 2
        assert [k["tittel"] for k in arena_json["kontakter"]] == ["Løpsleder"]
        assert (mål / "mmc-70k" / "teveltunet" / "bilde.png").read_bytes() == b"\x89PNG-fake"

    def test_publiser_uten_bilde_feiler(self, mål, arena_datamappe):
        arena = arena_lagring.opprett_arena(_lag_request())
        with pytest.raises(ValueError):
            arena_publisering.publiser_arena("test", "mmc", "teveltunet", arena)

    def test_ugyldig_slug_feiler(self, mål, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        arena_lagring.lagre_bilde(a.id, b"x", "png", 10, 10)
        arena = arena_lagring.hent_arena(a.id)
        with pytest.raises(ValueError):
            arena_publisering.publiser_arena("test", "Ugyldig Slug!", "arena", arena)
