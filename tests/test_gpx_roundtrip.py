"""Den viktigste testen: bevis at eksportert GPX faktisk er gyldig.

Strategien er "rundtur": bygg punkter -> rydd tidsstempler -> generer
GPX-XML -> les XML-en tilbake med gpxpy -> sjekk at alt stemmer.
Hvis gpxpy klarer å lese vårt eget produkt uten feil, med riktig antall
punkter og strengt økende tid, har vi løst kjerneproblemet
(filer som karttjenester og GPS-klokker nekter å laste).
"""
from datetime import datetime, timedelta, timezone

import gpxpy

from backend.gpx_io import STANDARD_LISENS, build_clean_gpx, parse_gpx
from backend.models import Point, Waypoint
from backend.timestamps import clean_timestamps

BASE = datetime(2026, 7, 7, 12, 0, 0, tzinfo=timezone.utc)


def _rundtur(punkter, navn="Testløype"):
    """Kjør punktene gjennom hele eksportkjeden og les resultatet tilbake."""
    ryddet = clean_timestamps(punkter, fallback_base_time=BASE)
    xml = build_clean_gpx(ryddet, navn)
    gpx = gpxpy.parse(xml)
    leste = [p for trk in gpx.tracks for seg in trk.segments for p in seg.points]
    return xml, gpx, leste


def test_rundtur_med_ryddige_tidsstempler():
    punkter = [
        Point(lat=59.0 + i * 0.001, lon=10.0 + i * 0.001, ele=100.0 + i,
              time=BASE + timedelta(seconds=i * 10))
        for i in range(20)
    ]
    xml, gpx, leste = _rundtur(punkter)

    assert len(leste) == 20
    assert all(leste[i].time < leste[i + 1].time for i in range(len(leste) - 1))
    assert 'version="1.1"' in xml
    assert len(gpx.tracks) == 1
    assert len(gpx.tracks[0].segments) == 1


def test_rundtur_uten_tidsstempler():
    punkter = [Point(lat=59.0 + i * 0.001, lon=10.0) for i in range(10)]
    _, _, leste = _rundtur(punkter)

    assert len(leste) == 10
    assert all(p.time is not None for p in leste)
    assert all(leste[i].time < leste[i + 1].time for i in range(len(leste) - 1))


def test_rundtur_med_rotete_tidsstempler():
    """Simulerer en spleiset fil: duplikater og bakoverhopp midt i."""
    punkter = [
        Point(lat=59.000, lon=10.0, time=BASE + timedelta(seconds=100)),
        Point(lat=59.001, lon=10.0, time=BASE + timedelta(seconds=100)),  # duplikat
        Point(lat=59.002, lon=10.0, time=BASE + timedelta(seconds=5)),    # bakover!
        Point(lat=59.003, lon=10.0, time=None),                            # mangler
        Point(lat=59.004, lon=10.0, time=BASE + timedelta(seconds=500)),
    ]
    _, _, leste = _rundtur(punkter)

    assert len(leste) == 5
    assert all(leste[i].time < leste[i + 1].time for i in range(len(leste) - 1))


def test_manglende_høyde_gir_ingen_ele_tagg():
    """Punkter uten høyde skal IKKE få en oppdiktet <ele>0</ele>."""
    punkter = [
        Point(lat=59.0, lon=10.0, ele=None),
        Point(lat=59.001, lon=10.0, ele=123.5),
    ]
    _, _, leste = _rundtur(punkter)

    assert leste[0].elevation is None
    assert leste[1].elevation == 123.5


def test_parse_gpx_leser_egen_eksport():
    """parse_gpx (innlesing) og build_clean_gpx (eksport) skal være kompatible."""
    punkter = [
        Point(lat=59.0 + i * 0.001, lon=10.0, ele=50.0, time=BASE + timedelta(seconds=i))
        for i in range(5)
    ]
    xml = build_clean_gpx(clean_timestamps(punkter), "Rundtur")
    resultat = parse_gpx(xml.encode("utf-8"))

    assert resultat.name == "Rundtur"
    assert len(resultat.points) == 5
    # Alle tidsstempler skal være normalisert til å ha tidssone
    assert all(p.time.tzinfo is not None for p in resultat.points)


def test_metadata_overlever_rundtur():
    """Navn, beskrivelse, creator og lenke skal følge med gjennom eksport og re-innlesing."""
    punkter = [
        Point(lat=59.0 + i * 0.001, lon=10.0, time=BASE + timedelta(seconds=i))
        for i in range(3)
    ]
    xml = build_clean_gpx(
        clean_timestamps(punkter),
        "Skogsrunden",
        description="Merket løype fra 2025, med æøå",
        creator="Torgeir / MMC",
        link="https://eksempel.no/mmc",
    )
    resultat = parse_gpx(xml.encode("utf-8"))

    assert resultat.name == "Skogsrunden"
    assert resultat.description == "Merket løype fra 2025, med æøå"
    assert resultat.creator == "Torgeir / MMC"
    assert resultat.link == "https://eksempel.no/mmc"


def test_copyright_nøkkelord_og_veipunkter_overlever_rundtur():
    """Copyright (med standardlisens), nøkkelord og <wpt> skal med i fila."""
    punkter = [
        Point(lat=63.55 + i * 0.001, lon=11.95, time=BASE + timedelta(seconds=i))
        for i in range(3)
    ]
    veipunkter = [
        Waypoint(lat=63.55, lon=11.95, ele=420.0, name="Start",
                 desc="Startområdet på Nøstmo", sym="Flag, Green", type="start"),
        Waypoint(lat=63.551, lon=11.95, name="Drikkestasjon 1",
                 sym="Drinking Water", type="drikke"),
    ]
    xml = build_clean_gpx(
        clean_timestamps(punkter), "Testløype",
        copyright="Torgeir Kruke", keywords="terrengløp, Meråker, MMC",
        waypoints=veipunkter,
    )

    assert STANDARD_LISENS in xml  # lisensen er med i XML-en

    resultat = parse_gpx(xml.encode("utf-8"))
    assert resultat.copyright == "Torgeir Kruke"
    assert resultat.keywords == "terrengløp, Meråker, MMC"
    assert len(resultat.waypoints) == 2
    assert resultat.waypoints[0].name == "Start"
    assert resultat.waypoints[0].sym == "Flag, Green"
    assert resultat.waypoints[0].type == "start"
    assert resultat.waypoints[1].sym == "Drinking Water"

    # Fila skal fortsatt være gyldig GPX med sporet intakt
    gpx = gpxpy.parse(xml)
    assert len(gpx.waypoints) == 2
    assert len(gpx.tracks) == 1


def test_flersymbolpunkt_overlever_rundtur():
    """Ett <wpt> per sted: kategoriene ligger kommaseparert i <type> og
    leses tilbake som types-liste; <cmt> bærer den lesbare tjenestelista
    (Garmins merknadsfelt) uten å forstyrre beskrivelsen."""
    punkter = [
        Point(lat=63.55 + i * 0.001, lon=11.95, time=BASE + timedelta(seconds=i))
        for i in range(3)
    ]
    veipunkter = [
        Waypoint(lat=63.551, lon=11.95, name="Guddingsvika",
                 desc="Vann og saft", cmt="Sjekkpunkt, Drikke, Snacks — Vann og saft",
                 sym="Flag, Blue", type="sjekkpunkt,drikke,snacks"),
    ]
    xml = build_clean_gpx(clean_timestamps(punkter), "Testløype", waypoints=veipunkter)

    gpx = gpxpy.parse(xml)
    assert len(gpx.waypoints) == 1  # ETT punkt, ikke ett per symbol
    assert gpx.waypoints[0].comment == "Sjekkpunkt, Drikke, Snacks — Vann og saft"

    resultat = parse_gpx(xml.encode("utf-8"))
    w = resultat.waypoints[0]
    assert w.types == ["sjekkpunkt", "drikke", "snacks"]  # gjenskapt fra <type>
    assert w.type == "sjekkpunkt"
    assert w.desc == "Vann og saft"  # beskrivelsen er ikke forurenset av cmt


def test_cmt_brukes_som_beskrivelse_når_desc_mangler():
    """Noen verktøy skriver bare <cmt> — da brukes den som beskrivelse."""
    punkter = [Point(lat=63.55, lon=11.95, time=BASE),
               Point(lat=63.551, lon=11.95, time=BASE + timedelta(seconds=1))]
    veipunkter = [Waypoint(lat=63.55, lon=11.95, name="X", cmt="Bare kommentar")]
    xml = build_clean_gpx(clean_timestamps(punkter), "T", waypoints=veipunkter)

    resultat = parse_gpx(xml.encode("utf-8"))
    assert resultat.waypoints[0].desc == "Bare kommentar"
