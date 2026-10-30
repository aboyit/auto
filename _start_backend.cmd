@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo ========================================================
echo    BACKEND FASTAPI SERVER (PORT 8000)
echo ========================================================
echo.

set "PY_EXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PY_EXE%" (
    set "PY_EXE=python"
)

"%PY_EXE%" -X utf8 main.py

echo.
echo ========================================================
echo [CANH BAO] Backend da dung lai. Xem log ben tren.
echo ========================================================
echo Nhan phim bat ky de dong cua so nay...
pause >nul
