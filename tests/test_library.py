"""Tester for biblioteksorganiseringen — særlig avstemmingslogikken."""
import pytest

from backend import storage
from backend.models import LibraryEntry, LibraryStructure, Point


@pytest.fixture
def tom_datamappe(tmp_path, monkeypatch):
    """Pek lagringen mot en tom midlertidig mappe for hver test."""
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path / "segments")
    monkeypatch.setattr(storage, "LIBRARY_FILE", tmp_path / "library.json")
    return tmp_path


def _lagre_segment(navn):
    from backend.models import SaveSegmentRequest

    punkter = [Point(lat=63.0, lon=11.0), Point(lat=63.001, lon=11.0)]
    return storage.save_segment(SaveSegmentRequest(name=navn, points=punkter)).id


def test_tom_start_gir_alle_segmenter_på_rot(tom_datamappe):
    id1 = _lagre_segment("Løype 1")
    id2 = _lagre_segment("Løype 2")
    struktur = storage.load_library()
    ids = [e.id for e in struktur.root if e.type == "segment"]
    assert set(ids) == {id1, id2}
    assert struktur.groups == {}


def test_lagret_struktur_bevares_og_nye_havner_øverst(tom_datamappe):
    id1 = _lagre_segment("Løype 1")
    storage.save_library(LibraryStructure(
        root=[LibraryEntry(type="group", name="MMC"),],
        groups={"MMC": [id1]},
    ))
    id2 = _lagre_segment("Løype 2")  # ny, ikke nevnt i strukturen

    struktur = storage.load_library()
    assert struktur.groups["MMC"] == [id1]
    # Den nye ligger øverst på rota, gruppa etterpå
    assert struktur.root[0].type == "segment" and struktur.root[0].id == id2
    assert struktur.root[1].type == "group" and struktur.root[1].name == "MMC"


def test_slettede_segmenter_fjernes_fra_strukturen(tom_datamappe):
    id1 = _lagre_segment("Løype 1")
    id2 = _lagre_segment("Løype 2")
    storage.save_library(LibraryStructure(
        root=[LibraryEntry(type="group", name="MMC")],
        groups={"MMC": [id1, id2]},
    ))
    storage.delete_segment(id1)

    struktur = storage.load_library()
    assert struktur.groups["MMC"] == [id2]


def test_duplikater_fjernes(tom_datamappe):
    id1 = _lagre_segment("Løype 1")
    storage.save_library(LibraryStructure(
        root=[
            LibraryEntry(type="group", name="MMC"),
            LibraryEntry(type="segment", id=id1),  # duplikat: også i gruppa
        ],
        groups={"MMC": [id1]},
    ))
    struktur = storage.load_library()
    # Id-en skal bare finnes ett sted (gruppa vant, siden den kom først i root)
    på_rot = [e.id for e in struktur.root if e.type == "segment"]
    assert struktur.groups["MMC"] == [id1]
    assert id1 not in på_rot


def test_ødelagt_fil_gir_frisk_struktur(tom_datamappe):
    id1 = _lagre_segment("Løype 1")
    storage.LIBRARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    storage.LIBRARY_FILE.write_text("{dette er ikke gyldig json", encoding="utf-8")
    struktur = storage.load_library()
    assert [e.id for e in struktur.root] == [id1]
