from playwright.sync_api import sync_playwright
from pathlib import Path
import json
OUT=Path('/workspace/scratch/c2c-handoff-runtime'); BASE='http://127.0.0.1:5000'
state=json.loads((OUT/'browser-state.json').read_text())
ls={x['name']:x['value'] for x in state['origins'][0]['localStorage']}
with sync_playwright() as p:
 req=p.request.new_context(base_url=BASE,extra_http_headers={'Authorization':'Bearer '+ls['trialsage_access_token'],'Origin':BASE})
 r=req.get('/api/clients?purpose=project-intake')
 body=r.json()
 data=body.get('data',body)
 rows=data if isinstance(data,list) else data.get('clients',data.get('workspaces',[]))
 if r.status!=200 or not rows: raise RuntimeError('Client workspace list unavailable: '+str(r.status)+' keys '+str(body.keys()))
 workspace=rows[0]
 wid=int(workspace['id'])
 payload={'name':'F1 Recent conversation verification','productName':'Local handoff verification','programType':'ind','productType':'drug','primaryAgency':'FDA','clientWorkspaceId':wid}
 r=req.post('/api/c2c/projects',data=payload,headers={'x-client-id':str(wid)})
 body=r.json()
 if r.status!=201: raise RuntimeError('Create project failed '+str(r.status)+' '+json.dumps(body))
 project=body.get('data',body)
 (OUT/'project.json').write_text(json.dumps({'id':project['id'],'title':project.get('name',payload['name']),'workspaceId':wid},indent=2))
 print('Created local IND project:',project['id'])
 req.dispose()
