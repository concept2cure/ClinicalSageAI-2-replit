"""Metadata-only pins for the exact root-frozen final browser runtime."""
import datetime,hashlib,json,pathlib,subprocess
folder=pathlib.Path('/tmp/submission-deliverables-browser-prep');repo=pathlib.Path('/workspace/ClinicalSageAI-2-replit')
previous=json.loads((folder/'runtime-source-pins.json').read_text())
extra=[
'client/src/concept2cure/v2/editor/authoringOversight.ts','client/src/concept2cure/v2/editor/provenance.ts','client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx',
'server/routes/authoring.router.ts','server/services/authoring/authoring-documents.ts','server/services/authoring/authoring-template-sections.ts','server/services/authoring/builtin-authoring-templates.ts',
'server/services/ana/authoring-canonical-bridge.ts','server/services/ana/builtin-template-reference.ts','server/services/ana/saved-template-review.ts','server/services/ana/document-template-tool.ts',
'server/services/coauthor/coauthor-snapshot.ts','server/services/c2c/current-program-access.ts','server/services/c2c/document-alias-map.ts','server/services/c2c/section-content.ts',
'server/services/authoring/authoring-read-scope.ts','server/services/ectd/dispatch-readiness.ts','server/services/ectd/leaf-source-resolver.ts','server/services/ectd/leaf-document-resolver.ts','server/services/ectd/leaf-document-tables.ts',
'server/services/vault/vault-lifecycle.ts','server/routes/510k-estar-routes.ts','shared/authoring/recorded-template-source.ts',
]
files=set(previous['files'])|set(extra)
for directory in ['server/services/pathway-engines']:
 files.update(str(path.relative_to(repo)) for path in (repo/directory).rglob('*.ts') if '__tests__' not in path.parts)
for name in files:assert (repo/name).is_file(),name
pins={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'qualification':'Exact frozen runtime source bytes including root-owned uncommitted increment/repairs and merged template/Authoring dependencies. Git HEAD alone is not claimed to include uncommitted source.','files':{name:hashlib.sha256((repo/name).read_bytes()).hexdigest() for name in sorted(files)}}
(folder/'final-production-source-pins.json').write_text(json.dumps(pins,indent=2)+'\n');(folder/'final-production-source-pins.json').chmod(0o600)
helpers=[path for path in folder.iterdir() if path.suffix in ['.py','.mts'] or path.name=='fixture-identities.json']
(folder/'final-helper-pins.json').write_text(json.dumps({'verifiedAt':pins['verifiedAt'],'files':{path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(helpers)}},indent=2)+'\n');(folder/'final-helper-pins.json').chmod(0o600)
print(json.dumps({'productionFiles':len(files),'helperFiles':len(helpers),'head':pins['head']}))
