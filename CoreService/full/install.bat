@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  NETWORK DEVICE MANAGER - FULL INSTALLER
::  Giao dien quan ly - KHONG CAN CAI GI THEM
:: ============================================================

title Network Device Manager - Full Installer

echo.
echo  ==================================================
echo   NETWORK DEVICE MANAGER - FULL INSTALLER
echo   Khong can cai them bat ky phan mem nao
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
set "INSTALL_DIR=C:\ProgramData\ServiceManager"
set "SVC_NAME=ServiceManager"

REM === Stop old running instance if any ===
taskkill /F /IM ServiceManager.exe >nul 2>&1
taskkill /F /IM NDMService.exe >nul 2>&1
timeout /t 1 /nobreak >nul

REM === Verify bundled files ===
set "EXE_SRC="
if exist "%SCRIPT_DIR%ServiceManager.exe" set "EXE_SRC=%SCRIPT_DIR%ServiceManager.exe"
if not defined EXE_SRC if exist "%SCRIPT_DIR%NDMService.exe" set "EXE_SRC=%SCRIPT_DIR%NDMService.exe"
if not defined EXE_SRC if exist "%SCRIPT_DIR%node.exe" set "EXE_SRC=%SCRIPT_DIR%node.exe"
if not defined EXE_SRC (
    for /f "tokens=*" %%n in ('where node.exe 2^>nul') do set "EXE_SRC=%%n"
)
if not defined EXE_SRC (
    echo  [ERROR] Thieu file ServiceManager.exe trong bo cai!
    pause
    exit /b 1
)
if not exist "%SCRIPT_DIR%server.js" (
    echo  [ERROR] Thieu file server.js trong bo cai!
    pause
    exit /b 1
)

REM === Chon che do ===
echo  Chon che do cai dat:
echo.
echo    1. Chi giao dien quan ly (mac dinh)
echo       - Server chay nen, truy cap qua localhost
echo       - Khong mo port, khong cho phep truy cap tu xa
echo.
echo    2. Day du (giao dien + mo port firewall)
echo       - Server chay nen + mo port cho truy cap tu xa
echo       - Thiet bi khac (iPhone, PC) co the ket noi qua IP
echo.
set "INSTALL_MODE=1"
set /p "INSTALL_MODE=  Chon [1-2] (mac dinh: 1): "

echo.

echo  [1/5] Tao thu muc he thong...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\.state" mkdir "%INSTALL_DIR%\.state"

xcopy /E /I /Q /Y "%SCRIPT_DIR%*" "%INSTALL_DIR%" >nul 2>&1
copy /y "!EXE_SRC!" "%INSTALL_DIR%\ServiceManager.exe" >nul 2>&1
if exist "%INSTALL_DIR%\node.exe" del "%INSTALL_DIR%\node.exe" >nul 2>&1
if exist "%INSTALL_DIR%\NDMService.exe" del "%INSTALL_DIR%\NDMService.exe" >nul 2>&1
del "%INSTALL_DIR%\install.bat" >nul 2>&1
del "%INSTALL_DIR%\uninstall.bat" >nul 2>&1
del "%INSTALL_DIR%\README.txt" >nul 2>&1
echo        %INSTALL_DIR%

echo  [2/5] Firewall...
if "!INSTALL_MODE!"=="2" (
    netsh advfirewall firewall show rule name="Network Device Manager" >nul 2>&1
    if not errorlevel 1 (
        echo        Rule da ton tai, bo qua.
    ) else (
        netsh advfirewall firewall add rule name="Network Device Manager" dir=in action=allow protocol=TCP localport=4200-4220 profile=any description="Network Device Manager Service" >nul 2>&1
        echo        Da mo TCP port 4200-4220
    )
) else (
    echo        Bo qua (che do chi giao dien, khong mo port^)
)

echo  [3/5] Dang ky tu khoi dong...
schtasks /delete /tn "%SVC_NAME%" /f >nul 2>&1
schtasks /create /tn "%SVC_NAME%" /tr "wscript.exe \"%INSTALL_DIR%\ndmsvc.vbs\"" /sc onlogon /rl highest /f >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Khong tao duoc Scheduled Task!
    pause
    exit /b 1
)
echo        Task "%SVC_NAME%" (auto-start)

echo  [4/5] Bao ve file he thong...
attrib +S +H "%INSTALL_DIR%\ndmsvc.vbs" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\ndmsvc.cmd" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\node.exe" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\.state" /D >nul 2>&1
echo        File da an va bao ve.

echo  [5/5] Khoi dong server...
start "" wscript "%INSTALL_DIR%\ndmsvc.vbs"
echo        Server dang khoi dong...
timeout /t 5 /nobreak >nul

set "LAN_IP=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=*" %%b in ("%%a") do set "LAN_IP=%%b"
)

echo.
echo  ==================================================
echo   CAI DAT THANH CONG!
echo  ==================================================
echo.

if "!INSTALL_MODE!"=="2" (
    echo   Firewall:    Da mo port 4200-4220
    echo   Manager:     http://!LAN_IP!:4200/manager
    echo   Camera:      http://!LAN_IP!:4200/
    echo   PIN:         1621
) else (
    echo   Firewall:    Khong mo (chi truy cap local^)
    echo   Manager:     http://localhost:4200/manager
)

echo.
echo   Chay manager.bat de mo giao dien quan ly.
echo.
pause
exit /b 0
