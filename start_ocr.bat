@echo off
title TICKET OCR SERVER
cd /d "%~dp0"
 
echo Checking and installing dependencies...
pip install -r requirements.txt >nul 2>&1

echo ==========================================
echo      Starting Python OCR Server...
echo      DO NOT close this window!
echo ==========================================
echo.
 
python ocr.py
 
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server unexpectedly stopped.
    pause
)