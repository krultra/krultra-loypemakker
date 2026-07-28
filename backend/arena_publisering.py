"""Publisering av arenakart.

Bygger arena.json + index.html og laster det, sammen med bildet og delte
viewer-assets, opp til et publiseringsmål. Arenaen legges i samme event-mappe
som løypevisningen:

  <mål>/arena-assets/v<N>/   — delte arena-viewer-filer (JS/CSS/Leaflet),
                               lastes opp én gang per viewer-versjon
  <mål>/<event>/<arena>/     — index.html (peker på assets), arena.json,
                               bilde.<ext>

Fordi arenaen ligger på <event>/<arena>/ og løypevisningen på <event>/, kan
et løypepunkt lenke til arenaen med en enkel relativ ./<arena>/-adresse
(«navnekonvensjonen»). Republisering til samme event+arena overskriver bare
arena.json + bilde, så en delt/innbygd adresse fortsetter å virke.

Gjenbruker målkonfigurasjonen og skriverne i publisering.py (mappe/SFTP/gruppe).
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from . import arena_lagring, publisering
from .models import ArenaDetail

# Økes når arena-viewer-koden (viewer/arena.*) endres, så nye publiseringer
# laster opp friske assets uten å røre allerede publiserte arenaer.
ARENA_ASSET_VERSJON = 9

_ROT = Path(__file__).resolve().parent.parent
VIEWER_DIR = _ROT / "viewer"


# ============================================================
# arena.json
# ============================================================

def _valgte_bilder(arena: ArenaDetail, bilde_ids):
    """Bildene som skal publiseres, i arenaens rekkefølge.

    bilde_ids None = alle; ellers bare de oppgitte (som finnes).
    """
    if bilde_ids is None:
        return list(arena.bilder)
    ønsket = set(bilde_ids)
    return [b for b in arena.bilder if b.id in ønsket]


def bygg_arena_json(arena: ArenaDetail, bilde_ids=None, standard_sprak=None) -> dict:
    """Bygg innholdet i arena.json som den publiserte viewer-en leser.

    Bare de valgte bakgrunnsbildene tas med. De kanoniske målene
    (bilde_bredde/høyde) kommer fra arenaens FØRSTE bilde, så koordinat-
    systemet er stabilt uansett hvilke bilder som publiseres.
    """
    valgte = _valgte_bilder(arena, bilde_ids)
    return {
        "versjon": 2,
        "generert": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "navn": arena.navn or "Arenakart",
        "beskrivelse": arena.beskrivelse,
        # Standardspråk for visningen (no/en). Viewer bruker ?lang= over dette.
        "standard_sprak": standard_sprak or "no",
        # Oversettelser av arenaens navn/beskrivelse (toppnivå), om noen.
        # Objektene (bilder/typer/features/kontakter) bærer sine egne via model_dump.
        "oversettelser": arena.oversettelser or None,
        "bilder": [b.model_dump() for b in valgte],
        # Kanoniske mål (koordinatsystemet features er relative til)
        "bilde_bredde": arena.bilde_bredde,
        "bilde_høyde": arena.bilde_høyde,
        "typer": [t.model_dump() for t in arena.typer],
        "features": [f.model_dump() for f in arena.features],
        "kontakter": [k.model_dump() for k in arena.kontakter],
    }


# ============================================================
# Viewer-filer og per-arena index.html
# ============================================================

def _arena_viewer_filer() -> "list[tuple[str, bytes]]":
    """Filene som utgjør de delte arena-viewer-assets: (relativ sti, innhold)."""
    frontend = _ROT / "frontend"
    return [
        ("arena.js", (VIEWER_DIR / "arena.js").read_bytes()),
        ("arena.css", (VIEWER_DIR / "arena.css").read_bytes()),
        ("leaflet.js", (frontend / "vendor" / "leaflet.js").read_bytes()),
        ("leaflet.css", (frontend / "vendor" / "leaflet.css").read_bytes()),
        ("favicon.png", (VIEWER_DIR / "favicon.png").read_bytes()),
    ]


def _index_html() -> bytes:
    """Per-arena index.html med asset-versjonen satt inn."""
    mal = (VIEWER_DIR / "arena.html").read_text(encoding="utf-8")
    return mal.replace("__V__", str(ARENA_ASSET_VERSJON)).encode("utf-8")


# ============================================================
# Publisering
# ============================================================

def _skriv_til(mål: dict, event_slug: str, arena_slug: str,
               arena: ArenaDetail, arena_json: dict) -> None:
    """Skriv assets (ved behov) + arenafilene til ETT konkret mål."""
    skriver = publisering.lag_skriver(mål)
    try:
        # Delte assets: bare første gang per viewer-versjon
        if not _har_arena_assets(skriver, ARENA_ASSET_VERSJON):
            for rel, innhold in _arena_viewer_filer():
                skriver.skriv("arena-assets/v{}/{}".format(ARENA_ASSET_VERSJON, rel), innhold)

        mappe = "{}/{}".format(event_slug, arena_slug)
        skriver.skriv("{}/index.html".format(mappe), _index_html())
        skriver.skriv(
            "{}/arena.json".format(mappe),
            json.dumps(arena_json, ensure_ascii=False).encode("utf-8"),
        )
        # Bare de publiserte bildene (arena_json["bilder"]) lastes opp
        for b in arena_json.get("bilder", []):
            bilde = arena_lagring.bilde_sti_for(arena.id, b["id"]).read_bytes()
            skriver.skriv("{}/{}".format(mappe, b["fil"]), bilde)
    finally:
        skriver.lukk()


def _har_arena_assets(skriver, versjon: int) -> bool:
    """Sjekk om arena-assets for en gitt versjon allerede finnes på målet.

    Skriverne (_MappeMål/_SftpMål) har en har_assets som ser etter
    løype-assets (assets/v<N>/viewer.js). Arena har egne assets under
    arena-assets/, så vi ser etter dem direkte gjennom skriverens egen
    kunnskap om målet.
    """
    rel = "arena-assets/v{}/arena.js".format(versjon)
    # _MappeMål: sjekk fila direkte. _SftpMål: bruk sftp.stat.
    if hasattr(skriver, "rot"):  # _MappeMål
        return (skriver.rot / rel).exists()
    try:  # _SftpMål
        skriver.sftp.stat("{}/{}".format(skriver.rotsti, rel))
        return True
    except FileNotFoundError:
        return False


def _resultat(mål: dict, event_slug: str, arena_slug: str, navn: str,
              advarsel=None, standard_sprak="no") -> dict:
    base = (mål.get("baseUrl") or "").rstrip("/")
    sti = "{}/{}".format(event_slug, arena_slug)
    if base:
        url = "{}/{}/".format(base, sti)
    else:
        url = str((publisering._MappeMål(mål).rot / sti).resolve())
    # Standardspråk bakes inn i iframe-snutten som ?lang= (arrangøren kan endre
    # det per side); den direkte URL-en holdes ren (bruker standard_sprak i JSON).
    iframe_src = url + "?lang=" + (standard_sprak or "no")
    iframe = (
        '<iframe src="{}" '
        'style="width:100%;height:640px;height:min(85vh,820px);border:0" '
        'loading="lazy" title="Arenakart {}"></iframe>'
    ).format(iframe_src, navn)
    return {"url": url, "iframe": iframe, "advarsel": advarsel}


def publiser_arena(målnavn: str, event_slug: str, arena_slug: str,
                   arena: ArenaDetail, bilde_ids=None, standard_sprak=None) -> dict:
    """Publiser et arenakart til <event_slug>/<arena_slug>/ på valgt mål.

    `bilde_ids` velger hvilke bakgrunnsbilder som publiseres (None = alle).
    `standard_sprak` er standardspråket for innbygging (no/en).
    Returnerer {url, iframe, advarsel}. Gruppemål håndteres som for løyper
    (publiser til alle medlemmer, delvis suksess gir advarsel).
    """
    for navn, verdi in (("event", event_slug), ("arena", arena_slug)):
        if not publisering.GYLDIG_SLUG.match(verdi):
            raise ValueError(
                "Ugyldig {}-navn: bruk små bokstaver a–z, tall og bindestrek".format(navn))
    if not arena.bilder:
        raise ValueError("Arenaen mangler et bakgrunnsbilde — last inn et bilde først")

    arena_json = bygg_arena_json(arena, bilde_ids, standard_sprak)
    res = publisering.kjør_publisering(
        målnavn,
        lambda mål: _skriv_til(mål, event_slug, arena_slug, arena, arena_json),
    )
    return _resultat(res["base_mål"], event_slug, arena_slug,
                     arena.navn or arena_slug, res["advarsel"], standard_sprak or "no")
