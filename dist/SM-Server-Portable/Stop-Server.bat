@echo off
echo Stopping Service Manager Server...
taskkill /F /IM electron.exe /T
taskkill /F /IM go2rtc.exe /T
echo Done.
pause
