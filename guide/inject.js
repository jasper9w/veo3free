(function () {
    'use strict';

    console.log('🚀 图片生成 WebSocket 客户端 v3.1');

    if (window.self !== window.top) return;

    let capturedImageData = null;
    let onImageCaptured = null;
    let ws = null;
    let isExecuting = false;
    let clientId = null;
    let shouldConnect = true;
    let hideTimer = null;
    let statusBtn = null;
    let overlayMask = null;

    function getServerOrigin() {
        // 从 inject.js 的 src 推导服务端 origin（避免硬编码端口）
        let src = '';
        try {
            src = (document.currentScript && document.currentScript.src) ? document.currentScript.src : '';
        } catch (e) {
            src = '';
        }
        if (!src) {
            const scripts = Array.from(document.getElementsByTagName('script'));
            const hit = scripts.map(s => s.src).find(u => u && u.indexOf('/inject.js') >= 0);
            src = hit || '';
        }
        try {
            return new URL(src).origin;
        } catch (e) {
            return 'http://localhost:12346';
        }
    }

    function toWsUrl(origin) {
        const wsOrigin = origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
        return wsOrigin + '/ws';
    }

    // 检查是否在 project 页面
    function isProjectPage() {
        return /^https:\/\/labs\.google\/fx\/tools\/flow\/project\/.+/.test(location.href);
    }

    // 创建/更新状态按钮
    function createStatusButton() {
        if (statusBtn) return statusBtn;
        statusBtn = document.createElement('div');
        statusBtn.style.cssText = `
            position: fixed;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            padding: 6px 32px;
            background: #6c757d;
            color: white;
            border-radius: 0 0 8px 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
            text-align: center;
            white-space: nowrap;
        `;
        statusBtn.onclick = () => {
            if (!isProjectPage()) {
                location.href = 'https://labs.google/fx/tools/flow';
                return;
            }
            if (ws?.readyState === WebSocket.OPEN) {
                return;
            }
            shouldConnect = true;
            connect();
        };
        document.body.appendChild(statusBtn);
        return statusBtn;
    }

    function updateButton(text, color, pulse = false) {
        if (!statusBtn) createStatusButton();
        statusBtn.textContent = text;
        statusBtn.style.background = color;
        statusBtn.style.animation = pulse ? 'pulse 1.5s infinite' : 'none';

        // 添加脉冲动画样式
        if (pulse && !document.getElementById('ws-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'ws-pulse-style';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
                    50% { box-shadow: 0 2px 15px rgba(40, 167, 69, 0.6); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 创建/显示全屏遮罩
    function showOverlayMask() {
        if (!isProjectPage()) return;

        if (overlayMask) {
            overlayMask.style.display = 'flex';
            return;
        }

        overlayMask = document.createElement('div');
        overlayMask.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(150, 150, 150, 0.3);
            z-index: 99998;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(1px);
            pointer-events: auto;
        `;

        const tip = document.createElement('div');
        tip.style.cssText = `
            color: white;
            font-size: 20px;
            font-weight: bold;
            text-align: center;
            text-shadow: 0 2px 10px rgba(0,0,0,0.9);
            line-height: 2;
        `;

        tip.innerHTML = `
            页面已托管至 Veo3Free App进行自动化控制<br/>
            <span style="font-size: 15px; opacity: 0.95;">如需恢复手动模式，请</span>
            <a href="javascript:void(0)" id="refresh-link" style="
                color: #4fc3f7;
                text-decoration: underline;
                font-size: 15px;
                cursor: pointer;
                transition: color 0.2s;
            ">刷新</a>页面
        `;

        // overlayMask.appendChild(tip);
        // document.body.appendChild(overlayMask);

        // 刷新链接点击事件
        document.getElementById('refresh-link').addEventListener('click', () => {
            location.reload();
        });

        // 鼠标悬停效果
        document.getElementById('refresh-link').addEventListener('mouseenter', (e) => {
            e.target.style.color = '#81d4fa';
        });
        document.getElementById('refresh-link').addEventListener('mouseleave', (e) => {
            e.target.style.color = '#4fc3f7';
        });
    }

    // 隐藏全屏遮罩
    function hideOverlayMask() {
        if (overlayMask) {
            overlayMask.style.display = 'none';
        }
    }

    // 断开连接
    function disconnect() {
        shouldConnect = false;
        if (ws) {
            ws.close();
            ws = null;
        }
        clientId = null;
        hideOverlayMask();
    }

    // 连接 WebSocket
    function connect() {
        if (!isProjectPage()) {
            updateButton('未在项目页', '#6c757d');
            return;
        }
        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
            return;
        }

        updateButton('连接中...', '#ffc107');
        const wsUrl = toWsUrl(getServerOrigin());
        console.log('连接 ' + wsUrl);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('连接成功，发送注册');
            ws.send(JSON.stringify({
                type: 'register',
                page_url: window.location.href
            }));
        };

        ws.onmessage = async (e) => {
            const data = JSON.parse(e.data);

            if (data.type === 'register_success') {
                clientId = data.client_id;
                console.log('注册成功:', clientId);
                updateButton('● 已连接', '#28a745', true);
                showOverlayMask();
                return;
            }

            if (data.type === 'task') {
                console.log('收到任务:', data.task_id);
                await executeTask(
                    data.task_id,
                    data.prompt,
                    data.task_type || 'Create Image',
                    data.aspect_ratio || '16:9',
                    data.resolution || '4K',
                    data.reference_images || []
                );
            }
        };

        ws.onclose = () => {
            console.log('断开');
            clientId = null;
            updateButton('○ 已断开', '#dc3545');
            hideOverlayMask();
            if (shouldConnect && isProjectPage()) {
                setTimeout(connect, 3000);
            }
        };

        ws.onerror = (err) => {
            console.error('错误:', err);
            updateButton('连接错误', '#dc3545');
        };
    }

    // 拦截 Blob URL 获取图片数据
    const origCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
        const url = origCreateObjectURL(blob);
        if (blob && (blob.type?.startsWith('image/') || blob.type?.startsWith('video/') || blob.size > 100000)) {
            console.log('📥 拦截Blob:', blob.type, Math.round(blob.size / 1024) + 'KB');
            const reader = new FileReader();
            reader.onloadend = () => {
                capturedImageData = reader.result.split(',')[1];
                if (onImageCaptured) onImageCaptured(capturedImageData);
            };
            reader.readAsDataURL(blob);
        }
        return url;
    };

    function waitForImageData(timeout = 120000) {
        return new Promise(resolve => {
            if (capturedImageData) {
                const data = capturedImageData;
                capturedImageData = null;
                return resolve(data);
            }
            const timer = setTimeout(() => {
                onImageCaptured = null;
                resolve(null);
            }, timeout);
            onImageCaptured = data => {
                clearTimeout(timer);
                onImageCaptured = null;
                capturedImageData = null;
                resolve(data);
            };
        });
    }

    // 拦截pushState和replaceState
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    function createCustomEvent() {
        window.dispatchEvent(new CustomEvent('routechange', {
            detail: { url: window.location.href }
        }));
    }

    window.history.pushState = function (...args) {
        originalPushState.apply(this, args);
        createCustomEvent();
    };

    window.history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        createCustomEvent();
    };

    // 监听路由变化
    window.addEventListener('routechange', (event) => {
        console.log('页面变更了:', event.detail.url);
        handlePageChange();
    });

    // 页面可见性监听
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log("页面不可见，30s后将断开连接");
            hideTimer = setTimeout(() => {
                shouldConnect = false;
                ws?.close();
            }, 30000);
        } else {
            console.log("页面恢复可见");
            clearTimeout(hideTimer);
            shouldConnect = true;
            if (isProjectPage() && (!ws || ws.readyState !== WebSocket.OPEN)) {
                connect();
            }
        }
    });

    // 处理页面变化
    function handlePageChange() {
        createStatusButton();

        if (isProjectPage()) {
            // 在项目页面，建立连接
            shouldConnect = true;
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                connect();
            }
        } else {
            // 不在项目页面，断开连接
            disconnect();
            updateButton('未在项目页', '#6c757d');
        }
    }

    // XPath helpers
    const $x1 = (xpath, ctx = document) => document.evaluate(xpath, ctx, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    const $x = (xpath, ctx = document) => {
        const r = [], q = document.evaluate(xpath, ctx, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < q.snapshotLength; i++) r.push(q.snapshotItem(i));
        return r;
    };

    window.$x = $x
    window.$x1 = $x1

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // 通用等待函数（先等待再检查，避免立即满足条件）
    async function waitUntil(conditionFn, timeout = 60000, interval = 1000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            await sleep(interval);
            const succ = await conditionFn();
            console.log("waitUntil=", succ)
            if (succ) {
                return true
            }
        }
        return false;
    }

    // base64 转 File
    function base64ToFile(base64Data, filename = 'image.jpg') {
        const byteString = atob(base64Data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        return new File([new Blob([ab], { type: 'image/jpeg' })], filename, { type: 'image/jpeg' });
    }

    // 上传文件到 input 并等待完成
    async function uploadFileToInput(base64Data, filename = 'image.jpg') {
        const fileInput = $x('//input[@type="file"]')[0];
        if (!fileInput) throw new Error('未找到文件输入框');

        const dt = new DataTransfer();
        dt.items.add(base64ToFile(base64Data, filename));
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        await sleep(1000);
        const ok = await waitUntil(() => $x1('//div[@data-item-index="0"]/div/div[1]//img'));
        if (!ok) throw new Error('上传超时');
    }

    // 上传参考图
    async function uploadReferenceImage(base64Data) {
        await sleep(1000);

        clickByText('add', '*', 'Add Media');

        const filename = `ref_${Math.random().toString(36).slice(2, 10)}.jpg`;
        await uploadFileToInput(base64Data, filename);



        await clickByText('Create', 'span', 'add_2');

        const searchInputEl = $x1('//input[@placeholder]');

        console.warn('searchInputEl', searchInputEl)
        // 触发搜索输入
        if (searchInputEl) {
            function setReactInputValue(element, value) {
                // 获取 React 内部用的原生 value setter（绕过 React 的追踪）
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    'value'
                ).set;

                nativeInputValueSetter.call(element, value);

                // 派发 input 事件，触发 React 的 onChange 合成事件
                element.dispatchEvent(new Event('input', { bubbles: true }));

                // 部分组件还监听了 change，一并派发保险
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
            setReactInputValue(searchInputEl, filename);
            await sleep(1000);
            await clickByText(filename, 'div')

        }
    }

    // 上传首尾帧
    async function uploadFrameImages(frameImages) {
        if (!frameImages?.length) throw new Error('首帧是必需的');



        clickByText('add', '*', 'Add Media')
        // clickByText('Upload image', '*', 'Add Media')
        await uploadFileToInput(frameImages[0], 'last.jpg');
    }

    function sendWsMessage(data) {
        if (ws?.readyState !== WebSocket.OPEN) return false;
        data._id = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        ws.send(JSON.stringify(data));
        return true;
    }

    function sendStatus(msg) {
        console.log('📌', msg);
        sendWsMessage({ type: 'status', message: msg });
    }

    function sendResult(taskId, error) {
        sendWsMessage({ type: 'result', task_id: taskId, error });
    }
    async function inputPrompt(prompt_text) {
        const editorDiv = document.querySelector('div[data-slate-editor="true"]');

        if (!editorDiv) {
            console.warn('未找到编辑器');
            return;
        }

        editorDiv.focus();
        await new Promise(r => setTimeout(r, 100));

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorDiv);
        selection.removeAllRanges();
        selection.addRange(range);

        editorDiv.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'deleteContentBackward'
        }));
        await new Promise(r => setTimeout(r, 50));

        for (let i = 0; i < prompt_text.length; i++) {
            editorDiv.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: prompt_text[i]
            }));

            await new Promise(r => setTimeout(r, 10));

            editorDiv.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: prompt_text[i]
            }));

            await new Promise(r => setTimeout(r, 10));
        }
    }
    window.inputPrompt = inputPrompt



    /**
 * 模拟鼠标点击指定文本的元素
 * @param {string} containText - 目标元素包含的文本
 * @param {string} elType      - 元素标签名，如 'button', 'span', 'div'
 * @param {string} anchorText  - 锚点文本，有多个同名元素时，点击距离锚点最近的那个
 *
 * @example clickByText('button', '删除')              // 直接点击包含"删除"的按钮
 * @example clickByText('button', '删除', '订单A')     // 点击靠近"订单A"的那个"删除"按钮
 * @example clickByText('button', '')                  // containText 为空时，点击坐标 (1, 1)
 *
 * @note 同时派发 PointerEvent + MouseEvent，兼容 Radix UI 等监听 pointer 事件的组件库
 */
    async function clickByText(containText, elType = '*', anchorText = null) {
        console.log(`containText=${containText}, elType=${elType}, anchorText=${anchorText}`)

        const $x = (xpath, ctx = document) => {
            const r = [], q = document.evaluate(xpath, ctx, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < q.snapshotLength; i++) r.push(q.snapshotItem(i));
            return r;
        };

        const dispatch = (target, cx, cy) => {
            const pos = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
            target.dispatchEvent(new PointerEvent('pointerdown', { ...pos, pointerId: 1 }));
            target.dispatchEvent(new PointerEvent('pointerup', { ...pos, pointerId: 1 }));
            ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
                target.dispatchEvent(new MouseEvent(type, pos));
            });
        };

        // containText 为空时，点击坐标 (1, 1) 处的元素
        if (!containText) {
            const target = document.elementFromPoint(1, 1) ?? document.body;
            // console.log(`[clickByText] containText 为空，点击坐标 (1, 1)`, target);
            dispatch(target, 1, 1);
            // console.log(`[clickByText] ✅ 完成`);
            return;
        }

        const candidates = Array.from($x(`//${elType}[contains(text(), '${containText}')]`));
        // console.log(`[clickByText] 找到 ${candidates.length} 个 <${elType}> 候选元素`, candidates);

        let target = candidates[0];

        if (anchorText) {
            const anchor = $x(`//*[contains(text(), '${anchorText}')]`)[0];
            // console.log(`[clickByText] 锚点元素:`, anchor);
            const { x: ax, y: ay } = anchor.getBoundingClientRect();
            target = candidates.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return Math.hypot(ra.x - ax, ra.y - ay) - Math.hypot(rb.x - ax, rb.y - ay);
            })[0];
            // console.log(`[clickByText] 最近候选元素:`, target);
        }

        const { x, y, width, height } = target.getBoundingClientRect();
        const cx = x + width / 2, cy = y + height / 2;
        // console.log(`[clickByText] 点击坐标: (${cx.toFixed(0)}, ${cy.toFixed(0)})`, target);

        dispatch(target, cx, cy);
        // console.log(`[clickByText] ✅ 完成`);

        await new Promise(resolve => setTimeout(resolve, 300));
    }
    window.clickByText = clickByText


    // async function handleImageGen(taskType, aspectRatio, resolution, referenceImages) {
    //     await clickByText(''); // 重置

    //     await clickByText("crop_", "*", "arrow_forward") // 展开参数

    //     // 任务类型
    //     const useType = taskType.indexOf("Image") > -1 ? "Image" : "Video"
    //     await clickByText(useType, "*", "arrow_forward")   // 设置任务类型
    //     await clickByText("x1", "*", "arrow_forward")      // 只出1个

    //     const useAspect = aspectRatio.indexOf("16:9") > -1 ? "Landscape" : "Portrait"
    //     await clickByText(useAspect, "*", "arrow_forward") // 设置方向

    //     if ("Image" == useType) {
    //         await clickByText("arrow_drop_down", "*", "arrow_forward")
    //         await clickByText("Nano Banana 2", "*", "arrow_forward")
    //     } else {
    //         await clickByText("arrow_drop_down", "*", "arrow_forward")
    //         await clickByText("Veo 3.1 - Quality", "*", "arrow_forward")
    //     }
    // }

    async function executeTask(taskId, prompt, taskType, aspectRatio, resolution, referenceImages) {
        console.log('🚀 执行任务:', taskId, taskType, prompt.substring(0, 30) + '...');

        if (isExecuting) return;
        isExecuting = true;
        capturedImageData = null;

        try {

            await clickByText(''); // 重置


            // 输入prompt
            await inputPrompt(prompt)

            await clickByText("crop_", "*", "arrow_forward") // 展开参数

            // 任务类型
            const useType = taskType.indexOf("Image") > -1 ? "Image" : "Video"
            await clickByText(useType, "button", "Landscape")       // 设置任务类型
            await clickByText("x1", "*", "arrow_forward")      // 只出1个

            const useAspect = aspectRatio.indexOf("16:9") > -1 ? "Landscape" : "Portrait"
            await clickByText(useAspect, "*", "arrow_forward") // 设置方向

            if ("Image" == useType) {
                await clickByText("arrow_drop_down", "*", "arrow_forward")
                await clickByText("Nano Banana 2", "*", "arrow_forward")
            } else {
                await clickByText("arrow_drop_down", "*", "arrow_forward")
                await clickByText("Veo 3.1 - Quality", "*", "arrow_forward")
            }

            // 再上传图片
            if (taskType === 'Frames to Video') {
                sendStatus('上传首尾帧...');
                await uploadFrameImages(referenceImages);
            } else if (taskType !== 'Text to Video' && referenceImages?.length) {
                const name = taskType === 'Ingredients to Video' ? '垫图' : '参考图';
                for (let i = 0; i < referenceImages.length; i++) {
                    sendStatus(`上传${name} ${i + 1}/${referenceImages.length}...`);
                    await uploadReferenceImage(referenceImages[i]);
                    await sleep(500);
                }
            }


            // 执行
            await clickByText("arrow_forward", "i", "arrow_forward")
            sendStatus('等待生成...');

            // 等待生成完成
            const genOk = await waitUntil(() => {
                const container = $x1('//div[@data-item-index="0"]//div[@data-tile-id]');
                if (!container) return false;
                if ($x1(".//img | .//video", container)) return true;
                const text = container.innerText;
                if (text?.trim().endsWith('%')) sendStatus('进度 ' + text);
                else if (text && !text.includes('\n')) throw new Error('生成失败: ' + text);
                return false;
            }, 120000);
            if (!genOk) throw new Error('生成超时');

            // 下载
            sendStatus('下载中...');

            const resMap = {
                "1080p": "Upscaled (1080p)", "720p": "Original size (720p)",
                "4K": "Download 4K", "2K": "Download 2K", "1K": "Download 1K"
            };

            let base64Data = null;
            if (resolution.toUpperCase() === '1K') {
                const img1k = $x1('//div[@data-item-index="0"]//div[@data-tile-id]//img');
                const response = await fetch(img1k.src);
                const blob = await response.blob();

                base64Data = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve(reader.result.split(',')[1]);
                    };
                    reader.readAsDataURL(blob);
                });
            } else {
                const resolutionText = resMap[resolution];
                if (!resolutionText) throw new Error('未知分辨率: ' + resolution);
                const dlBtn = $x1(`//div[contains(text(), '${resolutionText}')]`);
                if (!dlBtn) throw new Error('未找到 ' + resolutionText + ' 下载按钮');
                dlBtn.click();

                // 等待图片数据
                sendStatus('获取数据...');
                base64Data = await waitForImageData(4 * 60 * 1000);
            }


            if (base64Data) {
                sendStatus('发送数据...');
                const chunkSize = 1024 * 1024;
                const totalChunks = Math.ceil(base64Data.length / chunkSize);

                if (totalChunks > 1) {
                    for (let i = 0; i < totalChunks; i++) {
                        sendWsMessage({
                            type: 'image_chunk',
                            task_id: taskId,
                            chunk_index: i,
                            total_chunks: totalChunks,
                            data: base64Data.slice(i * chunkSize, (i + 1) * chunkSize)
                        });
                        await sleep(100);
                    }
                } else {
                    sendWsMessage({ type: 'image_data', task_id: taskId, data: base64Data });
                }
                sendStatus('完成 ✅');
            } else {
                sendResult(taskId, '未获取到图片数据');
            }

        } catch (e) {
            console.error('❌ 执行错误:', e);
            sendResult(taskId, e.message);
        } finally {
            isExecuting = false;
        }
    }

    // 初始化
    function init() {
        console.log('🎯 初始化');
        handlePageChange();

        // 如果在首页，自动点击 New project
        if (location.href === 'https://labs.google/fx/tools/flow') {
            setTimeout(() => {
                const newProjectBtn = $x1('//button[text()="New project"]');
                if (newProjectBtn) {
                    console.log('自动点击 New project 按钮');
                    newProjectBtn.click();
                }
            }, 1000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
