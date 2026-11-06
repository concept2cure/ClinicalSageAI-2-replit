"""Verify owned artifacts, real check receipts and the accepted code blobs."""
import gzip,hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent;r=p.parents[3]
manifest=json.loads((p/'manifest.json').read_text())
for name,want in manifest['artifacts'].items():
 f=p/name;assert hashlib.sha256(f.read_bytes()).hexdigest()==want,name
 subprocess.run(['git','ls-files','--error-unmatch','--',str(f.relative_to(r))],cwd=r,check=True,stdout=subprocess.DEVNULL)
expected_receipts={name:0 for name in ['port-red','csr-red','csr-green','port-green','runtime-start','csr-latency-red','csr-final','startup-final','native-narrative-prepare','browser-order','build','browser-order-attempt2','source-push']}
for name in ['port-red','csr-red','csr-latency-red','browser-order']:expected_receipts[name]=1
expected_receipts['source-push-attempt1']=1
expected_receipts.update({name:0 for name in ['csr-merged','build-merged','runtime-merged-start','browser-merged','runtime-merged-stop']})
expected_receipts['evidence-lint']=0
expected_receipts['evidence-lint-attempt1']=1
expected_receipts.update({name:0 for name in ['runtime-delivery-start','browser-delivery','manual-editor','runtime-delivery-stop']})
seen=set()
for f in p.glob('*.json'):
 d=json.loads(f.read_text())
 if not isinstance(d,dict) or 'rawOutput' not in d:continue
 raw=(p/d['rawOutput']).read_bytes();assert hashlib.sha256(raw).hexdigest()==d['rawGzipSha256'],f.name
 gzip.decompress(raw)
 assert f.stem in expected_receipts,f.name
 assert d['exitCode']==expected_receipts[f.stem],(f.name,d['exitCode'])
 assert not d['sourceDrift'],f.name
 freeze=json.loads((p/d['sourceFreeze']).read_text())['files']
 assert d['sourcesBefore']==freeze and d['sourcesAfter']==freeze,f.name
 if f.stem in ['csr-final','startup-final','build']:
  assert d['sourceFreeze']=='final-inputs.json',f.name
  for name,want in manifest['codeFiles'].items():assert freeze[name]==want,(f.name,name)
 if f.stem in ['source-push','csr-merged','build-merged']:
  assert d['sourceFreeze']=='merged-inputs.json',f.name
  for name,want in manifest['codeFiles'].items():assert freeze[name]==want,(f.name,name)
 if f.stem in ['browser-order-attempt2','native-narrative-prepare','browser-merged','runtime-merged-start','runtime-merged-stop']:
  name='client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx'
  assert freeze[name]==manifest['codeFiles'][name],f.name
 if f.stem in ['browser-order-attempt2','browser-merged','evidence-lint-attempt1']:
  name=str((p/'browser-narrative-order.cjs').relative_to(r))
  assert freeze[name]==manifest['artifacts']['browser-narrative-order-tested.txt'],f.name
 if f.stem in ['browser-delivery','manual-editor','runtime-delivery-start','runtime-delivery-stop','evidence-lint']:
  name='client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx'
  assert freeze[name]==manifest['codeFiles'][name],f.name
  for script in ['browser-narrative-order.cjs','browser-manual-edit.cjs']:
   name=str((p/script).relative_to(r))
   assert freeze[name]==manifest['artifacts'][script],(f.name,script)
 seen.add(f.stem)
assert seen==set(expected_receipts),sorted(set(expected_receipts)-seen)
commit=manifest['sourceCommit']
subprocess.run(['git','merge-base','--is-ancestor',commit,'HEAD'],cwd=r,check=True)
subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/concept2cure-v2'],cwd=r,check=True)
for name,want in manifest['codeFiles'].items():
 blob=subprocess.check_output(['git','cat-file','blob',commit+':'+name],cwd=r)
 assert hashlib.sha256(blob).hexdigest()==want,name
print(json.dumps({'status':'passed','artifacts':len(manifest['artifacts']),'receipts':len(seen),'sourceCommit':commit,'verifiedCodeBlobs':len(manifest['codeFiles'])}))
