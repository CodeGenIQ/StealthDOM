# StealthDOM Headless Audit — Minimized Window

> This report definitively tests every MCP tool while the browser window is minimized.
> For each tool, `windowState` is checked **before and after** the call to detect pops.

**Final Window State:** `minimized`  
**Summary:** 38 passed, 6 failed, 0 unexpected pops, 4 skipped / 48 total

| # | Tool | Action | Verdict | Pre | Post | Duration | Error |
|---|---|---|---|---|---|---|---|
| 1 | `browser_list_tabs` | `listTabs` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 2 | `browser_get_cookies` | `getCookies` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 3 | `browser_get_dialog` | `getActiveDialog` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 4 | `browser_list_frames` | `listFrames` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 5 | `browser_evaluate (document.title)` | `executeScript` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 6 | `browser_evaluate (DOM count)` | `executeScript` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 7 | `browser_evaluate (window dims)` | `executeScript` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 8 | `browser_evaluate_all_frames` | `executeScriptAllFrames` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 9 | `browser_query (h1)` | `querySelector` | ✅ PASS | `minimized` | `minimized` | 0.01s |  |
| 10 | `browser_query_all (a)` | `querySelectorAll` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 11 | `browser_get_text (body)` | `getInnerText` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 12 | `browser_get_html (body)` | `getOuterHTML` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 13 | `browser_get_attribute (a href)` | `getAttribute` | ✅ PASS | `minimized` | `minimized` | 0.01s |  |
| 14 | `browser_get_bounding_rect (h1)` | `getBoundingRect` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 15 | `browser_get_page_text` | `getPageText` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 16 | `browser_get_page_html` | `getPageHTML` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 17 | `browser_wait_for (h1, 2s)` | `waitForSelector` | ✅ PASS | `minimized` | `minimized` | 0.99s |  |
| 18 | `browser_scroll_to (0,0)` | `scrollTo` | ✅ PASS | `minimized` | `minimized` | 0.01s |  |
| 19 | `browser_scroll_into_view (h1)` | `scrollIntoView` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 20 | `browser_click (h1)` | `click` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 21 | `browser_hover (h1)` | `hover` | ⚠️ FAIL: Unknown background action: hover | `minimized` | `minimized` | 0.0s | Unknown background action: hover |
| 22 | `browser_screenshot (CDP)` | `captureScreenshot` | ✅ PASS | `minimized` | `minimized` | 3.28s |  |
| 23 | `browser_screenshot_full_page (CDP)` | `captureFullPageScreenshot` | ✅ PASS | `minimized` | `minimized` | 5.31s |  |
| 24 | `browser_mouse_move (100,100)` | `mouseMoveCDP` | ✅ PASS | `minimized` | `minimized` | 25.13s |  |
| 25 | `browser_mouse_click (100,100)` | `mouseClickCDP` | ✅ PASS | `minimized` | `minimized` | 5.11s |  |
| 26 | `browser_mouse_wheel (scroll down)` | `mouseWheelCDP` | ⚠️ FAIL: Timeout after 30s | `minimized` | `minimized` | 30.0s | Timeout after 30s |
| 27 | `browser_navigate (example.com)` | `navigate` | ✅ PASS | `minimized` | `minimized` | 0.02s |  |
| 28 | `browser_reload` | `reloadTab` | ✅ PASS | `minimized` | `minimized` | 0.02s |  |
| 29 | `browser_back` | `goBack` | ✅ PASS | `minimized` | `minimized` | 0.02s |  |
| 30 | `browser_wait_for_url (example)` | `waitForUrl` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 31 | `browser_start_net_capture` | `startNetCapture` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 32 | `browser_get_net_capture` | `getNetCapture` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 33 | `browser_stop_net_capture` | `stopNetCapture` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 34 | `browser_set_cookie` | `setCookie` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 35 | `browser_get_cookies (after set)` | `getCookies` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 36 | `browser_delete_cookie` | `deleteCookie` | ✅ PASS | `minimized` | `minimized` | 0.02s |  |
| 37 | `browser_proxy_fetch (GET)` | `proxyFetch` | ⚠️ FAIL: Unknown background action: proxyFetch | `minimized` | `minimized` | 0.0s | Unknown background action: proxyFetch |
| 38 | `browser_new_tab` | `newTab` | ✅ PASS | `minimized` | `minimized` | 0.06s |  |
| 39 | `browser_evaluate (new tab title)` | `executeScript` | ✅ PASS | `minimized` | `minimized` | 0.01s |  |
| 40 | `browser_screenshot (new tab)` | `captureScreenshot` | ⚠️ FAIL: Timeout after 15s | `minimized` | `minimized` | 15.01s | Timeout after 15s |
| 41 | `browser_close_tab (new tab)` | `closeTab` | ✅ PASS | `minimized` | `minimized` | 0.03s |  |
| 42 | `browser_get_dialog (no dialog)` | `getActiveDialog` | ✅ PASS | `minimized` | `minimized` | 0.0s |  |
| 43 | `browser_switch_tab` | `switchTab` | ⏭️ SKIPPED: Calls tabs.update({active:true}) + windows.update({focused:true}) | `minimized` | `N/A` | 0s |  |
| 44 | `browser_new_window` | `newWindow` | ⏭️ SKIPPED: Calls windows.create() — new visible window | `minimized` | `N/A` | 0s |  |
| 45 | `browser_new_incognito_window` | `newIncognitoWindow` | ⏭️ SKIPPED: Calls windows.create({incognito:true}) | `minimized` | `N/A` | 0s |  |
| 46 | `browser_resize_window` | `resizeWindow` | ⏭️ SKIPPED: Calls windows.update(updateInfo) — may change state | `minimized` | `N/A` | 0s |  |
| 47 | `browser_evaluate (discarded)` | `executeScript` | ⚠️ FAIL: executeScript failed: Cannot access contents of the page. Extension manifest mus | `minimized` | `minimized` | 0.0s | executeScript failed: Cannot access contents of the page. Extension manifest mus |
| 48 | `browser_screenshot (discarded)` | `captureScreenshot` | ⚠️ FAIL: Sleeping tab. The tab has been suspended by Chrome to save memory. Wake it up wi | `minimized` | `minimized` | 0.0s | Sleeping tab. The tab has been suspended by Chrome to save memory. Wake it up wi |

