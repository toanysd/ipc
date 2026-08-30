@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================
echo  DANG KY DICH VU HE THONG - SERVICE MANAGER CLIENT
echo ===================================================
echo.

:: 1. Install dependencies if needed
if not exist "node_modules\" (
    echo [1/4] Dang cai dat thu vien...
    call npm install --production >nul 2>&1
    echo       Hoan tat.
) else (
    echo [1/4] Thu vien da co san.
)

:: 2. Create VBS silent launcher (runs without any visible window)
echo [2/4] Tao trinh khoi dong an...
set "VBS_PATH=%~dp0_sm_service.vbs"
echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo WshShell.Run "cmd /c cd /d """"""%~dp0"""""" && npx electron . --role=client --client", 0, False >> "%VBS_PATH%"

:: 3. Register with Windows Startup (runs when user logs in)
echo [3/4] Dang ky khoi dong cung Windows...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ServiceManagerClient" /t REG_SZ /d "wscript.exe ""%VBS_PATH%""" /f >nul 2>&1

:: 4. Set folder attributes (hidden + system)
echo [4/4] An thu muc va thiet lap thuoc tinh he thong...
attrib +h "%~dp0_sm_service.vbs"
attrib +h "%~dp0_sm_silent.vbs" 2>nul

echo.
echo ===================================================
echo  HOAN TAT! Dich vu da duoc cai dat.
echo ===================================================
echo.
echo Thong tin:
echo  - Khoi dong tu dong khi dang nhap Windows
echo  - Chay hoan toan an (khong hien cua so)
echo  - Trong Task Manager hien thi la: electron.exe
echo  - De go bo: chay Uninstall-Service.bat
echo.

:: Start immediately
echo Dang khoi dong dich vu...
wscript.exe "%VBS_PATH%"
echo Dich vu da khoi dong thanh cong!
echo.
pause
