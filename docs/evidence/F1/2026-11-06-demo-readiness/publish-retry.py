"""Retry ordinary canonical publication, stopping on source changes or non-race failures."""
import gzip,hashlib,json,os,re,subprocess,sys,tempfile
from pathlib import Path

p=Path(__file__).resolve().parent;r=p.parents[3]
publisher=r/'docs/evidence/F1/2026-11-06-authoring-project-write-access/publish.py'
env=os.environ.copy();env['PATH']='/workspace/scratch/editor-toolchain/node_modules/.bin:'+env['PATH']
env['C2C_SOURCE_FREEZE']='source-fix-inputs.json'
expected=json.loads((p/'source-fix-inputs.json').read_text())['files']
def command(args):return subprocess.run(args,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
fd,name=tempfile.mkstemp(prefix='c2c-demo-publish-')
try:
 with os.fdopen(fd,'w') as f:f.write('#!/bin/sh\ncase "$1" in *Username*) printf "%s\\n" x-access-token ;; *Password*) printf "%s\\n" "$GH_TOKEN" ;; *) exit 1 ;; esac\n')
 os.chmod(name,0o700);env.update(GIT_ASKPASS=name,GIT_TERMINAL_PROMPT='0')
 for attempt in range(3,8):
  print('normal publication attempt',attempt,flush=True)
  fetched=command(['python3',str(publisher),'fetch']);print(fetched.stdout[-600:],flush=True)
  if fetched.returncode:sys.exit(fetched.returncode)
  ancestry=command(['git','merge-base','--is-ancestor','origin/concept2cure-v2','HEAD'])
  if ancestry.returncode:
   merged=command(['git','merge','origin/concept2cure-v2','-m','Merge canonical work before demo publication\n\nPlan: F1\nCompletes: package.json'])
   if merged.returncode:
    unmerged=command(['git','diff','--name-only','--diff-filter=U']).stdout.splitlines()
    coord='.design/claude-convergence/COORDINATION.md'
    if unmerged!=[coord]:print(merged.stdout[-2000:],flush=True);sys.exit(1)
    file=r/coord;source=file.read_text()
    pattern=re.compile(r'^<<<<<<< HEAD\n(.*?)^=======\n(.*?)^>>>>>>> [^\n]+\n',re.M|re.S)
    def retain(match):
     both=match.group(1)+match.group(2)
     assert all(not row.strip() or row.startswith('| ') for row in both.splitlines()),'non-table coordination conflict needs review'
     return both
    source,count=pattern.subn(retain,source);assert count and '<<<<<<<' not in source
    file.write_text(source)
    staged=command(['git','add','--',coord]);assert staged.returncode==0
    committed=command(['git','commit','-m','Preserve both coordination entries in the canonical demo merge','-m','Plan: F1\nCompletes: package.json'])
    if committed.returncode:print(committed.stdout[-2000:],flush=True);sys.exit(committed.returncode)
   print('canonical merge complete',flush=True)
  changed=[n for n,value in expected.items() if hashlib.sha256((r/n).read_bytes()).hexdigest()!=value]
  if changed:print(json.dumps({'qualifiedInputsChanged':changed}),flush=True);sys.exit(2)
  pushed=subprocess.run(['python3',str(p/'check.py'),'source-push','--','python3',str(publisher),'push'],cwd=r,env=env)
  if pushed.returncode==0:
   head=command(['git','rev-parse','HEAD']).stdout.strip()
   (p/'publication.json').write_text(json.dumps({'acceptedSourceHead':head,'normalAttempt':attempt,'sourceFreeze':'source-fix-inputs.json','exitCode':0},indent=2)+'\n')
   print('accepted canonical source',head,flush=True);sys.exit(0)
  receipt=json.loads((p/'source-push.json').read_text());old=p/receipt['rawOutput'];raw=gzip.decompress(old.read_bytes()).decode(errors='replace')
  new=p/f'source-push-ref-race-{attempt}.log.gz'
  if not any(text in raw for text in ['fetch first','non-fast-forward','cannot lock ref']):print(raw[-4000:],flush=True);sys.exit(pushed.returncode)
  old.rename(new);receipt['rawOutput']=new.name
  (p/f'source-push-ref-race-{attempt}.json').write_text(json.dumps(receipt,indent=2)+'\n');(p/'source-push.json').unlink()
  print('remote advanced; retrying normal fetch/merge',flush=True)
 sys.exit(1)
finally:Path(name).unlink(missing_ok=True)
