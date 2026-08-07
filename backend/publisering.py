"""Publisering av interaktive løypevisninger.

Tar punkter + veipunkter + stilvalg fra verktøyet og publiserer en
innbyggbar visning til et konfigurert mål:

  <mål>/assets/v<N>/   — delte viewer-filer (JS/CSS/Leaflet), lastes
                          opp én gang per viewer-versjon
  <mål>/<slug>/         — index.html (liten, peker på assets) og
                          course.json (selve løypedataene)

Republisering til samme slug overskriver bare course.json, så websider
som har bygd inn visningen (iframe) viser ny versjon automatisk.

Mål konfigureres i data/publisering.json og kan være:
  - "mappe": en lokal mappe (test, eller manuell opplasting etterpå)
  - "sftp":  direkte opplasting til server (f.eks. Raspberry Pi)
"""
import json
import math
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from .models import Point, Waypoint

# Økes når viewer-koden (viewer/ eller frontend/felles.js) endres, slik
# at nye publiseringer laster opp friske assets uten å røre gamle løyper.
#
# VIKTIG: bump ALLTID BACKEND_VERSJON (backend/routes.py) og
# FORVENTET_BACKEND (frontend/app.js) sammen med denne. Tallet her leses
# inn når serveren starter, mens viewer/index.html leses fra disk ved hver
# publisering. Kjører brukeren en server som ble startet før endringen,
# blir malen ny mens versjonsnummeret er gammelt — og publiseringen peker
# på en assets-mappe som mangler de nye filene. Versjonssjekken mot
# /api/health er det som fanger opp nettopp det.
ASSET_VERSJON = 26

_ROT = Path(__file__).resolve().parent.parent
VIEWER_DIR = _ROT / "viewer"
KONFIG_FIL = _ROT / "data" / "publisering.json"

GYLDIG_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,60}$")


# ============================================================
# Punktforenkling (Ramer–Douglas–Peucker)
# ============================================================

def _avstand_til_linje_m(p: Point, a: Point, b: Point) -> float:
    """Avstand (meter) fra punkt p til linjestykket a–b, i flatt lokalt plan.

    For korte segmenter (noen hundre meter) er et lokalt plan med
    breddegradskorrigert lengdegrad mer enn nøyaktig nok.
    """
    k = math.cos(math.radians(a.lat))
    ax, ay = a.lon * k, a.lat
    bx, by = b.lon * k, b.lat
    px, py = p.lon * k, p.lat
    dx, dy = bx - ax, by - ay
    lengde2 = dx * dx + dy * dy
    if lengde2 == 0:
        nx, ny = ax, ay
    else:
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / lengde2))
        nx, ny = ax + t * dx, ay + t * dy
    # grader -> meter (1 breddegrad ≈ 111,32 km)
    return math.hypot(px - nx, py - ny) * 111_320.0


def forenkle_punkter(points: List[Point], toleranse_m: float = 3.0) -> List[int]:
    """Ramer–Douglas–Peucker: velg ut punktindekser som bevarer formen.

    Returnerer INDEKSENE (stigende) til punktene som beholdes, slik at
    kalleren også kan regne om veipunktenes posisjoner. Første og siste
    punkt er alltid med. Iterativ (ikke rekursiv) så lange spor ikke
    sprenger call-stacken.
    """
    n = len(points)
    if n <= 2:
        return list(range(n))

    behold = [False] * n
    behold[0] = behold[n - 1] = True
    stakk = [(0, n - 1)]
    while stakk:
        i0, i1 = stakk.pop()
        if i1 - i0 < 2:
            continue
        verste_i, verste_d = -1, -1.0
        for i in range(i0 + 1, i1):
            d = _avstand_til_linje_m(points[i], points[i0], points[i1])
            if d > verste_d:
                verste_d, verste_i = d, i
        if verste_d > toleranse_m:
            behold[verste_i] = True
            stakk.append((i0, verste_i))
            stakk.append((verste_i, i1))
    return [i for i in range(n) if behold[i]]


def _haversine_km(a: Point, b: Point) -> float:
    """Avstand i km mellom to punkter (samme formel som felles.js)."""
    R = 6371.0
    la1, la2 = math.radians(a.lat), math.radians(b.lat)
    dla = la2 - la1
    dlo = math.radians(b.lon - a.lon)
    s = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(s))


def _kumulativ_km(points: List[Point]) -> List[float]:
    d = [0.0]
    for i in range(1, len(points)):
        d.append(d[-1] + _haversine_km(points[i - 1], points[i]))
    return d


def _glatte_høyder(points: List[Point], utjevning: int, vektform: int) -> Optional[List[float]]:
    """Interpolerte + gauss-utjevnede høyder — samme algoritme som felles.js.

    Brukes til å precompute nøyaktige høydemeter fra ORIGINALSPORET, så
    tallene i den publiserte visningen stemmer med verktøyet (og ikke
    påvirkes av punktforenklingen).
    """
    ele = [p.ele for p in points]
    kjente = [i for i, e in enumerate(ele) if e is not None]
    if not kjente:
        return None
    res = list(ele)
    for i in range(kjente[0]):
        res[i] = ele[kjente[0]]
    for i in range(kjente[-1] + 1, len(ele)):
        res[i] = ele[kjente[-1]]
    for k in range(len(kjente) - 1):
        i0, i1 = kjente[k], kjente[k + 1]
        for i in range(i0 + 1, i1):
            res[i] = ele[i0] + (ele[i1] - ele[i0]) * (i - i0) / (i1 - i0)

    n = int(utjevning or 0)
    if n <= 0:
        return res
    sigma = n / (vektform or 3)
    vekter = [math.exp(-(j * j) / (2 * sigma * sigma)) for j in range(-n, n + 1)]
    glatt = []
    for i in range(len(res)):
        s, vs = 0.0, 0.0
        for j in range(-n, n + 1):
            k = i + j
            if 0 <= k < len(res):
                v = vekter[j + n]
                s += res[k] * v
                vs += v
        glatt.append(s / vs)
    return glatt


def _nærmeste_indeks(w: Waypoint, points: List[Point]) -> int:
    """Indeksen til punktet som ligger nærmest veipunktet (grovt, i grader)."""
    k = math.cos(math.radians(w.lat))
    beste_i, beste_d = 0, float("inf")
    for i, p in enumerate(points):
        d = ((p.lon - w.lon) * k) ** 2 + (p.lat - w.lat) ** 2
        if d < beste_d:
            beste_d, beste_i = d, i
    return beste_i


# ============================================================
# course.json
# ============================================================

def bygg_course_json(
    points: List[Point],
    waypoints: List[Waypoint],
    meta: dict,
    stil: dict,
    toleranse_m: float = 3.0,
) -> dict:
    """Bygg innholdet i course.json: forenklede punkter + remappede veipunkter."""
    beholdte = set(forenkle_punkter(points, toleranse_m))
    # Veipunktenes ankerpunkter må alltid med: RDP fjerner punkter langs
    # rette strekk, og uten dette kunne et veipunkt midt på et slikt strekk
    # blitt forankret flere hundre meter feil langs løypa (i profilen).
    for w in waypoints:
        beholdte.add(_nærmeste_indeks(w, points))
    indekser = sorted(beholdte)
    forenklet = [points[i] for i in indekser]

    # Distanse og høydemeter beregnes fra ORIGINALSPORET og samples ved de
    # beholdte punktene. Forenklingen kutter svinger (~2–4 % kortere
    # distanse) — uten dette ville den publiserte siden vist andre tall
    # enn verktøyet. Med disse listene er tallene eksakte.
    original_km = _kumulativ_km(points)
    profilstil = (stil or {}).get("profil", {}) if isinstance(stil, dict) else {}
    glatte = _glatte_høyder(
        points, profilstil.get("utjevning", 0), profilstil.get("vektform", 3))
    opp_akk, ned_akk = [0.0], [0.0]
    if glatte:
        for i in range(1, len(glatte)):
            d = glatte[i] - glatte[i - 1]
            opp_akk.append(opp_akk[-1] + max(0.0, d))
            ned_akk.append(ned_akk[-1] + max(0.0, -d))
    else:
        opp_akk = ned_akk = [0.0] * len(points)

    veipunkter = []
    for w in waypoints:
        idx = _nærmeste_indeks(w, forenklet)
        # «Snap»: publiser punktet på selve løypa i stedet for på de
        # lagrede koordinatene (per løype-valg for delte punkter som
        # ligger et stykke unna traseen)
        lat, lon = (forenklet[idx].lat, forenklet[idx].lon) if w.snap else (w.lat, w.lon)
        veipunkter.append({
            "idx": idx,
            "lat": lat, "lon": lon,
            "name": w.name, "desc": w.desc,
            "types": w.types or ([w.type] if w.type else None),
            "lab_lat": w.lab_lat, "lab_lon": w.lab_lon,
            "vis_ikon": w.vis_ikon,
            # Valgfri arena-slug: gjør punktet klikkbart i visningen (lenker
            # til arenakartet på ./<arena>/). Utelates når den ikke er satt.
            "arena": w.arena or None,
            # Oversettelser (name/desc) til andre språk, om noen.
            "oversettelser": w.oversettelser or None,
        })

    return {
        "versjon": 1,
        "generert": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "navn": meta.get("navn") or "Løype",
        "beskrivelse": meta.get("beskrivelse"),
        "link": meta.get("link"),
        # Standardspråk for visningen (no/en). Viewer bruker ?lang= over dette.
        "standard_sprak": meta.get("standard_sprak") or "no",
        # Oversettelser av løypas navn/beskrivelse (toppnivå), om noen.
        "oversettelser": meta.get("oversettelser") or None,
        # Valgfri flyover-video publisert under løypa (./<slug>/). Er den
        # satt, viser løypevisningen en knapp som åpner videoen.
        "video": meta.get("video") or None,
        "stil": stil,
        "punkter": [
            [round(p.lat, 6), round(p.lon, 6), None if p.ele is None else round(p.ele, 1)]
            for p in forenklet
        ],
        # Eksakte verdier fra originalsporet, samplet ved de beholdte punktene
        "avstander": [round(original_km[i], 4) for i in indekser],
        "opp": [round(opp_akk[i], 1) for i in indekser],
        "ned": [round(ned_akk[i], 1) for i in indekser],
        "veipunkter": veipunkter,
    }


# ============================================================
# Mål-konfigurasjon
# ============================================================

KONFIG_MAL = {
    "_forklaring": (
        "Publiseringsmål for løypevisninger. type 'mappe' skriver til en "
        "lokal mappe (test/manuell opplasting); type 'sftp' laster opp "
        "direkte til en server. For sftp: angi enten 'passord' eller "
        "'nøkkelfil' (sti til privat SSH-nøkkel). 'fjernmappe' er mappa "
        "webserveren serverer, 'baseUrl' er den offentlige adressen dit. "
        "type 'gruppe' publiserer til flere mål i én operasjon: "
        "'medlemmer' er lista med navnene på målene (f.eks. prod + failover)."
    ),
    "mål": [
        # lokal-test serveres av verktøyet selv (se /publisert i main.py) —
        # lenken virker altså så lenge verktøyet kjører
        {"navn": "lokal-test", "type": "mappe",
         "mappe": "data/publisert", "baseUrl": "http://127.0.0.1:8000/publisert"},
        {"navn": "krultra-pi", "type": "sftp",
         "host": "FYLL-INN", "port": 22, "bruker": "FYLL-INN",
         "passord": "FYLL-INN-ELLER-SLETT", "nøkkelfil": "",
         "fjernmappe": "/var/www/loyper",
         "baseUrl": "https://loyper.krultra.no"},
    ],
}


def les_konfig() -> dict:
    """Les målkonfigurasjonen; opprett en utfyllbar mal første gang."""
    if not KONFIG_FIL.exists():
        KONFIG_FIL.parent.mkdir(parents=True, exist_ok=True)
        KONFIG_FIL.write_text(
            json.dumps(KONFIG_MAL, ensure_ascii=False, indent=2), encoding="utf-8")
    return json.loads(KONFIG_FIL.read_text(encoding="utf-8"))


def finn_mål(navn: str) -> dict:
    for mål in les_konfig().get("mål", []):
        if mål.get("navn") == navn:
            return mål
    raise ValueError("Ukjent publiseringsmål: {}".format(navn))


# ============================================================
# Publisering (mappe og SFTP gjennom samme lille grensesnitt)
# ============================================================

def _viewer_filer() -> "list[tuple[str, bytes]]":
    """Filene som utgjør de delte viewer-assets: (relativ sti, innhold)."""
    frontend = _ROT / "frontend"
    filer = [
        ("viewer.js", (VIEWER_DIR / "viewer.js").read_bytes()),
        ("viewer.css", (VIEWER_DIR / "viewer.css").read_bytes()),
        ("felles.js", (frontend / "felles.js").read_bytes()),
        ("flyby.js", (frontend / "flyby.js").read_bytes()),
        ("flyby.css", (frontend / "flyby.css").read_bytes()),
        ("leaflet.js", (frontend / "vendor" / "leaflet.js").read_bytes()),
        ("leaflet.css", (frontend / "vendor" / "leaflet.css").read_bytes()),
        # 3D-biblioteket for fly-by. Lastes bare ned av nettleseren når
        # en bruker faktisk åpner en fly-by, men må ligge klart her.
        ("maplibre-gl.js", (frontend / "vendor" / "maplibre-gl.js").read_bytes()),
        ("maplibre-gl.css", (frontend / "vendor" / "maplibre-gl.css").read_bytes()),
        ("favicon.png", (VIEWER_DIR / "favicon.png").read_bytes()),
    ]
    return filer


def _index_html() -> bytes:
    """Per-løype index.html med asset-versjonen satt inn."""
    mal = (VIEWER_DIR / "index.html").read_text(encoding="utf-8")
    return mal.replace("__V__", str(ASSET_VERSJON)).encode("utf-8")


class _MappeMål:
    """Skriver publiseringen til en lokal mappe."""

    def __init__(self, mål: dict):
        mappe = Path(mål["mappe"])
        self.rot = mappe if mappe.is_absolute() else _ROT / mappe

    def har_assets(self, versjon: int, filnavn) -> bool:
        mappe = self.rot / "assets" / "v{}".format(versjon)
        return all((mappe / navn).exists() for navn in filnavn)

    def skriv(self, rel_sti: str, innhold: bytes) -> None:
        sti = self.rot / rel_sti
        sti.parent.mkdir(parents=True, exist_ok=True)
        sti.write_bytes(innhold)

    def lukk(self) -> None:
        pass


class _SftpMål:
    """Laster publiseringen opp til en server via SFTP (paramiko)."""

    def __init__(self, mål: dict):
        import paramiko  # importeres her så mappe-mål ikke krever paramiko

        self.rotsti = mål["fjernmappe"].rstrip("/")
        klient = paramiko.SSHClient()
        klient.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            klient.connect(
                hostname=mål["host"],
                port=int(mål.get("port", 22)),
                username=mål["bruker"],
                password=mål.get("passord") or None,
                key_filename=mål.get("nøkkelfil") or None,
                timeout=15,
            )
        except paramiko.AuthenticationException:
            raise ValueError("SFTP: feil brukernavn/passord/nøkkel for {}".format(mål["host"]))
        except Exception as exc:
            raise ValueError("SFTP: fikk ikke kontakt med {}: {}".format(mål["host"], exc))
        self.klient = klient
        self.sftp = klient.open_sftp()

    def _sørg_for_mappe(self, fjernsti: str) -> None:
        deler = fjernsti.strip("/").split("/")
        sti = ""
        for del_ in deler:
            sti += "/" + del_
            try:
                self.sftp.stat(sti)
            except FileNotFoundError:
                self.sftp.mkdir(sti)

    def har_assets(self, versjon: int, filnavn) -> bool:
        for navn in filnavn:
            try:
                self.sftp.stat("{}/assets/v{}/{}".format(self.rotsti, versjon, navn))
            except FileNotFoundError:
                return False
        return True

    def skriv(self, rel_sti: str, innhold: bytes) -> None:
        fjernsti = "{}/{}".format(self.rotsti, rel_sti)
        self._sørg_for_mappe(fjernsti.rsplit("/", 1)[0])
        with self.sftp.open(fjernsti, "wb") as f:
            f.write(innhold)

    def lukk(self) -> None:
        self.sftp.close()
        self.klient.close()


def lag_skriver(mål: dict):
    """Lag riktig skriver (mappe eller SFTP) for ett konkret mål.

    Delt med arena-publiseringen, som skriver andre filer til de samme
    målene gjennom det samme lille har_assets/skriv/lukk-grensesnittet.
    """
    return _MappeMål(mål) if mål.get("type") == "mappe" else _SftpMål(mål)


def kjør_publisering(målnavn: str, skriv_en) -> dict:
    """Kjør en publisering mot ett mål — eller alle medlemmer i en gruppe.

    `skriv_en(mål)` gjør selve skrivingen til ETT konkret (ikke-gruppe) mål.
    Ved gruppe publiseres det til alle medlemmene; feiler noen — men ikke
    alle — fullføres de andre og feilen rapporteres som en advarsel.

    Returnerer {"base_mål": <mål å bygge offentlig URL fra>, "advarsel": ...}.
    Slug-validering overlates til kalleren (løyper og arenaer har egne krav).
    """
    mål = finn_mål(målnavn)
    if mål.get("type") != "gruppe":
        skriv_en(mål)
        return {"base_mål": mål, "advarsel": None}

    medlemmer = mål.get("medlemmer") or []
    if not medlemmer:
        raise ValueError("Gruppa «{}» har ingen medlemmer".format(målnavn))
    feil = []
    for navn in medlemmer:
        try:
            medlem = finn_mål(navn)
            if medlem.get("type") == "gruppe":
                raise ValueError("grupper kan ikke inneholde grupper")
            skriv_en(medlem)
        except ValueError as exc:
            feil.append("{}: {}".format(navn, exc))
    if len(feil) == len(medlemmer):
        raise ValueError("Publiseringen feilet for alle målene i gruppa — " +
                         " · ".join(feil))
    advarsel = ("Publisert, men feilet for " + " · ".join(feil)) if feil else None
    # Adressen tas fra gruppas egen baseUrl (typisk den offentlige adressen
    # som DNS/failover peker på), ellers fra første medlem.
    base_mål = mål if mål.get("baseUrl") else finn_mål(medlemmer[0])
    return {"base_mål": base_mål, "advarsel": advarsel}


def _publiser_til(mål: dict, slug: str, course: dict) -> None:
    """Skriv assets (ved behov) + løypefilene til ETT konkret mål."""
    skriver = lag_skriver(mål)
    try:
        # Delte assets: bare første gang per viewer-versjon.
        # Vi sjekker at ALLE filene finnes, ikke bare én av dem. Kommer det
        # en ny fil i pakka (som flyby.js gjorde i 3.2.0) og noen
        # publiserer på nytt uten at versjonsnummeret slår til, ville en
        # sjekk på bare viewer.js sagt «alt er på plass» — og index.html
        # ville pekt på en fil som aldri ble lastet opp.
        filer = _viewer_filer()
        if not skriver.har_assets(ASSET_VERSJON, [rel for rel, _ in filer]):
            for rel, innhold in filer:
                skriver.skriv("assets/v{}/{}".format(ASSET_VERSJON, rel), innhold)

        skriver.skriv("{}/index.html".format(slug), _index_html())
        skriver.skriv(
            "{}/course.json".format(slug),
            json.dumps(course, ensure_ascii=False).encode("utf-8"),
        )
    finally:
        skriver.lukk()


def _resultat(mål: dict, slug: str, course: dict, advarsel: Optional[str] = None) -> dict:
    base = (mål.get("baseUrl") or "").rstrip("/")
    url = "{}/{}/".format(base, slug) if base else str(
        (_MappeMål(mål).rot / slug).resolve())
    # Standardspråk bakes inn i iframe-snutten som ?lang=, så innbyggingen får
    # riktig språk (og arrangøren kan endre det per side). Den direkte URL-en
    # holdes ren — den faller tilbake på standard_sprak i course.json.
    sprak = course.get("standard_sprak") or "no"
    iframe_src = url + "?lang=" + sprak
    # Høyden tilpasser seg skjermen: opptil 820 px på store skjermer,
    # 85 % av vindushøyden på små (640 px er reserve for eldre nettlesere)
    iframe = (
        '<iframe src="{}" '
        'style="width:100%;height:640px;height:min(85vh,820px);border:0" '
        'loading="lazy" title="Løypekart {}"></iframe>'
    ).format(iframe_src, course.get("navn", slug))
    return {"url": url, "iframe": iframe, "advarsel": advarsel}


def publiser(målnavn: str, slug: str, course: dict) -> dict:
    """Publiser en løype til et mål. Returnerer {url, iframe, advarsel}.

    Er målet en gruppe, publiseres det til alle medlemmene i én operasjon
    (typisk prod + failover). Feiler noen — men ikke alle — fullføres de
    andre, og feilen rapporteres som en advarsel i stedet for å stoppe alt.
    """
    if not GYLDIG_SLUG.match(slug):
        raise ValueError(
            "Ugyldig adressenavn (slug): bruk små bokstaver a–z, tall og bindestrek")

    res = kjør_publisering(målnavn, lambda mål: _publiser_til(mål, slug, course))
    return _resultat(res["base_mål"], slug, course, res["advarsel"])
