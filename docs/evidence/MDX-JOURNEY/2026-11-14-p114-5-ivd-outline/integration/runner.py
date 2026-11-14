import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

repo = Path('/workspace/ClinicalSageAI-2-replit')
base = repo / 'docs/evidence/MDX-JOURNEY/2026-11-14-p114-5-ivd-outline/integration'
base.mkdir(exist_ok=True)
env = dict(os.environ, PATH='/workspace/.tooling/node_modules/node/bin:' + os.environ['PATH'])
files = '''server/services/c2c/__tests__/ivd-510k-rule-pack-selection.test.ts
server/services/c2c/__tests__/regional-device-document-class.test.ts
server/routes/c2c/__tests__/projects-create.test.ts
server/routes/c2c/__tests__/projects-create-regional-devices.test.ts
server/routes/c2c/__tests__/projects-create-market-offer.test.ts
server/services/vault/__tests__/vault-folders.test.ts
tests/schema-contract/c2c-project-scaffold.contract.test.ts
tests/schema-contract/k510-denovo-outline-v1-1-replay.contract.test.ts
tests/schema-contract/k510-ivd-outline-v1-0-replay.contract.test.ts
tests/schema-contract/ivd-510k-outline-template.contract.test.ts
server/services/vault/__tests__/ivd-retained-binder.test.ts
server/services/regulatory/__tests__/market-support.test.ts
server/services/regulatory/__tests__/market-support-offer.test.ts
server/services/regulatory/__tests__/regional-device-market-support.test.ts
server/services/regulatory/__tests__/market-support-ich-not-offered.test.ts
server/services/market-specs/__tests__/document-template-library.test.ts
tests/regulatory/template-library-truth.test.ts
tests/regulatory/registryCoverage.test.ts
server/routes/c2c/__tests__/project-vault-estar-required-sections.test.ts
server/routes/c2c/__tests__/project-vault-one-outline.test.ts
client/src/concept2cure/mdx/surfaces/__tests__/EstarFilingPanel.render.test.tsx
client/src/concept2cure/mdx/surfaces/__tests__/OfficialEstarPanel.render.test.tsx
client/src/concept2cure/mdx/surfaces/__tests__/OfficialEstarPanel.attachments.test.tsx
client/src/concept2cure/mdx/surfaces/__tests__/K510Surface.deNovo.test.tsx
client/src/concept2cure/mdx/hooks/__tests__/useEstarOfficialFields.test.ts
client/src/concept2cure/v2/__tests__/projectMarketsDeviceAssembly.test.tsx'''.splitlines()
mapper = json.loads((base.parent / 'mapper/cohort-tests.json').read_text())
files += [str(Path(row['name']).relative_to(repo)) for row in mapper['testResults']]
files = sorted(set(files))
for name in files:
    assert (repo / name).is_file(), name

def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo, text=True).strip()

runtime = [p for p in git('diff', '--name-only', '--diff-filter=ACM').splitlines()
           if p.endswith(('.ts', '.tsx', '.mjs', '.sql'))]
untracked = git('ls-files', '--others', '--exclude-standard').splitlines()
runtime += [p for p in untracked if p.endswith(('.ts', '.tsx', '.sql')) and not p.startswith('docs/')]
paths = sorted(set(files + runtime + [
    'vitest.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json',
    'assets/estar-templates/eSTAR-510k-ivd.pdf',
    'server/services/c2c/document-class.ts',
    'server/services/vault/vault-binder-outline.ts',
    'server/services/pathway-engines/estar/estar-outline-requirements.ts',
    'server/services/pathway-engines/estar/estar-content-leaves.ts',
    'server/services/pathway-engines/estar/estar-filing-readiness.ts',
]))

def pins():
    return {p: hashlib.sha256((repo / p).read_bytes()).hexdigest() for p in paths}

before = pins()
cmd = ['npx', 'vitest', 'run', '--config', 'vitest.config.ts', *files,
       '--maxWorkers=1', '--no-file-parallelism', '--reporter=json', '--outputFile=' + str(base / 'tests.json')]
start = time.time()
(base / 'start.json').write_text(json.dumps({'head': git('rev-parse', 'HEAD'), 'command': cmd, 'files': files,
                                          'sourcePins': before, 'startedAt': start}, indent=2) + '\n')
with open('/workspace/scratch/ivd-integration.raw.log', 'wb') as log:
    result = subprocess.run(cmd, cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT)
after = pins()
(base / 'tests.log.gz').write_bytes(gzip.compress(Path('/workspace/scratch/ivd-integration.raw.log').read_bytes(), mtime=0))
report = json.loads((base / 'tests.json').read_text())
summary = {'exitCode': result.returncode, 'elapsedSeconds': round(time.time() - start, 3),
           'passed': report['numPassedTests'], 'failed': report['numFailedTests'], 'pending': report['numPendingTests'],
           'distinctFiles': len(report['testResults']), 'sourceStable': before == after,
           'sourceChanges': [p for p in before if before[p] != after[p]], 'sourcePins': after}
(base / 'result.json').write_text(json.dumps(summary, indent=2) + '\n')
(base / 'runner.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({k: v for k, v in summary.items() if k != 'sourcePins'}), flush=True)
raise SystemExit(0 if result.returncode == 0 and before == after else 1)
