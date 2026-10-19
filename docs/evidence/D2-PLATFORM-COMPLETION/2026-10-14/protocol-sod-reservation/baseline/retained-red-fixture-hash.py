"""Read-only retained red-fixture observation in the explicitly named QA database."""
import hashlib, json, pathlib, subprocess
organization_id = 1538506
document_id = 86
signature_id = 22
sql = """SELECT jsonb_build_object(
  'protocol',(SELECT to_jsonb(d) FROM protocol_documents d WHERE d.organization_id=1538506 AND d.id=86),
  'sections',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM protocol_sections s WHERE s.organization_id=1538506 AND s.protocol_document_id=86),
  'versions',(SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb) FROM protocol_versions v WHERE v.organization_id=1538506 AND v.protocol_document_id=86),
  'signatures',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) FROM electronic_signatures s WHERE s.organization_id=1538506 AND s.signed_target='protocol-document:86'),
  'lineage',(SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) FROM document_span_lineage l WHERE l.organization_id=1538506 AND l.document_table='protocol_sections' AND l.document_id IN (SELECT id::text FROM protocol_sections WHERE organization_id=1538506 AND protocol_document_id=86)),
  'actions',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM c2c_ana_actions a WHERE a.org_id=1538506),
  'audit',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM audit_logs a WHERE a.tenant_id=1538506)
)::text"""
result = subprocess.run(['docker','exec','-i','c2c-platform-pg','psql','-U','postgres','-d','platform_test','-X','-t','-A','-v','ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True, check=True)
raw = next(line for line in result.stdout.splitlines() if line.startswith('{'))
state = json.loads(raw)
assert state['protocol']['id'] == document_id and state['protocol']['organization_id'] == organization_id
assert len(state['versions']) == 1 and len(state['signatures']) == 1 and state['signatures'][0]['id'] == signature_id
observed = {'database':'platform_test','organizationId':organization_id,'protocolId':document_id,'signatureId':signature_id,
            'sha256':hashlib.sha256(raw.encode()).hexdigest(), 'sectionCount':len(state['sections']),
            'versionCount':len(state['versions']),'signatureCount':len(state['signatures']),
            'lineageRows':len(state['lineage']),'actionCount':len(state['actions']),'auditCount':len(state['audit'])}
print(json.dumps(observed))
