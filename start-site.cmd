@echo off
chcp 65001 >nul
setlocal
set PYTHONUTF8=1
cd /d "%~dp0"
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
  py -3 "%~dp0scripts\serve_site.py" %*
  goto done
)
python3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
  python3 "%~dp0scripts\serve_site.py" %*
  goto done
)
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
  python "%~dp0scripts\serve_site.py" %*
  goto done
)
echo Python 3.10 or newer is required. Install Python and run this file again.
pause
exit /b 1
:done
if errorlevel 1 (
  pause
  exit /b 1
)
exit /b 0
