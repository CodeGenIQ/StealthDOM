# StealthDOM 2.0: The "God Mode" Manifesto

## 1. Vision & Goal
The objective of StealthDOM 2.0 is to move from **Passive Browser Control** (where an agent micromanages every click) to **Active Environment Instrumentation**. This achieves two things:
1.  **Zero Latency:** Eliminates the round-trip delay between the Agent and the Browser.
2.  **Absolute Stealth:** Proactively neuters bot-detection scripts before they even execute.

---

## 2. The Core Pillars

### Pillar A: The "Native Sequence" Engine (Batching)
**The Problem:** Current automation requires a separate tool call for every click, type, and wait. On high-latency sites (banks/Gmail), this makes the agent feel slow and "bot-like."
**The Fix:** Implement a `browser_execute_sequence` tool.
- **How it works:** The agent sends a JSON manifest of actions (e.g., `[click #a, wait_for #b, type "text", click #c]`).
- **Execution:** The Extension executes these steps natively in a single loop using CDP (Hardware Events).
- **Benefit:** Reduces a 10-second multi-step task to <1 second.

### Pillar B: Proactive Script Interception (The "God Mode" Rewriter)
**The Problem:** Sites use `isTrusted`, `navigator.webdriver`, and timing checks to detect agents.
**The Fix:** Use the CDP `Debugger` domain to intercept scripts.
- **How it works:** Listen for `Debugger.scriptParsed`. Before the browser executes a script, we run it through a "Sanitizer."
- **Sanitization:** Automatically regex-replace detection logic.
    - *Example:* Replace `if(event.isTrusted === false)` with `if(false)`.
    - *Example:* Inject `Object.defineProperty(navigator, 'webdriver', {get: () => false})` at the very first line of the first script.
- **Benefit:** We don't have to "lie" to the page; we simply remove the page's ability to ask the question.

### Pillar C: Semantic Observation (Context Bloat Reduction)
**The Problem:** Sending full HTML/Text to the agent after every step fills up the "Context Window" and leads to hallucinations.
**The Fix:** Implementation of a "Semantic Differential" (Diff) tool.
- **How it works:** The extension only sends what has *changed* on the page since the last observation.
- **Benefit:** Keeps the agent's memory lean and focused only on new information (like a success message or a new popup).

---

## 3. Implementation Roadmap

### Phase 1: The Sequence Player
- Add a background script listener for a `PLAY_SEQUENCE` message.
- Build a robust `wait_for` logic that can handle network idle, element presence, and URL changes natively.

### Phase 2: The CDP Debugger Bridge
- Upgrade the bridge server to support `Debugger` domain commands.
- Implement the "Script Sanitizer" logic to hunt for common FingerprintJS patterns.

### Phase 3: Hardware Signature Spoofing
- Use CDP `Emulation` to perfectly mimic the hardware signatures (fonts, canvas, WebGL) of a generic, non-automated browser.

---

## 4. Why This Works
By moving the logic into the **Chrome Extension layer**, we are operating "inside the house." Standard bot detectors look for burglars coming through the window (the network); they aren't prepared for the "house" itself (the browser) to be rewriting its own memory.

---
**Note for Future Agents:** Use this blueprint to guide architecture decisions. Do not deviate into "passive" patterns unless the site has zero security.
