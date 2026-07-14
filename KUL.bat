@echo off
setlocal
cd /d "%~dp0"

rem ==============================================================
rem  KrUltra Loypemakker (KUL) - start appen
rem  Dobbeltklikk denne fila for a kjore verktoyet.
rem ==============================================================

rem ---- Sjekk at Python er installert ----
where py >nul 2>nul
if errorlevel 1 (
  echo.
  echo Fant ikke Python pa denne maskinen.
  echo Last ned og installer fra https://www.python.org/downloads/
  echo Huk av "Add python.exe to PATH" under installasjonen.
  echo.
  pause
  exit /b 1
)

rem ---- Forste gangs oppsett: lag et lokalt Python-miljo ----
if not exist ".venv" (
  echo Forbereder appen for forste gangs bruk - dette tar et par minutter...
  py -3 -m venv .venv
)
call ".venv\Scripts\activate.bat"

rem ---- Installer/oppdater nodvendige komponenter (rask hvis alt er pa plass) ----
python -m pip install --quiet -r requirements.txt
if errorlevel 1 (
  echo.
  echo Klarte ikke a installere nodvendige komponenter.
  echo Sjekk at du har internettforbindelse og prov igjen.
  echo.
  pause
  exit /b 1
)

rem ---- Apne nettleseren og start appen ----
start "" http://127.0.0.1:8000/
echo.
echo  KrUltra Loypemakker (KUL) kjorer na pa http://127.0.0.1:8000/
echo  Lukk dette vinduet for a avslutte appen.
echo.
rem --reload-dir backend: fanger opp kodeendringer i backend automatisk,
rem uten a restarte ved lagring av segmenter (data-mappa overvakes ikke).
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir backend
pause
