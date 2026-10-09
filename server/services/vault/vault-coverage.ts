/**
 * Vault coverage: what the Vault holds against what the program's rule pack
 * requires (VR-15, row D2, docs/evidence/D2/2026-09-29-vault-index-coverage/).
 *
 * The required list comes from resolveRequiredSections
 * (server/services/ectd/required-sections.ts), the one resolver every gate
 * uses, with its provenance: the live pack and its version, or the ICH baseline
 * and why. A section counts as covered only when a CONFIRMED filing sits at it
 * or below it (3.2.S.4.2 covers 3.2.S; 5.3.5 does not cover 5.3.5.1). A
 * suggestion is the classifier's guess, and unfiled is nothing. Before VR-13
 * there is no approval, so "confirmed" is the strongest state a filing has.
 *
 * Counts only: no percentage, and nothing here feeds a readiness figure. The
 * block is labelled "Vault coverage" on the surface for that reason, and a
 * source guard (vault-coverage.test.ts) keeps its only reader the Vault's
 * read model.
 *
 * @module server/services/vault/vault-coverage
 */
import { normalizeCtdCode } from '../../../shared/regulatory/section-code.js';
import {
  resolveRequiredSections,
  type Queryable,
  type RequiredSectionProvenance,
  type RequiredSectionSet,
} from '../ectd/required-sections.js';
import type { VaultViewId } from '../../../shared/constants/domain/vault-taxonomy.js';

export interface FiledSection {
  ctdSection: string | null;
  placementStatus: string | null;
}

export interface CoverageModule {
  code: string;
  name: string;
  covered: string[];
  missing: string[];
}

export type VaultCoverage =
  | {
      state: 'available';
      provenance: RequiredSectionProvenance;
      modules: CoverageModule[];
      required: number;
      covered: number;
    }
  | { state: 'unavailable'; reason: string }
  | { state: 'not_applicable'; reason: string };

/** Which required sections a confirmed filing covers. Pure. */
export function coverageOf(set: RequiredSectionSet, filings: ReadonlyArray<FiledSection>): Extract<VaultCoverage, { state: 'available' }> {
  const confirmed = filings
    .filter((f) => f.placementStatus === 'confirmed')
    .map((f) => normalizeCtdCode(f.ctdSection))
    .filter((c): c is string => c !== null);
  const covers = (required: string): boolean => {
    const want = normalizeCtdCode(required) ?? required;
    return confirmed.some((c) => c === want || c.startsWith(`${want}.`));
  };
  const modules = set.modules
    .filter((m) => m.requiredSections.length > 0)
    .map((m) => ({
      code: m.code,
      name: m.name,
      covered: m.requiredSections.filter(covers),
      missing: m.requiredSections.filter((s) => !covers(s)),
    }));
  return {
    state: 'available',
    provenance: set.provenance,
    modules,
    required: modules.reduce((n, m) => n + m.covered.length + m.missing.length, 0),
    covered: modules.reduce((n, m) => n + m.covered.length, 0),
  };
}

/**
 * The coverage block for one program's Vault. Never throws: a store that cannot
 * be read is `unavailable` with the reason, never a count of zero.
 *
 * resolveRequiredSections swallows a failed rule-pack read into its fallback
 * (it cannot be edited here: the D7 spine owns it). The query it is handed is
 * watched, so a fallback that followed a failed read is reported as the failure
 * it was, not counted against the baseline.
 */
export async function readVaultCoverage(
  client: Queryable,
  input: {
    view: VaultViewId;
    programType: string | null | undefined;
    primaryAgency: string | null | undefined;
    programId: string;
    organizationId: number;
  },
): Promise<VaultCoverage> {
  if (input.view !== 'pharma' && input.view !== 'biotech') {
    return {
      state: 'not_applicable',
      reason: 'This vault is not CTD-numbered, so there is no required-section list to count against.',
    };
  }
  let readFailed = false;
  const watched: Queryable = {
    query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
      try {
        return await client.query<T>(text, params);
      } catch (err) {
        readFailed = true;
        throw err;
      }
    },
  };
  const set = await resolveRequiredSections(watched, { programType: input.programType, primaryAgency: input.primaryAgency });
  if (readFailed) {
    return { state: 'unavailable', reason: set.provenance.reason ?? 'The rule-pack store could not be read.' };
  }
  try {
    const { rows } = await client.query<{ ctd_section: string | null; placement_status: string | null }>(
      `SELECT d.ctd_section, d.placement_status
         FROM vault.documents d
        WHERE d.program_id = $1 AND d.deleted_at IS NULL
          AND d.placement_status = 'confirmed' AND d.ctd_section IS NOT NULL
          AND EXISTS (SELECT 1 FROM regulatory_programs rp
                       WHERE rp.id = d.program_id AND rp.organization_id = $2 AND rp.deleted_at IS NULL)
        GROUP BY d.ctd_section, d.placement_status`,
      [input.programId, input.organizationId],
    );
    return coverageOf(set, rows.map((r) => ({ ctdSection: r.ctd_section, placementStatus: r.placement_status })));
  } catch (err) {
    return {
      state: 'unavailable',
      reason: `The Vault's filings could not be read (${err instanceof Error ? err.message : String(err)}), so coverage is not shown.`,
    };
  }
}
