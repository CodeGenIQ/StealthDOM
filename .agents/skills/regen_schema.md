# Skill: regen_schema

Run this after ANY change to MCP tool definitions to keep `tool_schema_dump.json` in sync.
This file is used by `scratch_check_docs.py` to validate docs against live tools.

## Steps

1. Create a temporary file `_regen_schema_tmp.py` in the project root with this content:

```python
import json, importlib.util, sys
spec = importlib.util.spec_from_file_location("stealth_dom_mcp", "stealth_dom_mcp.py")
mod = importlib.util.module_from_spec(spec)
sys.modules['stealth_dom_mcp'] = mod
spec.loader.exec_module(mod)
tools = [
    {"name": n, "description": t.description, "inputSchema": t.parameters}
    for n, t in mod.mcp._tool_manager._tools.items()
]
with open('tool_schema_dump.json', 'w', encoding='utf-8') as f:
    json.dump(tools, f, indent=2)
print(f"Wrote {len(tools)} tools to tool_schema_dump.json")
```

2. Run it from the project root:
```
python _regen_schema_tmp.py
```

3. Confirm the output says the correct tool count (e.g., "Wrote 50 tools").

4. Delete the temp file:
```
del _regen_schema_tmp.py
```

## Validation (optional)

Run `scratch_check_docs.py` to cross-check the schema against `docs/03_api_reference.md`:
```
python scratch_check_docs.py
```
Any tools listed as "Missing entirely from docs" need an entry added to the API reference.
