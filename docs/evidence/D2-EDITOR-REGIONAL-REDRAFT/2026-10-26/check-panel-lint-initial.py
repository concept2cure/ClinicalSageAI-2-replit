"""Compare existing panel warnings to canonical pre-change source without a baseline edit."""
from collections import Counter
import json
import os
from pathlib import Path
import subprocess

packet = Path(__file__).resolve().parent
root = packet.parents[3]
name = 'client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx'
base = json.loads((packet / 'catch-up.json').read_text())['fetchedHead']
env = os.environ.copy()
env['PATH'] = '/workspace/scratch/editor-toolchain/node_modules/.bin:' + env['PATH']
versions = {'baseline': subprocess.check_output(['git', 'show', f'{base}:{name}'], cwd=root),
            'current': (root / name).read_bytes()}
counts = {}
for label, source in versions.items():
    result = subprocess.run(['node', 'node_modules/eslint/bin/eslint.js', '--stdin',
                             '--stdin-filename', name, '--format', 'json'], input=source,
                            cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert result.returncode in (0, 1), result.stderr.decode()
    (packet / f'lint-panel-{label}.json').write_bytes(result.stdout)
    findings = json.loads(result.stdout)
    assert sum(row['errorCount'] for row in findings) == 0, label
    counts[label] = Counter(message['ruleId'] for row in findings for message in row['messages'] if message['severity'] == 1)
assert not any(value > counts['baseline'][rule] for rule, value in counts['current'].items()), counts
print(json.dumps({'baselineRevision': base, 'errorCount': 0,
                  'warningCounts': counts, 'noNewWarnings': True}))
