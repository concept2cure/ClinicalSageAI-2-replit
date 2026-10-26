"""Capture this bounded increment's deterministic checks without provider calls."""
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
ROOT = PACKET.parents[3]
label, *argv = sys.argv[1:]
if argv and argv[0] == '--':
    argv = argv[1:]
assert argv, 'An actual command is required'
freeze_name = os.environ.get('C2C_EVIDENCE_SOURCE_FREEZE', 'source-freeze.json')
freeze = json.loads((PACKET / freeze_name).read_text())['files']


def pins():
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in freeze}


before = pins()
env = os.environ.copy()
env['PATH'] = '/workspace/scratch/editor-toolchain/node_modules/.bin:' + env['PATH']
if any('vitest' in arg for arg in argv):
    env['NODE_OPTIONS'] = '--max-old-space-size=4096'
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
result = subprocess.run(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
elapsed = round(time.monotonic() - clock, 3)
raw = gzip.compress(result.stdout, mtime=0)
output = PACKET / (label + '.log.gz')
output.write_bytes(raw)
after = pins()
drift = [name for name in freeze if before[name] != freeze[name] or after[name] != freeze[name]]
plain = re.sub(r'\x1b\[[0-9;]*m', '', result.stdout.decode(errors='replace'))
summary = [line.strip() for line in plain.splitlines() if re.search(r'^\s*(Test Files|Tests|Duration)\s', line)]
receipt = {
    'startedAt': started, 'argv': argv, 'cwd': str(ROOT), 'elapsedSeconds': elapsed,
    'exitCode': result.returncode, 'nodeVersion': subprocess.check_output(['node', '--version'], env=env, text=True).strip(),
    'nodeOptions': env.get('NODE_OPTIONS'), 'sourceFreeze': freeze_name,
    'sourcesBefore': before, 'sourcesAfter': after, 'sourceDrift': drift,
    'rawOutput': output.name, 'rawGzipSha256': hashlib.sha256(raw).hexdigest(), 'testSummary': summary,
}
(PACKET / (label + '.json')).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'check': label, 'exitCode': result.returncode, 'elapsedSeconds': elapsed, 'sourceDrift': drift, 'testSummary': summary}))
if result.returncode:
    print('\n'.join(plain.splitlines()[-35:]))
sys.exit(result.returncode or (1 if drift else 0))
