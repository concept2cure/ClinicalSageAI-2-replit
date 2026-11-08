"""Run the existing dev launcher against the already prepared private local fixture."""
import datetime,json,os,signal,subprocess,sys,time,urllib.error,urllib.request
from pathlib import Path
p=Path(__file__).resolve().parent;r=p.parents[3]
record=p/'runtime.json'
if sys.argv[1]=='stop':
 d=json.loads(record.read_text());pid=d['pid'];cmd=Path(f'/proc/{pid}/cmdline')
 if cmd.exists():
  assert os.getpgid(pid)==pid and b'npm' in cmd.read_bytes()
  os.killpg(pid,signal.SIGTERM)
 d['stoppedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();record.write_text(json.dumps(d,indent=2)+'\n');print('Stopped this rehearsal process group.');sys.exit(0)
assert sys.argv[1]=='start'
c=json.loads(Path('/workspace/scratch/project-editor-runtime.json').read_text())
assert (c['port'],c['appPort'],c['database'])==(55432,5100,'c2c_project_editor_20261106')
env=os.environ.copy();env['PATH']='/workspace/scratch/postgresql-client/bin:/workspace/scratch/editor-toolchain/node_modules/.bin:'+env['PATH']
for key in list(env):
 if key in ['DATABASE_URL','DATABASE_URL_PROD','DATABASE_OWNER_URL','DATABASE_NEON_NEW_SECRET','NEON_DATABASE_URL','DATABASE_URL_ADMIN','NEON_DATABASE_URL_ADMIN','DATABASE_URL_DIRECT','APP_SERVICE_DB_PASSWORD','APP_DATABASE_URL','GH_TOKEN','GITHUB_TOKEN']:
  env.pop(key,None)
env.update(NODE_ENV='development',NODE_USE_ENV_PROXY='1',APP_DATABASE_URL=f"postgresql://app_service:{c['appPassword']}@127.0.0.1:55432/{c['database']}?sslmode=disable",C2C_CODESPACE='1',CODESPACES='true',C2C_DB_MODE='local',PORT='5100',RLS_ENFORCE='on',EXPORT_REVIEW_GATE='enforce',ALLOW_DEV_AUTH='1',VITE_DEV_LOGIN_EMAIL='ana.author@concept2cure.pro',SESSION_SECRET=c['sessionSecret'],JWT_SECRET=c['jwtSecret'],REFRESH_TOKEN_SECRET=c['refreshSecret'],CONCEPT2CURE_SIGNER_MODE='dev',SKIP_DB_STARTUP_TEST='true',ALLOWED_ORIGINS='http://127.0.0.1:5100,http://localhost:5100')
log=Path('/workspace/scratch/port-csr-runtime.log');fd=os.open(log,os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
with os.fdopen(fd,'wb') as output:
 proc=subprocess.Popen(['npm','run','dev'],cwd=r,env=env,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
d={'pid':proc.pid,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'entrypoint':'npm run dev','port':5100,'codespacesFlags':True,'runtimeRole':'app_service','ownerCredentialInApp':False,'providerConfigured':False,'status':'starting'}
record.write_text(json.dumps(d,indent=2)+'\n')
for attempt in range(55):
 if proc.poll() is not None:raise RuntimeError('Rehearsal process exited; inspect private runtime log')
 try:
  try:response=urllib.request.urlopen('http://127.0.0.1:5100/readyz',timeout=1)
  except urllib.error.HTTPError as error:response=error
  with response:status=response.status;body=json.load(response)
  if body.get('schemaState')=='ready' and body.get('dependencies',{}).get('database')=='ok':break
 except (OSError,ValueError):pass
 time.sleep(.5)
else:raise RuntimeError('Rehearsal readiness timed out')
assert body['anaState']=='no_provider'
(p/'readiness.json').write_text(json.dumps({'httpStatus':status,'body':body},indent=2)+'\n')
d['status']='serving; AnA no_provider';record.write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d))
