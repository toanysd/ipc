@echo off
title Push Code to GitHub (toanysd/ipc)
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================
echo   ĐAY DU LIEU LEN GITHUB REPOSITORY: toanysd/ipc
echo ===================================================
echo.
echo Dang kiem tra remote git...
git remote -v
echo.
echo Dang tien hanh push len nhanh main...
echo (Neu cua so trinh duyet hoac yeu cau dang nhap xuat hien, vui long dang nhap GitHub)
echo.

git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===================================================
    echo   [OK] DA DAY LEN GITHUB THANH CONG!
    echo   Link: https://github.com/toanysd/ipc
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo   [!] Push that bai hoac bi huy. Vui long kiem tra lai dang nhap!
    echo ===================================================
)

echo.
pause
