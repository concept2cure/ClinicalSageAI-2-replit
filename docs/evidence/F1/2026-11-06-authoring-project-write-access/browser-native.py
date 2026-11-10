"""Recheck the merged one-editor UI on the existing dedicated native fixture."""
import json,os,signal,subprocess,sys,time,urllib.error,urllib.request
from pathlib import Path

p=Path(__file__).resolve().parent;r=p.parents[3]
prior=p/'native-server-preintegration.json'
if not prior.exists():prior.write_bytes((p/'native-server.json').read_bytes())
subprocess.run(['python3',str(p/'start-local.py')],cwd=r,check=True)
server=json.loads((p/'native-server.json').read_text());pid=server['pid']
assert os.getpgid(pid)==pid
try:
 for attempt in range(45):
  try:
   try:response=urllib.request.urlopen('http://127.0.0.1:5100/readyz',timeout=2)
   except urllib.error.HTTPError as error:response=error
   with response:status=response.status;body=json.load(response)
   if body.get('schemaState')=='ready':break
  except (OSError,ValueError):pass
  time.sleep(1)
 else:raise RuntimeError('Native schema readiness did not complete')
 observed={'status':status,'body':body}
 (p/'native-readiness-integrated.json').write_text(json.dumps(observed,indent=2)+'\n')
 assert body['dependencies']['database']=='ok' and body['dependencies']['schema']=='ok'
 assert body['anaState']=='no_provider' and body['failed']==['ana']
 fixture=json.loads((p/'native-fixture.json').read_text())
 env=os.environ.copy();env.setdefault('C2C_SOURCE_FREEZE','integrated-inputs.json')
 env.update(BASE_URL='http://127.0.0.1:5100',SCOPE_TEST_EMAIL='scope.editor@example.test',SCOPE_TEST_PROGRAM=fixture['programId'],SCOPE_TEST_DOCUMENT=fixture['documentId'])
 result=subprocess.run(['python3',str(p/'check.py'),env.get('C2C_BROWSER_LABEL','integrated-browser'),'--','node',str(p/'browser-scope.cjs')],cwd=r,env=env)
 code=result.returncode
finally:
 os.killpg(pid,signal.SIGTERM)
 server['status']='stopped after integrated browser check'
 (p/'native-server.json').write_text(json.dumps(server,indent=2)+'\n')
sys.exit(code)
