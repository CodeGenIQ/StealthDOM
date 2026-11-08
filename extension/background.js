/**
 * StealthDOM -- Background Service Worker
 * 
 * Handles operations that content scripts can't do:
 * - Tab management (list, open, close, switch)
 * - Screenshots (captureVisibleTab)
 * - Cookies (get, set, delete)
 * - Navigation (via chrome.tabs API)
 * - MAIN world script execution (CSP-safe, pre-compiled functions)
 * - Network traffic capture (request/response headers)
 * 
 * Communicates with content scripts via chrome.runtime messaging.
 */

// Keep-alive: prevent browser from killing the service worker
const KEEPALIVE_INTERVAL = 20000;  // 20s (well under 5min timeout)

setInterval(() => {
    // Touching chrome.runtime keeps the worker alive
    chrome.runtime.getPlatformInfo(() => { });
}, KEEPALIVE_INTERVAL);

// ==========================================
// On-Demand Content Script Injection
// ==========================================
// Content script is NOT declared in manifest.json.
// Instead, we inject it lazily on first command to each tab,
// saving memory and CPU across all untouched tabs/frames.

const _injectedTabs = new Set();

/**
 * Ensure the content script is injected into a tab before sending it commands.
 * Injects into all frames (allFrames: true) so frame_id targeting works.
 * No-ops if already injected into this tab.
 * 
 * @param {number} tabId - The numeric Chrome tab ID
 * @returns {Promise<void>}
 */
async function ensureContentScriptInjected(tabId) {
    if (_injectedTabs.has(tabId)) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['content_script.js'],
        });
        _injectedTabs.add(tabId);
        
        // Eagerly attach the debugger so we are ready to catch any future dialogs
        // triggered by the content script.
        await ensureDebuggerAttached(tabId);
    } catch (e) {
        // Don't add to set — let the next command retry
        throw new Error(`Content script injection failed: ${e.message}. If the tab is sleeping/discarded, use browser_reload or browser_switch_tab to wake it up first.`);
    }
}

// ==========================================
// Persistent Debugger Sessions
// ==========================================
// Since the user is running with --silent-debugger-extension-api, we can keep
// the debugger attached permanently to any tab we interact with. This is CRITICAL
// for catching synchronous JavaScript dialogs (alert/confirm/prompt).

const _attachedDebuggers = new Set();

// Tracks the most recent dialog payload for each tab.
// Format: tabId -> { type, message, defaultPrompt }
const _activeDialogs = new Map();

async function ensureDebuggerAttached(tabId) {
    if (_attachedDebuggers.has(tabId)) return { tabId };
    const target = { tabId };
    try {
        await chrome.debugger.attach(target, '1.3');
        await chrome.debugger.sendCommand(target, 'Page.enable');
        await chrome.debugger.sendCommand(target, 'DOM.enable');
        await chrome.debugger.sendCommand(target, 'Network.enable');
        _attachedDebuggers.add(tabId);
    } catch (e) {
        // If it's already attached by another extension or DevTools, that's fine.
        console.warn(`[StealthDOM] Debugger attach failed for tab ${tabId}:`, e.message);
    }
    return target;
}

chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId && method === 'Page.javascriptDialogOpening') {
        _activeDialogs.set(source.tabId, params);
        console.log('[StealthDOM] Intercepted native dialog on tab', source.tabId, params);
    } else if (source.tabId && method === 'Page.javascriptDialogClosed') {
        _activeDialogs.delete(source.tabId);
    }
});

chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId) {
        _attachedDebuggers.delete(source.tabId);
        _activeDialogs.delete(source.tabId);
    }
});

// Clean up injection tracking when tabs navigate or close
chrome.tabs.onRemoved.addListener((tabId) => {
    _injectedTabs.delete(tabId);
    _attachedDebuggers.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // When a tab navigates to a new page, the injected script is gone
    if (changeInfo.status === 'loading') {
        _injectedTabs.delete(tabId);
        // Debugger stays attached across navigations, but we re-enable Page just in case
        if (_attachedDebuggers.has(tabId)) {
            chrome.debugger.sendCommand({ tabId }, 'Page.enable').catch(()=>null);
        }
    }
});

// ==========================================
// Global Enable/Disable State
// ==========================================

let _enabled = true;  // Default: enabled

// Load persisted state on startup
chrome.storage.local.get(['stealthdom_enabled'], (result) => {
    _enabled = result.stealthdom_enabled !== false;
    if (_enabled) {
        enableCSPStripping();
    } else {
        disableCSPStripping();
    }
    updateIcon(_enabled);
});

function enableCSPStripping() {
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [9999],
        addRules: [{
            id: 9999,
            priority: 1,
            action: {
                type: 'modifyHeaders',
                responseHeaders: [
                    { header: 'content-security-policy', operation: 'remove' },
                    { header: 'content-security-policy-report-only', operation: 'remove' }
                ]
            },
            condition: {
                resourceTypes: ['main_frame', 'sub_frame']
            }
        }]
    }).then(() => {
        console.log('[StealthDOM] CSP header stripping enabled');
    });
}

let _blockConversations = false;
function enableConversationBlocking() {
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [8888],
        addRules: [{
            id: 8888,
            priority: 2,
            action: { type: 'block' },
            condition: {
                urlFilter: 'backend-anon/conversation',
                resourceTypes: ['xmlhttprequest']
            }
        }]
    }).then(() => {
        console.log('[StealthDOM] Conversation blocking enabled');
    });
}

function disableConversationBlocking() {
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [8888]
    }).then(() => {
        console.log('[StealthDOM] Conversation blocking disabled');
    });
}

function toggleAssetBlocking(enable, fonts, images, trackers) {
    const removeRuleIds = [7000, 7001, 7002, 7003, 7004, 7005, 7006];
    const addRules = [];
    if (enable) {
        if (fonts) addRules.push({ id: 7000, priority: 2, action: { type: 'block' }, condition: { resourceTypes: ['font'] } });
        if (images) addRules.push({ id: 7001, priority: 2, action: { type: 'block' }, condition: { resourceTypes: ['image'] } });
        if (trackers) {
            ['*google-analytics*', '*pixel*', '*tracker*', '*analytics*', '*metrics*'].forEach((pattern, i) => {
                addRules.push({
                    id: 7002 + i, priority: 2, action: { type: 'block' },
                    condition: { urlFilter: pattern, resourceTypes: ['script', 'xmlhttprequest', 'ping', 'image'] }
                });
            });
        }
    }
    chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules })
        .then(() => console.log(`[StealthDOM] Asset blocking ${enable ? 'ON' : 'OFF'}`));
    return { success: true };
}

function disableCSPStripping() {
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [9999],
        addRules: []
    }).then(() => {
        console.log('[StealthDOM] CSP header stripping disabled');
    }).catch(err => {
        console.warn('[StealthDOM] Failed to remove CSP stripping rule:', err);
    });
}

function setEnabled(enabled) {
    _enabled = enabled;
    chrome.storage.local.set({ stealthdom_enabled: enabled });

    if (enabled) {
        enableCSPStripping();
        bridgeConnect();
        updateIcon(true);
        console.log('[StealthDOM] Enabled');
    } else {
        disableCSPStripping();
        bridgeDisconnect();
        updateIcon(false);
        console.log('[StealthDOM] Disabled');
    }
}

/**
 * Update the toolbar icon to reflect enabled/disabled state.
 * Enabled: normal colored icon, no badge.
 * Disabled: greyscale icon + red "OFF" badge.
 */
async function updateIcon(enabled) {
    if (enabled) {
        // Restore original icon
        chrome.action.setIcon({
            path: { '16': 'icon16.png', '48': 'icon48.png', '128': 'icon128.png' }
        });
        chrome.action.setBadgeText({ text: '' });
    } else {
        // Greyscale icon via OffscreenCanvas
        try {
            const sizes = [16, 48];
            const imageData = {};
            for (const size of sizes) {
                const resp = await fetch(`icon${size}.png`);
                const blob = await resp.blob();
                const bmp = await createImageBitmap(blob);
                const canvas = new OffscreenCanvas(size, size);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bmp, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size);
                // Convert to greyscale
                for (let i = 0; i < data.data.length; i += 4) {
                    const grey = Math.round(
                        data.data[i] * 0.299 + data.data[i+1] * 0.587 + data.data[i+2] * 0.114
                    );
                    data.data[i] = grey;
                    data.data[i+1] = grey;
                    data.data[i+2] = grey;
                    data.data[i+3] = Math.round(data.data[i+3] * 0.6); // Slightly transparent
                }
                imageData[size] = data;
            }
            chrome.action.setIcon({ imageData });
        } catch (e) {
            console.warn('[StealthDOM] Failed to create greyscale icon:', e);
        }
        // Red "OFF" badge
        chrome.action.setBadgeText({ text: 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
    }
}

function bridgeDisconnect() {
    if (_bridgeWs) {
        _bridgeWs.onclose = null;  // Prevent auto-reconnect
        _bridgeWs.close();
        _bridgeWs = null;
    }
    bridgeCleanup();
    clearTimeout(_bridgeReconnect);
}

// CSP stripping is now managed by enableCSPStripping() / disableCSPStripping() above.

// ==========================================
// Network Traffic Capture
// ==========================================

// ==========================================
// Circular Buffer for Network Capture
// ==========================================

/**
 * Fixed-size circular buffer. Overwrites oldest entries when full.
 * Tracks overflow count so agents know if data was lost.
 */
class CircularBuffer {
    constructor(maxSize) {
        this._buf = new Array(maxSize);
        this._maxSize = maxSize;
        this._head = 0;       // Next write position
        this._size = 0;       // Current fill level
        this._overflowCount = 0;
    }
    push(item) {
        if (this._size >= this._maxSize) {
            this._overflowCount++;
        } else {
            this._size++;
        }
        this._buf[this._head] = item;
        this._head = (this._head + 1) % this._maxSize;
    }
    toArray() {
        if (this._size < this._maxSize) {
            return this._buf.slice(0, this._size);
        }
        // Buffer is full — items start from _head (oldest) wrapping around
        return [...this._buf.slice(this._head), ...this._buf.slice(0, this._head)];
    }
    clear() {
        this._head = 0;
        this._size = 0;
        this._overflowCount = 0;
    }
    get overflowCount() { return this._overflowCount; }
    get size() { return this._size; }
    get maxSize() { return this._maxSize; }
}

const NET_CAPTURE_MAX = 5000;
const _netCapture = new CircularBuffer(NET_CAPTURE_MAX);
let _netCaptureActive = false;

// Capture all requests when enabled
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!_netCaptureActive) return;
        _netCapture.push({
            timestamp: Date.now(),
            type: details.type,
            method: details.method,
            url: details.url,
            tabId: details.tabId,
            requestBody: details.requestBody ? {
                raw: details.requestBody.raw ? details.requestBody.raw.map(r => {
                    if (r.bytes) {
                        try {
                            const decoder = new TextDecoder('utf-8');
                            return { text: decoder.decode(r.bytes) };
                        } catch (e) {
                            return { bytes: Array.from(new Uint8Array(r.bytes)) };
                        }
                    }
                    return { file: r.file };
                }) : null,
                formData: details.requestBody.formData || null,
            } : null,
        });
    },
    {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'ping', 'other']
    },
    ['requestBody']
);

// Also capture response headers
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (!_netCaptureActive) return;
        // Find matching request and add response info
        const arr = _netCapture.toArray();
        const match = arr.find(r => r.url === details.url && !r.responseHeaders);
        if (match) {
            match.statusCode = details.statusCode;
            match.responseHeaders = {};
            for (const h of (details.responseHeaders || [])) {
                match.responseHeaders[h.name.toLowerCase()] = h.value;
            }
        }
    },
    {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'ping', 'other']
    },
    ['responseHeaders']
);

// Capture request headers (auth tokens, content-type, etc.)
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (!_netCaptureActive) return;
        const arr = _netCapture.toArray();
        const match = arr.find(r => r.url === details.url && !r.requestHeaders);
        if (match) {
            match.requestHeaders = {};
            for (const h of (details.requestHeaders || [])) {
                match.requestHeaders[h.name.toLowerCase()] = h.value;
            }
        }
    },
    {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'ping', 'other']
    },
    ['requestHeaders']
);

// ==========================================
// Message Handler from Content Scripts
// ==========================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Handle popup messages (enable/disable toggle)
    if (msg.type === 'setEnabled') {
        setEnabled(msg.enabled);
        sendResponse({ ok: true });
        return true;
    }
    if (msg.type === 'getStatus') {
        sendResponse({
            enabled: _enabled,
            bridgeConnected: _bridgeWs && _bridgeWs.readyState === WebSocket.OPEN,
        });
        return true;
    }
    if (msg.type === 'getGovernorState') {
        getGovernorStateAndStats()
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }
    if (msg.type === 'setGovernorConfig') {
        setGovernorConfig(msg.config)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }
    if (msg.type === 'sleepAllInactiveNow') {
        sleepAllInactiveTabsNow()
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }
    if (msg.type === 'restoreParkedWindow') {
        const senderTabId = sender && sender.tab ? sender.tab.id : null;
        restoreParkedMinimizedWindow(msg.windowId, msg.parkedTabId, senderTabId)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (msg.target !== 'background') return false;

    // Pass sender tab ID so commands run in the correct tab context
    if (sender.tab) msg._senderTabId = sender.tab.id;

    handleBackgroundCommand(msg)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));

    return true;  // Keep channel open for async response
});

async function handleBackgroundCommand(msg) {
    const { action } = msg;

    switch (action) {
        // === God Mode ===
        case 'executeSequence': {
            const { sequence, tabId, frameId } = msg;
            if (!Array.isArray(sequence)) return { success: false, error: 'sequence must be an array' };
            const results = [];
            for (let i = 0; i < sequence.length; i++) {
                const step = sequence[i];
                // Inherit routing context if not explicitly provided
                if (!step.tabId && tabId) step.tabId = tabId;
                if (!step.frameId && frameId) step.frameId = frameId;
                
                // Assign a unique ID to the step so callbacks map correctly
                step.id = Math.random().toString(36).substring(2, 15);
                
                // Execute step
                const stepResult = await bridgeRouteCommand(step);
                results.push({ action: step.action, ...stepResult });
                
                // If a step fails, halt the sequence immediately
                if (!stepResult.success) {
                    return { 
                        success: false, 
                        error: `Sequence failed at step ${i + 1} ('${step.action}'): ${stepResult.error}`, 
                        results 
                    };
                }
            }
            return { success: true, data: results };
        }

        // === Tab Management ===
        case 'listTabs':
            return await cmdListTabs();
        case 'newTab':
            return await cmdNewTab(msg.url, msg.windowId, msg.forceRestore);
        case 'closeTab':
            return await cmdCloseTab(msg.tabId);
        case 'switchTab':
            return await cmdSwitchTab(msg.tabId);
        case 'reloadTab':
            return await cmdReloadTab(msg.tabId);
        case 'discardTab':
            return await cmdDiscardTab(msg.tabId);

        // === Navigation ===
        case 'navigate':
            return await cmdNavigate(msg.url, msg.tabId);
        case 'goBack':
            return await cmdGoBack(msg.tabId);

        // === Screenshots ===
        case 'captureScreenshot':
            return await cmdCaptureScreenshot(msg.tabId);
        case 'captureFullPageScreenshot':
            return await cmdCaptureFullPageScreenshot(msg.tabId, msg.maxHeight);

        // === Native Mouse (CDP) ===
        case 'mouseMoveCDP':
            return await cmdMouseMoveCDP(msg.tabId, msg.x, msg.y, msg.steps, msg.duration);
        case 'mouseClickCDP':
            return await cmdMouseClickCDP(msg.tabId, msg.x, msg.y, msg.button, msg.clickCount);
        case 'mouseDownCDP':
            return await cmdMouseDownCDP(msg.tabId, msg.x, msg.y, msg.button);
        case 'mouseUpCDP':
            return await cmdMouseUpCDP(msg.tabId, msg.x, msg.y, msg.button);
        case 'mouseDragCDP':
            return await cmdMouseDragCDP(msg.tabId, msg.startX, msg.startY, msg.endX, msg.endY, msg.steps, msg.duration);
        case 'mouseWheelCDP':
            return await cmdMouseWheelCDP(msg.tabId, msg.x, msg.y, msg.deltaX, msg.deltaY);
        case 'keyPressCDP':
            return await cmdKeyPressCDP(msg.tabId, msg.key, msg.modifiers);
        case 'keyComboCDP':
            return await cmdKeyComboCDP(msg.tabId, msg.keys);
        case 'insertTextCDP':
        case 'paste':
            return await cmdInsertTextCDP(msg.tabId, msg.text || msg.value, msg.selector, msg.frameId);
        case 'setInputFilesCDP':
            return await cmdSetFileInputFilesCDP(msg.tabId, msg.selector, msg.files);
            
        // === Settings ===
        case 'toggleAssetBlocking':
            return toggleAssetBlocking(msg.enable, msg.blockFonts, msg.blockImages, msg.blockTrackers);

        // === Dialogs (CDP) ===
        case 'handleDialog':
            return await cmdHandleDialog(msg.tabId, msg.accept, msg.promptText);

        // === Cookies ===
        case 'getCookies':
            return await cmdGetCookies(msg.url, msg.tabId, msg.storeId);
        case 'setCookie':
            return await cmdSetCookie(msg.details);
        case 'deleteCookie':
            return await cmdDeleteCookie(msg.url, msg.name, msg.tabId, msg.storeId);
        case 'listCookieStores':
            return await cmdListCookieStores();

        // === Script Execution (CSP bypass) ===
        case 'executeScript':
            return await cmdExecuteScript(msg.code, msg._senderTabId || msg.tabId, msg.world);
        case 'executeScriptAllFrames':
            return await cmdExecuteScriptAllFrames(msg.code, msg.tabId, msg.world);

        // === Frame Enumeration ===
        case 'listFrames':
            return await cmdListFrames(msg.tabId);

        // === Window Management ===
        case 'newWindow':
            return await cmdNewWindow(msg.url);
        case 'newIncognitoWindow':
            return await cmdNewIncognitoWindow(msg.url);
        case 'closeWindow':
            return await cmdCloseWindow(msg.windowId);
        case 'resizeWindow':
            return await cmdResizeWindow(msg.windowId, msg.width, msg.height, msg.left, msg.top, msg.state);

        // === Network Capture ===
        case 'startNetCapture':
            _netCapture.clear();
            _netCaptureActive = true;
            return { success: true, data: 'Capture started' };
        case 'stopNetCapture':
            _netCaptureActive = false;
            return { success: true, data: { requestCount: _netCapture.size } };
        case 'getNetCapture':
            return {
                success: true,
                data: {
                    requests: _netCapture.toArray(),
                    overflowCount: _netCapture.overflowCount,
                    bufferSize: _netCapture.maxSize,
                    capturedCount: _netCapture.size,
                }
            };
        case 'clearNetCapture':
            _netCapture.clear();
            return { success: true };

        // === URL & Condition Waiting ===
        case 'waitForUrl':
            return await cmdWaitForUrl(msg.tabId, msg.pattern, msg.timeout);
        case 'waitForCondition':
            return await cmdWaitForCondition(msg.tabId, msg.code, msg.timeout);
        case 'enableBlock':
            enableConversationBlocking();
            return { success: true, data: "Blocking enabled" };
        case 'disableBlock':
            disableConversationBlocking();
            return { success: true, data: "Blocking disabled" };
        case 'focus':
            return await forwardToContentScript(msg);

        // === Dialog Handling ===
        case 'handleDialog':
            return await cmdHandleDialog(msg.tabId, msg.accept, msg.promptText);
        case 'getActiveDialog':
            return await cmdGetActiveDialog(msg.tabId);

        default:
            return { success: false, error: `Unknown background action: ${action}` };
    }
}

// ==========================================
// Dialog Handling
// ==========================================

async function cmdHandleDialog(tabId, accept, promptText) {
    try {
        const target = await ensureDebuggerAttached(tabId);
        
        const params = { accept };
        if (promptText !== undefined) {
            params.promptText = promptText;
        }
        
        await chrome.debugger.sendCommand(target, 'Page.handleJavaScriptDialog', params);
        _activeDialogs.delete(tabId); // Manually clear it just in case
        return { success: true };
    } catch (e) {
        // If it still fails with "No dialog is showing", it means a dialog opened before 
        // the agent's very first interaction with the tab. There is no recovery from this
        // in Chrome's architecture, but since we now eagerly attach on every interaction,
        // this should be extremely rare.
        return { success: false, error: e.message };
    }
}

async function cmdGetActiveDialog(tabId) {
    if (_activeDialogs.has(tabId)) {
        return { success: true, data: _activeDialogs.get(tabId) };
    }
    return { success: true, data: null };
}

// ==========================================
// WebSocket Bridge Connection
// ==========================================
// The bridge connection lives HERE in the background script
// instead of in content scripts. This is critical because:
// 1. Background scripts are NOT subject to page CSP restrictions
// 2. No "Private Network Access" popups (the page isn't making the connection)
// 3. Single persistent connection regardless of which tab is active
// 4. Works on ALL sites including Gmail, Google, etc.

const WS_URL = 'ws://127.0.0.1:9877';
const RECONNECT_INTERVAL = 3000;
const HEARTBEAT_INTERVAL = 5000;

let _bridgeWs = null;
let _bridgeHeartbeat = null;
let _bridgeReconnect = null;

function bridgeConnect() {
    if (_bridgeWs && (_bridgeWs.readyState === WebSocket.OPEN || _bridgeWs.readyState === WebSocket.CONNECTING)) return;

    try {
        _bridgeWs = new WebSocket(WS_URL);
        console.log('[StealthDOM] Connecting to bridge...');
    } catch (e) {
        console.error('[StealthDOM] WebSocket creation failed:', e);
        bridgeScheduleReconnect();
        return;
    }

    _bridgeWs.onopen = () => {
        console.log('[StealthDOM] Connected to bridge from background script');
        clearTimeout(_bridgeReconnect);

        // Auto-detect browser label for multi-browser support
        let browserLabel = 'browser';
        
        // Brave aggressively hides from the userAgent string for anti-fingerprinting, 
        // but it is exposed in userAgentData.brands
        if (navigator.userAgentData && navigator.userAgentData.brands) {
            const brands = navigator.userAgentData.brands.map(b => b.brand);
            if (brands.includes('Brave')) browserLabel = 'brave';
            else if (brands.includes('Microsoft Edge')) browserLabel = 'edge';
            else if (brands.includes('Google Chrome')) browserLabel = 'chrome';
            else if (brands.includes('Chromium')) browserLabel = 'chrome';
        }
        
        // Fallback for older browsers
        if (browserLabel === 'browser') {
            const ua = navigator.userAgent || '';
            browserLabel = ua.includes('Brave') ? 'brave'
                : ua.includes('Edg/') ? 'edge'
                : ua.includes('Chrome') ? 'chrome'
                : 'browser';
        }

        bridgeSend({
            type: 'handshake',
            label: browserLabel,
            url: 'extension-background',
            title: 'StealthDOM Service Worker',
            timestamp: Date.now(),
        });

        _bridgeHeartbeat = setInterval(() => {
            bridgeSend({ type: 'heartbeat', timestamp: Date.now() });
        }, HEARTBEAT_INTERVAL);
    };

    _bridgeWs.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            const response = await bridgeRouteCommand(msg);
            bridgeSend({ type: 'response', id: msg.id, ...response });
        } catch (e) {
            console.error('[StealthDOM] Bridge message error:', e);
        }
    };

    _bridgeWs.onclose = () => {
        console.log('[StealthDOM] Bridge connection closed');
        bridgeCleanup();
        bridgeScheduleReconnect();
    };

    _bridgeWs.onerror = (err) => {
        console.error('[StealthDOM] Bridge error');
    };
}

function bridgeSend(data) {
    if (_bridgeWs && _bridgeWs.readyState === WebSocket.OPEN) {
        _bridgeWs.send(JSON.stringify(data));
    }
}

function bridgeCleanup() {
    if (_bridgeHeartbeat) {
        clearInterval(_bridgeHeartbeat);
        _bridgeHeartbeat = null;
    }
}

function bridgeScheduleReconnect() {
    if (!_enabled) return;  // Don't reconnect when disabled
    clearTimeout(_bridgeReconnect);
    _bridgeReconnect = setTimeout(bridgeConnect, RECONNECT_INTERVAL);
}

/**
 * Route incoming bridge commands to either background handlers or content scripts.
 */
async function bridgeRouteCommand(msg) {
    // Reject commands if disabled
    if (!_enabled) {
        return { success: false, error: 'StealthDOM is disabled. Enable it from the extension popup.' };
    }

    const { action } = msg;

    // Resolve any discarded tab ID alias and record agent activity
    if (msg.tabId !== undefined && msg.tabId !== null) {
        msg.tabId = resolveDiscardedTabAlias(Number(msg.tabId));
        markTabActivity(msg.tabId, true);
    }

    const nonWakeActions = [
        'listTabs', 'newTab', 'closeTab', 'discardTab', 'reloadTab',
        'switchTab', 'navigate', 'newWindow', 'newIncognitoWindow', 'closeWindow',
    ];
    if (
        _governorConfig.autoWakeForAgent &&
        msg.tabId !== undefined &&
        msg.tabId !== null &&
        !nonWakeActions.includes(action)
    ) {
        await ensureTabAwakeForAgent(Number(msg.tabId));
        msg.tabId = resolveDiscardedTabAlias(Number(msg.tabId));
    }

    // These actions are handled directly in the background script
    const bgActions = [
        'listTabs', 'newTab', 'closeTab', 'switchTab', 'reloadTab', 'discardTab',
        'navigate', 'goBack',
        'captureScreenshot', 'captureFullPageScreenshot',
        'mouseMoveCDP', 'mouseClickCDP', 'mouseDownCDP', 'mouseUpCDP', 'mouseDragCDP', 'mouseWheelCDP',
        'keyPressCDP', 'keyComboCDP', 'insertTextCDP', 'paste', 'setInputFilesCDP',
        'getCookies', 'setCookie', 'deleteCookie', 'listCookieStores',
        'startNetCapture', 'stopNetCapture', 'getNetCapture', 'clearNetCapture',
        'newWindow', 'newIncognitoWindow', 'closeWindow', 'resizeWindow',
        'toggleAssetBlocking',
        'executeScript', 'executeScriptAllFrames', 'listFrames',
        'enableBlock', 'disableBlock',
        'handleDialog', 'getActiveDialog',
        'waitForUrl', 'waitForCondition', 'executeSequence',
    ];

    try {
        if (bgActions.includes(action)) {
            return await handleBackgroundCommand(msg);
        } else {
            // Forward DOM commands to the active tab's content script
            return await bridgeForwardToContentScript(msg);
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Forward a command to a content script via chrome.tabs.sendMessage.
 * Lazily injects the content script on first use per tab.
 */
async function bridgeForwardToContentScript(msg) {
    try {
        const targetId = msg.tabId;
        if (!targetId) {
            return { success: false, error: 'tabId required. Use browser_list_tabs to get tab IDs.' };
        }
        const tab = await chrome.tabs.get(targetId);

        // Can't inject into browser internal pages
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('brave://') || tab.url.startsWith('edge://')) {
            return { success: false, error: `Cannot run commands on browser internal pages (${tab.url.split('/')[2]})` };
        }

        // Ensure content script is injected (no-op if already done for this tab)
        await ensureContentScriptInjected(targetId);

        // Build sendMessage options — target a specific frame.
        // Default to frameId 0 (top-level frame) when none specified.
        // Without this, sendMessage broadcasts to ALL frames and returns
        // whichever responds first — on SPAs with hidden iframes (tracking
        // pixels, OAuth, etc.), a hidden iframe can respond before the
        // main page, causing DOM queries to return wrong/empty results.
        const sendOpts = { frameId: 0 };
        if (msg.frameId !== undefined && msg.frameId !== null) {
            sendOpts.frameId = msg.frameId;
        }

        const contentMsg = { ...msg, target: 'content' };

        // Try targeted frame first, fall back to broadcast if no response.
        // This handles frameset pages (Gmail) where frame 0 may not have a
        // content script listener, while still defaulting to frame 0 for
        // SPAs (Twitter) that have hidden iframes.
        const result = await new Promise((resolve) => {
            const staleTip = " (If the extension was recently reloaded or the tab is unresponsive, use browser_reload to refresh the tab and re-inject the script)";
            chrome.tabs.sendMessage(targetId, contentMsg, sendOpts, (response) => {
                if (chrome.runtime.lastError) {
                    // Frame 0 had no content script — retry without frameId (broadcast)
                    if (msg.frameId === undefined || msg.frameId === null) {
                        chrome.tabs.sendMessage(targetId, contentMsg, {}, (fallbackResp) => {
                            if (chrome.runtime.lastError) {
                                resolve({ success: false, error: `Content script error: ${chrome.runtime.lastError.message}.${staleTip}` });
                            } else {
                                resolve(fallbackResp || { success: false, error: `No response from content script.${staleTip}` });
                            }
                        });
                    } else {
                        resolve({ success: false, error: `Content script error: ${chrome.runtime.lastError.message}.${staleTip}` });
                    }
                } else {
                    resolve(response || { success: false, error: `No response from content script.${staleTip}` });
                }
            });
        });
        return result;
    } catch (e) {
        return { success: false, error: `Forward failed: ${e.message}` };
    }
}

// Start bridge connection if enabled
if (_enabled) bridgeConnect();

// ==========================================
// Tab Management
// ==========================================

async function cmdListTabs() {
    const windows = await chrome.windows.getAll();
    const windowIncognito = {};
    const windowStates = {};
    windows.forEach(w => { 
        windowIncognito[w.id] = w.incognito; 
        windowStates[w.id] = w.state; // e.g., 'normal', 'minimized', 'maximized'
    });

    const tabs = await chrome.tabs.query({});
    const visibleTabs = tabs.filter(t => !isParkedPlaceholderTab(t));
    return {
        success: true,
        data: visibleTabs.map(t => {
            const parkedInfo = _minimizedParkedWindows.get(t.windowId);
            const isParkedActive = Boolean(
                parkedInfo &&
                (t.id === parkedInfo.parkedTabId || t.id === resolveDiscardedTabAlias(parkedInfo.parkedTabId))
            );
            return {
                id: t.id,
                url: t.url,
                title: t.title,
                active: t.active || isParkedActive,
                windowId: t.windowId,
                windowState: windowStates[t.windowId] || 'unknown',
                discarded: t.discarded || false,
                cookieStoreId: t.cookieStoreId,
                incognito: windowIncognito[t.windowId] || false,
                index: t.index,
            };
        })
    };
}

async function cmdNewTab(url, windowId, forceRestore) {
    const options = { url: url || 'about:blank' };
    if (windowId !== undefined && windowId !== null) {
        options.windowId = Number(windowId);
    }
    const tab = await chrome.tabs.create(options);
    if (forceRestore) {
        await chrome.windows.update(tab.windowId, { focused: true, state: 'normal' });
    }
    return {
        success: true,
        data: { tabId: tab.id, url: tab.url, windowId: tab.windowId }
    };
}

async function cmdCloseTab(tabId) {
    if (!tabId) {
        return { success: false, error: 'tabId required' };
    }
    await chrome.tabs.remove(tabId);
    return { success: true };
}

async function cmdSwitchTab(tabId) {
    if (!tabId) {
        return { success: false, error: 'tabId required' };
    }
    await chrome.tabs.update(tabId, { active: true });
    // Also focus the window
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    return { success: true };
}

async function cmdReloadTab(tabId) {
    if (!tabId) return { success: false, error: 'tabId required' };
    await chrome.tabs.reload(tabId);
    return { success: true };
}

async function cmdDiscardTab(tabId) {
    if (!tabId) return { success: false, error: 'tabId required' };
    try {
        const resolvedId = resolveDiscardedTabAlias(Number(tabId));
        const discardedTab = await discardTabWithAliasTracking(resolvedId);
        return { success: true, data: discardedTab };
    } catch (e) {
        return { success: false, error: `Failed to discard tab: ${e.message}` };
    }
}

// ==========================================
// Navigation
// ==========================================

async function cmdNavigate(url, tabId) {
    if (!url) return { success: false, error: 'url required' };
    if (!tabId) return { success: false, error: 'tabId required' };
    await chrome.tabs.update(tabId, { url });
    return { success: true };
}

async function cmdGoBack(tabId) {
    if (!tabId) return { success: false, error: 'tabId required' };
    await chrome.tabs.goBack(tabId);
    return { success: true };
}


// ==========================================
// Screenshots
// ==========================================

/**
 * CDP-based screenshot via chrome.debugger API.
 * 
 * Uses the Page.captureScreenshot CDP command, which renders directly from
 * the compositor pipeline — no window focus, no tab activation, no rate limits.
 * 
 * The chrome.debugger API is a built-in Manifest V3 extension API. It does NOT:
 * - Set navigator.webdriver (only --remote-debugging-port does that)
 * - Open a network port (no port scanning possible)
 * - Change the TLS fingerprint
 * 
 * The only visible side effect is a brief yellow infobar ("Extension is debugging
 * this browser") that appears during the attach/detach window (~100-300ms). This
 * is a browser chrome UI element — no page script can detect it, and it typically
 * appears on the automated tab's window, not the window the user is working in.
 * 
 * Failure modes (all handled with graceful fallback to captureVisibleTab):
 * - Another debugger is already attached to the tab (e.g., DevTools is open on it)
 * - Tab is a browser-internal page (chrome://, brave://, etc.) — already blocked upstream
 */
async function cmdCaptureScreenshotCDP(tabId) {
    try {
        const target = await ensureDebuggerAttached(tabId);
        
        // Race against a 3-second timeout. If the window is fully occluded (covered by another maximized window),
        // Windows DWM tells Chromium to suspend the compositor, causing Page.captureScreenshot to hang.
        const result = await Promise.race([
            chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
                format: 'png',
                quality: 100,
                fromSurface: true,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('CDP_TIMEOUT')), 4000))
        ]);
        
        return {
            success: true,
            data: {
                dataUrl: 'data:image/png;base64,' + result.data,
                format: 'png',
                tabId,
                method: 'cdp',
            }
        };
    } catch (e) {
        if (e.message === 'CDP_TIMEOUT') {
            const tab = await chrome.tabs.get(tabId);
            const win = await chrome.windows.get(tab.windowId);
            const stateDesc = win.state === 'minimized' ? 'minimized' : 'fully occluded';
            throw new Error(`Timed out. Window: ${stateDesc}, graphics suspended. Either stop and tell user to restore window, or open a new tab with the force flag.`);
        }
        throw e; // Rethrow so caller can fall back to captureVisibleTab
    }
}

/**
 * CDP-based full-page screenshot.
 * 
 * Uses Page.getLayoutMetrics to measure the full document, then
 * Emulation.setDeviceMetricsOverride to expand the viewport to the full
 * page height, and Page.captureScreenshot with captureBeyondViewport to
 * capture everything in a single shot — no scrolling, no stitching.
 * 
 * For very tall pages (>16384px), Chrome may fail the single-shot capture
 * due to GPU texture limits. In that case, the caller falls back to the
 * scroll-stitch approach using captureVisibleTab.
 */
async function cmdCaptureFullPageScreenshotCDP(tabId, maxHeight = 20000) {
    let target;
    try {
        target = await ensureDebuggerAttached(tabId);

        // Get full page dimensions
        const metrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics');
        const contentHeight = Math.min(
            Math.ceil(metrics.contentSize.height),
            maxHeight
        );
        const contentWidth = Math.ceil(metrics.contentSize.width);

        // Override device metrics to render the full page in one viewport
        await chrome.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
            width: contentWidth,
            height: contentHeight,
            deviceScaleFactor: 1,
            mobile: false,
        });

        // Brief pause for re-layout
        await new Promise(r => setTimeout(r, 100));

        // Race against a 4-second timeout for full page capture
        const result = await Promise.race([
            chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
                format: 'png',
                quality: 100,
                captureBeyondViewport: true,
                clip: { x: 0, y: 0, width: contentWidth, height: contentHeight, scale: 1 },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('CDP_TIMEOUT')), 4000))
        ]);

        // Reset device metrics to original
        await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride');

        return {
            success: true,
            data: {
                dataUrl: 'data:image/png;base64,' + result.data,
                format: 'png',
                tabId,
                method: 'cdp',
                fullPage: true,
                dimensions: {
                    width: contentWidth,
                    height: contentHeight,
                    frames: 1,
                    maxHeight,
                    actualHeight: contentHeight,
                },
            }
        };
    } catch (e) {
        // Ensure metrics reset on any error
        if (target) {
            try { await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride'); } catch (_) {}
        }
        if (e.message === 'CDP_TIMEOUT') {
            const tab = await chrome.tabs.get(tabId);
            const win = await chrome.windows.get(tab.windowId);
            const stateDesc = win.state === 'minimized' ? 'minimized' : 'fully occluded';
            throw new Error(`Timed out. Window: ${stateDesc}, graphics suspended. Either stop and tell user to restore window, or open a new tab with the force flag.`);
        }
        throw e; // Rethrow so caller can fall back to scroll-stitch
    }
}

/**
 * Wrapper around captureVisibleTab that retries on quota errors.
 * Chrome limits captureVisibleTab to ~2 calls/sec. If we exceed that
 * (e.g., rapid full-page scroll loop) we back off and retry automatically.
 *
 * Includes an in-memory mutex so that only one captureVisibleTab call
 * can be in-flight at a time — prevents parallel MCP tool calls from
 * saturating the quota simultaneously.
 *
 * This is the FALLBACK path — only used when CDP (chrome.debugger) is
 * unavailable (e.g., DevTools is open on the target tab).
 */
let _screenshotLock = null; // Promise-based mutex

async function captureWithRetry(windowId, options, maxAttempts = 5) {
    // Wait for any in-flight screenshot to complete
    while (_screenshotLock) {
        await _screenshotLock;
    }

    let resolveLock;
    _screenshotLock = new Promise(r => { resolveLock = r; });

    try {
        let delay = 600; // ms — start above the 1-second quota window
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await Promise.race([
                    chrome.tabs.captureVisibleTab(windowId, options),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('CAPTURE_TIMEOUT')), 4000))
                ]);
            } catch (e) {
                if (e.message === 'CAPTURE_TIMEOUT') {
                    const win = await chrome.windows.get(windowId);
                    const stateDesc = win.state === 'minimized' ? 'minimized' : 'fully occluded';
                    throw new Error(`Timed out. Window: ${stateDesc}, graphics suspended. Either stop and tell user to restore window, or open a new tab with the force flag.`);
                }
                if (e.message && e.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND') && attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, delay));
                    delay = Math.min(delay * 1.5, 3000); // cap at 3s
                    continue;
                }
                throw e;
            }
        }
    } finally {
        _screenshotLock = null;
        resolveLock();
    }
}

async function cmdCaptureScreenshot(tabId) {
    try {
        if (!tabId) return { success: false, error: 'tabId required' };

        // Auto-restore minimized windows before CDP attempt.
        // Chromium completely suspends the renderer for minimized windows,
        // causing CDP screenshots and mouse events to hang indefinitely.
        // Restore once and leave it — users of this extension expect it.
        const tab = await chrome.tabs.get(tabId);
        
        if (tab.discarded) {
            return { success: false, error: 'Sleeping tab. The tab has been suspended by Chrome to save memory. Wake it up with browser_switch_tab or browser_reload.' };
        }

        // --- TEMPORARILY DISABLED FOR TESTING MINIMIZED SCREENSHOTS ---
        // await ensureWindowNotMinimized(tab.windowId);
        // 
        // const winState = await chrome.windows.get(tab.windowId);
        // if (winState.state === 'minimized') {
        //     return { success: false, error: 'Window minimized. The browser window could not be auto-restored. Chromium suspends graphics for minimized windows.' };
        // }
        // --------------------------------------------------------------

        // Primary path: CDP via chrome.debugger (no focus-stealing, no quota)
        try {
            return await cmdCaptureScreenshotCDP(tabId);
        } catch (cdpError) {
            if (cdpError.message.includes('Graphics Suspended')) throw cdpError;
            // CDP unavailable (DevTools open on this tab, or internal page)
            // Fall back to captureVisibleTab
            console.log('[StealthDOM] CDP screenshot unavailable, falling back to captureVisibleTab:', cdpError.message);
        }

        // Fallback path: captureVisibleTab (requires focus)
        // Remember which window was focused so we can restore it after capture
        const [prevWindow] = await chrome.windows.getAll({ populate: false })
            .then(ws => ws.filter(w => w.focused));
        const prevWindowId = prevWindow?.id;

        // tab and targetWindow already fetched above for auto-restore
        await chrome.tabs.update(tabId, { active: true });
        // --- TEMPORARILY DISABLED FOR TESTING MINIMIZED SCREENSHOTS ---
        // await chrome.windows.update(tab.windowId, { focused: true, state: 'normal' });
        // --------------------------------------------------------------
        // Brief delay to let the tab render after activation
        await new Promise(r => setTimeout(r, 150));

        const dataUrl = await captureWithRetry(tab.windowId, {
            format: 'png',
            quality: 90,
        });

        // Window stays restored — user expects it for automation

        return {
            success: true,
            data: {
                dataUrl,
                format: 'png',
                tabId: tabId,
                method: 'captureVisibleTab',
            }
        };
    } catch (e) {
        let errMsg = e.message || String(e);
        if (errMsg.includes('Internal error')) {
            errMsg += ' (This usually happens if the OS screen is locked, or an RDP session is disconnected, causing the OS to stop drawing windows.)';
        }
        return { success: false, error: `Screenshot failed: ${errMsg}` };
    }
}

/**
 * Full-page screenshot — tries CDP single-shot first, falls back to scroll-and-stitch.
 * 
 * CDP path: Uses Page.captureScreenshot with captureBeyondViewport — captures the
 * entire page in one shot without scrolling. No focus stealing, no rate limits.
 * 
 * Fallback path (captureVisibleTab scroll-stitch):
 * 1. Measures the full scrollHeight and viewport dimensions
 * 2. Detects and hides sticky/fixed elements during middle frames
 * 3. Scrolls through the page, capturing each viewport chunk
 * 4. Stitches all frames into a single PNG using OffscreenCanvas
 */
async function cmdCaptureFullPageScreenshot(tabId, maxHeight = 20000) {
    try {
        if (!tabId) return { success: false, error: 'tabId required' };

        // Auto-restore minimized windows (same pattern as cmdCaptureScreenshot)
        const tab = await chrome.tabs.get(tabId);

        if (tab.discarded) {
            return { success: false, error: 'Sleeping tab. The tab has been suspended by Chrome to save memory. Wake it up with browser_switch_tab or browser_reload.' };
        }

        // Temporarily disabled: we want to test if CDP can handle minimized windows natively.
        // await ensureWindowNotMinimized(tab.windowId);
        //
        // const winState = await chrome.windows.get(tab.windowId);
        // if (winState.state === 'minimized') {
        //     return { success: false, error: 'Window minimized. The browser window could not be auto-restored. Chromium suspends graphics for minimized windows.' };
        // }

        // Primary path: CDP full-page capture (no scrolling, no focus)
        try {
            return await cmdCaptureFullPageScreenshotCDP(tabId, maxHeight);
        } catch (cdpError) {
            if (cdpError.message.includes('Graphics Suspended')) throw cdpError;
            console.log('[StealthDOM] CDP full-page screenshot unavailable, falling back to scroll-stitch:', cdpError.message);
        }

        // Fallback path: scroll-and-stitch via captureVisibleTab

        // Remember which window was focused so we can restore it after capture
        const [prevWindow] = await chrome.windows.getAll({ populate: false })
            .then(ws => ws.filter(w => w.focused));
        const prevWindowId = prevWindow?.id;

        // tab and targetWindow already fetched above for auto-restore
        // await chrome.tabs.update(tabId, { active: true });
        // await chrome.windows.update(tab.windowId, { focused: true, state: 'normal' });
        // await new Promise(r => setTimeout(r, 200));

        // Step 1: Measure page dimensions
        const measureResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => ({
                scrollHeight: document.documentElement.scrollHeight,
                scrollWidth: document.documentElement.scrollWidth,
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth,
                currentScrollY: window.scrollY,
                devicePixelRatio: window.devicePixelRatio || 1,
            }),
        });

        if (!measureResults || !measureResults[0]) {
            return { success: false, error: 'Failed to measure page dimensions' };
        }

        const dims = measureResults[0].result;
        const { viewportHeight, viewportWidth, devicePixelRatio } = dims;
        // Cap the scroll height to prevent memory issues
        const totalHeight = Math.min(dims.scrollHeight, maxHeight);
        const frameCount = Math.ceil(totalHeight / viewportHeight);
        const MAX_FRAMES = 50;

        if (frameCount > MAX_FRAMES) {
            return { success: false, error: `Page too tall: ${totalHeight}px would need ${frameCount} frames (max ${MAX_FRAMES}). Increase maxHeight or reduce page size.` };
        }

        // If the page fits in one viewport, just use regular screenshot
        if (frameCount <= 1) {
            return await cmdCaptureScreenshot(tabId);
        }

        // Step 2: Scroll to top and detect sticky elements
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                window.scrollTo(0, 0);
                // Find and tag sticky/fixed elements for later hiding
                const stickyEls = [];
                const allEls = document.querySelectorAll('*');
                for (const el of allEls) {
                    const style = window.getComputedStyle(el);
                    if (style.position === 'fixed' || style.position === 'sticky') {
                        // Only hide elements that are visible and take up space
                        if (el.offsetHeight > 0 && el.offsetWidth > 0) {
                            el.dataset.__stealthdomOrigPos = style.position;
                            el.dataset.__stealthdomOrigVis = el.style.visibility || '';
                            stickyEls.push(el);
                        }
                    }
                }
                window.__stealthdomStickyCount = stickyEls.length;
            },
        });
        await new Promise(r => setTimeout(r, 200));

        // Step 3: Capture loop
        const frames = [];
        for (let i = 0; i < frameCount; i++) {
            const scrollY = i * viewportHeight;
            const isFirst = i === 0;
            const isLast = i === frameCount - 1;

            // Scroll to position
            await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: (y, hideSticky) => {
                    window.scrollTo(0, y);
                    // Hide sticky elements during middle frames to avoid duplication
                    if (hideSticky) {
                        const els = document.querySelectorAll('[data-__stealthdom-orig-pos]');
                        els.forEach(el => { el.style.visibility = 'hidden'; });
                    } else {
                        // Restore for first/last frames
                        const els = document.querySelectorAll('[data-__stealthdom-orig-pos]');
                        els.forEach(el => {
                            el.style.visibility = el.dataset.__stealthdomOrigVis || '';
                        });
                    }
                },
                args: [scrollY, !isFirst && !isLast],
            });

            // Wait for lazy content to hydrate
            await new Promise(r => setTimeout(r, 150));

            // Capture this frame
            const dataUrl = await captureWithRetry(tab.windowId, {
                format: 'png',
                quality: 100,
            });
            frames.push({ dataUrl, scrollY });
        }

        // Step 4: Restore sticky elements and original scroll position
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (origScrollY) => {
                const els = document.querySelectorAll('[data-__stealthdom-orig-pos]');
                els.forEach(el => {
                    el.style.visibility = el.dataset.__stealthdomOrigVis || '';
                    delete el.dataset.__stealthdomOrigPos;
                    delete el.dataset.__stealthdomOrigVis;
                });
                window.scrollTo(0, origScrollY);
            },
            args: [dims.currentScrollY],
        });

        // Step 5: Stitch frames using OffscreenCanvas
        // The actual pixel dimensions of each capture depend on devicePixelRatio
        const pixelWidth = viewportWidth * devicePixelRatio;
        const pixelViewportHeight = viewportHeight * devicePixelRatio;

        // Calculate the actual total pixel height
        // Last frame may be a partial viewport
        const lastFrameContentHeight = totalHeight - (frameCount - 1) * viewportHeight;
        const pixelTotalHeight = ((frameCount - 1) * viewportHeight + lastFrameContentHeight) * devicePixelRatio;

        const canvas = new OffscreenCanvas(pixelWidth, pixelTotalHeight);
        const ctx = canvas.getContext('2d');

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            // Convert data URL to blob to ImageBitmap
            const resp = await fetch(frame.dataUrl);
            const blob = await resp.blob();
            const bmp = await createImageBitmap(blob);

            const drawY = i * pixelViewportHeight;

            if (i === frames.length - 1) {
                // Last frame: only draw the portion that contains new content
                // (avoid overlapping with the previous frame)
                const remainingHeight = pixelTotalHeight - drawY;
                // The captured image is a full viewport, but we only need the bottom portion
                const sourceY = bmp.height - remainingHeight;
                if (sourceY > 0) {
                    ctx.drawImage(bmp, 0, sourceY, bmp.width, remainingHeight, 0, drawY, bmp.width, remainingHeight);
                } else {
                    ctx.drawImage(bmp, 0, drawY);
                }
            } else {
                ctx.drawImage(bmp, 0, drawY);
            }
            bmp.close();
        }

        // Export as PNG
        const resultBlob = await canvas.convertToBlob({ type: 'image/png' });

        // Convert blob to data URL
        const arrayBuffer = await resultBlob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        // Chunk-spread approach: 8192 args is well under V8 stack limit (~125k)
        // and orders of magnitude faster than char-by-char concatenation.
        const CHUNK = 8192;
        let binary = '';
        for (let i = 0; i < uint8.length; i += CHUNK) {
            binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
        }
        const base64 = btoa(binary);
        const resultDataUrl = `data:image/png;base64,${base64}`;

        // Window stays restored — user expects it for automation

        return {
            success: true,
            data: {
                dataUrl: resultDataUrl,
                format: 'png',
                tabId: tabId,
                method: 'captureVisibleTab',
                fullPage: true,
                dimensions: {
                    width: pixelWidth,
                    height: pixelTotalHeight,
                    frames: frameCount,
                    maxHeight: maxHeight,
                    actualHeight: totalHeight,
                },
            },
        };
    } catch (e) {
        // Best-effort cleanup of sticky element markers
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: () => {
                    const els = document.querySelectorAll('[data-__stealthdom-orig-pos]');
                    els.forEach(el => {
                        el.style.visibility = el.dataset.__stealthdomOrigVis || '';
                        delete el.dataset.__stealthdomOrigPos;
                        delete el.dataset.__stealthdomOrigVis;
                    });
                },
            });
        } catch (_) { /* ignore cleanup errors */ }
        let errMsg = e.message || String(e);
        if (errMsg.includes('Internal error')) {
            errMsg += ' (This usually happens if the OS screen is locked, or an RDP session is disconnected, causing the OS to stop drawing windows.)';
        }
        return { success: false, error: `Full-page screenshot failed: ${errMsg}` };
    }
}

// ==========================================
// Native Mouse (CDP) — isTrusted: true events
// ==========================================

/**
 * Ensure a window is not minimized. Chromium suspends the renderer for
 * minimized windows, breaking CDP screenshots, mouse hit-testing, and
 * Input.dispatchMouseEvent. Restores once and leaves it restored.
 */
async function ensureWindowNotMinimized(windowId) {
    const win = await chrome.windows.get(windowId);
    if (win.state === 'minimized') {
        await chrome.windows.update(windowId, { state: 'normal' });
        // Wait for compositor to wake up and produce at least one frame
        await new Promise(r => setTimeout(r, 300));
        console.log('[StealthDOM] Auto-restored minimized window', windowId);
    }
}

async function withDebugger(tabId, fn) {
    // Ensure renderer is alive (minimized windows suspend it)
    const tab = await chrome.tabs.get(tabId);
    // --- TEMPORARILY DISABLED FOR TESTING MINIMIZED INPUT EVENTS ---
    // await ensureWindowNotMinimized(tab.windowId);
    // --------------------------------------------------------------

    try {
        const target = await ensureDebuggerAttached(tabId);
        const result = await fn(target);
        return result;
    } catch (e) {
        throw e;
    }
}

/**
 * Map button name to CDP button enum and bitmask.
 * CDP uses: 'none'=0, 'left'=1, 'middle'=2, 'right'=4 for buttons bitmask
 * and 'left', 'middle', 'right' for button name.
 */
function cdpButtonInfo(button = 'left') {
    switch (button) {
        case 'right':  return { button: 'right',  buttons: 2 };
        case 'middle': return { button: 'middle', buttons: 4 };
        default:       return { button: 'left',   buttons: 1 };
    }
}

/**
 * Small random jitter for mouse movements (±1-3px).
 * Makes trajectories look more human.
 */
function jitter(val, amount = 2) {
    return val + (Math.random() * amount * 2 - amount);
}

/**
 * CDP mouse move: interpolate from origin (0,0) to (x,y) with realistic steps.
 * Each intermediate point gets small random jitter.
 */
async function cmdMouseMoveCDP(tabId, x, y, steps = 10, duration = 300) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (x === undefined || y === undefined) return { success: false, error: 'x and y required' };

    try {
        return await withDebugger(tabId, async (target) => {
            const stepDelay = Math.max(1, Math.floor(duration / steps));

            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const cx = i < steps ? jitter(x * t) : x;
                const cy = i < steps ? jitter(y * t) : y;

                await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: Math.round(cx),
                    y: Math.round(cy),
                });

                if (i < steps) {
                    await new Promise(r => setTimeout(r, stepDelay));
                }
            }

            return {
                success: true,
                data: { x, y, steps, duration, method: 'cdp' }
            };
        });
    } catch (e) {
        return { success: false, error: `Mouse move failed: ${e.message}` };
    }
}

/**
 * CDP mouse click: move to coords, press, release.
 * Supports left/right/middle and double-click via clickCount.
 */
async function cmdMouseClickCDP(tabId, x, y, button = 'left', clickCount = 1) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (x === undefined || y === undefined) return { success: false, error: 'x and y required' };

    const btn = cdpButtonInfo(button);

    try {
        return await withDebugger(tabId, async (target) => {
            // Move to position first
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x, y,
            });
            await new Promise(r => setTimeout(r, 20));

            // Press
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x, y,
                button: btn.button,
                buttons: btn.buttons,
                clickCount,
            });
            await new Promise(r => setTimeout(r, 30 + Math.random() * 50));

            // Release
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x, y,
                button: btn.button,
                buttons: 0,
                clickCount,
            });

            return {
                success: true,
                data: { x, y, button, clickCount, method: 'cdp' }
            };
        });
    } catch (e) {
        return { success: false, error: `Mouse click failed: ${e.message}` };
    }
}

/**
 * CDP mouse down: press and hold at coordinates.
 * Use with mouseUpCDP for atomic hold/release scenarios.
 */
async function cmdMouseDownCDP(tabId, x, y, button = 'left') {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (x === undefined || y === undefined) return { success: false, error: 'x and y required' };

    const btn = cdpButtonInfo(button);

    try {
        return await withDebugger(tabId, async (target) => {
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x, y,
            });
            await new Promise(r => setTimeout(r, 10));

            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x, y,
                button: btn.button,
                buttons: btn.buttons,
                clickCount: 1,
            });

            return {
                success: true,
                data: { x, y, button, method: 'cdp' }
            };
        });
    } catch (e) {
        return { success: false, error: `Mouse down failed: ${e.message}` };
    }
}

/**
 * CDP mouse up: release button at coordinates.
 * Completes a hold started by mouseDownCDP.
 */
async function cmdMouseUpCDP(tabId, x, y, button = 'left') {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (x === undefined || y === undefined) return { success: false, error: 'x and y required' };

    const btn = cdpButtonInfo(button);

    try {
        return await withDebugger(tabId, async (target) => {
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x, y,
                button: btn.button,
                buttons: 0,
                clickCount: 1,
            });

            return {
                success: true,
                data: { x, y, button, method: 'cdp' }
            };
        });
    } catch (e) {
        return { success: false, error: `Mouse up failed: ${e.message}` };
    }
}

/**
 * CDP mouse drag: full drag sequence in a single debugger session.
 * Press at start, interpolate movement to end, release.
 */
async function cmdMouseDragCDP(tabId, startX, startY, endX, endY, steps = 20, duration = 500) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
        return { success: false, error: 'startX, startY, endX, endY required' };
    }

    try {
        return await withDebugger(tabId, async (target) => {
            const stepDelay = Math.max(1, Math.floor(duration / steps));

            // Move to start position
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: startX,
                y: startY,
            });
            await new Promise(r => setTimeout(r, 30));

            // Press at start
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: startX,
                y: startY,
                button: 'left',
                buttons: 1,
                clickCount: 1,
            });
            await new Promise(r => setTimeout(r, 30));

            // Interpolated move from start to end
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const cx = i < steps ? jitter(startX + (endX - startX) * t) : endX;
                const cy = i < steps ? jitter(startY + (endY - startY) * t) : endY;

                await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: Math.round(cx),
                    y: Math.round(cy),
                    buttons: 1,
                });

                await new Promise(r => setTimeout(r, stepDelay));
            }

            // Release at end
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: endX,
                y: endY,
                button: 'left',
                buttons: 0,
                clickCount: 1,
            });

            return {
                success: true,
                data: { startX, startY, endX, endY, steps, duration, method: 'cdp' }
            };
        });
    } catch (e) {
        return { success: false, error: `Mouse drag failed: ${e.message}` };
    }
}

/**
 * CDP mouse wheel: dispatch native scroll wheel event at coordinates.
 */
async function cmdMouseWheelCDP(tabId, x, y, deltaX = 0, deltaY = 0) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (x === undefined || y === undefined) return { success: false, error: 'x and y required' };

    try {
        return await withDebugger(tabId, async (target) => {
            await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                x, y,
                deltaX: deltaX || 0,
                deltaY: deltaY || 0,
            });

            return {
                success: true,
                data: { x, y, deltaX, deltaY, method: 'cdp' }
            };
        });
    } catch (e) {
        return { success: false, error: `Mouse wheel failed: ${e.message}` };
    }
}

/**
 * Helper to map standard keys to CDP text/unmodifiedText
 */
function getCDPKeyText(key) {
    if (key.length === 1) return key;
    if (key === 'Enter') return '\r';
    if (key === 'Tab') return '\t';
    if (key === 'Space') return ' ';
    return '';
}

/**
 * CDP keyboard: dispatch native key events.
 */
async function cmdKeyPressCDP(tabId, key, modifiers = 0) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (!key) return { success: false, error: 'key required' };

    const text = getCDPKeyText(key);

    try {
        return await withDebugger(tabId, async (target) => {
            // 1. rawKeyDown or keyDown
            await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
                type: text ? 'keyDown' : 'rawKeyDown',
                key,
                windowsVirtualKeyCode: 0, // Simplified, Chromium often infers this
                nativeVirtualKeyCode: 0,
                text,
                unmodifiedText: text,
                modifiers
            });

            // 2. char (only if text exists and it's not a control key that wouldn't emit char)
            if (text && key !== 'Enter' && key !== 'Tab') {
                await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
                    type: 'char',
                    key,
                    text,
                    unmodifiedText: text,
                    modifiers
                });
            }

            // 3. keyUp
            await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                key,
                modifiers
            });

            return {
                success: true,
                data: { key, modifiers, method: 'cdp' }
            };
        });
    } catch (e) {
        return { success: false, error: `Key press failed: ${e.message}` };
    }
}

/**
 * CDP keyboard combo: dispatch native key events for a combination of keys.
 */
async function cmdKeyComboCDP(tabId, keysString) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (!keysString) return { success: false, error: 'keys required' };

    const keys = keysString.split(',').map(k => k.trim());
    if (keys.length === 0) return { success: false, error: 'invalid keys' };

    // Map common modifier names to CDP modifier bitmask
    let modifiers = 0;
    const keySequence = [];
    
    for (const key of keys) {
        const kLower = key.toLowerCase();
        if (kLower === 'alt') modifiers |= 1;
        else if (kLower === 'control' || kLower === 'ctrl') modifiers |= 2;
        else if (kLower === 'meta' || kLower === 'command' || kLower === 'windows') modifiers |= 4;
        else if (kLower === 'shift') modifiers |= 8;
        else {
            keySequence.push(key);
        }
    }

    try {
        return await withDebugger(tabId, async (target) => {
            // For CDP, modifiers are a bitmask sent with EACH key event.
            // We just need to dispatch the actual non-modifier keys with the modifiers bitmask set.
            // But if the user ONLY asked to press a modifier (e.g. 'Shift'), keySequence will be empty.
            if (keySequence.length === 0) {
                // Just press the first modifier mentioned
                await cmdKeyPressCDP(tabId, keys[0], 0); 
            } else {
                for (const key of keySequence) {
                    const text = getCDPKeyText(key);
                    
                    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
                        type: text ? 'keyDown' : 'rawKeyDown',
                        key,
                        text,
                        unmodifiedText: text,
                        modifiers
                    });

                    if (text && key !== 'Enter' && key !== 'Tab') {
                        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
                            type: 'char',
                            key,
                            text,
                            unmodifiedText: text,
                            modifiers
                        });
                    }

                    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        key,
                        modifiers
                    });
                }
            }

            return {
                success: true,
                data: { keys: keysString, modifiers, method: 'cdp' }
            };
        });
    } catch (e) {
        return { success: false, error: `Key combo failed: ${e.message}` };
    }
}

// ==========================================
// Native JavaScript Dialogs (CDP)
// ==========================================

/**
 * Handle a native JavaScript dialog (alert, confirm, prompt, beforeunload) via CDP.
 *
 * @param {number} tabId - Target tab ID
 * @param {boolean} accept - True to accept/OK/Leave, False to dismiss/Cancel
 * @param {string|null} promptText - Optional text to enter into prompt dialog
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function cmdHandleDialog(tabId, accept = true, promptText = null) {
    if (!tabId) return { success: false, error: 'tabId required' };

    try {
        return await withDebugger(tabId, async (target) => {
            // Enable Page domain to access dialog control
            await chrome.debugger.sendCommand(target, 'Page.enable');

            const params = { accept: accept !== false };
            if (promptText !== undefined && promptText !== null) {
                params.promptText = promptText;
            }
            await chrome.debugger.sendCommand(target, 'Page.handleJavaScriptDialog', params);
            return {
                success: true,
                data: { accept: params.accept, promptText: params.promptText }
            };
        });
    } catch (e) {
        return { success: false, error: `Handle dialog failed: ${e.message}` };
    }
}


// ==========================================
// Cookies
// ==========================================


async function cmdGetCookies(url, tabId, storeId) {
    if (!url) {
        return { success: false, error: 'url required' };
    }
    const query = { url };
    let debugTab = null;
    if (storeId) {
        query.storeId = storeId;
    } else if (tabId) {
        const tab = await chrome.tabs.get(tabId);
        debugTab = tab;
        if (tab && tab.cookieStoreId) {
            query.storeId = tab.cookieStoreId;
        }
    }
    const cookies = await chrome.cookies.getAll(query);
    return {
        success: true,
        _debug_query: query,
        _debug_tab: debugTab,
        data: cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            expirationDate: c.expirationDate,
        }))
    };
}

async function cmdSetCookie(details) {
    if (!details || !details.url) {
        return { success: false, error: 'details with url required' };
    }
    if (details.tabId && !details.storeId) {
        const tab = await chrome.tabs.get(details.tabId);
        if (tab && tab.cookieStoreId) {
            details.storeId = tab.cookieStoreId;
        }
    }
    delete details.tabId; // chrome.cookies.set doesn't take tabId
    const cookie = await chrome.cookies.set(details);
    return { success: true, data: cookie };
}

async function cmdDeleteCookie(url, name, tabId, storeId) {
    if (!url || !name) {
        return { success: false, error: 'url and name required' };
    }
    const details = { url, name };
    if (storeId) {
        details.storeId = storeId;
    } else if (tabId) {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.cookieStoreId) {
            details.storeId = tab.cookieStoreId;
        }
    }
    await chrome.cookies.remove(details);
    return { success: true };
}

async function cmdListCookieStores() {
    const stores = await chrome.cookies.getAllCookieStores();
    return { success: true, data: stores };
}

// ==========================================
// ==========================================
// Script Execution in MAIN world (arbitrary JS)
// ==========================================

async function cmdExecuteScript(code, tabId, world) {
    try {
        if (!tabId) return { success: false, error: 'tabId required' };
        const targetId = tabId;
        // Default to MAIN world for backward compatibility.
        const targetWorld = (world === 'ISOLATED') ? 'ISOLATED' : 'MAIN';

        const results = await chrome.scripting.executeScript({
            target: { tabId: targetId },
            world: targetWorld,
            func: (codeStr) => {
                try {
                    // Try eval first — handles expressions like 'document.title', '2+2'
                    // If the code contains 'return', eval will throw SyntaxError,
                    // so we fall back to new Function() which supports return statements.
                    let result;
                    try {
                        result = (0, eval)(codeStr);
                    } catch (evalErr) {
                        if (evalErr instanceof SyntaxError && codeStr.includes('return')) {
                            const fn = new Function(codeStr);
                            result = fn();
                        } else {
                            throw evalErr;
                        }
                    }
                    // Handle non-serializable results
                    if (result instanceof HTMLElement) {
                        return {
                            tagName: result.tagName,
                            id: result.id,
                            className: result.className,
                            innerText: (result.innerText || '').substring(0, 1000),
                        };
                    }
                    if (result === undefined) return null;
                    if (typeof result === 'function') return '[function]';
                    return result;
                } catch (e) {
                    return { __error: true, message: e.message, stack: e.stack };
                }
            },
            args: [code],
        });

        if (results && results.length > 0) {
            const data = results[0].result;
            if (data && data.__error) {
                // If eval was blocked (Trusted Types or CSP), use script tag injection
                if (data.message && (data.message.includes('Trusted Type') || data.message.includes('unsafe-eval'))) {
                    return cmdExecuteScriptViaTag(code, targetId);
                }
                return { success: false, error: `JS Error: ${data.message}` };
            }
            return { success: true, data };
        }
        return { success: false, error: 'No result from script execution' };
    } catch (e) {
        return { success: false, error: `executeScript failed: ${e.message}` };
    }
}

// Fallback: inject a <script> tag into the page from the ISOLATED world.
// The ISOLATED world can create DOM elements freely (no Trusted Types apply
// to extension-injected content scripts), and the <script> tag runs in the
// MAIN world automatically. Result is passed back via a data attribute.
async function cmdExecuteScriptViaTag(code, tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'ISOLATED',
            func: (codeStr) => {
                return new Promise((resolve) => {
                    const resultId = '__stealth_result_' + Date.now();
                    // Wrap code to capture result and store on a temp element
                    const wrappedCode = `
                        try {
                            const __r = (function(){ return ${codeStr} })();
                            const __el = document.getElementById('${resultId}');
                            if (__el) __el.dataset.result = JSON.stringify(
                                __r === undefined ? null :
                                __r instanceof HTMLElement ? {tagName:__r.tagName, id:__r.id, className:__r.className, innerText:(__r.innerText||'').substring(0,1000)} :
                                typeof __r === 'function' ? '[function]' : __r
                            );
                        } catch(e) {
                            const __el = document.getElementById('${resultId}');
                            if (__el) __el.dataset.result = JSON.stringify({__error:true, message:e.message});
                        }
                    `;
                    // Create a hidden div to receive the result
                    const div = document.createElement('div');
                    div.id = resultId;
                    div.style.display = 'none';
                    document.documentElement.appendChild(div);

                    // Inject script tag (runs in MAIN world)
                    const script = document.createElement('script');
                    script.textContent = wrappedCode;
                    document.documentElement.appendChild(script);
                    script.remove();

                    // Read result synchronously (script runs sync)
                    const resultStr = div.dataset.result;
                    div.remove();

                    if (resultStr) {
                        try {
                            const parsed = JSON.parse(resultStr);
                            if (parsed && parsed.__error) {
                                resolve({ __error: true, message: parsed.message });
                            } else {
                                resolve(parsed);
                            }
                        } catch (e) {
                            resolve(resultStr);
                        }
                    } else {
                        resolve(null);
                    }
                });
            },
            args: [code],
        });

        if (results && results.length > 0) {
            const data = results[0].result;
            if (data && data.__error) {
                return { success: false, error: `JS Error: ${data.message}` };
            }
            return { success: true, data };
        }
        return { success: false, error: 'No result from script tag execution' };
    } catch (e) {
        return { success: false, error: `executeScript (tag fallback) failed: ${e.message}` };
    }
}

// ==========================================
// Frame Enumeration (cross-frame support)
// ==========================================

/**
 * List all frames in a tab — discovers <frame>, <iframe>, and frameset content.
 * Returns { frameIndex, url, title, hasBody } for each frame.
 */
async function cmdListFrames(tabId) {
    try {
        if (!tabId) return { success: false, error: 'tabId required' };
        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            world: 'MAIN',
            func: () => ({
                url: location.href,
                title: document.title || '',
                hasBody: !!document.body,
                tagName: document.documentElement?.tagName || '',
                isFrameset: !!document.querySelector('frameset'),
                elementCount: document.querySelectorAll('*').length,
            }),
        });
        if (!results || results.length === 0) {
            return { success: false, error: 'No frames found (page may not be loaded)' };
        }
        return {
            success: true,
            data: {
                frameCount: results.length,
                frames: results.map((r, i) => ({
                    frameIndex: i,
                    frameId: r.frameId ?? null,
                    ...r.result,
                })),
            },
        };
    } catch (e) {
        return { success: false, error: `listFrames failed: ${e.message}` };
    }
}

/**
 * Execute JavaScript in ALL frames of a tab.
 * Returns results from every frame — useful for finding content in
 * framesets, cross-origin iframes, or embedded widgets.
 */
async function cmdExecuteScriptAllFrames(code, tabId, world) {
    try {
        if (!tabId) return { success: false, error: 'tabId required' };
        const targetWorld = (world === 'ISOLATED') ? 'ISOLATED' : 'MAIN';

        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            world: targetWorld,
            func: (codeStr) => {
                try {
                    let result;
                    try {
                        result = (0, eval)(codeStr);
                    } catch (evalErr) {
                        if (evalErr instanceof SyntaxError && codeStr.includes('return')) {
                            const fn = new Function(codeStr);
                            result = fn();
                        } else {
                            throw evalErr;
                        }
                    }
                    if (result instanceof HTMLElement) {
                        return {
                            tagName: result.tagName,
                            id: result.id,
                            className: result.className,
                            innerText: (result.innerText || '').substring(0, 1000),
                        };
                    }
                    if (result === undefined) return null;
                    if (typeof result === 'function') return '[function]';
                    return result;
                } catch (e) {
                    return { __error: true, message: e.message };
                }
            },
            args: [code],
        });

        if (!results || results.length === 0) {
            return { success: false, error: 'No results from any frame' };
        }

        // Check if ANY frame hit Trusted Types — if so, retry ALL frames via
        // script tag injection (ISOLATED world → <script> tag → MAIN world).
        // This matches the fallback in cmdExecuteScript → cmdExecuteScriptViaTag.
        const hasTrustedTypeError = results.some(r =>
            r.result && r.result.__error &&
            r.result.message && (r.result.message.includes('Trusted Type') ||
                                  r.result.message.includes('unsafe-eval'))
        );

        if (hasTrustedTypeError && targetWorld === 'MAIN') {
            return await cmdExecuteScriptAllFramesViaTag(code, tabId);
        }

        return {
            success: true,
            data: {
                frameCount: results.length,
                results: results.map((r, i) => ({
                    frameIndex: i,
                    frameId: r.frameId ?? null,
                    result: r.result,
                })),
            },
        };
    } catch (e) {
        return { success: false, error: `executeScriptAllFrames failed: ${e.message}` };
    }
}

/**
 * Fallback for executeScriptAllFrames on pages with Trusted Types (e.g., Gmail).
 * Injects a <script> tag from the ISOLATED world into each frame, which runs
 * in the MAIN world automatically — bypassing Trusted Types restrictions.
 */
async function cmdExecuteScriptAllFramesViaTag(code, tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            world: 'ISOLATED',
            func: (codeStr) => {
                return new Promise((resolve) => {
                    const resultId = '__stealth_result_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    const wrappedCode = `
                        try {
                            const __r = (function(){ return ${codeStr} })();
                            const __el = document.getElementById('${resultId}');
                            if (__el) __el.dataset.result = JSON.stringify(
                                __r === undefined ? null :
                                __r instanceof HTMLElement ? {tagName:__r.tagName, id:__r.id, className:__r.className, innerText:(__r.innerText||'').substring(0,1000)} :
                                typeof __r === 'function' ? '[function]' : __r
                            );
                        } catch(e) {
                            const __el = document.getElementById('${resultId}');
                            if (__el) __el.dataset.result = JSON.stringify({__error:true, message:e.message});
                        }
                    `;

                    const div = document.createElement('div');
                    div.id = resultId;
                    div.style.display = 'none';
                    document.documentElement.appendChild(div);

                    const script = document.createElement('script');
                    script.textContent = wrappedCode;
                    document.documentElement.appendChild(script);
                    script.remove();

                    const resultStr = div.dataset.result;
                    div.remove();

                    if (resultStr) {
                        try {
                            const parsed = JSON.parse(resultStr);
                            resolve(parsed);
                        } catch (e) {
                            resolve(resultStr);
                        }
                    } else {
                        resolve(null);
                    }
                });
            },
            args: [code],
        });

        if (!results || results.length === 0) {
            return { success: false, error: 'No results from any frame (tag fallback)' };
        }

        return {
            success: true,
            data: {
                frameCount: results.length,
                results: results.map((r, i) => ({
                    frameIndex: i,
                    frameId: r.frameId ?? null,
                    result: r.result,
                })),
            },
        };
    } catch (e) {
        return { success: false, error: `executeScriptAllFrames (tag fallback) failed: ${e.message}` };
    }
}

// ==========================================
// Wait For Condition
// ==========================================

async function cmdWaitForCondition(tabId, codeStr, timeoutMs = 10000) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (code, timeout) => {
                return new Promise((resolve) => {
                    let checkFn;
                    try {
                        // In MAIN world, we just evaluate the function.
                        // If the page has unsafe-eval CSP, this might fail, but declarativeNetRequest
                        // strips CSP headers, so it usually succeeds.
                        checkFn = new Function(`return (function() { ${code} })();`);
                    } catch (e) {
                        resolve({ success: false, error: `Failed to compile condition: ${e.message}` });
                        return;
                    }

                    const check = () => {
                        try { return checkFn(); } catch (e) { return false; }
                    };

                    const initial = check();
                    if (initial) {
                        resolve({ success: true, data: initial });
                        return;
                    }

                    const observer = new MutationObserver(() => {
                        const res = check();
                        if (res) {
                            observer.disconnect();
                            clearTimeout(timer);
                            resolve({ success: true, data: res });
                        }
                    });
                    
                    observer.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, characterData: true });

                    const timer = setTimeout(() => {
                        observer.disconnect();
                        resolve({ success: false, error: "Timeout waiting for condition" });
                    }, timeout);
                });
            },
            args: [codeStr, timeoutMs]
        });

        if (!results || results.length === 0) {
            return { success: false, error: 'Failed to execute condition in page.' };
        }
        return results[0].result;
    } catch (e) {
        return { success: false, error: `waitForCondition failed: ${e.message}` };
    }
}

// ==========================================
// Window Management
// ==========================================

async function cmdNewWindow(url) {
    try {
        const createOpts = {};
        if (url) createOpts.url = url;
        const win = await chrome.windows.create(createOpts);
        return {
            success: true,
            data: {
                windowId: win.id,
                type: win.type,
                incognito: win.incognito,
                tabs: win.tabs ? win.tabs.map(t => ({ id: t.id, url: t.url || url || 'about:blank' })) : [],
            },
        };
    } catch (e) {
        return { success: false, error: `newWindow failed: ${e.message}` };
    }
}

async function cmdNewIncognitoWindow(url) {
    try {
        const createOpts = { incognito: true };
        if (url) createOpts.url = url;
        const win = await chrome.windows.create(createOpts);
        return {
            success: true,
            data: {
                windowId: win.id,
                type: win.type,
                incognito: win.incognito,
                tabs: win.tabs ? win.tabs.map(t => ({ id: t.id, url: t.url || url || 'about:blank' })) : [],
            },
        };
    } catch (e) {
        return { success: false, error: `newIncognitoWindow failed: ${e.message}` };
    }
}


async function cmdCloseWindow(windowId) {
    try {
        await chrome.windows.remove(windowId);
        return { success: true };
    } catch (e) {
        return { success: false, error: `closeWindow failed: ${e.message}` };
    }
}

async function cmdResizeWindow(windowId, width, height, left, top, state) {
    try {
        const updateInfo = {};
        if (width) updateInfo.width = width;
        if (height) updateInfo.height = height;
        if (left !== undefined) updateInfo.left = left;
        if (top !== undefined) updateInfo.top = top;
        if (state) updateInfo.state = state;
        const win = await chrome.windows.update(windowId, updateInfo);
        return {
            success: true,
            data: { width: win.width, height: win.height, left: win.left, top: win.top, state: win.state },
        };
    } catch (e) {
        return { success: false, error: `resizeWindow failed: ${e.message}` };
    }
}

async function cmdInsertTextCDP(tabId, text, selector, frameId) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (text === undefined) return { success: false, error: 'text required' };

    try {
        if (selector) {
            // Forward to content script to focus the element first
            const focusResult = await bridgeForwardToContentScript({
                action: 'focus',
                tabId,
                frameId,
                selector
            });
            if (!focusResult.success) {
                return focusResult; // Return the error if focus fails
            }
        }

        return await withDebugger(tabId, async (target) => {
            await chrome.debugger.sendCommand(target, 'Input.insertText', { text });
            return { success: true };
        });
    } catch (e) {
        return { success: false, error: `CDP paste failed: ${e.message}` };
    }
}

/**
 * CDP set file input files: natively set files on an input[type=file] element.
 * Produces isTrusted: true events.
 */
async function cmdSetFileInputFilesCDP(tabId, selector, files) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (!selector) return { success: false, error: 'selector required' };
    if (!files || !Array.isArray(files)) return { success: false, error: 'files (array of absolute paths) required' };

    try {
        return await withDebugger(tabId, async (target) => {
            // 1. Get the root document node
            const { root } = await chrome.debugger.sendCommand(target, 'DOM.getDocument');
            
            // 2. Query the selector to get its nodeId
            const { nodeId } = await chrome.debugger.sendCommand(target, 'DOM.querySelector', {
                nodeId: root.nodeId,
                selector: selector
            });

            if (!nodeId) {
                return { success: false, error: `Element not found for selector: ${selector}` };
            }

            // 3. Set the files (absolute paths)
            await chrome.debugger.sendCommand(target, 'DOM.setFileInputFiles', {
                nodeId: nodeId,
                files: files
            });

            return { success: true, data: { nodeId, files, method: 'cdp' } };
        });
    } catch (e) {
        return { success: false, error: `CDP set files failed: ${e.message}` };
    }
}

// ==========================================
// URL Waiting
// ==========================================

/**
 * Wait for a tab's URL to match a pattern.
 * Uses chrome.tabs.onUpdated for reliable SPA navigation detection.
 * Also checks the current URL immediately in case it already matches.
 *
 * @param {number} tabId  - Target tab ID
 * @param {string} pattern - String substring OR /regex/ pattern (e.g., '/checkout/')
 * @param {number} timeout - Max wait in milliseconds (default 10000)
 */
async function cmdWaitForUrl(tabId, pattern, timeout = 10000) {
    if (!tabId) return { success: false, error: 'tabId required' };
    if (!pattern) return { success: false, error: 'pattern required' };

    function urlMatches(url) {
        if (!url) return false;
        // Regex pattern: surrounded by /
        if (typeof pattern === 'string' && pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
            try {
                const lastSlash = pattern.lastIndexOf('/');
                const flags = pattern.slice(lastSlash + 1);
                const body = pattern.slice(1, lastSlash);
                return new RegExp(body, flags).test(url);
            } catch (e) {
                // Fall through to substring match
            }
        }
        return url.includes(String(pattern));
    }

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve({ success: false, error: `Timeout (${timeout}ms) waiting for URL matching: ${pattern}` });
        }, timeout);

        function listener(updatedTabId, changeInfo, tab) {
            if (updatedTabId !== tabId) return;
            const url = changeInfo.url || tab.url || '';
            if (urlMatches(url)) {
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve({ success: true, data: { url } });
            }
        }

        chrome.tabs.onUpdated.addListener(listener);

        // Check current URL immediately (in case it already matches)
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) return;
            if (tab && urlMatches(tab.url)) {
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve({ success: true, data: { url: tab.url } });
            }
        });
    });
}

// ==========================================
// Helpers
// ==========================================

// All commands require an explicit tabId for reliable multi-window, multi-browser targeting.
// Use browser_list_tabs() to discover tab virtualIds.

// ==========================================
// Tab Memory Saver & Resource Governor (#37)
// ==========================================

const GOVERNOR_STORAGE_KEY = 'stealthdom_tab_governor';

const DEFAULT_GOVERNOR_CONFIG = {
    enabled: true,
    maxActiveTabs: 3,
    inactivityTimeoutMinutes: 5,
    sleepMinimizedWindows: true,
    protectPinnedTabs: true,
    protectAudioTabs: false,
    autoWakeForAgent: true,
    whitelistDomains: [],
};

let _governorConfig = { ...DEFAULT_GOVERNOR_CONFIG };
const _tabLastAccessed = new Map();       // tabId -> timestamp (ms)
const _tabLastAgentActivity = new Map();  // tabId -> timestamp (ms)
const _discardedTabAliasMap = new Map();  // oldTabId -> newTabId
const _minimizedParkedWindows = new Map(); // windowId -> { blankTabId, parkedTabId, originalTitle }
let _governorSweepInFlight = false;

function resolveDiscardedTabAlias(tabId) {
    let curr = Number(tabId);
    let hops = 0;
    while (_discardedTabAliasMap.has(curr) && hops < 10) {
        const next = _discardedTabAliasMap.get(curr);
        if (!next || next === curr) break;
        curr = next;
        hops++;
    }
    return curr;
}

function markTabActivity(tabId, isAgent = false) {
    const id = Number(tabId);
    if (!Number.isFinite(id)) return;
    const now = Date.now();
    _tabLastAccessed.set(id, now);
    if (isAgent) {
        _tabLastAgentActivity.set(id, now);
    }
}

function getTabLastAccessedMs(tab) {
    if (_tabLastAccessed.has(tab.id)) {
        return _tabLastAccessed.get(tab.id);
    }
    const ts = typeof tab.lastAccessed === 'number' && tab.lastAccessed > 0
        ? tab.lastAccessed
        : Date.now();
    _tabLastAccessed.set(tab.id, ts);
    return ts;
}

function isParkedPlaceholderTab(tab) {
    if (!tab || !tab.url) return false;
    const prefix = chrome.runtime.getURL('parked.html');
    return tab.url.startsWith(prefix);
}

function isTabWhitelisted(url, whitelistDomains) {
    if (!url || !Array.isArray(whitelistDomains) || whitelistDomains.length === 0) {
        return false;
    }
    const lowerUrl = url.toLowerCase();
    let hostname = '';
    try {
        hostname = new URL(url).hostname.toLowerCase();
    } catch {
        hostname = '';
    }
    for (const rawPattern of whitelistDomains) {
        const pattern = String(rawPattern || '').trim().toLowerCase();
        if (!pattern) continue;
        if (hostname && (hostname === pattern || hostname.endsWith('.' + pattern))) {
            return true;
        }
        if (lowerUrl.includes(pattern)) {
            return true;
        }
    }
    return false;
}

function isProtectedFromGovernor(tab, cfg, windowStates, focusedWindowId) {
    if (!tab || !tab.id || tab.discarded) return true;
    if (isParkedPlaceholderTab(tab)) return true;

    const url = tab.url || '';
    if (
        !url ||
        url === 'about:blank' ||
        url.startsWith('chrome://') ||
        url.startsWith('brave://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('devtools://') ||
        url.startsWith('edge://')
    ) {
        return true;
    }

    const winState = windowStates[tab.windowId] || 'normal';

    // Never discard the active tab in a non-minimized window
    if (tab.active && winState !== 'minimized') {
        return true;
    }

    // Only discard active tabs in minimized windows when sleepMinimizedWindows is enabled
    if (tab.active && winState === 'minimized' && !cfg.sleepMinimizedWindows) {
        return true;
    }

    // Never discard the active tab in the currently focused window
    if (tab.active && tab.windowId === focusedWindowId && winState !== 'minimized') {
        return true;
    }

    if (cfg.protectPinnedTabs && tab.pinned) return true;
    if (cfg.protectAudioTabs && tab.audible) return true;

    // Protect tabs touched by an AI agent MCP command within the last 60 seconds
    const lastAgent = _tabLastAgentActivity.get(tab.id) || 0;
    if (Date.now() - lastAgent < 60000) {
        return true;
    }

    if (isTabWhitelisted(url, cfg.whitelistDomains)) {
        return true;
    }

    return false;
}

async function discardTabWithAliasTracking(tabId) {
    const id = Number(tabId);
    if (_attachedDebuggers.has(id)) {
        await detachDebugger(id);
    }
    _injectedTabs.delete(id);

    const discardedTab = await chrome.tabs.discard(id);
    if (discardedTab && discardedTab.id && discardedTab.id !== id) {
        _discardedTabAliasMap.set(id, discardedTab.id);
        const prevAccess = _tabLastAccessed.get(id) || Date.now();
        _tabLastAccessed.set(discardedTab.id, prevAccess);
        _tabLastAccessed.delete(id);

        for (const [winId, info] of _minimizedParkedWindows.entries()) {
            if (info.parkedTabId === id) {
                info.parkedTabId = discardedTab.id;
                _minimizedParkedWindows.set(winId, info);
            }
        }
    }
    return discardedTab;
}

async function parkAndDiscardMinimizedWindowTab(tab) {
    const win = await chrome.windows.get(tab.windowId).catch(() => null);
    if (!win || win.state !== 'minimized') {
        return null;
    }

    const existing = _minimizedParkedWindows.get(tab.windowId);
    if (existing) {
        const existingBlank = await chrome.tabs.get(existing.blankTabId).catch(() => null);
        if (existingBlank) {
            await chrome.tabs.update(existing.blankTabId, { active: true }).catch(() => {});
            const discarded = await discardTabWithAliasTracking(tab.id);
            if (discarded && discarded.id) {
                existing.parkedTabId = discarded.id;
                _minimizedParkedWindows.set(tab.windowId, existing);
            }
            return discarded;
        }
        _minimizedParkedWindows.delete(tab.windowId);
    }

    const origTitle = tab.title || tab.url || 'Sleeping Window';
    const parkedUrl =
        chrome.runtime.getURL('parked.html') +
        `?windowId=${encodeURIComponent(tab.windowId)}` +
        `&tabId=${encodeURIComponent(tab.id)}` +
        `&title=${encodeURIComponent(origTitle)}`;

    // Create with active: false first so Chromium NavigateParams uses NO_ACTION
    // instead of SHOW_WINDOW (which would un-minimize a minimized window on Windows),
    // then activate via chrome.tabs.update.
    const blankTab = await chrome.tabs.create({
        windowId: tab.windowId,
        url: parkedUrl,
        active: false,
        index: tab.index + 1,
    });
    await chrome.tabs.update(blankTab.id, { active: true });
    const winCheck = await chrome.windows.get(tab.windowId).catch(() => null);
    if (winCheck && winCheck.state !== 'minimized') {
        await chrome.windows.update(tab.windowId, { state: 'minimized' }).catch(() => {});
    }

    _minimizedParkedWindows.set(tab.windowId, {
        blankTabId: blankTab.id,
        parkedTabId: tab.id,
        originalTitle: origTitle,
    });

    try {
        const discardedTab = await discardTabWithAliasTracking(tab.id);
        if (discardedTab && discardedTab.id) {
            _minimizedParkedWindows.set(tab.windowId, {
                blankTabId: blankTab.id,
                parkedTabId: discardedTab.id,
                originalTitle: origTitle,
            });
        }
        return discardedTab;
    } catch (err) {
        // Clean up placeholder tab if discard failed
        _minimizedParkedWindows.delete(tab.windowId);
        await chrome.tabs.remove(blankTab.id).catch(() => {});
        throw err;
    }
}

async function restoreParkedMinimizedWindow(windowId, parkedTabId, senderBlankTabId) {
    const winId = Number(windowId);
    const info = _minimizedParkedWindows.get(winId);
    const rawTargetId = parkedTabId || (info && info.parkedTabId);
    const targetTabId = rawTargetId ? resolveDiscardedTabAlias(Number(rawTargetId)) : null;
    const blankTabId = Number(senderBlankTabId || (info && info.blankTabId)) || null;

    if (winId) {
        _minimizedParkedWindows.delete(winId);
    }

    if (targetTabId) {
        await chrome.tabs.update(targetTabId, { active: true }).catch(() => {});
        markTabActivity(targetTabId, false);
    }
    if (blankTabId) {
        await chrome.tabs.remove(blankTabId).catch(() => {});
    }
    return { ok: true, restoredTabId: targetTabId };
}

async function ensureTabAwakeForAgent(tabId) {
    let resolvedId = resolveDiscardedTabAlias(Number(tabId));
    let tab = await chrome.tabs.get(resolvedId).catch(() => null);
    if (!tab) return;

    // If this tab's window was parked with parked.html, remove the placeholder and re-activate the real tab
    if (_minimizedParkedWindows.has(tab.windowId)) {
        const info = _minimizedParkedWindows.get(tab.windowId);
        await restoreParkedMinimizedWindow(tab.windowId, resolvedId, info ? info.blankTabId : null);
        resolvedId = resolveDiscardedTabAlias(resolvedId);
        tab = await chrome.tabs.get(resolvedId).catch(() => null);
        if (!tab) return;
    }

    if (!tab.discarded && tab.status === 'complete') {
        return;
    }

    if (tab.discarded) {
        await chrome.tabs.reload(resolvedId).catch(() => {});
    }

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        const current = await chrome.tabs.get(resolvedId).catch(() => null);
        if (!current) return;
        if (!current.discarded && current.status === 'complete') {
            return;
        }
        await new Promise(r => setTimeout(r, 150));
    }
}

async function computeGovernorStats() {
    const tabs = await chrome.tabs.query({});
    let loadedCount = 0;
    let sleepingCount = 0;
    for (const t of tabs) {
        if (isParkedPlaceholderTab(t)) continue;
        if (t.discarded) {
            sleepingCount++;
        } else {
            loadedCount++;
        }
    }
    return {
        loadedCount,
        sleepingCount,
        parkedWindowsCount: _minimizedParkedWindows.size,
    };
}

async function getGovernorStateAndStats() {
    const stats = await computeGovernorStats();
    return {
        ok: true,
        config: _governorConfig,
        stats,
    };
}

async function setGovernorConfig(newConfig) {
    _governorConfig = {
        ...DEFAULT_GOVERNOR_CONFIG,
        ...(newConfig || {}),
    };
    await chrome.storage.local.set({ [GOVERNOR_STORAGE_KEY]: _governorConfig });
    if (_governorConfig.enabled) {
        await runTabGovernorSweep(false);
    }
    const stats = await computeGovernorStats();
    return {
        ok: true,
        config: _governorConfig,
        stats,
    };
}

async function sleepAllInactiveTabsNow() {
    const sleptCount = await runTabGovernorSweep(true);
    const stats = await computeGovernorStats();
    return {
        ok: true,
        sleptCount,
        stats,
    };
}

async function runTabGovernorSweep(forceSleepAllInactive = false) {
    if (_governorSweepInFlight) return 0;
    _governorSweepInFlight = true;
    let sleptCount = 0;

    try {
        const windows = await chrome.windows.getAll();
        const windowStates = {};
        let focusedWindowId = null;

        for (const w of windows) {
            windowStates[w.id] = w.state || 'normal';
            if (w.focused && w.state !== 'minimized') {
                focusedWindowId = w.id;
            }
            // Auto-restore any parked window that is no longer minimized
            if (w.state !== 'minimized' && _minimizedParkedWindows.has(w.id)) {
                const info = _minimizedParkedWindows.get(w.id);
                await restoreParkedMinimizedWindow(w.id, info.parkedTabId, info.blankTabId);
            }
        }

        if (!_governorConfig.enabled && !forceSleepAllInactive) {
            return 0;
        }

        const allTabs = await chrome.tabs.query({});
        const now = Date.now();
        const timeoutMs =
            _governorConfig.inactivityTimeoutMinutes > 0
                ? _governorConfig.inactivityTimeoutMinutes * 60 * 1000
                : 0;

        // Count non-sleepable visible active tabs (e.g. active tabs in non-minimized windows)
        let lockedActiveCount = 0;
        const candidates = [];

        for (const t of allTabs) {
            if (isParkedPlaceholderTab(t) || t.discarded) continue;

            if (isProtectedFromGovernor(t, _governorConfig, windowStates, focusedWindowId)) {
                lockedActiveCount++;
                continue;
            }
            candidates.push(t);
        }

        // Sort candidates most-recently-accessed first
        candidates.sort((a, b) => getTabLastAccessedMs(b) - getTabLastAccessedMs(a));

        const maxAllowedTotal = Number(_governorConfig.maxActiveTabs) || 0;
        const allowedCandidateKeep =
            maxAllowedTotal > 0 ? Math.max(0, maxAllowedTotal - lockedActiveCount) : Infinity;

        for (let idx = 0; idx < candidates.length; idx++) {
            const tab = candidates[idx];
            const lastAccess = getTabLastAccessedMs(tab);
            const idleMs = now - lastAccess;

            const exceedsCap = maxAllowedTotal > 0 && idx >= allowedCandidateKeep;
            const exceedsTimeout = timeoutMs > 0 && idleMs >= timeoutMs;

            if (forceSleepAllInactive || exceedsCap || exceedsTimeout) {
                try {
                    const winState = windowStates[tab.windowId] || 'normal';
                    if (tab.active && winState === 'minimized') {
                        const res = await parkAndDiscardMinimizedWindowTab(tab);
                        if (res) sleptCount++;
                    } else if (!tab.active) {
                        const res = await discardTabWithAliasTracking(tab.id);
                        if (res) sleptCount++;
                    }
                } catch (err) {
                    console.warn(`[StealthDOM Governor] Could not sleep tab ${tab.id}:`, err.message);
                }
            }
        }
    } catch (err) {
        console.warn('[StealthDOM Governor] Sweep error:', err.message);
    } finally {
        _governorSweepInFlight = false;
    }

    return sleptCount;
}

// Track tab activations and clean up parked placeholders if user switches tabs manually
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    markTabActivity(tabId, false);
    if (_minimizedParkedWindows.has(windowId)) {
        const info = _minimizedParkedWindows.get(windowId);
        if (info && tabId !== info.blankTabId) {
            _minimizedParkedWindows.delete(windowId);
            await chrome.tabs.remove(info.blankTabId).catch(() => {});
        }
    }
    if (_governorConfig.enabled && _governorConfig.maxActiveTabs > 0) {
        setTimeout(() => runTabGovernorSweep(false), 600);
    }
});

chrome.tabs.onCreated.addListener((tab) => {
    if (tab && tab.id && !isParkedPlaceholderTab(tab)) {
        markTabActivity(tab.id, false);
        if (_governorConfig.enabled && _governorConfig.maxActiveTabs > 0) {
            setTimeout(() => runTabGovernorSweep(false), 1200);
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    _tabLastAccessed.delete(tabId);
    _tabLastAgentActivity.delete(tabId);
    for (const [winId, info] of _minimizedParkedWindows.entries()) {
        if (info.blankTabId === tabId || info.parkedTabId === tabId) {
            _minimizedParkedWindows.delete(winId);
        }
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    if (_minimizedParkedWindows.has(windowId)) {
        const win = await chrome.windows.get(windowId).catch(() => null);
        if (win && win.state !== 'minimized') {
            const info = _minimizedParkedWindows.get(windowId);
            await restoreParkedMinimizedWindow(windowId, info.parkedTabId, info.blankTabId);
        }
    }
});

// Initialize Governor config and clean up any orphaned parked.html tabs from prior session
(async function initTabGovernor() {
    try {
        const stored = await chrome.storage.local.get([GOVERNOR_STORAGE_KEY]);
        if (stored && stored[GOVERNOR_STORAGE_KEY]) {
            _governorConfig = {
                ...DEFAULT_GOVERNOR_CONFIG,
                ...stored[GOVERNOR_STORAGE_KEY],
            };
        } else {
            await chrome.storage.local.set({ [GOVERNOR_STORAGE_KEY]: _governorConfig });
        }

        // Clean up any leftover parked.html placeholder tabs from before service worker reload
        const allTabs = await chrome.tabs.query({});
        for (const t of allTabs) {
            if (isParkedPlaceholderTab(t)) {
                try {
                    const u = new URL(t.url);
                    const origTabId = Number(u.searchParams.get('tabId'));
                    if (origTabId) {
                        await chrome.tabs.update(origTabId, { active: true }).catch(() => {});
                    }
                    if (u.searchParams.get('reloadExtension') === '1') {
                        await chrome.windows.update(t.windowId, { state: 'minimized' }).catch(() => {});
                    }
                } catch {}
                await chrome.tabs.remove(t.id).catch(() => {});
            } else if (!t.discarded) {
                getTabLastAccessedMs(t);
            }
        }
    } catch (err) {
        console.warn('[StealthDOM Governor] Init error:', err.message);
    }
})();

// Periodic sweep every 15 seconds
setInterval(() => {
    if (_governorConfig.enabled) {
        runTabGovernorSweep(false);
    }
}, 15000);

console.log('[StealthDOM] Service worker started (bridge mode + tab governor)');
