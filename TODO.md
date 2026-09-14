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
- [x] **Handle Native JavaScript Dialogs (`browser_handle_dialog`)** ✅ Implemented
  - **Description**: Add a new tool to natively accept or dismiss `window.alert`, `window.confirm`, or `window.prompt` dialogs from the background service worker using CDP.
  - **Purpose**: Prevents blocked content scripts caused by main thread blocking from native dialogs.
  - **Implementation Status**: See [Implementation Details](#handle-native-javascript-dialogs-completed) below.
- [ ] **Tab Discarding (`browser_discard_tab`)**
  - **Description**: Add a new background command `chrome.tabs.discard(tabId)` to forcefully put a tab into Memory Saver (sleeping) mode.
  - **Purpose**: Allows developers to write test cases that explicitly test an agent's ability to handle and recover from discarded tabs.
- [x] **CDP-based Native Mouse Interactions (`browser_mouse_*`)** ✅ Implemented
  - **Description**: Exposed a suite of 6 MCP tools using `chrome.debugger` + `Input.dispatchMouseEvent` for native, system-level mouse interactions with `isTrusted: true` events.

## General Roadmap
- [ ] Improve documentation for multi-browser routing.
- [ ] Add more examples for complex DOM interactions (Shadow DOM support).
- [ ] Implement a "Stealth Check" diagnostic tool to verify the extension is correctly bypassing common detection scripts.
- [ ] **Advanced Request Interception & Mocking**:
    - [ ] Implement `regexFilter` support via `declarativeNetRequest` for surgical targeting.
    - [ ] Create a "Mock Redirect" local handler to bypass MV3 body-replacement restrictions.
    - [ ] **Use Cases**: Anti-Telemetry Cloak (block `/log` pings), API Hijacking (injecting data into JSON responses), and Credential Shielding (blocking unauthorized secret transmission).

## Enterprise Web App & Cloud Console Interaction Enhancements
> [!NOTE]
> Based on field testing with Oracle Cloud Infrastructure, Google Cloud, and embedded xterm.js terminals. See detailed spec in `docs/05_enterprise_interaction_enhancements.md`.

- [ ] **Transparent Iframe / Nested Context Traversal**: Automatically traverse child iframes in `browser_query`, `browser_click`, `browser_type`, `browser_get_text`, and `browser_fill` without requiring manual JS traversal.
- [ ] **Terminal & Code Editor Input Mode**: Add `mode="paste"` / `mode="cdp_raw"` to `browser_type` / `browser_fill` (or dedicated `browser_terminal_send`) to seamlessly type/paste into xterm.js, Monaco, and canvas components via synthetic `ClipboardEvent` and CDP `Input.insertText`.
- [ ] **Automatic Shadow DOM Piercing**: Support recursive `#shadow-root` traversal for enterprise web components in all selector queries.
- [ ] **2-Tier Resilient Click Strategy**: In `browser_click`, auto-scroll target into view, attempt CDP coordinate click, and fallback to DOM `.click()` if obscured by overlays or notification banners.
- [ ] **Single-Roundtrip Action Verification**: Add optional `screenshot_after=True` parameter to interaction tools to eliminate separate `browser_screenshot` roundtrips for vision models.

## Architectural Ideas
- [ ] **JavaScript Render Composition Fallback (html2canvas)**
  - **Description**: If CDP `captureScreenshot` fails (e.g., because the browser is fully occluded or minimized), automatically inject a library like `html2canvas` into the content script to manually read the DOM tree and paint it onto an HTML5 `<canvas>`.
  - **Purpose**: Provides a highly resilient visual fallback for Vision-Language Models that works completely independently of the Chromium graphics compositor.
- [ ] **Built-in Proxy Support and Management**
  - **Description**: Add the ability to proxy requests through the StealthDOM node. Furthermore, implement an automated pipeline to fetch proxy lists from the internet, test/verify their connectivity, and maintain a never-ending, rotating pool of healthy proxies for the extension to use.
  - **Purpose**: Greatly enhances stealth capabilities by rotating IPs and prevents rate-limiting across large-scale automation tasks.

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
