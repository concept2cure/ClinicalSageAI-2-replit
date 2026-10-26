from pathlib import Path
import datetime, gzip, hashlib, json, os, subprocess, sys, time
ROOT = Path.cwd()
PACKET = ROOT / 'docs/evidence/D2-EDITOR-SECTION-EVIDENCE/2026-10-26/http'
TEST = 'server/routes/__tests__/authoring-assembly.pglite.test.ts'
CASES = 'server/routes/__tests__/_authoring-assembly-section-source-cases.ts'
SOURCES = [TEST, CASES, 'server/routes/__tests__/_authoring-assembly-filing-cases.ts', 'server/routes/__tests__/_authoring-canvas-fixture.ts', 'tests/golden-journeys/harness.ts', 'server/services/authoring/authoring-assembly.ts', 'server/services/authoring/authoring-assembly-plan.ts', 'server/services/authoring/authoring-assembly-source.ts', 'server/services/authoring/authoring-assembly-sources.ts', 'server/services/authoring/builtin-authoring-templates.ts', 'server/services/market-specs/document-template-library.ts', 'server/services/ana/draft-source-window.ts', 'server/services/ana/draft-source-identity.ts', 'shared/authoring/assembly.ts', 'shared/authoring/assembly-sources.ts', 'server/routes/authoring.router.ts', 'vitest.config.ts', 'eslint.config.js', 'package.json', 'package-lock.json']
def snapshot(): return {path: (ROOT / path).read_bytes() for path in SOURCES}
def hashes(values): return {path: hashlib.sha256(raw).hexdigest() for path, raw in values.items()}
label, mode = sys.argv[1:3]
command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', TEST, '--reporter=verbose']
if mode == 'focused': command += ['-t', 'exact section source excerpts|whole-document and unmatched|invalid assembly structure']
if mode == 'lint': command = ['node', 'node_modules/eslint/bin/eslint.js', TEST, CASES, '--max-warnings=0']
env = dict(os.environ)
env['PATH'] = '/workspace/scratch/editor-toolchain/node_modules/.bin:' + env['PATH']
env['NODE_OPTIONS'] = '--max-old-space-size=4096'
before = snapshot()
with gzip.GzipFile(filename=str(PACKET / (label + '-source-snapshot.json.gz')), mode='wb', mtime=0) as archive:
    archive.write(json.dumps({path: raw.decode() for path, raw in before.items()}, sort_keys=True).encode())
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
start = time.monotonic()
result = subprocess.run(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
raw_path = PACKET / (label + '.log')
raw_path.write_bytes(result.stdout)
after = snapshot()
metadata = {'startedAt': started, 'elapsedSeconds': round(time.monotonic() - start, 3), 'argv': command, 'cwd': str(ROOT), 'nodeVersion': subprocess.check_output(['node', '--version'], env=env, text=True).strip(), 'nodeOptions': env['NODE_OPTIONS'], 'exitCode': result.returncode, 'sourcesBefore': hashes(before), 'sourcesAfter': hashes(after), 'sourceDrift': [path for path in SOURCES if before[path] != after[path]], 'sourceSnapshot': label + '-source-snapshot.json.gz', 'sourceSnapshotSha256': hashlib.sha256((PACKET / (label + '-source-snapshot.json.gz')).read_bytes()).hexdigest(), 'rawOutput': raw_path.name, 'rawSha256': hashlib.sha256(result.stdout).hexdigest()}
(PACKET / (label + '.json')).write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps({key: metadata[key] for key in ['exitCode', 'elapsedSeconds', 'sourceDrift', 'rawOutput', 'rawSha256']}))
print(result.stdout.decode(errors='replace')[-11000:])
