# Enterprise Web App & Cloud Console Interaction Enhancements

## Overview & Field Learnings
During live automation of enterprise-grade cloud consoles (Oracle Cloud Infrastructure, Google Cloud, AWS Console) and embedded web terminals (xterm.js in Oracle Cloud Shell), several real-world friction points were observed. 

Modern enterprise single-page applications differ significantly from standard web pages:
1. Heavy reliance on **nested `<iframe>` hierarchies** for isolated tooling (e.g., embedded web terminals, billing portals).
2. Use of **canvas/WebSocket-driven terminal emulators** (xterm.js, Monaco editor) that do not use standard `<input value="...">` DOM data bindings.
3. Extensive use of **Shadow DOM (`#shadow-root`)** for web components.
4. **Sticky overlays and notification banners** (e.g., API error toasts) that can intercept CDP coordinate clicks.

This document outlines the proposed architectural enhancements to eliminate these friction points in StealthDOM.

---

## 1. Transparent Iframe & Nested Context Traversal

### Problem
Tools like `browser_query`, `browser_click`, and `browser_type` query the top-level `document` by default. When an element is inside an `<iframe>` (e.g., Oracle Cloud Shell running inside `iframe[title='Terminal']`), standard queries return "element not found". Agents currently must resort to custom JavaScript via `browser_evaluate` to manually traverse `iframe.contentDocument`.

### Proposed Enhancement
- **Recursive Iframe Resolution**: Update the core element selector in `content.js` to automatically and recursively search accessible child iframes if the selector is not found in the root document.
- **Explicit Frame Targeting**: Add an optional `frame_selector: Optional[str] = None` or `pierce_iframes: bool = True` parameter across `browser_query`, `browser_click`, `browser_type`, `browser_get_text`, and `browser_fill`.

```javascript
// Example helper for content script
function deepQuerySelector(selector, root = document) {
    let el = root.querySelector(selector);
    if (el) return el;
    
    const iframes = root.querySelectorAll('iframe');
    for (const ifr of iframes) {
        try {
            const subDoc = ifr.contentDocument || ifr.contentWindow.document;
            if (subDoc) {
                el = deepQuerySelector(selector, subDoc);
                if (el) return el;
            }
        } catch (e) {
            // Cross-origin iframe boundary
        }
    }
    return null;
}
```

---

## 2. Terminal & Code Editor Input Mode (xterm.js / Monaco)

### Problem
Web terminals (`xterm.js`) and modern code editors (`Monaco`, `CodeMirror`, `Ace`) do not update state when an agent sets `<textarea>.value = "..."`. They rely on:
1. Low-level clipboard `paste` events (`ClipboardEvent('paste')`).
2. CDP `Input.insertText` / `Input.dispatchKeyEvent`.
3. Direct WebSocket terminal streams.

### Proposed Enhancement
- **`browser_type` / `browser_fill` Modes**:
  Add a `mode: "auto" | "input" | "paste" | "cdp_raw"` argument:
  - `"paste"`: Creates a synthetic `ClipboardEvent` with `DataTransfer` text payload, enabling instant, multi-line script pasting into xterm / Cloud Shell without character dropping.
  - `"cdp_raw"`: Uses CDP `Input.dispatchKeyEvent` with proper keydown/keyup sequences for interactive prompts.
- **Dedicated MCP Tool `browser_terminal_send`**:
  ```python
  @mcp.tool()
  async def browser_terminal_send(
      tab_id: int | str,
      command: str,
      press_enter: bool = True,
      target_iframe: str | None = None
  ) -> str:
      """Send text or command directly to an embedded web terminal (xterm.js, Cloud Shell, Monaco)."""
  ```

---

## 3. Automatic Shadow DOM Piercing

### Problem
Custom web components encapsulate internal DOM trees in open/closed Shadow Roots (`element.shadowRoot`). Standard `querySelector` cannot penetrate `#shadow-root` barriers.

### Proposed Enhancement
- Integrate a Shadow DOM piercing selector engine (similar to Playwright's `pierce/` or `>>>` selector syntax) into `content.js`.
- Recursively traverse `.shadowRoot` trees during DOM discovery and querying.

---

## 4. 2-Tier Resilient Click Strategy

### Problem
Sticky headers, dynamic floating bars, and notification banners can intercept native CDP coordinate clicks if the target element is partially occluded or shifted by scroll containers.

### Proposed Enhancement
Implement a 2-tier execution strategy in `browser_click`:
1. **Step 1**: Scroll target element into view via `element.scrollIntoView({ block: 'center', inline: 'center' })`.
2. **Step 2**: Calculate coordinates and attempt native CDP click (`Input.dispatchMouseEvent`).
3. **Step 3 (Fallback)**: If the click is intercepted or target is obscured by an overlay, automatically fall back to dispatching direct synthetic DOM events (`element.focus()`, `element.click()`).

---

## 5. Single-Roundtrip Action Verification (`screenshot_after`)

### Problem
Autonomous AI agents frequently need visual confirmation after executing critical actions (e.g., checking if a form submitted, detecting red error banners). Currently, this requires 2 separate tool calls (`browser_click` followed by `browser_screenshot`), doubling round-trip latency.

### Proposed Enhancement
- Add an optional parameter `screenshot_after: bool = False` to `browser_click`, `browser_type`, `browser_fill`, and `browser_navigate`.
- When set to `True`, the tool performs the action, waits for DOM stabilization (e.g., 200-500ms), captures a screenshot, and returns the image artifact in the single response.
