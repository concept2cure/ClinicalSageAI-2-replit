import hashlib
import json
import subprocess
import sys
from pathlib import Path

mode, source, *rest = sys.argv[1:]
if mode == 'snapshot':
    files = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    suffixes = ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.html', '.sql')
    selected = [p for p in files if p.endswith(suffixes) and
                (p.startswith(('client/', 'server/', 'shared/', 'scripts/', 'src/')) or '/' not in p)]
    data = {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip(),
            'scope': 'tracked source/config files in client, server, shared, scripts, src and root; not agency qualification',
            'inputs': [{'path': p, 'sha256': hashlib.sha256(Path(p).read_bytes()).hexdigest()} for p in selected]}
    Path(source).write_text(json.dumps(data, indent=2) + '\n')
    print(json.dumps({'head': data['head'], 'count': len(selected)}))
elif mode == 'verify':
    data = json.loads(Path(source).read_text())
    changed = [entry['path'] for entry in data['inputs']
               if not Path(entry['path']).exists() or hashlib.sha256(Path(entry['path']).read_bytes()).hexdigest() != entry['sha256']]
    result = {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip(),
              'pinnedHead': data['head'], 'inputCount': len(data['inputs']), 'changed': changed, 'passed': not changed}
    if rest:
        Path(rest[0]).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    sys.exit(bool(changed))
