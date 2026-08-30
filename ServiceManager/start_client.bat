@echo off
title Service Manager - May Khach (Client)
cd /d "%~dp0"

echo ===================================================
echo   Service Manager - Khoi dong May Khach (Client)
echo ===================================================
echo.
echo Client dang chay ngam trong he thong...

:run
call npx electron . --role=client
echo.
echo ===================================================
echo [CANH BAO] Client da dung lai.
echo Nhan phim bat ky de KHOI DONG LAI hoac Ctrl+C de thoat...
echo ===================================================
pause
goto run
