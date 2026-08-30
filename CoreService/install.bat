@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  NETWORK DEVICE MANAGER - SYSTEM INSTALLER
::  Tu dong tim thu muc du an, cai vao ProgramData
:: ============================================================

title System Service Installer

echo.
echo  ==================================================
echo   NETWORK DEVICE MANAGER - SYSTEM INSTALLER
echo  ==================================================
echo.

REM === Check Admin ===
net session >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Can quyen Administrator!
    echo  Click phai file nay, chon "Run as administrator"
    echo.
    pause
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
set "INSTALL_DIR=C:\ProgramData\NetworkDeviceManager"
set "SVC_NAME=NetworkDeviceManager"
set "FW_NAME=Network Device Manager"

REM === Read source config ===
call :ReadConfig
if not defined PORT set "PORT=4200"
if not defined PORT_RANGE_START set "PORT_RANGE_START=4200"
if not defined PORT_RANGE_END set "PORT_RANGE_END=4220"
if not defined MODE set "MODE=dev"

REM === Resolve PROJECT_DIR ===
REM If relative (..) resolve from CoreService location
if not defined PROJECT_DIR set "PROJECT_DIR=.."

if "!PROJECT_DIR!"==".." (
    pushd "%SCRIPT_DIR%.."
    set "PROJECT_DIR=!CD!"
    popd
)
if "!PROJECT_DIR!"=="." (
    set "PROJECT_DIR=%SCRIPT_DIR:~0,-1%"
)

REM Verify project exists
if not exist "!PROJECT_DIR!\package.json" (
    echo  [!] Thu muc du an khong tim thay tai: !PROJECT_DIR!
    echo.
    echo  Nhap duong dan den thu muc du an IPC:
    echo  (Thu muc chua package.json)
    echo.
    set /p "PROJECT_DIR=  Path: "
    if not exist "!PROJECT_DIR!\package.json" (
        echo.
        echo  [ERROR] Khong tim thay package.json trong: !PROJECT_DIR!
        echo  Dam bao thu muc CoreService nam trong thu muc du an,
        echo  hoac nhap dung duong dan.
        pause
        exit /b 1
    )
)

echo  Source:   %SCRIPT_DIR%
echo  Install:  %INSTALL_DIR%
echo  Project:  !PROJECT_DIR!
echo.

REM === Step 1: Create system directory ===
echo  [1/5] Tao thu muc he thong...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\.state" mkdir "%INSTALL_DIR%\.state"
echo        %INSTALL_DIR%

REM === Step 2: Copy service files ===
echo  [2/5] Copy file dich vu...

REM Copy engine (auto-detects ndm.conf)
copy /y "%SCRIPT_DIR%core_service.bat" "%INSTALL_DIR%\ndmsvc.cmd" >nul 2>&1
echo        ndmsvc.cmd (service engine)

REM Write config with ABSOLUTE path (resolved)
(
    echo [NetworkDeviceManager]
    echo ; System installed configuration
    echo PROJECT_DIR=!PROJECT_DIR!
    echo PORT=!PORT!
    echo PORT_RANGE_START=!PORT_RANGE_START!
    echo PORT_RANGE_END=!PORT_RANGE_END!
    echo MODE=!MODE!
) > "%INSTALL_DIR%\ndm.conf"
echo        ndm.conf (config: PROJECT_DIR=!PROJECT_DIR!)

REM Write VBS launcher
echo Set WshShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\ndmsvc.vbs"
echo Set fso = CreateObject("Scripting.FileSystemObject") >> "%INSTALL_DIR%\ndmsvc.vbs"
echo scriptDir = fso.GetParentFolderName(WScript.ScriptFullName) ^& "\" >> "%INSTALL_DIR%\ndmsvc.vbs"
echo WshShell.Run """" ^& scriptDir ^& "ndmsvc.cmd""", 0, False >> "%INSTALL_DIR%\ndmsvc.vbs"
echo Set WshShell = Nothing >> "%INSTALL_DIR%\ndmsvc.vbs"
echo Set fso = Nothing >> "%INSTALL_DIR%\ndmsvc.vbs"
echo        ndmsvc.vbs (silent launcher)

REM === Step 3: Firewall Rule ===
echo  [3/5] Cau hinh Firewall...
netsh advfirewall firewall show rule name="%FW_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo        Rule da ton tai, bo qua.
) else (
    netsh advfirewall firewall add rule name="%FW_NAME%" dir=in action=allow protocol=TCP localport=!PORT_RANGE_START!-!PORT_RANGE_END! profile=any description="System network device manager" >nul 2>&1
    if errorlevel 1 (
        echo  [ERROR] Khong tao duoc Firewall Rule!
        pause
        exit /b 1
    )
    echo        Da mo TCP port !PORT_RANGE_START!-!PORT_RANGE_END!
)
echo %date% %time% > "%INSTALL_DIR%\.state\firewall.done"

REM === Step 4: Scheduled Task ===
echo  [4/5] Dang ky System Task...
schtasks /delete /tn "%SVC_NAME%" /f >nul 2>&1
schtasks /delete /tn "IPC_CoreService" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "IPC_CoreService" /f >nul 2>&1

schtasks /create /tn "%SVC_NAME%" /tr "wscript.exe \"%INSTALL_DIR%\ndmsvc.vbs\"" /sc onlogon /rl highest /f >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Khong tao duoc Scheduled Task!
    pause
    exit /b 1
)
echo        Task "%SVC_NAME%" (auto-start, highest privileges)

REM === Step 5: File Protection ===
echo  [5/5] Bao ve file he thong...
attrib +S +H "%INSTALL_DIR%\ndmsvc.vbs" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\ndmsvc.cmd" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\.state" /D >nul 2>&1
attrib +R "%INSTALL_DIR%\ndm.conf" >nul 2>&1
echo        File da an va bao ve.

REM === Remote Access Info ===
set "LAN_IP=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=*" %%b in ("%%a") do set "LAN_IP=%%b"
)

echo. > "%INSTALL_DIR%\REMOTE_ACCESS.txt"
echo  NETWORK DEVICE MANAGER - REMOTE ACCESS >> "%INSTALL_DIR%\REMOTE_ACCESS.txt"
echo  Manager:  http://!LAN_IP!:!PORT!/manager >> "%INSTALL_DIR%\REMOTE_ACCESS.txt"
echo  Camera:   http://!LAN_IP!:!PORT!/ >> "%INSTALL_DIR%\REMOTE_ACCESS.txt"
echo  PIN:      1621 >> "%INSTALL_DIR%\REMOTE_ACCESS.txt"
copy /y "%INSTALL_DIR%\REMOTE_ACCESS.txt" "%SCRIPT_DIR%REMOTE_ACCESS.txt" >nul 2>&1

echo.
echo  ==================================================
echo   CAI DAT THANH CONG!
echo  ==================================================
echo.
echo   Thu muc:     %INSTALL_DIR%
echo   Du an:       !PROJECT_DIR!
echo   Firewall:    TCP !PORT_RANGE_START!-!PORT_RANGE_END!
echo   Task:        %SVC_NAME% (auto-start)
echo.
echo   TRUY CAP TU XA:
echo   Manager:     http://!LAN_IP!:!PORT!/manager
echo   Camera:      http://!LAN_IP!:!PORT!/
echo   PIN:         1621
echo.
pause
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
