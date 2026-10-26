"""Normal canonical Git publication, using the inherited credential without printing it."""
import os,subprocess,sys,tempfile
from pathlib import Path
assert subprocess.check_output(['git','branch','--show-current'],text=True).strip()=='concept2cure-v2'
e=os.environ.copy()
e['PATH']='/workspace/scratch/editor-toolchain/node_modules/.bin:'+e['PATH']
for key in ['HUSKY','HUSKY_SKIP_HOOKS','SKIP_PREPUSH','SKIP_PRE_PUSH','SKIP_HOOKS','SKIP_TYPECHECK','ALLOW_NON_CANONICAL_PUSH']:e.pop(key,None)
fd,path=tempfile.mkstemp(prefix='csr-crf-askpass-',dir='/tmp')
os.write(fd,b'#!/bin/sh\ncase "$1" in\n *Username*) printf "%s\\n" x-access-token ;;\n *Password*) printf "%s\\n" "$GH_TOKEN" ;;\nesac\n');os.close(fd);os.chmod(path,0o700)
e.update(GIT_ASKPASS=path,GIT_TERMINAL_PROMPT='0')
try:
 mode=sys.argv[1]
 if mode=='fetch':argv=['git','fetch','origin','concept2cure-v2']
 elif mode=='push':argv=['git','push','origin','concept2cure-v2']
 elif mode=='commit':argv=['git','commit','-m',sys.argv[2]]
 else:raise ValueError('Unknown publication mode')
 result=subprocess.run(argv,env=e)
finally:os.unlink(path)
sys.exit(result.returncode)
