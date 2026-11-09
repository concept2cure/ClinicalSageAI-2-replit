"""Prepare an isolated bound job and fact-only narratives through existing APIs.
The one-section parent job is not a full CSR or successful model generation.
The local runtime has no provider; narratives use the existing fact-only engine.
No source rows, narrative text, access token or provider response is retained here.
"""
import datetime,json,time,urllib.error,urllib.request
from pathlib import Path
p=Path(__file__).resolve().parent
s=json.loads(Path('/workspace/scratch/demo-cdisc-pilot/csr-demo-state.json').read_text())
base='http://127.0.0.1:5100';token=None
result={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'parentRequestedSections':['1'],'fullCsrRequested':False,'providerConfigured':False,'narrativeEngine':'existing fact-only template engine','signingOrAgencySubmission':False}
def call(path,data=None):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=headers)
 try:r=urllib.request.urlopen(req,timeout=20)
 except urllib.error.HTTPError as e:r=e
 with r:status=r.status;body=json.load(r)
 assert status<400,f'{req.method} {path.split("?")[0]} refused HTTP{status}'
 return status,body
try:
 _,auth=call('/api/auth/dev-login',{'email':'ana.author@concept2cure.pro'});token=auth['accessToken']
 _,tables=call(f"/api/submission-orchestrator/runs/{s['studyDataId']}/clinical-tables?programId={s['programId']}")
 source=tables['studies'][0]['source']
 code,job=call('/api/csr/jobs',{'programId':s['programId'],'studyInfo':source['studyInfo'],'sectionsToGenerate':['1'],'evidenceSource':{'programId':s['programId'],'runId':s['studyDataId'],'studyId':source['studyId']}})
 job_id=job['jobId'];result.update(jobId=job_id,parentQueueHttpStatus=code)
 for _ in range(25):
  _,status=call(f'/api/csr/jobs/{job_id}')
  if status.get('status') in ['complete','failed','cancelled']:break
  time.sleep(.5)
 result['parentStatus']=status.get('status');assert result['parentStatus'] in ['complete','failed']
 code,queued=call(f'/api/csr/jobs/{job_id}/narratives',{})
 result['narrativeQueueHttpStatus']=code
 for _ in range(40):
  _,status=call(f'/api/csr/jobs/{job_id}/narratives/status');run=status.get('run')
  if run and run['status'] in ['complete','failed']:break
  time.sleep(.5)
 assert run and run['status']=='complete','Fact-only native narrative run did not complete'
 _,qc=call(f'/api/csr/jobs/{job_id}/narratives')
 assert len(qc.get('subjects',[]))>0,'Native QC list is empty'
 result.update(status='passed',nativeNarrativeStatus=run['status'],nativeQcHasSubjects=True)
finally:
 result['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (p/'native-narrative-fixture.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
