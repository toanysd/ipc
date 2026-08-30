@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  NETWORK DEVICE MANAGER - MANAGER LAUNCHER
::  Mở giao diện quản lý trên trình duyệt
:: ============================================================

set "SCRIPT_DIR=%~dp0"
set "INSTALL_DIR=C:\ProgramData\NetworkDeviceManager"
set "CONF_FILE=ndm.conf"

REM === Đọc config từ thư mục hệ thống (ưu tiên) hoặc local ===
if exist "%INSTALL_DIR%\%CONF_FILE%" (
    call :ReadConfig "%INSTALL_DIR%\%CONF_FILE%"
) else (
    call :ReadConfig "%SCRIPT_DIR%config.ini"
)

REM === Xác định port ===
set "ACTUAL_PORT=!PORT!"
if defined PROJECT_DIR (
    if exist "!PROJECT_DIR!\ipc_port.txt" (
        set /p ACTUAL_PORT=<"!PROJECT_DIR!\ipc_port.txt"
    )
)

REM === Kiểm tra server ===
netstat -ano 2>nul | findstr :!ACTUAL_PORT! | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] Server not running on port !ACTUAL_PORT!
    echo.
    echo  1. Start server then open Manager
    echo  2. Exit
    echo.
    set /p "choice=  Choose [1-2]: "
    if "!choice!"=="1" (
        echo  Starting service...
        if exist "%INSTALL_DIR%\ndmsvc.vbs" (
            start "" wscript "%INSTALL_DIR%\ndmsvc.vbs"
        ) else (
            start "" wscript "%SCRIPT_DIR%core_service.vbs"
        )
        echo  Waiting for server...
        set /a "WAIT=0"
        :WAIT_SRV
        timeout /t 3 /nobreak >nul
        set /a "WAIT+=1"
        netstat -ano 2>nul | findstr :!ACTUAL_PORT! | findstr LISTENING >nul 2>&1
        if not errorlevel 1 goto OPEN_MGR
        if !WAIT! lss 20 goto WAIT_SRV
        echo  [!] Server not ready after 60 seconds.
        pause
        exit /b 1
    )
    exit /b 0
)

:OPEN_MGR
echo  Opening Manager Dashboard...
start http://localhost:!ACTUAL_PORT!/manager
exit /b 0

:ReadConfig
for /f "usebackq tokens=1,* delims==" %%a in ("%~1") do (
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
