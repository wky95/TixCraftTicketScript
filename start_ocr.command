#!/bin/bash

# 1. 切換到腳本所在目錄 (確保讀得到 main.py)
cd "$(dirname "$0")"

echo "=========================================="
echo "     📦 正在檢查依賴環境 (Dependencies)..."
echo "=========================================="

# 🔥 修改重點：每次都檢查完整清單
# pip 會自動跳過已安裝的套件，速度很快且最安全
pip3 install -r requirements.txt

# 檢查上一行指令是否成功 (Exit Code 0)
if [ $? -ne 0 ]; then
    echo "❌ 安裝套件失敗！請檢查網路或 Python 設定。"
    read -p "請按 Enter 鍵離開..."
    exit 1
fi

echo ""
echo "=========================================="
echo "     🚀 正在啟動 Python OCR 伺服器..."
echo "     ⚠️  請勿關閉此視窗！(關閉=停止服務)"
echo "=========================================="
echo ""

# 啟動伺服器
python3 main.py

echo ""
echo "伺服器已停止。"
read -p "請按 Enter 鍵離開..."