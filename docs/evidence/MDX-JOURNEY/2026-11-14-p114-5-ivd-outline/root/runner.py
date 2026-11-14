import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

repo = Path('/workspace/ClinicalSageAI-2-replit')
base = repo / 'docs/evidence/MDX-JOURNEY/2026-11-14-p114-5-ivd-outline/root'
base.mkdir(exist_ok=True)
mode = sys.argv[1]
env = dict(os.environ, PATH='/workspace/.tooling/node_modules/node/bin:' + os.environ['PATH'])
env['TYPECHECK_HEAP_MB'] = '12288'
if mode == 'build':
    command = ['npm', 'run', 'build']
    env['NODE_OPTIONS'] = '--max-old-space-size=6144'
elif mode == 'typecheck':
    command = ['node', 'scripts/ci/typecheck-no-regression.mjs', '--incremental']
elif mode.startswith('server-build'):
    command = ['node', 'scripts/build-server.mjs']
    env['NODE_OPTIONS'] = '--max-old-space-size=6144'
elif mode.startswith('push'):
    command = ['git', 'push', 'origin', 'concept2cure-v2']
else:
    raise ValueError(mode)

def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo, text=True).strip()

def pin():
    paths = git('ls-files').splitlines()
    paths += git('ls-files', '--others', '--exclude-standard').splitlines()
    roots = ('client/', 'server/', 'shared/', 'agents/', 'scripts/', 'migrations/', 'db/migrations/')
    names = sorted({p for p in paths if (p.startswith(roots) and p.endswith(('.ts','.tsx','.js','.mjs','.json','.css','.html','.sql')))
                    or p in ['package.json','package-lock.json','tsconfig.json','vite.config.ts','vitest.config.ts','.typecheck-baseline.json']})
    return {p: hashlib.sha256((repo / p).read_bytes()).hexdigest() for p in names if (repo / p).is_file()}

before = pin()
start = time.time()
head = git('rev-parse', 'HEAD')
(base / (mode + '-start.json')).write_text(json.dumps({'head':head, 'command':command, 'startedAt':start,
    'nodeVersion':subprocess.check_output(['node','--version'],env=env,text=True).strip(),
    'environment':{'TYPECHECK_HEAP_MB':env['TYPECHECK_HEAP_MB'], 'NODE_OPTIONS':env.get('NODE_OPTIONS')},
    'sourcePins':before},indent=2)+'\n')
logfile = Path('/workspace/scratch/ivd-' + mode + '.raw.log')
with logfile.open('wb') as stream:
    result = subprocess.run(command, cwd=repo, env=env, stdout=stream, stderr=subprocess.STDOUT)
after = pin()
(base / (mode + '.log.gz')).write_bytes(gzip.compress(logfile.read_bytes(),mtime=0))
summary = {'head':head,'finishedHead':git('rev-parse','HEAD'),'command':command,'exitCode':result.returncode,
    'elapsedSeconds':round(time.time()-start,3),'declaredSourceFiles':len(before),'sourceStable':before==after,
    'sourceChanges':sorted(p for p in set(before)|set(after) if before.get(p)!=after.get(p))}
if mode.startswith('push'):
    try:
        summary['remoteHead'] = git('ls-remote','origin','refs/heads/concept2cure-v2').split()[0]
    except subprocess.CalledProcessError:
        summary['remoteHead'] = None
        summary['remoteProbe'] = 'Git transport credential unavailable; verify through connected GitHub'
(base / (mode + '.json')).write_text(json.dumps(summary,indent=2)+'\n')
(base / 'runner.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps(summary),flush=True)
raise SystemExit(0 if result.returncode==0 and before==after and summary['head']==summary['finishedHead'] else 1)
