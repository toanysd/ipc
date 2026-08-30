@echo off
title Service Manager - Uninstall
echo ============================================
echo   Service Manager - Uninstall / Go bo cai dat
echo ============================================
echo.

echo Stopping all processes...
taskkill /F /IM "Service Manager.exe" /T >nul 2>&1
taskkill /F /IM "electron.exe" /T >nul 2>&1
taskkill /F /IM "go2rtc.exe" /T >nul 2>&1
timeout /t 2 >nul

echo Removing auto-start entries...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ServiceManager" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Service Manager" /f >nul 2>&1

echo Removing registry...
reg delete "HKCU\Software\ServiceManager" /f >nul 2>&1

echo Removing config data...
rmdir /S /Q "%APPDATA%\ServiceManager" >nul 2>&1
rmdir /S /Q "%APPDATA%\ServiceManager-Client" >nul 2>&1
rmdir /S /Q "%APPDATA%\service-manager" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\ServiceManager" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\ServiceManager-Client" >nul 2>&1

echo.
echo Uninstall complete. You can now delete this folder.
echo.
pause
