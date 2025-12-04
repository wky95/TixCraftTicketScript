// ==UserScript==
// @name         拓元搶票全自動合體版 (Config版: 智能選區+延遲確認)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  整合自動刷新、智能選區(價錢+數量-身障)、OCR 驗證碼填入及自動送出。含參數配置區。
// @author       Combined by Gemini
// @match        https://tixcraft.com/ticket/*
// @connect      127.0.0.1
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================
    // ⚙️ 參數設定區 (CONFIG) - 請在此調整數值
    // =========================================================
    const CONFIG = {
        // Python Server 地址
        API_URL: "http://127.0.0.1:8000/ocr",

        // [區域選擇頁] 找到票後，要「Sleep」多久才點擊？ (毫秒)
        // 建議: 測試時設 3000 (3秒) 以便肉眼確認；正式搶票時設 0 (極速) 或 100 (安全)
        AREA_CONFIRM_DELAY: 0,

        // [區域選擇頁] 沒票時的刷新頻率 (毫秒)
        REFRESH_RATE: 200,

        // [購票頁] OCR 填寫完畢後，要「Sleep」多久才點擊送出？ (毫秒)
        // 建議: 至少保留 50~100ms 確保 DOM 事件觸發完成
        SUBMIT_DELAY: 100
    };

    const currentUrl = window.location.href;

    // =========================================================
    // 1. 全域通用功能
    // =========================================================
    function runCommonHelpers() {
        // 隱藏售完
        const keyword = "已售完";
        document.querySelectorAll("li").forEach(li => {
            if (li.textContent.includes(keyword)) {
                li.style.display = "none";
            }
        });
        // 勾選 checkbox
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
        });
    }

    // =========================================================
    // 2. 區域選擇頁面邏輯
    // =========================================================
    if (currentUrl.includes('/ticket/area/')) {
        console.log(`📍 區域選擇頁面監控中... (確認延遲: ${CONFIG.AREA_CONFIRM_DELAY}ms)`);
        runCommonHelpers();

        const TARGET_CONTAINER_SELECTOR = 'li.select_form_b';

        // 解析價格
        function getPrice(element) {
            const text = element.innerText || element.textContent;
            const numbers = text.match(/\d+/g);
            if (!numbers) return 0;
            const prices = numbers.map(n => parseInt(n)).filter(n => n > 400);
            return prices.length > 0 ? Math.max(...prices) : 0;
        }

        // 解析剩餘座位
        function getRemainingSeats(element) {
            const fontNode = element.querySelector('font[color="#FF0000"], font[color="red"]');
            if (fontNode) {
                const match = fontNode.textContent.match(/剩餘\s*(\d+)/);
                if (match) return parseInt(match[1], 10);
            }
            const text = element.innerText || element.textContent;
            const textMatch = text.match(/剩餘\s*(\d+)/);
            if (textMatch) return parseInt(textMatch[1], 10);
            return 0;
        }

        function makeDecision() {
            const allContainers = Array.from(document.querySelectorAll(TARGET_CONTAINER_SELECTOR));

            // 排除身障與隱藏區塊
            const availableContainers = allContainers.filter(li => {
                const text = li.innerText || li.textContent;
                const isVisible = li.style.display !== 'none';
                const isNotDisabledSeat = !text.includes("身障");
                return isVisible && isNotDisabledSeat;
            });

            if (availableContainers.length > 0) {
                // 1. 最高價篩選
                let maxPrice = 0;
                availableContainers.forEach(li => {
                    const p = getPrice(li);
                    if (p > maxPrice) maxPrice = p;
                });
                const expensiveCandidates = availableContainers.filter(li => getPrice(li) === maxPrice);

                // 2. 剩餘張數篩選
                let maxSeats = -1;
                expensiveCandidates.forEach(li => {
                    const s = getRemainingSeats(li);
                    if (s > maxSeats) maxSeats = s;
                });
                const bestCandidates = expensiveCandidates.filter(li => getRemainingSeats(li) === maxSeats);

                // 3. 隨機選一個
                const finalChoice = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
                const targetLink = finalChoice.querySelector('a');

                if (targetLink) {
                    // 🔥 [Sleep 邏輯] 這裡使用了 CONFIG.AREA_CONFIRM_DELAY
                    console.log(`✅ [鎖定成功] 價格:$${maxPrice} / 剩餘:${maxSeats} / 延遲:${CONFIG.AREA_CONFIRM_DELAY}ms`);

                    // 視覺提示
                    targetLink.style.backgroundColor = "#ffeb3b"; // 黃底
                    targetLink.style.border = "5px solid #f44336"; // 紅框
                    targetLink.style.color = "#000";
                    targetLink.style.fontWeight = "bold";

                    if (CONFIG.AREA_CONFIRM_DELAY > 0) {
                         targetLink.innerText += ` (⏳ ${CONFIG.AREA_CONFIRM_DELAY/1000}秒後點擊...)`;
                    }

                    // ⏰ 執行 Sleep (延遲點擊)
                    setTimeout(() => {
                        console.log("🚀 時間到，執行 Click！");
                        targetLink.click();
                    }, CONFIG.AREA_CONFIRM_DELAY);

                } else {
                    console.warn("⚠️ 異常：選中區塊無連結，刷新重試...");
                    setTimeout(() => window.location.reload(), CONFIG.REFRESH_RATE);
                }

            } else {
                console.log(`❌ 無票 (或只剩身障區)，${CONFIG.REFRESH_RATE}ms 後刷新...`);
                setTimeout(() => window.location.reload(), CONFIG.REFRESH_RATE);
            }
        }

        makeDecision();
    }

    // =========================================================
    // 3. 購票/驗證碼頁面邏輯
    // =========================================================
    if (currentUrl.includes('/ticket/ticket/')) {
        console.log("📍 購票頁面邏輯啟動...");

        runCommonHelpers();
        document.querySelectorAll("select").forEach(sel => {
            if (sel.value === "0" || sel.value === "") {
                sel.value = 1;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        const SELECTOR_PAIRS = [
            { img: "#TicketForm_verifyCode-image", input: "#TicketForm_verifyCode", name: "拓元模式" }
        ];

        let isOcrRunning = false;

        function clickSubmitButton() {
            const submitBtn = document.querySelector('button.btn.btn-primary.btn-green');
            if (submitBtn) {
                console.log(`🚀 [AutoSubmit] 執行送出 (延遲 ${CONFIG.SUBMIT_DELAY}ms)...`);
                submitBtn.click();
            } else {
                console.warn("⚠️ 找不到送出按鈕！");
            }
        }

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
                    url: CONFIG.API_URL,
                    headers: { "Content-Type": "application/json" },
                    data: JSON.stringify({ image: base64Image }),
                    onload: function(response) {
                        isOcrRunning = false;
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            const code = data.result;
                            console.log(`[${mode}] ✅ 識別結果: ${code}`);

                            input.value = code;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));

                            // 🔥 [Sleep 邏輯] 這裡使用了 CONFIG.SUBMIT_DELAY
                            setTimeout(clickSubmitButton, CONFIG.SUBMIT_DELAY);

                        } else {
                            console.error(`[${mode}] ❌ Server Error:`, response.responseText);
                        }
                    },
                    onerror: function(err) {
                        isOcrRunning = false;
                        console.error(`[${mode}] ❌ 連線錯誤:`, err);
                    }
                });
            }, 100);
        }

        function checkAndSolve() {
            if (isOcrRunning) return;
            for (const pair of SELECTOR_PAIRS) {
                const img = document.querySelector(pair.img);
                const input = document.querySelector(pair.input);
                if (img && input) {
                    if (input.value && input.value.length >= 4) return;
                    if (img.complete && img.naturalWidth > 0) {
                        solveCaptcha(img, input, pair.name);
                        if (!img.hasAttribute('data-ocr-attached')) {
                            img.setAttribute('data-ocr-attached', 'true');
                            img.addEventListener('click', () => {
                                isOcrRunning = false;
                                input.value = "";
                                setTimeout(() => checkAndSolve(), 500);
                            });
                        }
                    } else {
                        img.onload = () => checkAndSolve();
                    }
                    break;
                }
            }
        }

        const observer = new MutationObserver(() => checkAndSolve());
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        checkAndSolve();
    }

})();