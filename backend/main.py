"""Selve web-applikasjonen. Startes med:

    python -m uvicorn backend.main:app

(eller enklere: dobbeltklikk run.bat i prosjektmappa).

Appen gjør to ting:
  1. Serverer REST-API-et under /api/... (se routes.py)
  2. Serverer frontend-filene (HTML/CSS/JS) på alt annet, slik at
     http://127.0.0.1:8000/ åpner selve verktøyet i nettleseren.

Rekkefølgen under er viktig: API-routeren MÅ registreres før den
statiske "catch-all"-monteringen, ellers ville frontend-serveren
fanget opp API-kallene også.
"""
from pathlib import Path

from fastapi import FastAPI
from starlette.staticfiles import StaticFiles

from . import routes
from .data_paths import APP_ROOT, DATA_ROOT

app = FastAPI(title="KrUltra Løypemakker")

app.include_router(routes.router, prefix="/api")


class NoCacheStaticFiles(StaticFiles):
    """Serverer frontend-filene med Cache-Control: no-cache.

    Da revaliderer nettleseren alltid mot serveren ved F5 og henter ny
    versjon når koden er endret — i stedet for å kjøre en gammel, cachet
    app.js. (no-cache betyr «bruk gjerne cache, men sjekk med serveren
    først»; uendrede filer svares raskt med 304.)
    """

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


# Lokalt publiserte løypevisninger (lokal-test-målet) serveres av verktøyet
# selv på /publisert/<slug>/ — nettlesere blokkerer fetch() fra file://-
# sider, så visningen MÅ nås over HTTP for at course.json skal kunne lastes.
_publisert_dir = DATA_ROOT / "publisert"
_publisert_dir.mkdir(parents=True, exist_ok=True)
app.mount("/publisert", NoCacheStaticFiles(directory=str(_publisert_dir), html=True), name="publisert")

_frontend_dir = APP_ROOT / "frontend"
app.mount("/", NoCacheStaticFiles(directory=str(_frontend_dir), html=True), name="frontend")
