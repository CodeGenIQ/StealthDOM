# StealthDOM Test Suite

This directory contains the integration tests for the StealthDOM Manifest V3 extension. 

The test runner (`test_stealth_dom.py`) connects to the local StealthDOM websocket bridge and executes a comprehensive suite of tests verifying DOM interaction, tab management, cross-frame execution, and network capturing.

## How It Works

- **Tab Reuse:** The test runner is designed to be completely silent (no popups) for the majority of the tests. It accomplishes this by dynamically creating base test tabs (`httpbin.org/html` and `example.com`) on the first run, and then silently reusing and reloading those same tabs on subsequent runs.
- **Screenshot Engine:** The suite primarily tests the Chrome DevTools Protocol (CDP) screenshot engine, which captures the DOM in the background without stealing focus or triggering UI un-minimization. Note that the extension maintains a fallback path to `chrome.tabs.captureVisibleTab` if CDP is unavailable (e.g., if DevTools is open or if attempting to capture internal `chrome://` pages).
- **Automated Cleanup:** Every time `python test_stealth_dom.py` is executed, the script automatically deletes all previously generated `*.png` screenshots and the `TEST_REPORT.md` file from this folder to ensure a clean slate.
- **Reporting:** Upon completion, the test runner outputs a dynamic `TEST_REPORT.md` file. This report contains the full execution log, the pass/fail results, and detailed diagnostic context for any tests that failed.

## Running the Tests

Ensure the StealthDOM extension is loaded in your browser and the Python bridge server (`bridge_server.py`) is running.

### 1. Automated Integration Suite
Run the standard automated integration tests:
```bash
python test_stealth_dom.py
```
Check this directory after execution for the resulting `TEST_REPORT.md` and any generated `*.png` screenshots.

### 2. Headless Audit (Minimized State Verification)
Run the headless audit script to mathematically prove StealthDOM's capabilities while the browser is minimized:
```bash
python headless_audit/audit_minimized.py
```
*Note: You must manually minimize the browser before running this script.* It asserts that the window state is strictly maintained before and after every action (proving no unwanted pop-ups occurred). Check the `headless_audit` directory for the resulting `audit_results.md`.

### Clean Execution & Window State
The test suite is designed to be as non-intrusive as possible, but **certain tests will intentionally steal focus**:

1. **Focus Stealing & Un-minimizing**: If you run the test suite while your browser is minimized, it will forcefully pop onto your screen. Tests involving native dialogs (`alert()`, `confirm()`) explicitly pull the tab into focus, as Chromium suppresses dialogs on background tabs. Tests verifying window lifecycle (`newWindow`, `newIncognitoWindow`) also prompt the OS to physically draw new windows in the foreground.
2. **Window State Restoration**: At the start of the test suite, it captures the exact state of your browser windows (e.g., `minimized`, `normal`, `maximized`). At the end of the run, it seamlessly restores all windows to that exact original state, cleaning up after the tests that steal focus.
3. **Tab Isolation**: The suite actively manages its own background tabs (`ensure_test_tab`) and closes them appropriately to clear out any dangling Chrome DevTools Protocol (CDP) debuggers from previous crashes.
4. **Clean Canvas Testing (`example.com`)**: Several tests dynamically inject custom HTML into `example.com`. This domain is globally reserved by IANA, loads instantly, and provides a stable slate so DOM interaction tests never fail due to random layout changes.

## Common Errors & Diagnostic Explanations

If a test fails, `TEST_REPORT.md` will automatically provide a clean, grouped markdown report with diagnostic context. Here are the common errors you may encounter:

### Command captureScreenshot timed out
**Chromium Compositor Paused / Tab Asleep**
This timeout generally occurs if the target tab is a background tab that Chrome's "Memory Saver" has frozen (which causes the CDP command to hang indefinitely). The test suite mitigates this by explicitly using dedicated, active test tabs.
*Fix: Ensure the target tab is not frozen by Memory Saver, DevTools is closed on the target tab, and the browser window is at least partially visible if required.*

### Failed to connect to bridge
**Bridge Server Not Running**
The Python integration tests require the StealthDOM extension to be actively running in a browser, with the native messaging host connected. 
*Fix: Ensure the browser is open, the extension is enabled, and the WebSocket bridge (`bridge_server.py`) is running.*
