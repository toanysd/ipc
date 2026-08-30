@echo off
echo Stopping Client processes...
taskkill /F /IM electron.exe /T 2>nul
taskkill /F /IM go2rtc.exe /T 2>nul
echo Done.
