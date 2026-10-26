from pathlib import Path
import datetime, gzip, hashlib, json, os, subprocess, sys, time
ROOT = Path.cwd()
PACKET = ROOT / 'docs/evidence/D2-EDITOR-REGIONAL-REDRAFT/2026-10-26/workbench'
TEST = 'client/src/concept2cure/v2/editor/__tests__/sourceFirstAssemblyFlow.test.tsx'
SOURCES = [TEST, 'client/src/concept2cure/v2/editor/assemblyDraftQueue.ts', 'client/src/concept2cure/v2/editor/assemblyBuildState.ts', 'client/src/concept2cure/v2/editor/useAuthoringAssemblyBuild.ts', 'client/src/concept2cure/v2/editor/AuthoringAssemblyBuild.tsx', 'client/src/concept2cure/v2/editor/assemblyBuildTransport.ts', 'client/src/concept2cure/v2/editor/authoringDraftTransport.ts', 'client/src/concept2cure/v2/editor/useAuthoringDraftReview.ts', 'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx', 'client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx', 'vitest.config.ts', 'eslint.config.js', 'package.json', 'package-lock.json']
def snapshot(): return {path: (ROOT / path).read_bytes() for path in SOURCES}
def hashes(values): return {path: hashlib.sha256(raw).hexdigest() for path, raw in values.items()}
label, mode = sys.argv[1:3]
command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', TEST, '--reporter=verbose']
if mode == 'focused': command += ['-t', 'drafting inputs and exact sources']
if mode == 'lint': command = ['node', 'node_modules/eslint/bin/eslint.js', TEST, '--max-warnings=0']
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
