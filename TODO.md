# StealthDOM TODO

## High Priority: Large Data Transfer Reliability
> [!NOTE]
> Based on real-world testing with Google SGE (research reports with large 1MB+ images), the current JSON/WebSocket pipe can hit payload limits and cause evaluation timeouts.

- [ ] **Native Response Streaming/Chunking**: Automatically split large `browser_evaluate` return values (e.g., > 512KB) into chunks at the extension level and reassemble them in the Python bridge.
- [ ] **Dedicated Asset Extraction API**: Implement `browser_extract_asset(selector)` to handle direct binary/base64 harvesting of images/files without manual user-side chunking.
- [ ] **Binary WebSocket Support**: Transition from JSON-wrapped Base64 (which adds 33% overhead) to raw binary frames for media assets.
- [ ] **Configurable Payload Limits**: Expose a `max_payload_size` setting in `bridge_server.py` and the extension manifest to allow larger one-shot transfers when safe.
- [ ] **Off-Pipe Transfer**: Implement a "staging" mechanism where massive assets (videos, 4K images) are saved to a temporary local directory or `indexedDB` and picked up by the bridge, bypassing the WebSocket pipe.
- [x] **Screenshot Tools: Make `save_path` Required, Remove Base64 Output**: In `browser_screenshot` and `browser_screenshot_full_page`, make the `save_path` parameter required instead of optional and remove the base64 data URL return path. AI agents skip optional parameters and cannot interpret raw base64 — this leads to wasted calls and incorrect conclusions about page state. The agent must provide the path since it's the only party that knows which directories it has read access to (IDE sandbox restrictions).

## God Mode Evolution (StealthDOM 2.0)
- [ ] **Implementation of [God Mode Manifesto](./docs/god_mode_manifesto.md)**
- [ ] **Batching Engine**: Implement `browser_execute_sequence` for zero-latency multi-step actions.
- [ ] **Active Sanitizer**: Implement `Debugger.scriptParsed` interception to neuter bot-detection logic at the runtime level.
- [ ] **Semantic Diffing**: Implement a diff-based observation tool to reduce context bloat for AI agents.
- [ ] **isTrusted Spoofing**: Research and implement the safest way to mask event trust status without triggering side-channel detection.

## New Features & Capabilities
- [ ] **Browser-Specific Tab Creation (`browser_new_tab` Target Routing)**
  - **Why this is needed**: Currently, `mcp_stealth_dom_browser_new_tab` does not accept a target `browser` or `window_id`. The bridge server simply routes requests to an active extension WebSocket. When multiple browsers (e.g., Edge and Brave) are running the StealthDOM extension concurrently, there is no reliable way to explicitly target new tab creation to a specific browser. This causes unpredictable behavior (e.g., attempting to open a tab in Brave, but it appears in Edge).
  - **Proposed Fix**: 
    1. Update `bridge_server.py` to recognize a direct `browser_label` parameter for routing, OR rely entirely on `window_id`.
    2. Modify the `mcp_stealth_dom_browser_new_tab` tool in `stealth_dom_mcp.py` to accept an optional `window_id` or `target_browser` parameter.
    3. Update `cmdNewTab` in `extension/background.js` to accept `windowId` and pass it to `chrome.tabs.create({url, windowId})` so the tab spawns in the exact window requested.
  - **Implementation Notes for AI Agents**: 
    - **Backwards Compatibility**: Make sure the new target parameter is optional. If omitted, fall back to the existing behavior or the primary active connection so existing workflows don't break.
    - **Routing Discovery**: `bridge_server.py`'s `_handle_control_command` *already* has logic to extract the routing label from a virtual `windowId` (e.g., `chrome:123`). If you expose `window_id` on the MCP tool, the bridge will automatically route it to the correct browser!
    - **Extension Update**: `cmdNewTab` in `background.js` currently ignores `windowId`. You MUST update it to accept `msg.windowId` and pass it to the `chrome.tabs.create` API.
    - **Label Routing Limitation**: If you decide to add `target_browser` (e.g., "brave") instead of `window_id`, be aware that `bridge_server.py` currently ONLY checks `tabId`, `windowId`, and `frameId` to resolve the `routing_label`. You will need to explicitly add `target_browser` to the routing logic there.
    - **Testing**: To verify this fix, you must test with at least two different Chromium-based browsers running concurrently (e.g., Brave and Edge) with the extension loaded, ensuring the `new_tab` command strictly isolates the targeted browser without cross-talk.
- [x] **Handle Native JavaScript Dialogs (`browser_handle_dialog`)** ✅ Implemented
  - **Description**: Add a new tool to natively accept or dismiss `window.alert`, `window.confirm`, or `window.prompt` dialogs from the background service worker using CDP.
  - **Purpose**: Prevents blocked content scripts caused by main thread blocking from native dialogs.
  - **Implementation Status**: See [Implementation Details](#handle-native-javascript-dialogs-completed) below.
- [ ] **Tab Discarding (`browser_discard_tab`)**
  - **Description**: Add a new background command `chrome.tabs.discard(tabId)` to forcefully put a tab into Memory Saver (sleeping) mode.
  - **Purpose**: Allows developers to write test cases that explicitly test an agent's ability to handle and recover from discarded tabs.
- [x] **CDP-based Native Mouse Interactions (`browser_mouse_*`)** ✅ Implemented
  - **Description**: Exposed a suite of 6 MCP tools using `chrome.debugger` + `Input.dispatchMouseEvent` for native, system-level mouse interactions with `isTrusted: true` events.
- [x] **CDP-based Native Keyboard Dispatch (`browser_key_press_cdp`, `browser_key_combo_cdp`)** ✅ Implemented
  - **Description**: Implement CDP `Input.dispatchKeyEvent` in `background.js` to dispatch `isTrusted: true` keyboard events (keyDown, keyUp, char) via `chrome.debugger`, mirroring the pattern established by the CDP mouse tools.
  - **Why this is needed**: StealthDOM currently has two input methods:
    1. **Content script** (`browser_press`, `browser_key_combo`): Uses CSS selectors, instant execution, but dispatches `isTrusted: false` events — detectable by anti-bot systems via `event.isTrusted` checks.
    2. **CDP** (`browser_mouse_click`, `browser_mouse_move`): Uses X,Y viewport coordinates, produces `isTrusted: true` events — indistinguishable from real user input. **This path exists for mouse but NOT for keyboard.**
  - **Stealth gap**: Login forms, payment flows, and CAPTCHA interactions commonly check `event.isTrusted` on `keydown`/`keyup` events. Without CDP keyboard dispatch, any typing into these fields is detectable.
  - **Implementation pattern**: Same `withDebugger()` + `chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', ...)` approach used by the mouse tools. The CDP key event types are `keyDown`, `keyUp`, and `char`.
  - **Discovered in**: [Stealth Audit Issue #2](tests/headless_audit/HEADLESS_THEORY.md#issue-2-istrusted-false-events-from-content-script-interactions)
- [ ] **StealthDOM: `setInputFiles` filename extension support**
  - **Ref:** `STEALTHDOM_REQUESTS.md` — ChatGPT request
  - ChatGPT's React frontend validates file extensions on `input[type="file"]` and silently rejects extensionless files. StealthDOM's `cmdSetInputFiles` in `content_script.js` hardcodes the filename as `'upload'` with no extension. This blocks multimodal upload investigation on ChatGPT (and potentially other platforms with strict frontend validation).
  - **Fix:** Accept an optional `filename` parameter in the `setInputFiles` action, or auto-derive the extension from the data URL's MIME type (`image/png` → `.png`). One-line change in `content_script.js` line 556: `new File([blob], filename || 'upload', ...)`.
- [ ] **StealthDOM: Bridge large payload transfer (>500KB)**
  - **Ref:** `STEALTHDOM_REQUESTS.md` — Google Search request
  - The bridge's message chain (`Python WS → bridge → extension WS → chrome.runtime.sendMessage → chrome.scripting.executeScript`) cannot handle payloads over ~500KB. Both `setInputFiles` with large data URLs and `evaluate` with chunked string concatenation time out. This limits image upload to compressed/resized images only.
  - **Fix options:** (1) Bridge-level chunked accumulation before forwarding. (2) Temporary local HTTP endpoint the content script can `fetch()` from. (3) CDP-based file injection via `chrome.debugger` + `DOM.setFileInputFiles`.
  - **Workaround in place:** Python-side JPEG compression keeps payloads under 400KB.

## General Roadmap
- [ ] Improve documentation for multi-browser routing.
- [ ] Add more examples for complex DOM interactions (Shadow DOM support).
- [ ] Implement a "Stealth Check" diagnostic tool to verify the extension is correctly bypassing common detection scripts.
- [ ] **Advanced Request Interception & Mocking**:
    - [ ] Implement `regexFilter` support via `declarativeNetRequest` for surgical targeting.
    - [ ] Create a "Mock Redirect" local handler to bypass MV3 body-replacement restrictions.
    - [ ] **Use Cases**: Anti-Telemetry Cloak (block `/log` pings), API Hijacking (injecting data into JSON responses), and Credential Shielding (blocking unauthorized secret transmission).

## Architectural Ideas
- [ ] **Network Interception & Asset Blocking**
  - **Why this is needed**: The single biggest bottleneck when automating heavy WebUIs (like ChatGPT or Grok) is the time it takes for the browser to render heavy UI elements, load analytics, and execute telemetry scripts. Less overhead equals faster page loads and DOM mutations.
  - **Proposed Fix**: Implement a CDP `Fetch.enable` or `Network.setRequestInterception` layer in StealthDOM. Instantly block all requests to known analytics domains, heavy fonts, or unnecessary media assets on target websites to significantly reduce CPU overhead and speed up the "Time to Interactive".
- [ ] **Native CDP Clipboard API (Instant Paste)**
  - **Why this is needed**: While `document.execCommand('insertText')` is incredibly fast for injecting large LLM prompts into rich-text editors, it is technically marked as deprecated in modern web standards. Simulating keystrokes natively via CDP is too slow for 10,000+ character prompts.
  - **Proposed Fix**: Expose a native clipboard API utilizing CDP. Set the system clipboard memory to the long prompt, and then trigger a native `Paste` command via `chrome.debugger`. This has the exact same 0ms speed profile as `execCommand` but is future-proofed against API deprecations.
- [ ] **DOM Mutation Observers for Generation State**
  - **Why this is needed**: Adapters currently use a `while True:` loop with a `time.sleep(1)` to poll the DOM and check if an AI has finished generating (e.g., waiting for a "Copy" button to appear). Polling introduces up to 1000ms of latency overhead per request.
  - **Proposed Fix**: Expose an `evaluate_async` wrapper in StealthDOM that uses a native JavaScript `MutationObserver`. The Python bridge would await a Promise that perfectly resolves the exact millisecond the target element renders, eliminating polling latency.
- [ ] **JavaScript Render Composition Fallback (html2canvas)**
  - **Description**: If CDP `captureScreenshot` fails (e.g., because the browser is fully occluded or minimized), automatically inject a library like `html2canvas` into the content script to manually read the DOM tree and paint it onto an HTML5 `<canvas>`.
  - **Purpose**: Provides a highly resilient visual fallback for Vision-Language Models that works completely independently of the Chromium graphics compositor.
- [ ] **Built-in Proxy Support and Management**
  - **Description**: Add the ability to proxy requests through the StealthDOM node. Furthermore, implement an automated pipeline to fetch proxy lists from the internet, test/verify their connectivity, and maintain a never-ending, rotating pool of healthy proxies for the extension to use.
  - **Purpose**: Greatly enhances stealth capabilities by rotating IPs and prevents rate-limiting across large-scale automation tasks.
- [ ] **Hierarchical Fully-Qualified Virtual IDs**
  - **Why this is needed**: Currently, StealthDOM virtualizes IDs by simply prefixing the browser label (e.g., `chrome:1234`). For AI agents, flat IDs provide zero topological context. An agent must cross-reference `listTabs` and other calls to figure out which window a tab or frame belongs to. This makes navigation and context retention difficult for LLMs.
  - **Proposed Fix**: Implement a fully qualified, hierarchical ID structure across all entities:
    - Window: `browser:windowId` (e.g. `chrome:987`)
    - Tab: `browser:windowId:tabId` (e.g. `chrome:987:1234`)
    - Frameset/Frame: `browser:windowId:tabId:frameId` (e.g. `chrome:987:1234:456.1`)
    By embedding the hierarchy directly into the ID, the AI agent instantly knows exactly where a target resides, and the Python bridge server can inherently derive the entire routing path without needing external lookups.
  - **Implementation Notes for AI Agents**:
    - **Parsing Logic**: The bridge server's `_parse_virtual_id` function will need a major overhaul. It must split by `:` and always extract the *last* segment as the native Chrome ID to send to the extension, while using the first segment (`browser`) for WebSocket routing.
    - **Moving Tabs Edge Case**: In Chrome, tabs can be moved between windows. The tab's native ID stays the same, but its parent window ID changes. Make sure that when generating these IDs (e.g., in `listTabs` or `listFrames`), the current parent window is fetched dynamically so the hierarchy returned to the AI is always accurate.
    - **Backwards Compatibility**: You will need to update every single `stealth_dom_mcp.py` tool to handle the new ID lengths, and ensure the UI/tests expecting `label:id` are updated to handle the multi-colon format.

## Implementation Details

### Handle Native JavaScript Dialogs (COMPLETED)

Currently, StealthDOM cannot dismiss native `window.alert`, `window.confirm`, or `window.prompt` dialogs because they block the main JavaScript thread, which also blocks content scripts.

We need to add a new `browser_handle_dialog` tool that uses the `chrome.debugger` API (CDP) to natively accept or dismiss these dialogs from the extension's background service worker.

#### 1. Modify `extension/background.js`
- Add `handleDialog` to the `bgActions` array.
- Add the following to the `switch(action)` block in `handleBackgroundCommand`:
```javascript
case 'handleDialog':
    return await cmdHandleDialog(msg.tabId, msg.accept, msg.promptText);
```
- Implement `cmdHandleDialog`:
```javascript
async function cmdHandleDialog(tabId, accept, promptText) {
    const target = { tabId };
    try {
        await chrome.debugger.attach(target, '1.3');
        const params = { accept };
        if (promptText !== undefined) {
            params.promptText = promptText;
        }
        await chrome.debugger.sendCommand(target, 'Page.handleJavaScriptDialog', params);
        await chrome.debugger.detach(target);
        return { success: true };
    } catch (e) {
        try { await chrome.debugger.detach(target); } catch (_) {}
        return { success: false, error: e.message };
    }
}
```

#### 2. Modify `stealth_dom_mcp.py`
- Add a new tool to expose this capability to the MCP server:
```python
@mcp.tool()
async def browser_handle_dialog(tab_id: int | str, accept: bool = True, prompt_text: str | None = None) -> str:
    """Accept or dismiss a native JavaScript dialog (alert, confirm, prompt).
    
    Args:
        tab_id: ID of the tab (get from browser_list_tabs)
        accept: True to accept (click OK), False to dismiss (click Cancel)
        prompt_text: Optional text to enter into a prompt dialog
    """
    result = await send_command("handleDialog", tabId=tab_id, accept=accept, promptText=prompt_text)
    if not result.get("success"):
        return f"Error: {result.get('error')}"
    return "Dialog handled successfully"
```

#### 3. Deployment
- Reload the extension in `chrome://extensions` to pick up the `background.js` changes.
- Restart the `bridge_server.py`.

## API & Tool Maintenance
- [x] **Redundancy Audit & Pruning** *(completed 2026-05-03)*: Pruned 8 tools (57→49): `browser_get_title`, `browser_get_url`, `browser_list_connections`, `browser_check`, `browser_uncheck`, `browser_forward`, `browser_list_windows`. Replacements documented in `stealth://capabilities` Tips section.
