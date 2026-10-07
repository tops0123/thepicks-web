@echo off
cd /d "%~dp0"
where python >nul 2>nul
if not errorlevel 1 (
  python server.py --open admin
  goto end
)
where py >nul 2>nul
if not errorlevel 1 (
  py -3 server.py --open admin
  goto end
)
echo [ERROR] Python is not installed.
echo Install Python from https://www.python.org/downloads/ and run again.
:end
pause
