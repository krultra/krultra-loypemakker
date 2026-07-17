"""Bygg pene, frittstående HTML-versjoner av all markdown-dokumentasjon.

Markdown forblir kilden til sannhet (redigeres i README.md, CHANGELOG.md,
docs/*.md) — dette skriptet genererer en .html-fil ved siden av hver .md-fil,
med samme filnavn. Brukere kan dobbeltklikke .html-filene og få en pent
formatert side i nettleseren, uten behov for en markdown-visende editor.

Kjør etter at du har endret dokumentasjonen:

    python scripts/build_docs_html.py

Krever pakken "markdown" (kun et utviklerverktøy — ikke i requirements.txt,
siden selve appen ikke trenger det): pip install markdown
"""
import re
from pathlib import Path

import markdown

ROT = Path(__file__).resolve().parent.parent

def _naturlig_nøkkel(sti: Path):
    """Sorteringsnøkkel som gir versjon-2 før versjon-10 (ikke alfabetisk)."""
    deler = re.split(r"(\d+)", sti.stem)
    return [int(d) if d.isdigit() else d for d in deler]


# Alle markdown-filer som skal få en HTML-utgave. README og CHANGELOG ligger
# i rot; resten under docs/. Utvid lista når nye dokumenter kommer til.
KILDER = [
    ROT / "README.md",
    ROT / "CHANGELOG.md",
    *sorted((ROT / "docs").glob("*.md"), key=_naturlig_nøkkel),
]

# Favicon relativt til hver fil (regnes ut per fil ut fra dybde under ROT)
FAVICON_REL = {0: "frontend/favicon.png", 1: "../frontend/favicon.png"}

MAL = """<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{tittel}</title>
<link rel="icon" type="image/png" href="{favicon}">
<style>
:root {{
  --farge-primaer: #2563eb;
  --farge-primaer-mork: #1d4ed8;
  --bakgrunn: #f1f5f9;
  --kant: #e2e8f0;
  --tekst: #0f172a;
  --tekst-dus: #64748b;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--tekst);
  background: var(--bakgrunn);
  line-height: 1.6;
}}
header.topp {{
  background: var(--farge-primaer);
  color: #fff;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}}
header.topp img {{ width: 28px; height: 28px; border-radius: 50%; display: block; }}
header.topp strong {{ font-size: 16px; }}
header.topp nav {{ margin-left: auto; display: flex; gap: 14px; font-size: 13px; }}
header.topp nav a {{ color: #dbeafe; text-decoration: none; }}
header.topp nav a:hover {{ color: #fff; text-decoration: underline; }}
main {{
  max-width: 860px;
  margin: 24px auto 60px;
  background: #fff;
  border: 1px solid var(--kant);
  border-radius: 12px;
  padding: 32px 40px;
}}
@media (max-width: 640px) {{
  main {{ margin: 0; border-radius: 0; border-width: 0 0 1px; padding: 20px; }}
}}
h1, h2, h3, h4 {{ line-height: 1.3; }}
h1 {{ font-size: 26px; border-bottom: 2px solid var(--kant); padding-bottom: 10px; }}
h2 {{ font-size: 20px; margin-top: 2em; border-bottom: 1px solid var(--kant); padding-bottom: 6px; }}
h3 {{ font-size: 16px; margin-top: 1.6em; color: var(--farge-primaer-mork); }}
a {{ color: var(--farge-primaer-mork); }}
img {{ max-width: 100%; border-radius: 8px; border: 1px solid var(--kant); }}
code {{
  background: #f1f5f9; padding: 2px 5px; border-radius: 4px;
  font-family: Consolas, "Courier New", monospace; font-size: 0.92em;
}}
pre {{
  background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 8px;
  overflow-x: auto;
}}
pre code {{ background: none; padding: 0; color: inherit; }}
blockquote {{
  margin: 1em 0; padding: 10px 16px;
  background: #eff6ff; border-left: 4px solid var(--farge-primaer);
  border-radius: 0 8px 8px 0;
}}
blockquote p {{ margin: 0.4em 0; }}
table {{ border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 14px; }}
th, td {{ border: 1px solid var(--kant); padding: 8px 10px; text-align: left; }}
th {{ background: var(--bakgrunn); }}
hr {{ border: none; border-top: 1px solid var(--kant); margin: 2em 0; }}
p.muted {{ color: var(--tekst-dus); font-size: 14px; margin: 0.2em 0 0.6em; }}
footer.bunn {{
  max-width: 860px; margin: 0 auto 40px; padding: 0 40px;
  color: var(--tekst-dus); font-size: 12px;
}}
footer.bunn a {{ color: inherit; }}
</style>
</head>
<body>
<header class="topp">
<img src="{favicon}" alt="">
<strong>KrUltra Løypemakker (KUL)</strong>
<nav>
<a href="{hjem}">Dokumentasjon</a>
<a href="https://github.com/krultra/krultra-loypemakker" target="_blank" rel="noopener">GitHub</a>
</nav>
</header>
<main>
{innhold}
</main>
<footer class="bunn">
Generert fra <code>{kildenavn}</code> — rediger den fila og kjør
<code>python scripts/build_docs_html.py</code> på nytt for å oppdatere denne siden.
</footer>
</body>
</html>
"""

_MD = markdown.Markdown(extensions=["extra", "sane_lists", "toc"])


def _tittel_fra(html_body: str, filnavn: str) -> str:
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html_body, re.S)
    if m:
        return re.sub(r"<[^>]+>", "", m.group(1)).strip()
    return filnavn


def bygg(kildefil: Path) -> Path:
    dybde = len(kildefil.relative_to(ROT).parts) - 1  # 0 = i rot, 1 = i docs/
    favicon = FAVICON_REL.get(dybde, "../" * dybde + "frontend/favicon.png")
    hjem = ("docs/index.html" if dybde == 0 else "index.html")

    _MD.reset()
    innhold = _MD.convert(kildefil.read_text(encoding="utf-8"))
    # Interne lenker til andre .md-dokumenter skal peke til .html-utgaven
    innhold = re.sub(r'(href="[^"]+)\.md(#[^"]*)?"', r'\1.html\2"', innhold)

    tittel = _tittel_fra(innhold, kildefil.stem)
    # H1-en i flere av dokumentene inneholder allerede produktnavnet — ikke
    # dupliser det i <title> da.
    sidetittel = tittel if "KrUltra" in tittel else tittel + " — KrUltra Løypemakker"
    html = MAL.format(
        tittel=sidetittel, favicon=favicon, hjem=hjem,
        innhold=innhold, kildenavn=kildefil.relative_to(ROT).as_posix(),
    )
    utfil = kildefil.with_suffix(".html")
    utfil.write_text(html, encoding="utf-8")
    return utfil


def bygg_indeks(genererte: "list[tuple[Path, str]]") -> None:
    """docs/index.html: oversikt med lenker til alle dokumentene, delt i
    Guider, Utgivelser (semver 2.x.y) og Utviklingshistorikk (v2–v19)."""
    guider, utgivelser, historikk = [], [], []
    for fil, tittel in genererte:
        if fil.parent == ROT:
            continue  # README/CHANGELOG lenkes egne steder over
        rel = fil.relative_to(ROT / "docs").as_posix()
        rad = '<li><a href="{}">{}</a></li>'.format(rel, tittel)
        if re.match(r"^versjon-\d+\.\d+\.\d+$", fil.stem):
            utgivelser.append((fil, rad))          # semver-utgivelse (2.0.0, 2.1.0 …)
        elif re.match(r"^versjon-\d+$", fil.stem):
            historikk.append(rad)                  # utviklingsversjon (v2–v19)
        else:
            guider.append(rad)                     # BRUK, INSTALLASJON, publisering …
    # Utgivelser nyeste først (semver synkende)
    utgivelser.sort(key=lambda t: _naturlig_nøkkel(t[0]), reverse=True)
    utgivelser_rader = [rad for _, rad in utgivelser]
    innhold = (
        "<h1>Dokumentasjon</h1>\n<p>KrUltra Løypemakker (KUL) — velg et dokument:</p>\n"
        '<p><a href="../README.html">📘 README (start her)</a> · '
        '<a href="../CHANGELOG.html">📝 Endringslogg</a></p>\n'
        "<h2>Guider</h2>\n<ul>\n" + "\n".join(guider) + "\n</ul>\n"
        "<h2>Utgivelser</h2>\n"
        '<p class="muted">Offentlige versjoner (semantisk versjonering, nyeste først).</p>\n'
        "<ul>\n" + "\n".join(utgivelser_rader) + "\n</ul>\n"
        "<h2>Utviklingshistorikk (før 2.0.0)</h2>\n"
        '<p class="muted">Interne utviklingsversjoner fra MVP fram til første '
        "offentlige utgivelse.</p>\n"
        "<ul>\n" + "\n".join(historikk) + "\n</ul>\n"
    )
    html = MAL.format(
        tittel="Dokumentasjon — KrUltra Løypemakker", favicon="../frontend/favicon.png",
        hjem="index.html", innhold=innhold, kildenavn="scripts/build_docs_html.py",
    )
    (ROT / "docs" / "index.html").write_text(html, encoding="utf-8")


def main() -> None:
    genererte = []
    for kilde in KILDER:
        utfil = bygg(kilde)
        tittel = _tittel_fra(_MD.convert(kilde.read_text(encoding="utf-8")), kilde.stem)
        genererte.append((utfil, tittel))
        print("Bygget", utfil.relative_to(ROT))
    bygg_indeks(genererte)
    print("Bygget docs/index.html")


if __name__ == "__main__":
    main()
