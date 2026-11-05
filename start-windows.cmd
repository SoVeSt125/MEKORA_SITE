@echo off
chcp 65001 >nul
setlocal
set PYTHONUTF8=1
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
if not exist .venv\Scripts\python.exe py -3.12 -m venv "%~dp0.venv"
if errorlevel 1 goto fail
.venv\Scripts\python.exe "%~dp0scripts\prepare_local.py"
if errorlevel 1 goto fail
.venv\Scripts\python.exe "%~dp0scripts\init_env.py"
if errorlevel 1 goto fail
.venv\Scripts\python.exe "%~dp0scripts\run_local.py" %*
if errorlevel 1 goto fail
exit /b 0
:fail
echo Startup failed. See the error above. No data was removed.
pause
exit /b 1
