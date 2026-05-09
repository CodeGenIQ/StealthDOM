# Agent Instructions — StealthDOM

> Any AI agent starting work on this project MUST read this file first.

---

## Mandatory First Steps

1. **Read `TODO.md`** — every open item has a number (#1–#29). Use `/pick_todo` to select one.
2. **Read `CHANGELOG.md`** — understand what's already been done. Never redo completed work.
3. **Read `stealth_dom_mcp.py` lines 150–200** — the MCP instructions string and capabilities resource are the agent-facing contract. Keep them accurate.

---

## Workflow Triggers

Type these to run a named workflow:

| Trigger | What it does |
|---|---|
| `/pick_todo` | Show all open TODO items, ask user which to handle, implement it, then ship |
| `/ship_todo <N>` | Finalize a completed TODO item — docs, changelog, git commit |

See `.agents/workflows/` for the full step-by-step instructions for each.

---

## Core Rules

- **NEVER modify `bridge_server.py` or `extension/`** unless the TODO item explicitly requires it
- **ALWAYS run `/ship_todo` after any implementation** — never leave docs or changelog stale
- **MCP docstrings must be compressed** — see `.agents/skills/compress_docstrings.md`
- **ALWAYS regenerate `tool_schema_dump.json`** after any MCP tool change — see `.agents/skills/regen_schema.md`
- **DO NOT push to GitHub** — commit only. Leave push for the user.
- **ONE TODO at a time** — complete and ship before starting the next

---

## Project Structure

```
StealthDOM/
├── AGENTS.md               ← You are here
├── CHANGELOG.md            ← History of completed changes (with reasons)
├── TODO.md                 ← Open items only, numbered #1–#N
├── bridge_server.py        ← WebSocket bridge (Python)
├── stealth_dom_mcp.py      ← MCP server — 50 tools, instructions, capabilities
├── tool_schema_dump.json   ← Generated from stealth_dom_mcp.py — keep in sync
├── extension/              ← Manifest V3 Chrome extension
├── docs/                   ← Human and agent reference documentation
└── .agents/
    ├── rules/              ← Hard invariant rules
    ├── skills/             ← Reusable procedures
    └── workflows/          ← Named, triggerable workflows
```
