@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: Kiểm tra quyền Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
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

:welcome
cls
color 0B
echo.
echo  ======================================================
echo     ____                  _          __  __
echo    / ___^| ___ _ ____   _(_) ___ ___^|  ^\/  ^| __ _ _ __
echo    ^\___ ^\/ _ ^\ '__^\ ^\ / / ^|/ __/ _ ^\ ^|\/^| ^|/ _` ^| '_ ^\
echo     ___) ^|  __/ ^|   ^\ V /^| ^| (_^|  __/ ^|  ^| ^| (_^| ^| ^| ^| ^|
echo    ^|____/ ^\___^|_^|    ^\_/ ^|_^|^\___^\___^|_^|  ^|_^|^\__,_^|_^| ^|_^|
echo.
echo            TRÌNH CÀI ĐẶT SERVICE MANAGER
echo  ======================================================
echo.
echo Chọn thành phần muốn cài đặt:
echo [1] Server (Manager)
echo [2] Client
echo [3] Cả hai (Server + Client)
echo.
set /p role_choice="Nhập lựa chọn của bạn (1-3): "

if "%role_choice%"=="1" set "ROLE=Server"
if "%role_choice%"=="2" set "ROLE=Client"
if "%role_choice%"=="3" set "ROLE=Both"

if not defined ROLE goto welcome

:location
set "DEFAULT_DIR=C:\ProgramData\ServiceManager"
set /p INSTALL_DIR="Nhập đường dẫn cài đặt [%DEFAULT_DIR%]: "
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=%DEFAULT_DIR%"

echo.
echo ===================================================
echo XÁC NHẬN CÀI ĐẶT
echo ===================================================
echo Thành phần: %ROLE%
echo Đường dẫn: %INSTALL_DIR%
echo.
set /p confirm="Tiến hành cài đặt? (Y/N): "
if /i not "%confirm%"=="Y" exit /b 0

echo.
echo Đang tiến hành cài đặt...

if "%ROLE%"=="Server" goto install_server
if "%ROLE%"=="Client" goto install_client
if "%ROLE%"=="Both" (
    call :install_server_func
    call :install_client_func
    goto finish
)

:install_server
call :install_server_func
goto finish

:install_client
call :install_client_func
goto finish

:install_server_func
echo.
echo [SERVER] Đang thiết lập Server...
set "SERVER_DIR=%INSTALL_DIR%\Server"
if not exist "%SERVER_DIR%" mkdir "%SERVER_DIR%"
echo [SERVER] Đang sao chép tệp tin...
xcopy "%~dp0files\server\*" "%SERVER_DIR%\" /E /I /H /Y >nul
echo [SERVER] Đang cài đặt thư viện Node.js...
cd /d "%SERVER_DIR%"
call npm install >nul 2>&1
echo [SERVER] Đang tạo script khởi động...
set "START_SERVER_BAT=%SERVER_DIR%\Start-Server.bat"
echo @echo off > "%START_SERVER_BAT%"
echo cd /d "%%~dp0" >> "%START_SERVER_BAT%"
echo npm start >> "%START_SERVER_BAT%"
echo [SERVER] Đang tạo lối tắt Desktop...
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\Start-Server.lnk"
set "PS_SCRIPT=$wshell = New-Object -ComObject WScript.Shell; $shortcut = $wshell.CreateShortcut('%SHORTCUT_PATH%'); $shortcut.TargetPath = '%START_SERVER_BAT%'; $shortcut.WorkingDirectory = '%SERVER_DIR%'; $shortcut.Save()"
powershell -NoProfile -Command "%PS_SCRIPT%"
exit /b 0

:install_client_func
echo.
echo [CLIENT] Đang thiết lập Client...
set "CLIENT_DIR=%INSTALL_DIR%\Client"
if not exist "%CLIENT_DIR%" mkdir "%CLIENT_DIR%"
echo [CLIENT] Đang sao chép tệp tin...
xcopy "%~dp0files\client\*" "%CLIENT_DIR%\" /E /I /H /Y >nul
echo [CLIENT] Đang cài đặt thư viện Node.js...
cd /d "%CLIENT_DIR%"
call npm install --production >nul 2>&1
echo [CLIENT] Đang tạo script khởi động...
set "VBS_PATH=%CLIENT_DIR%\sm-client-launcher.vbs"
echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo WshShell.Run "cmd /c cd /d """"%CLIENT_DIR%"""" && npx electron . --role=client --client", 0, False >> "%VBS_PATH%"
echo [CLIENT] Đang đăng ký dịch vụ khởi động (ẩn)...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ServiceManagerClient" /t REG_SZ /d "\"%VBS_PATH%\"" /f >nul
exit /b 0

:finish
echo.
echo ===================================================
echo HOÀN TẤT CÀI ĐẶT!
echo ===================================================
echo Cài đặt thành công vào: %INSTALL_DIR%
echo.
set /p start_now="Khởi động ngay bây giờ? (Y/N): "
if /i "%start_now%"=="Y" (
    if "%ROLE%"=="Client" cscript //nologo "%INSTALL_DIR%\Client\sm-client-launcher.vbs"
    if "%ROLE%"=="Server" start cmd /c "%INSTALL_DIR%\Server\Start-Server.bat"
    if "%ROLE%"=="Both" (
        start cmd /c "%INSTALL_DIR%\Server\Start-Server.bat"
        cscript //nologo "%INSTALL_DIR%\Client\sm-client-launcher.vbs"
    )
)
pause
