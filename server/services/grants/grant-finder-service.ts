/**
 * Intelligent grant finder service (Capability C2C-14)
 *
 * Org-scoped funding profile CRUD + the discovery orchestration: search
 * Grants.gov, hydrate the top candidates' full detail, and score every
 * opportunity against the org's funding profile with the pure, explainable
 * matcher. Optionally records the strongest matches into the pre-award pipeline.
 * Network failures degrade gracefully (discovery still scores on search fields).
 *
 * @module server/services/grants/grant-finder-service
 */

import { pool } from '../../db';
import { GrantsGovConnector } from '../connectors/grants-gov';
import { rankOpportunities, type FundingProfile, type MatchableOpportunity, type OpportunityMatch, type FundingAgencyCode, type FundingMechanismCode } from './opportunity-matching';
import { createOpportunityTx } from './grants-service';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class GrantFinderError extends Error {
  constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'GrantFinderError';
  }
}

const today = (): string => new Date().toISOString().slice(0, 10);

export interface FundingProfileInput {
  keywords?: string[];
  agencies?: string[];
  mechanisms?: string[];
  institutionType?: string | null;
  minAward?: number | null;
  maxAward?: number | null;
}

/** Upsert the org's single funding profile (one row per org). Governed via the caller's transaction. */
export async function upsertFundingProfileTx(client: Queryable, orgId: number, userId: number, input: FundingProfileInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO grant_funding_profiles (organization_id, keywords, agencies, mechanisms, institution_type, min_award, max_award, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (organization_id) DO UPDATE SET
        keywords = EXCLUDED.keywords, agencies = EXCLUDED.agencies, mechanisms = EXCLUDED.mechanisms,
        institution_type = EXCLUDED.institution_type, min_award = EXCLUDED.min_award, max_award = EXCLUDED.max_award,
        updated_at = now()
     RETURNING id`,
    [orgId, input.keywords ?? null, input.agencies ?? null, input.mechanisms ?? null, input.institutionType ?? null, input.minAward ?? null, input.maxAward ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function getFundingProfile(orgId: number): Promise<FundingProfile | null> {
  const { rows } = await pool.query(`SELECT keywords, agencies, mechanisms, institution_type, min_award, max_award FROM grant_funding_profiles WHERE organization_id = $1 LIMIT 1`, [orgId]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    keywords: r.keywords ?? [],
    agencies: (r.agencies ?? []) as FundingAgencyCode[],
    mechanisms: (r.mechanisms ?? []) as FundingMechanismCode[],
    institutionType: r.institution_type ?? null,
    minAward: r.min_award == null ? null : Number(r.min_award),
    maxAward: r.max_award == null ? null : Number(r.max_award),
  };
}

export interface DiscoverOptions { query?: string; limit?: number; hydrateTop?: number }
export interface DiscoverResult {
  profileUsed: FundingProfile;
  scored: number;
  matches: OpportunityMatch[];
}

/**
 * Intelligent discovery: pull candidate opportunities from Grants.gov, hydrate
 * the top few for richer scoring inputs, then rank everything against the org
 * funding profile. Falls back to query-seeded keywords when no profile exists.
 */
export async function discoverOpportunities(orgId: number, opts: DiscoverOptions = {}): Promise<DiscoverResult> {
  const stored = await getFundingProfile(orgId);
  const profile: FundingProfile = stored ?? { keywords: [], agencies: [], mechanisms: [], institutionType: null, minAward: null, maxAward: null };
  // Seed keywords from the query when the profile has none.
  const queryKeywords = (opts.query ?? '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  if (profile.keywords.length === 0 && queryKeywords.length > 0) profile.keywords = queryKeywords;
  if (profile.keywords.length === 0 && !opts.query) {
    throw new GrantFinderError('BAD_INPUT', 'No funding profile and no query — set a profile or pass a query to discover opportunities.');
  }

  const connector = new GrantsGovConnector();
  const keyword = opts.query || profile.keywords.join(' ');
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);

  let candidates: MatchableOpportunity[] = [];
  try {
    const results = await connector.search({ keywords: [keyword], limit });
    candidates = results.map((r) => ({
      externalId: r.id,
      title: r.title,
      opportunityNumber: (r.metadata?.opportunityNumber as string) ?? null,
      agency: (r.metadata?.agency as string) ?? null,
      agencyCode: (r.metadata?.agencyCode as string) ?? null,
      closeDate: (r.metadata?.closeDate as string) ?? null,
      synopsis: null,
      awardCeiling: null,
      eligibilities: null,
    }));
  } catch (err) {
    throw new GrantFinderError('BAD_INPUT', `Grants.gov search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Hydrate the top N candidates for richer scoring (synopsis/eligibility/award); degrade softly.
  const hydrateTop = Math.min(Math.max(opts.hydrateTop ?? 8, 0), candidates.length);
  for (let i = 0; i < hydrateTop; i++) {
    try {
      const detail = await connector.fetchOpportunityDetail(candidates[i].externalId);
      candidates[i] = {
        ...candidates[i],
        synopsis: detail.synopsis ?? candidates[i].synopsis,
        agency: detail.agency ?? candidates[i].agency,
        closeDate: detail.closeDate ?? candidates[i].closeDate,
        awardCeiling: detail.awardCeiling ?? candidates[i].awardCeiling,
        eligibilities: detail.eligibilities.length ? detail.eligibilities : candidates[i].eligibilities,
      };
    } catch {
      /* leave the search-level fields; scoring degrades gracefully */
    }
  }

  const matches = rankOpportunities(profile, candidates, today());
  return { profileUsed: profile, scored: matches.length, matches };
}

/** Record a scored opportunity into the pre-award pipeline (reuses createOpportunityTx). Governed via caller's transaction. */
export async function recordMatchTx(client: Queryable, orgId: number, userId: number, input: { externalId: string; opportunityNumber: string; title: string; fundingAgency: string; mechanism?: string | null; dueDate?: string | null }): Promise<{ id: number }> {
  return createOpportunityTx(client, orgId, userId, {
    opportunityNumber: input.opportunityNumber,
    title: input.title,
    fundingAgency: input.fundingAgency as any,
    mechanism: (input.mechanism ?? null) as any,
    externalId: input.externalId,
    dueDate: input.dueDate ?? null,
  });
}

export { today };
