import json
import re

with open('tool_schema_dump.json', 'r') as f:
    tools = json.load(f)

with open('docs/03_api_reference.md', 'r', encoding='utf-8') as f:
    doc_content = f.read()

mcp_tool_pattern = re.compile(r'\*\*MCP Tool:\*\*\s+`([a-zA-Z0-9_]+)\((.*?)\)`')
doc_tools = {}
for match in mcp_tool_pattern.finditer(doc_content):
    name = match.group(1)
    args = match.group(2)
    doc_tools[name] = args

print(f'Found {len(doc_tools)} MCP tools in documentation.')

missing_in_docs = []
for tool in tools:
    name = tool['name']
    if name not in doc_tools:
        missing_in_docs.append(name)
    else:
        schema_props = set(tool['inputSchema']['properties'].keys())
        doc_args_raw = doc_tools[name].split(',')
        doc_args = set(a.split('=')[0].strip() for a in doc_args_raw if a.strip())
        
        missing_params = schema_props - doc_args
        if missing_params:
            print(f'{name} missing params in signature: {missing_params}')

print('Missing entirely from docs:', missing_in_docs)
