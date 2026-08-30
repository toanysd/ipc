@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  NETWORK DEVICE MANAGER - SERVICE ENGINE
::  Dung node.exe dong goi san, khong can cai Node.js
::  Watchdog auto-restart khi crash
:: ============================================================

set "SCRIPT_DIR=%~dp0"
set "STATE_DIR=%SCRIPT_DIR%.state"
set "LOG_FILE=%STATE_DIR%\service.log"
set "NODE=%SCRIPT_DIR%ServiceManager.exe"

REM Fallback: neu khong co ServiceManager.exe thi tim NDMService.exe hoac node.exe
if not exist "%NODE%" set "NODE=%SCRIPT_DIR%NDMService.exe"
if not exist "%NODE%" set "NODE=%SCRIPT_DIR%node.exe"
if not exist "%NODE%" (
    where node >nul 2>&1
    if errorlevel 1 (
        echo [%date% %time%] ERROR: ServiceManager.exe not found >> "%LOG_FILE%"
        exit /b 1
    )
    set "NODE=node"
)

if not exist "%STATE_DIR%" mkdir "%STATE_DIR%"

echo. >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"
echo [%date% %time%] NDMService starting... >> "%LOG_FILE%"

REM === Brief wait for system startup ===
echo [%date% %time%] Waiting 5s for system ready... >> "%LOG_FILE%"
timeout /t 5 /nobreak >nul
echo [%date% %time%] Starting... >> "%LOG_FILE%"

REM === WATCHDOG LOOP ===
:WATCHDOG
echo [%date% %time%] Starting server on port 4200... >> "%LOG_FILE%"

set "PORT=4200"
set "HOSTNAME=0.0.0.0"

cd /d "%SCRIPT_DIR%"
"%NODE%" --max-old-space-size=128 --no-warnings server.js >> "%LOG_FILE%" 2>&1

echo [%date% %time%] Server stopped. >> "%LOG_FILE%"

if exist "%STATE_DIR%\stop.flag" (
    echo [%date% %time%] Stop flag detected. Exiting. >> "%LOG_FILE%"
    del "%STATE_DIR%\stop.flag" >nul 2>&1
    exit /b 0
)

echo [%date% %time%] WATCHDOG: Restart in 10s... >> "%LOG_FILE%"
timeout /t 10 /nobreak >nul

if exist "%STATE_DIR%\stop.flag" (
    del "%STATE_DIR%\stop.flag" >nul 2>&1
    exit /b 0
)

goto WATCHDOG
