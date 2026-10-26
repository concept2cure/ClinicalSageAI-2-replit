"""Freeze and run only this worker's exact HTTP fixture or strict lint."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[4]
phase, *argv = sys.argv[1:]
assert argv
paths = [row['path'] for row in json.loads((PACKET / 'baseline-inputs.json').read_text())['inputs']]
new_owner = 'server/services/authoring/authoring-draft-template.ts'
if (ROOT / new_owner).exists():
    paths.append(new_owner)
inputs = []
for index, path in enumerate(paths):
    data = (ROOT / path).read_bytes()
    snapshot = f'{phase}-{index:02}-{Path(path).name}.gz'
    (PACKET / snapshot).write_bytes(gzip.compress(data, mtime=0))
    inputs.append({'path': path, 'sha256': hashlib.sha256(data).hexdigest(), 'snapshot': snapshot})
(PACKET / f'{phase}-inputs.json').write_text(json.dumps({'capturedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'inputs': inputs}, indent=2) + '\n')
env = os.environ.copy()
env['PATH'] = str(ROOT / 'node_modules/.bin') + ':' + env['PATH']
env['NODE_OPTIONS'] = '--max-old-space-size=4096'
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
result = subprocess.run(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
raw = gzip.compress(result.stdout, mtime=0)
(PACKET / f'{phase}.log.gz').write_bytes(raw)
drift = [row['path'] for row in inputs if hashlib.sha256((ROOT / row['path']).read_bytes()).hexdigest() != row['sha256']]
plain = re.sub(r'\x1b\[[0-9;]*m', '', result.stdout.decode(errors='replace'))
summary = [line.strip() for line in plain.splitlines() if re.search(r'^\s*(Test Files|Tests|Duration)\s', line)]
receipt = {'startedUtc': started, 'argv': argv, 'cwd': str(ROOT), 'exitCode': result.returncode, 'elapsedSeconds': round(time.monotonic()-clock, 3), 'sourceDrift': drift, 'testSummary': summary, 'rawOutput': f'{phase}.log.gz', 'rawGzipSha256': hashlib.sha256(raw).hexdigest()}
(PACKET / f'{phase}-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
print('\n'.join(plain.splitlines()[-40:]))
sys.exit(result.returncode or (1 if drift else 0))
