@echo off
chcp 65001 >nul
echo ===================================================
echo  GO BO DICH VU SERVICE MANAGER CLIENT
echo ===================================================
echo.

:: 1. Kill running processes
echo [1/3] Dang dung tien trinh...
taskkill /F /IM electron.exe /T >nul 2>&1
taskkill /F /IM go2rtc.exe >nul 2>&1

:: 2. Remove startup registration
echo [2/3] Xoa dang ky khoi dong cung Windows...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ServiceManagerClient" /f >nul 2>&1

:: 3. Clean up VBS files
echo [3/3] Don dep tap tin...
del /f /q "%~dp0_sm_service.vbs" 2>nul
del /f /q "%~dp0_sm_silent.vbs" 2>nul
del /f /q "%~dp0launch.vbs" 2>nul

echo.
echo ===================================================
echo  DA GO BO THANH CONG!
echo ===================================================
echo  Dich vu khong con khoi dong cung Windows.
echo  Ban co the xoa thu muc nay neu khong can nua.
echo.
pause
