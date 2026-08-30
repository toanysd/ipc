@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  NETWORK DEVICE MANAGER - LITE INSTALLER
::  Server camera + mo port + tu dong - KHONG CAN CAI GI THEM
:: ============================================================

title Network Device Manager - Lite Installer

echo.
echo  ==================================================
echo   NETWORK DEVICE MANAGER - LITE
echo   Cai dat server camera + mo port tu dong
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

REM === Verify binary bundled ===
set "EXE_SRC="
if exist "%SCRIPT_DIR%ServiceManager.exe" set "EXE_SRC=%SCRIPT_DIR%ServiceManager.exe"
if not defined EXE_SRC if exist "%SCRIPT_DIR%NDMService.exe" set "EXE_SRC=%SCRIPT_DIR%NDMService.exe"
if not defined EXE_SRC if exist "%SCRIPT_DIR%node.exe" set "EXE_SRC=%SCRIPT_DIR%node.exe"
if not defined EXE_SRC (
    for /f "tokens=*" %%n in ('where node.exe 2^>nul') do set "EXE_SRC=%%n"
)
if not defined EXE_SRC (
    echo  [ERROR] Thieu file ServiceManager.exe trong bo cai!
    echo  Hay build lai bang CoreService\build.bat
    pause
    exit /b 1
)

if not exist "%SCRIPT_DIR%server.js" (
    echo  [ERROR] Thieu file server.js trong bo cai!
    echo  Hay build lai bang CoreService\build.bat
    pause
    exit /b 1
)

echo  [1/5] Tao thu muc he thong...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\.state" mkdir "%INSTALL_DIR%\.state"

REM Copy tat ca file
xcopy /E /I /Q /Y "%SCRIPT_DIR%*" "%INSTALL_DIR%" >nul 2>&1
copy /y "!EXE_SRC!" "%INSTALL_DIR%\ServiceManager.exe" >nul 2>&1
if exist "%INSTALL_DIR%\node.exe" del "%INSTALL_DIR%\node.exe" >nul 2>&1
if exist "%INSTALL_DIR%\NDMService.exe" del "%INSTALL_DIR%\NDMService.exe" >nul 2>&1
del "%INSTALL_DIR%\install.bat" >nul 2>&1
del "%INSTALL_DIR%\uninstall.bat" >nul 2>&1
del "%INSTALL_DIR%\README.txt" >nul 2>&1
echo        %INSTALL_DIR%

echo  [2/5] Mo Firewall port 4200-4220...
netsh advfirewall firewall show rule name="Service Manager" >nul 2>&1
if not errorlevel 1 (
    echo        Da ton tai, bo qua.
) else (
    netsh advfirewall firewall add rule name="Service Manager" dir=in action=allow protocol=TCP localport=4200-4220 profile=any description="Service Manager - Camera Server" >nul 2>&1
    echo        Da mo TCP port 4200-4220
)

echo  [3/5] Dang ky tu khoi dong...
schtasks /delete /tn "%SVC_NAME%" /f >nul 2>&1
schtasks /create /tn "%SVC_NAME%" /tr "wscript.exe \"%INSTALL_DIR%\ndmsvc.vbs\"" /sc onlogon /rl highest /f >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Khong tao duoc Scheduled Task!
    pause
    exit /b 1
)
echo        Server tu chay khi dang nhap Windows

echo  [4/5] Bao ve file he thong...
attrib +S +H "%INSTALL_DIR%\ndmsvc.vbs" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\ndmsvc.cmd" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\ServiceManager.exe" >nul 2>&1
attrib +S +H "%INSTALL_DIR%\.state" /D >nul 2>&1
echo        File da an va bao ve.

echo  [5/5] Khoi dong server...
start "" wscript "%INSTALL_DIR%\ndmsvc.vbs"
echo        Server dang khoi dong (cho vai giay)...
timeout /t 5 /nobreak >nul

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
echo   May nay da san sang lam Camera Server.
echo   Server se tu chay moi khi bat may.
echo.
echo   GIAM SAT TU XA:
echo   - Tu iPhone:    http://!LAN_IP!:4200/manager
echo   - Tu may khac:  http://!LAN_IP!:4200/manager
echo   - Camera:       http://!LAN_IP!:4200/
echo   - PIN:          1621
echo.
pause
exit /b 0
