"""Retain this worker's exact deterministic commands and source pins."""
from pathlib import Path
import datetime
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import time

PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[4]
SOURCES = ['shared/regulatory/global-document-registry.ts', 'server/services/authoring/builtin-authoring-templates.ts', 'server/services/market-specs/document-template-library.ts', 'server/services/authoring/__tests__/builtin-authoring-templates.test.ts', 'server/services/authoring/__tests__/cross-sector-builtin-authoring-templates.test.ts', 'package.json', 'package-lock.json', 'vitest.config.ts', 'tests/setup.ts', 'server/services/authoring/__tests__/device-builtin-authoring-templates.test.ts', 'server/services/authoring/__tests__/builtin-templates-carry-whole-outline.test.ts', 'shared/regulatory/project-bootstrap.ts', 'server/services/authoring/ind-authoring-templates.ts']

def pins():
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            if (ROOT / name).exists() else None for name in SOURCES}


label, *argv = sys.argv[1:]
before = pins()
env = os.environ.copy()
env['PATH'] = '/workspace/scratch/editor-toolchain/node_modules/.bin:' + env['PATH']
env['NODE_OPTIONS'] = '--max-old-space-size=4096'
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
result = subprocess.run(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
raw = gzip.compress(result.stdout, mtime=0)
output = label + '.log.gz'
(PACKET / output).write_bytes(raw)
plain = re.sub(r'\x1b\[[0-9;]*m', '', result.stdout.decode(errors='replace'))
receipt = {'argv': argv, 'cwd': str(ROOT), 'startedAt': started,
           'elapsedSeconds': round(time.monotonic() - clock, 3), 'exitCode': result.returncode,
           'environment': {'PATHPrefix': '/workspace/scratch/editor-toolchain/node_modules/.bin',
                           'NODE_OPTIONS': env['NODE_OPTIONS']},
           'sourcesBefore': before, 'sourcesAfter': pins(), 'rawOutput': output,
           'rawGzipSha256': hashlib.sha256(raw).hexdigest(),
           'summary': [line.strip() for line in plain.splitlines()
                       if re.search(r'^\s*(Test Files|Tests|Duration)\s', line)]}
(PACKET / (label + '.json')).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ['argv', 'exitCode', 'elapsedSeconds', 'summary']}))
if result.returncode:
    print('\n'.join(plain.splitlines()[-38:]))
sys.exit(result.returncode)
