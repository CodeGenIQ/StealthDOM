@echo off
title StealthDOM Bridge
cd /d "%~dp0"

:: ── Resolve project folder (strip trailing backslash) ────────────────────────
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

set "STARTUP_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\StealthDOM_bridge.bat"

echo [StealthDOM] ================================================
echo [StealthDOM]  Bridge Server
echo [StealthDOM]  %PROJECT_DIR%
echo [StealthDOM] ================================================
echo.

:: ── Add to Windows Startup folder (no admin required) ───────────────────────
if exist "%STARTUP_FILE%" (
    echo [StealthDOM] Auto-start: already installed.
) else (
    echo [StealthDOM] Auto-start: installing to Startup folder...
    (
        echo @echo off
        echo cd /d "%PROJECT_DIR%"
        echo title StealthDOM Bridge
        echo echo [StealthDOM] Starting bridge server...
        echo echo.
        echo python bridge_server.py
    ) > "%STARTUP_FILE%"
    echo [StealthDOM] Auto-start: installed.
)
echo.

:: ── Check if bridge_server.py is already running ─────────────────────────────
set "BRIDGE_PID="
for /f %%P in ('powershell -NoProfile -Command "Get-WmiObject Win32_Process | Where-Object {$_.CommandLine -like '*bridge_server.py*'} | Select-Object -First 1 -ExpandProperty ProcessId"') do set "BRIDGE_PID=%%P"

if defined BRIDGE_PID (
    echo [StealthDOM] Bridge is already running ^(PID: %BRIDGE_PID%^).
    echo [StealthDOM] Press any key to close this window...
    pause >nul
    exit /b 0
)

:: ── Launch bridge (this window stays open — Ctrl+C to stop) ──────────────────
echo [StealthDOM] Starting bridge server... ^(Ctrl+C to stop^)
echo.
python bridge_server.py
