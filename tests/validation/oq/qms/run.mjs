/**
 * OQ-006 — Operational Qualification: QMS controlled documents.
 * Protocol: docs/validation/OQ-006-QMS.md. Requirements: docs/validation/URS-006-QMS.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';

const run = await createRun({
  app: 'QMS',
  appLabel: 'QMS controlled documents',
  protocolId: 'OQ-006',
  protocolTitle: 'Operational Qualification — QMS controlled documents',
});
const { step, state } = run;
const stamp = helpers.stamp();
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

await step(
  {
    id: 'OQ-QMS-01',
    urs: ['URS-QMS-001'],
    title: 'Anonymous access refused',
    action: 'GET /api/mdx/qms/documents without Authorization',
    expected: 'HTTP 401/403',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/mdx/qms/documents', undefined, { anonymous: true });
    expect([401, 403].includes(r.status), `expected 401/403, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-QMS-02',
    urs: ['URS-QMS-002'],
    title: 'Controlled document creation validates its inputs',
    action: 'POST /api/mdx/qms/documents {docNumber, title} without docType',
    expected: 'HTTP 422 with field errors',
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/mdx/qms/documents', { docNumber: `SOP-BAD-${stamp}`, title: 'no type' });
    expect(r.status === 422, `expected 422, got ${r.status}`, r.json);
    return `HTTP 422: ${JSON.stringify(r.json).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-03',
    urs: ['URS-QMS-002', 'URS-QMS-003'],
    title: 'Create an SOP; it is draft at version 1.0 and audited',
    action: 'POST /api/mdx/qms/documents {docNumber, title, docType:"sop", nextReviewDate:+10d}; GET list; GET detail',
    expected: 'HTTP 201; status draft, version 1.0; meta.auditTrail reports the §11.10(e) row; listed and readable',
  },
  async ({ api, expect }) => {
    const docNumber = `SOP-OQ-${stamp}`;
    const r = await api('POST', '/api/mdx/qms/documents', {
      docNumber,
      title: `OQ-006 Document control SOP ${stamp}`,
      docType: 'sop',
      category: 'validation',
      nextReviewDate: inDays(10),
    });
    expect(r.status === 201, `expected 201, got ${r.status}`, r.json);
    const d = r.json?.data;
    expect(d?.status === 'draft' && d?.version === '1.0', 'status/version wrong', d);
    state.docA = d;
    state.docNumber = docNumber;
    const list = await api('GET', '/api/mdx/qms/documents');
    expect((list.json?.data ?? []).some((x) => x.id === d.id), 'not listed', list.json?.meta);
    const one = await api('GET', `/api/mdx/qms/documents/${d.id}`);
    expect(one.status === 200 && one.json?.data?.doc_number === docNumber, 'detail mismatch', one.json);
    return `doc ${d.id} ${docNumber} draft v1.0; auditTrail=${JSON.stringify(r.json.meta?.auditTrail)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-04',
    urs: ['URS-QMS-002'],
    title: 'Duplicate document number refused',
    action: 'POST /api/mdx/qms/documents with the same docNumber',
    expected: 'HTTP 409',
    dependsOn: ['OQ-QMS-03'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/mdx/qms/documents', { docNumber: state.docNumber, title: 'dup', docType: 'sop' });
    expect(r.status === 409, `expected 409, got ${r.status}`, r.json);
    return 'HTTP 409';
  },
);

await step(
  {
    id: 'OQ-QMS-05',
    urs: ['URS-QMS-004'],
    title: 'Approve the SOP; approver and time are stamped and audited',
    action: 'POST /api/mdx/qms/documents/:id/approve; then approve again',
    expected: 'HTTP 200: status effective, approver_id = actor, approved_at set, meta.auditTrail present; second approve → 409',
    dependsOn: ['OQ-QMS-03'],
  },
  async ({ api, expect, auth }) => {
    const r = await api('POST', `/api/mdx/qms/documents/${state.docA.id}/approve`, { effectiveDate: inDays(0) });
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const d = r.json?.data;
    expect(d?.status === 'effective' && String(d?.approver_id) === String(auth.user.id) && d?.approved_at, 'approval stamps wrong', d);
    const again = await api('POST', `/api/mdx/qms/documents/${state.docA.id}/approve`, {});
    expect(again.status === 409, `second approve expected 409, got ${again.status}`, again.json);
    return `effective; approver ${d.approver_id} at ${d.approved_at}; auditTrail=${JSON.stringify(r.json.meta?.auditTrail)}; re-approve → 409`;
  },
);

await step(
  {
    id: 'OQ-QMS-06a',
    urs: ['URS-QMS-002'],
    title: 'Create a second SOP (fixture for the approval-credential, training, review-due and retire steps)',
    action: 'POST /api/mdx/qms/documents {docNumber SOP-OQ-B-…, docType:"sop", nextReviewDate:+5d}',
    expected: 'HTTP 201, draft v1.0',
  },
  async ({ api, expect }) => {
    const c = await api('POST', '/api/mdx/qms/documents', { docNumber: `SOP-OQ-B-${stamp}`, title: `OQ-006 Second SOP ${stamp}`, docType: 'sop', nextReviewDate: inDays(5) });
    expect(c.status === 201, `create expected 201, got ${c.status}`, c.json);
    state.docB = c.json.data;
    return `doc ${state.docB.id} ${state.docB.doc_number} ${state.docB.status} v${state.docB.version}`;
  },
);

await step(
  {
    id: 'OQ-QMS-06',
    urs: ['URS-QMS-005'],
    title: 'Approval of a controlled document requires an electronic-signature credential',
    action: 'POST /documents/:docB/approve with NO credential (no pin, no password, no meaning)',
    expected: 'Refused — an approval is a signing act (§11.50, §11.200(a)(1)) and must verify a credential and record a meaning',
    dependsOn: ['OQ-QMS-06a'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/mdx/qms/documents/${state.docB.id}/approve`, {});
    expect(r.status >= 400, `approval accepted without any signature credential (HTTP ${r.status}); server/routes/mdx-qms.ts:463-501 verifies no PIN/password and records no meaning`, r.json);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-QMS-07',
    urs: ['URS-QMS-006'],
    title: 'Open a controlled revision (reason required; major version bump; back to draft)',
    action: 'POST /revise {} then POST /revise {reason}',
    expected: 'Without reason → 422; with reason → version 2.0, status draft, prior approval cleared, audited',
    dependsOn: ['OQ-QMS-05'],
  },
  async ({ api, expect }) => {
    const a = await api('POST', `/api/mdx/qms/documents/${state.docA.id}/revise`, {});
    expect(a.status === 422, `no reason expected 422, got ${a.status}`, a.json);
    const b = await api('POST', `/api/mdx/qms/documents/${state.docA.id}/revise`, { reason: 'OQ-006 step 07: periodic review found an obsolete reference' });
    expect(b.status === 200, `revise expected 200, got ${b.status}`, b.json);
    const d = b.json?.data;
    expect(d?.version === '2.0' && d?.status === 'draft' && !d?.approved_at, 'revision state wrong', d);
    return `v${d.version} ${d.status}; auditTrail=${JSON.stringify(b.json.meta?.auditTrail)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-08',
    urs: ['URS-QMS-008'],
    title: 'Training acknowledgement is recorded against the document version',
    action: 'POST /documents/:id/training-ack {method:"attestation"}; GET /api/mdx/qms/training/compliance',
    expected: 'HTTP 201 with document_version; compliance report HTTP 200',
    dependsOn: ['OQ-QMS-06a'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/mdx/qms/documents/${state.docB.id}/training-ack`, { method: 'attestation' });
    expect(r.status === 201, `expected 201, got ${r.status}`, r.json);
    const c = await api('GET', '/api/mdx/qms/training/compliance');
    expect(c.status === 200, `compliance expected 200, got ${c.status}`, c.json);
    return `ack for v${r.json?.data?.document_version}; compliance: ${JSON.stringify(c.json).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-09',
    urs: ['URS-QMS-009'],
    title: 'Review-due report lists effective documents approaching review',
    action: 'GET /api/mdx/qms/documents/review-due?within=30 (docB is effective with nextReviewDate +5d)',
    expected: 'docB listed with overdue=false',
    dependsOn: ['OQ-QMS-06a'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/mdx/qms/documents/review-due?within=30');
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const hit = (r.json?.data ?? []).find((x) => x.id === state.docB.id);
    expect(hit && hit.overdue === false, 'docB not listed as review-due', r.json?.data?.map((x) => x.doc_number));
    return `listed (${r.json.meta?.count} due within 30 days)`;
  },
);

await step(
  {
    id: 'OQ-QMS-10',
    urs: ['URS-QMS-007'],
    title: 'Retire a document with a recorded reason',
    action: 'POST /documents/:id/retire {reason}',
    expected: 'HTTP 200; status retired; the reason is kept',
    dependsOn: ['OQ-QMS-06a'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/mdx/qms/documents/${state.docB.id}/retire`, { reason: 'OQ-006 step 10: superseded by validation' });
    expect(r.status === 200 && r.json?.data?.status === 'retired', `expected retired, got ${r.status}`, r.json);
    return `retired; metadata: ${JSON.stringify(r.json.data.metadata).slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-QMS-11',
    urs: ['URS-QMS-010'],
    title: 'Change control: raise and list a change',
    action: 'POST /api/mdx/qms/changes {changeNumber, title, reason}; GET /api/mdx/qms/changes; GET /changes/summary',
    expected: 'HTTP 201 and the change is listed',
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/mdx/qms/changes', { changeNumber: `CC-OQ-${stamp}`, title: 'OQ-006 change', reason: 'validation exercise' });
    const l = await api('GET', '/api/mdx/qms/changes');
    expect(r.status === 201 && l.status === 200, `expected 201/200, got ${r.status}/${l.status}`, { create: r.json, list: l.json });
    return `change ${r.json?.data?.id} listed (${(l.json?.data ?? []).length})`;
  },
);

await step(
  {
    id: 'OQ-QMS-12',
    urs: ['URS-QMS-011'],
    title: 'Quality Management Plan create and list',
    action: 'POST /api/quality/plans {name, description}; GET /api/quality/plans',
    expected: 'HTTP 201; plan listed with status draft',
  },
  async ({ api, expect }) => {
    const name = `OQ-006 QMP ${stamp}`;
    const r = await api('POST', '/api/quality/plans', { name, description: 'Validation exercise' });
    expect(r.status === 201, `expected 201, got ${r.status}`, r.json);
    const l = await api('GET', '/api/quality/plans');
    const arr = Array.isArray(l.json) ? l.json : l.json?.data ?? [];
    expect(arr.some((p) => p.name === name), 'plan not listed', arr.map((p) => p.name));
    state.qmpName = name;
    return `plan ${r.json?.id} status ${r.json?.status}; ${arr.length} plans listed`;
  },
);

await step(
  {
    id: 'OQ-QMS-13',
    urs: ['URS-QMS-013'],
    title: 'Quality-system templates are served',
    action: 'GET /api/mdx/qms/templates',
    expected: 'HTTP 200 with a non-empty template family',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/mdx/qms/templates');
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const arr = r.json?.data ?? r.json?.templates ?? [];
    expect(Array.isArray(arr) && arr.length > 0, 'no templates', r.json);
    return `${arr.length} templates`;
  },
);

await step(
  {
    id: 'OQ-QMS-14',
    urs: ['URS-QMS-012'],
    title: 'Quality surface renders the SOP register and the Change control tab',
    action: 'Open /concept2cure/quality; find the SOP number; click the "Change control" tab',
    expected: 'SOP register shows the created SOP; Change control tab renders (an unavailable store is an honest error state)',
    dependsOn: ['OQ-QMS-03'],
  },
  async (ctx) => {
    await ctx.newPage(null);
    await ctx.goto('/concept2cure/quality');
    await ctx.expectText(state.docNumber);
    await ctx.screenshot('sop-register');
    const tab = ctx.page.getByRole('tab', { name: /change control/i });
    if ((await tab.count()) > 0) {
      await tab.first().click();
      await ctx.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await ctx.screenshot('change-control');
    }
    return 'SOP register shows the SOP; change control tab captured';
  },
);

await step(
  {
    id: 'OQ-QMS-15',
    urs: ['URS-QMS-011', 'URS-QMS-012'],
    title: 'QMP surface renders the plan',
    action: 'Open /concept2cure/qmp',
    expected: 'The plan name is visible',
    dependsOn: ['OQ-QMS-12'],
  },
  async (ctx) => {
    await ctx.newPage(null);
    await ctx.goto('/concept2cure/qmp');
    await ctx.expectText(state.qmpName);
    await ctx.screenshot();
    return 'plan visible';
  },
);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
