@echo off
title StealthDOM Bridge
cd /d "%~dp0"

:: ── Resolve project folder (strip trailing backslash) ────────────────────────
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

echo [StealthDOM] ================================================
echo [StealthDOM]  Bridge Server
echo [StealthDOM]  %PROJECT_DIR%
echo [StealthDOM] ================================================
echo.

:: ── Check if bridge_server.py is already running ─────────────────────────────
set "BRIDGE_PID="
for /f %%P in ('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%%'\" | Where-Object {$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like '*bridge_server.py*'} | Select-Object -First 1 -ExpandProperty ProcessId"') do set "BRIDGE_PID=%%P"

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
