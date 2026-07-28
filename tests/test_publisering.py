"""Tester for publisering av løypevisninger (RDP, course.json, mappe-mål)."""
import json
import math

import pytest

from backend import publisering
from backend.models import Point, Waypoint


def _spor(antall=200):
    """Et syntetisk spor: rett linje med en «hump» på midten."""
    punkter = []
    for i in range(antall):
        lat = 63.0 + i * 0.0005
        lon = 11.0 + (0.002 if 90 <= i <= 110 else 0.0)  # avstikker på midten
        punkter.append(Point(lat=lat, lon=lon, ele=100.0 + i))
    return punkter


class TestForenklePunkter:
    def test_endepunkter_bevares(self):
        punkter = _spor()
        idx = publisering.forenkle_punkter(punkter, 3.0)
        assert idx[0] == 0
        assert idx[-1] == len(punkter) - 1

    def test_rett_linje_kollapser_til_få_punkter(self):
        punkter = [Point(lat=63.0 + i * 0.0005, lon=11.0) for i in range(100)]
        idx = publisering.forenkle_punkter(punkter, 3.0)
        assert len(idx) <= 5  # en rett linje trenger nesten ingen mellompunkter

    def test_humpen_bevares(self):
        punkter = _spor()
        idx = publisering.forenkle_punkter(punkter, 3.0)
        # Minst ett punkt fra avstikkeren (indeks 90–110) må være med,
        # ellers er formen ødelagt
        assert any(90 <= i <= 110 for i in idx)

    def test_maks_avvik_er_innenfor_toleransen(self):
        punkter = _spor()
        toleranse = 5.0
        idx = publisering.forenkle_punkter(punkter, toleranse)
        beholdt = [punkter[i] for i in idx]
        # Hvert utelatt punkt skal ligge nær den forenklede linja
        for i, p in enumerate(punkter):
            if i in idx:
                continue
            # finn segmentet i den forenklede lista som omslutter i
            for k in range(len(idx) - 1):
                if idx[k] < i < idx[k + 1]:
                    d = publisering._avstand_til_linje_m(p, beholdt[k], beholdt[k + 1])
                    assert d <= toleranse + 0.5  # litt slingring for avrunding
                    break

    def test_korte_lister(self):
        assert publisering.forenkle_punkter([], 3.0) == []
        p = [Point(lat=63, lon=11), Point(lat=63.001, lon=11)]
        assert publisering.forenkle_punkter(p, 3.0) == [0, 1]


class TestByggCourseJson:
    def test_struktur_og_idx_remapping(self):
        punkter = _spor()
        wpt = Waypoint(lat=punkter[100].lat, lon=punkter[100].lon,
                       name="Drikkestasjon", types=["drikke", "mat"])
        course = publisering.bygg_course_json(
            punkter, [wpt], {"navn": "Testløype", "beskrivelse": "Test"},
            {"rutefarge": "#dc2626"})

        assert course["navn"] == "Testløype"
        assert course["stil"]["rutefarge"] == "#dc2626"
        assert len(course["punkter"]) < len(punkter)  # forenklet
        # Veipunktets idx peker på et punkt nær originalposisjonen
        v = course["veipunkter"][0]
        p = course["punkter"][v["idx"]]
        avvik_m = math.hypot((p[1] - wpt.lon) * 0.45, p[0] - wpt.lat) * 111_320
        assert avvik_m < 30
        assert v["types"] == ["drikke", "mat"]

    def test_json_serialiserbar(self):
        punkter = _spor(50)
        course = publisering.bygg_course_json(punkter, [], {"navn": "X"}, {})
        json.dumps(course)  # skal ikke kaste

    def test_avstander_og_høydemeter_fra_originalsporet(self):
        """Forenklingen skal IKKE endre distanse-/høydemetertallene."""
        punkter = _spor()
        course = publisering.bygg_course_json(
            punkter, [], {"navn": "X"}, {"profil": {"utjevning": 0, "vektform": 3}})

        # Alle tre listene følger de forenklede punktene 1:1
        n = len(course["punkter"])
        assert len(course["avstander"]) == n
        assert len(course["opp"]) == n
        assert len(course["ned"]) == n

        # Sluttdistansen er originalsporets (ikke den kuttede, forenklede)
        original_km = publisering._kumulativ_km(punkter)[-1]
        assert abs(course["avstander"][-1] - original_km) < 0.001

        # Total stigning: sporet stiger 1 m per punkt → 199 m totalt
        assert abs(course["opp"][-1] - 199.0) < 0.5
        assert course["ned"][-1] == 0.0

        # Avstandene er stigende
        assert all(course["avstander"][i] <= course["avstander"][i + 1]
                   for i in range(n - 1))


class TestSnap:
    def test_snap_publiseres_på_løypa_eksakt_beholdes(self):
        punkter = _spor(80)
        # To veipunkter ~200 m øst for løypa: ett med snap, ett uten
        w_snap = Waypoint(lat=63.02, lon=11.004, name="Snappet", snap=True)
        w_eksakt = Waypoint(lat=63.02, lon=11.004, name="Eksakt", snap=False)
        course = publisering.bygg_course_json(
            punkter, [w_snap, w_eksakt], {"navn": "X"}, {})

        v_snap, v_eksakt = course["veipunkter"]
        ps = course["punkter"]
        # Snappet: publisert posisjon er selve løypepunktet det ankres til
        assert v_snap["lat"] == pytest.approx(ps[v_snap["idx"]][0], abs=1e-6)
        assert v_snap["lon"] == pytest.approx(ps[v_snap["idx"]][1], abs=1e-6)
        # Eksakt: koordinatene fra punktbiblioteket beholdes
        assert (v_eksakt["lat"], v_eksakt["lon"]) == (63.02, 11.004)


class TestPubliser:
    @pytest.fixture
    def mappemål(self, tmp_path, monkeypatch):
        konfig = {"mål": [{"navn": "test", "type": "mappe",
                            "mappe": str(tmp_path / "ut"), "baseUrl": "https://x.no/l"}]}
        konfigfil = tmp_path / "publisering.json"
        konfigfil.write_text(json.dumps(konfig), encoding="utf-8")
        monkeypatch.setattr(publisering, "KONFIG_FIL", konfigfil)
        return tmp_path / "ut"

    def test_publiser_til_mappe(self, mappemål):
        punkter = _spor(50)
        course = publisering.bygg_course_json(punkter, [], {"navn": "Test"}, {})
        resultat = publisering.publiser("test", "test-loype", course)

        assert resultat["url"] == "https://x.no/l/test-loype/"
        assert "iframe" in resultat["iframe"]
        # Filstrukturen: delte assets + per-løype-filer
        v = publisering.ASSET_VERSJON
        assert (mappemål / "assets" / f"v{v}" / "viewer.js").exists()
        assert (mappemål / "assets" / f"v{v}" / "felles.js").exists()
        assert (mappemål / "assets" / f"v{v}" / "leaflet.js").exists()
        index = (mappemål / "test-loype" / "index.html").read_text(encoding="utf-8")
        assert f"../assets/v{v}/" in index  # __V__ er byttet ut
        assert "__V__" not in index
        lagret = json.loads(
            (mappemål / "test-loype" / "course.json").read_text(encoding="utf-8"))
        assert lagret["navn"] == "Test"
        # Mangler standard_sprak → norsk (bakoverkompatibelt)
        assert lagret["standard_sprak"] == "no"

    def test_standardsprak_i_json_og_iframe(self, mappemål):
        punkter = _spor(20)
        course = publisering.bygg_course_json(
            punkter, [], {"navn": "T", "standard_sprak": "en"}, {})
        resultat = publisering.publiser("test", "en-loype", course)
        lagret = json.loads(
            (mappemål / "en-loype" / "course.json").read_text(encoding="utf-8"))
        assert lagret["standard_sprak"] == "en"
        # iframe-snutten peker med ?lang=en; den direkte URL-en holdes ren
        assert "?lang=en" in resultat["iframe"]
        assert resultat["url"].endswith("/en-loype/")

    def test_republisering_overskriver_course_json(self, mappemål):
        punkter = _spor(50)
        c1 = publisering.bygg_course_json(punkter, [], {"navn": "Versjon 1"}, {})
        publisering.publiser("test", "loype", c1)
        c2 = publisering.bygg_course_json(punkter, [], {"navn": "Versjon 2"}, {})
        publisering.publiser("test", "loype", c2)
        lagret = json.loads(
            (mappemål / "loype" / "course.json").read_text(encoding="utf-8"))
        assert lagret["navn"] == "Versjon 2"

    def test_ugyldig_slug_gir_feil(self, mappemål):
        course = publisering.bygg_course_json(_spor(10), [], {"navn": "X"}, {})
        with pytest.raises(ValueError):
            publisering.publiser("test", "Ugyldig Slug!", course)

    def test_ukjent_mål_gir_feil(self, mappemål):
        course = publisering.bygg_course_json(_spor(10), [], {"navn": "X"}, {})
        with pytest.raises(ValueError):
            publisering.publiser("finnes-ikke", "ok-slug", course)


class TestPubliserGruppe:
    """Gruppemål: publiser til flere mål (prod + failover) i én operasjon."""

    @pytest.fixture
    def gruppekonfig(self, tmp_path, monkeypatch):
        konfig = {"mål": [
            {"navn": "prod", "type": "mappe",
             "mappe": str(tmp_path / "prod"), "baseUrl": "https://x.no/l"},
            {"navn": "failover", "type": "mappe",
             "mappe": str(tmp_path / "failover"), "baseUrl": "https://x.no/l"},
            {"navn": "begge", "type": "gruppe",
             "medlemmer": ["prod", "failover"], "baseUrl": "https://x.no/l"},
            {"navn": "med-feil", "type": "gruppe",
             "medlemmer": ["prod", "finnes-ikke"], "baseUrl": "https://x.no/l"},
            {"navn": "tom", "type": "gruppe", "medlemmer": []},
        ]}
        konfigfil = tmp_path / "publisering.json"
        konfigfil.write_text(json.dumps(konfig, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(publisering, "KONFIG_FIL", konfigfil)
        return tmp_path

    def test_publiserer_til_alle_medlemmene(self, gruppekonfig):
        course = publisering.bygg_course_json(_spor(30), [], {"navn": "G"}, {})
        resultat = publisering.publiser("begge", "gruppe-test", course)
        assert resultat["url"] == "https://x.no/l/gruppe-test/"
        assert resultat["advarsel"] is None
        for mappe in ("prod", "failover"):
            assert (gruppekonfig / mappe / "gruppe-test" / "course.json").exists()
            assert (gruppekonfig / mappe / "gruppe-test" / "index.html").exists()

    def test_delvis_feil_gir_advarsel_men_publiserer_resten(self, gruppekonfig):
        course = publisering.bygg_course_json(_spor(30), [], {"navn": "G"}, {})
        resultat = publisering.publiser("med-feil", "delvis", course)
        assert (gruppekonfig / "prod" / "delvis" / "course.json").exists()
        assert "finnes-ikke" in resultat["advarsel"]

    def test_tom_gruppe_gir_feil(self, gruppekonfig):
        course = publisering.bygg_course_json(_spor(10), [], {"navn": "G"}, {})
        with pytest.raises(ValueError):
            publisering.publiser("tom", "slug-x", course)
