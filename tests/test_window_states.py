import asyncio
import json
import os
import sys
import time
import websockets
from websockets.exceptions import ConnectionClosed

BRIDGE_URL = "ws://127.0.0.1:9878"

# Colors for terminal
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

# Report data structure
report_data = {
    "phases": []
}

async def bridge_send(ws, action, **kwargs):
    msg_id = str(int(time.time() * 1000))
    payload = {"_msg_id": msg_id, "action": action, **kwargs}
    await ws.send(json.dumps(payload))
    while True:
        try:
            resp = await asyncio.wait_for(ws.recv(), timeout=30.0)
            data = json.loads(resp)
            if data.get("_msg_id") == msg_id:
                return data
        except asyncio.TimeoutError:
            return {"success": False, "error": "WebSocket receive timeout"}

async def get_tabs(ws):
    resp = await bridge_send(ws, "listTabs")
    if resp.get("success"):
        return resp.get("data", [])
    return []

async def ensure_base_test_tab(ws):
    tabs = await get_tabs(ws)
    for t in tabs:
        if "example.com" in t.get("url", ""):
            print(f"[*] Reusing existing example.com tab (ID: {t['id']})")
            return t
    
    print("[*] Creating base test tab (example.com)...")
    resp = await bridge_send(ws, "newTab", url="https://example.com", active=False)
    if not resp.get("success"):
        print(f"Failed to create test tab: {resp}")
        sys.exit(1)
    
    # Wait for load
    tab_id = resp["data"]["tabId"]
    await asyncio.sleep(2)
    
    tabs = await get_tabs(ws)
    for t in tabs:
        if t["id"] == tab_id:
            return t
    print("Could not find created tab in listTabs")
    sys.exit(1)

async def run_test_action(ws, phase_name, action_name, expected_state, tab, func):
    print(f"\n  Running: {action_name}...")
    
    # Pre-check
    tabs = await get_tabs(ws)
    pre_tab = next((t for t in tabs if t["id"] == tab["id"]), None)
    if not pre_tab:
        result = {"action": action_name, "status": "FAIL", "error": "Tab vanished"}
        print(f"    {Colors.FAIL}FAIL: Tab vanished{Colors.ENDC}")
        return result
        
    pre_state = pre_tab.get("windowState", "unknown")
    if pre_state != expected_state:
        print(f"    {Colors.WARNING}WARNING: Pre-state {pre_state} does not match expected {expected_state}{Colors.ENDC}")

    start_time = time.time()
    
    # Execute
    try:
        resp = await func()
    except Exception as e:
        resp = {"success": False, "error": str(e)}
        
    duration = time.time() - start_time

    # Post-check
    tabs = await get_tabs(ws)
    post_tab = next((t for t in tabs if t["id"] == tab["id"]), None)
    post_state = post_tab.get("windowState", "unknown") if post_tab else "vanished"
    
    # Did it pop?
    popped = (pre_state == expected_state) and (post_state != expected_state)
    
    if resp.get("success"):
        status = "PASS"
        if popped:
            status = "FAIL (POPPED)"
            color = Colors.FAIL
        else:
            color = Colors.OKGREEN
    else:
        status = f"FAIL: {resp.get('error', 'Unknown Error')}"
        color = Colors.FAIL
        if "timeout" in status.lower() or "cdp_timeout" in status.lower():
            status = "TIMEOUT"
            color = Colors.WARNING

    print(f"    {color}[{status}]{Colors.ENDC} ({duration:.2f}s) | State: {pre_state} -> {post_state}")
    
    return {
        "action": action_name,
        "status": status,
        "duration": duration,
        "pre_state": pre_state,
        "post_state": post_state,
        "popped": popped,
        "response": resp
    }

async def execute_phase(ws, phase_name, expected_state, base_tab):
    print(f"\n{Colors.HEADER}{'='*50}{Colors.ENDC}")
    print(f"{Colors.HEADER} PHASE: {phase_name} {Colors.ENDC}")
    print(f"{Colors.HEADER}{'='*50}{Colors.ENDC}")
    
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, input, f"\n> Please ensure browser is in state: '{expected_state}'. Press ENTER when ready: ")
    
    phase_results = {
        "phase": phase_name,
        "expected_state": expected_state,
        "tests": []
    }
    
    # Test 1: Screenshot existing tab
    async def do_screenshot():
        return await bridge_send(ws, "captureScreenshot", tabId=base_tab["id"])
    phase_results["tests"].append(await run_test_action(ws, phase_name, "CDP Screenshot (Existing Tab)", expected_state, base_tab, do_screenshot))

    # Test 2: Input (evaluate JS) existing tab
    async def do_eval():
        return await bridge_send(ws, "executeScript", tabId=base_tab["id"], code="document.title")
    phase_results["tests"].append(await run_test_action(ws, phase_name, "CDP Evaluate (Existing Tab)", expected_state, base_tab, do_eval))

    # Test 3: Full Page Screenshot
    async def do_full_page():
        return await bridge_send(ws, "captureFullPageScreenshot", tabId=base_tab["id"], maxHeight=5000)
    phase_results["tests"].append(await run_test_action(ws, phase_name, "CDP Full Page Screenshot (Existing Tab)", expected_state, base_tab, do_full_page))
    
    # Test 4: New Background Tab Screenshot
    print(f"\n  Running: Create New Background Tab & Screenshot...")
    pre_tabs = await get_tabs(ws)
    pre_state = next((t["windowState"] for t in pre_tabs if t["id"] == base_tab["id"]), "unknown")
    
    new_tab_resp = await bridge_send(ws, "newTab", url="https://example.com", active=False)
    new_tab_id = new_tab_resp.get("data", {}).get("tabId")
    
    if new_tab_id:
        async def do_new_tab_screenshot():
            return await bridge_send(ws, "captureScreenshot", tabId=new_tab_id)
            
        test_res = await run_test_action(ws, phase_name, "CDP Screenshot (Newly Created Background Tab)", expected_state, base_tab, do_new_tab_screenshot)
        phase_results["tests"].append(test_res)
        
        # Cleanup
        await bridge_send(ws, "closeTab", tabId=new_tab_id)
    else:
        print(f"    {Colors.FAIL}Failed to create new tab{Colors.ENDC}")
        
    report_data["phases"].append(phase_results)

def generate_report():
    with open("tests/state_test_results.json", "w") as f:
        json.dump(report_data, f, indent=2)
        
    md = "# StealthDOM Window State Test Report\n\n"
    md += "This report verifies the integrity of headless operations across different physical window states.\n\n"
    
    for phase in report_data["phases"]:
        md += f"## Phase: {phase['phase']} (Expected: `{phase['expected_state']}`)\n\n"
        md += "| Action | Status | Pre-State | Post-State | Duration |\n"
        md += "|---|---|---|---|---|\n"
        for t in phase["tests"]:
            status = t["status"]
            if "PASS" in status:
                icon = "✅"
            elif "TIMEOUT" in status:
                icon = "⏱️"
            else:
                icon = "❌"
            md += f"| {t['action']} | {icon} {status} | `{t['pre_state']}` | `{t['post_state']}` | {t['duration']:.1f}s |\n"
        md += "\n"
        
    with open("tests/STATE_TEST_REPORT.md", "w", encoding="utf-8") as f:
        f.write(md)
        
    print(f"\n{Colors.OKGREEN}Test complete. Report saved to tests/STATE_TEST_REPORT.md{Colors.ENDC}")

async def main():
    if os.path.exists("tests/state_test_results.json"):
        os.remove("tests/state_test_results.json")
    if os.path.exists("tests/STATE_TEST_REPORT.md"):
        os.remove("tests/STATE_TEST_REPORT.md")
        
    print(f"{Colors.OKCYAN}Connecting to Bridge Server...{Colors.ENDC}")
    try:
        async with websockets.connect(BRIDGE_URL) as ws:
            print(f"{Colors.OKGREEN}Connected!{Colors.ENDC}")
            
            base_tab = await ensure_base_test_tab(ws)
            
            await execute_phase(ws, "Normal & Visible", "normal", base_tab)
            await execute_phase(ws, "Occluded (Covered by maximized app)", "normal", base_tab)
            await execute_phase(ws, "Minimized", "minimized", base_tab)
            
            generate_report()
            
    except ConnectionRefusedError:
        print(f"{Colors.FAIL}Error: Bridge server not running at {BRIDGE_URL}{Colors.ENDC}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
