"""Read only canonical retained endpoints; development token remains in memory."""
import importlib.util,json,pathlib
from playwright.sync_api import sync_playwright
folder=pathlib.Path('/tmp/submission-deliverables-browser-prep');config=json.loads((folder/'fixture-identities.json').read_text())
spec=importlib.util.spec_from_file_location('review',folder/'review_live.py');review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
results={'qualification':'Retained read-only 409 investigation on the first pre-repair diagnostic runtime; no fixture or source changes.','reads':[]}
with sync_playwright() as driver:
 context=driver.request.new_context()
 login=context.post(config['baseUrl']+'/api/auth/dev-login',data={'email':config['ownerEmail']})
 assert login.status==200
 session=login.json();assert str(session['user']['id'])=='15' and str(session['user']['organizationId'])=='15'
 token=session['accessToken']
 def get(path):
  response=context.get(config['baseUrl']+path,headers={'Authorization':'Bearer '+token,'x-organization-id':'15'},timeout=45000)
  return response.status,response.json()
 for fixture in config['fixtures']:
  path='/api/submissions?programId='+fixture['programId'];status,body=get(path)
  entry={'path':path,'status':status}
  if status==200:
   entry['rows']=[{k:row.get(k) for k in ['id','title','programId','projectId','applicationType']} for row in review.rows(body)]
  results['reads'].append(entry)
 for path in ['/api/submissions/12','/api/submissions/12/sequences']:
  status,body=get(path)
  entry={'path':path,'status':status}
  if isinstance(body,dict):entry['failure']={key:body[key] for key in ['code','error','message'] if key in body}
  results['reads'].append(entry)
 context.dispose()
(folder/'retained-409-investigation.json').write_text(json.dumps(results,indent=2)+'\n');(folder/'retained-409-investigation.json').chmod(0o600)
print(json.dumps(results,indent=2))
