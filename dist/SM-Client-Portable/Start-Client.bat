@echo off
cd /d "%~dp0"
if not exist "node_modules\" (
    echo [Service Manager] Dang cai dat lan dau, vui long doi...
    call npm install --production >nul 2>&1
)
:: Launch silently via VBS (no visible CMD window)
if not exist "%~dp0_sm_silent.vbs" (
    echo Set WshShell = CreateObject^("WScript.Shell"^) > "%~dp0_sm_silent.vbs"
    echo WshShell.Run "cmd /c cd /d ""%~dp0"" && npx electron . --role=client --client", 0, False >> "%~dp0_sm_silent.vbs"
)
wscript.exe "%~dp0_sm_silent.vbs"
