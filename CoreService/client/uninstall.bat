@echo off
chcp 65001 >nul 2>&1

title Anti-Theft Client Uninstaller

echo.
echo  ==================================================
echo   ANTI-THEFT CLIENT - UNINSTALLER
echo  ==================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Can quyen Administrator!
    pause
    exit /b 1
)

set "INSTALL_DIR=C:\ProgramData\ServiceManager"
set "LEGACY_DIR=C:\ProgramData\SystemHealthMonitor"

echo  [1/3] Dung client...
taskkill /F /IM ServiceManager.exe >nul 2>&1
taskkill /F /IM svchost-monitor.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo  [2/3] Xoa Scheduled Task...
schtasks /delete /tn "ServiceManager" /f >nul 2>&1
schtasks /delete /tn "SystemHealthMonitor" /f >nul 2>&1

echo  [3/3] Xoa files...
if exist "%INSTALL_DIR%" (
    attrib -S -H -R "%INSTALL_DIR%\*" /S /D >nul 2>&1
    attrib -S -H "%INSTALL_DIR%" /D >nul 2>&1
    rmdir /s /q "%INSTALL_DIR%"
)
if exist "%LEGACY_DIR%" (
    attrib -S -H -R "%LEGACY_DIR%\*" /S /D >nul 2>&1
    attrib -S -H "%LEGACY_DIR%" /D >nul 2>&1
    rmdir /s /q "%LEGACY_DIR%"
)

echo.
echo  GO CAI DAT THANH CONG!
echo.
pause
exit /b 0
