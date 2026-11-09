"""Use the existing bootstrap on this task's loopback DB, retaining redacted progress."""
import datetime,gzip,hashlib,json,os,re,subprocess,sys,time
from pathlib import Path
r=Path(__file__).resolve().parents[4];p=Path(__file__).resolve().parent
c=json.loads(Path('/workspace/scratch/project-editor-runtime.json').read_text())
assert c['database']=='c2c_project_editor_20261106' and c['port']==55432
owner=f"postgresql://postgres:{c['postgresPassword']}@127.0.0.1:{c['port']}/{c['database']}?sslmode=disable"
e=os.environ.copy();e.update(PATH='/workspace/scratch/postgresql-client/bin:/workspace/scratch/editor-toolchain/node_modules/.bin:'+e['PATH'],DATABASE_URL=owner,C2C_DB_NAME=c['database'],APP_SERVICE_DB_PASSWORD=c['appPassword'],ADMIN_EMAIL=c['adminEmail'],ADMIN_PASSWORD=c['adminPassword'],PORT=str(c['appPort']),C2C_DB_MODE='local')
started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.monotonic()
x=subprocess.Popen(['node','scripts/dev/up.mjs'],cwd=r,env=e,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
progress=p/'native-setup-running.log'
state={'startedAt':started,'pid':os.getpid(),'childPid':x.pid,'status':'running','dedicatedLoopbackDatabase':True}
(p/'native-setup-running.json').write_text(json.dumps(state,indent=2)+'\n')
with progress.open('w') as out:
 for line in x.stdout:
  for k in ['postgresPassword','appPassword','adminPassword','sessionSecret','jwtSecret','refreshSecret']:line=line.replace(c[k],'[REDACTED]')
  line=re.sub(r'postgres(?:ql)?://[^\s\x1b\"\']+','postgresql://[REDACTED]',line)
  out.write(line);out.flush()
code=x.wait();raw=gzip.compress(progress.read_bytes(),mtime=0);(p/'native-setup.log.gz').write_bytes(raw)
d={'startedAt':started,'elapsedSeconds':round(time.monotonic()-clock,3),'exitCode':code,'scope':'Existing scripts/dev/up.mjs; dedicated Docker PostgreSQL16/pgvector on loopback55432; psql16 copied from the same image, no governed step omitted.','credentialsRedacted':True,'rawOutput':'native-setup.log.gz','rawGzipSha256':hashlib.sha256(raw).hexdigest()}
(p/'native-setup.json').write_text(json.dumps(d,indent=2)+'\n');state.update(status='completed',exitCode=code);(p/'native-setup-running.json').write_text(json.dumps(state,indent=2)+'\n')
print(json.dumps(d))
if code:print('\n'.join(progress.read_text().splitlines()[-30:]))
progress.unlink();sys.exit(code)
