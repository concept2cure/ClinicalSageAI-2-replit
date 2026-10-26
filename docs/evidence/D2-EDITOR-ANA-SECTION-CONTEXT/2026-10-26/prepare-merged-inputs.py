"""Pin the corrected work and the incoming canonical owners without overwriting prior epochs."""
from pathlib import Path
import hashlib
import json
import os
import re

p = Path(__file__).resolve().parent
root = p.parents[3]
os.chdir(root)
merge = json.loads((p / 'canonical-merge.json').read_text())
old = json.loads((p / 'local-correction-inputs.json').read_text())['files']
owned = [f for f in json.loads((p / 'production-freeze.json').read_text())['files']
         if f.startswith(('client/', 'server/', 'shared/'))]
drift = [f for f in owned if hashlib.sha256(Path(f).read_bytes()).hexdigest() != old[f]]
assert not drift, drift
merge['ownedProductionChangedByMerge'] = drift
(p / 'canonical-merge.json').write_text(json.dumps(merge, indent=2) + '\n')
incoming = [
    'client/src/concept2cure/v2/__tests__/projectDossierParity.test.tsx',
    'client/src/concept2cure/v2/__tests__/projectArtifactReadiness.test.tsx',
    'client/src/concept2cure/v2/__tests__/projectDestination.test.ts',
    'client/src/concept2cure/v2/__tests__/projectHomeReadiness.test.tsx',
    'client/src/concept2cure/v2/__tests__/dossierMapProgramScope.test.tsx',
    'client/src/concept2cure/v2/__tests__/shellAskGuard.test.tsx',
    'server/routes/c2c/__tests__/projects-dossier-artifacts.pglite.test.ts',
    'server/services/c2c/__tests__/dossier-support.pglite.test.ts',
    'server/routes/__tests__/dossier-artifact-readiness.test.ts',
    'server/services/dossier/__tests__/dossier-map-view-assembler.pglite.integration.test.ts',
    'server/services/__tests__/ana-capability-registry-seed-scope.test.ts',
    'tests/schema-contract/catalog-module-claims.contract.test.ts',
]
tests = set(json.loads((p / 'test-selection.json').read_text())['tests']) | set(incoming)
assert all(Path(f).is_file() for f in tests), [f for f in tests if not Path(f).is_file()]
(p / 'merged-test-selection.json').write_text(json.dumps({'tests': sorted(tests),
    'retiredIncomingTest': 'The incoming canonical Dossier convergence deleted dossier-map-read.test.ts; its current project/dossier owner tests above are qualified instead.'}, indent=2) + '\n')
(p / 'run-merged-integration.py').write_text("""import json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parent
sys.exit(subprocess.run(['npx','vitest','run',*json.loads((p/'merged-test-selection.json').read_text())['tests']]).returncode)
""")
queue = list(tests) + owned
queue += [f for f in merge['incomingPaths'] if f.endswith(('.ts', '.tsx', '.sql')) and Path(f).is_file()]
queue += [f for f in json.loads((p / 'production-freeze.json').read_text())['files'] if Path(f).is_file()]
seen = set()
pattern = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)['"]([^'"\s]+)['"]""")


def resolve(base, value):
    if value.startswith('.'):
        loc = base.parent / value
    elif value.startswith('@shared/'):
        loc = Path('shared') / value[8:]
    elif value.startswith('@/'):
        loc = Path('client/src') / value[2:]
    elif value.startswith('shared/'):
        loc = Path(value)
    else:
        return None
    loc = Path(os.path.normpath(str(loc)))
    options = [loc]
    if loc.suffix == '.js':
        options.insert(0, loc.with_suffix('.ts'))
    if not loc.suffix:
        options += [Path(str(loc) + ext) for ext in ['.ts', '.tsx', '.js', '.jsx', '.json']]
        options += [loc / 'index.ts', loc / 'index.tsx', loc / 'index.js']
    return next((f for f in options if f.is_file()), None)


while queue:
    name = str(queue.pop())
    if name in seen or not Path(name).is_file():
        continue
    seen.add(name)
    f = Path(name)
    if f.suffix not in ['.ts', '.tsx', '.js', '.jsx', '.mjs']:
        continue
    data = f.read_text()
    for value in pattern.findall(data):
        target = resolve(f, value)
        if target and not str(target).startswith('..'):
            queue.append(str(target))
    for value in re.findall(r"""['"]((?:db/)?migrations/[^'"\s]+\.sql)['"]""", data):
        if Path(value).is_file():
            queue.append(value)
(p / 'merged-qualified-inputs.json').write_text(json.dumps({
    'scope': 'Successor freeze after legacy correction and normal canonical project/dossier merge; owned8 production inputs unchanged by merge. Selected tests and resolvable static local imports/direct SQL; no full dynamic-enumeration claim.',
    'files': {f: hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in sorted(seen)},
}, indent=2) + '\n')
print(len(tests), 'final suites,', len(seen), 'qualified input files')
