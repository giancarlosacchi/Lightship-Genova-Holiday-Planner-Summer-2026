@echo off
REM Holiday Planner — local server launcher (Windows)
REM Tries Python first, then Node. Open http://localhost:8765 in your browser.

cd /d "%~dp0"

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo Starting Python server on http://localhost:8765
  start "" "http://localhost:8765"
  python -m http.server 8765
  goto :eof
)

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo Starting Python (py launcher) server on http://localhost:8765
  start "" "http://localhost:8765"
  py -m http.server 8765
  goto :eof
)

where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo Starting Node server on http://localhost:8765
  start "" "http://localhost:8765"
  npx --yes serve . -l 8765
  goto :eof
)

echo Could not find Python or Node on this machine.
echo Install Python from https://python.org or Node from https://nodejs.org
pause
