@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: Kiểm tra quyền Admin
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Đã có quyền Quản trị viên.
) else (
    echo [LỖI] Vui lòng chạy script này với quyền Administrator.
    pause
    exit /b 1
)

:: Kiểm tra Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [LỖI] Không tìm thấy Node.js. Vui lòng cài đặt Node.js trước khi tiếp tục.
    pause
    exit /b 1
)

echo ===================================================
echo CÀI ĐẶT SERVICE MANAGER - CLIENT (SILENT)
echo ===================================================

set "INSTALL_DIR=C:\ProgramData\ServiceManager"
set "CLIENT_DIR=%INSTALL_DIR%\Client"
set "FILES_DIR=%~dp0files\client"

if not exist "%FILES_DIR%" (
    echo [LỖI] Không tìm thấy thư mục tệp tin Client: %FILES_DIR%
    echo Vui lòng chạy prepare-files.bat trước!
    pause
    exit /b 1
)

echo Đang tạo thư mục cài đặt...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%CLIENT_DIR%" mkdir "%CLIENT_DIR%"

echo Đang sao chép tệp tin...
xcopy "%FILES_DIR%\*" "%CLIENT_DIR%\" /E /I /H /Y >nul

echo Đang cài đặt thư viện Node.js...
cd /d "%CLIENT_DIR%"
call npm install --production >nul 2>&1

echo Đang tạo script khởi động...
set "VBS_PATH=%CLIENT_DIR%\sm-client-launcher.vbs"
echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo WshShell.Run "cmd /c cd /d """"C:\ProgramData\ServiceManager\Client"""" && npx electron . --role=client --client", 0, False >> "%VBS_PATH%"

echo Đang đăng ký khởi động cùng hệ thống...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ServiceManagerClient" /t REG_SZ /d "\"%VBS_PATH%\"" /f >nul

echo Đang tạo trình gỡ cài đặt...
set "UNINSTALL_PATH=%INSTALL_DIR%\Uninstall-Client.bat"
echo @echo off > "%UNINSTALL_PATH%"
echo chcp 65001 ^>nul >> "%UNINSTALL_PATH%"
echo echo Đang gỡ cài đặt Service Manager Client... >> "%UNINSTALL_PATH%"
echo taskkill /F /IM electron.exe /T ^>nul 2^>^&1 >> "%UNINSTALL_PATH%"
echo reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ServiceManagerClient" /f ^>nul 2^>^&1 >> "%UNINSTALL_PATH%"
echo schtasks /Delete /TN "ServiceManagerClient" /F ^>nul 2^>^&1 >> "%UNINSTALL_PATH%"
echo rmdir /s /q "C:\ProgramData\ServiceManager\Client" >> "%UNINSTALL_PATH%"
echo echo Đã gỡ cài đặt thành công. >> "%UNINSTALL_PATH%"
echo pause >> "%UNINSTALL_PATH%"

echo Đang thiết lập thuộc tính ẩn cho thư mục...
attrib +h +s "%INSTALL_DIR%"

echo Đang khởi động Client...
cscript //nologo "%VBS_PATH%"

echo.
echo ===================================================
echo CÀI ĐẶT HOÀN TẤT!
echo ===================================================
pause
