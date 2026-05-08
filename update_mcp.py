import re

with open('stealth_dom_mcp.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace argument definitions
content = re.sub(r'virtual_tab_id:\s*int\s*\|\s*str', 'tab_id: str', content)
content = re.sub(r'window_id:\s*int', 'window_id: str', content)
content = re.sub(r'frame_id:\s*int\s*\|\s*None\s*=\s*None', 'frame_id: str | None = None', content)

# Replace remaining `virtual_tab_id` to `tab_id` (e.g. inside function bodies)
content = content.replace('virtual_tab_id', 'tab_id')

# Remove parameter documentation inside docstrings safely using MULTILINE
content = re.sub(r'^[ \t]+tab_id:.*\n', '', content, flags=re.MULTILINE)
content = re.sub(r'^[ \t]+window_id:.*\n', '', content, flags=re.MULTILINE)
content = re.sub(r'^[ \t]+frame_id:.*\n', '', content, flags=re.MULTILINE)

# Cleanup empty Args: blocks. 
# Match "Args:" preceded by spaces, followed by whitespace/newlines, followed by the closing docstring quotes '"""'
content = re.sub(r'^[ \t]+Args:\s*\"\"\"', '"""', content, flags=re.MULTILINE)

with open('stealth_dom_mcp.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done MCP updates safely!')
