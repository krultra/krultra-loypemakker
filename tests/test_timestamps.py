"""Tester for tidsstempel-oppryddingen — ett testtilfelle per kjent problemtype.

Fellesnevneren for alle testene: uansett hvor rotete inndataene er,
skal utdataene ha STRENGT ØKENDE tidsstempler på alle punkter.
"""
from datetime import datetime, timedelta, timezone

from backend.models import Point
from backend.timestamps import clean_timestamps

BASE = datetime(2026, 7, 7, 12, 0, 0, tzinfo=timezone.utc)


def _punkt(sekunder=None, naiv=False):
    """Lag et testpunkt med tid BASE + sekunder (None = ingen tid)."""
    tid = None
    if sekunder is not None:
        tid = BASE + timedelta(seconds=sekunder)
        if naiv:
            tid = tid.replace(tzinfo=None)
    return Point(lat=59.0, lon=10.0, ele=100.0, time=tid)


def _er_strengt_økende(punkter):
    return all(
        punkter[i].time < punkter[i + 1].time for i in range(len(punkter) - 1)
    )


def test_ingen_tidsstempler_gir_syntetisk_økende_sekvens():
    punkter = [_punkt(None) for _ in range(5)]
    resultat = clean_timestamps(punkter, fallback_base_time=BASE)
    assert _er_strengt_økende(resultat)
    assert resultat[0].time == BASE
    assert resultat[4].time == BASE + timedelta(seconds=4)


def test_fornuftige_tidsstempler_beholdes_uendret():
    punkter = [_punkt(0), _punkt(10), _punkt(25)]
    resultat = clean_timestamps(punkter)
    assert [p.time for p in resultat] == [BASE, BASE + timedelta(seconds=10), BASE + timedelta(seconds=25)]


def test_dupliserte_tidsstempler_dyttes_fremover():
    punkter = [_punkt(0), _punkt(0), _punkt(0)]
    resultat = clean_timestamps(punkter)
    assert _er_strengt_økende(resultat)


def test_bakoverhopp_som_ved_sammenslåing_ryddes():
    # Simulerer en sammenslått løype der del 2 er "eldre" enn del 1
    punkter = [_punkt(100), _punkt(110), _punkt(5), _punkt(15)]
    resultat = clean_timestamps(punkter)
    assert _er_strengt_økende(resultat)
    # De to første (fornuftige) beholdes
    assert resultat[0].time == BASE + timedelta(seconds=100)
    assert resultat[1].time == BASE + timedelta(seconds=110)


def test_delvis_manglende_tid_broes_og_ekte_tid_gjenopptas():
    # Punkt 3 mangler tid; punkt 4 har ekte tid langt frem som skal beholdes
    punkter = [_punkt(0), _punkt(10), _punkt(None), _punkt(60)]
    resultat = clean_timestamps(punkter)
    assert _er_strengt_økende(resultat)
    assert resultat[3].time == BASE + timedelta(seconds=60)


def test_blandet_naiv_og_tidssonebevisst_tid_krasjer_ikke():
    punkter = [_punkt(0, naiv=True), _punkt(10), _punkt(20, naiv=True)]
    resultat = clean_timestamps(punkter)
    assert _er_strengt_økende(resultat)


def test_tom_liste_gir_tom_liste():
    assert clean_timestamps([]) == []


def test_enkeltpunkt_får_starttida():
    resultat = clean_timestamps([_punkt(None)], fallback_base_time=BASE)
    assert len(resultat) == 1
    assert resultat[0].time == BASE


def test_endrer_ikke_innsendt_liste():
    punkter = [_punkt(None), _punkt(None)]
    clean_timestamps(punkter, fallback_base_time=BASE)
    assert punkter[0].time is None  # originalen skal være urørt


def test_shift_to_start_flytter_serien_og_bevarer_avstander():
    from backend.timestamps import shift_to_start

    punkter = clean_timestamps([_punkt(0), _punkt(10), _punkt(35)])
    ny_start = BASE + timedelta(days=30, hours=2)
    resultat = shift_to_start(punkter, ny_start)

    assert resultat[0].time == ny_start
    assert resultat[1].time - resultat[0].time == timedelta(seconds=10)
    assert resultat[2].time - resultat[1].time == timedelta(seconds=25)
    # Originalen er urørt
    assert punkter[0].time == BASE


def test_shift_to_start_tolker_naiv_tid_som_lokal():
    from backend.timestamps import shift_to_start

    punkter = clean_timestamps([_punkt(0), _punkt(10)])
    naiv = datetime(2026, 8, 1, 11, 0, 0)  # ingen tidssone
    resultat = shift_to_start(punkter, naiv)

    assert resultat[0].time == naiv.astimezone()
    assert resultat[0].time.tzinfo is not None
