@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
REM ============================================================
REM  Lightship Genova — Holiday Planner: full publish to GitHub
REM  Double-click this file. It will:
REM    1) Reset any leftover .git folder
REM    2) git init + commit
REM    3) Create the repo on your GitHub via gh CLI
REM    4) Push the code
REM    5) Enable GitHub Pages on main / root
REM    6) Wait for the build, open the live URL in your browser
REM
REM  Requirements:
REM    - Git for Windows  https://git-scm.com
REM    - GitHub CLI (gh)  https://cli.github.com
REM    - You must run "gh auth login" once (browser flow).
REM ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   Lightship Genova - Publishing the Holiday Planner
echo ============================================================
echo.

REM ---------- Preflight ----------
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] git is not installed.
  echo         Install from https://git-scm.com  then re-run this file.
  pause & exit /b 1
)

where gh >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] GitHub CLI (gh) is not installed.
  echo         Install from https://cli.github.com  then re-run this file.
  echo.
  echo         After install, authenticate once with:
  echo             gh auth login
  pause & exit /b 1
)

REM Check gh auth
gh auth status >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo You are not signed into the GitHub CLI yet.
  echo Opening "gh auth login" - follow the browser prompts.
  echo.
  gh auth login
  if !ERRORLEVEL! neq 0 (
    echo [ERROR] gh auth login did not complete. Re-run when ready.
    pause & exit /b 1
  )
)

REM ---------- Repo settings ----------
echo.
set /p REPONAME="Repository name [holiday-planner-2026]: "
if "!REPONAME!"=="" set REPONAME=holiday-planner-2026

set /p VISIBILITY="public or private? [public]: "
if "!VISIBILITY!"=="" set VISIBILITY=public

REM ---------- Clean & init ----------
if exist ".git" (
  echo.
  echo Removing leftover .git folder...
  rmdir /s /q ".git"
)

echo.
echo Initializing git repo...
git init -b main >nul

git config user.email "giancarlosacchi@gmail.com" >nul
git config user.name  "Giancarlo Sacchi" >nul

echo Staging all files...
git add .

echo Creating commit...
git commit -m "Initial commit: Lightship Genova holiday planner" >nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] commit failed.
  pause & exit /b 1
)

REM ---------- Create + push ----------
echo.
echo Creating !REPONAME! (!VISIBILITY!) on GitHub and pushing...
gh repo create "!REPONAME!" --!VISIBILITY! --source=. --remote=origin --push
if %ERRORLEVEL% neq 0 (
  echo [ERROR] gh repo create failed.
  pause & exit /b 1
)

REM ---------- Get owner/repo for API calls ----------
for /f "delims=" %%i in ('gh repo view --json nameWithOwner -q .nameWithOwner') do set OWNER_REPO=%%i
echo.
echo Pushed to: !OWNER_REPO!

REM ---------- Enable GitHub Pages ----------
echo.
echo Enabling GitHub Pages on main / root ...
gh api -X POST /repos/!OWNER_REPO!/pages -f "source[branch]=main" -f "source[path]=/" >nul 2>&1
if !ERRORLEVEL! neq 0 (
  REM Maybe already enabled, try a PUT update instead
  gh api -X PUT /repos/!OWNER_REPO!/pages -f "source[branch]=main" -f "source[path]=/" >nul 2>&1
)

REM ---------- Get the Pages URL ----------
set PAGES_URL=
for /f "delims=" %%i in ('gh api /repos/!OWNER_REPO!/pages -q .html_url 2^>nul') do set PAGES_URL=%%i

if "!PAGES_URL!"=="" (
  echo.
  echo Pages was requested but the URL is not ready yet.
  echo This usually settles within 30-60 seconds.
  for /f "delims=" %%i in ('gh repo view --json url -q .url') do set REPO_URL=%%i
  echo Repo:  !REPO_URL!
  start "" "!REPO_URL!/settings/pages"
  goto :done
)

echo.
echo ============================================================
echo   PUBLISHED.
echo.
echo   Live URL:  !PAGES_URL!
echo   Repo URL:  https://github.com/!OWNER_REPO!
echo.
echo   GitHub Pages typically takes 30-60 seconds to build.
echo   Opening the live URL in your browser now...
echo ============================================================
echo.

REM Wait a bit so the first build has time to finish
timeout /t 10 /nobreak >nul
start "" "!PAGES_URL!"

:done
echo.
echo Done. Press any key to close this window.
pause >nul
endlocal
