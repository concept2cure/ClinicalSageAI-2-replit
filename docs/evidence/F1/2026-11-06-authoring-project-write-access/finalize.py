"""Record accepted Git bytes and verify this bounded evidence packet."""
import datetime,gzip,hashlib,json,subprocess,sys
from pathlib import Path

p=Path(__file__).resolve().parent;r=p.parents[3]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(name):return json.loads((p/name).read_text())
def git(*args):return subprocess.check_output(['git',*args],cwd=r)
def tree(ref):
 rows=git('ls-tree','-rz','--full-tree',ref).split(b'\0')
 return {name.decode():head.decode().split()[2] for row in rows if row for head,name in [row.split(b'\t',1)]}
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def receipt(name):
 d=read(name+'.json');raw=(p/d['rawOutput']).read_bytes()
 assert d['exitCode']==0 and d['sourceDrift']==[],name
 assert sha(raw)==d['rawGzipSha256'],name
 expected=read(d['sourceFreeze'])['files']
 assert d['sourcesBefore']==expected==d['sourcesAfter'],name
 return gzip.decompress(raw).decode(errors='replace')
def accepted():
 checks=['integrated-regression','integrated-lineage','integrated-gates','integrated-build','integrated-browser']
 freeze='integrated-inputs.json'
 if (p/'publication-bridge.json').exists():
  bridge=read('publication-bridge.json');freeze=bridge['finalFreeze']
  before=read('integrated-inputs.json')['files'];after=read(freeze)['files']
  assert set(before)<=set(after),'removed integrated input'
  changed={name:{'before':value,'after':after[name]} for name,value in before.items() if after[name]!=value}
  assert changed==bridge['changedIntegratedInputs'],'unreviewed source bridge'
  added={name:value for name,value in after.items() if name not in before}
  assert added==bridge['addedIntegratedInputs'],'unreviewed added input'
  rerun=read(bridge['rerunFreeze'])['files']
  assert set(rerun)==set(after),'rerun input set changed'
  helper_changes={name:{'before':value,'after':after[name]} for name,value in rerun.items() if after[name]!=value}
  assert helper_changes==bridge['evidenceHelperChangesAfterRerun'],'runtime source changed after rerun'
  assert set(helper_changes)<={str((p/'finalize.py').relative_to(r))},'only this evidence verifier can change after rerun'
  checks+=bridge['rerunChecks']
 for name in checks:receipt(name)
 output=receipt('source-push')
 assert 'errors found: 0 (tsc exit 0)' in output,'normal full CLI compiler must complete'
 assert 'Pre-push checks complete' in output,'all normal hooks must complete'
 head=git('rev-parse','HEAD').decode().strip()
 remote=git('rev-parse','origin/concept2cure-v2').decode().strip()
 subprocess.run(['git','merge-base','--is-ancestor',head,remote],cwd=r,check=True)
 committed=tree(remote);files={}
 for name,expected in read(freeze)['files'].items():
  raw=(r/name).read_bytes();assert sha(raw)==expected,name
  identity=blob(raw);assert committed.get(name)==identity,name
  files[name]={'sha256':expected,'gitBlob':identity}
 proof={'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acceptedSourceHead':head,'observedRemoteHead':remote,'acceptedBy':'normal git push with repository hooks; source-push.json/log.gz','branch':'concept2cure-v2','scope':read(freeze)['scope'],'sourceFreeze':freeze,'files':files}
 (p/'accepted-source.json').write_text(json.dumps(proof,indent=2)+'\n')
 result={'checks':checks,'vitest':'571 cases / 22 suites on integrated source; affected client suites rerun after the exact frontend merge if publication-bridge.json is present. Overlapping runs are not added.','node':'119 cases; unchanged server/CI inputs across frontend-only merge','browser':'8 cases at 1440/390; real positive and injected client-integrity faults','compiler':'Full CLI tsc exit 0, unchanged zero baseline, normal pre-push','acceptedSourceHead':head,'limitations':'OPEN_ITEMS.md; no live provider/agency/deployment, native concurrency or full CSR acceptance'}
 (p/'qualification.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'acceptedSourceHead':head,'qualifiedInputs':len(files)}))
def manifest():
 files={str(f.relative_to(p)):sha(f.read_bytes()) for f in sorted(p.rglob('*')) if f.is_file() and f!=p/'artifact-manifest.json'}
 (p/'artifact-manifest.json').write_text(json.dumps({'scope':'Every packet file recursively; only this root manifest excludes itself.','files':files},indent=2)+'\n')
 print(json.dumps({'artifacts':len(files)}))
def verify():
 expected=read('artifact-manifest.json')['files']
 actual={str(f.relative_to(p)):sha(f.read_bytes()) for f in p.rglob('*') if f.is_file() and f!=p/'artifact-manifest.json'}
 assert actual==expected,'packet artifacts changed or are missing'
 committed=tree('HEAD')
 for f in p.rglob('*'):
  if f.is_file():assert committed.get(str(f.relative_to(r)))==blob(f.read_bytes()),str(f)
 proof=read('accepted-source.json');source_tree=tree(proof['acceptedSourceHead'])
 for name,identity in proof['files'].items():
  raw=(r/name).read_bytes()
  assert sha(raw)==identity['sha256'] and blob(raw)==identity['gitBlob']==source_tree.get(name),name
 subprocess.run(['git','merge-base','--is-ancestor',proof['acceptedSourceHead'],'origin/concept2cure-v2'],cwd=r,check=True)
 for name in read('qualification.json')['checks']+['source-push']:receipt(name)
 print(json.dumps({'verifiedArtifacts':len(actual),'verifiedSourceInputs':len(proof['files']),'acceptedSourceHead':proof['acceptedSourceHead']}))
assert sys.argv[1] in ['accepted','manifest','verify']
{'accepted':accepted,'manifest':manifest,'verify':verify}[sys.argv[1]]()
