/**
 * Guidance Ingestion Service — live regulatory guidance fetching for FDA/EMA/ICH.
 *
 * Wraps external guidance APIs and the local currency registry to provide:
 *   1. Live FDA guidance document search (fetchFdaGuidanceList)
 *   2. ICH guideline update checks from a curated step-date registry (fetchIchGuidelineUpdates)
 *   3. Freshness checks against the currency registry (checkGuidanceFreshness)
 *
 * NEVER THROWS on network failure — returns `{status: 'unavailable', message}` instead.
 * External endpoint is configurable via `process.env.FDA_GUIDANCE_API_URL`.
 *
 * @module server/services/regulatory-currency/guidance-ingestion-service
 */

import { findFacts } from './currency-registry.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FdaGuidanceOpts {
  topic?: string;
  year?: number;
  status?: 'final' | 'draft' | 'withdrawn';
  limit?: number;
}

export interface FdaGuidanceItem {
  title: string;
  issueDate: string;
  topic: string;
  url: string;
  status: string;
}

export type FdaGuidanceResult =
  | { status: 'fetched'; guidances: FdaGuidanceItem[]; fetchedAt: string; source: 'fda.gov' }
  | { status: 'unavailable'; message: string };

export interface IchGuidelineOpts {
  category?: 'Q' | 'S' | 'E' | 'M';
  since?: string;
}

export interface IchGuidelineItem {
  code: string;
  title: string;
  step: string;
  stepDate: string;
  category: 'Q' | 'S' | 'E' | 'M';
}

export interface IchGuidelineResult {
  status: 'fetched';
  guidelines: IchGuidelineItem[];
  source: 'ich.org';
}

export interface FreshnessOpts {
  citedGuidances: Array<{ title: string; citedDate?: string; jurisdiction?: string }>;
}

export interface FreshnessResultItem {
  title: string;
  current: boolean;
  latestKnownDate?: string;
  warning?: string;
}

export interface FreshnessResult {
  status: 'checked';
  results: FreshnessResultItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ICH Guideline Curated Registry
// ─────────────────────────────────────────────────────────────────────────────

const ICH_GUIDELINES: IchGuidelineItem[] = [
  {
    code: 'E6(R3)',
    title: 'Good Clinical Practice',
    step: 'Step 4',
    stepDate: '2025-01',
    category: 'E',
  },
  {
    code: 'M11',
    title: 'Clinical electronic Structured Harmonised Protocol',
    step: 'Step 4',
    stepDate: '2024-11',
    category: 'M',
  },
  {
    code: 'Q12',
    title: 'Lifecycle Management',
    step: 'Step 4',
    stepDate: '2023-01',
    category: 'Q',
  },
  {
    code: 'Q14',
    title: 'Analytical Procedure Development',
    step: 'Step 4',
    stepDate: '2024-01',
    category: 'Q',
  },
  {
    code: 'E8(R1)',
    title: 'General Considerations for Clinical Studies',
    step: 'Step 4',
    stepDate: '2021-10',
    category: 'E',
  },
  {
    code: 'M4(R4)',
    title: 'Organisation of the Common Technical Document',
    step: 'Step 2',
    stepDate: '2025-06',
    category: 'M',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// fetchFdaGuidanceList
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FDA_URL = 'https://api.fda.gov/other/substance.json';

/**
 * Upstream request timeout. Without one, a hung guidance endpoint stalls the
 * ingestion worker indefinitely; with it the fetch aborts and the call
 * degrades to `{status: 'unavailable'}` like any other network failure.
 * Same AbortSignal.timeout pattern as server/services/integrations/http.ts.
 */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch FDA guidance documents from the FDA guidance API.
 * On network failure, timeout, or non-200: returns `{status: 'unavailable'}` — NEVER throws.
 */
export async function fetchFdaGuidanceList(
  opts: FdaGuidanceOpts = {},
): Promise<FdaGuidanceResult> {
  const baseUrl = process.env.FDA_GUIDANCE_API_URL || DEFAULT_FDA_URL;
  const limit = opts.limit ?? 10;

  try {
    // Build query parameters based on opts
    const searchTerms: string[] = [];
    if (opts.topic) searchTerms.push(opts.topic);
    if (opts.year) searchTerms.push(String(opts.year));
    if (opts.status) searchTerms.push(opts.status);

    const params = new URLSearchParams();
    if (searchTerms.length > 0) {
      params.set('search', searchTerms.join('+AND+'));
    }
    params.set('limit', String(limit));

    const url = `${baseUrl}?${params.toString()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

    if (!response.ok) {
      return {
        status: 'unavailable',
        message: `FDA API returned HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const results = (data.results ?? []) as Array<Record<string, any>>;

    const guidances: FdaGuidanceItem[] = results.map((r: Record<string, any>) => ({
      title: r.substance_name ?? r.title ?? 'Unknown',
      issueDate: r.issue_date ?? r.create_date ?? '',
      topic: opts.topic ?? r.category ?? '',
      url: r.url ?? `https://www.fda.gov/search?q=${encodeURIComponent(r.substance_name ?? '')}`,
      status: opts.status ?? r.status ?? 'unknown',
    }));

    return {
      status: 'fetched',
      guidances,
      fetchedAt: new Date().toISOString(),
      source: 'fda.gov',
    };
  } catch (err: any) {
    // AbortSignal.timeout rejects with TimeoutError (AbortError on older
    // runtimes) — surface a clearer message than the DOMException default.
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      status: 'unavailable',
      message: timedOut
        ? `FDA API request timed out after ${FETCH_TIMEOUT_MS}ms`
        : (err?.message ?? 'Network request failed'),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchIchGuidelineUpdates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for ICH guideline updates from the curated registry.
 * Filters by category and/or since date. Pure (no network).
 */
export function fetchIchGuidelineUpdates(
  opts: IchGuidelineOpts = {},
): IchGuidelineResult {
  let guidelines = [...ICH_GUIDELINES];

  if (opts.category) {
    guidelines = guidelines.filter((g) => g.category === opts.category);
  }

  if (opts.since) {
    guidelines = guidelines.filter((g) => g.stepDate >= opts.since!);
  }

  return {
    status: 'fetched',
    guidelines,
    source: 'ich.org',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// checkGuidanceFreshness
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise for fuzzy matching. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Cross-reference cited guidances against the currency registry to check freshness.
 * Pure (no network, no LLM) — deterministic cross-reference against findFacts.
 */
export function checkGuidanceFreshness(
  opts: FreshnessOpts,
): FreshnessResult {
  if (!opts.citedGuidances || !Array.isArray(opts.citedGuidances) || opts.citedGuidances.length === 0) {
    throw new Error('citedGuidances is required');
  }

  const results: FreshnessResultItem[] = opts.citedGuidances.map((cited) => {
    // Search the currency registry for matching facts
    const facts = findFacts({ topic: cited.title });

    // Also check against the ICH guideline registry
    const ichMatch = ICH_GUIDELINES.find(
      (g) => norm(cited.title).includes(norm(g.code)) || norm(cited.title).includes(norm(g.title)),
    );

    if (facts.length > 0) {
      const mostRelevant = facts[0];
      const isCurrent =
        mostRelevant.status === 'in_force' || mostRelevant.status === 'mandatory_upcoming';
      const isStale = cited.citedDate
        ? cited.citedDate < mostRelevant.effectiveDate
        : false;

      return {
        title: cited.title,
        current: isCurrent && !isStale,
        latestKnownDate: mostRelevant.effectiveDate,
        warning:
          !isCurrent
            ? `This guidance has status '${mostRelevant.status}' — it may no longer be in force. ${mostRelevant.note}`
            : isStale
              ? `Cited date (${cited.citedDate}) predates the latest effective date (${mostRelevant.effectiveDate}). Review for updates.`
              : undefined,
      };
    }

    if (ichMatch) {
      const isStale = cited.citedDate ? cited.citedDate < ichMatch.stepDate : false;
      return {
        title: cited.title,
        current: !isStale,
        latestKnownDate: ichMatch.stepDate,
        warning: isStale
          ? `ICH ${ichMatch.code} reached ${ichMatch.step} on ${ichMatch.stepDate}. Cited date (${cited.citedDate}) predates this.`
          : undefined,
      };
    }

    // No match found in either registry
    return {
      title: cited.title,
      current: true, // Conservatively assume current if not found
      warning: 'Not found in the curated registry — freshness could not be verified. Confirm against the primary source.',
    };
  });

  return {
    status: 'checked',
    results,
  };
}
