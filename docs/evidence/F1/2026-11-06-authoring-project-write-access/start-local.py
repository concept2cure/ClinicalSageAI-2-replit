"""Start the existing app on the dedicated local fixture with runtime RLS enforced."""
import datetime,json,os,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent;r=p.parents[3]
assert json.loads((p/'native-setup.json').read_text())['exitCode']==0
c=json.loads(Path('/workspace/scratch/project-editor-runtime.json').read_text())
assert c['port']==55432 and c['appPort']==5100
owner=f"postgresql://postgres:{c['postgresPassword']}@127.0.0.1:55432/{c['database']}?sslmode=disable"
app=f"postgresql://app_service:{c['appPassword']}@127.0.0.1:55432/{c['database']}?sslmode=disable"
e=os.environ.copy();e.update(PATH='/workspace/scratch/postgresql-client/bin:/workspace/scratch/editor-toolchain/node_modules/.bin:'+e['PATH'],DATABASE_URL=owner,APP_DATABASE_URL=app,NODE_ENV='development',PORT='5100',HOST='127.0.0.1',ALLOWED_ORIGINS='http://127.0.0.1:5100',CORS_ALLOWED_ORIGINS='http://127.0.0.1:5100',C2C_DB_MODE='local',RLS_ENFORCE='on',EXPORT_REVIEW_GATE='enforce',ALLOW_DEV_AUTH='1',SESSION_SECRET=c['sessionSecret'],JWT_SECRET=c['jwtSecret'],REFRESH_TOKEN_SECRET=c['refreshSecret'],CONCEPT2CURE_SIGNER_MODE='dev',SKIP_DB_STARTUP_TEST='true',NODE_OPTIONS='--max-old-space-size=4096')
log=Path('/workspace/scratch/project-editor-server.log');fd=os.open(log,os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
with os.fdopen(fd,'wb') as output:
 proc=subprocess.Popen(['node','--import','tsx','server/index.ts'],cwd=r,env=e,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
d={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pid':proc.pid,'port':5100,'host':'127.0.0.1','runtimeRole':'app_service','rlsEnforce':'on','exportReviewGate':'enforce','modelRequestsPlanned':False,'allowedOrigin':'http://127.0.0.1:5100','entrypoint':'Existing direct server/index.ts command documented by AGENTS; schema already provisioned via existing up' ,'status':'starting; readiness still to be checked','privateLog':str(log)}
(p/'native-server.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d))
