from pathlib import Path
from urllib.parse import unquote
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import subprocess, json, hashlib, time
import sys
root = Path(sys.argv[1])
out = root / 'details'; out.mkdir(exist_ok=True)
ids = unquote(json.loads((root/'export-form.json').read_text())['stds_id_list']).split(',')
assert len(ids) == len(set(ids)) == 1738 and all(i.isdigit() for i in ids)
start = time.monotonic()
def fetch(identifier):
    url = f'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/detail.cfm?standard__identification_no={identifier}'
    target = out/f'{identifier}.html'; headers = out/f'{identifier}.headers'
    result = subprocess.run(['curl','-sS','--fail-with-body','-L','--max-time','30','--retry','1','--retry-delay','2','--retry-max-time','60','-D',str(headers),'-o',str(target),'-w','%{http_code} %{url_effective}',url],capture_output=True,text=True)
    data = target.read_bytes() if target.exists() else b''
    return {'id':identifier,'requestedUrl':url,'http':result.stdout,'exitCode':result.returncode,'error':result.stderr.strip(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'retrievedAt':datetime.now(timezone.utc).isoformat()}
records=[]
with ThreadPoolExecutor(max_workers=8) as executor:
    futures=[executor.submit(fetch,identifier) for identifier in ids]
    for future in as_completed(futures):
        records.append(future.result())
        if len(records)%100 == 0: print(json.dumps({'completed':len(records),'of':len(ids),'errors':sum(r['exitCode']!=0 for r in records),'elapsedSeconds':round(time.monotonic()-start,1)}),flush=True)
(root/'details-acquisition.json').write_text(json.dumps({'workers':8,'expectedRecordIds':ids,'complete':len(records)==len(ids) and all(r['exitCode']==0 and r['http'].startswith('200 ') for r in records),'elapsedSeconds':round(time.monotonic()-start,1),'records':sorted(records,key=lambda r:int(r['id']))},indent=2)+'\n')
print(json.dumps({'completed':len(records),'errors':sum(r['exitCode']!=0 for r in records),'elapsedSeconds':round(time.monotonic()-start,1)}),flush=True)
raise SystemExit(0 if all(r['exitCode']==0 and r['http'].startswith('200 ') for r in records) else 1)
