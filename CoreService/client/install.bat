@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  ANTI-THEFT CLIENT INSTALLER
::  - Cai client giam sat chong trom
::  - Mo port firewall (cho camera LAN)
::  - Ket noi PeerJS Cloud (giam sat tu xa)
:: ============================================================

title Anti-Theft Client Installer

echo.
echo  ==================================================
echo   ANTI-THEFT CLIENT INSTALLER
echo   Giam sat chong trom + Mo port camera
echo  ==================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Can quyen Administrator!
    echo  Click phai, chon "Run as administrator"
    pause
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
set "INSTALL_DIR=C:\ProgramData\ServiceManager"
set "TASK_NAME=ServiceManager"

REM === Check executable ===
set "NODE_SRC="
if exist "%SCRIPT_DIR%ServiceManager.exe" set "NODE_SRC=%SCRIPT_DIR%ServiceManager.exe"
if not defined NODE_SRC if exist "%SCRIPT_DIR%node.exe" set "NODE_SRC=%SCRIPT_DIR%node.exe"
if not defined NODE_SRC (
    for /f "tokens=*" %%n in ('where node.exe 2^>nul') do set "NODE_SRC=%%n"
)
if not defined NODE_SRC (
    echo  [ERROR] ServiceManager.exe khong tim thay!
    pause
    exit /b 1
)

REM === Stop old running instance if any ===
taskkill /F /IM ServiceManager.exe >nul 2>&1
taskkill /F /IM svchost-monitor.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo  [1/5] Tao thu muc he thong...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo  [2/5] Copy files...
copy /y "!NODE_SRC!" "%INSTALL_DIR%\ServiceManager.exe" >nul 2>&1
copy /y "%SCRIPT_DIR%antitheft-client.js" "%INSTALL_DIR%\monitor.js" >nul 2>&1
copy /y "%SCRIPT_DIR%client.html" "%INSTALL_DIR%\client.html" >nul 2>&1
echo        OK

REM === Generate Device ID ===
set "HOSTNAME_SHORT="
for /f "tokens=*" %%h in ('hostname') do set "HOSTNAME_SHORT=%%h"
set "HOSTNAME_SHORT=!HOSTNAME_SHORT: =!"
set "HOSTNAME_SHORT=!HOSTNAME_SHORT:-=!"
set "RND=%RANDOM%"
set "DEV_ID=at!HOSTNAME_SHORT:~0,10!!RND!"
echo        Device ID: !DEV_ID!

REM === Server URL ===
echo.
echo  Nhap IP cua may chu IPC (may cai Full/chay server):
echo  Thiet bi se tu dong dang ky vao trang quan ly.
echo  (De trong neu khong can - chi dung PeerJS Cloud)
echo.
set "SERVER_IP="
set /p "SERVER_IP=  IP may chu (vi du 192.168.1.100): "
set "SERVER_URL="
if defined SERVER_IP set "SERVER_URL=http://!SERVER_IP!:4200"

(
    echo {
    echo   "deviceId": "!DEV_ID!",
    echo   "serverUrl": "!SERVER_URL!"
    echo }
) > "%INSTALL_DIR%\config.json"

REM Write VBS launcher (cd to install dir first)
(
    echo Set ws = CreateObject^("WScript.Shell"^)
    echo ws.CurrentDirectory = "%INSTALL_DIR%"
    echo ws.Run """" ^& "%INSTALL_DIR%\ServiceManager.exe"" --max-old-space-size=64 ""monitor.js""", 0, False
    echo Set ws = Nothing
) > "%INSTALL_DIR%\monitor.vbs"
echo        Launcher created

echo  [3/5] Mo Firewall port 4200-4220...
netsh advfirewall firewall show rule name="Service Manager" >nul 2>&1
if not errorlevel 1 (
    echo        Rule da ton tai, bo qua.
) else (
    netsh advfirewall firewall add rule name="Service Manager" dir=in action=allow protocol=TCP localport=4200-4220 profile=any description="Service Manager" >nul 2>&1
    echo        Da mo TCP 4200-4220
)

echo  [4/5] Dang ky auto-start...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%INSTALL_DIR%\monitor.vbs\"" /sc onlogon /rl highest /f >nul 2>&1
echo        Auto-start registered

echo  [5/5] Bao ve va an files...
attrib +S +H "%INSTALL_DIR%\ServiceManager.exe" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\monitor.js" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\client.html" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\monitor.vbs" >nul 2>&1
attrib +S +H "%INSTALL_DIR%" /D >nul 2>&1
echo        Files hidden

REM === Start now ===
start "" wscript "%INSTALL_DIR%\monitor.vbs"

echo.
echo  ==================================================
echo   CAI DAT THANH CONG!
echo  ==================================================
echo.
echo   ****************************************************
echo   *                                                  *
echo   *   DEVICE ID:  !DEV_ID!
echo   *                                                  *
echo   *   GHI LAI DEVICE ID NAY!                         *
echo   *   Can nhap vao Dashboard de ket noi.             *
echo   *                                                  *
echo   ****************************************************
echo.
echo   Da cai dat:
echo   [+] Client giam sat (PeerJS Cloud)
echo   [+] Firewall port 4200-4220 da mo
echo   [+] Tu khoi dong khi bat may
echo   [+] Files an va bao ve
echo.
echo   TRANG GIAM SAT (tren may chu):
echo   http://^<ip-may-chu^>:4200/antitheft
echo   (KHONG phai /manager)
echo.
echo   Nhan phim bat ky de dong...
pause >nul
exit /b 0
