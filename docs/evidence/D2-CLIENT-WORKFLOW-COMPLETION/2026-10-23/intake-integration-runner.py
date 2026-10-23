import subprocess,pathlib,os,json,gzip,hashlib,time,datetime
root=pathlib.Path('/workspace/ClinicalSageAI-2-replit');out=root/'docs/evidence/D2-CLIENT-WORKFLOW-COMPLETION/2026-10-23';env={**os.environ,'PATH':'/workspace/.tooling/node_modules/node/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=6144'}
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();paths=json.loads((out/'implementation-files.json').read_text());pins={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
def run(name,argv):
 start=time.time();r=subprocess.run(argv,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);(out/(name+'.log.gz')).write_bytes(gzip.compress(r.stdout));d={'argv':argv,'exitCode':r.returncode,'elapsedSeconds':round(time.time()-start,3),'sourceHead':head,'implementationPinsUnchanged':all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in pins.items()),'output':name+'.log.gz','outputSha256':hashlib.sha256(r.stdout).hexdigest()};(out/(name+'.json')).write_text(json.dumps(d,indent=2)+'\n');print(name,r.returncode,flush=True)
 if r.returncode:print(r.stdout.decode(errors='replace')[-5000:],flush=True)
 return d
changed=subprocess.check_output(['git','diff','--name-only','7184fb1fd...66ad10eaf','--','client','server','shared'],cwd=root,text=True).splitlines();files=[p for p in changed if '.test.' in p]
results=[run('intake-integration-tests',['node','node_modules/vitest/vitest.mjs','run',*files,'--reporter=verbose','--reporter=json','--outputFile='+str(out/'intake-integration-test-results.json')]),run('intake-integration-build',['npm','run','build'])]
(out/'intake-integration-summary.json').write_text(json.dumps({'sourceHead':head,'incomingRange':'7184fb1fd...66ad10eaf','runtimePaths':[f for f in changed if '.test.' not in f and not f.endswith('Fixture.ts') and not f.endswith('-fixture.ts')],'testFiles':files,'implementationSource':pins,'checks':results,'typescript':'normal pre-push gate still required'},indent=2)+'\n')
raise SystemExit(1 if any(x['exitCode'] or not x['implementationPinsUnchanged'] for x in results) else 0)
