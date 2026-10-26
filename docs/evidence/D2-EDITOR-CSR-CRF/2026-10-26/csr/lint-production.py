"""Compare scoped production lint against the actual frozen baseline bytes."""
import gzip,hashlib,json,subprocess,sys,datetime,re
from pathlib import Path
p=Path(__file__).resolve().parent;root=p.parents[4]
rows=json.loads((p/'baseline-inputs.json').read_text())['inputs']
rows=[r for r in rows if '/__tests__/' not in r['path'] and r['path'].endswith(('.ts','.tsx')) and r['path'].startswith(('server/services/','client/src/'))]
outputs={}; receipts=[]
for epoch in ['baseline','current']:
 results=[]
 for r in rows:
  data=gzip.decompress((p/r['snapshot']).read_bytes()) if epoch=='baseline' else (root/r['path']).read_bytes()
  cmd=['node','node_modules/eslint/bin/eslint.js','--stdin','--stdin-filename',r['path'],'--format=json']
  done=subprocess.run(cmd,cwd=root,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  assert done.returncode in [0,1],done.stderr.decode()
  results.extend(json.loads(done.stdout))
  receipts.append({'epoch':epoch,'path':r['path'],'sourceSha256':hashlib.sha256(data).hexdigest(),'exitCode':done.returncode})
 outputs[epoch]=results
 (p/f'lint-production-{epoch}.json.gz').write_bytes(gzip.compress(json.dumps(results,indent=2).encode(),mtime=0))
comparison=[]
for before,after in zip(outputs['baseline'],outputs['current']):
 a=[(m['ruleId'],m['message']) for m in before['messages'] if m['severity']==1]
 b=[(m['ruleId'],m['message']) for m in after['messages'] if m['severity']==1]
 comparison.append({'path':str(Path(after['filePath']).relative_to(root)),'baselineWarnings':before['warningCount'],'currentWarnings':after['warningCount'],'baselineErrors':before['errorCount'],'currentErrors':after['errorCount'],'baselineMessages':a,'currentMessages':b,'unchangedWarningMetrics':a==b})
(p/'lint-production-comparison.json').write_text(json.dumps({'capturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':comparison,'receipts':receipts},indent=2)+'\n')
problems=[r for r in comparison if r['currentErrors'] or not r['unchangedWarningMetrics']]
print(json.dumps({'files':len(comparison),'problems':problems},indent=2))
sys.exit(bool(problems))
