"""Felles stier for KUL-kode og brukerdata.

Kode ligger i Git, mens data kan ligge separat (for eksempel i en
OneDrive-synkronisert katalog). ``KUL_DATA_DIR`` overstyrer standarden
``<repo>/data`` og gjør at samme kode kan brukes på Windows og Linux.
"""
import os
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parent.parent
_standard = APP_ROOT / "data"
_konfigurert = os.environ.get("KUL_DATA_DIR")

if _konfigurert:
    DATA_ROOT = Path(_konfigurert).expanduser()
    if not DATA_ROOT.is_absolute():
        DATA_ROOT = APP_ROOT / DATA_ROOT
else:
    DATA_ROOT = _standard

DATA_ROOT = DATA_ROOT.resolve()
