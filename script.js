// ==UserScript==
// @name         拓元搶票全自動合體版 (OCR+刷新+選區+自動送出)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  整合自動刷新、選區、隱藏售完、勾選同意、OCR 驗證碼填入及自動送出。
// @author       Combined by Gemini (Original: ChatGPT/You)
// @match        https://tixcraft.com/ticket/*
// @connect      127.0.0.1
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const currentUrl = window.location.href;
    const API_URL = "http://127.0.0.1:8000/ocr"; // Python Server 地址

    // =========================================================
    // 1. 全域通用功能 (隱藏售完、勾選 Checkbox)
    // =========================================================
    function runCommonHelpers() {
        // 隱藏含有 "已售完" 的 li 區塊
        const keyword = "已售完";
        document.querySelectorAll("li").forEach(li => {
            if (li.textContent.includes(keyword)) {
                li.style.display = "none";
            }
        });

        // 自動勾選所有 checkbox (通常是同意條款)
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
        });
    }

    // =========================================================
    // 2. 區域選擇頁面邏輯 (/ticket/area/...)
    //    包含: 自動刷新、點擊 select_form_b
    // =========================================================
    if (currentUrl.includes('/ticket/area/')) {
        console.log("📍 偵測到區域選擇頁面，啟動監控與刷新邏輯...");

        // 執行通用清理
        runCommonHelpers();

        const TARGET_CONTAINER_SELECTOR = 'li.select_form_b';
        const REFRESH_INTERVAL_MS = 4000; // 沒票時的刷新頻率

        // 嘗試尋找並點擊
        const targetContainers = document.querySelectorAll(TARGET_CONTAINER_SELECTOR);

        if (targetContainers.length > 0) {
            // 找到有票區域 (select_form_b)
            const containerToClick = targetContainers[0];
            const targetLink = containerToClick.querySelector('a');

            if (targetLink) {
                console.log(`✅ [AutoClick] 發現可售區域，點擊進入！`);
                targetLink.click();
            } else {
                // 有區塊但沒連結? 異常情況，刷新
                setTimeout(() => window.location.reload(), REFRESH_INTERVAL_MS);
            }
        } else {
            // 沒找到有票區域
            console.log(`❌ [AutoClick] 無票，${REFRESH_INTERVAL_MS/1000} 秒後刷新...`);
            setTimeout(() => window.location.reload(), REFRESH_INTERVAL_MS);
        }
    }

    // =========================================================
    // 3. 購票/驗證碼頁面邏輯 (/ticket/ticket/...)
    //    包含: 票數設為1、OCR 識別、識別後自動送出
    // =========================================================
    if (currentUrl.includes('/ticket/ticket/')) {
        console.log("📍 偵測到購票頁面，啟動 OCR 與表單填寫邏輯...");

        // --- A. 基礎表單處理 ---
        runCommonHelpers(); // 勾選同意條款
        // 將所有下拉選單 (票數) 預設選為 1
        document.querySelectorAll("select").forEach(sel => {
            if (sel.value === "0" || sel.value === "") {
                sel.value = 1;
                // 觸發 change 事件以防網頁有監聽
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        // --- B. OCR 與 自動送出邏輯 ---
        const SELECTOR_PAIRS = [
            // { img: "#captcha-image", input: "#captcha-input", name: "通用模式" },
            { img: "#TicketForm_verifyCode-image", input: "#TicketForm_verifyCode", name: "拓元模式" }
        ];

        let isOcrRunning = false;

        // 定義：點擊送出按鈕 (整合自原本的 submit 腳本)
        function clickSubmitButton() {
            const submitBtn = document.querySelector('button.btn.btn-primary.btn-green');
            if (submitBtn) {
                console.log("🚀 [AutoSubmit] 驗證碼已填入，執行自動送出！");
                submitBtn.click();
            } else {
                console.warn("⚠️ [AutoSubmit] 找不到送出按鈕！");
            }
        }

        // 定義：OCR 核心
        function solveCaptcha(img, input, mode) {
            if (isOcrRunning) return;
            isOcrRunning = true;

            console.log(`[${mode}] 處理驗證碼...`);

            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext("2d");

            setTimeout(() => {
                ctx.drawImage(img, 0, 0);
                const base64Data = canvas.toDataURL("image/png");
                const base64Image = base64Data.split(',')[1];

                GM_xmlhttpRequest({
                    method: "POST",
                    url: API_URL,
                    headers: { "Content-Type": "application/json" },
                    data: JSON.stringify({ image: base64Image }),
                    onload: function(response) {
                        isOcrRunning = false;
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            const code = data.result;
                            console.log(`[${mode}] ✅ 識別結果: ${code}`);

                            // 填入驗證碼
                            input.value = code;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));

                            // *** 關鍵整合：識別成功後立即點擊送出 ***
                            setTimeout(clickSubmitButton, 100); // 微幅延遲確保填入生效

                        } else {
                            console.error(`[${mode}] ❌ 伺服器錯誤:`, response.responseText);
                        }
                    },
                    onerror: function(err) {
                        isOcrRunning = false;
                        console.error(`[${mode}] ❌ 連線錯誤 (請檢查 Python Server):`, err);
                    }
                });
            }, 100);
        }

        // 定義：檢查頁面元素
        function checkAndSolve() {
            if (isOcrRunning) return;

            // 如果已經填寫過且不為空，就不重複識別，避免無限迴圈
            // (除非使用者手動清空)
            for (const pair of SELECTOR_PAIRS) {
                const img = document.querySelector(pair.img);
                const input = document.querySelector(pair.input);

                if (img && input) {
                    // 如果輸入框已經有 4 個字以上，假設已處理，跳過
                    if (input.value && input.value.length >= 4) return;

                    if (img.complete && img.naturalWidth > 0) {
                        solveCaptcha(img, input, pair.name);

                        // 綁定點擊刷新重新識別
                        if (!img.hasAttribute('data-ocr-attached')) {
                            img.setAttribute('data-ocr-attached', 'true');
                            img.addEventListener('click', () => {
                                isOcrRunning = false;
                                input.value = ""; // 清空輸入框
                                setTimeout(() => checkAndSolve(), 500);
                            });
                        }
                    } else {
                        img.onload = () => checkAndSolve();
                    }
                    break; // 找到一組就停止
                }
            }
        }

        // 啟動 MutationObserver 監聽 DOM 變化
        const observer = new MutationObserver(() => {
            checkAndSolve();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });

        // 首次執行
        checkAndSolve();
    }

})();