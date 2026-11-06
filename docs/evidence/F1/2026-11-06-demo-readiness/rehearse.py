"""Rehearse the existing Codespaces application/CSR preparation on a private local fixture."""
import datetime,gzip,hashlib,json,os,secrets,subprocess,sys,time,urllib.error,urllib.request
from pathlib import Path

p=Path(__file__).resolve().parent;r=p.parents[3]
c=json.loads(Path('/workspace/scratch/project-editor-runtime.json').read_text())
assert c['port']==55432 and c['appPort']==5100 and c['database']=='c2c_project_editor_20261106'
private=Path('/workspace/scratch/demo-readiness-private.json')
if private.exists():d=json.loads(private.read_text())
else:
 d={'signerPassword':secrets.token_hex(24),'dataDir':'/workspace/scratch/demo-cdisc-pilot'}
 private.write_text(json.dumps(d));private.chmod(0o600)
redactions=[str(v) for k,v in {**c,**d}.items() if any(n in k.lower() for n in ['password','secret'])]
base=os.environ.copy();base['PATH']='/workspace/scratch/postgresql-client/bin:/workspace/scratch/editor-toolchain/node_modules/.bin:'+base['PATH']
base.update(NODE_ENV='development',NODE_USE_ENV_PROXY='1')
for name in ['DATABASE_URL','DATABASE_URL_PROD','DATABASE_OWNER_URL','DATABASE_NEON_NEW_SECRET','NEON_DATABASE_URL','DATABASE_URL_ADMIN','NEON_DATABASE_URL_ADMIN','DATABASE_URL_DIRECT','APP_SERVICE_DB_PASSWORD','APP_DATABASE_URL']:
 base.pop(name,None)
def run(label,argv,env):
 label=os.environ.get('C2C_REHEARSAL_PREFIX','')+label
 start=time.monotonic();result=subprocess.run(argv,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 raw=result.stdout.decode(errors='replace')
 for value in redactions:raw=raw.replace(value,'[REDACTED]')
 output=gzip.compress(raw.encode(),mtime=0);(p/(label+'.log.gz')).write_bytes(output)
 meta={'argv':argv,'exitCode':result.returncode,'elapsedSeconds':round(time.monotonic()-start,3),'rawOutput':label+'.log.gz','rawGzipSha256':hashlib.sha256(output).hexdigest()}
 (p/(label+'.json')).write_text(json.dumps(meta,indent=2)+'\n')
 print(json.dumps(meta),flush=True)
 if result.returncode:raise RuntimeError(label+' failed; inspect retained redacted log')
 return raw
owner=base.copy();owner['DATABASE_URL']=f"postgresql://postgres:{c['postgresPassword']}@127.0.0.1:55432/{c['database']}?sslmode=disable"
for email,name in [('ana.author@concept2cure.pro','Ana Author'),('rhea.reviewer@concept2cure.pro','Rhea Reviewer'),('ava.approver@concept2cure.pro','Ava Approver')]:
 env=owner.copy();env.update(ADMIN_EMAIL=email,ADMIN_NAME=name,ADMIN_PASSWORD=d['signerPassword'],ADMIN_ORG_SLUG='concept2cure')
 run('seed-'+email.split('@')[0].split('.')[0],['node','scripts/seed-admin.mjs'],env)
app=base.copy();app.update(APP_DATABASE_URL=f"postgresql://app_service:{c['appPassword']}@127.0.0.1:55432/{c['database']}?sslmode=disable",C2C_CODESPACE='1',CODESPACES='true',C2C_DB_MODE='local',PORT='5100',RLS_ENFORCE='on',EXPORT_REVIEW_GATE='enforce',ALLOW_DEV_AUTH='1',VITE_DEV_LOGIN_EMAIL='ana.author@concept2cure.pro',SESSION_SECRET=c['sessionSecret'],JWT_SECRET=c['jwtSecret'],REFRESH_TOKEN_SECRET=c['refreshSecret'],CONCEPT2CURE_SIGNER_MODE='dev',SKIP_DB_STARTUP_TEST='true',ALLOWED_ORIGINS='http://127.0.0.1:5100,http://localhost:5100')
report=run('doctor-prerequisites',['node','scripts/ops/codespaces-doctor.mjs','--json'],app)
log=Path('/workspace/scratch/demo-readiness-server.log');fd=os.open(log,os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
with os.fdopen(fd,'wb') as output:
 proc=subprocess.Popen(['npm','run','dev'],cwd=r,env=app,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
server={'pid':proc.pid,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'entrypoint':'npm run dev','port':5100,'codespacesFlags':True,'runtimeRole':'app_service','ownerCredentialInApp':False,'privateLog':str(log),'status':'starting'}
(p/'server.json').write_text(json.dumps(server,indent=2)+'\n');print(json.dumps(server),flush=True)
for attempt in range(60):
 try:
  try:response=urllib.request.urlopen('http://127.0.0.1:5100/readyz',timeout=2)
  except urllib.error.HTTPError as error:response=error
  with response:status=response.status;body=json.load(response)
  if body.get('schemaState')=='ready' and body.get('dependencies',{}).get('database')=='ok':break
 except (OSError,ValueError):pass
 time.sleep(1)
else:raise RuntimeError('App did not serve the native database/schema')
(p/'readiness.json').write_text(json.dumps({'httpStatus':status,'body':body},indent=2)+'\n')
assert body['anaState']=='no_provider','No live provider is authorized for this replica'
server['status']='serving; AnA unavailable without provider';(p/'server.json').write_text(json.dumps(server,indent=2)+'\n')
if '--serve-only' in sys.argv:sys.exit(0)
run('fetch-cdisc',['node','scripts/cre/fetch-cdisc-pilot-adam.mjs',d['dataDir']],base)
walk=app.copy();walk.update(DEMO_TAG='codespace',DEMO_PREPARE_UNTIL='freeze',DEMO_AUTHOR_EMAIL='ana.author@concept2cure.pro',DEMO_REVIEWER_EMAIL='rhea.reviewer@concept2cure.pro',DEMO_APPROVER_EMAIL='ava.approver@concept2cure.pro',DEMO_SIGNER_PASSWORD=d['signerPassword'])
run('csr-prepare',['node','--require',str(p/'browser-runtime.cjs'),'docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk.cjs','http://127.0.0.1:5100',d['dataDir'],'prepare'],walk)
print('Rehearsal preparation complete; server remains available for manual editor check.',flush=True)
