@echo off
chcp 65001 >nul
title Build Legal Content
echo ===========================================
echo   Build Legal Content JS Module
echo ===========================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.x
    echo Download: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo [INFO] Building legal content JS module...
echo.
python build_legal_js.py

echo.
echo [INFO] Done! The JS module has been generated at:
echo   ..\js\modules\legal-content.js
echo.
pause
