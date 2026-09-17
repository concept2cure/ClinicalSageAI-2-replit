/**
 * The submissions spine's own release signature — what counts as one.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * A release can be signed on either of two spines. `resolveReleaseSignatureStatus`
 * could see only the orchestrator's (`package.sign` on a run). The other is the
 * product's own governed path: POST /api/c2c/actions/sign on
 * 'ectd-sequence:<id>', which persists an `electronic_signatures` row whose
 * `bound_payload_digest` is a sha256 over that sequence's row and its ordered
 * `submission_leaves` manifest — i.e. over exactly what a dispatch would
 * transmit, with re-authentication and separation of duties behind it.
 *
 * A submission authored that way has no orchestrator run at all, so the gate
 * reported 'unsigned'. Since a release signature is REQUIRED for IND / NDA /
 * BLA / MAA — every type the requirement applies to — `dispatchSequence` and
 * `transmitSequence` were unreachable for it however correctly the operator
 * signed. The gate was denying a signature that existed.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Recognising the second spine is only safe if it is recognised as strictly as
 * the first, so every one of these is a rule about what does NOT count:
 *   • only a DISPATCH-intent signature — freeze is not release, and transmit is
 *     already `transmitSequence`'s own Gate 1;
 *   • only one bound to the leaf manifest, whose digest is RE-DERIVED now and
 *     still matches — drift is 'invalid', which blocks unconditionally;
 *   • the newest signature decides, and a newer one that fails is never papered
 *     over by an older one that passes;
 *   • a revoked or superseded signature is 'revoked', not 'signed';
 *   • a manifest that cannot be re-derived is 'undetermined', never 'signed' —
 *     an unverifiable signature is not a verified one;
 *   • a lookup failure is 'undetermined', never 'unsigned'.
 * The query itself is asserted too: org, target, basis, intent and the
 * revocation exclusion are what make all of the above true, and every one of
 * them is a single clause away from being dropped.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDbExecute = vi.fn();
const mockDerive = vi.fn();

vi.mock('../../../db.js', () => ({
  db: { execute: (...a: unknown[]) => mockDbExecute(...a) },
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('../../part11/signature-persistence.js', async () => {
  const actual = await vi.importActual<typeof import('../../part11/signature-persistence.js')>(
    '../../part11/signature-persistence.js',
  );
  return { ...actual, deriveGovernedTargetBinding: (...a: unknown[]) => mockDerive(...a) };
});

import { BINDING_BASIS } from '../../part11/signature-persistence';
import { resolveSequenceReleaseSignature } from '../sequence-release-signature';

const ORG = 42;
const SEQUENCE_ID = 5150;
const TARGET = `ectd-sequence:${SEQUENCE_ID}`;
const DIGEST = 'a'.repeat(64);

/** One `electronic_signatures` row as the join returns it. */
function signatureRow(over: Record<string, unknown> = {}) {
  return {
    id: 4242,
    bound_payload_digest: DIGEST,
    verification_status: null,
    superseded_by: null,
    is_valid: true,
    ...over,
  };
}

/** The manifest derived from the sequence's CURRENT content. */
function derivesTo(digest: string | null, basis: string = BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST) {
  mockDerive.mockResolvedValue({ digest, basis, note: 'test' });
}

function rowsAre(...rows: Array<Record<string, unknown>>) {
  mockDbExecute.mockResolvedValue({ rows });
}

/** The SQL text and bound parameters of the lookup, from the drizzle template. */
function lookup() {
  const chunks = (mockDbExecute.mock.calls[0]?.[0] as { queryChunks?: unknown[] })?.queryChunks ?? [];
  let text = '';
  const params: unknown[] = [];
  for (const chunk of chunks) {
    const value = (chunk as { value?: unknown })?.value;
    if (Array.isArray(value)) text += value.join('');
    else params.push(value === undefined ? chunk : value);
  }
  return { text, params };
}

const resolve = () => resolveSequenceReleaseSignature({ sequenceId: SEQUENCE_ID, organizationId: ORG });

beforeEach(() => {
  mockDbExecute.mockReset();
  mockDerive.mockReset();
  derivesTo(DIGEST);
});

describe('a signature that counts', () => {
  it('is signed when the digest still binds the current leaf manifest', async () => {
    rowsAre(signatureRow());
    const status = await resolve();
    expect(status.verdict).toBe('signed');
    expect(status.signatureId).toBe(4242);
  });

  it('re-derives the manifest for THIS target and organization', async () => {
    rowsAre(signatureRow());
    await resolve();
    expect(mockDerive).toHaveBeenCalledTimes(1);
    const [, target, orgId] = mockDerive.mock.calls[0] as unknown[];
    expect(target).toBe(TARGET);
    expect(orgId).toBe(ORG);
  });
});

describe('a signature that does not', () => {
  it('is invalid when the sequence changed after signing', async () => {
    rowsAre(signatureRow());
    derivesTo('b'.repeat(64));
    const status = await resolve();
    expect(status.verdict, 'a stale signature cleared the gate').toBe('invalid');
    expect(String(status.detail)).toMatch(/changed after it was signed/i);
  });

  it('never papers over a failing newest signature with an older passing one', async () => {
    // Newest first: 9001 drifted, 4242 still matches. Reporting 'signed' on the
    // strength of the older one would clear a dispatch whose current content
    // nobody has signed.
    rowsAre(signatureRow({ id: 9001, bound_payload_digest: 'c'.repeat(64) }), signatureRow());
    const status = await resolve();
    expect(status.verdict).toBe('invalid');
    expect(status.signatureId).toBe(9001);
  });

  it('is revoked when the signature was superseded', async () => {
    rowsAre(signatureRow({ superseded_by: 7 }));
    expect((await resolve()).verdict).toBe('revoked');
  });

  it('is revoked when verification_status says so', async () => {
    rowsAre(signatureRow({ verification_status: 'revoked' }));
    expect((await resolve()).verdict).toBe('revoked');
  });

  it('is revoked when the row is no longer valid', async () => {
    rowsAre(signatureRow({ is_valid: false }));
    expect((await resolve()).verdict).toBe('revoked');
  });

  it('is unsigned when the sequence carries no dispatch-intent signature', async () => {
    rowsAre();
    const status = await resolve();
    expect(status.verdict).toBe('unsigned');
    expect(String(status.detail)).toContain(TARGET);
  });
});

describe('what cannot be verified is never reported as verified', () => {
  it('reports undetermined when the lookup fails', async () => {
    mockDbExecute.mockRejectedValue(new Error('connection reset'));
    expect((await resolve()).verdict).toBe('undetermined');
  });

  it('reports undetermined when the manifest cannot be re-derived', async () => {
    rowsAre(signatureRow());
    mockDerive.mockRejectedValue(new Error('sequence read failed'));
    expect((await resolve()).verdict).toBe('undetermined');
  });

  it('reports undetermined when the derivation falls back to the ledger basis', async () => {
    // deriveGovernedTargetBinding returns a ledger-basis binding with no content
    // digest when the sequence row is unreadable. Comparing against that — or
    // against null — must not read as a match.
    rowsAre(signatureRow());
    derivesTo(null, 'governed-action-ledger-sha256-chain');
    const status = await resolve();
    expect(status.verdict, 'an underivable manifest read as a verified signature').toBe('undetermined');
  });

  it('refuses a leaf-manifest signature that carries no digest at all', async () => {
    rowsAre(signatureRow({ bound_payload_digest: '' }));
    expect((await resolve()).verdict).toBe('invalid');
  });

  it('rejects a nonsense sequence id or organization without querying', async () => {
    expect((await resolveSequenceReleaseSignature({ sequenceId: 0, organizationId: ORG })).verdict)
      .toBe('undetermined');
    expect((await resolveSequenceReleaseSignature({ sequenceId: SEQUENCE_ID, organizationId: 0 })).verdict)
      .toBe('undetermined');
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});

describe('the query is what makes the rules above true', () => {
  beforeEach(async () => {
    rowsAre(signatureRow());
    await resolve();
  });

  it('is scoped to this organization and this sequence target', () => {
    const { text, params } = lookup();
    expect(text).toMatch(/es\.organization_id\s*=/);
    expect(text).toMatch(/es\.signed_target\s*=/);
    expect(params).toContain(ORG);
    expect(params).toContain(TARGET);
  });

  it('accepts only a leaf-manifest binding — a ledger-basis signature binds no content', () => {
    const { text, params } = lookup();
    expect(text).toMatch(/es\.binding_basis\s*=/);
    expect(params).toContain(BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST);
  });

  it('accepts only a DISPATCH-intent signature — freeze is not release', () => {
    const { text, params } = lookup();
    expect(text).toMatch(/payload\s*->>\s*'intent'/);
    expect(params).toContain('dispatch');
    expect(params, 'a freeze signature would clear the release gate').not.toContain('freeze');
  });

  it('requires an executed sign action, and excludes revocation rows', () => {
    const { text, params } = lookup();
    expect(text).toMatch(/a\.command\s*=\s*'sign'/);
    expect(text).toMatch(/a\.state\s*=\s*'executed'/);
    expect(text).toMatch(/es\.signature_type\s*<>/);
    expect(params).toContain('governed-revocation');
  });

  it('takes the newest signature, not an arbitrary one', () => {
    expect(lookup().text).toMatch(/ORDER BY\s+es\.id\s+DESC/i);
  });
});
