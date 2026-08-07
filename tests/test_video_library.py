"""Tester for videobiblioteket — samme avstemmingslogikk som segmentene og
arenakartene (grupper + rekkefølge), lagt til i 4.2.0."""
import pytest

from backend import arena_lagring, storage, video_lagring
from backend.models import LibraryEntry, LibraryStructure


@pytest.fixture
def tom_datamappe(tmp_path, monkeypatch):
    """Pek video- og bibliotek-lagringen mot en midlertidig mappe per test."""
    monkeypatch.setattr(video_lagring, "DATA_DIR", tmp_path / "videoer")
    monkeypatch.setattr(video_lagring, "INDEX_FIL", tmp_path / "videoer" / "index.json")
    monkeypatch.setattr(storage, "VIDEO_LIBRARY_FILE", tmp_path / "video-library.json")
    return tmp_path


def _lagre_video(navn):
    return video_lagring.lagre(
        [{"innhold": b"data", "mime": "video/mp4", "merke": "full"}], navn,
    )["id"]


def test_tom_start_gir_alle_videoer_på_rot(tom_datamappe):
    id1 = _lagre_video("Flyover A")
    id2 = _lagre_video("Flyover B")
    struktur = storage.load_video_library()
    ids = [e.id for e in struktur.root if e.type == "video"]
    assert set(ids) == {id1, id2}
    assert struktur.groups == {}


def test_lagret_struktur_bevares_og_nye_havner_øverst(tom_datamappe):
    id1 = _lagre_video("Flyover A")
    storage.save_video_library(LibraryStructure(
        root=[LibraryEntry(type="group", name="MMC")],
        groups={"MMC": [id1]},
    ))
    id2 = _lagre_video("Ny video")  # ikke nevnt i strukturen

    struktur = storage.load_video_library()
    assert struktur.groups["MMC"] == [id1]
    assert struktur.root[0].type == "video" and struktur.root[0].id == id2
    assert struktur.root[1].type == "group" and struktur.root[1].name == "MMC"


def test_slettede_videoer_fjernes_fra_strukturen(tom_datamappe):
    id1 = _lagre_video("A")
    id2 = _lagre_video("B")
    storage.save_video_library(LibraryStructure(
        root=[LibraryEntry(type="group", name="MMC")],
        groups={"MMC": [id1, id2]},
    ))
    video_lagring.slett(id1)

    struktur = storage.load_video_library()
    assert struktur.groups["MMC"] == [id2]


def test_video_bibliotek_er_uavhengig_av_segment_og_arena(tom_datamappe, monkeypatch):
    """Video-strukturen skal ikke blande seg med de andre bibliotekene."""
    monkeypatch.setattr(storage, "DATA_DIR", tom_datamappe / "segments")
    monkeypatch.setattr(storage, "LIBRARY_FILE", tom_datamappe / "library.json")
    monkeypatch.setattr(storage, "ARENA_LIBRARY_FILE", tom_datamappe / "arena-library.json")
    monkeypatch.setattr(arena_lagring, "DATA_DIR", tom_datamappe / "arenaer")
    vid = _lagre_video("Flyover A")
    struktur = storage.load_video_library()
    assert [e.id for e in struktur.root if e.type == "video"] == [vid]
    assert storage.load_library().root == []
    assert storage.load_arena_library().root == []


def test_ødelagt_fil_gir_frisk_struktur(tom_datamappe):
    id1 = _lagre_video("Flyover A")
    storage.VIDEO_LIBRARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    storage.VIDEO_LIBRARY_FILE.write_text("{ugyldig json", encoding="utf-8")
    struktur = storage.load_video_library()
    assert [e.id for e in struktur.root] == [id1]
