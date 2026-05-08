import sys
import re

with open('bridge_server.py', 'r', encoding='utf-8') as f:
    content = f.read()

helper_methods = '''
    def _parse_virtual_id(self, val, default_label: str):
        if isinstance(val, str) and ':' in val:
            label, _, raw_id_str = val.partition(':')
            try:
                return label, int(raw_id_str)
            except ValueError:
                return label, raw_id_str
        return default_label, val

    def _virtualize_outgoing(self, action: str, data, label: str) -> None:
        if not data or not label:
            return
            
        def _v(val):
            if val is None: return None
            return f"{label}:{val}"

        if action == 'newTab':
            if 'id' in data: data['id'] = _v(data['id'])
            if 'windowId' in data: data['windowId'] = _v(data['windowId'])
        elif action in ('newWindow', 'newIncognitoWindow'):
            if 'id' in data: data['id'] = _v(data['id'])
            if 'tabs' in data and isinstance(data['tabs'], list):
                for t in data['tabs']:
                    if 'id' in t: t['id'] = _v(t['id'])
                    if 'windowId' in t: t['windowId'] = _v(t['windowId'])
        elif action == 'listFrames':
            if 'frames' in data and isinstance(data['frames'], list):
                for f in data['frames']:
                    if 'frameId' in f: f['frameId'] = _v(f['frameId'])
        elif action == 'executeScriptAllFrames':
            if isinstance(data, list):
                for item in data:
                    if 'frameId' in item: item['frameId'] = _v(item['frameId'])
'''

new_handle_control = '''    async def _handle_control_command(self, data: dict) -> dict:
        """Process a command from a control client.

        Handles:
        - Multi-browser routing via virtual tab IDs ("label:tabId")
        - Aggregated listTabs across all connected browsers
        """
        msg_id = data.pop('_msg_id', None)
        action = data.get('action', '')
        timeout = data.pop('_timeout', 30)

        if not action:
            result = {'success': False, 'error': 'Missing action field'}
            if msg_id:
                result['_msg_id'] = msg_id
            return result

        # ---- Check connection availability ----
        if not self.is_connected:
            result = self._build_not_connected_error()
            if msg_id:
                result['_msg_id'] = msg_id
            return result

        # ---- Aggregated multi-browser commands ----
        if action == 'listTabs':
            result = await self._cmd_list_tabs_all(timeout)
            if msg_id:
                result['_msg_id'] = msg_id
            return result

        # ---- Resolve routing label from virtual IDs ----
        routing_label = self._primary_label
        for key in ['tabId', 'windowId', 'frameId']:
            if key in data and data[key] is not None:
                label, raw_val = self._parse_virtual_id(data[key], routing_label)
                data[key] = raw_val
                if key in ('tabId', 'windowId'):
                    routing_label = label

        # ---- Forward command to the resolved connection ----
        kwargs = {k: v for k, v in data.items() if k != 'action'}
        result = await self.send_command(action, label=routing_label, _timeout=timeout, **kwargs)
        
        # ---- Virtualize outgoing IDs ----
        if result.get('success'):
            self._virtualize_outgoing(action, result.get('data'), routing_label)
            
        if msg_id:
            result['_msg_id'] = msg_id
        return result
'''

new_list_tabs = '''    async def _cmd_list_tabs_all(self, timeout: float = 30) -> dict:
        """Aggregate tabs from ALL connected browsers into one flat list.

        Each tab gets:
        - browserId: the connection label (e.g., 'brave')
        - virtualId: namespaced tab ID string (e.g., 'brave:12345') — use this for all commands
        - id: original numeric tab ID from the browser (overwritten with virtualId format)
        """
        all_tabs = []
        errors = []

        for label in list(self._connections.keys()):
            result = await self.send_command('listTabs', label=label, _timeout=timeout)
            if result.get('success'):
                tabs = result.get('data', [])
                for tab in tabs:
                    real_id = tab.get('id')
                    tab['browserId'] = label
                    tab['virtualId'] = f"{label}:{real_id}"
                    tab['id'] = f"{label}:{real_id}"
                    if 'windowId' in tab:
                        tab['windowId'] = f"{label}:{tab['windowId']}"
                    all_tabs.append(tab)
            else:
                errors.append(f"{label}: {result.get('error', 'unknown error')}")

        response: dict = {'success': True, 'data': all_tabs}
        if errors:
            response['warnings'] = errors
        return response
'''

# Insert helper methods before _handle_control_command
content = re.sub(r'(\s+async def _handle_control_command)', helper_methods + r'\1', content, count=1)

# Replace _handle_control_command logic
content = re.sub(r'\s+async def _handle_control_command.*?return result\n', '\n' + new_handle_control + '\n', content, flags=re.DOTALL, count=1)

# Replace _cmd_list_tabs_all logic
content = re.sub(r'\s+async def _cmd_list_tabs_all.*?return response\n', '\n' + new_list_tabs + '\n', content, flags=re.DOTALL, count=1)

with open('bridge_server.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done bridging!')
