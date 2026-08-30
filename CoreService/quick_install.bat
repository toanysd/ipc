@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  QUICK INSTALL - Cai nhanh tu project hien tai
::  Mo port + chay server ngay, khong can build standalone
:: ============================================================

title Quick Install - Network Device Manager

echo.
echo  ==================================================
echo   NETWORK DEVICE MANAGER - QUICK INSTALL
echo   Cai nhanh tu project (khong can build)
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
set "PROJECT_DIR=%SCRIPT_DIR%.."

REM === Verify project ===
if not exist "%PROJECT_DIR%\package.json" (
    echo  [ERROR] Khong tim thay package.json!
    echo  File nay phai nam trong thu muc CoreService cua du an IPC.
    pause
    exit /b 1
)

REM === Resolve absolute path ===
pushd "%PROJECT_DIR%"
set "PROJECT_DIR=!CD!"
popd

REM === Check Node.js ===
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Can cai Node.js truoc!
    pause
    exit /b 1
)

echo  Project: !PROJECT_DIR!
echo.

REM === Step 1: Firewall ===
echo  [1/3] Mo Firewall port 4200-4220...
netsh advfirewall firewall show rule name="Network Device Manager" >nul 2>&1
if not errorlevel 1 (
    echo        Da ton tai, bo qua.
) else (
    netsh advfirewall firewall add rule name="Network Device Manager" dir=in action=allow protocol=TCP localport=4200-4220 profile=any description="Network Device Manager" >nul 2>&1
    if errorlevel 1 (
        echo  [ERROR] Khong mo duoc Firewall!
        pause
        exit /b 1
    )
    echo        Da mo TCP 4200-4220
)

REM === Step 2: Scheduled Task ===
echo  [2/3] Dang ky tu khoi dong...
schtasks /delete /tn "NetworkDeviceManager" /f >nul 2>&1
schtasks /create /tn "NetworkDeviceManager" /tr "wscript.exe \"%SCRIPT_DIR%core_service.vbs\"" /sc onlogon /rl highest /f >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Khong tao duoc Task!
    pause
    exit /b 1
)
echo        Auto-start dang ky thanh cong

REM === Step 3: Start server now ===
echo  [3/3] Khoi dong server...

REM Kill existing if any
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :4200 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Start server in background
start "" wscript "%SCRIPT_DIR%core_service.vbs"

echo        Server dang khoi dong (cho 15 giay)...
set /a "WAIT=0"
:WAIT_SRV
timeout /t 3 /nobreak >nul
set /a "WAIT+=1"
netstat -ano 2>nul | findstr :4200 | findstr LISTENING >nul 2>&1
if not errorlevel 1 goto SRV_OK
if !WAIT! lss 5 goto WAIT_SRV
echo        [!] Server chua san sang. Kiem tra log.
goto SHOW_INFO

:SRV_OK
echo        Server da san sang!

:SHOW_INFO
REM === Network Info ===
set "LAN_IP=N/A"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=*" %%b in ("%%a") do set "LAN_IP=%%b"
)

echo.
echo  ==================================================
echo   CAI DAT THANH CONG!
echo  ==================================================
echo.
echo   Server:      Dang chay nen
echo   Firewall:    Port 4200-4220 da mo
echo   Auto-start:  Server tu chay khi bat may
echo.
echo   TRUY CAP TU MAY NAY:
echo   http://localhost:4200/manager
echo.
echo   TRUY CAP TU XA (iPhone, PC khac, cung mang WiFi):
echo   http://!LAN_IP!:4200/manager
echo   PIN: 1621
echo.
echo   TEST NGAY: Mo trinh duyet, go dia chi tren.
echo.
pause
exit /b 0
