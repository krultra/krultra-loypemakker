"""Tester for arenakartbiblioteket — samme avstemmingslogikk som segmentene."""
import pytest

from backend import arena_lagring, storage
from backend.models import ArenaSaveRequest, LibraryEntry, LibraryStructure


@pytest.fixture
def tom_datamappe(tmp_path, monkeypatch):
    """Pek arena- og bibliotek-lagringen mot en midlertidig mappe per test."""
    monkeypatch.setattr(arena_lagring, "DATA_DIR", tmp_path / "arenaer")
    monkeypatch.setattr(storage, "ARENA_LIBRARY_FILE", tmp_path / "arena-library.json")
    return tmp_path


def _lagre_arena(navn):
    return arena_lagring.opprett_arena(ArenaSaveRequest(navn=navn)).id


def test_tom_start_gir_alle_arenaer_på_rot(tom_datamappe):
    id1 = _lagre_arena("Teveltunet")
    id2 = _lagre_arena("Sekretariat")
    struktur = storage.load_arena_library()
    ids = [e.id for e in struktur.root if e.type == "arena"]
    assert set(ids) == {id1, id2}
    assert struktur.groups == {}


def test_lagret_struktur_bevares_og_nye_havner_øverst(tom_datamappe):
    id1 = _lagre_arena("Teveltunet")
    storage.save_arena_library(LibraryStructure(
        root=[LibraryEntry(type="group", name="MMC")],
        groups={"MMC": [id1]},
    ))
    id2 = _lagre_arena("Ny arena")  # ikke nevnt i strukturen

    struktur = storage.load_arena_library()
    assert struktur.groups["MMC"] == [id1]
    assert struktur.root[0].type == "arena" and struktur.root[0].id == id2
    assert struktur.root[1].type == "group" and struktur.root[1].name == "MMC"


def test_slettede_arenaer_fjernes_fra_strukturen(tom_datamappe):
    id1 = _lagre_arena("A")
    id2 = _lagre_arena("B")
    storage.save_arena_library(LibraryStructure(
        root=[LibraryEntry(type="group", name="MMC")],
        groups={"MMC": [id1, id2]},
    ))
    arena_lagring.slett_arena(id1)

    struktur = storage.load_arena_library()
    assert struktur.groups["MMC"] == [id2]


def test_arena_og_segment_bibliotek_er_uavhengige(tom_datamappe, monkeypatch):
    """Arena-strukturen skal ikke blande seg med segmentbiblioteket."""
    monkeypatch.setattr(storage, "DATA_DIR", tom_datamappe / "segments")
    monkeypatch.setattr(storage, "LIBRARY_FILE", tom_datamappe / "library.json")
    aid = _lagre_arena("Teveltunet")
    struktur = storage.load_arena_library()
    assert [e.id for e in struktur.root if e.type == "arena"] == [aid]
    # Segmentbiblioteket er tomt (ingen segmenter lagret)
    assert storage.load_library().root == []


def test_ødelagt_fil_gir_frisk_struktur(tom_datamappe):
    id1 = _lagre_arena("Teveltunet")
    storage.ARENA_LIBRARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    storage.ARENA_LIBRARY_FILE.write_text("{ugyldig json", encoding="utf-8")
    struktur = storage.load_arena_library()
    assert [e.id for e in struktur.root] == [id1]
