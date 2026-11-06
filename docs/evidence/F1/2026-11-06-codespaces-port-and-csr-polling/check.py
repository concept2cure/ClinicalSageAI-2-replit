"""Retain actual exits, raw output, and before/after hashes for bounded checks."""
import datetime,gzip,hashlib,json,os,re,subprocess,sys,time
from pathlib import Path
p=Path(__file__).resolve().parent;r=p.parents[3]
label,*argv=sys.argv[1:]
if argv and argv[0]=='--':argv=argv[1:]
assert argv
freeze=os.environ['C2C_SOURCE_FREEZE'];expected=json.loads((p/freeze).read_text())['files']
def pins():return {n:hashlib.sha256((r/n).read_bytes()).hexdigest() for n in expected}
before=pins();start=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.monotonic()
env=os.environ.copy();env['PATH']='/workspace/scratch/editor-toolchain/node_modules/.bin:'+env['PATH']
result=subprocess.run(argv,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
raw=gzip.compress(result.stdout,mtime=0);after=pins();output=label+'.log.gz';(p/output).write_bytes(raw)
plain=re.sub(r'\x1b\[[0-9;]*m','',result.stdout.decode(errors='replace'))
summary=[x.strip() for x in plain.splitlines() if re.search(r'^\s*(Test Files|Tests|Duration)\s',x)]
drift=[n for n in expected if before[n]!=expected[n] or after[n]!=expected[n]]
data={'startedAt':start,'elapsedSeconds':round(time.monotonic()-clock,3),'argv':argv,'exitCode':result.returncode,'sourceFreeze':freeze,'sourcesBefore':before,'sourcesAfter':after,'sourceDrift':drift,'rawOutput':output,'rawGzipSha256':hashlib.sha256(raw).hexdigest(),'testSummary':summary,'nodeVersion':subprocess.check_output(['node','--version'],env=env,text=True).strip()}
(p/(label+'.json')).write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({k:data[k] for k in ['exitCode','elapsedSeconds','sourceDrift','testSummary']}))
if result.returncode:print('\n'.join(plain.splitlines()[-32:])[-6000:])
sys.exit(result.returncode or (1 if drift else 0))
