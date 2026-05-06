import asyncio
import websockets
import json
import uuid
import os

async def bridge_send(ws, action, **kwargs):
    msg_id = str(uuid.uuid4())[:8]
    msg = {"action": action, "_msg_id": msg_id, **kwargs}
    await ws.send(json.dumps(msg))
    while True:
        raw = await ws.recv()
        data = json.loads(raw)
        if data.get("_msg_id") == msg_id:
            return data

async def ensure_test_tab(ws, url: str):
    r = await bridge_send(ws, "listTabs")
    for t in r.get("data", []):
        if t["url"].rstrip("/") == url.rstrip("/"):
            await bridge_send(ws, "closeTab", tabId=t.get("virtualId") or t["id"])
            break
    r = await bridge_send(ws, "newTab", url=url, active=True)
    if r.get("success"):
        await asyncio.sleep(1.5)
        return r["data"]["tabId"]
    return None

async def main():
    ws = await websockets.connect("ws://127.0.0.1:9878")
    
    # 1. Open new tab in foreground
    r = await bridge_send(ws, "newTab", url="about:blank", active=True)
    tab_id = r["data"]["tabId"]
    await asyncio.sleep(1.0)
    
    # 2. Inject the HTML with SYNCHRONOUS alert
    html = """
    <button id="alertBtn" onclick="alert('Hello Alert Sync!')">Show Alert Sync</button>
    """
    await bridge_send(ws, "evaluate", tabId=tab_id, code=f"document.body.innerHTML = `{html}`")
    await asyncio.sleep(0.5)
    
    # 3. Use CDP click. 
    # Because it's sync, the click command might hang if the dialog blocks the CDP response!
    print("Clicking using CDP...")
    try:
        # We wrap in timeout because if it hangs, it means the dialog is open and debugger is still attached!
        r = await asyncio.wait_for(bridge_send(ws, "click", tabId=tab_id, selector="#alertBtn"), timeout=2.0)
        print("Click result:", r)
    except asyncio.TimeoutError:
        print("Click timed out! This means the debugger is still attached and the dialog is open.")
    
    print("Handling dialog...")
    # If the debugger is still attached from the click, we can't attach again in handleDialog.
    # BUT handleDialog in background.js will try to attach and fail.
    # We would need to modify background.js to use the existing session!
    r = await bridge_send(ws, "handleDialog", tabId=tab_id, accept=True)
    print("Result:", r)
    
    await bridge_send(ws, "closeTab", tabId=tab_id)
    await ws.close()

if __name__ == "__main__":
    asyncio.run(main())
