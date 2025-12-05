# TixCraftTicketScript
A Greasemonkey script and local server API


用 Chrome/Brave，首先先安裝 [篡改猴](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)，然後把新增腳本把 script.js 貼上。

如果是 Mac，則雙擊 start_ocr.command，第一次使用的情況下要先在終端機輸入 
```
chmod +x start_ocr.command
```
如果是 Windos，則雙擊 start_ocr.bat

確保搶票的過程中，視窗沒有關閉

---

如果想把 python server 寫到 daemon
```sh
nohup python3 ocr.py > ocr.log 2>&1 &
```

```sh
ps aux | grep ocr.py
```

放到背景執行
```sh
launchctl load ~/Library/LaunchAgents/com.user.ocrserver.plist
```
取消
```sh
launchctl unload ~/Library/LaunchAgents/com.user.ocrserver.plist
```

~/Library/LaunchAgents/com.user.ocrserver.plist
```
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
