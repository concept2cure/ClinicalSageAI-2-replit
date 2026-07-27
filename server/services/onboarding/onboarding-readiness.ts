/**
 * Onboarding readiness — what setup this organization still needs.
 *
 * Backs the read-only `summarize_onboarding_readiness` AnA tool so a client can
 * ask, in conversation, what is still missing and what a document could help
 * with. READ-ONLY by construction: it selects the org profile and returns prose.
 *
 * There is deliberately no companion "commit" tool. A model-callable commit
 * could self-invoke inside the agentic loop, which would defeat the
 * human-approval gate the onboarding flow is built on — applying proposals
 * stays a human action through the governed endpoint.
 *
 * @module server/services/onboarding/onboarding-readiness
 */

import { pool } from '../../db';

/** Fields onboarding can help populate, with how to describe each to a client. */
const PROFILE_FIELDS: ReadonlyArray<{ column: string; label: string; sourceHint: string }> = [
  { column: 'name', label: 'Organization name', sourceHint: 'a company profile, letterhead, or prior filing cover page' },
  { column: 'client_type', label: 'Client type', sourceHint: 'any document describing what the company does' },
  { column: 'industry_mode', label: 'Industry / therapeutic area', sourceHint: 'a company profile or program summary' },
];

export interface OnboardingReadiness {
  filled: string[];
  missing: Array<{ label: string; sourceHint: string }>;
  /** Prose for AnA to relay — already client-safe, no internal identifiers. */
  summary: string;
}

/**
 * Summarize which onboarding fields are set for this org. Never throws: on any
 * failure it says plainly that it could not read the profile, rather than
 * implying the workspace is empty (which would be a false statement about the
 * client's data).
 */
export async function summarizeOnboardingReadiness(orgId: number): Promise<OnboardingReadiness> {
  let row: Record<string, unknown> | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT name, client_type, industry_mode FROM organizations WHERE id = $1`,
      [orgId],
    );
    row = rows[0] ?? null;
  } catch {
    return {
      filled: [],
      missing: [],
      summary:
        'I could not read your workspace profile just now, so I cannot say what is still missing. Nothing has changed — please try again in a moment.',
    };
  }

  if (!row) {
    return {
      filled: [],
      missing: PROFILE_FIELDS.map((f) => ({ label: f.label, sourceHint: f.sourceHint })),
      summary: 'I could not find a profile for this workspace yet.',
    };
  }

  const filled: string[] = [];
  const missing: Array<{ label: string; sourceHint: string }> = [];
  for (const f of PROFILE_FIELDS) {
    const v = row[f.column];
    if (typeof v === 'string' && v.trim().length > 0) filled.push(f.label);
    else missing.push({ label: f.label, sourceHint: f.sourceHint });
  }

  const parts: string[] = [];
  parts.push(
    filled.length > 0
      ? `Your workspace profile already has: ${filled.join(', ')}.`
      : 'Your workspace profile is still empty.',
  );
  if (missing.length === 0) {
    parts.push('Nothing is outstanding on the organization profile.');
  } else {
    parts.push(
      `Still blank: ${missing.map((m) => m.label).join(', ')}. ` +
        `You can fill these by uploading ${missing[0].sourceHint} — I read the document, show you each value with the exact line I found it on, and nothing is saved until you review and approve it.`,
    );
  }
  return { filled, missing, summary: parts.join(' ') };
}
