"""
Headless Audit: Tests ALL MCP tool categories while browser is minimized.
Detects whether any tool causes the browser to pop from minimized state.

Connects to the bridge control port (9878) just like the MCP server does.
For each tool, checks windowState before and after the call.

Usage: python -u tests/headless_audit/audit_minimized.py
"""
import asyncio
import json
import time
import os

import websockets

BRIDGE_URL = "ws://127.0.0.1:9878"
RESULTS = []

class Colors:
    PASS = "\033[92m"
    FAIL = "\033[91m"
    WARN = "\033[93m"
    INFO = "\033[96m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"

async def bridge_send(ws, action, _timeout=30, **kwargs):
    msg_id = str(int(time.time() * 1000))
    payload = {"_msg_id": msg_id, "action": action, **kwargs}
    await ws.send(json.dumps(payload))
    while True:
        try:
            resp = await asyncio.wait_for(ws.recv(), timeout=_timeout)
            data = json.loads(resp)
            if data.get("_msg_id") == msg_id:
                return data
        except asyncio.TimeoutError:
            return {"success": False, "error": f"Timeout after {_timeout}s"}

async def get_window_state(ws, tab_id):
    """Get the windowState for a specific tab."""
    resp = await bridge_send(ws, "listTabs")
    if not resp.get("success"):
        return "ERROR"
    for t in resp.get("data", []):
        if t["id"] == tab_id:
            return t.get("windowState", "unknown")
    return "NOT_FOUND"

async def run_test(ws, test_name, action, tab_id, expected_pop=False, _timeout=30, **kwargs):
    """Run a single test: check state before, execute, check state after."""
    pre = await get_window_state(ws, tab_id)
    
    t0 = time.time()
    resp = await bridge_send(ws, action, _timeout=_timeout, **kwargs)
    duration = time.time() - t0
    
    post = await get_window_state(ws, tab_id)
    
    success = resp.get("success", False)
    popped = (pre == "minimized" and post != "minimized")
    
    # Determine test verdict
    if popped and not expected_pop:
        verdict = "POPPED"
        color = Colors.FAIL
    elif not success:
        error = resp.get("error", "unknown")
        verdict = f"FAIL: {error[:80]}"
        color = Colors.WARN
    else:
        verdict = "PASS"
        color = Colors.PASS
    
    result = {
        "tool": test_name,
        "action": action,
        "pre_state": pre,
        "post_state": post,
        "popped": popped,
        "success": success,
        "duration": round(duration, 2),
        "verdict": verdict,
        "error": resp.get("error"),
        "expected_pop": expected_pop,
    }
    RESULTS.append(result)
    
    icon = "[PASS]" if verdict == "PASS" else ("[POPPED!]" if "POPPED" in verdict else ("[FAIL]" if "FAIL" in verdict else "[?]"))
    print(f"  {icon} {color}{test_name:<55}{Colors.ENDC} {verdict:<30} ({duration:.2f}s) State: {pre} -> {post}")
    
    return result

async def main():
    print(f"{Colors.BOLD}Connecting to Bridge...{Colors.ENDC}")
    ws = await websockets.connect(BRIDGE_URL)
    print(f"{Colors.PASS}Connected!{Colors.ENDC}\n")
    
    # Find a good test tab (active, not discarded)
    resp = await bridge_send(ws, "listTabs")
    tabs = resp.get("data", [])
    
    # Find example.com tab
    test_tab = None
    for t in tabs:
        if "example.com" in t.get("url", "") and not t.get("discarded"):
            test_tab = t
            break
    
    if not test_tab:
        print("ERROR: No example.com tab found. Create one first.")
        return
    
    tab_id = test_tab["id"]
    window_id = test_tab["windowId"]
    initial_state = test_tab.get("windowState")
    
    print(f"Test tab: {test_tab['title']} (ID: {tab_id})")
    print(f"Window ID: {window_id}")
    print(f"Initial windowState: {initial_state}")
    
    if initial_state != "minimized":
        print(f"\n{Colors.FAIL}ERROR: Browser is NOT minimized (state={initial_state}). Minimize it first!{Colors.ENDC}")
        return
    
    # Also find a discarded tab for edge-case testing
    discarded_tab = None
    for t in tabs:
        if t.get("discarded") and "chrome://" not in t.get("url", ""):
            discarded_tab = t
            break
    
    print(f"\n{Colors.BOLD}{'='*110}{Colors.ENDC}")
    print(f"{Colors.BOLD} HEADLESS AUDIT — All MCP tools tested while browser is MINIMIZED{Colors.ENDC}")
    print(f"{Colors.BOLD}{'='*110}{Colors.ENDC}\n")
    
    # ============================================================
    # CATEGORY 1: READ-ONLY METADATA
    # ============================================================
    print(f"{Colors.INFO}--- Category 1: Read-Only Metadata ---{Colors.ENDC}")
    
    await run_test(ws, "browser_list_tabs", "listTabs", tab_id)
    await run_test(ws, "browser_get_cookies", "getCookies", tab_id, url="https://example.com")
    await run_test(ws, "browser_get_dialog", "getActiveDialog", tab_id, tabId=tab_id)
    await run_test(ws, "browser_list_frames", "listFrames", tab_id, tabId=tab_id)
    
    # ============================================================
    # CATEGORY 2: SCRIPT EXECUTION (background.js → chrome.scripting)
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 2: Script Execution (chrome.scripting.executeScript) ---{Colors.ENDC}")
    
    await run_test(ws, "browser_evaluate (document.title)", "executeScript", tab_id,
                   tabId=tab_id, code="document.title")
    await run_test(ws, "browser_evaluate (DOM count)", "executeScript", tab_id,
                   tabId=tab_id, code="document.querySelectorAll('*').length")
    await run_test(ws, "browser_evaluate (window dims)", "executeScript", tab_id,
                   tabId=tab_id, code="({w: window.innerWidth, h: window.innerHeight})")
    await run_test(ws, "browser_evaluate_all_frames", "executeScriptAllFrames", tab_id,
                   tabId=tab_id, code="document.title")
    
    # ============================================================
    # CATEGORY 3: CONTENT SCRIPT → DOM OPERATIONS
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 3: Content Script DOM Operations ---{Colors.ENDC}")
    
    await run_test(ws, "browser_query (h1)", "querySelector", tab_id,
                   tabId=tab_id, selector="h1")
    await run_test(ws, "browser_query_all (a)", "querySelectorAll", tab_id,
                   tabId=tab_id, selector="a")
    await run_test(ws, "browser_get_text (body)", "getInnerText", tab_id,
                   tabId=tab_id, selector="body")
    await run_test(ws, "browser_get_html (body)", "getOuterHTML", tab_id,
                   tabId=tab_id, selector="body", maxLength=500)
    await run_test(ws, "browser_get_attribute (a href)", "getAttribute", tab_id,
                   tabId=tab_id, selector="a", attribute="href")
    await run_test(ws, "browser_get_bounding_rect (h1)", "getBoundingRect", tab_id,
                   tabId=tab_id, selector="h1")
    await run_test(ws, "browser_get_page_text", "getPageText", tab_id,
                   tabId=tab_id, maxLength=500)
    await run_test(ws, "browser_get_page_html", "getPageHTML", tab_id,
                   tabId=tab_id, maxLength=500)
    await run_test(ws, "browser_wait_for (h1, 2s)", "waitForSelector", tab_id,
                   tabId=tab_id, selector="h1", timeout=2000)
    await run_test(ws, "browser_scroll_to (0,0)", "scrollTo", tab_id,
                   tabId=tab_id, x=0, y=0)
    await run_test(ws, "browser_scroll_into_view (h1)", "scrollIntoView", tab_id,
                   tabId=tab_id, selector="h1")
    await run_test(ws, "browser_click (h1)", "click", tab_id,
                   tabId=tab_id, selector="h1")
    await run_test(ws, "browser_hover (h1)", "hover", tab_id,
                   tabId=tab_id, selector="h1")
    
    # ============================================================
    # CATEGORY 4: SCREENSHOTS (CDP primary path)
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 4: Screenshots ---{Colors.ENDC}")
    
    await run_test(ws, "browser_screenshot (CDP)", "captureScreenshot", tab_id,
                   tabId=tab_id)
    await run_test(ws, "browser_screenshot_full_page (CDP)", "captureFullPageScreenshot", tab_id,
                   tabId=tab_id, maxHeight=5000)
    
    # ============================================================
    # CATEGORY 5: CDP MOUSE INPUT
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 5: CDP Mouse Input ---{Colors.ENDC}")
    
    await run_test(ws, "browser_mouse_move (100,100)", "mouseMoveCDP", tab_id,
                   tabId=tab_id, x=100, y=100, steps=5, duration=100)
    await run_test(ws, "browser_mouse_click (100,100)", "mouseClickCDP", tab_id,
                   tabId=tab_id, x=100, y=100, button="left", clickCount=1)
    await run_test(ws, "browser_mouse_wheel (scroll down)", "mouseWheelCDP", tab_id,
                   tabId=tab_id, x=100, y=100, deltaX=0, deltaY=100)
    
    # ============================================================
    # CATEGORY 6: NAVIGATION
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 6: Navigation ---{Colors.ENDC}")
    
    await run_test(ws, "browser_navigate (example.com)", "navigate", tab_id,
                   tabId=tab_id, url="https://example.com/")
    await asyncio.sleep(1.5)
    await run_test(ws, "browser_reload", "reloadTab", tab_id,
                   tabId=tab_id)
    await asyncio.sleep(1.5)
    await run_test(ws, "browser_back", "goBack", tab_id,
                   tabId=tab_id)
    await run_test(ws, "browser_wait_for_url (example)", "waitForUrl", tab_id,
                   tabId=tab_id, pattern="example", timeout=5000)
    
    # ============================================================
    # CATEGORY 7: NETWORK CAPTURE
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 7: Network Capture ---{Colors.ENDC}")
    
    await run_test(ws, "browser_start_net_capture", "startNetCapture", tab_id)
    await run_test(ws, "browser_get_net_capture", "getNetCapture", tab_id)
    await run_test(ws, "browser_stop_net_capture", "stopNetCapture", tab_id)
    
    # ============================================================
    # CATEGORY 8: COOKIES
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 8: Cookies ---{Colors.ENDC}")
    
    await run_test(ws, "browser_set_cookie", "setCookie", tab_id,
                   details={"url": "https://example.com", "name": "test_audit", "value": "1"})
    await run_test(ws, "browser_get_cookies (after set)", "getCookies", tab_id,
                   url="https://example.com")
    await run_test(ws, "browser_delete_cookie", "deleteCookie", tab_id,
                   url="https://example.com", name="test_audit")
    
    # ============================================================
    # CATEGORY 9: PROXY FETCH (content script)
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 9: Proxy Fetch ---{Colors.ENDC}")
    
    await run_test(ws, "browser_proxy_fetch (GET)", "proxyFetch", tab_id,
                   tabId=tab_id, url="https://httpbin.org/get", method="GET")
    
    # ============================================================
    # CATEGORY 10: TAB CREATION (may or may not pop)
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 10: Tab Creation ---{Colors.ENDC}")
    
    new_tab_resp = await run_test(ws, "browser_new_tab", "newTab", tab_id,
                                  url="https://httpbin.org/html")
    
    # Try to find and use the new tab
    await asyncio.sleep(2)
    resp2 = await bridge_send(ws, "listTabs")
    new_tab_id = None
    for t in resp2.get("data", []):
        if "httpbin" in t.get("url", ""):
            new_tab_id = t["id"]
            break
    
    if new_tab_id:
        await run_test(ws, "browser_evaluate (new tab title)", "executeScript", tab_id,
                       tabId=new_tab_id, code="document.title")
        await run_test(ws, "browser_screenshot (new tab)", "captureScreenshot", tab_id,
                       tabId=new_tab_id, _timeout=15)
        await run_test(ws, "browser_close_tab (new tab)", "closeTab", tab_id,
                       tabId=new_tab_id)
    else:
        print(f"  {Colors.WARN}Could not find new tab to test{Colors.ENDC}")
    
    # ============================================================
    # CATEGORY 11: DIALOG HANDLING
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 11: Dialog Handling ---{Colors.ENDC}")
    
    await run_test(ws, "browser_get_dialog (no dialog)", "getActiveDialog", tab_id,
                   tabId=tab_id)
    
    # ============================================================
    # CATEGORY 12: KNOWN POP TRIGGERS (SKIPPED)
    # ============================================================
    print(f"\n{Colors.INFO}--- Category 12: Known Pop Triggers (SKIPPED — would pop the browser) ---{Colors.ENDC}")
    
    skipped = [
        ("browser_switch_tab", "switchTab", "Calls tabs.update({active:true}) + windows.update({focused:true})"),
        ("browser_new_window", "newWindow", "Calls windows.create() — new visible window"),
        ("browser_new_incognito_window", "newIncognitoWindow", "Calls windows.create({incognito:true})"),
        ("browser_resize_window", "resizeWindow", "Calls windows.update(updateInfo) — may change state"),
    ]
    for tool, action, reason in skipped:
        print(f"  [SKIP] {Colors.WARN}{tool:<55}{Colors.ENDC} SKIPPED: {reason}")
        RESULTS.append({
            "tool": tool, "action": action, "verdict": f"SKIPPED: {reason}",
            "pre_state": "minimized", "post_state": "N/A", "popped": None,
            "success": None, "duration": 0, "error": None, "expected_pop": True,
        })
    
    # ============================================================
    # CATEGORY 13: DISCARDED TAB BEHAVIOR
    # ============================================================
    if discarded_tab:
        d_id = discarded_tab["id"]
        print(f"\n{Colors.INFO}--- Category 13: Discarded Tab ({discarded_tab['title'][:40]}...) ---{Colors.ENDC}")
        await run_test(ws, "browser_evaluate (discarded)", "executeScript", tab_id,
                       tabId=d_id, code="document.title")
        await run_test(ws, "browser_screenshot (discarded)", "captureScreenshot", tab_id,
                       tabId=d_id, _timeout=10)
    
    # ============================================================
    # FINAL STATE CHECK
    # ============================================================
    print(f"\n{Colors.BOLD}{'='*110}{Colors.ENDC}")
    final_state = await get_window_state(ws, tab_id)
    print(f"\n{Colors.BOLD}FINAL WINDOW STATE: {final_state}{Colors.ENDC}")
    
    if final_state == "minimized":
        print(f"{Colors.PASS}[OK] Browser stayed minimized throughout the entire audit!{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}[FAIL] Browser was popped! Final state: {final_state}{Colors.ENDC}")
    
    # Count results
    passed = sum(1 for r in RESULTS if r["verdict"] == "PASS")
    failed = sum(1 for r in RESULTS if "FAIL" in str(r["verdict"]))
    popped = sum(1 for r in RESULTS if r.get("popped") and not r.get("expected_pop"))
    skipped_n = sum(1 for r in RESULTS if "SKIPPED" in str(r["verdict"]))
    
    print(f"\n{Colors.BOLD}TOTALS: {passed} passed, {failed} failed, {popped} unexpected pops, {skipped_n} skipped{Colors.ENDC}")
    
    # ============================================================
    # SAVE RESULTS
    # ============================================================
    out_dir = os.path.dirname(os.path.abspath(__file__))
    
    json_path = os.path.join(out_dir, "audit_results.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(RESULTS, f, indent=2, ensure_ascii=False)
    
    md_path = os.path.join(out_dir, "audit_results.md")
    generate_markdown(md_path, final_state, passed, failed, popped, skipped_n)
    
    print(f"\n{Colors.PASS}Results saved to:{Colors.ENDC}")
    print(f"  JSON: {json_path}")
    print(f"  MD:   {md_path}")
    
    await ws.close()

def generate_markdown(path, final_state, passed, failed, popped, skipped):
    md = "# StealthDOM Headless Audit — Minimized Window\n\n"
    md += "> This report definitively tests every MCP tool while the browser window is minimized.\n"
    md += "> For each tool, `windowState` is checked **before and after** the call to detect pops.\n\n"
    md += f"**Final Window State:** `{final_state}`  \n"
    md += f"**Summary:** {passed} passed, {failed} failed, {popped} unexpected pops, {skipped} skipped / {len(RESULTS)} total\n\n"
    
    # Simple flat table
    md += "| # | Tool | Action | Verdict | Pre | Post | Duration | Error |\n"
    md += "|---|---|---|---|---|---|---|---|\n"
    
    for i, r in enumerate(RESULTS, 1):
        verdict = r["verdict"]
        if verdict == "PASS":
            icon = "✅"
        elif "POPPED" in str(verdict):
            icon = "🔴"
        elif "SKIPPED" in str(verdict):
            icon = "⏭️"
        elif "FAIL" in str(verdict):
            icon = "⚠️"
        else:
            icon = "❓"
        
        error_str = (r.get("error") or "")[:80].replace("|", "\\|")
        md += f"| {i} | `{r['tool']}` | `{r['action']}` | {icon} {verdict} | `{r['pre_state']}` | `{r['post_state']}` | {r['duration']}s | {error_str} |\n"
    
    md += "\n"
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(md)

if __name__ == "__main__":
    asyncio.run(main())
