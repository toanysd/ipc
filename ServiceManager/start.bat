@echo off
title Service Manager - May Chu Quan Ly
cd /d "%~dp0"

echo ===================================================
echo   Service Manager - Khoi dong May Chu Quan Ly
echo ===================================================
echo.
echo Dashboard URL: http://localhost:3456
echo.
start "" http://localhost:3456

:run
echo [LOG] Dang khoi dong Web Server tai cong 3456...
call npx electron . --role=manager
echo.
echo ===================================================
echo [CANH BAO] Tien trinh may chu da dung lai.
echo Nhan phim bat ky de KHOI DONG LAI hoac Ctrl+C de thoat...
echo ===================================================
pause
goto run
