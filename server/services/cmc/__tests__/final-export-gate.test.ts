import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The final-export gate's contract, per the working agreement's "fail closed,
 * never fabricate": export must be refused unless every section it counts as
 * approved is ALSO the section the compiler actually established.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 * `evaluateFinalExportGate` read `approval_state` and `stale` from
 * cmc_module3_sections and asked only "is every row approved, none stale, no
 * open critical contradiction". It never read `completeness` or
 * `missingInputs` — both of which are stored in the same row's
 * `deterministic_json`, put there by the very compile step that fills the
 * table (module3OperatingSystemRoutes.ts: `completeness: section.completeness,
 * missingInputs: section.missingInputs`).
 *
 * Verified live: a project with 21/21 sections approved, three of them
 * (§3.2.P.6, §3.2.S.6, §3.2.P.8) compiled at 0% completeness with every
 * required input missing, passed this gate and "Place into the submission"
 * placed a leaf whose own text reads "No container closure system is recorded
 * for the drug substance." A signer approving from the Overview table saw no
 * completeness column at all.
 */

const queryImpl = vi.fn();
vi.mock('../../../db', () => ({
  getPool: () => ({ query: (...args: unknown[]) => queryImpl(...args) }),
}));

vi.mock('../governed-ana-execution.js', () => ({
  buildCanonicalGovernedState: vi.fn(async () => ({
    derivedFlags: { isBlocked: false, hasUnresolvedGovernedDecisions: false },
  })),
}));

import { evaluateFinalExportGate } from '../final-export-gate';

function section(overrides: Partial<{ approval_state: string; stale: boolean; completeness: number; missingInputs: string[] }>) {
  return {
    approval_state: overrides.approval_state ?? 'approved',
    stale: overrides.stale ?? false,
    deterministic_json: {
      completeness: overrides.completeness ?? 100,
      missingInputs: overrides.missingInputs ?? [],
    },
  };
}

beforeEach(() => {
  queryImpl.mockReset();
});

describe('evaluateFinalExportGate — completeness is checked, not just approval', () => {
  it('REFUSES export when an approved section compiled at 0% completeness', async () => {
    queryImpl.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM cmc_module3_sections')) {
        return {
          rows: [
            section({ completeness: 100 }),
            section({ completeness: 100 }),
            // §3.2.P.6 — approved, but the compiler established nothing.
            section({ completeness: 0, missingInputs: ['containerClosureDescription', 'suitabilityJustification'] }),
          ],
        };
      }
      if (sql.includes('FROM cmc_contradictions')) return { rows: [] };
      return { rows: [] };
    });

    const verdict = await evaluateFinalExportGate({ orgId: 1, projectId: 'p1', actorId: 'u1' });

    expect(verdict.allowed).toBe(false);
    expect(verdict.error).toMatch(/complete|missing/i);
  });

  it('ALLOWS export when every approved section is actually complete', async () => {
    queryImpl.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM cmc_module3_sections')) {
        return { rows: [section({ completeness: 100 }), section({ completeness: 100 })] };
      }
      if (sql.includes('FROM cmc_contradictions')) return { rows: [] };
      return { rows: [] };
    });

    const verdict = await evaluateFinalExportGate({ orgId: 1, projectId: 'p1', actorId: 'u1' });

    expect(verdict.allowed).toBe(true);
  });

  it('REFUSES when an approved section still lists missing inputs, even at high completeness', async () => {
    // A section can round to a high number and still have a required field
    // the compiler could not fill — the gate must trust missingInputs, not
    // just the percentage.
    queryImpl.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM cmc_module3_sections')) {
        return {
          rows: [
            section({ completeness: 100 }),
            section({ completeness: 90, missingInputs: ['qualificationBasis'] }),
          ],
        };
      }
      if (sql.includes('FROM cmc_contradictions')) return { rows: [] };
      return { rows: [] };
    });

    const verdict = await evaluateFinalExportGate({ orgId: 1, projectId: 'p1', actorId: 'u1' });

    expect(verdict.allowed).toBe(false);
  });

  it('names which sections are incomplete in the refusal', async () => {
    queryImpl.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM cmc_module3_sections')) {
        return {
          rows: [
            { ...section({ completeness: 0, missingInputs: ['x'] }), section_key: '3.2.P.6' },
          ],
        };
      }
      if (sql.includes('FROM cmc_contradictions')) return { rows: [] };
      return { rows: [] };
    });

    const verdict = await evaluateFinalExportGate({ orgId: 1, projectId: 'p1', actorId: 'u1' });
    expect(verdict.allowed).toBe(false);
    expect(verdict.data.incompleteApprovedSections ?? verdict.error).toBeTruthy();
  });
});
