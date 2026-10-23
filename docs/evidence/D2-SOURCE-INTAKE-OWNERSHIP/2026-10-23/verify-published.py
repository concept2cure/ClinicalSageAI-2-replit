"""Verify this packet's declared inputs against actual accepted Git blobs."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

packet = Path(__file__).resolve().parent
root = packet.parents[3]
commit = sys.argv[1]
freeze_name = sys.argv[2] if len(sys.argv) > 2 else 'compiler-corrected-source-freeze.json'
declared = json.loads((packet / freeze_name).read_text())['files']
actual = {}
for name in declared:
    blob = subprocess.check_output(['git', 'show', f'{commit}:{name}'], cwd=root)
    actual[name] = hashlib.sha256(blob).hexdigest()
drift = [name for name in declared if actual[name] != declared[name]]
assert not drift, drift
subprocess.run(['git', 'merge-base', '--is-ancestor', '8c86a44a3', commit], cwd=root, check=True)
subprocess.run(['git', 'merge-base', '--is-ancestor', 'eba2d8050', commit], cwd=root, check=True)
print(json.dumps({'commit': commit, 'sourceFreeze': freeze_name,
                  'declaredInputCount': len(declared), 'gitBlobHashes': actual,
                  'drift': drift, 'sourceAndIncomingAreAncestors': True}, indent=2))
