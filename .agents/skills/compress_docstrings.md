# Skill: compress_docstrings

MCP tool docstrings are loaded into agent context on every tool call.
Verbose docstrings waste tokens across thousands of interactions.
This skill defines the compression standard for all StealthDOM MCP tool descriptions.

## Rules

1. **First line** — one sentence, verb-first, no filler words ("This tool...", "Use this to...", "Allows you to...")
2. **Args section** — all on one line, `|` separated: `Args: param: desc | param: desc`
3. **No empty lines** inside the docstring
4. **No examples** unless the format is genuinely non-obvious (e.g., a complex selector syntax)
5. **No "default X"** in descriptions — the default is already in the function signature
6. **No "Optional"** — if the param has a default, it's optional by definition

## Format Template

```python
"""<Verb>-first one-sentence description.
Args: param1: description | param2: description | param3: description
"""
```

## Before / After Examples

**BEFORE** (verbose, 312 chars):
```python
"""Read text or HTML content from a specific element or the entire page.

Args:
    selector: Optional CSS selector. If omitted, reads the entire page.
    content_type: 'text' (default) for visible text, or 'html' for raw HTML.
    max_length: Maximum characters to return (default 0 = no limit)
"""
```

**AFTER** (compressed, 142 chars):
```python
"""Read text or HTML from an element or the full page.
Args: selector: CSS selector (omit for full page) | content_type: 'text' or 'html' | max_length: char limit (0=none)
"""
```

**BEFORE** (verbose, 198 chars):
```python
"""Query DOM elements by CSS selector. Returns element details (tag, id, class, text, visibility).

Args:
    selector: CSS selector (e.g., '#my-id', '.my-class', 'div.container > p')
    limit: Maximum number of elements to return (default 1, use 0 for all matching elements)
"""
```

**AFTER** (compressed, 103 chars):
```python
"""Query DOM by CSS selector. Returns tag/id/class/text/visibility.
Args: selector: CSS selector | limit: max results (1=first match, 0=all)
"""
```

## What NOT to compress

- The `toolAction` and `toolSummary` fields in the MCP instructions string — these are different
- The `stealth://capabilities` resource — this is a reference doc, not a per-call cost
- Comments and docstrings in `bridge_server.py` — these are not agent-facing
