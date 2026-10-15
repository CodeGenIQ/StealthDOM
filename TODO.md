# StealthDOM Roadmap & TODO

> Every item in this file has a unique number so you can reference it directly.
> Example: "Let's work on TODO #14."

---

## Phase 1 — API Polish & Quick Wins ✅ Completed

- [x] **#1 — Tool Consolidation**: Merged duplicate tools, reducing MCP tool count from 52 to 50 (saving prompt tokens).
- [x] **#2 — Hierarchical Fully-Qualified Virtual IDs**: Updated ID system from `browser:tabId` to `browser:windowId:tabId:frameId`. Gives AI agents immediate topological context without extra API calls.
- [x] **#3 — Browser-Specific Tab Creation (`browser_new_tab`)**: Added `window_id` routing to fix cross-talk when multiple browsers (Brave/Edge/Chrome) are connected simultaneously.
- [x] **#4 — Tab Discarding (`browser_discard_tab`)**: Added `chrome.tabs.discard(tabId)` to forcefully put tabs into Memory Saver mode for testing agent resilience.

---

## Phase 2 — God Mode & Latency Optimization ✅ Completed

- [x] **#5 — Batching Engine (`browser_execute_sequence`)**: Agents send 5–10 actions (click, type, wait, fill) in a single WebSocket payload for zero-latency execution. See [God Mode Manifesto](./docs/god_mode_manifesto.md).
- [x] **#6 — DOM Mutation Observer for Wait Conditions**: Replaced slow polling loops with native JS `MutationObserver`. `browser_wait` resolves the exact millisecond a target element renders.
- [x] **#7 — Native CDP Clipboard Paste (`browser_paste`)**: Instant injection of massive 10,000+ token prompts into editors via CDP, replacing the deprecated `execCommand`.

---

## Phase 3 — Large Data & Payload Reliability ✅ Completed

- [x] **#8 — 50MB WebSocket Payload Limit**: Implemented `max_size=50_000_000` overrides on both `bridge_server.py` and `stealth_dom_mcp.py`, fully unlocking Vision models and massive DOM extraction tasks.

---

## Phase 4 — Advanced Cloaking & Interception (In Progress)

- [x] **#9 — Network Asset Blocking (`browser_toggle_asset_blocking`)**: Implemented `declarativeNetRequest` DNR layer to block tracking pixels, analytics, and heavy fonts globally.
- [ ] **#10 — Advanced Request Mocking (`regexFilter`)**: Implement `regexFilter` support via `declarativeNetRequest` for surgical request targeting. Use cases: anti-telemetry cloak (block `/log` pings), API response injection, credential shielding.
- [ ] **#11 — Active Sanitizer (Script Interception)**: Implement `Debugger.scriptParsed` interception to neuter bot-detection logic at runtime level before it executes. *(Pillar B of the God Mode Manifesto)*
- [ ] **#12 — Built-in Proxy Support**: Add rotating proxy pool management, allowing the bridge to route extension requests through configurable proxies.

---

## Phase 5 — MCP Tool Set Optimization (Agent Context Efficiency)

*Goal: reduce context token overhead and eliminate agent confusion from similar-looking tools.*

### Demote to WebSocket-Only (Remove from MCP)

- [ ] **#13 — Demote `browser_mouse_down`**: Primitive building block. No agent task requires holding a mouse button independently — `browser_mouse_drag` covers all drag use cases. Move to WebSocket-only.
- [ ] **#14 — Demote `browser_mouse_up`**: Paired primitive with `browser_mouse_down`. Same rationale. Move to WebSocket-only.
- [ ] **#15 — Demote `browser_mouse_move`**: Pre-positioning before a click adds no value for agents; CDP clicks don't require trajectory setup. `browser_hover` covers the only real agent use case (revealing dropdowns). Move to WebSocket-only.
- [ ] **#16 — Demote `browser_scroll_into_view`**: `browser_click` already auto-scrolls elements into view before clicking. Agents that call this independently are demonstrating confusion, not intent. Move to WebSocket-only.
- [ ] **#17 — Demote `browser_discard_tab`**: Memory management operation. No AI task flow requires proactively sleeping a tab. Move to WebSocket-only.
- [ ] **#18 — Demote `browser_resize_window`**: Developer/setup tool. Agents never need to resize a window during a task. Move to WebSocket-only.
- [ ] **#19 — Demote `browser_stop_net_capture`**: Agents never explicitly stop capture, and don't need to — the 5,000-entry circular buffer keeps rolling. The `start → get` pattern is sufficient. Move to WebSocket-only.
- [ ] **#20 — Demote `browser_toggle_asset_blocking`**: Researcher/performance tool. Rarely part of any agent task flow. Move to WebSocket-only.

*After #13–#20: MCP tool count drops from 50 → 42.*

### Merge Confusing Tool Pairs

- [ ] **#21 — Merge `browser_upload_file` + `browser_upload_file_cdp`**: Agents cannot reliably distinguish between these two. `browser_upload_file_cdp` (isTrusted: true via CDP) is always the correct choice. Proposal: rename `browser_upload_file_cdp` to `browser_upload_file`, keeping both `file_paths` and `data_urls` params. Demote the old synthetic-event version to WebSocket-only.
- [ ] **#22 — Clarify `browser_type` vs `browser_fill` confusion**: Agents frequently pick the wrong one. `browser_type` appends; `browser_fill` clears then sets. At minimum, add a prominent ⚠️ warning to each docstring. Longer term: consider merging into a single `browser_fill(value, replace=True)` with `replace=False` for append behavior.

### Add High-Value Missing Tools

- [ ] **#23 — Add `browser_get_page_info(tab_id)`**: Returns `{url, title, readyState}` for the specified tab in one call. Currently agents must call `browser_list_tabs()` (dumps ALL tabs) just to confirm a navigation succeeded. The capabilities doc even acknowledges this as a workaround tip — a sign it's painful enough to warrant its own tool.
- [ ] **#24 — Add `browser_find_and_click(tab_id, selectors)`**: Accepts a prioritized list of CSS selectors and clicks the first one that is found and visible. Eliminates the common 3–5 round-trip retry pattern where agents try `#submit`, then `.submit-btn`, then `[type=submit]` one at a time.

### Fix Existing Documentation / Metadata

- [ ] **#25 — Fix `stealth://capabilities` tool count**: The capabilities resource currently says "47 total" but there are 50 MCP tools. Also missing `browser_upload_file_cdp` from the tool list entirely. Needs updating whenever #13–#24 are resolved.
- [ ] **#26 — Harden `browser_execute_sequence` description**: Currently underused by agents despite being the most context-efficient tool available. Update the docstring to actively market it: *"Use this instead of individual tool calls for any multi-step task. Reduces 10 round-trips to 1."*
- [ ] **#27 — Set safe default for `browser_read_content` max_length**: Current default is `0` (no limit). Agents routinely pull full-page HTML into context, burning 50–100K tokens. Consider defaulting to `50000` characters with an override for when agents genuinely need full content.

---

## Phase 6 — God Mode Pillars B & C (Future)

*See [God Mode Manifesto](./docs/god_mode_manifesto.md) for full design.*

- [ ] **#28 — Pillar B: Semantic Script Rewriter**: Intercept `Debugger.scriptParsed` events. Before the browser executes a script, run it through a sanitizer that regex-replaces detection logic (e.g., `isTrusted === false` → `false`, `navigator.webdriver` getter injection). Neuters fingerprinting at source.
- [ ] **#29 — Pillar C: Semantic Differential Observer**: Instead of sending full page HTML/text after every step, send only what *changed* since the last observation. Keeps agent context lean and focused on new information only (new popups, success messages, state changes).

---

## Phase 7 — Enterprise & Cloud Console Enhancements (Spec Codified)

> [!NOTE]
> Based on field testing with Oracle Cloud Infrastructure, Google Cloud, and embedded xterm.js terminals. See detailed spec in [docs/05_enterprise_interaction_enhancements.md](docs/05_enterprise_interaction_enhancements.md).

- [ ] **#30 — Transparent Iframe / Nested Context Traversal**: Automatically traverse child iframes in `browser_query`, `browser_click`, `browser_type`, `browser_get_text`, and `browser_fill` without requiring manual JS traversal.
- [ ] **#31 — Terminal & Code Editor Input Mode**: Add `mode="paste"` / `mode="cdp_raw"` to `browser_type` / `browser_fill` (or dedicated `browser_terminal_send`) to seamlessly type/paste into xterm.js, Monaco, and canvas components via synthetic `ClipboardEvent` and CDP `Input.insertText`.
- [ ] **#32 — Automatic Shadow DOM Piercing**: Support recursive `#shadow-root` traversal for enterprise web components in all selector queries.
- [ ] **#33 — 2-Tier Resilient Click Strategy**: In `browser_click`, auto-scroll target into view, attempt CDP coordinate click, and fallback to DOM `.click()` if obscured by overlays or notification banners.
- [ ] **#34 — Single-Roundtrip Action Verification**: Add optional `screenshot_after=True` parameter to interaction tools to eliminate separate `browser_screenshot` roundtrips for vision models.
- [ ] **#35 — JavaScript Render Composition Fallback (`html2canvas`)**: If CDP `captureScreenshot` fails (e.g., because the browser is fully occluded or minimized), inject `html2canvas` into the content script to manually read the DOM tree and paint it onto an HTML5 `<canvas>`.
- [ ] **#36 — Built-in Rotating Proxy Pool Management**: Automated pipeline to fetch, test/verify connectivity, and maintain a rotating pool of healthy proxies for the extension to use (expands on #12).

---

## Completed & Integrated (Archive)

- [x] **Handle Native JavaScript Dialogs (`browser_handle_dialog`)**: CDP interception of `alert/confirm/prompt`.
- [x] **CDP-based Native Mouse Interactions (`browser_mouse_*`)**: Produces `isTrusted: true` events.
- [x] **CDP-based Native Keyboard Dispatch**: Native key input via CDP.
- [x] **`setInputFiles` Filename Support**: Added `filename` parsing for file upload extensions.
- [x] **Screenshot Tools Require Paths**: Removed Base64 output to prevent payload crashing.
- [x] **Redundancy Audit & Pruning**: Consolidated redundant tools.
