# Core Rules — StealthDOM Agents

These rules apply to ALL agents working on this project, regardless of which workflow is active.

## Boundary Rules
1. Work inside this project directory only. NEVER modify sibling projects (WebAIInvestigations, Vortex IDE, etc.) unless explicitly instructed.
2. NEVER modify `extension/` or `bridge_server.py` unless the TODO item explicitly requires it — these are the live runtime components.
3. If you hit a blocker that prevents completing the task, STOP and tell the user. Do not work around it silently.

## Read-Before-Write Rules
4. ALWAYS read a file before modifying it. Never edit from memory or training data.
5. Read ONLY the files relevant to the current task. Do not load the entire codebase into context.
6. For `stealth_dom_mcp.py`, read only the specific tool function(s) relevant to your change, plus lines 150–200 (instructions string + capabilities resource).

## Completion Rules
7. NEVER mark a task done without running `/ship_todo`. An implementation without docs/changelog/commit is not done.
8. ONE TODO at a time. Complete and ship before starting the next.
9. DO NOT `git push` — commit only. Leave push for the user.

## Accuracy Rules
10. The tool count in every doc, the MCP instructions string, and the capabilities resource MUST all agree after every change.
11. `tool_schema_dump.json` MUST be regenerated after any MCP tool change — it is used by the `scratch_check_docs.py` validator.
12. MCP docstrings must be compressed per `.agents/skills/compress_docstrings.md`. Verbose docstrings waste tokens on every single agent interaction.
