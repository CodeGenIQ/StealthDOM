@echo off
title StealthDOM - Stop Bridge
cd /d "%~dp0"

set "STARTUP_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\StealthDOM_bridge.bat"

echo [StealthDOM] ================================================
echo [StealthDOM]  Stop Bridge Server
echo [StealthDOM] ================================================
echo.

:: ── Find and kill bridge_server.py process ───────────────────────────────────
:: Uses CIM + Name filter + $PID exclusion to avoid matching the query itself.
set "BRIDGE_PID="
for /f %%P in ('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%%'\" | Where-Object {$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like '*bridge_server.py*'} | Select-Object -First 1 -ExpandProperty ProcessId"') do set "BRIDGE_PID=%%P"

if defined BRIDGE_PID (
    :: Validate the PID is actually alive before killing
    tasklist /FI "PID eq %BRIDGE_PID%" 2>nul | findstr /I "python" >nul 2>&1
    if not errorlevel 1 (
        echo [StealthDOM] Found bridge at PID %BRIDGE_PID% — terminating...
        taskkill /PID %BRIDGE_PID% /F >nul 2>&1
        echo [StealthDOM] Process terminated.
    ) else (
        echo [StealthDOM] Bridge is not running. ^(stale PID %BRIDGE_PID% ignored^)
    )
) else (
    echo [StealthDOM] Bridge is not running.
)
echo.

:: ── Remove from Windows Startup folder ───────────────────────────────────────
if exist "%STARTUP_FILE%" (
    echo [StealthDOM] Removing from Windows Startup folder...
    del "%STARTUP_FILE%"
    echo [StealthDOM] Auto-start removed.
) else (
    echo [StealthDOM] Not in Startup folder — nothing to remove.
)

echo.
echo [StealthDOM] Done. Press any key to close...
pause >nul
