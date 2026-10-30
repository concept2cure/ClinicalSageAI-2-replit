"""Compare this worker's scoped ESLint metrics with its pinned prepatch source."""
import gzip
import json
from pathlib import Path
import subprocess

packet = Path(__file__).resolve().parents[1]
root = packet.parents[3]
runner = 'server/services/csr/csr-job-runner.ts'
tests = ['server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts',
    'server/services/csr/__tests__/csr-worker-private-access.pglite.test.ts']
command = ['/workspace/scratch/editor-toolchain/node_modules/.bin/node', 'node_modules/eslint/bin/eslint.js']
baseline = subprocess.run(command + ['--stdin', '--stdin-filename', runner, '--format', 'json'], cwd=root,
    input=gzip.decompress((packet/'csr/red-source-csr-job-runner.ts.gz').read_bytes()), stdout=subprocess.PIPE, check=True)
current = subprocess.run(command + [runner, *tests, '--format', 'json'], cwd=root, stdout=subprocess.PIPE, check=True)
old = json.loads(baseline.stdout)[0]
current_results = json.loads(current.stdout)
by_name = {Path(result['filePath']).relative_to(root).as_posix(): result for result in current_results}
now = by_name[runner]
report = {'baseline': json.loads(baseline.stdout), 'current': current_results,
    'warningGrowth': now['warningCount'] - old['warningCount']}
(packet/'csr/lint-details.json').write_text(json.dumps(report, indent=2)+'\n')
assert old['errorCount'] == now['errorCount'] == 0
assert now['warningCount'] <= old['warningCount']
assert all(by_name[test]['errorCount'] == by_name[test]['warningCount'] == 0 for test in tests)
print(json.dumps({'sourceErrors': now['errorCount'], 'sourceWarnings': now['warningCount'],
    'baselineWarnings': old['warningCount'], 'testErrors': sum(by_name[test]['errorCount'] for test in tests),
    'testWarnings': sum(by_name[test]['warningCount'] for test in tests)}))
