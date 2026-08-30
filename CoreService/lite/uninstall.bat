@echo off
chcp 65001 >nul 2>&1

:: ============================================================
::  NETWORK DEVICE MANAGER - LITE UNINSTALLER
:: ============================================================

title Network Device Manager - Lite Uninstaller

echo.
echo  ==================================================
echo   NETWORK DEVICE MANAGER - LITE UNINSTALLER
echo  ==================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Can quyen Administrator!
    echo  Click phai file nay, chon "Run as administrator"
    echo.
    pause
    exit /b 1
)

set "INSTALL_DIR=C:\ProgramData\ServiceManager"

echo  [1/4] Dung server...
if exist "%INSTALL_DIR%\.state" (
    echo stop > "%INSTALL_DIR%\.state\stop.flag" 2>nul
)
taskkill /F /IM ServiceManager.exe >nul 2>&1
taskkill /F /IM NDMService.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo        Done.

echo  [2/4] Xoa Scheduled Task...
schtasks /delete /tn "ServiceManager" /f >nul 2>&1
schtasks /delete /tn "NetworkDeviceManager" /f >nul 2>&1
echo        Done.

echo  [3/4] Xoa Firewall Rule...
netsh advfirewall firewall delete rule name="Service Manager" >nul 2>&1
netsh advfirewall firewall delete rule name="Network Device Manager" >nul 2>&1
echo        Done.

echo  [4/4] Xoa thu muc he thong...
if exist "%INSTALL_DIR%" (
    attrib -S -H -R "%INSTALL_DIR%\*" /S /D >nul 2>&1
    rmdir /s /q "%INSTALL_DIR%"
    echo        Da xoa.
) else (
    echo        Khong tim thay.
)

echo.
echo  GO CAI DAT THANH CONG!
echo.
pause
exit /b 0
