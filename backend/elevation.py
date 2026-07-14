"""Høydeoppslag mot Kartverkets terrengmodell.

Bakgrunn: GPS-klokker måler høyde upresist (avvik på ±150 m er vanlig),
så høydene i en GPX-fil kan avvike mye fra terrenget. Kartverkets åpne
høyde-API (hoydedata, gratis, uten nøkkel) gir terrenghøyden for et
koordinat fra den nasjonale terrengmodellen — samme prinsipp som
Garmin Connect bruker når de «retter» høydeprofiler.

API-et tar maks 50 punkter per kall. For lange spor (titusenvis av
punkter) slår vi derfor opp et jevnt utvalg (maks 4000 punkter) og
interpolerer lineært mellom oppslagene — terrengmodellen har uansett
~1 m oppløsning, og sporet har typisk få meter mellom punktene, så
feilen fra interpoleringen er ubetydelig.
"""
import json
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from .models import Point

API_URL = "https://ws.geonorge.no/hoydedata/v1/punkt"
MAKS_PER_KALL = 50    # API-ets grense
MAKS_OPPSLAG = 4000   # flere punkter enn dette: jevnt utvalg + interpolering
PARALLELLE_KALL = 5   # antall samtidige kall (høflig mot en gratis tjeneste)


def _slå_opp_batch(punkter: List[Point]) -> List[Optional[float]]:
    """Slå opp terrenghøyden for inntil 50 punkter i ett API-kall."""
    koord = json.dumps([[p.lon, p.lat] for p in punkter])
    url = "{}?punkter={}&koordsys=4258&geojson=false".format(
        API_URL, urllib.parse.quote(koord)
    )
    siste_feil = None
    for _ in range(2):  # ett nytt forsøk ved forbigående nettverksfeil
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                data = json.loads(r.read())
            return [p.get("z") for p in data["punkter"]]
        except Exception as exc:
            siste_feil = exc
    raise ValueError(
        "Klarte ikke å hente høyder fra Kartverket: {}".format(siste_feil)
    )


def hent_terrenghøyder(points: List[Point]) -> List[Optional[float]]:
    """Terrenghøyde fra Kartverket for hvert punkt i lista.

    Returnerer en liste med samme lengde som `points`. Punkter uten
    dekning i terrengmodellen (f.eks. utenfor Norge) får None — da bør
    kalleren beholde GPX-filas egen høyde for det punktet.
    """
    n = len(points)
    if n == 0:
        return []

    # Velg hvilke punkter som slås opp: alle, eller et jevnt utvalg
    if n <= MAKS_OPPSLAG:
        utvalg = list(range(n))
    else:
        utvalg = sorted({round(i * (n - 1) / (MAKS_OPPSLAG - 1)) for i in range(MAKS_OPPSLAG)})

    batcher = [utvalg[i : i + MAKS_PER_KALL] for i in range(0, len(utvalg), MAKS_PER_KALL)]
    with ThreadPoolExecutor(max_workers=PARALLELLE_KALL) as pool:
        batch_svar = list(pool.map(lambda b: _slå_opp_batch([points[i] for i in b]), batcher))

    oppslag = {}
    for batch, svar in zip(batcher, batch_svar):
        for idx, z in zip(batch, svar):
            oppslag[idx] = z

    return interpoler_mellom_oppslag(n, oppslag)


def interpoler_mellom_oppslag(
    antall: int, oppslag: "dict[int, Optional[float]]"
) -> List[Optional[float]]:
    """Fyll en full høydeliste fra spredte oppslag ved lineær interpolering.

    `oppslag` er {punktindeks: høyde eller None}. Indekser mellom to
    kjente oppslag interpoleres; før første/etter siste kjente brukes
    nærmeste kjente verdi. Finnes ingen kjente verdier blir alt None.
    (Interpolering per indeks er godt nok: nabopunkter i et GPS-spor
    ligger typisk få meter fra hverandre.)
    """
    kjente = [i for i in sorted(oppslag) if oppslag[i] is not None]
    if not kjente:
        return [None] * antall

    resultat: List[Optional[float]] = [None] * antall
    for i in kjente:
        resultat[i] = oppslag[i]

    første, siste = kjente[0], kjente[-1]
    for i in range(første):
        resultat[i] = oppslag[første]
    for i in range(siste + 1, antall):
        resultat[i] = oppslag[siste]

    for k in range(len(kjente) - 1):
        i0, i1 = kjente[k], kjente[k + 1]
        z0, z1 = oppslag[i0], oppslag[i1]
        for i in range(i0 + 1, i1):
            resultat[i] = z0 + (z1 - z0) * (i - i0) / (i1 - i0)

    return resultat
