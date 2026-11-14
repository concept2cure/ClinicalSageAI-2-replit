"""Bounded retained filing projection qualification; no production mutations."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
ENV = {**os.environ, 'PATH': '/workspace/.tooling/node_modules/node/bin:' + os.environ['PATH']}
TEST = 'server/services/vault/__tests__/ivd-retained-binder.test.ts'
PATHS = [
    TEST, 'server/services/vault/vault-binder-outline.ts',
    'server/services/vault/vault-folders.ts', 'server/services/c2c/rule-pack-lookup.ts',
    'server/services/c2c/scaffold-project-documents.ts', 'server/routes/c2c/projects.ts',
    'shared/regulatory/device-authoring-sections.ts', 'shared/regulatory/project-bootstrap.ts',
    'migrations/20261005c_k510_denovo_estar_outline_v1_1.sql',
    'migrations/20261114_k510_ivd_estar_outline_v1_0.sql',
    'server/services/pathway-engines/estar/estar-mapper.ts',
    'server/services/pathway-engines/estar/estar-outline-requirements.ts',
    'server/services/forms/fill-official-pdf.ts', 'assets/estar-templates/eSTAR-510k-ivd.pdf',
    'vitest.config.ts', 'tests/setup.ts', 'package.json', 'package-lock.json',
]

def pins():
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in PATHS}

before = pins()
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
(OUT / 'source-before.json').write_text(json.dumps({'head': head, 'pins': before}, indent=2) + '\n')
results = []
commands = [
    ('tests', ['npx', 'vitest', 'run', TEST, '--maxWorkers=1', '--no-file-parallelism', '--reporter=json', f'--outputFile={OUT / "tests.json"}']),
    ('eslint', ['npx', 'eslint', TEST, '--no-cache', '--format=json']),
]
for name, command in commands:
    start = time.time()
    run = subprocess.run(command, cwd=ROOT, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    with gzip.open(OUT / f'{name}.log.gz', 'wb') as output:
        output.write(run.stdout)
    if name == 'eslint':
        (OUT / 'eslint.json').write_bytes(run.stdout)
    results.append({'name': name, 'command': command, 'exitCode': run.returncode, 'elapsedSeconds': round(time.time() - start, 3)})
after = pins()
head_after = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
(OUT / 'source-after.json').write_text(json.dumps({'head': head_after, 'pins': after}, indent=2) + '\n')
result = {'node': subprocess.check_output(['node', '--version'], env=ENV, text=True).strip(),
          'head': head, 'headAfter': head_after, 'sourceStable': before == after,
          'headStable': head == head_after, 'pinCount': len(before), 'results': results}
(OUT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
raise SystemExit(0 if before == after and all(r['exitCode'] == 0 for r in results) else 1)
