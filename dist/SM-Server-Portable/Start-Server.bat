@echo off
echo Starting Service Manager Server...
cd /d "%~dp0"

IF NOT EXIST "node_modules\" (
    echo Installing dependencies...
    call npm install
)

echo Launching Electron app...
call npx electron . --role=manager
pause
