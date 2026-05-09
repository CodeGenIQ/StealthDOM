---
description: Show all open TODO items, ask the user which to handle, implement it, then run /ship_todo to finalize.
---

1. Read `TODO.md`. Extract every line starting with `- [ ]`. Display them as a clean numbered list showing only the item number and title (e.g., "#13 — Demote browser_mouse_down to WebSocket-only").

2. Ask the user: **"Which TODO number would you like to work on?"** Wait for their response before proceeding.

3. Once the user picks a number (e.g., "#14"):
   - Re-read the full description of that item from `TODO.md`.
   - Identify which files need to change (stealth_dom_mcp.py, bridge_server.py, extension/background.js, docs/, etc.).
   - Read each relevant file BEFORE making any changes. Never modify from memory.

4. Implement the change. Follow `.agents/rules/core_rules.md` throughout.

5. After implementation is complete, run the `/ship_todo` workflow, passing the TODO number.
