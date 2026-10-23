import datetime,gzip,hashlib,json,os,pathlib,subprocess,time
root=pathlib.Path('/workspace/ClinicalSageAI-2-replit');out=root/'docs/evidence/D2-CLIENT-WORKFLOW-COMPLETION/2026-10-23'
env={**os.environ,'PATH':'/workspace/.tooling/node_modules/node/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=6144'}
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
argv=['node','node_modules/vitest/vitest.mjs','run','server/services/c2c/__tests__/program-project-anchor-strict.test.ts','server/routes/__tests__/510k-estar-attachment-export.pglite.test.ts','--reporter=verbose','--reporter=json','--outputFile='+str(out/'intake-attachment-control-test-results.json')]
start=time.time();r=subprocess.run(argv,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
(out/'intake-attachment-control.log.gz').write_bytes(gzip.compress(r.stdout))
result={'sourceHead':head,'argv':argv,'exitCode':r.returncode,'elapsedSeconds':round(time.time()-start,3),'output':'intake-attachment-control.log.gz','outputSha256':hashlib.sha256(r.stdout).hexdigest()}
(out/'intake-attachment-control.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
if r.returncode:print(r.stdout.decode(errors='replace')[-6000:],flush=True)
raise SystemExit(r.returncode)
