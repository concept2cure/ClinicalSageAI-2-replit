"""Use normal canonical Git transport with every repository hook enabled."""
import os,subprocess,sys,tempfile
from pathlib import Path

r=Path(__file__).resolve().parents[4]
assert subprocess.check_output(['git','branch','--show-current'],cwd=r,text=True).strip()=='concept2cure-v2'
assert subprocess.check_output(['git','config','core.hooksPath'],cwd=r,text=True).strip()=='.husky/_'
assert subprocess.check_output(['git','remote','get-url','origin'],cwd=r,text=True).strip()=='https://github.com/concept2cure/ClinicalSageAI-2-replit.git'
action=sys.argv[1]
assert action in ['fetch','push']
env=os.environ.copy()
for key in list(env):
 if key.startswith(('HUSKY','SKIP_')) or key in ['ALLOW_NON_CANONICAL_PUSH','TYPECHECK_FILES_PER_PROCESS']:
  del env[key]
env['PATH']='/workspace/scratch/editor-toolchain/node_modules/.bin:'+env['PATH']
env['TYPECHECK_HEAP_MB']='12288'
fd,name=tempfile.mkstemp(prefix='c2c-askpass-')
try:
 with os.fdopen(fd,'w') as f:
  f.write('#!/bin/sh\ncase "$1" in *Username*) printf "%s\\n" x-access-token ;; *Password*) printf "%s\\n" "$GH_TOKEN" ;; *) exit 1 ;; esac\n')
 os.chmod(name,0o700)
 env.update(GIT_ASKPASS=name,GIT_TERMINAL_PROMPT='0')
 result=subprocess.run(['git',action,'origin','concept2cure-v2'],cwd=r,env=env)
finally:
 Path(name).unlink(missing_ok=True)
sys.exit(result.returncode)
