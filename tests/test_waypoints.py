"""Tester for lagring/oppdatering av interessepunkter på segmenter."""
import pytest

from backend import storage
from backend.models import Point, SaveSegmentRequest, Waypoint


@pytest.fixture
def tom_datamappe(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path / "segments")
    monkeypatch.setattr(storage, "LIBRARY_FILE", tmp_path / "library.json")
    return tmp_path


def _lagre():
    punkter = [Point(lat=63.0, lon=11.0), Point(lat=63.001, lon=11.0)]
    return storage.save_segment(SaveSegmentRequest(name="Testløype", points=punkter)).id


def test_oppdater_waypoints_lagres_og_hentes(tom_datamappe):
    sid = _lagre()
    wpts = [
        Waypoint(lat=63.0, lon=11.0, name="Start", type="start"),
        Waypoint(lat=63.001, lon=11.0, name="Drikk & mat",
                 types=["drikke", "mat"], sym="Drinking Water", type="drikke"),
    ]
    storage.update_segment_waypoints(sid, wpts)

    detail = storage.load_segment(sid)
    assert len(detail.waypoints) == 2
    # Flersymbol-punktet beholder hele types-lista
    assert detail.waypoints[1].types == ["drikke", "mat"]
    # Punktene er urørt
    assert detail.point_count == 2


def test_oppdater_waypoints_ukjent_segment_gir_feil(tom_datamappe):
    with pytest.raises(FileNotFoundError):
        storage.update_segment_waypoints("deadbeef", [])


def test_starttidspunkt_huskes_på_segmentet(tom_datamappe):
    """start_time lagres, kan endres via metadata, og nullstilles ikke av
    metadata-endringer som ikke har feltet med (f.eks. «Endre»-dialogen)."""
    from backend.models import UpdateMetaRequest

    punkter = [Point(lat=63.0, lon=11.0), Point(lat=63.001, lon=11.0)]
    sid = storage.save_segment(SaveSegmentRequest(
        name="Testløype", points=punkter, start_time="2026-08-15T09:00")).id
    assert storage.load_segment(sid).start_time == "2026-08-15T09:00"

    # Endres via metadata-oppdatering (GPX-eksporten skriver tilbake slik)
    storage.update_segment_meta(sid, UpdateMetaRequest(
        name="Testløype", start_time="2026-08-16T10:30"))
    assert storage.load_segment(sid).start_time == "2026-08-16T10:30"

    # En metadata-endring UTEN start_time skal ikke nullstille verdien
    storage.update_segment_meta(sid, UpdateMetaRequest(name="Nytt navn"))
    lastet = storage.load_segment(sid)
    assert lastet.name == "Nytt navn"
    assert lastet.start_time == "2026-08-16T10:30"
