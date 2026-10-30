#!/usr/bin/env node
/**
 * Proves ci:sign-ceremony can fail, on the shapes it exists to catch. A gate
 * that has only been seen to pass has not been tested (CLAUDE.md).
 *
 * The first case is the protocol finalize route as it stood before 2026-09-23,
 * verbatim in shape: a `governed(req, res, 'sign', …)` call and nothing else.
 */
import assert from 'node:assert/strict';
import { evaluate, evaluateAuthority, repoDecisionStatuses, scanAuthority, scanSource } from './check-sign-ceremony.mjs';
import { declaredStatuses, decisionStatusesFrom, evaluateSignedPairs } from './check-sign-ceremony-status-acts.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
const scan = (src) => ({ 'server/routes/x.ts': scanSource(src) });
const failsWith = (src, baseline = { files: {} }) => evaluate(scan(src), baseline).failures;

const PRE_FIX_FINALIZE = `
router.post('/documents/:id/finalize', async (req, res) => {
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await finalizeProtocolTx(client, orgId, userId, id);
    return { target: \`protocol-document:\${id}\`, body: { documentId: id, ...result } };
  });
});
`;

const CEREMONY = `
export async function signIt(input) {
  const verified = await verifyReauth(input.userId, input.reauth);
  if (!verified.ok) throw new Error('no');
  const gov = await recordGovernedAction(client, { orgId, userId, command: 'sign', target, reason });
  await persistGovernedSignSignature(client, { orgId, userId, target, reason, actionId: gov.actionId });
}
`;

console.log('[ci:sign-ceremony:selftest]');

test('the pre-fix protocol finalize route fails the gate', () => {
  const f = failsWith(PRE_FIX_FINALIZE);
  assert.equal(f.length, 1);
  assert.equal(f[0].sites[0].kind, 'governed-helper');
  assert.equal(f[0].sites[0].reauth, false);
});

test('an AnA tool that signs from a chat turn fails the gate', () => {
  const src = `
registerToolHandler('finalize_biosketch', async (input, ctx) => {
  return governedPdev(ctx, 'sign', \`biosketch:\${id}\`, 'Biosketch finalized via AnA', input, async (client) => ({}));
});`;
  assert.equal(failsWith(src).length, 1);
});

test('re-authentication without a signature row still fails', () => {
  const src = `
router.post('/release', async (req, res) => {
  const r = await verifyReauth(userId, req.body.reauth);
  await recordGovernedAction(client, { orgId, userId, command: 'sign', target, reason });
});`;
  const f = failsWith(src);
  assert.equal(f.length, 1);
  assert.equal(f[0].sites[0].reauth, true);
  assert.equal(f[0].sites[0].signatureRow, false);
});

test('the full ceremony passes', () => {
  assert.equal(failsWith(CEREMONY).length, 0);
  assert.equal(scanSource(CEREMONY)[0].ok, true);
});

test('a ceremony in another handler does not count for this one', () => {
  const src = `
router.post('/a', async (req, res) => {
  await verifyReauth(userId, req.body.reauth);
  await persistGovernedSignSignature(client, {});
});
router.post('/b', async (req, res) => {
  await recordGovernedAction(client, { orgId, userId, command: 'sign', target, reason });
});`;
  assert.equal(failsWith(src).length, 1);
});

test('writeMutation("sign") needs the caller to re-authenticate', () => {
  const bare = `
router.post('/s', async (req, res) => {
  await writeMutation('sign', body, userId, orgId);
});`;
  assert.equal(failsWith(bare).length, 1);
  const withReauth = bare.replace('async (req, res) => {', 'async (req, res) => {\n  await verifyReauth(userId, body.reauth);');
  assert.equal(failsWith(withReauth).length, 0);
});

test('comments, type annotations and other commands are not sites', () => {
  const src = `
// await governed(req, res, 'sign', reason, run);
/* recordGovernedAction(client, { command: 'sign' }) */
export function requiresIndependence(command: 'sign' | 'lock', meaning: unknown): boolean { return true; }
router.post('/u', async (req, res) => {
  await recordGovernedAction(client, { orgId, userId, command: 'update', target, reason });
});`;
  assert.deepEqual(scanSource(src), []);
});

test('a command chosen by a ternary is still a sign write (IRB approval, as it stood on 2026-09-23)', () => {
  const src = `
router.post('/submissions/:id/determination', async (req, res) => {
  await governed(req, res, parsed.data.outcome === 'approved' ? 'sign' : 'resolve', parsed.data.reason, async (client, orgId, userId) => {
    return { target: \`irb-submission:\${id}\`, body: {} };
  });
});`;
  const f = failsWith(src);
  assert.equal(f.length, 1);
  assert.equal(f[0].sites[0].kind, 'governed-helper');
});

test('a ternary or template-literal command inside recordGovernedAction is a site', () => {
  const ternary = `
router.post('/t', async (req, res) => {
  await recordGovernedAction(client, { orgId, userId, command: approved ? 'sign' : 'update', target, reason });
});`;
  assert.equal(failsWith(ternary).length, 1);
  const template = `
router.post('/t', async (req, res) => {
  await governed(req, res, \`sign\`, reason, async () => ({}));
});`;
  assert.equal(failsWith(template).length, 1);
});

test('"sign" in a reason, a target or a callback is not a command', () => {
  const src = `
router.post('/r', async (req, res) => {
  await governed(req, res, 'update', 'Ready to sign, pending review', async (client) => {
    const kind = 'sign';
    return { target: 'sign', body: {} };
  });
  await governedPdev(ctx, 'create', target, 'sign', input, async (client) => ({ command: 'sign' }));
});
async function governed(req: Request, res: Response, command: 'create' | 'update' | 'sign', reason: string) {}`;
  assert.deepEqual(scanSource(src), []);
});

test('the baseline is a ceiling per file, not a pass', () => {
  const two = PRE_FIX_FINALIZE + PRE_FIX_FINALIZE.replace('/documents/:id/finalize', '/other');
  const reason = 'DEFECT, recorded so the population cannot grow while it is fixed.';
  assert.equal(failsWith(two, { files: { 'server/routes/x.ts': { count: 1, reason } } }).length, 1);
  assert.equal(failsWith(two, { files: { 'server/routes/x.ts': { count: 2, reason } } }).length, 0);
});

test('a baseline that allows more than exists is reported, so a fixed site cannot be refilled', () => {
  const reason = 'DEFECT, recorded so the population cannot grow while it is fixed.';
  const r = evaluate(scan(PRE_FIX_FINALIZE), { files: { 'server/routes/x.ts': { count: 2, reason } } });
  assert.deepEqual(r.shrinkable, [{ file: 'server/routes/x.ts', count: 1, allowed: 2 }]);
});

test('a baseline entry without a written reason fails', () => {
  const r = evaluate(scan(PRE_FIX_FINALIZE), { files: { 'server/routes/x.ts': { count: 1, reason: '' } } });
  assert.deepEqual(r.unreasoned, ['server/routes/x.ts']);
});


// ── Approval stamps (2026-10-01) ─────────────────────────────────────────────
// The two defects this widening exists for, as they stood before e1c224f69 and
// 028a0c704: an approval stamped under command 'transition', no signature row.
const PRE_FIX_QMS_TOOL = `
registerToolHandler('approve_qms_document', async (input, ctx) => {
  await client.query(\`UPDATE qms_documents SET status = 'effective', approver_id = $3, approved_at = NOW() WHERE id = $1\`, [id, org, ctx.userId]);
  await recordGovernedAction(client, { orgId, userId, command: 'transition', target, reason, payload: { kind: 'approve' } });
});
`;
const PRE_FIX_CHANGE_SERVICE = `
export async function transitionChange(orgId, id, to, actor) {
  if (to === 'approved') { sets.push('approved_at = now()'); add('approved_by', actor.userId); }
  await pool.query(\`UPDATE qms_change_controls SET \${sets.join(', ')} WHERE id = $1\`, args);
}
`;
const SIGNED_STAMP = `
export async function approveQmsChangeSigned(client, params) {
  await client.query(\`UPDATE qms_change_controls SET status = 'approved', approved_by = $3, approved_at = $4::timestamptz WHERE id = $1\`, args);
  const gov = await recordGovernedAction(client, { command: 'approve', target, reason });
  await persistGovernedActionSignature(client, { orgId, userId, target, reason });
}
`;

test('an approval stamped under a non-sign verb fails the gate (the QMS AnA tool before e1c224f69)', () => {
  const f = failsWith(PRE_FIX_QMS_TOOL);
  assert.equal(f.length, 1);
  assert.equal(f[0].sites.length, 1, 'approver_id and approved_at on one line are one stamp');
  assert.equal(f[0].sites[0].kind, 'approval-stamp');
});

test('an approval stamp built up in a service fails the gate (transitionChange before 028a0c704)', () => {
  const f = failsWith(PRE_FIX_CHANGE_SERVICE);
  assert.equal(f.length, 1);
  assert.equal(f[0].sites[0].kind, 'approval-stamp');
});

test('an approval stamp written beside its signature row passes', () => {
  assert.equal(failsWith(SIGNED_STAMP).length, 0);
});

// Authoring's e-sign handler (QA 2026-10-08, j4): the approval stamp sits beside
// the authoring_signatures write, on one transaction client.
const AUTHORING_STAMP = (withSignature) => `router.post('/docs/:docId/e-sign', async (req, res) => {
  const signer = await reverifyAuthoringSigner(req, res);
  await client.query(\`UPDATE authoring_documents SET status = $1, approved_at = COALESCE(approved_at, NOW()) WHERE id = $2 AND tenant_id = $3\`, ['APPROVED', docId, tenantId]);
  ${withSignature ? 'await insertAuthoringSignature(client, req, { id, docId });' : ''}
});`;

test('an authoring approval stamp beside its authoring_signatures write passes', () => {
  assert.equal(failsWith(AUTHORING_STAMP(true)).length, 0);
});

test('the same authoring approval stamp with no signature write fails', () => {
  const f = failsWith(AUTHORING_STAMP(false));
  assert.equal(f.length, 1);
  assert.equal(f[0].sites[0].kind, 'approval-stamp');
});

// The labeling translation approval (D5, 2026-10-29). Before: the PATCH stamped
// approved_by and approved_at from a session alone. After: the stamp is the
// domain write of signGovernedAct (routes/governed-signed-act.ts), which
// re-verifies the signer and writes the signature row on that transaction.
const LABELING_APPROVAL = (signed) => `router.patch('/labeling/translations/:transId', requireEditorAccess, whenApproving, async (req, res) => {
  const parsed = transPatch.safeParse(req.body ?? {});
  ${signed ? 'return signGovernedAct(req, res, { domain: \'labeling\', target, meanings: DECISION_ACT_MEANINGS, codeStatus, run: async (client, orgId, userId) => {' : '{'}
    await ${signed ? 'client' : 'pool'}.query(\`UPDATE labeling_translations SET status = 'approved', approved_by = $3, approved_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *\`, [transId, orgId, userId]);
  }${signed ? ' });' : ''}
});`;

test('an approval stamp inside signGovernedAct passes (the labeling translation approval, 2026-10-29)', () => {
  assert.equal(failsWith(LABELING_APPROVAL(true)).length, 0);
  assert.equal(scanSource(LABELING_APPROVAL(true))[0].signatureRow, true);
});

test('the same approval stamp with no signGovernedAct fails (the labeling PATCH before 2026-10-29)', () => {
  const f = failsWith(LABELING_APPROVAL(false));
  assert.equal(f.length, 1);
  assert.equal(f[0].sites[0].kind, 'approval-stamp');
});

// ── Status acts (2026-10-29, D5) ──────────────────────────────────────────────
// Accepting a hazard's residual risk, as routes/mdx-risk-management.ts does it:
// a status and a flag on risk_items, which has no stamp column. Before this
// widening the gate saw neither the signed acceptance nor an unsigned one
// (docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
const DECIDED = new Set(['approved', 'effective', 'signed', 'finalized', 'frozen', 'dispatched']);
const statusScan = (src, signedPairs = []) => ({ 'server/routes/x.ts': scanSource(src, { decisionStatuses: DECIDED, signedPairs }) });
const statusFails = (src, signedPairs) => evaluate(statusScan(src, signedPairs), { files: {} }).failures;
const statusSites = (src, signedPairs) => statusScan(src, signedPairs)['server/routes/x.ts'];
const RISK_PAIRS = ['risk_items.status=accepted', 'risk_items.acceptable=true'];
const RISK_ACCEPT_SIGNED = `async function acceptResidualSigned(req, res, id) {
  await signGovernedAct(req, res, { domain: 'risk', target, meanings: DECISION_ACT_MEANINGS, codeStatus, run: async (client, orgId) => {
    const updated = await client.query(
      \`UPDATE risk_items SET status = 'accepted', acceptable = TRUE, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        RETURNING *\`,
      [id, orgId],
    );
    return { target, body: { data: updated.rows[0] } };
  } });
}
`;
const RISK_ACCEPT_PLAIN = `router.patch('/risk-items/:id', requireEditorAccess, async (req, res) => {
  await pool.query(\`UPDATE risk_items SET status = 'accepted', acceptable = TRUE, updated_at = NOW() WHERE id = $1 AND organization_id = $2\`, [id, orgId]);
});
`;

test('a status-only act signed through signGovernedAct is a site, and passes (the residual-risk acceptance)', () => {
  const sites = statusSites(RISK_ACCEPT_SIGNED);
  assert.equal(sites.length, 1, 'status and flag in one statement are one act');
  assert.equal(sites[0].kind, 'status-act');
  assert.equal(sites[0].act, "risk_items.status = 'accepted'");
  assert.equal(sites[0].ok, true);
  assert.equal(statusFails(RISK_ACCEPT_SIGNED).length, 0);
});

test('the same write without the ceremony fails: in the same file as the signed one, or anywhere once the pair is governed', () => {
  const f = statusFails(RISK_ACCEPT_SIGNED + RISK_ACCEPT_PLAIN);
  assert.equal(f.length, 1);
  assert.equal(f[0].sites.length, 1, 'the signed acceptance passes; only the plain PATCH fails');
  assert.equal(f[0].sites[0].kind, 'status-act');
  assert.equal(f[0].sites[0].signatureRow, false);
  assert.equal(statusFails(RISK_ACCEPT_PLAIN, RISK_PAIRS).length, 1, 'a governed pair learned from another file');
});

test('the governed flag alone, without the ceremony, fails too (acceptable = TRUE)', () => {
  const src = "router.patch('/r/:id', async (req, res) => { await pool.query(`UPDATE risk_items SET acceptable = TRUE WHERE id = $1`, [id]); });";
  assert.equal(statusFails(src, RISK_PAIRS).length, 1);
  assert.equal(statusSites(src, RISK_PAIRS)[0].act, 'risk_items.acceptable = TRUE');
});

test('creating a hazard already accepted is a status act (INSERT … VALUES)', () => {
  const src = "router.post('/r', async (req, res) => { await pool.query(`INSERT INTO risk_items (organization_id, hazard, status) VALUES ($1, $2, 'accepted') RETURNING *`, [orgId, hazard]); });";
  assert.equal(statusFails(src, RISK_PAIRS).length, 1);
});

test('without a ceremony or a record, the pair is not governed: why the baseline records signed pairs', () => {
  assert.deepEqual(statusSites(RISK_ACCEPT_PLAIN), []);
  const derived = new Map([['risk_items.status=accepted', 'server/routes/mdx-risk-management.ts']]);
  assert.deepEqual(evaluateSignedPairs(derived, []).unrecorded, [{ pair: 'risk_items.status=accepted', file: 'server/routes/mdx-risk-management.ts' }]);
  assert.deepEqual(evaluateSignedPairs(derived, ['risk_items.status=accepted']).unrecorded, []);
  // The ceremony removed (the fold-f1a slice's M11): the recorded pair stays governed and is reported.
  assert.deepEqual(evaluateSignedPairs(new Map(), ['risk_items.status=accepted']).unsigned, ['risk_items.status=accepted']);
});

test('a non-governed status is not an act: draft, in_progress, open, mitigating', () => {
  for (const status of ['draft', 'in_progress', 'open', 'mitigating']) {
    const src = `router.patch('/r/:id', async (req, res) => { await pool.query(\`UPDATE risk_items SET status = '${status}' WHERE id = $1\`, [id]); });`;
    assert.deepEqual(statusSites(src, RISK_PAIRS), [], status);
  }
});

test('a declared signed status is governed on every table (an IRB approval written outside its ceremony fails)', () => {
  const plain = "export async function recordReviewTx(client, id) { await client.query(`UPDATE irb_submissions SET status = 'approved', approval_date = $2 WHERE id = $1`, [id, d]); }";
  assert.equal(statusFails(plain).length, 1);
  const signed = `router.post('/s/:id/reviews', async (req, res) => {\n  await signGovernedAct(req, res, { domain: 'irb', target, meanings, codeStatus, run: async (client) => {\n    await client.query(\`UPDATE irb_submissions SET status = 'approved' WHERE id = $1\`, [id]);\n  } });\n});`;
  assert.equal(statusFails(signed).length, 0);
});

test('a condition is not a write: WHERE, FILTER, a CASE test, a SELECT', () => {
  const src = `router.get('/r', async (req, res) => {
  await pool.query(\`SELECT COUNT(*) FILTER (WHERE status = 'approved')::int AS approved FROM risk_items WHERE status = 'accepted'\`);
  await pool.query(\`UPDATE risk_items SET updated_at = now() WHERE status = 'accepted' AND acceptable = TRUE\`);
  await pool.query(\`UPDATE c2c_document_sections ds SET status = CASE WHEN ds.status = 'approved' THEN 'drafted' ELSE ds.status END WHERE id = $1\`, [id]);
});`;
  assert.deepEqual(statusSites(src, RISK_PAIRS), []);
});

test('a status the product signs only on some tables counts only there (superseded)', () => {
  const elsewhere = "export async function supersede(id) { await pool.query(`UPDATE ana_submission_chat_proposals SET status = 'superseded' WHERE id = $1`, [id]); }";
  assert.deepEqual(statusSites(elsewhere, ['labeling_documents.status=superseded']), []);
  const labeling = elsewhere.replace('ana_submission_chat_proposals', 'labeling_documents');
  assert.equal(statusFails(labeling, ['labeling_documents.status=superseded']).length, 1);
});

test('a `$n` whose value is a literal in the inline parameter array is read; a computed one is not', () => {
  const literal = "router.patch('/d/:id', async (req, res) => { await client.query(`UPDATE authoring_documents SET status = $1 WHERE id = $2`, ['APPROVED', id]); });";
  assert.equal(statusFails(literal).length, 1);
  assert.equal(statusSites(literal)[0].act, "authoring_documents.status = 'approved'");
  assert.deepEqual(statusSites(literal.replace("'APPROVED'", 'next')), [], 'a computed status is a known limit');
});

test("for a status act, writeMutation counts only as writeMutation('sign')", () => {
  // writeMutation('sign') is itself a sign site, so the handler re-verifies the signer.
  const withCommand = (command) => `router.post('/d/:id/approve', async (req, res) => {
  await verifyReauth(userId, req.body.reauth);
  await writeMutation('${command}', { target, reason }, userId, orgId, 'api', 'documents', client);
  await client.query(\`UPDATE quality_documents SET status = 'approved' WHERE id = $1\`, [id]);
});`;
  assert.equal(statusFails(withCommand('transition')).length, 1);
  assert.equal(statusFails(withCommand('lock')).length, 1);
  assert.equal(statusFails(withCommand('sign')).length, 0);
});

test('a statement that stamps an approval and sets a status is one site, the stamp', () => {
  const src = "router.post('/x', async () => { await pool.query(`UPDATE qms_documents SET status = 'effective', approver_id = $3, approved_at = NOW() WHERE id = $1`, [id, org, userId]); });";
  const sites = statusSites(src);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].kind, 'approval-stamp');
});

test('a status act is baselined like a stamp: a ceiling with a written reason', () => {
  const reason = 'PROOF ACROSS A BOUNDARY: the only caller runs this inside signGovernedAct.';
  const plain = "export async function recordReviewTx(client, id) { await client.query(`UPDATE irb_submissions SET status = 'approved' WHERE id = $1`, [id]); }";
  assert.equal(evaluate(statusScan(plain), { files: { 'server/routes/x.ts': { count: 1, reason } } }).failures.length, 0);
});

test('the declared statuses are read from the product, never copied: Set, object keys, and a missing declaration', () => {
  assert.deepEqual(declaredStatuses("export const DOC_SIGNED_STATUS: ReadonlySet<string> = new Set(['approved', 'effective', 'superseded']);", 'DOC_SIGNED_STATUS'), ['approved', 'effective', 'superseded']);
  assert.deepEqual(declaredStatuses("export const ARTIFACT_ACT_MEANING = {\n  approved: 'approval',\n  locked: 'release',\n} as const;", 'ARTIFACT_ACT_MEANING', true), ['approved', 'locked']);
  assert.equal(declaredStatuses('// const GOVERNED_TRANSITIONS = new Set([\'frozen\']);', 'GOVERNED_TRANSITIONS'), null, 'a commented declaration is not one');
  const read = (f) => (f.endsWith('mdx-labeling-approvals.ts') ? "const DOC_SIGNED_STATUS = new Set(['approved', 'effective', 'superseded']);" : null);
  const { statuses, missing } = decisionStatusesFrom(read);
  assert.deepEqual([...statuses].sort(), ['approved', 'effective'], 'superseded is table-scoped');
  assert.equal(missing.length, 4);
});

test("the repository's declarations are where the gate reads them, and give the vocabulary it governs", () => {
  const { statuses, missing } = repoDecisionStatuses();
  assert.deepEqual(missing, []);
  for (const s of ['approved', 'effective', 'signed', 'finalized']) assert.ok(statuses.has(s), s);
  for (const s of ['superseded', 'locked', 'draft', 'accepted']) assert.ok(!statuses.has(s), s);
});

test('clearing an approval (a revision) is not a stamp', () => {
  const src = "router.post('/x', async () => { await pool.query(`UPDATE qms_documents SET status = 'draft', approver_id = NULL, approved_at = NULL WHERE id = $1`, [id]); });";
  assert.deepEqual(scanSource(src), []);
});

// ── Signing authority (2026-10-08, QA j6) ─────────────────────────────────────
// The Gateway transmit as it stood: the editor gate, then the password, then the
// governed transmit. Nothing asked whether the signer's role may sign.
const PRE_FIX_TRANSMIT = (authority) => `
router.post('/gateways/:region/:gateway/transmit', requireEditorAccess, async (req, res) => {
  const p = transmitBody.safeParse(req.body).data;
  ${authority ? 'const authority = await checkSigningAuthority(userId, orgId);\n  if (authority) return signingAuthorityRefused(res, authority);' : ''}
  const reauthResult = await verifyReauth(userId, p.reauth);
  const outcome = await executeGovernedTransmit({ region, gateway, organizationId: orgId, userId, meaning: p.meaning });
});`;
const authorityFails = (src, section = { files: {} }) =>
  evaluateAuthority({ 'server/routes/x.ts': scanAuthority(src) }, section).failures;

test('the pre-fix Gateway transmit (re-authentication, no authority) fails the authority rule', () => {
  const f = authorityFails(PRE_FIX_TRANSMIT(false));
  assert.equal(f.length, 1);
  assert.equal(f[0].sites[0].authority, false);
});

test('the same transmit asking checkSigningAuthority first passes', () => {
  assert.equal(authorityFails(PRE_FIX_TRANSMIT(true)).length, 0);
});

test('reverifySigner is held to the rule too, and checkSigningAuthority satisfies it', () => {
  const bare = "router.post('/s', async (req, res) => { const v = await reverifySigner(userId, creds, deps()); });";
  assert.equal(authorityFails(bare).length, 1);
  const asked = "router.post('/s', async (req, res) => { const a = await checkSigningAuthority(userId, orgId); if (a) return; const v = await reverifySigner(userId, creds, deps()); });";
  assert.equal(authorityFails(asked).length, 0);
});

// P-27 (2026-10-08): one signing-authority policy. An inline copy of it — the
// role read and the predicate written out in the handler, or a local wrapper
// around them — does not satisfy the rule any more; only the gate does. Each
// copy answered a failed role lookup its own way (500, a thrown error, or not
// at all), and two read the role from the token instead of the membership row.
test('an inline copy of the policy (isSigningAuthorized in the handler) no longer satisfies the rule', () => {
  const inline = "router.post('/s', async (req, res) => { if (!isSigningAuthorized(await resolveSignerOrgRole(userId, orgId))) return; const v = await reverifySigner(userId, creds, deps()); });";
  assert.equal(authorityFails(inline).length, 1);
});

test('the retired local wrappers no longer satisfy the rule', () => {
  for (const wrapper of ['signingAuthorityRefusal(command, userId, orgId)', 'assertSigningAuthority(req, res)', 'refusedWithoutSigningAuthority(res, { userId, orgId })']) {
    const src = `router.post('/s', async (req, res) => { if (await ${wrapper}) return; await verifyReauth(userId, req.body.reauth); });`;
    assert.equal(authorityFails(src).length, 1, wrapper);
  }
});

test('an authority check in another handler does not count for this one', () => {
  const src = `
router.post('/a', async (req, res) => {
  const authority = await checkSigningAuthority(userId, orgId);
});
router.post('/b', async (req, res) => {
  await verifyReauth(userId, req.body.reauth);
});`;
  assert.equal(authorityFails(src).length, 1);
});

test('a declaration of the primitive is not a call; a commented check is not a check', () => {
  assert.deepEqual(scanAuthority('export async function verifyReauth(userId: number, reauth: unknown) { return { ok: true }; }'), []);
  const commented = "router.post('/c', async () => {\n  // await checkSigningAuthority(userId, orgId);\n  await verifyReauth(userId, reauth);\n});";
  assert.equal(authorityFails(commented).length, 1);
});

test('an authority baseline entry is a ceiling with a written reason, as the sign baseline is', () => {
  const reason = 'A rollback signs nothing: it writes no signature row.';
  assert.equal(authorityFails(PRE_FIX_TRANSMIT(false), { files: { 'server/routes/x.ts': { count: 1, reason } } }).length, 0);
  const unreasoned = evaluateAuthority({ 'server/routes/x.ts': scanAuthority(PRE_FIX_TRANSMIT(false)) }, { files: { 'server/routes/x.ts': { count: 1 } } });
  assert.deepEqual(unreasoned.unreasoned, ['server/routes/x.ts']);
  const loose = evaluateAuthority({ 'server/routes/x.ts': scanAuthority(PRE_FIX_TRANSMIT(true)) }, { files: { 'server/routes/x.ts': { count: 1, reason } } });
  assert.equal(loose.shrinkable.length, 1, 'a freed allowance must be lowered, not kept for the next site');
});

console.log(`[ci:sign-ceremony:selftest] ${passed} passed — the gate fails on what it exists to catch.`);
