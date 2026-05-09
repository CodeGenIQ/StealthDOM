# Chromium Window State Findings

During rigorous testing of StealthDOM's screenshot capabilities via the Chrome DevTools Protocol (CDP), we discovered several critical behaviors regarding how Chromium handles different physical window states on Windows.

> [!IMPORTANT]
> A common assumption in browser automation is that a minimized window behaves identically to a fully occluded window. **This is false.** Chromium has a distinct internal rendering path for explicitly minimized windows.

## 1. Minimized Windows
- **Finding**: **CDP screenshots (`Page.captureScreenshot`) CAN be successfully taken while the browser window is completely minimized to the taskbar.**
- **Details**: Contrary to the original codebase's assumption, it is *not* necessary to forcefully restore (`chrome.windows.update(..., {state: 'normal'})`) a minimized window to capture a screenshot of a normal active tab. Chromium's internal engine permits off-screen compositor frame rendering for CDP requests even when the window has no physical screen presence.
- **Caveat**: This only applies to normal web pages captured via CDP. Internal browser pages (e.g., `chrome://`) require the `captureVisibleTab` fallback, which strictly requires active window visibility and explicit user invocation.

## 2. Occluded Windows
- **Finding**: CDP screenshots will **usually succeed**, but can occasionally hang if the OS aggressively suspends the compositor for a fully occluded window (covered completely by another application).
- **Details**: When a window is covered, the Windows Desktop Window Manager (DWM) often keeps the graphics canvas alive in memory, especially if the covering app has hardware acceleration or overlays. Because the window state remains "normal," Chromium can usually paint and return a frame instantly. However, if the OS does decide to aggressively suspend the compositor, the `Page.captureScreenshot` request will hang.
- **Resolution**: We implemented a strict 4-second timeout that dynamically queries the OS state and returns a deterministic error to the AI agent (`"The browser window is fully occluded"`), preventing silent failures.

## 3. Discarded (Sleeping) Tabs
- **Finding**: CDP cannot interact with a tab that has been proactively discarded by Chrome's Memory Saver.
- **Details**: When a tab is discarded, its rendering process is killed. Attempting to attach a debugger or execute CDP commands will fail or timeout.
- **Resolution**: StealthDOM now explicitly checks the `tab.discarded` property before attempting any operations. If `true`, it immediately fails with a clear error advising the user to wake the tab via `browser_reload` or `browser_switch_tab`.

## 4. Native Input Events (Mouse/Keyboard)
- **Finding**: **CDP input events (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`) CAN successfully target and interact with elements on completely minimized windows.**
- **Details**: When a Chromium window is minimized on Windows, it retains its last known physical viewport dimensions (e.g., `1631x781`) in memory. Because the DOM layout is preserved, bounding box calculations (`getBoundingClientRect`) remain highly accurate. CDP click coordinates flawlessly hit their targets off-screen, and key events successfully route to the focused elements.
- **Resolution**: Just like screenshots, it is completely unnecessary to forcefully restore a minimized window to execute native mouse clicks or typing automation.

## 5. Newly Created Background Tabs (Minimized State)
- **Finding**: If a *brand new tab* is created while the browser window is physically minimized to the taskbar, Chromium will completely refuse to allocate a graphics surface for it. Standard `Page.captureScreenshot` commands will hang indefinitely.
- **Details**: Unlike an existing tab (which has a previously rendered frame cached in memory), a new tab has no canvas to paint onto. Furthermore, simply reloading the tab (`browser_reload`) or evaluating JavaScript on it will **not** force Chromium to render it. It will remain surface-less.
- **Resolution**: We implemented a strict 4-second timeout that dynamically queries the OS window state. If the AI agent attempts to screenshot a newly created tab in a minimized window, the capture instantly fails and returns a deterministic error (`"The browser window is minimized"`), instructing the AI to ask the human user to manually restore the window.

---
*Conclusion: Chromium's CDP implementation natively supports fully headless operation of minimized windows for existing tabs, contradicting common automation heuristics.*
