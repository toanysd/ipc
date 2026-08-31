@echo off
title Service Manager
cd /d "%~dp0"

set EXE_PORTABLE=%~dp0dist\win-unpacked\Service Manager.exe
set EXE_SAME=%~dp0Service Manager.exe

if exist "%EXE_PORTABLE%" (
    start "" "%EXE_PORTABLE%" --role=manager
    exit /b 0
)

if exist "%EXE_SAME%" (
    start "" "%EXE_SAME%" --role=manager
    exit /b 0
)

echo.
echo [Service Manager] Khong tim thay file thuc thi portable.
echo Hay build truoc: cd ServiceManager-Client-Portable ^&^& npm install ^&^& npm run dist
pause
exit /b 1
