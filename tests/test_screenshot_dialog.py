import asyncio
import json
import websockets
import os

async def main():
    async with websockets.connect("ws://127.0.0.1:9878") as ws:
        # Get tabs
        await ws.send(json.dumps({"action": "listTabs", "_msg_id": "1"}))
        resp = json.loads(await ws.recv())
        tabs = resp.get("data", [])
        if not tabs:
            print("No tabs")
            return
        tab_id = tabs[0]["virtualId"]
        
        # Navigate to test page
        test_url = "file:///" + os.path.abspath("tests/test_dialog.html").replace('\\', '/')
        await ws.send(json.dumps({"action": "navigate", "tabId": tab_id, "url": test_url, "_msg_id": "2"}))
        print("Navigate:", await ws.recv())
        await asyncio.sleep(1)
        
        # Open prompt (setTimeout so we don't block the evaluate command itself)
        print("Opening dialog...")
        await ws.send(json.dumps({
            "action": "evaluate", 
            "tabId": tab_id, 
            "code": "setTimeout(() => window.prompt('Test Prompt'), 500);",
            "_msg_id": "3"
        }))
        print("Evaluate:", await ws.recv())
        await asyncio.sleep(1.5)
        
        # Take screenshot!
        print("Taking screenshot while dialog is open...")
        await ws.send(json.dumps({"action": "captureScreenshot", "tabId": tab_id, "_msg_id": "4", "_timeout": 10}))
        screenshot_resp = json.loads(await ws.recv())
        if screenshot_resp.get("success"):
            print("SCREENSHOT SUCCESSFUL!")
        else:
            print("SCREENSHOT FAILED:", screenshot_resp.get("error"))
            
        # Clean up by dismissing dialog
        await ws.send(json.dumps({"action": "handleDialog", "tabId": tab_id, "accept": False, "_msg_id": "5"}))
        print("HandleDialog:", await ws.recv())

asyncio.run(main())
