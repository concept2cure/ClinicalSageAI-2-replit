"""Compare retained projector warnings and require warning-free changed tests."""
import gzip
import json
import subprocess
from pathlib import Path

PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[4]
SOURCE = 'server/services/study-design/crf-shell.ts'
TESTS = ['server/services/study-design/__tests__/crf-shell.test.ts',
         'server/routes/__tests__/authoringCrfSourceImport.pglite.integration.test.ts']


def read_lint(source):
    result = subprocess.run(['./node_modules/.bin/eslint', '--stdin', '--stdin-filename', SOURCE,
                             '--format', 'json'], input=source, capture_output=True, cwd=ROOT, check=True)
    parsed = json.loads(result.stdout)
    assert len(parsed) == 1
    assert parsed[0]['errorCount'] == 0
    return parsed[0]


original = read_lint(gzip.decompress((PACKET / 'original-crf-shell.ts.gz').read_bytes()))
current = read_lint((ROOT / SOURCE).read_bytes())
warning_identity = lambda result: [(item['ruleId'], item['severity'], item['message'])
                                   for item in result['messages']]
assert warning_identity(original) == warning_identity(current)
assert current['warningCount'] == 2
tests = subprocess.run(['./node_modules/.bin/eslint', *TESTS, '--max-warnings', '0', '--format', 'json'],
                       capture_output=True, cwd=ROOT)
assert tests.returncode == 0, tests.stdout.decode()
details = {'projectorOriginal': original, 'projectorCurrent': current, 'tests': json.loads(tests.stdout),
           'projectorWarningsUnchanged': True, 'testWarnings': 0, 'errors': 0}
(PACKET / 'lint-details.json').write_text(json.dumps(details, indent=2) + '\n')
print(json.dumps({'errors': 0, 'projectorWarnings': 2, 'projectorWarningsUnchanged': True, 'testWarnings': 0}))
