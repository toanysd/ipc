@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo ===================================================
echo CHUẨN BỊ TỆP TIN CÀI ĐẶT SERVICE MANAGER
echo ===================================================

set "SRC_DIR=d:\AntiGravity_Workspace\apps\ipc\ServiceManager"
set "DEST_DIR=%~dp0files"

if not exist "%SRC_DIR%" (
    echo [LỖI] Thư mục nguồn không tồn tại: %SRC_DIR%
    pause
    exit /b 1
)

echo Đang tạo cấu trúc thư mục...
if exist "%DEST_DIR%" rmdir /s /q "%DEST_DIR%"
mkdir "%DEST_DIR%\server"
mkdir "%DEST_DIR%\client"

echo Đang sao chép các tệp Server...
xcopy "%SRC_DIR%\*" "%DEST_DIR%\server\" /E /I /H /Y /EXCLUDE:%~dp0exclude.txt >nul
if errorlevel 1 echo [LỖI] Sao chép Server thất bại!

echo Đang sao chép các tệp Client...
xcopy "%SRC_DIR%\*" "%DEST_DIR%\client\" /E /I /H /Y /EXCLUDE:%~dp0exclude.txt >nul
if errorlevel 1 echo [LỖI] Sao chép Client thất bại!

echo.
echo ===================================================
echo HOÀN TẤT CHUẨN BỊ TỆP TIN!
echo Thư mục: %DEST_DIR%
echo ===================================================
pause
