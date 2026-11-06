"""Verify this launcher's accepted source, actual check receipts and owned artifacts."""
import gzip,hashlib,json,subprocess
from pathlib import Path

p=Path(__file__).resolve().parent;r=p.parents[3]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
def tree(ref):
 rows=subprocess.check_output(['git','ls-tree','-rz','--full-tree',ref],cwd=r).split(b'\0')
 return {name.decode():meta.decode().split()[2] for row in rows if row for meta,name in [row.split(b'\t',1)]}
def verify_blobs(files):
 identities={identity['gitBlob']:identity['sha256'] for identity in files.values()}
 result=subprocess.run(['git','cat-file','--batch'],cwd=r,input=('\n'.join(identities)+'\n').encode(),stdout=subprocess.PIPE,check=True)
 at=0
 for identity,expected in identities.items():
  end=result.stdout.index(b'\n',at);header=result.stdout[at:end].split()
  assert header[0].decode()==identity and header[1]==b'blob'
  start=end+1;end=start+int(header[2]);raw=result.stdout[start:end]
  assert sha(raw)==expected and blob(raw)==identity,identity
  assert result.stdout[end:end+1]==b'\n';at=end+1
 assert at==len(result.stdout)
manifest=json.loads((p/'launcher-artifact-manifest.json').read_text())
committed=tree('HEAD')
for name,expected in manifest['files'].items():
 file=p/name;raw=file.read_bytes();assert sha(raw)==expected,name
 assert committed.get(str(file.relative_to(r)))==blob(raw),name
for name in ['launcher-accepted-source.json','launcher-csr-source-blobs.json']:
 proof=json.loads((p/name).read_text());source=tree(proof['acceptedSourceHead'])
 for file,identity in proof['files'].items():
  assert source.get(file)==identity['gitBlob'],file
 verify_blobs(proof['files'])
 subprocess.run(['git','merge-base','--is-ancestor',proof['acceptedSourceHead'],'origin/concept2cure-v2'],cwd=r,check=True)
for name in ['launcher-green','source-fix-tests','startup-green','startup-browser-check','merged-demo-tests','source-push','csr-rehearsal','manual-editor']:
 receipt=json.loads((p/(name+'.json')).read_text());raw=(p/receipt['rawOutput']).read_bytes()
 assert receipt['exitCode']==0 and receipt['sourceDrift']==[],name
 assert sha(raw)==receipt['rawGzipSha256'],name
 expected=json.loads((p/receipt['sourceFreeze']).read_text())['files']
 assert receipt['sourcesBefore']==expected==receipt['sourcesAfter'],name
 gzip.decompress(raw)
assert json.loads((p/'launcher-csr-preparation.json').read_text())['outcome']=='passed'
assert json.loads((p/'manual-editor-result.json').read_text())['status']=='passed'
print(json.dumps({'verifiedOwnedArtifacts':len(manifest['files']),'nativeSourceInputs':len(json.loads((p/'launcher-csr-source-blobs.json').read_text())['files']),'acceptedSource':json.loads((p/'publication.json').read_text())['acceptedSourceHead']}))
