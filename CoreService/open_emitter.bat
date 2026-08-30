@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  IPC CORE SERVICE - Emitter
::  Mở trang phát webcam để Manager từ xa có thể xem
::  Chỉ cần mở 1 lần, cấp quyền camera lần đầu
:: ============================================================

set "SCRIPT_DIR=%~dp0"
call :ReadConfig

set "ACTUAL_PORT=!PORT!"
if exist "!PROJECT_DIR!\ipc_port.txt" (
    set /p ACTUAL_PORT=<"!PROJECT_DIR!\ipc_port.txt"
)

REM === Kiểm tra server ===
netstat -ano 2>nul | findstr :!ACTUAL_PORT! | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] Server chua chay. Khoi dong server truoc.
    echo      Chay manager.bat hoac cho may khoi dong.
    echo.
    pause
    exit /b 1
)

echo  Mo trang phat Webcam...
echo  Lan dau: click "Bat Webcam" de cap quyen camera.
echo  Lan sau: tu dong bat.
start http://localhost:!ACTUAL_PORT!/emitter
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
