/**
 * CSR matching and insight-enrichment helpers for the protocol routes.
 *
 * Extracted verbatim from server/routes/protocol_routes.ts (which re-exports
 * the public names so its import surface is unchanged). This cluster covers the
 * honesty-contract helpers that derive display text and suggestions strictly
 * from real fetched CSR fields (classifyOutcome, describeField,
 * generateSuggestions, enrichCsrsWithDetailedInsights).
 *
 * REMOVED 2026-10-01: getSimilarCsrs and calculateMatchScore. getSimilarCsrs
 * read a `reports` table that no migration creates, through a db handle nothing
 * set, then fell back to a relative-URL fetch Node cannot issue — and returned
 * [] on every failure, so the protocol routes always reported "no comparable
 * trials". The comparable trials now come from the trial corpus through
 * precedentBenchmarkReader.compare (server/services/corpus). calculateMatchScore
 * started every trial at 70 and only ever scored trials that already matched
 * on indication and phase, so it had nothing left to measure.
 */
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('protocol-csr-insights');

/**
 * Classifies the real, fetched `outcome` field of a CSR as success,
 * failure, or unknown. Used so downstream text never asserts efficacy or
 * significance that the actual outcome does not state.
 */
export function classifyOutcome(outcome: unknown): 'success' | 'failure' | 'unknown' {
  if (typeof outcome !== 'string' || outcome.trim().length === 0) {
    return 'unknown';
  }
  const text = outcome.toLowerCase();
  const failureSignals = [
    'did not meet',
    'not met',
    'failed to meet',
    'failed to demonstrate',
    'no significant',
    'not statistically significant',
    'did not achieve',
    'did not demonstrate',
    'discontinued',
    'terminated',
    'negative',
    'unsuccessful',
    'inferior',
  ];
  const successSignals = [
    'met the primary endpoint',
    'met primary endpoint',
    'achieved the primary endpoint',
    'successfully demonstrated',
    'statistically significant improvement',
    'significant reduction',
    'positive',
    'successful',
    'superior',
  ];
  if (failureSignals.some(s => text.includes(s))) return 'failure';
  if (successSignals.some(s => text.includes(s))) return 'success';
  return 'unknown';
}

/**
 * Renders a real fetched field (string, object, or array) as display text,
 * truncated to a reasonable length. Returns `fallback` — an honest
 * "not available" message — when the field is empty/null/undefined, rather
 * than fabricating content. Never invents a value not present in `value`.
 */
export function describeField(value: unknown, fallback: string): string {
  const MAX_LEN = 400;
  if (value === null || value === undefined) return fallback;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return fallback;
    return trimmed.length > MAX_LEN ? `${trimmed.slice(0, MAX_LEN)}…` : trimmed;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return fallback;
    const joined = value.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join('; ');
    return joined.length > MAX_LEN ? `${joined.slice(0, MAX_LEN)}…` : joined;
  }

  if (typeof value === 'object') {
    try {
      const asString = JSON.stringify(value);
      if (!asString || asString === '{}') return fallback;
      return asString.length > MAX_LEN ? `${asString.slice(0, MAX_LEN)}…` : asString;
    } catch {
      return fallback;
    }
  }

  const asString = String(value).trim();
  return asString.length > 0 ? asString : fallback;
}

/**
 * Generates suggestions based on a similar CSR.
 *
 * Honesty contract: this must be derived from the CSR's real, fetched
 * `outcome` field — never assert "successfully demonstrated efficacy" or
 * "statistically significant" for a study whose outcome was negative, or
 * whose outcome is simply unknown to us. Previously this asserted success
 * and significance unconditionally for every matched CSR, including ones
 * whose real outcome recorded a failed/negative result.
 */
export function generateSuggestions(csr: any, indication: string, phase: string) {
  const outcomeStatus = classifyOutcome(csr.outcome);
  const suggestions: string[] = [];

  if (csr.design) {
    if (outcomeStatus === 'success') {
      suggestions.push(
        `The ${csr.design} design used in this study was associated with a positive outcome for ${indication}: ${csr.outcome}`
      );
    } else if (outcomeStatus === 'failure') {
      suggestions.push(
        `The ${csr.design} design used in this study did not result in a positive outcome for ${indication} (recorded outcome: ${csr.outcome}) — consider what design factors may have contributed`
      );
    } else {
      suggestions.push(
        `Consider the ${csr.design} design used in this study; outcome is not available for this record, so efficacy cannot be inferred`
      );
    }
  }

  if (csr.sample_size) {
    if (outcomeStatus === 'success') {
      suggestions.push(
        `A sample size of ${csr.sample_size} participants was used in a study that reported a positive outcome for ${indication}`
      );
    } else if (outcomeStatus === 'failure') {
      suggestions.push(
        `A sample size of ${csr.sample_size} participants was used, but this study did not report a positive outcome — review whether sample size or power contributed to the result`
      );
    } else {
      suggestions.push(
        `A sample size of ${csr.sample_size} participants was used; the study's statistical outcome is not available for this record`
      );
    }
  }

  if (csr.duration_weeks) {
    suggestions.push(
      `This study ran for ${csr.duration_weeks} weeks`
    );
  }

  if (csr.primary_endpoint) {
    if (outcomeStatus === 'success') {
      suggestions.push(
        `The endpoint "${csr.primary_endpoint}" was used in a study reporting a positive outcome for this indication`
      );
    } else if (outcomeStatus === 'failure') {
      suggestions.push(
        `The endpoint "${csr.primary_endpoint}" was used in a study that did not achieve a positive outcome — consider whether an alternative endpoint may be more sensitive`
      );
    } else {
      suggestions.push(
        `The endpoint "${csr.primary_endpoint}" was used in this study; regulatory reception is not available for this record`
      );
    }
  }

  if (suggestions.length === 0) {
    suggestions.push(
      `Limited structured data is available for this matched CSR; outcome not available for this record`
    );
  }

  return suggestions;
}

/**
 * Enriches CSRs with detailed learnings and insights from our knowledge base
 * This significantly enhances the quality of recommendations by providing
 * specific, actionable insights from similar studies
 */
export async function enrichCsrsWithDetailedInsights(
  csrs: any[],
  indication: string,
  phase: string
): Promise<any[]> {
  try {
    if (!csrs || csrs.length === 0) {
      return [];
    }

    // Enrich each CSR with detailed insights from our knowledge base
    const enrichedCsrs = await Promise.all(
      csrs.map(async csr => {
        /* The insights are derived from the record's own fields. There used to
           be a fetch to /api/protocol-knowledge/csr-insights first: a relative
           URL, which Node's fetch rejects, to a route that does not exist. */
        const detailedInsights: Array<Record<string, string>> = [];

        // Derive them from the real fields already fetched for this CSR
        // (csr.outcome / csr.efficacy_data / csr.safety_data / csr.insight,
        // the latter mapped from key_findings). Never assert a p-value,
        // significance, or regulatory acceptance that these fields do not
        // actually state — when a field is empty/unknown, say so honestly.
        const outcomeStatus = classifyOutcome(csr.outcome);
        const outcomeEvidence = describeField(csr.outcome, 'Outcome not available for this record');

        if (csr.sample_size) {
          detailedInsights.push({
            category: 'Study Design',
            finding: `Study utilized a sample size of ${csr.sample_size} participants`,
            evidence: outcomeEvidence,
            recommendation:
              outcomeStatus === 'failure'
                ? `This study did not report a positive outcome — review whether sample size or statistical power may have contributed before adopting a similar approach`
                : `Consider a similar sample size calculation approach for your protocol`,
          });
        }

        if (csr.duration_weeks) {
          detailedInsights.push({
            category: 'Study Duration',
            finding: `Study duration of ${csr.duration_weeks} weeks was used to assess efficacy and safety endpoints`,
            evidence: describeField(
              csr.efficacy_data,
              'Efficacy data not available for this record'
            ),
            recommendation: `Evaluate if your current study duration captures the full treatment effect for ${indication}`,
          });
        }

        if (csr.primary_endpoint) {
          detailedInsights.push({
            category: 'Endpoint Selection',
            finding: `Primary endpoint "${csr.primary_endpoint}" was used in this study`,
            evidence:
              outcomeStatus === 'success'
                ? `Study outcome indicates this endpoint was met: ${csr.outcome}`
                : outcomeStatus === 'failure'
                  ? `Study outcome indicates this endpoint was NOT met: ${csr.outcome}`
                  : `Regulatory reception of this endpoint is not available for this record`,
            recommendation:
              outcomeStatus === 'failure'
                ? `Weigh whether an alternative endpoint may be more sensitive, given this study did not meet this endpoint`
                : `Consider aligning your primary endpoint with this study's endpoint choice`,
          });
        }

        if (csr.inclusion_criteria) {
          detailedInsights.push({
            category: 'Patient Population',
            finding: `Inclusion/exclusion criteria are on record for this study`,
            evidence: describeField(
              csr.inclusion_criteria,
              'Screen failure / eligibility data not available for this record'
            ),
            recommendation: `Review your inclusion/exclusion criteria to ensure they're both selective and practical`,
          });
        }

        if (csr.arms > 1) {
          detailedInsights.push({
            category: 'Trial Arms',
            finding: `${csr.arms}-arm design was used, providing comparative data against control and/or active comparator`,
            evidence: describeField(
              csr.safety_data,
              'Comparative safety data not available for this record'
            ),
            recommendation: `Consider whether your arm structure provides sufficient comparator data for regulatory submission`,
          });
        }

        if (csr.safety_data) {
          detailedInsights.push({
            category: 'Safety',
            finding: `Safety data is on record for this study`,
            evidence: describeField(csr.safety_data, 'Safety data not available for this record'),
            recommendation: `Review this study's safety profile when planning your safety monitoring approach`,
          });
        }

        if (csr.insight) {
          detailedInsights.push({
            category: 'Key Findings',
            finding: `Key findings are on record for this study`,
            evidence: describeField(csr.insight, 'Key findings not available for this record'),
            recommendation: `Consider these documented findings when refining your protocol`,
          });
        }

        /* REMOVED 2026-10-01: `regulatory_insights`. Three sentences per
           indication keyword, attached to every trial — "FDA guidance recommends
           cardiovascular outcome assessment for ${indication} therapies", "FDA
           draft guidance on ${indication} emphasizes use of dual outcomes",
           "Recent successful ${indication} submissions included PRO endpoints".
           With the indication interpolated, each named a guidance or a set of
           submissions for whatever was typed, and none was read from a source. */

        // Enrich CSR with all additional data. Every field below is derived
        // from the real fetched csr.* fields (outcome / efficacy_data /
        // safety_data / insight) — previously these were pseudo-random
        // values keyed off `csr.id` (e.g. a fabricated p-value, effect
        // size, AE rate, and recruitment rate attributed to a real named
        // study regardless of its actual data). Where no real data exists
        // for a field, we say so honestly instead of inventing a number.
        return {
          ...csr,
          detailed_insights: detailedInsights,
          statistical_approach: describeField(
            csr.efficacy_data,
            'Statistical methodology not available for this record'
          ),
          efficacy_outcomes: [
            csr.efficacy_data
              ? describeField(csr.efficacy_data, 'Efficacy data not available for this record')
              : describeField(csr.outcome, 'Efficacy outcome not available for this record'),
          ],
          safety_outcomes: [
            describeField(csr.safety_data, 'Safety data not available for this record'),
          ],
          key_learnings: [
            describeField(csr.insight, 'No documented key findings available for this record'),
          ],
          // No per-study recruitment/optimization data is fetched anywhere
          // in this pipeline, so these are general, non-attributed
          // considerations rather than claims about this specific study.
          optimization_insights: [
            'No study-specific optimization data is available for this record. General considerations for your protocol include stratification factors, adaptive design elements, enrichment strategies, and digital data collection where appropriate.',
          ],
          recruitment_insights: [
            'No study-specific recruitment data is available for this record.',
          ],
        };
      })
    );

    return enrichedCsrs;
  } catch (error) {
    log.error('Error enriching CSRs with detailed insights:', error);
    return csrs; // Return original CSRs if enrichment fails
  }
}
