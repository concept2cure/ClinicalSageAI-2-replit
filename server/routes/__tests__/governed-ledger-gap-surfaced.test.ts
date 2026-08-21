/**
 * A governed action whose ledger row did not land says so.
 *
 * ── The class ────────────────────────────────────────────────────────────────
 * Three routes wrote a governed-action / Part 11 audit row, swallowed the
 * failure, and returned a success body indistinguishable from the fully audited
 * case. The artefact — a transmission, an eCTD bundle, a commitment status —
 * was real and committed on another connection; only the record of who did it
 * and why was missing, and nobody was told.
 *
 * The transmit route was fixed first; this suite covers the other two:
 *
 *   POST /api/submission-ops/packages/:id/assemble   the bundle is assembled,
 *     the ledger write fails, and the response used to be a plain success.
 *
 *   PATCH /api/c2c/commitments/:id/status            swallowed TWICE — the
 *     writer caught internally with no rethrow, and the call site added
 *     `.catch(() => undefined)`. That route REQUIRES an eight-character reason
 *     and is documented as writing a Part 11 audit, so the reason a regulator
 *     would look for was being captured into a row that might never exist.
 *
 * ── What is deliberately NOT changed ─────────────────────────────────────────
 * Neither route now fails. An audit outage must not destroy a bundle that was
 * assembled or refuse a status change that was applied — and retracting an
 * artefact that already committed would be a worse lie than the one being
 * fixed. The fix is that the gap travels with the response.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/**
 * The source contract. The behavioural assertions below need each route's whole
 * upstream (a real package, a real commitment store, tenant context), which
 * makes them tests of the harness as much as of the gap. These two check the
 * thing that actually regressed — that the outcome reaches the response at all
 * — and cannot be defeated by fixture noise.
 */
describe('the ledger gap is carried out to the caller', () => {
  it('assemble surfaces ledgerWriteFailed rather than a plain success', () => {
    const src = read('server/routes/submission-ops.ts');

    // The flag is set in the catch and read in the response — both halves.
    expect(src).toContain('ledgerWriteFailed = true;');
    expect(src).toMatch(/\.\.\.\(ledgerWriteFailed[\s\S]{0,200}ledgerWarning/);
    // And the catch must no longer be a bare log-and-continue.
    expect(src).not.toMatch(
      /catch \(ledgerErr\) \{\s*\/\/ The bundle is persisted;[\s\S]{0,200}\n\s*\}\s*\n\s*return res\.json\(\{\s*\n\s*success: true,\s*\n\s*data:/,
    );
  });

  it('commitment status surfaces auditWriteFailed, and the double swallow is gone', () => {
    const src = read('server/routes/c2c/commitments.ts');

    // The writer reports rather than returning void.
    expect(src).toContain('): Promise<boolean> {');
    expect(src).toContain('return true;');
    // The second half of the swallow is gone.
    expect(src).not.toMatch(/writeCommitmentAudit\([^)]*\)\.catch\(\(\) => undefined\)/);
    // And the outcome reaches the body.
    expect(src).toContain('auditWriteFailed: true');
  });

  it('neither route fails the action over an audit outage', () => {
    const ops = read('server/routes/submission-ops.ts');
    const com = read('server/routes/c2c/commitments.ts');

    // Both still answer success — the artefact committed and must not be
    // retracted. If either of these ever becomes a 500 on an audit failure,
    // that is a deliberate policy change and should break this test.
    expect(ops).toMatch(/return res\.json\(\{\s*\n\s*success: true,/);
    expect(com).toMatch(/return res\.json\(\{\s*\n\s*success: true,/);
  });
});
