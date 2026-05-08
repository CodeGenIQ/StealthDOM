# Chromium Window State Findings

During rigorous testing of StealthDOM's screenshot capabilities via the Chrome DevTools Protocol (CDP), we discovered several critical behaviors regarding how Chromium handles different physical window states on Windows.

> [!IMPORTANT]
> A common assumption in browser automation is that a minimized window behaves identically to a fully occluded window. **This is false.** Chromium has a distinct internal rendering path for explicitly minimized windows.

## 1. Minimized Windows
- **Finding**: **CDP screenshots (`Page.captureScreenshot`) CAN be successfully taken while the browser window is completely minimized to the taskbar.**
- **Details**: Contrary to the original codebase's assumption, it is *not* necessary to forcefully restore (`chrome.windows.update(..., {state: 'normal'})`) a minimized window to capture a screenshot of a normal active tab. Chromium's internal engine permits off-screen compositor frame rendering for CDP requests even when the window has no physical screen presence.
- **Caveat**: This only applies to normal web pages captured via CDP. Internal browser pages (e.g., `chrome://`) require the `captureVisibleTab` fallback, which strictly requires active window visibility and explicit user invocation.

## 2. Occluded Windows
- **Finding**: CDP screenshots will **hang indefinitely** (eventually timing out) if the browser window is fully occluded (covered completely by another opaque, maximized application like an IDE).
- **Details**: When a window is occluded, the Windows Desktop Window Manager (DWM) signals Chromium that it is not visible. Chromium responds by entirely suspending the graphics compositor to save power. Because the window state is still technically "normal" (not minimized), Chromium does not trigger its special headless rendering path. Any `Page.captureScreenshot` request will wait forever for a compositor frame that never arrives.
- **Resolution**: We implemented a strict `Promise.race` timeout on the CDP screenshot call to immediately catch and report this occlusion hang, preventing 30-second silent failures.

## 3. Discarded (Sleeping) Tabs
- **Finding**: CDP cannot interact with a tab that has been proactively discarded by Chrome's Memory Saver.
- **Details**: When a tab is discarded, its rendering process is killed. Attempting to attach a debugger or execute CDP commands will fail or timeout.
- **Resolution**: StealthDOM now explicitly checks the `tab.discarded` property before attempting any operations. If `true`, it immediately fails with a clear error advising the user to wake the tab via `browser_reload` or `browser_switch_tab`.

## 4. Native Input Events (Mouse/Keyboard)
- **Finding**: **CDP input events (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`) CAN successfully target and interact with elements on completely minimized windows.**
- **Details**: When a Chromium window is minimized on Windows, it retains its last known physical viewport dimensions (e.g., `1631x781`) in memory. Because the DOM layout is preserved, bounding box calculations (`getBoundingClientRect`) remain highly accurate. CDP click coordinates flawlessly hit their targets off-screen, and key events successfully route to the focused elements.
- **Resolution**: Just like screenshots, it is completely unnecessary to forcefully restore a minimized window to execute native mouse clicks or typing automation.

## 5. Newly Created Background Tabs (Minimized State)
- **Finding**: If a *brand new tab* is created in the background while the browser window is currently minimized, Chromium will completely defer allocating a graphics surface for it. Standard `Page.captureScreenshot` commands will hang indefinitely.
- **Details**: Simply reloading the tab (`browser_reload`) or evaluating JavaScript on it will **not** force Chromium to render it. It will remain surface-less.
- **Current Status**: We are currently investigating if there is *any* silent CDP command (like Emulation overrides) that forces a rendering surface to allocate without popping the window up. Until then, newly created tabs in minimized windows cannot be screenshot without restoring the window.

---
*Conclusion: Chromium's CDP implementation natively supports fully headless operation of minimized windows for existing tabs, contradicting common automation heuristics.*
