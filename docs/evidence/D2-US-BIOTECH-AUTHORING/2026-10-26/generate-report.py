"""Retain the existing coverage CLI JSON and its unsuppressed stderr diagnostics."""
import gzip
import hashlib
import json
import subprocess
from pathlib import Path

packet = Path(__file__).resolve().parent
result = subprocess.run(['node', 'node_modules/tsx/dist/cli.mjs',
    'scripts/regulatory-coverage-report.ts', '--json'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
(packet / 'authoring-inventory-stderr.log.gz').write_bytes(gzip.compress(result.stderr, mtime=0))
assert result.returncode == 0, f'Coverage CLI exit {result.returncode}'
report = json.loads(result.stdout)
assert report['usBiotechAuthoring']['qualification'] == 'inventory-only; workflow and human acceptance require separate evidence'
(packet / 'authoring-inventory.json').write_bytes(result.stdout)
print(json.dumps({'exitCode': result.returncode, 'stdoutIsOneCompleteJsonValue': True,
    'stdoutSha256': hashlib.sha256(result.stdout).hexdigest(),
    'filings': len(report['usBiotechAuthoring']['filings']),
    'reusableDocuments': len(report['usBiotechAuthoring']['reusableDocuments']),
    'stderrRetained': 'authoring-inventory-stderr.log.gz'}))
