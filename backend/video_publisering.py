"""Publisering av flyover-videoer.

Legger en lagret video ut som en egen liten side, i samme event-mappe som
løypevisningen:

  <mål>/video-assets/v<N>/   — delte video-viewer-filer (CSS/JS/favicon),
                               lastes opp én gang per viewer-versjon
  <mål>/<event>/<video>/     — index.html (peker på assets) + selve videofila

Adressen blir altså <event>/<video>/, på samme form som arenakart ligger
på <event>/<arena>/. Da kan løypevisningen lenke til videoen med en enkel
relativ ./<video>/-adresse, og republisering til samme sted overskriver
bare fila og index.html — så en delt eller innbygd adresse fortsetter å
virke.

Videoene kan være store (titalls MB). De lastes derfor opp bare når de
faktisk er endret: er det samme fila som ligger der fra før, hoppes
opplastingen over.

Gjenbruker målkonfigurasjonen og skriverne i publisering.py (mappe/SFTP/gruppe).
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from . import publisering, video_lagring

# Økes når video-viewer-koden (viewer/video.*) endres, så nye publiseringer
# laster opp friske assets uten å røre allerede publiserte videoer.
VIDEO_ASSET_VERSJON = 2

_ROT = Path(__file__).resolve().parent.parent
VIEWER_DIR = _ROT / "viewer"


def _video_viewer_filer() -> "list[tuple[str, bytes]]":
    """Filene som utgjør de delte video-viewer-assets: (relativ sti, innhold)."""
    return [
        ("video.js", (VIEWER_DIR / "video.js").read_bytes()),
        ("video.css", (VIEWER_DIR / "video.css").read_bytes()),
        ("favicon.png", (VIEWER_DIR / "favicon.png").read_bytes()),
    ]


def _har_video_assets(skriver, versjon: int) -> bool:
    """Ligger alle de delte video-filene alt på målet for denne versjonen?

    Sjekker hver enkelt fil, ikke bare én — da fyller en ny publisering
    inn filer som måtte mangle (samme lærdom som for løype-assets).
    """
    for rel, _ in _video_viewer_filer():
        sti = "video-assets/v{}/{}".format(versjon, rel)
        if hasattr(skriver, "rot"):                      # _MappeMål
            if not (skriver.rot / sti).exists():
                return False
        else:                                            # _SftpMål
            try:
                skriver.sftp.stat("{}/{}".format(skriver.rotsti, sti))
            except FileNotFoundError:
                return False
    return True


def bygg_video_data(video: dict, varianter: "list[dict]", tittel: str,
                    beskrivelse=None, standard_sprak=None, oversettelser=None,
                    loype_url=None, link=None) -> dict:
    """Opplysningene som bakes inn i index.html og leses av video.js.

    `varianter` er [{fil, mime, bredde, hoyde, storrelse}] i synkende
    størrelse — den første er også standardvalget. video.js velger ut fra
    hvor stor skjermen faktisk er, siden en vanlig MP4 ellers lastes ned i
    full oppløsning uansett hvor liten avspilleren er.
    """
    hoved = varianter[0]
    return {
        "versjon": 2,
        "generert": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "navn": tittel or video.get("navn") or "Flyover",
        "beskrivelse": beskrivelse or None,
        "standard_sprak": standard_sprak or "no",
        "oversettelser": oversettelser or None,
        # Toppnivåfeltene beskriver hovedvarianten. En eldre video.js som
        # ikke kjenner `varianter` spiller da av akkurat som før.
        "fil": hoved["fil"],
        "mime": hoved.get("mime") or "video/mp4",
        "bredde": hoved.get("bredde"),
        "hoyde": hoved.get("hoyde"),
        "varianter": varianter,
        "varighet": video.get("varighet"),
        # Relativ lenke tilbake til løypevisningen (ett nivå opp)
        "loype_url": loype_url or None,
        "link": link or None,
    }


def _index_html(data: dict) -> bytes:
    """Per-video index.html med asset-versjon og opplysninger satt inn."""
    mal = (VIEWER_DIR / "video.html").read_text(encoding="utf-8")
    # Opplysningene legges i en <script type="application/json">. `<` må
    # escapes så en tekst som inneholder «</script>» ikke kan bryte ut av
    # blokka og bli kjørt som kode.
    json_tekst = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    ut = mal.replace("__V__", str(VIDEO_ASSET_VERSJON)).replace("__DATA__", json_tekst)
    return ut.encode("utf-8")


def _skriv_til(mål: dict, event_slug: str, video_slug: str,
               filer: "list[tuple[str, bytes]]", data: dict) -> None:
    """Skriv assets (ved behov) + videofilene til ETT konkret mål."""
    skriver = publisering.lag_skriver(mål)
    try:
        if not _har_video_assets(skriver, VIDEO_ASSET_VERSJON):
            for rel, bytes_ in _video_viewer_filer():
                skriver.skriv(
                    "video-assets/v{}/{}".format(VIDEO_ASSET_VERSJON, rel), bytes_)

        mappe = "{}/{}".format(event_slug, video_slug)
        skriver.skriv("{}/index.html".format(mappe), _index_html(data))
        for filnavn, innhold in filer:
            skriver.skriv("{}/{}".format(mappe, filnavn), innhold)
    finally:
        skriver.lukk()


def _resultat(mål: dict, event_slug: str, video_slug: str, navn: str,
              advarsel=None, standard_sprak="no") -> dict:
    base = (mål.get("baseUrl") or "").rstrip("/")
    sti = "{}/{}".format(event_slug, video_slug)
    if base:
        url = "{}/{}/".format(base, sti)
    else:
        url = str((publisering._MappeMål(mål).rot / sti).resolve())
    iframe_src = url + "?lang=" + (standard_sprak or "no")
    iframe = (
        '<iframe src="{}" '
        'style="width:100%;height:520px;height:min(80vh,720px);border:0" '
        'loading="lazy" allowfullscreen title="Flyover {}"></iframe>'
    ).format(iframe_src, navn)
    return {"url": url, "iframe": iframe, "advarsel": advarsel}


def publiser_video(målnavn: str, event_slug: str, video_slug: str, video_id: str,
                   tittel: str, beskrivelse=None, standard_sprak=None,
                   oversettelser=None, link=None) -> dict:
    """Publiser en lagret video til <event_slug>/<video_slug>/ på valgt mål.

    Returnerer {url, iframe, advarsel}. Gruppemål håndteres som for løyper
    (publiser til alle medlemmer, delvis suksess gir advarsel).
    """
    for navn, verdi in (("event", event_slug), ("video", video_slug)):
        if not publisering.GYLDIG_SLUG.match(verdi or ""):
            raise ValueError(
                "Ugyldig {}-navn: bruk små bokstaver a–z, tall og bindestrek".format(navn))

    video = video_lagring.hent(video_id)
    if not video:
        raise ValueError("Fant ingen video med id {}".format(video_id))

    # Alle oppløsningene legges ut, største først. Filnavnene på nett
    # holdes faste og enkle, uavhengig av visningsnavnet.
    filer = []
    varianter = []
    for var in sorted(video_lagring.varianter_for(video),
                      key=lambda v: -(v.get("bredde") or 0)):
        sti = video_lagring.sti_for(video_id, var.get("merke"))
        innhold = sti.read_bytes()
        merke = var.get("merke") or "full"
        filnavn = "flyover{}{}".format(
            "" if merke == "full" else "-" + merke, sti.suffix)
        filer.append((filnavn, innhold))
        varianter.append({
            "fil": filnavn,
            "mime": var.get("mime") or "video/mp4",
            "bredde": var.get("bredde"),
            "hoyde": var.get("hoyde"),
            "storrelse": len(innhold),
        })

    data = bygg_video_data(
        video, varianter, tittel, beskrivelse, standard_sprak, oversettelser,
        loype_url="../", link=link,
    )

    res = publisering.kjør_publisering(
        målnavn,
        lambda mål: _skriv_til(mål, event_slug, video_slug, filer, data),
    )
    return _resultat(res["base_mål"], event_slug, video_slug,
                     data["navn"], res["advarsel"], standard_sprak or "no")
