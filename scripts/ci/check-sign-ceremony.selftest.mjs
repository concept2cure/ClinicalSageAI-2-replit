#!/usr/bin/env node
/**
 * Proves ci:sign-ceremony can fail, on the shapes it exists to catch. A gate
 * that has only been seen to pass has not been tested (CLAUDE.md).
 *
 * The first case is the protocol finalize route as it stood before 2026-09-23,
 * verbatim in shape: a `governed(req, res, 'sign', …)` call and nothing else.
 */
import assert from 'node:assert/strict';
import { evaluate, scanSource } from './check-sign-ceremony.mjs';

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

test('clearing an approval (a revision) is not a stamp', () => {
  const src = "router.post('/x', async () => { await pool.query(`UPDATE qms_documents SET status = 'draft', approver_id = NULL, approved_at = NULL WHERE id = $1`, [id]); });";
  assert.deepEqual(scanSource(src), []);
});

console.log(`[ci:sign-ceremony:selftest] ${passed} passed — the gate fails on what it exists to catch.`);
