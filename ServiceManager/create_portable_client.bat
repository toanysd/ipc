@echo off
title Tao Goi Portable Cho May Khach (Client)
cd /d "%~dp0"

set DEST=..\ServiceManager-Client-Portable

echo ====================================================
echo   DANG DONG GOI PORTABLE CHO MAY KHACH (CLIENT)...
echo ====================================================
echo.

if exist "%DEST%" rmdir /S /Q "%DEST%"
mkdir "%DEST%"
mkdir "%DEST%\client"
mkdir "%DEST%\src"
mkdir "%DEST%\resources"

echo 1. Dang copy file ma nguon client...
copy package.json "%DEST%\" >nul
copy main.js "%DEST%\" >nul
copy preload.js "%DEST%\" >nul
copy start_client.bat "%DEST%\" >nul
copy stop.bat "%DEST%\" >nul
copy uninstall.bat "%DEST%\" >nul

copy client\client.html "%DEST%\client\" >nul
copy src\config.js "%DEST%\src\" >nul
copy src\upnp-manager.js "%DEST%\src\" >nul
copy src\go2rtc-manager.js "%DEST%\src\" >nul
copy resources\go2rtc.exe "%DEST%\resources\" >nul

echo 2. Dang copy thu vien node_modules (Vui long doi trong giay lat)...
robocopy node_modules "%DEST%\node_modules" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul

echo.
echo ====================================================
echo   HOAN THANH! THU MUC PORTABLE DA TAO TAI:
echo   %DEST%
echo ====================================================
echo.
echo Huong dan:
echo 1. Chi can copy toan bo thu muc "ServiceManager-Client-Portable" sang Laptop.
echo 2. Chay file "start_client.bat" tren Laptop.
echo 3. May khach se tu dong ket noi ve Dashboard tren may chu.
echo.
pause
