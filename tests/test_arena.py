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

    def test_oversettelser_round_trip_og_publisering(self, arena_datamappe, tmp_path, monkeypatch):
        # Lagring bevarer oversettelser på arena + objekter
        req = _lag_request()
        req.oversettelser = {"en": {"navn": "Arena EN"}}
        req.features[0].oversettelser = {"en": {"navn": "Finish"}}
        req.typer[0].oversettelser = {"en": {"navn": "Catering"}}
        a = arena_lagring.opprett_arena(req)
        arena_lagring.legg_til_bilde(a.id, b"x", "png", "Kart", 10, 10)
        hentet = arena_lagring.hent_arena(a.id)
        assert hentet.oversettelser["en"]["navn"] == "Arena EN"
        assert hentet.features[0].oversettelser["en"]["navn"] == "Finish"
        assert hentet.typer[0].oversettelser["en"]["navn"] == "Catering"
        # Publisering tar med alt i arena.json
        konfig = {"mål": [{"navn": "t", "type": "mappe",
                           "mappe": str(tmp_path / "ut"), "baseUrl": "https://x.no"}]}
        kfil = tmp_path / "pub.json"; kfil.write_text(json.dumps(konfig), encoding="utf-8")
        monkeypatch.setattr(publisering, "KONFIG_FIL", kfil)
        arena_publisering.publiser_arena("t", "ev", "ar", hentet)
        aj = json.loads((tmp_path / "ut" / "ev" / "ar" / "arena.json").read_text(encoding="utf-8"))
        assert aj["oversettelser"]["en"]["navn"] == "Arena EN"
        assert aj["features"][0]["oversettelser"]["en"]["navn"] == "Finish"
        assert aj["typer"][0]["oversettelser"]["en"]["navn"] == "Catering"

    def test_kontakter_round_trip(self, arena_datamappe):
        """Kontakter og kobling til steder (kontakt_ids) bevares."""
        opprettet = arena_lagring.opprett_arena(_lag_request())
        hentet = arena_lagring.hent_arena(opprettet.id)
        assert [k.tittel for k in hentet.kontakter] == ["Løpsleder"]
        assert hentet.kontakter[0].telefon == "913 51 909"
        assert hentet.kontakter[0].gyldig_fra == "2026-08-15T08:00"
        f1 = next(f for f in hentet.features if f.id == "f1")
        assert f1.kontakt_ids == ["k1"]

    def test_bilder_og_kanoniske_dims(self, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        a = arena_lagring.legg_til_bilde(a.id, b"P1", "png", "Norgeskart", 800, 500)
        a = arena_lagring.legg_til_bilde(a.id, b"P2", "png", "Satellitt", 1600, 1000)
        assert [b.navn for b in a.bilder] == ["Norgeskart", "Satellitt"]
        assert a.har_bilde is True
        # Kanoniske mål = første bildets, uansett senere bilder
        assert (a.bilde_bredde, a.bilde_høyde) == (800, 500)
        # Metadata (navn) bevares gjennom vanlig lagring
        req = _lag_request()
        req.navn = "Nytt navn"
        req.bilder = a.bilder
        oppdatert = arena_lagring.oppdater_arena(a.id, req)
        assert oppdatert.navn == "Nytt navn"
        assert [b.navn for b in oppdatert.bilder] == ["Norgeskart", "Satellitt"]

    def test_slett_bilde_rydder_referanser(self, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        a = arena_lagring.legg_til_bilde(a.id, b"P1", "png", "A", 800, 500)
        a = arena_lagring.legg_til_bilde(a.id, b"P2", "png", "B", 800, 500)
        img2 = a.bilder[1].id
        req = _lag_request()
        req.bilder = a.bilder
        req.features = [ArenaFeature(id="f1", navn="X", form="punkt",
                                     geometri=[[0.5, 0.5]], bilde_ids=[img2])]
        arena_lagring.oppdater_arena(a.id, req)
        etter = arena_lagring.slett_bilde(a.id, img2)
        assert [b.navn for b in etter.bilder] == ["A"]
        assert etter.features[0].bilde_ids == []  # referansen fjernet

    def test_migrering_fra_enkeltbilde(self, arena_datamappe, monkeypatch):
        """Eldre arena med bare bilde_fil migreres til bilder-lista ved lasting."""
        a = arena_lagring.opprett_arena(_lag_request())
        # Skriv en «gammel» arena.json manuelt (uten bilder-lista)
        import json as _json
        fil = arena_lagring._mappe_for(a.id) / "arena.json"
        data = _json.loads(fil.read_text(encoding="utf-8"))
        data["bilder"] = []
        data["bilde_fil"] = "bilde.png"
        data["bilde_bredde"] = 640
        data["bilde_høyde"] = 480
        fil.write_text(_json.dumps(data), encoding="utf-8")
        hentet = arena_lagring.hent_arena(a.id)
        assert len(hentet.bilder) == 1
        assert hentet.bilder[0].fil == "bilde.png"
        assert (hentet.bilde_bredde, hentet.bilde_høyde) == (640, 480)

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
        arena_lagring.legg_til_bilde(a.id, b"\x89PNG-fake", "png", "Kart", 800, 600)
        arena = arena_lagring.hent_arena(a.id)
        bilde_fil = arena.bilder[0].fil

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
        assert [b["navn"] for b in arena_json["bilder"]] == ["Kart"]
        assert (mål / "mmc-70k" / "teveltunet" / bilde_fil).read_bytes() == b"\x89PNG-fake"

    def test_standardsprak_i_json_og_iframe(self, mål, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        arena_lagring.legg_til_bilde(a.id, b"x", "png", "Kart", 10, 10)
        arena = arena_lagring.hent_arena(a.id)
        res = arena_publisering.publiser_arena(
            "test", "ev", "ar", arena, standard_sprak="en")
        arena_json = json.loads(
            (mål / "ev" / "ar" / "arena.json").read_text(encoding="utf-8"))
        assert arena_json["standard_sprak"] == "en"
        assert "?lang=en" in res["iframe"]
        # Uten standard_sprak → norsk (bakoverkompatibelt)
        res2 = arena_publisering.publiser_arena("test", "ev2", "ar", arena)
        aj2 = json.loads((mål / "ev2" / "ar" / "arena.json").read_text(encoding="utf-8"))
        assert aj2["standard_sprak"] == "no"

    def test_publiser_utvalg_av_bilder(self, mål, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        a = arena_lagring.legg_til_bilde(a.id, b"P1", "png", "Norgeskart", 800, 500)
        a = arena_lagring.legg_til_bilde(a.id, b"P2", "png", "Satellitt", 800, 500)
        norges_id, sat = a.bilder[0].id, a.bilder[1]
        arena = arena_lagring.hent_arena(a.id)
        arena_publisering.publiser_arena("test", "ev", "ar", arena, bilde_ids=[norges_id])
        arena_json = json.loads(
            (mål / "ev" / "ar" / "arena.json").read_text(encoding="utf-8"))
        assert [b["navn"] for b in arena_json["bilder"]] == ["Norgeskart"]
        assert (mål / "ev" / "ar" / a.bilder[0].fil).exists()
        assert not (mål / "ev" / "ar" / sat.fil).exists()  # Satellitt ikke publisert

    def test_publiser_uten_bilde_feiler(self, mål, arena_datamappe):
        arena = arena_lagring.opprett_arena(_lag_request())
        with pytest.raises(ValueError):
            arena_publisering.publiser_arena("test", "mmc", "teveltunet", arena)

    def test_ugyldig_slug_feiler(self, mål, arena_datamappe):
        a = arena_lagring.opprett_arena(_lag_request())
        arena_lagring.legg_til_bilde(a.id, b"x", "png", "Kart", 10, 10)
        arena = arena_lagring.hent_arena(a.id)
        with pytest.raises(ValueError):
            arena_publisering.publiser_arena("test", "Ugyldig Slug!", "arena", arena)
