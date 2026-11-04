@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 (
  echo Install Python 3.12 from python.org with the Python launcher.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 LTS and restart this window.
  pause
  exit /b 1
)
if not exist .venv\Scripts\python.exe py -3.12 -m venv .venv
if errorlevel 1 goto fail
call .venv\Scripts\python.exe -m pip install -r backend\requirements.lock
if errorlevel 1 goto fail
pushd frontend
call npm ci
if errorlevel 1 (
  popd
  goto fail
)
popd
.venv\Scripts\python.exe scripts\init_env.py
if errorlevel 1 goto fail
.venv\Scripts\python.exe scripts\run_local.py
if errorlevel 1 goto fail
exit /b 0
:fail
echo Startup failed. See the error above. No data was removed.
pause
exit /b 1
