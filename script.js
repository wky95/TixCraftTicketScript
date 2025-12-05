// ==UserScript==
// @name         拓元搶票全自動合體版 (v8.4 極速精簡版)
// @namespace    http://tampermonkey.net/
// @version      8.4
// @description  移除教學按鈕，介面更清爽。含：總開關、Script Injection 攔截 Alert、強制選票迴圈、自動 OCR。
// @author       Combined by Gemini
// @match        https://tixcraft.com/*
// @connect      127.0.0.1
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================
    // 🛑 0. 核彈級防禦：直接注入 Script 到頁面頭部 (絕對攔截)
    // =========================================================
    function injectInterceptor() {
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                window.alert = function(msg) { console.log('🚫 [攔截 Alert]', msg); return true; };
                window.confirm = function(msg) { console.log('🚫 [攔截 Confirm]', msg); return true; };
            })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }
    injectInterceptor();

    // =========================================================
    // 🎨 GUI 介面與設定讀取
    // =========================================================

    const DEFAULT_CONFIG = {
        BOT_ENABLED: true,
        API_URL: "http://127.0.0.1:8000/ocr",
        AREA_CONFIRM_DELAY: 3000,
        NO_TICKET_WAIT_TIME: 3000,
        ERROR_RETRY_RATE: 200,
        SUBMIT_DELAY: 100,
        STRATEGY: 'default',
        MIN_PRICE: 0,
        MAX_PRICE: 100000,
        TICKET_QUANTITY: 1
    };

    let CONFIG = {
        BOT_ENABLED: GM_getValue('BOT_ENABLED', DEFAULT_CONFIG.BOT_ENABLED),
        API_URL: GM_getValue('API_URL', DEFAULT_CONFIG.API_URL),
        AREA_CONFIRM_DELAY: GM_getValue('AREA_CONFIRM_DELAY', DEFAULT_CONFIG.AREA_CONFIRM_DELAY),
        NO_TICKET_WAIT_TIME: GM_getValue('NO_TICKET_WAIT_TIME', DEFAULT_CONFIG.NO_TICKET_WAIT_TIME),
        ERROR_RETRY_RATE: GM_getValue('ERROR_RETRY_RATE', DEFAULT_CONFIG.ERROR_RETRY_RATE),
        SUBMIT_DELAY: GM_getValue('SUBMIT_DELAY', DEFAULT_CONFIG.SUBMIT_DELAY),
        STRATEGY: GM_getValue('STRATEGY', DEFAULT_CONFIG.STRATEGY),
        MIN_PRICE: GM_getValue('MIN_PRICE', DEFAULT_CONFIG.MIN_PRICE),
        MAX_PRICE: GM_getValue('MAX_PRICE', DEFAULT_CONFIG.MAX_PRICE),
        TICKET_QUANTITY: GM_getValue('TICKET_QUANTITY', DEFAULT_CONFIG.TICKET_QUANTITY)
    };

    function createGUI() {
        if (document.getElementById('ticket-bot-gui')) return;

        GM_addStyle(`
            #ticket-bot-gui {
                position: fixed; bottom: 20px; right: 20px; width: 260px;
                background: rgba(0, 0, 0, 0.9); color: #0f0; border: 2px solid #0f0;
                border-radius: 8px; padding: 10px; z-index: 999999;
                font-family: "Microsoft JhengHei", monospace; font-size: 12px;
                box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
            }
            #ticket-bot-gui h3 { margin: 0 0 10px 0; text-align: center; border-bottom: 1px solid #0f0; padding-bottom: 5px; cursor: pointer; }
            .bot-row { margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
            .bot-row label { color: #ccc; }
            .bot-row input, .bot-row select { background: #222; color: #fff; border: 1px solid #555; padding: 2px 4px; border-radius: 4px; }
            .bot-row input[type="number"] { width: 60px; text-align: center; }
            .bot-row select { width: 140px; }
            #price-range-box { background: #1a1a1a; border: 1px dashed #555; padding: 5px; margin-bottom: 8px; border-radius: 4px; display: none; }
            #price-range-box.show { display: block; }
            .range-inputs { display: flex; align-items: center; justify-content: space-between; margin-top: 4px;}
            .range-inputs input { width: 45% !important; }

            .bot-btn { width: 100%; border: none; padding: 8px; cursor: pointer; margin-top: 5px; font-weight: bold; border-radius: 4px; transition: 0.2s; color: #fff;}
            .bot-btn.save { background: #006400; }
            .bot-btn.save:hover { background: #008000; }
            .bot-btn.danger { background: #8b0000; }
            .bot-btn.danger:hover { background: #ff0000; }

            /* 總開關樣式 (縮小並置底) */
            #btn-toggle-master {
                margin-top: 10px;
                padding: 5px;
                font-size: 11px;
                border-top: 1px solid #555;
            }
            .status-on { background: #008000; }
            .status-off { background: #555; color: #aaa; }

            #gui-content { display: block; }
            .collapsed #gui-content { display: none; }
            #bot-status { margin-top: 5px; color: #ff0; text-align: center; font-size: 10px; border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 5px;}
        `);

        const div = document.createElement('div');
        div.id = 'ticket-bot-gui';

        const btnClass = CONFIG.BOT_ENABLED ? 'status-on' : 'status-off';
        const btnText = CONFIG.BOT_ENABLED ? '🟢 機器人：開啟中' : '🔴 機器人：已暫停';

        div.innerHTML = `
            <h3 id="gui-toggle">🤖 搶票控制台 v8.4</h3>
            <div id="gui-content">
                <div class="bot-row">
                    <label>預設票數:</label>
                    <select id="cfg-ticket-qty" style="width: 60px; text-align: center;">
                        <option value="1">1 張</option>
                        <option value="2">2 張</option>
                        <option value="3">3 張</option>
                        <option value="4">4 張</option>
                    </select>
                </div>
                <div class="bot-row">
                    <label>選票策略:</label>
                    <select id="cfg-strategy">
                        <option value="default">💎 最貴優先 (預設)</option>
                        <option value="range">🎯 價格區間 (嚴格)</option>
                    </select>
                </div>
                <div id="price-range-box">
                    <div style="color:#aaa; font-size:10px; text-align:center;">區間內選剩餘最多 (無則刷新)</div>
                    <div class="range-inputs">
                        <input type="number" id="cfg-min-price" placeholder="Min" value="${CONFIG.MIN_PRICE}">
                        <span style="color:#fff">~</span>
                        <input type="number" id="cfg-max-price" placeholder="Max" value="${CONFIG.MAX_PRICE}">
                    </div>
                </div>
                <div class="bot-row">
                    <label title="選中後等待幾毫秒點擊">確認延遲(ms):</label>
                    <input type="number" id="cfg-area-delay" value="${CONFIG.AREA_CONFIRM_DELAY}">
                </div>
                <div class="bot-row">
                    <label title="找不到票時，要發呆多久才刷新頁面">無票刷新等待:</label>
                    <input type="number" id="cfg-wait-time" value="${CONFIG.NO_TICKET_WAIT_TIME}">
                </div>
                <div class="bot-row">
                    <label title="OCR填寫後等待多久送出">送出延遲(ms):</label>
                    <input type="number" id="cfg-submit-delay" value="${CONFIG.SUBMIT_DELAY}">
                </div>

                <div id="bot-status">狀態: 待機中</div>

                <button id="btn-save" class="bot-btn save">💾 儲存設定 (F5生效)</button>
                <button id="btn-war-mode" class="bot-btn danger">🔥 戰鬥模式 (5秒刷新)</button>

                <button id="btn-toggle-master" class="bot-btn ${btnClass}">${btnText}</button>
            </div>
        `;
        document.body.appendChild(div);

        // UI 邏輯
        const strategySelect = document.getElementById('cfg-strategy');
        const rangeBox = document.getElementById('price-range-box');
        const ticketQtySelect = document.getElementById('cfg-ticket-qty');

        strategySelect.value = CONFIG.STRATEGY;
        ticketQtySelect.value = CONFIG.TICKET_QUANTITY;
        if (CONFIG.STRATEGY === 'range') rangeBox.classList.add('show');

        strategySelect.addEventListener('change', (e) => {
            if (e.target.value === 'range') rangeBox.classList.add('show');
            else rangeBox.classList.remove('show');
        });

        document.getElementById('gui-toggle').addEventListener('click', () => div.classList.toggle('collapsed'));

        // 總開關
        const masterBtn = document.getElementById('btn-toggle-master');
        masterBtn.addEventListener('click', () => {
            CONFIG.BOT_ENABLED = !CONFIG.BOT_ENABLED;
            GM_setValue('BOT_ENABLED', CONFIG.BOT_ENABLED);

            if (CONFIG.BOT_ENABLED) {
                masterBtn.className = 'bot-btn status-on';
                masterBtn.innerText = '🟢 機器人：開啟中';
                updateStatus("🟢 已啟動");
            } else {
                masterBtn.className = 'bot-btn status-off';
                masterBtn.innerText = '🔴 機器人：已暫停';
                updateStatus("⏸️ 已暫停");
            }
        });

        document.getElementById('btn-save').addEventListener('click', () => {
            GM_setValue('TICKET_QUANTITY', parseInt(document.getElementById('cfg-ticket-qty').value));
            GM_setValue('STRATEGY', document.getElementById('cfg-strategy').value);
            GM_setValue('MIN_PRICE', parseInt(document.getElementById('cfg-min-price').value) || 0);
            GM_setValue('MAX_PRICE', parseInt(document.getElementById('cfg-max-price').value) || 100000);
            GM_setValue('AREA_CONFIRM_DELAY', parseInt(document.getElementById('cfg-area-delay').value));
            GM_setValue('NO_TICKET_WAIT_TIME', parseInt(document.getElementById('cfg-wait-time').value));
            GM_setValue('SUBMIT_DELAY', parseInt(document.getElementById('cfg-submit-delay').value));

            const btn = document.getElementById('btn-save');
            btn.innerText = "✅ 已儲存";
            setTimeout(() => { btn.innerText = "💾 儲存設定 (F5生效)"; window.location.reload(); }, 500);
        });

        // 戰鬥模式 (無彈窗，直接生效)
        document.getElementById('btn-war-mode').addEventListener('click', () => {
            document.getElementById('cfg-area-delay').value = 0;
            document.getElementById('cfg-wait-time').value = 5000;
            document.getElementById('cfg-submit-delay').value = 0;
            document.getElementById('btn-save').click();
            updateStatus("🔥 戰鬥模式已開啟！");
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createGUI);
    else createGUI();

    function updateStatus(text) {
        const el = document.getElementById('bot-status');
        if(el) el.innerText = text;
    }

    // =========================================================
    // ⬇️ 核心搶票邏輯
    // =========================================================
    const currentUrl = window.location.href;

    function runCommonHelpers() {
        const keyword = "已售完";
        document.querySelectorAll("li").forEach(li => { if (li.textContent.includes(keyword)) li.style.display = "none"; });
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    }

    // --- 區域選擇頁 ---
    if (currentUrl.includes('/ticket/area/')) {
        window.addEventListener('load', () => {
            if (!CONFIG.BOT_ENABLED) { updateStatus("⏸️ 暫停中..."); return; }
            updateStatus("狀態: 分析票區...");
            runCommonHelpers();
            const TARGET_CONTAINER_SELECTOR = 'li.select_form_b';

            function getPrice(element) {
                const text = element.innerText || element.textContent;
                const numbers = text.match(/\d+/g);
                if (!numbers) return 0;
                const prices = numbers.map(n => parseInt(n)).filter(n => n > 400);
                return prices.length > 0 ? Math.max(...prices) : 0;
            }
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
                if (!CONFIG.BOT_ENABLED) return;

                const allContainers = Array.from(document.querySelectorAll(TARGET_CONTAINER_SELECTOR));
                let validContainers = allContainers.filter(li => li.style.display !== 'none');
                let safeContainers = validContainers.filter(li => !li.innerText.includes("身障"));
                let candidates = safeContainers.length > 0 ? safeContainers : validContainers;

                if (candidates.length > 0) {
                    let finalTargets = [];
                    try {
                        if (CONFIG.STRATEGY === 'range') {
                            const min = CONFIG.MIN_PRICE;
                            const max = CONFIG.MAX_PRICE;
                            let rangeCandidates = candidates.filter(li => { const p = getPrice(li); return p >= min && p <= max; });
                            console.log(`📊 [區間] $${min}~${max}，符合: ${rangeCandidates.length}`);
                            if (rangeCandidates.length > 0) {
                                let maxSeats = -1;
                                rangeCandidates.forEach(li => { const s = getRemainingSeats(li); if (s > maxSeats) maxSeats = s; });
                                finalTargets = rangeCandidates.filter(li => getRemainingSeats(li) === maxSeats);
                            }
                        } else {
                            let maxPrice = 0;
                            candidates.forEach(li => { const p = getPrice(li); if (p > maxPrice) maxPrice = p; });
                            const expensiveList = candidates.filter(li => getPrice(li) === maxPrice);
                            let maxSeats = -1;
                            expensiveList.forEach(li => { const s = getRemainingSeats(li); if (s > maxSeats) maxSeats = s; });
                            finalTargets = expensiveList.filter(li => getRemainingSeats(li) === maxSeats);
                            if (finalTargets.length === 0) finalTargets = candidates;
                        }
                    } catch (e) { finalTargets = []; }

                    if (finalTargets.length > 0) {
                        const finalChoice = finalTargets[Math.floor(Math.random() * finalTargets.length)];
                        const targetLink = finalChoice.querySelector('a');
                        if (targetLink) {
                            const p = getPrice(finalChoice);
                            const s = getRemainingSeats(finalChoice);
                            updateStatus(`鎖定: $${p} / 餘${s}`);
                            targetLink.style.backgroundColor = "#ffeb3b";
                            targetLink.style.border = "5px solid #f44336";
                            targetLink.style.color = "#000"; targetLink.style.fontWeight = "bold";
                            if (CONFIG.AREA_CONFIRM_DELAY > 0) targetLink.innerText += ` (⏳ ${CONFIG.AREA_CONFIRM_DELAY/1000}s)`;
                            setTimeout(() => { if(CONFIG.BOT_ENABLED) targetLink.click(); }, CONFIG.AREA_CONFIRM_DELAY);
                        } else { setTimeout(() => { if(CONFIG.BOT_ENABLED) window.location.reload(); }, CONFIG.ERROR_RETRY_RATE); }
                    } else { handleNoTicket(); }
                } else { handleNoTicket(); }
            }
            function handleNoTicket() {
                if (!CONFIG.BOT_ENABLED) return;
                updateStatus(`無符合..${CONFIG.NO_TICKET_WAIT_TIME/1000}s後刷`);
                let timeLeft = CONFIG.NO_TICKET_WAIT_TIME / 1000;
                const guiTitle = document.getElementById('gui-toggle');
                const originalTitle = guiTitle ? guiTitle.innerText : "";
                const timer = setInterval(() => {
                    if (!CONFIG.BOT_ENABLED) { clearInterval(timer); return; }
                    timeLeft--;
                    if(guiTitle) guiTitle.innerText = `⏳ 無票...${timeLeft}`;
                    if (timeLeft <= 0) { clearInterval(timer); if(guiTitle) guiTitle.innerText = originalTitle; }
                }, 1000);
                setTimeout(() => { if(CONFIG.BOT_ENABLED) window.location.reload(); }, CONFIG.NO_TICKET_WAIT_TIME);
            }
            makeDecision();
        });
    }

    if (currentUrl.includes('/ticket/ticket/')) {
        if (!CONFIG.BOT_ENABLED) { updateStatus("⏸️ 暫停中..."); return; }

        updateStatus(`狀態: 選擇 ${CONFIG.TICKET_QUANTITY} 張票...`);
        runCommonHelpers();

        let ticketSelected = false;
        const targetQty = CONFIG.TICKET_QUANTITY;
        const ticketInterval = setInterval(() => {
            if (!CONFIG.BOT_ENABLED) { clearInterval(ticketInterval); return; }

            const selects = document.querySelectorAll("select");
            let anySuccess = false;
            selects.forEach(sel => {
                if (parseInt(sel.value) !== targetQty) {
                    sel.focus(); sel.value = targetQty; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.blur();
                } else { anySuccess = true; }
            });
            document.querySelectorAll('input[type="checkbox"]').forEach(cb => { if(!cb.checked) cb.checked = true; });
            if (anySuccess) {
                ticketSelected = true;
                clearInterval(ticketInterval);
                console.log("✅ 票數選擇完成，開始 OCR...");
                startOCR();
            }
        }, 100);

        const SELECTOR_PAIRS = [{ img: "#TicketForm_verifyCode-image", input: "#TicketForm_verifyCode", name: "拓元模式" }];
        let isOcrRunning = false;

        function clickSubmitButton() {
            if (!CONFIG.BOT_ENABLED) return;
            document.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
            const submitBtn = document.querySelector('button.btn.btn-primary.btn-green');
            if (submitBtn) { updateStatus(`送出中...`); setTimeout(() => submitBtn.click(), CONFIG.SUBMIT_DELAY); }
        }

        function startOCR() {
            if (!CONFIG.BOT_ENABLED) return;
            const observer = new MutationObserver(() => checkAndSolve());
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            checkAndSolve();
        }

        function solveCaptcha(img, input, mode) {
            if (!CONFIG.BOT_ENABLED) return;
            if (isOcrRunning) return;
            isOcrRunning = true;
            updateStatus("狀態: 識別驗證碼...");
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext("2d");
            setTimeout(() => {
                ctx.drawImage(img, 0, 0);
                const base64Data = canvas.toDataURL("image/png");
                const base64Image = base64Data.split(',')[1];
                GM_xmlhttpRequest({
                    method: "POST", url: CONFIG.API_URL, headers: { "Content-Type": "application/json" },
                    data: JSON.stringify({ image: base64Image }),
                    onload: function(response) {
                        isOcrRunning = false;
                        if (!CONFIG.BOT_ENABLED) return;
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            const code = data.result;
                            console.log(`✅ 結果: ${code}`); updateStatus(`驗證碼: ${code}`);
                            input.value = code; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
                            clickSubmitButton();
                        } else { console.error(`❌ Error:`, response.responseText); updateStatus("錯誤: 識別失敗"); }
                    },
                    onerror: function(err) { isOcrRunning = false; console.error(`❌ 連線失敗:`, err); updateStatus("錯誤: 連線失敗"); }
                });
            }, 100);
        }

        function checkAndSolve() {
            if (!CONFIG.BOT_ENABLED) return;
            if (isOcrRunning) return;
            if (!ticketSelected) return;
            for (const pair of SELECTOR_PAIRS) {
                const img = document.querySelector(pair.img);
                const input = document.querySelector(pair.input);
                if (img && input) {
                    if (input.value && input.value.length >= 4) return;
                    if (img.complete && img.naturalWidth > 0) {
                        solveCaptcha(img, input, pair.name);
                        if (!img.hasAttribute('data-ocr-attached')) {
                            img.setAttribute('data-ocr-attached', 'true');
                            img.addEventListener('click', () => { isOcrRunning = false; input.value = ""; setTimeout(() => checkAndSolve(), 500); });
                        }
                    } else { img.onload = () => checkAndSolve(); }
                    break;
                }
            }
        }
    }
})();