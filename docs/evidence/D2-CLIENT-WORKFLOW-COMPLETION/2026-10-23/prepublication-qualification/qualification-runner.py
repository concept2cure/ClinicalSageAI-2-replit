import subprocess,os,json,time,hashlib,pathlib,gzip,concurrent.futures
root=pathlib.Path('/workspace/ClinicalSageAI-2-replit'); out=root/'docs/evidence/D2-CLIENT-WORKFLOW-COMPLETION/2026-10-23'
env={**os.environ,'PATH':'/workspace/.tooling/node_modules/node/bin:'+os.environ['PATH']}
def capture():
 paths=set(subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=root,text=True).splitlines()+subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines())
 return {'baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'dirtySource':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() if (root/p).exists() else None for p in sorted(paths) if not p.startswith('docs/')}}
freeze=capture();(out/'qualification-source-freeze.json').write_text(json.dumps(freeze,indent=2)+'\n')
def run(name,argv,extra=None):
 before=capture();start=time.time();at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 r=subprocess.run(argv,cwd=root,env={**env,**(extra or {})},stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 filename=name+'.log.gz';(out/filename).write_bytes(gzip.compress(r.stdout))
 data={'argv':argv,'startedAt':at,'elapsedSeconds':round(time.time()-start,3),'exitCode':r.returncode,'output':filename,'outputSha256':hashlib.sha256(r.stdout).hexdigest(),'sourceFreeze':'qualification-source-freeze.json','matchesFreezeBefore':before==freeze,'matchesFreezeAfter':capture()==freeze}
 (out/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n');print(name,r.returncode,data['elapsedSeconds'],flush=True)
 if r.returncode:print(r.stdout.decode(errors='replace')[-6000:],flush=True)
 return data
suites=set(str(p.relative_to(root)) for p in (root/'server/services/pathway-engines/estar/__tests__').glob('*.test.ts'))
suites.update(str(p.relative_to(root)) for p in (root/'server/routes/__tests__').glob('*estar*.test.ts'))
suites.update(str(p.relative_to(root)) for p in (root/'server/routes/__tests__').glob('*attachment*.test.ts'))
suites.update(str(p.relative_to(root)) for p in (root/'client/src/concept2cure/mdx').rglob('__tests__/*Estar*.test.*'))
suites.update(str(p.relative_to(root)) for p in (root/'client/src/concept2cure/mdx').rglob('__tests__/*estar*.test.*'))
suites.update([
'client/src/concept2cure/mdx/__tests__/k510IvdVariant.test.tsx',
'client/src/concept2cure/mdx/surfaces/__tests__/IvdSurface.unassessed.test.tsx',
'client/src/concept2cure/v2/__tests__/vaultVersionPicker.test.tsx',
'client/src/concept2cure/v2/__tests__/submissionMutationOutcome.test.ts',
'client/src/concept2cure/mdx/hooks/__tests__/useMdxPrograms.productType.test.ts',
'client/src/concept2cure/v2/__tests__/companyDocumentReviewTools.test.tsx',
'client/src/concept2cure/v2/__tests__/companyLegalWorkflows.test.tsx',
'client/src/concept2cure/v2/__tests__/vaultSearchSelection.test.tsx',
'client/src/concept2cure/v2/__tests__/vaultSearchFilters.test.tsx',
'client/src/concept2cure/v2/__tests__/vaultLibrarySearch.test.tsx',
'server/services/vault/__tests__/vault-lifecycle.pglite.test.ts',
'server/services/vault/__tests__/company-legal-validity.test.ts',
'server/services/vault/__tests__/company-legal-copy-lineage.pglite.test.ts',
'server/routes/__tests__/authoringFileToVaultApprovalCarry.pglite.integration.test.ts',
'tests/golden-journeys/device-510k-estar.journey.test.ts'])
suites={p for p in suites if (root/p).is_file()}
# Include every changed/new test, even if a focused helper lives outside the known paths.
suites.update(p for p in freeze['dirtySource'] if '.test.' in p and (root/p).is_file())
(out/'qualification-test-files.json').write_text(json.dumps(sorted(suites),indent=2)+'\n')
results=[run('qualification-regressions',['node','node_modules/vitest/vitest.mjs','run',*sorted(suites),'--reporter=verbose','--reporter=json','--outputFile='+str(out/'qualification-regressions-tests.json')],{'NODE_OPTIONS':'--max-old-space-size=6144'})]
gates=['ci:single-native-canvas','ci:canvas-path','ci:design-system','ci:class-vocabulary','ci:filing-exit-agreement','ci:internals-in-copy','ci:empty-state-honesty','ci:action-overclaim','ci:success-before-ok','ci:undefined-css-classes','ci:token-contrast','ci:token-cascade','ci:surface-text-ramp','ci:check-shell-css-collisions','ci:vault-document-writers','audit:repo-health:ceiling']
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results+=list(pool.map(lambda g:run(g.replace(':','-'),['npm','run','--silent',g]),gates))
files=[p for p in freeze['dirtySource'] if p.endswith(('.ts','.tsx','.js','.mjs'))]
results.append(run('qualification-eslint',['node','node_modules/eslint/bin/eslint.js',*files,'--no-ignore','--format=json']))
results.append(run('qualification-warning-ratchet',['node','scripts/ci/check-eslint-warning-ratchet.mjs','--since',freeze['baseCommit'],'--gate']))
results.append(run('qualification-build',['npm','run','build'],{'NODE_OPTIONS':'--max-old-space-size=6144'}))
results.append(run('qualification-typecheck',['node','scripts/ci/typecheck-no-regression.mjs','--incremental'],{'TYPECHECK_HEAP_MB':'14336'}))
(out/'qualification-checks.json').write_text(json.dumps(results,indent=2)+'\n')
print('QUALIFICATION COMPLETE',flush=True)
raise SystemExit(1 if any(r['exitCode'] or not r['matchesFreezeBefore'] or not r['matchesFreezeAfter'] for r in results) else 0)
