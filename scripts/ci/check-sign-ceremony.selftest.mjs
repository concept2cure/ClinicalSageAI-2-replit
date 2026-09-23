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

console.log(`[ci:sign-ceremony:selftest] ${passed} passed — the gate fails on what it exists to catch.`);
