"""Tester for opptaksmanus og videoer i flere oppløsninger.

To ting som henger sammen med videoeksporten i 4.1.0:

  * manus_lagring — manuset som beskriver hvordan videoen skal spilles inn
  * video_lagring — samme opptak lagret i flere oppløsninger, og at
    oppføringer fra før varianter fantes fortsatt leses riktig
"""
import json

import pytest

from backend import manus_lagring, video_lagring, video_publisering


@pytest.fixture
def manusmappe(tmp_path, monkeypatch):
    monkeypatch.setattr(manus_lagring, "DATA_DIR", tmp_path / "manus")
    return tmp_path


@pytest.fixture
def videomappe(tmp_path, monkeypatch):
    monkeypatch.setattr(video_lagring, "DATA_DIR", tmp_path / "videoer")
    monkeypatch.setattr(video_lagring, "INDEX_FIL", tmp_path / "videoer" / "index.json")
    return tmp_path


class TestManusLagring:
    def test_tomt_naar_ikke_satt(self, manusmappe):
        assert manus_lagring.les("aabbccdd") is None

    def test_skriv_og_les(self, manusmappe):
        manus = {"versjon": 1, "sprak": ["no", "en"],
                 "kamera": [{"km": 1.5, "pitch": 55, "fart": 0}]}
        manus_lagring.skriv("aabbccdd", manus)
        assert manus_lagring.les("aabbccdd") == manus

    def test_overskriver(self, manusmappe):
        manus_lagring.skriv("aabbccdd", {"versjon": 1, "kamera": []})
        manus_lagring.skriv("aabbccdd", {"versjon": 1, "kamera": [{"km": 3}]})
        assert manus_lagring.les("aabbccdd")["kamera"] == [{"km": 3}]

    def test_slett(self, manusmappe):
        manus_lagring.skriv("aabbccdd", {"versjon": 1})
        manus_lagring.slett("aabbccdd")
        assert manus_lagring.les("aabbccdd") is None
        manus_lagring.slett("aabbccdd")        # skal ikke feile andre gang

    def test_avviser_rar_id(self, manusmappe):
        # Id-en havner i et filnavn, så den må ikke kunne peke ut av mappa
        for rar in ["../hemmelig", "AABBCCDD", "kort", ""]:
            with pytest.raises(ValueError):
                manus_lagring.les(rar)

    def test_avviser_for_stort(self, manusmappe):
        with pytest.raises(ValueError):
            manus_lagring.skriv("aabbccdd", {"fyll": "x" * (manus_lagring.MAKS_BYTE + 10)})

    def test_odelagt_fil_gir_none(self, manusmappe):
        manus_lagring.skriv("aabbccdd", {"versjon": 1})
        (manusmappe / "manus" / "aabbccdd.json").write_text("{ ikke json", encoding="utf-8")
        assert manus_lagring.les("aabbccdd") is None


def _filer():
    return [
        {"innhold": b"FULL" * 100, "mime": "video/mp4", "merke": "full",
         "bredde": 1920, "hoyde": 1080},
        {"innhold": b"WEB" * 50, "mime": "video/mp4", "merke": "web",
         "bredde": 1280, "hoyde": 720},
    ]


class TestVideovarianter:
    def test_lagrer_begge_filene(self, videomappe):
        v = video_lagring.lagre(_filer(), "Testvideo", varighet=12.5, sprak="no")
        assert [x["merke"] for x in v["varianter"]] == ["full", "web"]
        for var in v["varianter"]:
            assert (videomappe / "videoer" / var["fil"]).exists()

    def test_toppnivaa_peker_paa_hovedvarianten(self, videomappe):
        v = video_lagring.lagre(_filer(), "Testvideo")
        assert v["bredde"] == 1920
        assert v["fil"] == v["varianter"][0]["fil"]
        assert v["storrelse"] == len(b"FULL" * 100)

    def test_velger_riktig_variant(self, videomappe):
        v = video_lagring.lagre(_filer(), "Testvideo")
        assert video_lagring.variant(v["id"], "web")["bredde"] == 1280
        assert video_lagring.variant(v["id"], "full")["bredde"] == 1920
        # Ukjent merke skal falle tilbake til hovedfila, ikke feile
        assert video_lagring.variant(v["id"], "tull")["bredde"] == 1920
        assert video_lagring.variant(v["id"])["bredde"] == 1920

    def test_sletting_tar_alle_filene(self, videomappe):
        v = video_lagring.lagre(_filer(), "Testvideo")
        stier = [videomappe / "videoer" / x["fil"] for x in v["varianter"]]
        video_lagring.slett(v["id"])
        assert not any(s.exists() for s in stier)

    def test_gammel_oppforing_uten_varianter(self, videomappe):
        """Videoer lagret før 4.1.0 har ingen `varianter` — de skal virke."""
        mappe = videomappe / "videoer"
        mappe.mkdir(parents=True)
        (mappe / "deadbeef.mp4").write_bytes(b"GAMMEL")
        (mappe / "index.json").write_text(json.dumps([{
            "id": "deadbeef", "navn": "Gammel", "fil": "deadbeef.mp4",
            "mime": "video/mp4", "bredde": 1920, "hoyde": 1080, "storrelse": 6,
        }]), encoding="utf-8")

        varianter = video_lagring.varianter_for(video_lagring.hent("deadbeef"))
        assert [x["merke"] for x in varianter] == ["full"]
        assert video_lagring.sti_for("deadbeef").name == "deadbeef.mp4"

    def test_avviser_ukjent_format(self, videomappe):
        with pytest.raises(ValueError):
            video_lagring.lagre(
                [{"innhold": b"x", "mime": "video/avi", "merke": "full"}], "Rar")

    def test_avviser_tom_opplasting(self, videomappe):
        with pytest.raises(ValueError):
            video_lagring.lagre([], "Tom")


class TestVideodataTilPublisering:
    def test_varianter_med_i_dataene(self, videomappe):
        v = video_lagring.lagre(_filer(), "Testvideo", varighet=12.5)
        varianter = [
            {"fil": "flyover.mp4", "mime": "video/mp4", "bredde": 1920,
             "hoyde": 1080, "storrelse": 400},
            {"fil": "flyover-web.mp4", "mime": "video/mp4", "bredde": 1280,
             "hoyde": 720, "storrelse": 150},
        ]
        data = video_publisering.bygg_video_data(v, varianter, "Tittel")
        # Toppnivået beskriver hovedvarianten, så en eldre video.js som
        # ikke kjenner `varianter` spiller av akkurat som før
        assert data["fil"] == "flyover.mp4"
        assert data["bredde"] == 1920
        assert [x["bredde"] for x in data["varianter"]] == [1920, 1280]
