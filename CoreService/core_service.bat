@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  NETWORK DEVICE MANAGER - SERVICE ENGINE
::  Auto-detect config: ndm.conf or config.ini
::  Auto-resolve relative PROJECT_DIR
::  Watchdog auto-restart on crash
:: ============================================================

set "SCRIPT_DIR=%~dp0"
set "STATE_DIR=%SCRIPT_DIR%.state"
set "LOG_FILE=%STATE_DIR%\service.log"

REM === Auto-detect config file ===
set "CONF_FILE=%SCRIPT_DIR%ndm.conf"
if not exist "!CONF_FILE!" set "CONF_FILE=%SCRIPT_DIR%config.ini"

if not exist "%STATE_DIR%" mkdir "%STATE_DIR%"

echo. >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"
echo [%date% %time%] NetworkDeviceManager starting... >> "%LOG_FILE%"

REM === Read config ===
call :ReadConf
if not defined PROJECT_DIR (
    echo [%date% %time%] ERROR: Cannot read config >> "%LOG_FILE%"
    exit /b 1
)

REM === Resolve relative path ===
if "!PROJECT_DIR!"==".." (
    pushd "%SCRIPT_DIR%.."
    set "PROJECT_DIR=!CD!"
    popd
)
if "!PROJECT_DIR!"=="." (
    set "PROJECT_DIR=%SCRIPT_DIR%"
)

REM Resolve any other relative path
pushd "%SCRIPT_DIR%" 2>nul
if exist "!PROJECT_DIR!\package.json" (
    pushd "!PROJECT_DIR!"
    set "PROJECT_DIR=!CD!"
    popd
)
popd 2>nul

echo [%date% %time%] Config: PROJECT_DIR=!PROJECT_DIR!, PORT=!PORT!, MODE=!MODE! >> "%LOG_FILE%"

if not exist "!PROJECT_DIR!\package.json" (
    echo [%date% %time%] ERROR: package.json not found in !PROJECT_DIR! >> "%LOG_FILE%"
    echo [%date% %time%] Make sure CoreService is inside the project folder >> "%LOG_FILE%"
    exit /b 1
)

REM === Wait for network (max 60s) ===
echo [%date% %time%] Waiting for network... >> "%LOG_FILE%"
set /a "NET_RETRIES=0"

:WAIT_NET
ping -n 1 -w 1000 8.8.8.8 >nul 2>&1
if not errorlevel 1 goto NET_OK
ping -n 1 -w 1000 1.1.1.1 >nul 2>&1
if not errorlevel 1 goto NET_OK

set /a "NET_RETRIES+=1"
if !NET_RETRIES! gtr 20 (
    echo [%date% %time%] WARNING: Network timeout, starting anyway >> "%LOG_FILE%"
    goto NET_OK
)
timeout /t 3 /nobreak >nul
goto WAIT_NET

:NET_OK
echo [%date% %time%] Network OK >> "%LOG_FILE%"
cd /d "!PROJECT_DIR!"

where node >nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: Node.js not found in PATH >> "%LOG_FILE%"
    exit /b 1
)

if not exist "node_modules" (
    echo [%date% %time%] Installing dependencies... >> "%LOG_FILE%"
    call npm install >> "%LOG_FILE%" 2>&1
)

REM === WATCHDOG LOOP ===
:WATCHDOG
echo [%date% %time%] Starting server (PORT=!PORT!)... >> "%LOG_FILE%"

set "HOST=0.0.0.0"
set "PORT=!PORT!"

if /i "!MODE!"=="production" (
    echo [%date% %time%] Building for production... >> "%LOG_FILE%"
    call npm run build >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo [%date% %time%] ERROR: Build failed, fallback to dev >> "%LOG_FILE%"
        goto START_DEV
    )
    echo [%date% %time%] Starting production server... >> "%LOG_FILE%"
    call npx next start -p !PORT! -H 0.0.0.0 >> "%LOG_FILE%" 2>&1
) else (
    :START_DEV
    echo [%date% %time%] Starting dev server... >> "%LOG_FILE%"
    call npm run dev >> "%LOG_FILE%" 2>&1
)

echo [%date% %time%] Server process ended. >> "%LOG_FILE%"

if exist "%STATE_DIR%\stop.flag" (
    echo [%date% %time%] Stop flag detected. Exiting. >> "%LOG_FILE%"
    del "%STATE_DIR%\stop.flag" >nul 2>&1
    exit /b 0
)

echo [%date% %time%] WATCHDOG: Restarting in 10s... >> "%LOG_FILE%"
timeout /t 10 /nobreak >nul

if exist "%STATE_DIR%\stop.flag" (
    echo [%date% %time%] Stop flag detected. Exiting. >> "%LOG_FILE%"
    del "%STATE_DIR%\stop.flag" >nul 2>&1
    exit /b 0
)

goto WATCHDOG

:ReadConf
for /f "usebackq tokens=1,* delims==" %%a in ("!CONF_FILE!") do (
    set "_key=%%a"
    if defined _key (
        if not "!_key:~0,1!"==";" if not "!_key:~0,1!"=="[" (
            set "_val=%%b"
            if defined _val (
                for /f "tokens=*" %%k in ("!_key!") do (
                    for /f "tokens=*" %%v in ("!_val!") do (
                        set "%%k=%%v"
                    )
                )
            )
        )
    )
)
goto :eof
