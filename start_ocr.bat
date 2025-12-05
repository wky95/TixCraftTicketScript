@echo off
title 搶票 OCR 伺服器
cd /d "%~dp0"

echo 正在檢查並安裝相依套件...
pip install -r requirements.txt >nul 2>&1

echo ==========================================
echo      🚀 正在啟動 Python OCR 伺服器...
echo      ⚠️  請勿關閉此視窗！
echo ==========================================
echo.

python ocr.py

if %errorlevel% neq 0 (
    echo.
    echo [錯誤] 伺服器意外停止。
    pause
)