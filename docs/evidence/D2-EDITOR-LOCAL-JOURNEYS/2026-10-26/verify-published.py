"""Verify accepted Git objects against declared local qualification inputs."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

packet = Path(__file__).resolve().parent
root = packet.parents[3]
commit = sys.argv[1]
declared = json.loads((packet / 'source-freeze.json').read_text())['files']
root_count = len(declared)
browser = json.loads((packet / 'browser/source-freeze.json').read_text())
browser_counts = {}
for group in ['production', 'shared', 'fixtures']:
    browser_counts[group] = len(browser[group])
    for name, digest in browser[group].items():
        if group == 'fixtures':
            name = str((packet / 'browser' / name).relative_to(root))
        assert name not in declared or declared[name] == digest, name
        declared[name] = digest
actual = {}
for name in declared:
    data = subprocess.check_output(['git', 'show', f'{commit}:{name}'], cwd=root)
    actual[name] = hashlib.sha256(data).hexdigest()
drift = [name for name in declared if actual[name] != declared[name]]
assert not drift, drift
for ancestor in ['4d8cf50d0', 'b3661f72d']:
    subprocess.run(['git', 'merge-base', '--is-ancestor', ancestor, commit], cwd=root, check=True)
print(json.dumps({'commit': commit, 'sourceFreeze': 'source-freeze.json',
                  'rootDeclaredInputCount': root_count, 'browserDeclaredInputCounts': browser_counts,
                  'distinctInputCount': len(declared), 'gitBlobHashes': actual,
                  'sourceAndIncomingAncestorsVerified': True, 'drift': drift}, indent=2))
