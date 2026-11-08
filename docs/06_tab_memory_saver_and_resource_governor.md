# 06 — Automatic Tab Memory Saver & Resource Governor (`TODO #37`)

> **Status**: `IMPLEMENTED`
> **Target Components**: `extension/background.js`, `extension/popup.html`, `extension/popup.js`, `extension/parked.html`, `extension/parked.js`, `docs/06_tab_memory_saver_and_resource_governor.md`
> **Persistence**: `chrome.storage.local` (`stealthdom_tab_governor`) + `localStorage` mirror in `popup.js` for instant zero-flicker UI rendering.

---

## 1. Problem Statement & Empirical Findings

On older or memory-constrained laptops (`DELL-LATITUDE-E`), Chromium/Brave tabs accumulate gigabytes of renderer RAM and background CPU even when Brave's built-in **Memory Saver** (`high_efficiency_mode.state = 2, aggressiveness = 2`) is set to **"Maximum"**.

Live diagnostics across a 41-tab, 8-window Brave session revealed **why specific tabs remain loaded in RAM** even with Brave's Memory Saver on "Maximum" (which *did* successfully sleep 13 background tabs):

1. **Brave's "Minimized Window Front-Tab" Rule (Primary Reason)**:
   - Every browser window has one frontmost tab (`tab.active === true`), even when the entire window is minimized to the taskbar (`window.state === "minimized"`).
   - Chromium's native Memory Saver **never discards an `active: true` tab**, meaning 8 minimized windows permanently keep 8 frontmost tabs (e.g., TradingView, TradeSightIQ, YouTube, ChatGPT, TastyTrade) loaded in RAM forever.
2. **Brave's Built-In Heuristic Exemptions & Lack of a Hard Tab Cap**:
   - Native Memory Saver only uses an inactivity timer (`Conservative` / `Balanced` / `Maximum`) and has no setting for **"Keep at most $N$ tabs loaded in RAM"**.
   - It also exempts background tabs that hold active media/video sessions (e.g. unclosed YouTube watch pages), active WebSockets, or unsubmitted form state.
3. **Note on `StealthDOM` & Native Memory Saver**:
   - As documented in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#L26-L38), `StealthDOM` only injects `content_script.js` on-demand into tabs targeted by an AI command, and Chromium's C++ Memory Saver **completely ignores** `content_script.js`'s JS-level anti-throttle and kills the renderer process anyway when Brave decides to discard a tab.

---

## 2. Proposed Architecture & Feature Set

### Proposal A — Automatic Tab Memory Governor (`TabMemoryGovernor` in `background.js`)

Track per-tab last-active timestamps (`_tabLastAccessed = new Map()`) updated on `chrome.tabs.onActivated`, `chrome.windows.onFocusChanged`, `chrome.tabs.onUpdated`, and any incoming `StealthDOM` AI command (`bridgeRouteCommand`). Run an evaluation sweep every **15 seconds** plus immediately whenever a tab is activated or created:

1. **Hard Cap on Loaded Tabs (`maxActiveTabs`, default: `3`, range: `1–20` or `0 = Unlimited`)**:
   - Count all currently loaded (non-discarded) tabs across all windows.
   - If loaded tabs exceed `maxActiveTabs`, sort eligible tabs by `_tabLastAccessed` (oldest first) and immediately call `chrome.tabs.discard(tabId)` until loaded tabs $\le$ `maxActiveTabs`.
2. **Inactivity Sleep Timer (`inactivityTimeoutMinutes`, default: `5` min, options: `1, 2, 5, 10, 15, 30, 60` min)**:
   - Any eligible non-active tab untouched by the user or AI for longer than `inactivityTimeoutMinutes` is automatically discarded via `chrome.tabs.discard(tabId)`.
3. **Minimized Window Front-Tab Sleeper (`sleepMinimizedWindows`, default: `true`)**:
   - Chromium's `chrome.tabs.discard(tabId)` API rejects discarding a tab while `tab.active === true`.
   - When a window has `window.state === "minimized"` and its active tab exceeds the inactivity timer (or needs to be evicted to satisfy `maxActiveTabs`):
     1. Create a lightweight `about:blank` parking tab in that minimized window (`active: true`).
     2. Call `chrome.tabs.discard(heavyTabId)` on the now-backgrounded heavy tab, freeing 100% of its renderer process RAM and CPU.
     3. Record `_minimizedParkedWindows.set(windowId, { blankTabId, parkedTabId: discardedTab.id })` in memory and `chrome.storage.local`.
     4. When the user restores/focuses that window (`chrome.windows.onFocusChanged` or `chrome.tabs.onActivated`), automatically activate `parkedTabId` and close `blankTabId`.
4. **Protection Rules & Domain Whitelist**:
   - **`protectPinnedTabs`** (default: `true`): Skip `tab.pinned === true`.
   - **`protectAudioTabs`** (default: `false`): Optionally skip `tab.audible === true`.
   - **`whitelistDomains`** (default: `[]`): Array of domain substrings/hostnames (e.g. `tradingview.com`) exempt from auto-discard, with a 1-click **"+ Exclude Current Site"** toggle in the popup.

---

### Proposal B — Zero-Friction AI Agent Compatibility (Never Break AI Workflows)

To ensure aggressive tab sleeping never breaks AI agents using `StealthDOM`:

1. **AI Activity Protection Window (`aiGraceMinutes`, default: `2` min)**:
   - Any tab targeted by a `StealthDOM` command (`bridgeRouteCommand`) is marked active for `Math.max(2, inactivityTimeoutMinutes)` minutes so a multi-step AI workflow is never discarded mid-task.
2. **Discarded Tab ID Alias Map (`_discardedTabAliasMap`)**:
   - When `chrome.tabs.discard(oldTabId)` executes, Chromium replaces the tab's numeric ID with a new `discardedTab.id`.
   - `background.js` will record `_discardedTabAliasMap.set(oldTabId, discardedTab.id)` so if an AI agent references a `tabId` from an earlier `browser_list_tabs()` call, `StealthDOM` transparently resolves the new `tabId` instead of failing with `No tab with id`.
3. **Auto-Wake on AI Command (`autoWakeForAgent`, default: `true`)**:
   - If an AI agent sends a DOM/eval/screenshot command to a tab where `tab.discarded === true`, `background.js` automatically calls `chrome.tabs.reload(tabId)` and waits for load completion (`status === 'complete'`, up to 10s) before injecting `content_script.js` and executing the command.

---

## 3. Proposed Extension Popup UI (`extension/popup.html` & `extension/popup.js`)

Expand `popup.html` (`width: 310px`) with a clean, dark-themed **Memory Saver & Tab Governor** panel below the existing StealthDOM Enable/Status controls, backed by both `localStorage` (instant load) and `chrome.storage.local` (shared with `background.js` service worker):

```text
┌─────────────────────────────────────────────┐
│ [Icon] StealthDOM                    v3.4.0 │
├─────────────────────────────────────────────┤
│ StealthDOM Bridge                    [ ON ] │
│ ● Connected to bridge                       │
├─────────────────────────────────────────────┤
│ MEMORY SAVER & TAB GOVERNOR          [ ON ] │
│                                             │
│ Active Tabs in RAM:   4 loaded · 37ohon     │
│ [       ⚡ Sleep All Inactive Tabs Now     ] │
│                                             │
│ Max Loaded Tabs           [   3   ] (1–20)  │
│ Sleep Inactive After      [ 5 min       ▾ ] │
│ Sleep Minimized Windows              [ ON ] │
│ Protect Pinned Tabs                  [ ON ] │
│ Protect Audio Tabs                   [ OFF] │
│                                             │
│ Never Sleep Domains (comma/line separated): │
│ [ localhost, tradingview.com              ] │
│ [ + Exclude Current Tab Domain            ] │
└─────────────────────────────────────────────┘
```

---

## 4. Implementation Checklist (`TODO #37`)

- [x] **Step 1**: Implement `TabMemoryGovernor` in `extension/background.js` with `chrome.storage.local` persistence (`stealthdom_tab_governor`), `maxActiveTabs` LRU eviction, `inactivityTimeoutMinutes` sweep, minimized-window `parked.html` parking + auto-restore, `_discardedTabAliasMap`, and `autoWakeForAgent`.
- [x] **Step 2**: Build the **Memory Saver & Tab Governor** UI in `extension/popup.html` and `extension/popup.js` with dual `localStorage` + `chrome.storage.local` persistence, live loaded/sleeping tab counters, `"Sleep All Inactive Tabs Now"` button, and `"Exclude Current Tab Domain"` quick button.
- [x] **Step 3**: Verify in live Brave browser, update `StealthDOM/CHANGELOG.md` and `docs/`, and commit.
