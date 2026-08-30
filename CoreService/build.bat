@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
::  BUILD - NETWORK DEVICE MANAGER
::  Build Next.js standalone → dong goi thanh 2 bo cai:
::    - Lite: may camera (server + mo port tu dong)
::    - Full: may quan ly (server + lua chon mo port)
:: ============================================================

title Building NetworkDeviceManager...

set "PROJECT_DIR=%~dp0.."
set "DIST_DIR=%PROJECT_DIR%\dist"
set "LITE_DIR=%DIST_DIR%\NetworkDeviceManager-Lite"
set "FULL_DIR=%DIST_DIR%\NetworkDeviceManager-Full"
set "LITE_TPL=%~dp0lite"
set "FULL_TPL=%~dp0full"
set "SHARED_TPL=%~dp0full"

echo.
echo  ==================================================
echo   BUILD - NETWORK DEVICE MANAGER
echo   Tao 2 bo cai: Lite + Full
echo  ==================================================
echo.

REM === Check Node.js ===
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js khong tim thay!
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"

REM === Step 1: Dependencies ===
echo  [1/5] Kiem tra dependencies...
if not exist "node_modules" (
    echo        Cai dat npm packages...
    call npm install
) else (
    echo        Da co, bo qua.
)

REM === Step 2: Build Next.js standalone ===
echo  [2/5] Build Next.js (standalone)...
call npx next build --webpack
if errorlevel 1 (
    echo  [ERROR] Build that bai!
    pause
    exit /b 1
)

if not exist ".next\standalone" (
    echo  [ERROR] Standalone output khong tim thay!
    pause
    exit /b 1
)
echo        Build thanh cong.

REM === Step 3: Create Lite package ===
echo  [3/5] Dong goi Lite (may camera)...
if exist "%LITE_DIR%" rmdir /s /q "%LITE_DIR%"
mkdir "%LITE_DIR%"

xcopy /E /I /Q /Y ".next\standalone\*" "%LITE_DIR%" >nul 2>&1
if exist ".next\static" xcopy /E /I /Q /Y ".next\static" "%LITE_DIR%\.next\static" >nul 2>&1
if exist "public" xcopy /E /I /Q /Y "public" "%LITE_DIR%\public" >nul 2>&1

copy /y "%LITE_TPL%\install.bat" "%LITE_DIR%\install.bat" >nul 2>&1
copy /y "%LITE_TPL%\uninstall.bat" "%LITE_DIR%\uninstall.bat" >nul 2>&1
copy /y "%LITE_TPL%\README.txt" "%LITE_DIR%\README.txt" >nul 2>&1
copy /y "%SHARED_TPL%\ndmsvc.cmd" "%LITE_DIR%\ndmsvc.cmd" >nul 2>&1
copy /y "%SHARED_TPL%\ndmsvc.vbs" "%LITE_DIR%\ndmsvc.vbs" >nul 2>&1
copy /y "%SHARED_TPL%\open_emitter.bat" "%LITE_DIR%\open_emitter.bat" >nul 2>&1

REM Bundle ServiceManager.exe
for /f "tokens=*" %%n in ('where node.exe 2^>nul') do (
    if exist "%%n" (
        copy /y "%%n" "%LITE_DIR%\ServiceManager.exe" >nul 2>&1
        echo        ServiceManager.exe bundled
    )
)

for /f %%s in ('powershell -Command "[math]::Round((Get-ChildItem '%LITE_DIR%' -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)" 2^>nul') do set "LITE_SIZE=%%s"
echo        Lite: ~!LITE_SIZE! MB

REM === Step 4: Create Full package ===
echo  [4/5] Dong goi Full (may quan ly)...
if exist "%FULL_DIR%" rmdir /s /q "%FULL_DIR%"
mkdir "%FULL_DIR%"

xcopy /E /I /Q /Y ".next\standalone\*" "%FULL_DIR%" >nul 2>&1
if exist ".next\static" xcopy /E /I /Q /Y ".next\static" "%FULL_DIR%\.next\static" >nul 2>&1
if exist "public" xcopy /E /I /Q /Y "public" "%FULL_DIR%\public" >nul 2>&1

copy /y "%FULL_TPL%\install.bat" "%FULL_DIR%\install.bat" >nul 2>&1
copy /y "%FULL_TPL%\uninstall.bat" "%FULL_DIR%\uninstall.bat" >nul 2>&1
copy /y "%FULL_TPL%\README.txt" "%FULL_DIR%\README.txt" >nul 2>&1
copy /y "%FULL_TPL%\ndmsvc.cmd" "%FULL_DIR%\ndmsvc.cmd" >nul 2>&1
copy /y "%FULL_TPL%\ndmsvc.vbs" "%FULL_DIR%\ndmsvc.vbs" >nul 2>&1
copy /y "%FULL_TPL%\manager.bat" "%FULL_DIR%\manager.bat" >nul 2>&1
copy /y "%FULL_TPL%\open_dashboard.bat" "%FULL_DIR%\open_dashboard.bat" >nul 2>&1
copy /y "%FULL_TPL%\open_emitter.bat" "%FULL_DIR%\open_emitter.bat" >nul 2>&1

REM Bundle ServiceManager.exe
for /f "tokens=*" %%n in ('where node.exe 2^>nul') do (
    if exist "%%n" (
        copy /y "%%n" "%FULL_DIR%\ServiceManager.exe" >nul 2>&1
        echo        ServiceManager.exe bundled
    )
)

for /f %%s in ('powershell -Command "[math]::Round((Get-ChildItem '%FULL_DIR%' -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)" 2^>nul') do set "FULL_SIZE=%%s"
echo        Full: ~!FULL_SIZE! MB

REM === Step 5: Create AntiTheft-Client package ===
echo  [5/6] Dong goi AntiTheft-Client (giam sat chong trom)...
set "CLIENT_DIR=%DIST_DIR%\AntiTheft-Client"
if not exist "%CLIENT_DIR%" mkdir "%CLIENT_DIR%"
copy /y "%PROJECT_DIR%\CoreService\client\antitheft-client.js" "%CLIENT_DIR%\antitheft-client.js" >nul 2>&1
copy /y "%PROJECT_DIR%\CoreService\client\client.html" "%CLIENT_DIR%\client.html" >nul 2>&1
copy /y "%PROJECT_DIR%\CoreService\client\install.bat" "%CLIENT_DIR%\install.bat" >nul 2>&1
copy /y "%PROJECT_DIR%\CoreService\client\uninstall.bat" "%CLIENT_DIR%\uninstall.bat" >nul 2>&1
copy /y "%PROJECT_DIR%\CoreService\client\config.json" "%CLIENT_DIR%\config.json" >nul 2>&1

REM Bundle ServiceManager.exe for client
if exist "%LITE_DIR%\ServiceManager.exe" (
    copy /y "%LITE_DIR%\ServiceManager.exe" "%CLIENT_DIR%\ServiceManager.exe" >nul 2>&1
) else (
    for /f "tokens=*" %%n in ('where node.exe 2^>nul') do copy /y "%%n" "%CLIENT_DIR%\ServiceManager.exe" >nul 2>&1
)
for /f %%s in ('powershell -Command "[math]::Round((Get-ChildItem '%CLIENT_DIR%' -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)" 2^>nul') do set "CLIENT_SIZE=%%s"
echo        Client: ~!CLIENT_SIZE! MB

REM === Step 6: Cleanup ===
echo  [6/6] Hoan tat dong goi.

echo.
echo  ==================================================
echo   BUILD THANH CONG!
echo  ==================================================
echo.
echo   1. ANTI-THEFT CLIENT (may laptop/khach can giam sat):
echo      %CLIENT_DIR%
echo      Size: ~!CLIENT_SIZE! MB
echo      → Copy sang laptop, chay install.bat (Admin)
echo.
echo   2. LITE (may co camera - server noi bo):
echo      %LITE_DIR%
echo      Size: ~!LITE_SIZE! MB
echo      → Copy sang may camera, chay install.bat (Admin)
echo.
echo   3. FULL (may quan ly IPC - day du giao dien):
echo      %FULL_DIR%
echo      Size: ~!FULL_SIZE! MB
echo      → Copy sang may chu quan ly, chay install.bat (Admin)
echo.
pause
exit /b 0
