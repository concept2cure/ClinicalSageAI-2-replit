"""Retain the existing coverage CLI JSON and its unsuppressed stderr diagnostics."""
import gzip
import hashlib
import json
import subprocess
import sys
from pathlib import Path

packet = Path(__file__).resolve().parent
stem = sys.argv[1] if len(sys.argv) > 1 else 'authoring-inventory'
result = subprocess.run(['node', 'node_modules/tsx/dist/cli.mjs',
    'scripts/regulatory-coverage-report.ts', '--json'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
(packet / f'{stem}-stderr.log.gz').write_bytes(gzip.compress(result.stderr, mtime=0))
assert result.returncode == 0, f'Coverage CLI exit {result.returncode}'
report = json.loads(result.stdout)
assert report['usBiotechAuthoring']['qualification'] == 'inventory-only; workflow and human acceptance require separate evidence'
(packet / f'{stem}.json').write_bytes(result.stdout)
print(json.dumps({'exitCode': result.returncode, 'stdoutIsOneCompleteJsonValue': True,
    'stdoutSha256': hashlib.sha256(result.stdout).hexdigest(),
    'filings': len(report['usBiotechAuthoring']['filings']),
    'reusableDocuments': len(report['usBiotechAuthoring']['reusableDocuments']),
    'stderrRetained': f'{stem}-stderr.log.gz'}))
