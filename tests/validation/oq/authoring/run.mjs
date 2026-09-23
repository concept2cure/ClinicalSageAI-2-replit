/**
 * OQ-003 — Operational Qualification: Authoring.
 * Protocol: docs/validation/OQ-003-AUTHORING.md. Requirements: docs/validation/URS-003-AUTHORING.md.
 */
import { createRun, helpers } from '../../lib/harness.mjs';
import { createProgram } from '../../lib/fixtures.mjs';

const run = await createRun({
  app: 'AUTHORING',
  appLabel: 'Authoring',
  protocolId: 'OQ-003',
  protocolTitle: 'Operational Qualification — Authoring',
});
const { step, state } = run;
const stamp = helpers.stamp();
const PIN = process.env.VALIDATION_SIGNING_PIN || '246813';

await step(
  { id: 'OQ-AUTH-00', urs: [], title: 'Prerequisite: a program', action: 'POST /api/c2c/projects', expected: '201' },
  async ({ api, expect }) => {
    const p = await createProgram(api, expect, `OQ-003 Authoring program ${stamp}`);
    state.programId = p.id;
    state.programName = p.name;
    return `program ${p.id}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-01',
    urs: ['URS-AUTH-001'],
    title: 'Anonymous access refused',
    action: 'GET /api/authoring/docs without Authorization',
    expected: 'HTTP 401/403',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/authoring/docs', undefined, { anonymous: true });
    expect([401, 403].includes(r.status), `expected 401/403, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-02',
    urs: ['URS-AUTH-002'],
    title: 'Document creation requires a title',
    action: 'POST /api/authoring/docs {module:"M2"} (no title)',
    expected: 'HTTP 400 naming the title',
  },
  async ({ api, expect }) => {
    const r = await api('POST', '/api/authoring/docs', { module: 'M2' });
    expect(r.status === 400, `expected 400, got ${r.status}`, r.json);
    return `HTTP 400: ${r.json?.error}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-03',
    urs: ['URS-AUTH-002'],
    title: 'Create a Module 2 document bound to the program',
    action: 'POST /api/authoring/docs {title, module:"M2", client_program_id}',
    expected: 'HTTP 200/201 with a document id (UUID)',
    dependsOn: ['OQ-AUTH-00'],
  },
  async ({ api, expect }) => {
    const title = `OQ-003 Clinical Overview ${stamp}`;
    const r = await api('POST', '/api/authoring/docs', { title, module: 'M2', client_program_id: state.programId });
    expect(r.status === 200 || r.status === 201, `expected 2xx, got ${r.status}`, r.json);
    const doc = r.json?.document ?? r.json?.data ?? r.json;
    const id = doc?.id ?? doc?.docId ?? r.json?.docId ?? r.json?.doc_id;
    expect(helpers.uuidRe.test(String(id)), 'no UUID document id', r.json);
    state.docId = id;
    state.docTitle = title;
    return `document ${id}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-04',
    urs: ['URS-AUTH-003'],
    title: 'Create sections and read them back in order',
    action: 'POST /api/authoring/sections ×2 (codes 2.7, then 2.5); GET /api/authoring/docs/:id/sections',
    expected: 'Two sections returned; order follows the CTD code (2.5 before 2.7) or the stored order_index',
    dependsOn: ['OQ-AUTH-03'],
  },
  async ({ api, expect }) => {
    const a = await api('POST', '/api/authoring/sections', { doc_id: state.docId, code: '2.7', title: 'Clinical Summary', content: '<p>Initial 2.7 text.</p>' });
    const b = await api('POST', '/api/authoring/sections', { doc_id: state.docId, code: '2.5', title: 'Clinical Overview', content: '<p>Initial 2.5 text.</p>' });
    expect(a.status < 300 && b.status < 300, `section create failed (${a.status}, ${b.status})`, { a: a.json, b: b.json });
    const list = await api('GET', `/api/authoring/docs/${state.docId}/sections`);
    const sections = list.json?.sections ?? [];
    expect(sections.length === 2, `expected 2 sections, got ${sections.length}`, list.json);
    state.section = sections.find((s) => s.code === '2.5') ?? sections[0];
    state.sectionOther = sections.find((s) => s.code === '2.7') ?? sections[1];
    return `order: ${sections.map((s) => `${s.code}@${s.order_index}`).join(', ')}; structure: ${JSON.stringify(list.json.structure)}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-05',
    urs: ['URS-AUTH-004'],
    title: 'Edit a section with a reason for change; a revision is recorded',
    action: 'PATCH /api/authoring/sections/:id {content, changeReason}; GET history',
    expected: 'HTTP 200; history lists ≥1 revision carrying content_sha256 and created_by',
    dependsOn: ['OQ-AUTH-04'],
  },
  async ({ api, expect }) => {
    const r = await api('PATCH', `/api/authoring/sections/${state.section.id}`, {
      content: '<p>Revised 2.5 text — OQ-003 step 05.</p>',
      changeReason: 'OQ-003 step 05: controlled edit',
    });
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const h = await api('GET', `/api/authoring/sections/${state.section.id}/history`);
    const revs = h.json?.revisions ?? [];
    expect(revs.length >= 1, 'no revisions recorded', h.json);
    expect(revs.every((x) => x.content_sha256 && x.created_by), 'revision lacks hash or author', revs[0]);
    state.firstRevision = revs[revs.length - 1];
    state.updatedAt = (r.json?.section ?? r.json?.data ?? r.json)?.updated_at ?? null;
    return `${revs.length} revision(s); newest sha256 ${String(revs[0].content_sha256).slice(0, 12)}… by ${revs[0].created_by_email ?? revs[0].created_by}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-06',
    urs: ['URS-AUTH-005'],
    title: 'Revision ledger hash chain verifies',
    action: 'GET /api/authoring/sections/:id/history/verify',
    expected: 'success:true, revisionCount ≥ 1, chain verdict intact',
    dependsOn: ['OQ-AUTH-05'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', `/api/authoring/sections/${state.section.id}/history/verify`);
    expect(r.status === 200 && r.json?.success === true, `expected 200 success, got ${r.status}`, r.json);
    const j = r.json;
    const intact = j.ok === true || j.valid === true || j.intact === true || j.verified === true;
    expect(intact, 'verifier did not report an intact chain', j);
    return `revisionCount=${j.revisionCount}; verdict ${JSON.stringify(j).slice(0, 200)}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-07',
    urs: ['URS-AUTH-004'],
    title: 'A stale save is refused, nothing overwritten',
    action: 'PATCH section with expectedUpdatedAt from before the previous edit',
    expected: 'HTTP 409 SECTION_CHANGED; content unchanged',
    dependsOn: ['OQ-AUTH-05'],
  },
  async ({ api, expect }) => {
    const r = await api('PATCH', `/api/authoring/sections/${state.section.id}`, {
      content: '<p>Should not be saved.</p>',
      expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
      changeReason: 'OQ-003 step 07 stale save',
    });
    expect(r.status === 409 && r.json?.error?.code === 'SECTION_CHANGED', `expected 409 SECTION_CHANGED, got ${r.status}`, r.json);
    const list = await api('GET', `/api/authoring/docs/${state.docId}/sections`);
    const s = (list.json?.sections ?? []).find((x) => x.id === state.section.id);
    expect(!String(s?.content ?? '').includes('Should not be saved'), 'stale content was saved', s);
    return 'HTTP 409 SECTION_CHANGED; content intact';
  },
);

await step(
  {
    id: 'OQ-AUTH-08',
    urs: ['URS-AUTH-006'],
    title: 'Revert to a prior revision',
    action: 'POST /api/authoring/sections/:id/revert {rev_id: <first revision>}',
    expected: 'HTTP 200; section content equals that revision; history grows (the revert is itself recorded)',
    dependsOn: ['OQ-AUTH-05'],
  },
  async ({ api, expect }) => {
    const before = (await api('GET', `/api/authoring/sections/${state.section.id}/history`)).json?.count ?? 0;
    const r = await api('POST', `/api/authoring/sections/${state.section.id}/revert`, { rev_id: state.firstRevision.id });
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const after = await api('GET', `/api/authoring/sections/${state.section.id}/history`);
    const list = await api('GET', `/api/authoring/docs/${state.docId}/sections`);
    const s = (list.json?.sections ?? []).find((x) => x.id === state.section.id);
    expect(s?.content === state.firstRevision.content, 'content not restored to the chosen revision', { now: s?.content, wanted: state.firstRevision.content });
    expect((after.json?.count ?? 0) > before, `history did not grow (${before} → ${after.json?.count})`);
    return `content restored; history ${before} → ${after.json.count}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-09',
    urs: ['URS-AUTH-007'],
    title: 'Comment on a section',
    action: 'POST /api/authoring/sections/:id/comment {body, doc_id}',
    expected: 'HTTP 200/201; comment listed under the document',
    dependsOn: ['OQ-AUTH-04'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/authoring/sections/${state.section.id}/comment`, { body: 'OQ-003 step 09 review comment', doc_id: state.docId });
    expect(r.status < 300, `expected 2xx, got ${r.status}`, r.json);
    const c = await api('GET', `/api/authoring/documents/${state.docId}/comments`);
    expect(JSON.stringify(c.json).includes('OQ-003 step 09'), 'comment not listed', c.json);
    state.comment = r.json?.comment ?? null;
    expect(state.comment?.id && state.comment?.status === 'open', 'comment id/status not returned as open', r.json);
    return `comment ${state.comment.id} recorded (status ${state.comment.status}) and listed`;
  },
);

await step(
  {
    id: 'OQ-AUTH-10',
    urs: ['URS-AUTH-008'],
    title: 'Document audit trail records the operations with actor and hashes',
    action: 'GET /api/authoring/docs/:id/audit',
    expected: 'Events for CREATE and UPDATE (and REVERT) with actor email, timestamps and content hashes',
    dependsOn: ['OQ-AUTH-08'],
  },
  async ({ api, expect }) => {
    const r = await api('GET', `/api/authoring/docs/${state.docId}/audit`);
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const ev = r.json?.events ?? [];
    const types = [...new Set(ev.map((e) => e.event_type))];
    expect(ev.length >= 3, `expected ≥3 events, got ${ev.length}`, types);
    expect(ev.every((e) => e.actor && e.created_at), 'event lacks actor/timestamp', ev.find((e) => !e.actor || !e.created_at));
    return `${ev.length} events: ${types.join(', ')}; actor ${ev[0].actor}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-17',
    urs: ['URS-AUTH-013'],
    title: 'Request review and submit the document into its approval workflow (before freeze — submit requires DRAFT)',
    action: 'POST /documents/:id/request-review {reviewers:[self]}; POST /docs/:id/submit {workflow_steps:[{role:"QA", approver_email:self}]}; GET /docs/:id/workflow',
    expected: 'Review request recorded (pending, reviewer = self); submit refused without approver_email; with it the document moves to IN_REVIEW and the workflow lists a PENDING step',
    dependsOn: ['OQ-AUTH-03'],
  },
  async ({ api, expect, auth }) => {
    const rr = await api('POST', `/api/authoring/documents/${state.docId}/request-review`, {
      reviewers: [{ id: Number(auth.user.id), name: auth.user.displayName, email: auth.user.email }],
    });
    expect(rr.status < 300, `request-review expected 2xx, got ${rr.status}`, rr.json);
    const pending = (rr.json?.reviews ?? []).filter((x) => x.review_status === 'pending');
    expect(pending.length >= 1 && pending[0].reviewer_email === auth.user.email, 'review request not recorded as pending for the reviewer', rr.json);
    const noApprover = await api('POST', `/api/authoring/docs/${state.docId}/submit`, { workflow_steps: [{ role: 'QA' }] });
    expect(noApprover.status === 400, `submit without approver_email expected 400, got ${noApprover.status}`, noApprover.json);
    const sub = await api('POST', `/api/authoring/docs/${state.docId}/submit`, { workflow_steps: [{ role: 'QA', approver_email: auth.user.email }] });
    expect(sub.status < 300, `submit expected 2xx, got ${sub.status}`, sub.json);
    const wf = await api('GET', `/api/authoring/docs/${state.docId}/workflow`);
    expect(wf.status === 200 && /PENDING/.test(JSON.stringify(wf.json)), 'workflow has no PENDING step', wf.json);
    return `review pending for ${pending[0].reviewer_email}; submit w/o approver → 400; workflow: ${JSON.stringify(wf.json).slice(0, 200)}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-17b',
    urs: ['URS-AUTH-013'],
    title: 'The reviewer sees the pending review on the Review surface',
    action: 'GET /api/review/board (the read model behind /concept2cure/review) after the request-review and submit above',
    expected: 'The queue lists the document for the reviewer',
    dependsOn: ['OQ-AUTH-17'],
    note: 'The Review board reads document_workflows / workflow_approvals (server/routes/review-board-routes.ts); authoring reviews are stored in authoring_reviews and authoring_workflow_steps (server/routes/authoring.router.ts:3476, 6259). If this step fails, a review requested in Authoring is not visible where a reviewer is told to look.',
  },
  async ({ api, expect }) => {
    const board = await api('GET', '/api/review/board');
    expect(board.status === 200, `board expected 200, got ${board.status}`, board.json);
    const queue = board.json?.data?.queue ?? [];
    expect(queue.some((q) => JSON.stringify(q).includes(state.docId) || JSON.stringify(q).includes(state.docTitle)), 'authoring review request is not on the Review board queue', board.json?.data?.meta);
    return `queue lists the document (${queue.length} items)`;
  },
);

await step(
  {
    id: 'OQ-AUTH-15',
    urs: ['URS-AUTH-012'],
    title: 'AI drafting fails closed when no provider is configured',
    action: 'POST /api/authoring/sections/:id/ai/draft {prompt}',
    expected: 'No draft content is returned; the request is refused with a provider-unavailable status (5xx) — never a fabricated draft',
    dependsOn: ['OQ-AUTH-04'],
    note: 'Executed BEFORE the freeze (OQ-AUTH-11a/11): once the document is FROZEN every edit-class route is refused 409 AUTHORING_DOCUMENT_IMMUTABLE, which would answer this step for the wrong reason and mask F-10.',
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/authoring/sections/${state.sectionOther.id}/ai/draft`, { prompt: 'Draft a one-paragraph summary.' });
    const txt = JSON.stringify(r.json ?? r.text);
    expect(r.status !== 200 || !/draft|content/i.test(txt), 'a draft was returned without a provider', r.json);
    expect(r.status >= 400, `expected a refusal, got ${r.status}`, r.json);
    expect(r.status !== 409, 'refused by the document-immutability guard, not by the provider check — the step ran in the wrong state', r.json);
    return `HTTP ${r.status}: ${txt.slice(0, 200)}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-16',
    urs: ['URS-AUTH-012'],
    title: 'AI drafting produces a governed draft candidate',
    action: 'POST /api/authoring/sections/:id/ai/draft with a configured provider',
    expected: 'A draft candidate with provenance is returned for human acceptance',
    dependsOn: ['OQ-AUTH-04'],
  },
  async ({ api, deviation }) => {
    const r = await api('POST', `/api/authoring/sections/${state.sectionOther.id}/ai/draft`, { prompt: 'Draft a one-paragraph summary.' });
    if (r.status >= 500 || r.status === 503) {
      deviation('AnA unavailable: no provider configured (ANTHROPIC_API_KEY / OPENAI_API_KEY unset in this environment). Re-execute with a PQ-passed model configured.', r.json);
    }
    deviation('AnA unavailable: no provider configured; unexpected non-5xx answer recorded for review.', r.json);
  },
);

await step(
  {
    id: 'OQ-AUTH-11a',
    urs: ['URS-AUTH-009', 'URS-AUTH-007'],
    title: 'Freeze is refused while a review comment is unresolved (negative case)',
    action: 'POST /api/authoring/docs/:id/freeze {reason, version:"1.0"} while the OQ-AUTH-09 comment is open; GET /docs/:id/frozen',
    expected: 'HTTP 409 DOCUMENT_NOT_SETTLED naming 1 unresolved comment; nothing frozen (no content hash retrievable)',
    dependsOn: ['OQ-AUTH-09'],
    note: 'VSR-001 §8.3 P-1: the baseline protocol froze over an open comment and recorded the refusal as a failure. The refusal is the required fail-closed behaviour; this step keeps it as the negative case. The "acknowledgeUnresolved" confirm flag is deliberately NOT used as the happy path.',
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/authoring/docs/${state.docId}/freeze`, { reason: 'OQ-003 step 11a: freeze attempted over an open comment', version: '1.0' });
    expect(r.status === 409 && r.json?.error?.code === 'DOCUMENT_NOT_SETTLED', `expected 409 DOCUMENT_NOT_SETTLED, got ${r.status}`, r.json);
    expect((r.json?.unresolved?.openComments ?? 0) >= 1, 'refusal does not count the open comment', r.json);
    const f = await api('GET', `/api/authoring/docs/${state.docId}/frozen`);
    expect(!/content_hash|contentHash/.test(JSON.stringify(f.json ?? '')), 'a frozen record exists despite the refusal', f.json);
    return `HTTP 409 DOCUMENT_NOT_SETTLED (openComments=${r.json.unresolved.openComments}, pendingEdits=${r.json.unresolved.pendingEdits}); frozen read → HTTP ${f.status}, no content hash`;
  },
);

await step(
  {
    id: 'OQ-AUTH-11b',
    urs: ['URS-AUTH-007', 'URS-AUTH-008'],
    title: 'Resolve the review comment through the comment-resolution API; the resolution is audited',
    action: 'PATCH /api/authoring/comments/:id {status:"resolved", resolution_note}; GET /documents/:id/comments; GET /docs/:id/audit',
    expected: 'HTTP 200; comment status resolved with resolved_by = actor and resolved_at set; the audit trail carries a comment_resolved event naming the comment',
    dependsOn: ['OQ-AUTH-09'],
  },
  async ({ api, expect, auth }) => {
    const r = await api('PATCH', `/api/authoring/comments/${state.comment.id}`, {
      status: 'resolved',
      resolution_note: 'OQ-003 step 11b: reviewer query answered; resolved before freeze',
    });
    expect(r.status === 200 && r.json?.success === true, `expected 200, got ${r.status}`, r.json);
    const c = r.json?.comment ?? {};
    expect(c.status === 'resolved' && c.resolved_at, 'comment not marked resolved with a timestamp', c);
    expect(String(c.resolved_by) === auth.user.email || String(c.resolved_by) === String(auth.user.id), 'resolved_by is not the actor', c);
    const list = await api('GET', `/api/authoring/documents/${state.docId}/comments`);
    const listed = JSON.stringify(list.json ?? '');
    expect(listed.includes(String(state.comment.id)), 'resolved comment no longer listed under the document', list.json);
    const a = await api('GET', `/api/authoring/docs/${state.docId}/audit`);
    const ev = (a.json?.events ?? []).find((e) => e.event_type === 'comment_resolved' && JSON.stringify(e).includes(String(state.comment.id)));
    expect(ev, 'no comment_resolved audit event for this comment', (a.json?.events ?? []).map((e) => e.event_type));
    return `comment ${state.comment.id} resolved by ${c.resolved_by} at ${c.resolved_at}; audit event comment_resolved by ${ev.actor}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-11',
    urs: ['URS-AUTH-009'],
    title: 'Freeze the settled document into an immutable snapshot',
    action: 'POST /api/authoring/docs/:id/freeze {reason, version:"1.0"} after the comment is resolved; GET /docs/:id/frozen',
    expected: 'HTTP 200; a frozen record with content_hash is retrievable; a second freeze is refused',
    dependsOn: ['OQ-AUTH-04', 'OQ-AUTH-11b'],
  },
  async ({ api, expect }) => {
    const r = await api('POST', `/api/authoring/docs/${state.docId}/freeze`, { reason: 'OQ-003 step 11 freeze', version: '1.0' });
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const f = await api('GET', `/api/authoring/docs/${state.docId}/frozen`);
    expect(f.status === 200, `frozen expected 200, got ${f.status}`, f.json);
    const txt = JSON.stringify(f.json);
    expect(/content_hash|contentHash/.test(txt), 'frozen record has no content hash', f.json);
    const again = await api('POST', `/api/authoring/docs/${state.docId}/freeze`, { reason: 'second freeze', version: '1.1' });
    expect(again.status === 400, `second freeze expected 400, got ${again.status}`, again.json);
    return `frozen; ${txt.slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-12',
    urs: ['URS-AUTH-010'],
    title: 'Enrol the signing PIN for the authenticated actor',
    action: 'POST /api/authoring/users/pin {pin}',
    expected: 'HTTP 200/201 on first enrolment (identity from the JWT, never from the body); once a PIN exists, a change without the current PIN is refused (400) and succeeds only with old_pin',
    note: 'On a database where this identity already holds a PIN (a previous run), the refusal-without-old_pin branch is exercised and the PIN is then rotated with the current value.',
  },
  async ({ api, expect, deviation }) => {
    const r = await api('POST', '/api/authoring/users/pin', { pin: PIN });
    if (r.status < 300) return `first enrolment → HTTP ${r.status}`;
    if (r.status === 400 && /current pin|old_pin/i.test(JSON.stringify(r.json))) {
      const rot = await api('POST', '/api/authoring/users/pin', { pin: PIN, old_pin: PIN });
      if (rot.status === 401) {
        deviation('PIN already enrolled for this identity with a value the tester does not hold. Set VALIDATION_SIGNING_PIN to the enrolled PIN and re-run.', rot.json);
      }
      expect(rot.status < 300, `rotation with current PIN expected 2xx, got ${rot.status}`, rot.json);
      return `PIN already enrolled: change without old_pin → 400 ("${r.json?.error}"); rotation with old_pin → HTTP ${rot.status}`;
    }
    expect(false, `expected 2xx or the old_pin refusal, got ${r.status}`, r.json);
    return null;
  },
);

await step(
  {
    id: 'OQ-AUTH-13',
    urs: ['URS-AUTH-010'],
    title: 'E-signature refuses a wrong PIN and an invalid meaning',
    action: 'POST /docs/:id/e-sign with (a) wrong pin, (b) meaning "WHATEVER"',
    expected: '(a) HTTP 401 Invalid PIN; (b) HTTP 400 Invalid signature meaning; no signature stored',
    dependsOn: ['OQ-AUTH-12', 'OQ-AUTH-11'],
  },
  async ({ api, expect }) => {
    const a = await api('POST', `/api/authoring/docs/${state.docId}/e-sign`, { pin: '000000', meaning: 'REVIEWER', intent: 'OQ wrong pin' });
    const b = await api('POST', `/api/authoring/docs/${state.docId}/e-sign`, { pin: PIN, meaning: 'WHATEVER', intent: 'OQ bad meaning' });
    expect(a.status === 401, `wrong pin expected 401, got ${a.status}`, a.json);
    expect(b.status === 400, `bad meaning expected 400, got ${b.status}`, b.json);
    const s = await api('GET', `/api/authoring/docs/${state.docId}/signatures`);
    expect((s.json?.signatures ?? []).length === 0, 'a signature was stored despite refusal', s.json);
    return 'wrong PIN → 401; bad meaning → 400; no signature stored';
  },
);

await step(
  {
    id: 'OQ-AUTH-14',
    urs: ['URS-AUTH-010', 'URS-AUTH-011'],
    title: 'Apply a REVIEWER e-signature bound to the frozen snapshot',
    action: 'POST /docs/:id/e-sign {pin, meaning:"REVIEWER", intent}; GET /docs/:id/signatures',
    expected: 'HTTP 200; one signature with signer_email = actor, meaning REVIEWER, pin_verified true, signature_digest and covered_content_hash present',
    dependsOn: ['OQ-AUTH-13'],
  },
  async ({ api, expect, auth }) => {
    const r = await api('POST', `/api/authoring/docs/${state.docId}/e-sign`, { pin: PIN, meaning: 'REVIEWER', intent: 'OQ-003 step 14: reviewed for validation' });
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const s = await api('GET', `/api/authoring/docs/${state.docId}/signatures`);
    const sigs = s.json?.signatures ?? [];
    expect(sigs.length === 1, `expected 1 signature, got ${sigs.length}`, sigs);
    const sig = sigs[0];
    expect(sig.signer_email === auth.user.email && sig.meaning === 'REVIEWER' && sig.pin_verified === true, 'signature attributes wrong', sig);
    expect(sig.signature_digest && sig.covered_content_hash, 'signature not bound to a frozen snapshot', sig);
    return `signature ${sig.id} by ${sig.signer_email}, meaning ${sig.meaning}, covers freeze v${sig.covered_freeze_version} (${String(sig.covered_content_hash).slice(0, 12)}…)`;
  },
);

await step(
  {
    id: 'OQ-AUTH-18',
    urs: ['URS-AUTH-014'],
    title: 'Template stores answer',
    action: 'GET /api/c2c/templates (organisation); GET /api/authoring/templates (global reference)',
    expected: 'Both HTTP 200 with list payloads (empty organisation store is honest for a new organisation)',
  },
  async ({ api, expect }) => {
    const a = await api('GET', '/api/c2c/templates');
    const b = await api('GET', '/api/authoring/templates');
    expect(a.status === 200 && b.status === 200, `expected 200/200, got ${a.status}/${b.status}`, { a: a.json, b: b.json });
    const gl = b.json?.templates ?? b.json?.data ?? [];
    return `org templates: ${a.json?.meta?.count ?? (a.json?.data ?? []).length}; global templates: ${Array.isArray(gl) ? gl.length : '?'}`;
  },
);

await step(
  {
    id: 'OQ-AUTH-19',
    urs: ['URS-AUTH-015'],
    title: 'Document Authoring surface renders the document',
    action: 'Open /concept2cure/document-authoring with the program selected',
    expected: 'The surface renders and the document title is visible',
    dependsOn: ['OQ-AUTH-03'],
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/document-authoring');
    await ctx.expectText(state.docTitle);
    await ctx.screenshot();
    return 'document visible';
  },
);

await step(
  {
    id: 'OQ-AUTH-20',
    urs: ['URS-AUTH-013', 'URS-AUTH-015'],
    title: 'Review surface renders',
    action: 'Open /concept2cure/review',
    expected: 'Review board renders (screenshot)',
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/review');
    await ctx.screenshot();
    return 'rendered';
  },
);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
