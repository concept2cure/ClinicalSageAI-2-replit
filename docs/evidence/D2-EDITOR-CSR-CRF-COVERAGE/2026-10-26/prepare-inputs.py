"""Pin selected tests, current implementation and resolvable static local inputs."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

packet = Path(__file__).resolve().parent
root = packet.parents[3]
os.chdir(root)
freeze_name = sys.argv[1] if len(sys.argv) > 1 else 'source-freeze.json'
selection = sys.argv[2] if len(sys.argv) > 2 else 'regression-tests.json'
tests = json.loads((packet / selection).read_text())
baseline = json.loads((packet / 'prepatch-source.json').read_text())['head']
changed = subprocess.check_output(['git', 'diff', baseline, '--name-only', '--', 'server', 'client', 'shared'], text=True).splitlines()
lint = [name for name in changed if name.endswith(('.ts', '.tsx', '.js', '.jsx'))]
lint_name = 'lint-targets.json' if freeze_name == 'source-freeze.json' else Path(freeze_name).stem + '-lint-targets.json'
(packet / lint_name).write_text(json.dumps(lint, indent=2) + '\n')
queue = tests + changed + [
    'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx',
    'client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx',
    'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts',
    'vite.config.ts', 'tests/setup.ts', 'scripts/build-server.mjs',
]
pattern = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)['"]([^'"\s]+)['"]""")


def resolve(base, value):
    if value.startswith('.'):
        location = base.parent / value
    elif value.startswith('@shared/'):
        location = Path('shared') / value[8:]
    elif value.startswith('@/'):
        location = Path('client/src') / value[2:]
    elif value.startswith('shared/'):
        location = Path(value)
    else:
        return None
    location = Path(os.path.normpath(str(location)))
    choices = [location]
    if location.suffix == '.js':
        choices.insert(0, location.with_suffix('.ts'))
    if not location.suffix:
        choices += [Path(str(location) + ext) for ext in ['.ts', '.tsx', '.js', '.jsx', '.json']]
        choices += [location / name for name in ['index.ts', 'index.tsx', 'index.js']]
    return next((name for name in choices if name.is_file() and not str(name).startswith('..')), None)


seen = set()
while queue:
    name = str(queue.pop())
    path = Path(name)
    if name in seen or not path.is_file():
        continue
    seen.add(name)
    if path.suffix not in ['.ts', '.tsx', '.js', '.jsx', '.mjs']:
        continue
    source = path.read_text()
    queue += [str(target) for value in pattern.findall(source) if (target := resolve(path, value))]
    queue += [value for value in re.findall(r"""['"]((?:db/)?migrations/[^'"\s]+\.sql)['"]""", source) if Path(value).is_file()]

(packet / freeze_name).write_text(json.dumps({
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'scope': 'Selected tests and implementation, static local imports/direct SQL and named build inputs; not full dynamic dependency enumeration.',
    'files': {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in sorted(seen)},
}, indent=2) + '\n')
print(json.dumps({'selectedSuites': len(tests), 'qualifiedInputs': len(seen), 'lintTargets': len(lint)}))
