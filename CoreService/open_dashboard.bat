@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  IPC CORE SERVICE - Mở Dashboard
::  Click đúp file này để mở giao diện quản lý camera
:: ============================================================

set "SCRIPT_DIR=%~dp0"
call :ReadConfig

REM === Xác định port thực tế ===
set "ACTUAL_PORT=!PORT!"
if exist "!PROJECT_DIR!\ipc_port.txt" (
    set /p ACTUAL_PORT=<"!PROJECT_DIR!\ipc_port.txt"
)

REM === Kiểm tra server đang chạy ===
netstat -ano 2>nul | findstr :!ACTUAL_PORT! | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] Server chua chay tren port !ACTUAL_PORT!
    echo      Cho may khoi dong hoac chay manager.bat de kiem tra.
    echo.
    pause
    exit /b 1
)

REM === Mở trình duyệt ===
start http://localhost:!ACTUAL_PORT!
exit /b 0

:ReadConfig
for /f "usebackq tokens=1,* delims==" %%a in ("%SCRIPT_DIR%config.ini") do (
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
