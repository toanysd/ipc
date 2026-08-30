@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  NETWORK DEVICE MANAGER SERVICE - UNINSTALLER
::  Gỡ cài đặt hoàn toàn: Task, Firewall, Files, Protection
:: ============================================================

title System Service Uninstaller

echo.
echo  ══════════════════════════════════════════════════
echo   NETWORK DEVICE MANAGER SERVICE - UNINSTALLER
echo  ══════════════════════════════════════════════════
echo.

REM === Kiểm tra quyền Admin ===
net session >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Administrator privileges required.
    echo          Right-click this file, select "Run as administrator"
    echo.
    pause
    exit /b 1
)

set "INSTALL_DIR=C:\ProgramData\NetworkDeviceManager"
set "SVC_NAME=NetworkDeviceManager"
set "FIREWALL_NAME=Network Device Manager"

REM === Bước 1: Dừng Service ===
echo  [1/5] Stopping service...
if exist "%INSTALL_DIR%\.state" (
    echo stop > "%INSTALL_DIR%\.state\stop.flag" 2>nul
)
REM Kill node processes liên quan
for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq node.exe" /fo csv /nh 2^>nul') do (
    set "PID=%%~a"
    wmic process where "ProcessId=!PID!" get CommandLine 2>nul | findstr /i "start_dev\|next" >nul 2>&1
    if not errorlevel 1 (
        taskkill /F /PID !PID! >nul 2>&1
        echo        Stopped PID !PID!
    )
)
echo        Done.

REM === Bước 2: Xóa Scheduled Task ===
echo  [2/5] Removing scheduled task...
schtasks /delete /tn "%SVC_NAME%" /f >nul 2>&1
schtasks /delete /tn "IPC_CoreService" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "IPC_CoreService" /f >nul 2>&1
echo        Removed.

REM === Bước 3: Xóa Firewall Rule ===
echo  [3/5] Removing firewall rule...
netsh advfirewall firewall delete rule name="%FIREWALL_NAME%" >nul 2>&1
netsh advfirewall firewall delete rule name="IPC_CoreService" >nul 2>&1
echo        Removed.

REM === Bước 4: Bỏ bảo vệ file ===
echo  [4/5] Removing file protection...
if exist "%INSTALL_DIR%" (
    attrib -S -H -R "%INSTALL_DIR%\ndmsvc.vbs" >nul 2>&1
    attrib -S -H -R "%INSTALL_DIR%\ndmsvc.cmd" >nul 2>&1
    attrib -S -H "%INSTALL_DIR%\.state" /D >nul 2>&1
    attrib -R "%INSTALL_DIR%\ndm.conf" >nul 2>&1
)
echo        Protection removed.

REM === Bước 5: Xóa thư mục hệ thống ===
echo  [5/5] Removing system directory...
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%"
    echo        Deleted %INSTALL_DIR%
) else (
    echo        Directory not found (already removed).
)

REM Xóa REMOTE_ACCESS.txt local nếu có
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%REMOTE_ACCESS.txt" del "%SCRIPT_DIR%REMOTE_ACCESS.txt"

echo.
echo  ══════════════════════════════════════════════════
echo   UNINSTALLATION COMPLETE
echo  ══════════════════════════════════════════════════
echo.
echo   - Scheduled Task removed
echo   - Firewall Rule removed
echo   - System directory removed
echo   - File protection cleared
echo.
echo   Service will NOT auto-start on next boot.
echo   Run install.bat to reinstall.
echo.
pause
exit /b 0
