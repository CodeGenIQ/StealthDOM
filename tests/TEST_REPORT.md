# StealthDOM Test Suite Report

**Date:** 2026-05-08 03:34:31

**Results:** 91/91 passed, 0 failed

## Test Execution Log

### Connect to bridge
- ✅ All 1 assertions passed.

### _msg_id echoed correctly
- ✅ All 1 assertions passed.

### listTabs succeeds
- ✅ All 1 assertions passed.

### Found 10 tabs
- ✅ All 1 assertions passed.

### Tab has all required fields (id, url, title, active, windowId, incognito)
- ✅ All 1 assertions passed.

### Using tab chrome:1653971747: https://example.com/
- ✅ All 1 assertions passed.

### evaluate with explicit tabId returned: Example Domain
- ✅ All 1 assertions passed.

### evaluate URL with explicit tabId returned: https://example.com/
- ✅ All 1 assertions passed.

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

### Virtual tab IDs not present (single-browser mode â€” OK)
- ✅ All 1 assertions passed.

### All parallel commands returned correct response types (no cross-talk)
- ✅ All 1 assertions passed.

### Screenshot captured for test tab chrome:1653971749 (137830 chars)
- ✅ All 1 assertions passed.

### Full-page screenshot captured (137830 chars)
- ✅ All 1 assertions passed.

### All 3 parallel screenshots succeeded (mutex serialized them)
- ✅ All 1 assertions passed.

### Screenshot captured without activating tab chrome:1653971751 (CDP path confirmed)
- ✅ All 1 assertions passed.

### Screenshot captured successfully via CDP (137830 chars)
- ✅ All 1 assertions passed.

### Full-page captured in single CDP shot: 1383x827px
- ✅ All 1 assertions passed.

### querySelector body returned correct tagName
- ✅ All 1 assertions passed.

### querySelectorAll returned 1 elements (limit=5)
- ✅ All 1 assertions passed.

### getInnerText returned dict (frameset â€” accepted)
- ✅ All 1 assertions passed.

### getOuterHTML returned 500 chars (maxLength=500)
- ✅ All 1 assertions passed.

### getAttribute returned successfully
- ✅ All 1 assertions passed.

### getBoundingRect body: 1367x364.4375 at (8,21.4375)
- ✅ All 1 assertions passed.

### waitForSelector found 'body' immediately
- ✅ All 1 assertions passed.

### waitForSelector correctly timed out on nonexistent element
- ✅ All 1 assertions passed.

### getPageText returned 1000 chars (maxLength=1000)
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

### Got target coordinates (691, 39)
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

### mouseDragCDP succeeded (691,39) -> (791,89)
- ✅ All 1 assertions passed.

### mouseWheelCDP (scroll down 300px) succeeded
- ✅ All 1 assertions passed.

### evaluate returned: 
- ✅ All 1 assertions passed.

### listFrames returned 1 frame(s)
- ✅ All 1 assertions passed.

### Frame structure OK: url=https://httpbin.org/html, hasBody=True
- ✅ All 1 assertions passed.

### Frame enrichment: elementCount=6
- ✅ All 1 assertions passed.

### Frame enrichment: isFrameset=False
- ✅ All 1 assertions passed.

### listFrames correctly rejects missing tabId
- ✅ All 1 assertions passed.

### executeScriptAllFrames returned 1 result(s)
- ✅ All 1 assertions passed.

### Frame 0 result: title=''
- ✅ All 1 assertions passed.

### Complex eval OK: url=https://httpbin.org/html, elements=6
- ✅ All 1 assertions passed.

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

### newTab created tab chrome:1653971767
- ✅ All 1 assertions passed.

### New tab found in listTabs
- ✅ All 1 assertions passed.

### switchTab succeeded
- ✅ All 1 assertions passed.

### closeTab succeeded
- ✅ All 1 assertions passed.

### Closed tab no longer in listTabs
- ✅ All 1 assertions passed.

### newWindow created window 1653971769
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

### newIncognitoWindow created window 1653971778
- ✅ All 1 assertions passed.

### Incognito window closed
- ✅ All 1 assertions passed.

### Dismissed window.alert correctly
- ✅ All 1 assertions passed.

### Dismissed window.confirm (returned false)
- ✅ All 1 assertions passed.

### Accepted window.prompt with text correctly
- ✅ All 1 assertions passed.

### waitForCondition correctly returned when condition became true
- ✅ All 1 assertions passed.

### waitForCondition correctly timed out
- ✅ All 1 assertions passed.

