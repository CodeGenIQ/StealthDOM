# StealthDOM Test Suite Report

**Results:** 85/92 passed, 7 failed

## Failures
- **getTitle with explicit tabId**: `Unknown action: getTitle`
- **getURL with explicit tabId**: `Unknown action: getURL`
- **virtualId routing**: `Unknown action: getTitle`
- **Parallel getTitle**: `Unknown action: getTitle`
- **Parallel getURL**: `Unknown action: getURL`
- **Evaluate**: `'charmap' codec can't encode character '\u25bc' in position 41: character maps to <undefined>`
- **executeScriptAllFrames**: `'charmap' codec can't encode character '\u25bc' in position 45: character maps to <undefined>`

## Analysis & Possible Causes
## Test Execution Log

### Connect to bridge
- ✅ All 1 assertions passed.

### _msg_id echoed correctly
- ✅ All 1 assertions passed.

### listTabs succeeds
- ✅ All 1 assertions passed.

### Found 13 tabs
- ✅ All 1 assertions passed.

### Tab has all required fields (id, url, title, active, windowId, incognito)
- ✅ All 1 assertions passed.

### virtualId present: chrome:1653969176
- ✅ All 1 assertions passed.

### browserId present: chrome
- ✅ All 1 assertions passed.

### Using tab 1653969176: https://www.tradingview.com/chart/xTqEvltf/
- ✅ All 1 assertions passed.

### getTitle with explicit tabId
- ❌ `getTitle with explicit tabId: Unknown action: getTitle`

### getURL with explicit tabId
- ❌ `getURL with explicit tabId: Unknown action: getURL`

### navigate correctly rejects missing tabId
- ✅ All 1 assertions passed.

### goBack correctly rejects missing tabId
- ✅ All 1 assertions passed.

### goForward correctly rejects missing tabId
- ✅ All 1 assertions passed.

### reloadTab correctly rejects missing tabId
- ✅ All 1 assertions passed.

### captureScreenshot correctly rejects missing tabId
- ✅ All 1 assertions passed.

### querySelector correctly rejects missing tabId
- ✅ All 1 assertions passed.

### virtualId routing
- ❌ `virtualId routing: Unknown action: getTitle`

### Parallel getTitle
- ❌ `Parallel getTitle: Unknown action: getTitle`

### Parallel getURL
- ❌ `Parallel getURL: Unknown action: getURL`

### Screenshot captured for test tab 1653970051 (139150 chars)
- ✅ All 1 assertions passed.

### Full-page screenshot captured (138274 chars)
- ✅ All 1 assertions passed.

### All 3 parallel screenshots succeeded (mutex serialized them)
- ✅ All 1 assertions passed.

### Screenshot captured successfully via CDP (139150 chars)
- ✅ All 1 assertions passed.

### Full-page captured in single CDP shot: 1354x771px
- ✅ All 1 assertions passed.

### querySelector body returned correct tagName
- ✅ All 1 assertions passed.

### querySelectorAll returned 918 elements (limit=5)
- ✅ All 1 assertions passed.

### getInnerText returned dict (frameset â€” accepted)
- ✅ All 1 assertions passed.

### getOuterHTML returned 500 chars (maxLength=500)
- ✅ All 1 assertions passed.

### getAttribute returned successfully
- ✅ All 1 assertions passed.

### getBoundingRect body: 1354x771 at (0,0)
- ✅ All 1 assertions passed.

### waitForSelector found 'body' immediately
- ✅ All 1 assertions passed.

### waitForSelector correctly timed out on nonexistent element
- ✅ All 1 assertions passed.

### getPageText returned 812 chars (maxLength=1000)
- ✅ All 1 assertions passed.

### getPageHTML returned 2000 chars (maxLength=2000)
- ✅ All 1 assertions passed.

### Test HTML injected into about:blank tab
- ✅ All 1 assertions passed.

### fill succeeded
- ✅ All 1 assertions passed.

### fill correctly set input value to 'hello world'
- ✅ All 1 assertions passed.

### click succeeded
- ✅ All 1 assertions passed.

### selectOption succeeded
- ✅ All 1 assertions passed.

### keyPress 'a' succeeded
- ✅ All 1 assertions passed.

### keyCombo ['Control','a'] succeeded
- ✅ All 1 assertions passed.

### scrollTo(0, 100) succeeded
- ✅ All 1 assertions passed.

### scrollIntoView body succeeded
- ✅ All 1 assertions passed.

### hover command succeeded
- ✅ All 1 assertions passed.

### Got target coordinates (677, 39)
- ✅ All 1 assertions passed.

### mouseMoveCDP succeeded
- ✅ All 1 assertions passed.

### mouseClickCDP (single left) succeeded
- ✅ All 1 assertions passed.

### mouseClickCDP (double-click) succeeded
- ✅ All 1 assertions passed.

### mouseDownCDP succeeded
- ✅ All 1 assertions passed.

### mouseUpCDP succeeded
- ✅ All 1 assertions passed.

### mouseDragCDP succeeded (677,39) -> (777,89)
- ✅ All 1 assertions passed.

### mouseWheelCDP (scroll down 300px) succeeded
- ✅ All 1 assertions passed.

### evaluate returned: GC1! 4,584.4 ▼ −0.89% eur usd
- ✅ All 1 assertions passed.

### Evaluate
- ❌ `Evaluate: 'charmap' codec can't encode character '\u25bc' in position 41: character maps to <undefined>`

### listFrames returned 1 frame(s)
- ✅ All 1 assertions passed.

### Frame structure OK: url=https://www.tradingview.com/chart/xTqEvltf/, hasBody=True
- ✅ All 1 assertions passed.

### Frame enrichment: elementCount=3230
- ✅ All 1 assertions passed.

### Frame enrichment: isFrameset=False
- ✅ All 1 assertions passed.

### listFrames correctly rejects missing tabId
- ✅ All 1 assertions passed.

### executeScriptAllFrames returned 1 result(s)
- ✅ All 1 assertions passed.

### Frame 0 result: title='GC1! 4,584.4 ▼ −0.89% eur usd'
- ✅ All 1 assertions passed.

### executeScriptAllFrames
- ❌ `executeScriptAllFrames: 'charmap' codec can't encode character '\u25bc' in position 45: character maps to <undefined>`

### Only 1 frame on this page â€” skip cross-frame test (need a page with iframes)
- ✅ All 1 assertions passed.

### navigate to httpbin.org/html succeeded
- ✅ All 1 assertions passed.

### URL confirmed: https://httpbin.org/html
- ✅ All 1 assertions passed.

### goBack: Cannot find a next page in history. (may be expected)
- ✅ All 1 assertions passed.

### reloadTab succeeded
- ✅ All 1 assertions passed.

### newTab created tab 1653970069
- ✅ All 1 assertions passed.

### New tab found in listTabs
- ✅ All 1 assertions passed.

### switchTab succeeded
- ✅ All 1 assertions passed.

### closeTab succeeded
- ✅ All 1 assertions passed.

### Closed tab no longer in listTabs
- ✅ All 1 assertions passed.

### newWindow created window 1653970071
- ✅ All 1 assertions passed.

### resizeWindow to 800x600 succeeded
- ✅ All 1 assertions passed.

### closeWindow succeeded
- ✅ All 1 assertions passed.

### setCookie succeeded
- ✅ All 1 assertions passed.

### getCookies found test cookie among 1 cookies
- ✅ All 1 assertions passed.

### deleteCookie succeeded
- ✅ All 1 assertions passed.

### Cookie correctly deleted (verified)
- ✅ All 1 assertions passed.

### getNetCapture structure OK: bufferSize=5000, overflowCount=0
- ✅ All 1 assertions passed.

### proxyFetch succeeded (status=200)
- ✅ All 1 assertions passed.

### type command succeeded
- ✅ All 1 assertions passed.

### type correctly appended text: 'abc'
- ✅ All 1 assertions passed.

### waitForUrl matched 'example.com' immediately
- ✅ All 1 assertions passed.

### waitForUrl correctly timed out on non-matching pattern
- ✅ All 1 assertions passed.

### setInputFiles accepted data URL
- ✅ All 1 assertions passed.

### File input has 1 file(s) set
- ✅ All 1 assertions passed.

### newIncognitoWindow created window 1653970080
- ✅ All 1 assertions passed.

### Incognito window closed
- ✅ All 1 assertions passed.

### Dismissed window.alert correctly
- ✅ All 1 assertions passed.

### Dismissed window.confirm (returned false)
- ✅ All 1 assertions passed.

### Accepted window.prompt with text correctly
- ✅ All 1 assertions passed.

