@echo off
title Service Manager - Stop All
echo Stopping Service Manager processes...
taskkill /F /IM "Service Manager.exe" /T >nul 2>&1
taskkill /F /IM "electron.exe" /T >nul 2>&1
taskkill /F /IM "go2rtc.exe" /T >nul 2>&1

echo Freeing ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3456') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :1984') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8555') do taskkill /F /PID %%a >nul 2>&1

echo Removing auto-start...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ServiceManager" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Service Manager" /f >nul 2>&1

echo.
echo All Service Manager processes stopped.
pause
