// ==UserScript==
// @name         拓元搶票全自動合體版 (終極配置版+3秒刷新緩衝)
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  整合自動刷新、智能選區(最貴+最多位+非身障+保底)、OCR 驗證碼填入及自動送出。含沒票時的 3秒緩衝。
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

        // [區域選擇頁] 鎖定區域後，要「Sleep」多久才點擊？ (毫秒)
        // 建議: 測試時設 3000 (3秒) 以便肉眼確認；正式搶票時請改回 0 (極速)
        AREA_CONFIRM_DELAY: 0,

        // [區域選擇頁] 🔥 當「完全找不到票」時，要等待多久才刷新？ (毫秒)
        // 這是您指定的功能：找不到符合的 -> 等 3 秒 -> 刷新
        NO_TICKET_WAIT_TIME: 3000,

        // [購票頁] OCR 填寫完畢後，要「Sleep」多久才點擊送出？ (毫秒)
        // 建議: 至少保留 50~100ms
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
    // 2. 區域選擇頁面邏輯 (/ticket/area/...)
    // =========================================================
    if (currentUrl.includes('/ticket/area/')) {
        console.log(`📍 區域選擇頁面監控中...`);
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

        // 核心決策邏輯
        function makeDecision() {
            const allContainers = Array.from(document.querySelectorAll(TARGET_CONTAINER_SELECTOR));

            // 1. 基礎名單：顯示中 (沒賣完)
            let validContainers = allContainers.filter(li => li.style.display !== 'none');

            // 2. 優先名單：排除「身障」關鍵字
            let safeContainers = validContainers.filter(li => {
                const text = li.innerText || li.textContent;
                return !text.includes("身障");
            });

            // 如果排除身障後沒東西了，但還有valid(身障票)，為了保底，勉強用 valid
            let candidates = safeContainers.length > 0 ? safeContainers : validContainers;

            if (candidates.length > 0) {
                // --- 有票可選，進入智能篩選 ---
                let finalTargets = [];

                try {
                    // A. 找出最高價格
                    let maxPrice = 0;
                    candidates.forEach(li => {
                        const p = getPrice(li);
                        if (p > maxPrice) maxPrice = p;
                    });

                    // 篩選高價區
                    const expensiveList = candidates.filter(li => getPrice(li) === maxPrice);

                    // B. 找出剩餘最多
                    let maxSeats = -1;
                    expensiveList.forEach(li => {
                        const s = getRemainingSeats(li);
                        if (s > maxSeats) maxSeats = s;
                    });

                    // 篩選最多位區
                    finalTargets = expensiveList.filter(li => getRemainingSeats(li) === maxSeats);

                    console.log(`📊 [智能篩選] 價錢$${maxPrice} / 剩餘${maxSeats} / 符合:${finalTargets.length}個`);

                } catch (e) {
                    console.error("⚠️ 智能篩選錯誤，切換至保底模式", e);
                    finalTargets = [];
                }

                // 保底機制：如果篩選失敗，隨機選一個可用的
                if (finalTargets.length === 0) {
                    console.warn("⚠️ 啟用保底機制：隨機選擇任一可售區域！");
                    finalTargets = candidates;
                }

                // 最終執行
                const finalChoice = finalTargets[Math.floor(Math.random() * finalTargets.length)];
                const targetLink = finalChoice.querySelector('a');

                if (targetLink) {
                    const p = getPrice(finalChoice);
                    const s = getRemainingSeats(finalChoice);

                    console.log(`✅ [鎖定目標] 價格:$${p} / 剩餘:${s} / 延遲:${CONFIG.AREA_CONFIRM_DELAY}ms`);

                    // 視覺提示
                    targetLink.style.backgroundColor = "#ffeb3b";
                    targetLink.style.border = "5px solid #f44336";
                    targetLink.style.color = "#000";
                    targetLink.style.fontWeight = "bold";

                    if (CONFIG.AREA_CONFIRM_DELAY > 0) {
                         targetLink.innerText += ` (⏳ ${CONFIG.AREA_CONFIRM_DELAY/1000}s...)`;
                    }

                    setTimeout(() => {
                        console.log("🚀 時間到，執行 Click！");
                        targetLink.click();
                    }, CONFIG.AREA_CONFIRM_DELAY);

                } else {
                    // 有區塊但無連結 (極罕見)，快速刷新
                    setTimeout(() => window.location.reload(), 200);
                }

            } else {
                // 🔥 [修改重點] 完全找不到符合的票 -> 等待 3 秒 -> 刷新
                console.log(`❌ 完全無票 (或只剩身障區已排除)，將在 ${CONFIG.NO_TICKET_WAIT_TIME/1000} 秒後刷新...`);

                // 可以在網頁標題或 console 倒數提示
                let timeLeft = CONFIG.NO_TICKET_WAIT_TIME / 1000;
                const timer = setInterval(() => {
                    timeLeft--;
                    console.log(`... ${timeLeft} 秒後刷新`);
                    if (timeLeft <= 0) clearInterval(timer);
                }, 1000);

                setTimeout(() => window.location.reload(), CONFIG.NO_TICKET_WAIT_TIME);
            }
        }

        makeDecision();
    }

    // =========================================================
    // 3. 購票/驗證碼頁面邏輯 (/ticket/ticket/...)
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