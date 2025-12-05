# TixCraftTicketScript
## A Greasemonkey script and local server API


1. 確定瀏覽器是 Chrome/Brave

2. 安裝 [篡改猴](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)，然後把新增腳本把 script.js 貼上。

3. 運行 python server

如果是 Mac，則雙擊 start_ocr.command，第一次使用的情況下要先在終端機輸入 
```
chmod +x start_ocr.command
```
如果是 Windows，則雙擊 start_ocr.bat

4. 確保搶票的過程中，視窗沒有關閉

---

#### 功能

1. 選擇票數 1~4 張

2. 選票策略

- 最貴優先：在目前還有剩餘座位中，價格最高的裡面選擇最容易搶到的區域
- 價格區間：在某個區間內選擇最容易搶到的區域

3. 確認延遲

這個在練習時可以設成 3 秒，在跳轉到確認業面前，會先讓你檢查你的策略選到的座位是否一致

正式搶票時要設成 0 秒

4. 無票刷新等待

沒有票時，刷新網頁的頻率，在這裡建議設成 5 秒

5. 送出延遲


---

### 從這裡之後對搶票沒有幫助

如果想把 python server 寫到 daemon，在 Mac 上可以

放到背景執行
```sh
nohup python3 ocr.py > ocr.log 2>&1 &
```

---

檢查 process
```sh
ps aux | grep ocr.py
```

---

殺掉 process
```sh
pkill -f ocr.py
```

---
 
launchctl：開始服務
```sh
launchctl load ~/Library/LaunchAgents/com.user.ocrserver.plist
```
launchctl：取消服務
```sh
launchctl unload ~/Library/LaunchAgents/com.user.ocrserver.plist
```

新增檔案 ~/Library/LaunchAgents/com.user.ocrserver.plist
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.ocrserver</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string> <string>/Users/你的使用者名稱/path/to/main.py</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/ocr_server.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ocr_server.err</string>
</dict>
</plist>
```
