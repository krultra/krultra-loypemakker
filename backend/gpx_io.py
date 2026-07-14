"""Lesing og skriving av GPX-filer.

Dette er den ENESTE modulen som bruker gpxpy-biblioteket direkte.
Det er et bevisst valg: all GPX-eksport bygges gjennom gpxpy sitt
objektmodell (aldri ved å lime sammen XML-tekst selv), slik at
resultatet alltid blir gyldig GPX 1.1 — uansett hvor rotete kilden var.
Det er dette som løser problemet med filer som karttjenester og
GPS-klokker nekter å laste.
"""
from datetime import datetime, timezone
from typing import List, Optional, Tuple

import gpxpy
import gpxpy.gpx

from .models import Point, Waypoint

# Standardlisens som foreslås når rettighetshaver er angitt:
# fri ikke-kommersiell bruk så lenge opphavsperson navngis.
STANDARD_LISENS = "https://creativecommons.org/licenses/by-nc/4.0/"


def _til_utc(tid: Optional[datetime]) -> Optional[datetime]:
    """Normaliser et tidsstempel til UTC.

    GPX-filer fra ulike verktøy kan ha tidsstempler med eller uten
    tidssone. Python nekter å sammenlikne de to typene direkte, så vi
    normaliserer alt til UTC med én gang vi leser fila — da slipper
    resten av koden å tenke på det.
    """
    if tid is None:
        return None
    if tid.tzinfo is None:
        return tid.replace(tzinfo=timezone.utc)
    return tid.astimezone(timezone.utc)


def parse_gpx(file_bytes: bytes) -> "ParsedGpx":
    """Les en GPX-fil (rå bytes) og returner metadata + flat punktliste.

    Alle tracks og segmenter i fila flates ut til én sammenhengende
    punktsekvens i dokumentrekkefølge. Manglende høyde eller tid på
    enkeltpunkter er helt greit her — opprydding skjer først ved eksport.

    Hvis fila ikke har noen <trk>-spor, prøver vi <rte>-ruter som
    reserveløsning (noen planleggingsverktøy lagrer ruter, ikke spor).

    Kaster ValueError hvis fila ikke kan tolkes som GPX i det hele tatt,
    eller ikke inneholder noen punkter.
    """
    try:
        gpx = gpxpy.parse(file_bytes.decode("utf-8", errors="replace"))
    except Exception as exc:
        raise ValueError("Kunne ikke tolke fila som GPX: {}".format(exc)) from exc

    navn: Optional[str] = None
    beskrivelse: Optional[str] = None
    lenke: Optional[str] = None
    punkter: List[Point] = []

    for track in gpx.tracks:
        if navn is None and track.name:
            navn = track.name
        if beskrivelse is None and track.description:
            beskrivelse = track.description
        if lenke is None and track.link:
            lenke = track.link
        for segment in track.segments:
            for p in segment.points:
                punkter.append(
                    Point(lat=p.latitude, lon=p.longitude, ele=p.elevation, time=_til_utc(p.time))
                )

    if not punkter:
        # Reserveløsning: noen filer bruker <rte> (rute) i stedet for <trk> (spor)
        for route in gpx.routes:
            if navn is None and route.name:
                navn = route.name
            if beskrivelse is None and route.description:
                beskrivelse = route.description
            for p in route.points:
                punkter.append(
                    Point(lat=p.latitude, lon=p.longitude, ele=p.elevation, time=_til_utc(p.time))
                )

    if not punkter:
        raise ValueError("GPX-fila inneholder ingen sporpunkter")

    # Fil-nivå metadata (<metadata>) brukes som reserve hvis sporet selv manglet
    if navn is None and gpx.name:
        navn = gpx.name
    if beskrivelse is None and gpx.description:
        beskrivelse = gpx.description
    if lenke is None and gpx.link:
        lenke = gpx.link

    # Interessepunkter (<wpt>) — navnløse punkter får et nummerert navn.
    # <type> kan inneholde flere kategorier (kommaseparert, slik verktøyet
    # selv eksporterer) — da gjenskapes hele symbollista. Mangler <desc>,
    # brukes <cmt> (kommentaren) som beskrivelse i stedet.
    veipunkter: List[Waypoint] = []
    for i, w in enumerate(gpx.waypoints):
        typer = [t.strip() for t in (w.type or "").split(",") if t.strip()]
        veipunkter.append(
            Waypoint(
                lat=w.latitude,
                lon=w.longitude,
                ele=w.elevation,
                name=w.name or "Punkt {}".format(i + 1),
                desc=w.description or w.comment,
                sym=w.symbol,
                type=typer[0] if typer else w.type,
                types=typer or None,
            )
        )

    return ParsedGpx(
        name=navn,
        description=beskrivelse,
        creator=gpx.creator or None,
        link=lenke,
        copyright=gpx.copyright_author or None,
        keywords=gpx.keywords or None,
        points=punkter,
        waypoints=veipunkter,
    )


class ParsedGpx:
    """Resultatet av parse_gpx: metadata + punktliste, samlet på ett sted."""

    def __init__(self, name, description, creator, link, copyright, keywords, points, waypoints):
        self.name = name
        self.description = description
        self.creator = creator
        self.link = link
        self.copyright = copyright
        self.keywords = keywords
        self.points = points
        self.waypoints = waypoints


def build_clean_gpx(
    points: List[Point],
    name: str,
    description: Optional[str] = None,
    creator: Optional[str] = None,
    link: Optional[str] = None,
    copyright: Optional[str] = None,
    keywords: Optional[str] = None,
    waypoints: Optional[List[Waypoint]] = None,
) -> str:
    """Bygg en gyldig GPX 1.1-streng fra en FERDIG OPPRYDDA punktliste.

    Viktig: den som kaller denne funksjonen må først ha kjørt punktene
    gjennom `timestamps.clean_timestamps`, slik at tidsstemplene er
    strengt økende. Denne funksjonen bare bygger XML-strukturen:

        <gpx> -> ett <trk> -> ett <trkseg> -> alle punktene i rekkefølge

    Punkter uten høyde får ingen <ele>-tagg (det er gyldig GPX — bedre
    enn å dikte opp 0 meter, som ville sett ut som havnivå).
    """
    gpx = gpxpy.gpx.GPX()
    gpx.name = name
    gpx.description = description
    gpx.creator = creator or "KrUltra Løypemakker"
    gpx.link = link
    gpx.keywords = keywords
    # <time> i metadata: når fila ble laget (sporet har sine egne tider)
    gpx.time = datetime.now(timezone.utc).replace(microsecond=0)
    if copyright:
        # Rettighetshaver + år + standardlisensen (CC BY-NC 4.0:
        # fri ikke-kommersiell bruk med navngivelse av opphavsperson)
        gpx.copyright_author = copyright
        gpx.copyright_year = str(datetime.now(timezone.utc).year)
        gpx.copyright_license = STANDARD_LISENS

    # Interessepunkter (<wpt>) — ETT punkt per sted. <type> kan inneholde
    # flere kategorier (kommaseparert) og leses tilbake ved import; <cmt>
    # bærer en lesbar tjenesteliste (Garmins «merknader»-felt).
    for w in waypoints or []:
        gpx.waypoints.append(
            gpxpy.gpx.GPXWaypoint(
                latitude=w.lat,
                longitude=w.lon,
                elevation=w.ele,
                name=w.name,
                description=w.desc,
                comment=w.cmt,
                symbol=w.sym,
                type=w.type,
            )
        )

    track = gpxpy.gpx.GPXTrack(name=name, description=description)
    track.link = link
    gpx.tracks.append(track)

    segment = gpxpy.gpx.GPXTrackSegment()
    track.segments.append(segment)

    for p in points:
        segment.points.append(
            gpxpy.gpx.GPXTrackPoint(
                latitude=p.lat,
                longitude=p.lon,
                elevation=p.ele,
                time=p.time,
            )
        )

    return gpx.to_xml(version="1.1")
