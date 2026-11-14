from pathlib import Path
import datetime,gzip,hashlib,json,os,subprocess,time
r=Path('/workspace/ClinicalSageAI-2-replit');o=Path(__file__).resolve().parent
files=[
 'tests/schema-contract/fda-510k-authoring-keys.contract.test.ts',
 'server/services/authoring/__tests__/device-builtin-authoring-templates.test.ts',
 'server/services/authoring/__tests__/builtin-templates-carry-whole-outline.test.ts',
 'server/services/authoring/__tests__/assembly-template-guidance.test.ts',
 'server/services/authoring/__tests__/authoring-template-guidance-tenant.pglite.test.ts',
 'shared/regulatory/__tests__/filingSectionKey.test.ts',
 'tests/schema-contract/ivd-510k-outline-template.contract.test.ts',
 'tests/schema-contract/k510-ivd-outline-v1-0-replay.contract.test.ts',
 'tests/schema-contract/estar-mapper-matches-shipped-outlines.contract.test.ts',
 'server/services/market-specs/__tests__/document-template-library.test.ts',
]
prod=['shared/regulatory/device-authoring-sections.ts','shared/regulatory/project-bootstrap.ts']
imports=[
 'server/services/authoring/builtin-authoring-templates.ts',
 'server/services/authoring/authoring-template-sections.ts',
 'server/services/authoring/document-template-outline-sections.ts',
 'server/services/authoring/authoring-template-guidance.ts',
 'server/services/authoring/authoring-program-access.ts',
 'server/services/c2c/rule-pack-lookup.ts',
 'server/services/market-specs/document-template-library.ts',
 'server/services/regulatory/sectionBlueprintCatalog.ts',
 'server/services/pathway-engines/estar/estar-mapper.ts',
 'server/services/pathway-engines/estar/estar-content-leaves.ts',
 'server/services/pathway-engines/estar/estar-outline-requirements.ts',
 'shared/regulatory/global-document-registry.ts',
 'shared/regulatory/filing-section-key.ts',
 'assets/estar-templates/eSTAR-510k-ivd.pdf',
 'assets/estar-templates/checksums.txt',
 'server/routes/__tests__/_authoring-canvas-fixture.ts',
 'tests/golden-journeys/harness.ts',
 'migrations/20260527_mutation_primitives.sql',
 'migrations/20260528_phase9_document_schema.sql',
 'migrations/20260804_phase9_rule_pack_outlines.sql',
 'migrations/20260810c_rule_pack_provenance.sql',
 'migrations/20260810d_rule_pack_review_attribution.sql',
 'migrations/20260901b_estar_510k_denovo_outlines.sql',
 'migrations/20261005c_k510_denovo_estar_outline_v1_1.sql',
 'migrations/20261114_k510_ivd_estar_outline_v1_0.sql',
 'db/migrations/20260725_authoring_document_loop_tables.sql',
 'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
 'db/migrations/20260725_authoring_audit_trail.sql',
 'db/migrations/20260730_authoring_comments_router_columns.sql',
 'db/migrations/20260727_authoring_object_permissions.sql',
 'migrations/20260727_authoring_document_program_scope.sql',
 'migrations/20260921_authoring_document_provenance.sql',
 'package-lock.json','vitest.config.ts','tests/setup.ts',
]
pins=prod+files+imports
sha=lambda p:hashlib.sha256((r/p).read_bytes()).hexdigest()
def snap():return {'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'pins':{p:sha(p)for p in pins}}
b=snap();(o/'source-before.json').write_text(json.dumps(b,indent=2)+'\n');env=os.environ.copy();env['PATH']='/workspace/.tooling/node_modules/node/bin:'+env['PATH'];env['NODE_OPTIONS']='--max-old-space-size=4096'
cmd=['node_modules/.bin/vitest','run',*files,'--maxWorkers=1','--no-file-parallelism','--reporter=json','--outputFile='+str(o/'tests.json')];start=time.monotonic();p=subprocess.run(cmd,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);gzip.open(o/'tests.log.gz','wb').write(p.stdout)
lintfiles=prod+[files[0],files[4]];lintcmd=['node_modules/.bin/eslint','--no-cache',*lintfiles,'--format=json','--output-file='+str(o/'eslint.json')];l=subprocess.run(lintcmd,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);gzip.open(o/'eslint.log.gz','wb').write(l.stdout)
a=snap();(o/'source-after.json').write_text(json.dumps(a,indent=2)+'\n');result={'testExit':p.returncode,'eslintExit':l.returncode,'elapsedSeconds':round(time.monotonic()-start,3),'sourceStable':b['pins']==a['pins'],'headStable':b['head']==a['head'],'declaredPins':len(pins),'commands':[cmd,lintcmd],'files':files};(o/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(0 if p.returncode==0 and l.returncode==0 and result['sourceStable'] else 1)
