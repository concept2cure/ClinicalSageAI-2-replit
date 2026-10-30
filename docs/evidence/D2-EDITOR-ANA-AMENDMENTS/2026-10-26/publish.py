"""Normal canonical publication with inherited authentication and all hooks intact."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

packet = Path(__file__).resolve().parent
root = packet.parents[3]
assert subprocess.check_output(['git', 'branch', '--show-current'], cwd=root, text=True).strip() == 'concept2cure-v2'
env = os.environ.copy()
env['PATH'] = '/workspace/scratch/editor-toolchain/node_modules/.bin:' + env['PATH']
for name in ['HUSKY', 'HUSKY_SKIP_HOOKS', 'SKIP_PREPUSH', 'SKIP_PRE_PUSH', 'SKIP_HOOKS', 'SKIP_TYPECHECK', 'ALLOW_NON_CANONICAL_PUSH']:
    env.pop(name, None)
fd, ask = tempfile.mkstemp(prefix='editor-ana-publish-', dir='/tmp')
os.write(fd, b'#!/bin/sh\ncase "$1" in\n *Username*) printf "%s\\n" x-access-token ;;\n *Password*) printf "%s\\n" "$GH_TOKEN" ;;\nesac\n')
os.close(fd)
os.chmod(ask, 0o700)
env.update(GIT_ASKPASS=ask, GIT_TERMINAL_PROMPT='0')
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
log = Path('/tmp/editor-ana-normal-push.log')
try:
    with log.open('wb') as out:
        result = subprocess.run(['git', 'push', 'origin', 'concept2cure-v2'], cwd=root, env=env, stdout=out, stderr=subprocess.STDOUT)
finally:
    os.unlink(ask)
raw = gzip.compress(log.read_bytes(), mtime=0)
(packet / 'publication-code.log.gz').write_bytes(raw)
receipt = {'startedAt': started, 'elapsedSeconds': round(time.monotonic() - clock, 3),
           'argv': ['git', 'push', 'origin', 'concept2cure-v2'], 'exitCode': result.returncode,
           'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
           'hooks': 'normal; no bypass variables', 'rawOutput': 'publication-code.log.gz',
           'rawGzipSha256': hashlib.sha256(raw).hexdigest()}
(packet / 'publication-code.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
if result.returncode:
    print('\n'.join(log.read_text(errors='replace').splitlines()[-35:]))
raise SystemExit(result.returncode)
