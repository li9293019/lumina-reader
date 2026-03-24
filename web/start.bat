@echo off
chcp 65001 >nul

echo Starting Lumina Reader Server...

cd /d "%~dp0"

if not exist "data" mkdir data

echo Starting data service...
start /b python server.py >nul 2>&1

timeout /t 2 /nobreak >nul

echo Opening browser...
start http://localhost:8080/index.html

echo.
echo ========================================
echo   Lumina Reader Started
echo   Address: http://localhost:8080
echo   Data: %~dp0data\
echo ========================================
echo.
echo Press any key to stop server...
pause >nul

taskkill /f /im python.exe >nul 2>&1
echo Server stopped
