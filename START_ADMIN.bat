@echo off
chcp 65001 > nul
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
echo Python이 설치되어 있지 않습니다.
echo https://www.python.org/downloads/ 에서 Python을 설치한 뒤 다시 실행해 주세요.
:end
pause
