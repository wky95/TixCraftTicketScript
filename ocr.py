# 依賴庫安裝：pip install fastapi uvicorn ddddocr "Pillow>=9.1.0"

import uvicorn
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
import ddddocr
import base64
import binascii  # 處理 Base64 錯誤需要導入
from PIL import Image # 處理圖片需要導入

# --- Pillow 兼容性修正 ---
# 解決 ddddocr 舊程式碼與新版 Pillow (>=9.1.0) 不兼容的問題
try:
    # 嘗試訪問 Image.ANTIALIAS，如果不存在 (新版本) 則跳轉到 except
    Image.ANTIALIAS 
except AttributeError:
    # 如果舊名稱不存在，則將它定義為新常數 Image.Resampling.LANCZOS
    Image.ANTIALIAS = Image.Resampling.LANCZOS 
    print("Pillow 兼容性修正已應用。")

# --- 伺服器初始化 ---
app = FastAPI()

# 允許跨域請求 (讓 Tampermonkey 腳本可以訪問)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化 ddddocr
# *** 修正點：移除 show_ad=False 參數 ***
try:
    ocr = ddddocr.DdddOcr() 
    print("ddddocr 模型加載成功。")
except Exception as e:
    print(f"ddddocr 模型加載失敗: {e}")
    ocr = None 


@app.post("/ocr")
async def read_captcha(data: dict = Body(...)):
    """
    接收 Base64 編碼的圖片並返回識別結果。
    """
    if ocr is None:
        return {"error": "OCR 引擎未初始化或加載失敗。"}
        
    try:
        # 1. 獲取 Base64 字串
        img_base64 = data.get("image", "")
        
        # 2. 清理字串：移除 URL 前綴（如果存在）
        if "base64," in img_base64:
            img_base64 = img_base64.split("base64,")[1]
            
        # 3. 處理填充 (Padding Fix) 
        # 這是解決 binascii.Error: Incorrect padding 的關鍵修正
        missing_padding = len(img_base64) % 4
        if missing_padding != 0:
            img_base64 += '=' * (4 - missing_padding)

        # 4. 嘗試解碼
        img_bytes = base64.b64decode(img_base64)
        
        # 5. 識別
        res = ocr.classification(img_bytes)
        
        print(f"✅ 識別成功，結果: {res}")
        return {"result": res}
        
    except binascii.Error as e:
        print(f"❌ Base64 解碼失敗: {e}。請檢查前端傳輸數據是否完整。")
        return {"error": "Base64 解碼失敗，請檢查傳輸數據。"}
    except Exception as e:
        print(f"❌ 處理請求時發生其他錯誤: {e}")
        return {"error": f"OCR 處理失敗: {e}"}

if __name__ == '__main__':
    # 運行在 0.0.0.0 可以確保所有網絡接口都能訪問
    uvicorn.run(app, host="0.0.0.0", port=8000)