"""Hurtigsjekk av en GPX-fil — uten å måtte åpne appen.

Bruk (fra prosjektmappa, med .venv aktivert eller via run.bat-miljøet):

    python scripts\\check_gpx.py "C:\\sti\\til\\fila.gpx"

Sjekker at fila lar seg lese som GPX, at alle punkter har tidsstempel,
og at tidsstemplene er strengt økende — de tre tingene som oftest får
karttjenester og GPS-klokker til å nekte.
"""
import sys

import gpxpy


def main():
    if len(sys.argv) != 2:
        print("Bruk: python scripts\\check_gpx.py <sti-til-gpx-fil>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        gpx = gpxpy.parse(f)

    punkter = [p for trk in gpx.tracks for seg in trk.segments for p in seg.points]
    if not punkter:
        print("FEIL: Fila inneholder ingen sporpunkter")
        sys.exit(1)

    tider = [p.time for p in punkter]
    mangler = sum(1 for t in tider if t is None)
    if mangler:
        print("FEIL: {} av {} punkter mangler tidsstempel".format(mangler, len(punkter)))
        sys.exit(1)

    for i in range(len(tider) - 1):
        if not tider[i] < tider[i + 1]:
            print(
                "FEIL: Tidsstempel ved punkt {} ({}) er ikke større enn punkt {} ({})".format(
                    i + 2, tider[i + 1], i + 1, tider[i]
                )
            )
            sys.exit(1)

    print("OK: {} punkter, {} -> {}".format(len(punkter), tider[0], tider[-1]))


if __name__ == "__main__":
    main()
