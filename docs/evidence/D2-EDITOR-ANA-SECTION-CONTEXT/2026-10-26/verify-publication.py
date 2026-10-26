"""Read-only proof that qualified source and evidence are in an actual canonical revision."""
import argparse, hashlib, json, subprocess
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--revision',default='HEAD')
parser.add_argument('--artifacts',action='store_true')
args=parser.parse_args()
packet=Path(__file__).resolve().parent
root=packet.parents[3]
relative=packet.relative_to(root).as_posix()
def git(*argv): return subprocess.check_output(['git',*argv],cwd=root)
def sha(data): return hashlib.sha256(data).hexdigest()
revision=git('rev-parse',args.revision).decode().strip()
publication=json.loads((packet/'source-publication.json').read_text())
inputs=json.loads((packet/publication['qualifiedInputs']).read_text())['files']
for name,expected in inputs.items():
 assert sha(git('show',f'{revision}:{name}'))==expected,name
 assert sha((root/name).read_bytes())==expected,name
source=publication['sourceCommit']
subprocess.run(['git','merge-base','--is-ancestor',source,revision],cwd=root,check=True)
count=None
if args.artifacts:
 manifest=json.loads(git('show',f'{revision}:{relative}/artifact-manifest.json'))['files']
 for name,expected in manifest.items():
  assert sha(git('show',f'{revision}:{relative}/{name}'))==expected,name
  assert sha((packet/name).read_bytes())==expected,name
 tracked=set(git('ls-files','-z','--',relative).decode().split('\0'))
 actual={f.relative_to(root).as_posix() for f in packet.rglob('*') if f.is_file()}
 assert actual<=tracked,sorted(actual-tracked)
 assert {f.relative_to(packet).as_posix() for f in packet.rglob('*') if f.is_file()}==set(manifest)|{'artifact-manifest.json'}
 count=len(manifest)+1
print(json.dumps({'verifiedRevision':revision,'sourceCommit':source,'sourceIsAncestor':True,'qualifiedGitInputBlobs':len(inputs),'allInputsMatch':True,'evidenceArtifacts':count}))
