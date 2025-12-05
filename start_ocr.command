#!/bin/bash
cd "$(dirname "$0")"

# 檢查是否已安裝套件 (簡單檢查)
if ! pip3 show ddddocr > /dev/null; then
    echo "⚠️  尚未安裝依賴套件，正在為您安裝..."
    pip3 install -r requirements.txt
fi

echo "=========================================="
echo "     🚀 正在啟動 Python OCR 伺服器..."
echo "     ⚠️  請勿關閉此視窗！(關閉=停止服務)"
echo "=========================================="
echo ""

python3 ocr.py

echo ""
echo "伺服器已停止。"
read -p "請按 Enter 鍵離開..."