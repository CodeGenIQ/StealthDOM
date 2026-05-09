---
description: Finalize a completed TODO item. Updates all docs, writes changelog entry, removes item from TODO, commits to git. Run after every implementation.
args: todo_number — the #N of the item just completed (e.g., 14)
---

## Step 1 — Update MCP Tool Definitions (if tools changed)

If any MCP tool was added, removed, renamed, or had its parameters changed:
- Update the tool's docstring in `stealth_dom_mcp.py` following `.agents/skills/compress_docstrings.md`.
- Update the TOOLS list and count in the MCP instructions string (search for "TOOLS (N)" in stealth_dom_mcp.py).
- Update the `stealth://capabilities` resource tool list and count (search for "Tool Reference" in stealth_dom_mcp.py).

## Step 2 — Regenerate Schema

Follow `.agents/skills/regen_schema.md` to regenerate `tool_schema_dump.json`.
This MUST be done any time any MCP tool definition changes.

## Step 3 — Update Docs (only files affected by this change)

Check each of these and update ONLY if relevant to the TODO item:
- `docs/03_api_reference.md` — if a tool was added, removed, renamed, or params changed
- `README.md` — if the MCP tool count changed (search "50 MCP tools")
- `docs/00_why_stealthdom.md` — if the tool count changed (search "50 MCP tools")
- `docs/01_architecture.md` — if the tool count changed
- `docs/02_installation_guide.md` — if the tool count changed

## Step 4 — Write CHANGELOG Entry

Open `CHANGELOG.md`. Under `## [Unreleased]`, add a new bullet:
```
- #N — <one-sentence description of what changed> — <reason, taken from the TODO item description>
```
Include today's date as a comment if starting a new date group.

## Step 5 — Remove from TODO

In `TODO.md`, delete the entire line for this item (`- [ ] **#N — ...`).
Do NOT move it to a "Completed" section — CHANGELOG.md is the permanent record.

## Step 6 — Git Commit

Run these commands from the project root:
```
git add -A
git commit -m "#N: <short description matching the CHANGELOG entry>"
```
Do NOT `git push` — leave that for the user.

## Step 7 — Report to User

Tell the user:
- What was changed (files modified)
- The git commit message used
- What the next recommended TODO item is (lowest unchecked number)
