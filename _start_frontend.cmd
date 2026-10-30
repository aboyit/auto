@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0frontend"
echo ========================================================
echo    FRONTEND STUDIO UI (PORT 5173)
echo ========================================================
echo.

call npm run build
if errorlevel 1 exit /b 1
call npm run preview -- --host 127.0.0.1 --port 5173 --strictPort

echo.
echo ========================================================
echo [CANH BAO] Frontend da dung lai. Xem log ben tren.
echo ========================================================
exit /b 1
