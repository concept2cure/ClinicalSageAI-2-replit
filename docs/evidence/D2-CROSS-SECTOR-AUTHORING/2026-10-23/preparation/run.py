import datetime, gzip, hashlib, json, os, re, subprocess, sys, time
from pathlib import Path
PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[4]
label, *argv = sys.argv[1:]
if argv and argv[0] == '--': argv = argv[1:]
files = ['server/services/market-specs/document-preparation.ts', 'server/services/ana/builtin-template-reference.ts', 'server/services/ana/__tests__/shared-planning-template-preparation.test.ts', 'server/services/market-specs/shared-planning-preparation.ts']
files = [name for name in files if (ROOT / name).exists()]
pins = lambda: {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in files}
before = pins()
env = os.environ.copy(); env['PATH'] = '/workspace/scratch/editor-toolchain/node_modules/.bin:' + env['PATH']
if any('vitest' in arg for arg in argv): env['NODE_OPTIONS'] = '--max-old-space-size=4096'
started = datetime.datetime.now(datetime.timezone.utc).isoformat(); clock = time.monotonic()
r = subprocess.run(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
raw = gzip.compress(r.stdout, mtime=0); output = label + '.log.gz'; (PACKET / output).write_bytes(raw)
after = pins(); drift = [name for name in before if before[name] != after[name]]
plain = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout.decode(errors='replace'))
summary = [line.strip() for line in plain.splitlines() if re.search(r'^\s*(Test Files|Tests|Duration)\s', line)]
d = {'argv': argv, 'cwd': str(ROOT), 'startedAt': started, 'elapsedSeconds': round(time.monotonic()-clock,3), 'exitCode': r.returncode, 'nodeVersion': subprocess.check_output(['node','--version'],env=env,text=True).strip(), 'nodeOptions':env.get('NODE_OPTIONS'), 'sourcesBefore': before, 'sourcesAfter': after, 'sourceDrift': drift, 'rawOutput': output, 'rawGzipSha256': hashlib.sha256(raw).hexdigest(), 'testSummary':summary}
(PACKET/(label+'.json')).write_text(json.dumps(d,indent=2)+'\n')
print(json.dumps({k:d[k] for k in ['exitCode','elapsedSeconds','sourceDrift','testSummary']}))
if r.returncode: print('\n'.join(plain.splitlines()[-35:]))
sys.exit(r.returncode or (1 if drift else 0))
