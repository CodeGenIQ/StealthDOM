# StealthDOM — Known Issues

*Last updated: v3.3.0*

---

## Service Worker Lifecycle (For Developers Modifying StealthDOM)

Chromium's Manifest V3 service workers (`background.js`) are aggressively put to sleep after ~30 seconds of inactivity to save memory. StealthDOM mitigates this with a 20-second keepalive ping, but the service worker may still occasionally restart. This is totally normal, and the Python bridge handles these restarts automatically by silently reconnecting within 3 seconds.

**Developer Tip:** If you are actively modifying the StealthDOM extension code and are annoyed by the background script going to sleep while you debug it, there is a handy trick: go to `chrome://extensions` and click the "service worker" link to manually open the F12 DevTools window for the extension. As long as that specific DevTools window remains open, Chrome assumes a human is debugging it and will permanently keep the background script awake.

---

## Content Script Stale After Extension Reload

After reloading the extension in the browser's extensions page, content scripts on already-open pages become stale. Commands will fail with "Content script error..." or "No response from content script...". 

AI agents will automatically receive this helpful hint in their error payload:
*(If the extension was recently reloaded or the tab is unresponsive, use browser_reload to refresh the tab and re-inject the script)*

**Workaround:** You can programmatically execute `browser_reload`, or manually refresh the tab yourself (e.g., hit F5), to re-inject the content script before interacting with the page again.

---

## Background Tab Throttling & The Anti-Throttle System

Chromium throttles background tabs, which can delay DOM interactions. StealthDOM includes an anti-throttle system in `content_script.js` that mutates the DOM every 15 seconds and overrides `document.hidden` / `visibilityState`. 

**What this protects against:**
This system successfully tricks the *website's JavaScript environment* (e.g., React apps, YouTube, web games). It prevents sites from pausing video playback, halting internal timers, or stopping data fetching when the tab loses focus.

**What this DOES NOT protect against:**
The anti-throttle offers zero protection against Chromium's OS/Renderer-level resource managers, which aggressively optimize system resources and completely ignore JavaScript execution states:

1. **Memory Saver (Sleeping Tabs)**: This operates at the OS/Renderer level. When Chrome needs RAM, it acts like a grim reaper and completely kills the renderer process. The DOM is destroyed, the JavaScript engine is halted, and our anti-throttle `setInterval` is wiped from memory entirely. Chrome leaves a "tombstone" tab in the UI. If an agent tries to execute commands on a discarded tab, it will fail with "Cannot access a discarded tab." 
   * **Workaround:** The agent must use `browser_reload` or `browser_switch_tab` to wake the tab up before interacting with it.

2. **Suspended Graphics (Compositor Optimization)**: This operates at the GPU/Compositor level. While StealthDOM's CDP screenshot engine can successfully capture *existing* minimized windows, **newly created tabs** in a minimized window lack a graphics surface entirely. Chromium's compositor will refuse to paint the initial frame to save GPU cycles. 
   * **Note on Occlusion vs Minimization**: If a window is simply covered (occluded) by another maximized app but not explicitly minimized to the taskbar, Windows DWM usually keeps the graphics canvas alive and screenshots on new tabs will succeed instantly.
   * **Workaround**: If an agent attempts to screenshot a minimized new tab, the system will fail-fast in 4 seconds and return a deterministic error (`"Timed out. Window: minimized, graphics suspended. Either stop and tell user to restore window, or open a new tab with the force flag."`). The AI agent can then either ask the human user for help, or use `browser_new_tab` with `force_restore=true` to programmatically un-minimize the window. Alternatively, you can use `browser_resize_window` to position the window off-screen instead of minimizing it.

---

## Resolved Issues

All previously documented issues have been resolved:

| Issue | Resolution |
|---|---|
| Cross-frame DOM access (framesets, iframes) | Fixed in v3.0.2 — see [Architecture](01_architecture.md) |
| `captureVisibleTab` quota errors | Eliminated in v3.2.0 |
| Full-page screenshot stack overflow | Fixed in v3.0.1 |
| Window focus steal during screenshots | Eliminated in v3.2.0 |
