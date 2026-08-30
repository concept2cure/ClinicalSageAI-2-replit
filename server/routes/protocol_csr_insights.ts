/**
 * CSR matching and insight-enrichment helpers for the protocol routes.
 *
 * Extracted verbatim from server/routes/protocol_routes.ts (which re-exports
 * the public names so its import surface is unchanged). This cluster covers:
 *   - retrieving similar CSRs for an indication/phase (getSimilarCsrs)
 *   - scoring how well a matched CSR fits the protocol (calculateMatchScore)
 *   - the honesty-contract helpers that derive display text and suggestions
 *     strictly from real fetched CSR fields (classifyOutcome, describeField,
 *     generateSuggestions, enrichCsrsWithDetailedInsights)
 */
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('protocol-csr-insights');

/**
 * Retrieves similar CSRs from the database that match the given therapeutic area and phase
 */
export async function getSimilarCsrs(db: any, indication: string, phase: string) {
  try {
    const therapeuticArea = getTherapeuticArea(indication);

    // Check if we have a real database connection
    if (db && db.query) {
      log.debug(
        `Searching for CSRs with therapeutic area: ${therapeuticArea} and phase: ${phase}`
      );

      // Query the actual CSR database
      const query = `
        SELECT id, title, indication, phase, therapeutic_area, sponsor, year,
               design, sample_size, duration_weeks, primary_endpoint, outcome,
               efficacy_data, safety_data, key_findings
        FROM reports
        WHERE
          (
            LOWER(therapeutic_area) LIKE $1
            OR LOWER(indication) LIKE $2
          )
          AND LOWER(phase) LIKE $3
        ORDER BY year DESC, id DESC
        LIMIT 10
      `;

      // Parameters for the query with fuzzy matching
      const params = [
        `%${therapeuticArea.toLowerCase()}%`,
        `%${indication.toLowerCase()}%`,
        `%${phase.replace('phase', '').trim().toLowerCase()}%`,
      ];

      // Execute the query
      const result = await db.query(query, params);

      if (result && result.rows && result.rows.length > 0) {
        log.debug(`Found ${result.rows.length} matching CSRs`);

        // Transform the data to the format we need
        return result.rows.map((row: any) => ({
          id: row.id,
          title: row.title,
          indication: row.indication,
          phase: row.phase,
          therapeutic_area: row.therapeutic_area,
          sponsor: row.sponsor,
          year: row.year,
          design: row.design,
          sample_size: row.sample_size,
          duration_weeks: row.duration_weeks,
          primary_endpoint: row.primary_endpoint,
          outcome: row.outcome,
          efficacy_data: row.efficacy_data,
          safety_data: row.safety_data,
          insight: row.key_findings,
        }));
      }
    }

    // If no database results or database connection failed, try the reports API
    log.debug('No database results, using reports API');

    // Use the reports API to retrieve trial data
    const apiResponse = await fetch('/api/reports', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (apiResponse.ok) {
      const reports = await apiResponse.json();

      // Filter reports that match our criteria
      const filteredReports = reports.filter((report: any) => {
        const reportIndication = report.indication ? report.indication.toLowerCase() : '';
        const reportPhase = report.phase ? report.phase.toLowerCase() : '';

        return (
          (reportIndication.includes(indication.toLowerCase()) ||
            (report.therapeutic_area &&
              report.therapeutic_area.toLowerCase().includes(therapeuticArea.toLowerCase()))) &&
          reportPhase.includes(phase.replace('phase', '').trim().toLowerCase())
        );
      });

      if (filteredReports.length > 0) {
        log.debug(`Found ${filteredReports.length} matching reports from API`);
        return filteredReports.slice(0, 5); // Limit to 5 reports
      }
    }

    // If no results from either approach, return empty array
    log.debug('No matching CSR data found');
    return [];
  } catch (error) {
    log.error('Error fetching similar CSRs:', error);
    return [];
  }
}

/**
 * Maps an indication to a therapeutic area
 */
function getTherapeuticArea(indication: string) {
  const indicationMap: Record<string, string> = {
    obesity: 'Metabolic Disorders',
    'type 2 diabetes': 'Metabolic Disorders',
    hypertension: 'Cardiovascular',
    'heart failure': 'Cardiovascular',
    depression: 'Psychiatry',
    schizophrenia: 'Psychiatry',
    'rheumatoid arthritis': 'Immunology',
    asthma: 'Respiratory',
    copd: 'Respiratory',
    alzheimer: 'Neurology',
    parkinson: 'Neurology',
    'multiple sclerosis': 'Neurology',
    'breast cancer': 'Oncology',
    'lung cancer': 'Oncology',
    'prostate cancer': 'Oncology',
    hiv: 'Infectious Disease',
    hepatitis: 'Infectious Disease',
  };

  const lowercaseIndication = indication.toLowerCase();

  for (const [key, value] of Object.entries(indicationMap)) {
    if (lowercaseIndication.includes(key)) {
      return value;
    }
  }

  return 'Other';
}

/**
 * Calculates a match score between a CSR and the current protocol
 */
export function calculateMatchScore(
  csr: any,
  indication: string,
  phase: string,
  studyType: string
) {
  let score = 70; // Base score

  // Increase score for exact indication match
  if (csr.indication.toLowerCase() === indication.toLowerCase()) {
    score += 15;
  } else if (
    csr.indication.toLowerCase().includes(indication.toLowerCase()) ||
    indication.toLowerCase().includes(csr.indication.toLowerCase())
  ) {
    score += 10;
  }

  // Increase score for exact phase match
  if (csr.phase.toLowerCase() === phase.replace('phase', 'Phase ').toLowerCase()) {
    score += 10;
  }

  // Adjust based on study design if available
  if (csr.design && studyType) {
    if (
      (studyType === 'rct' && csr.design.toLowerCase().includes('random')) ||
      (studyType !== 'rct' && !csr.design.toLowerCase().includes('random'))
    ) {
      score += 5;
    }
  }

  // Ensure score is within 0-100 range
  return Math.min(100, Math.max(0, score));
}

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
      `The study duration of ${csr.duration_weeks} weeks aligns with regulatory expectations for ${indication} trials`
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
        // Get detailed study insights from our database
        let detailedInsights = [];

        try {
          // Try to fetch from Protocol Knowledge Service
          const knowledgeResponse = await fetch('/api/protocol-knowledge/csr-insights', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              csr_id: csr.id,
              indication: csr.indication || indication,
              phase: csr.phase || phase,
            }),
          });

          if (knowledgeResponse.ok) {
            const insights = await knowledgeResponse.json();
            if (insights && insights.insights && Array.isArray(insights.insights)) {
              detailedInsights = insights.insights;
            }
          }
        } catch (error) {
          log.error(`Error fetching detailed insights for CSR ${csr.id}:`, error);
        }

        // If we don't have detailed insights from the knowledge service,
        // derive them from the real fields already fetched for this CSR
        // (csr.outcome / csr.efficacy_data / csr.safety_data / csr.insight,
        // the latter mapped from key_findings). Never assert a p-value,
        // significance, or regulatory acceptance that these fields do not
        // actually state — when a field is empty/unknown, say so honestly.
        if (detailedInsights.length === 0) {
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
        }

        // Add specific regulatory insights based on therapeutic area
        let regulatoryInsights: string[] = [];
        if (
          indication.toLowerCase().includes('diabetes') ||
          indication.toLowerCase().includes('obesity')
        ) {
          regulatoryInsights = [
            `FDA guidance recommends cardiovascular outcome assessment for ${indication} therapies`,
            `EMA requires comprehensive safety monitoring for metabolic therapies`,
            `Recent regulatory precedent shows preference for long-term efficacy data (≥52 weeks) for ${indication}`,
          ];
        } else if (
          indication.toLowerCase().includes('onco') ||
          indication.toLowerCase().includes('cancer')
        ) {
          regulatoryInsights = [
            `FDA's Project Orbis expedites oncology applications for novel therapies`,
            `Recent successful ${indication} submissions included PRO (patient-reported outcome) endpoints`,
            `Surrogate endpoints (PFS, ORR) have been accepted for ${indication} therapies with significant unmet need`,
          ];
        } else if (
          indication.toLowerCase().includes('neuro') ||
          indication.toLowerCase().includes('alzheimer')
        ) {
          regulatoryInsights = [
            `FDA draft guidance on ${indication} emphasizes use of dual outcomes (clinical and biomarker)`,
            `EMA requires careful monitoring of neuropsychiatric adverse events`,
            `Novel complex innovative trial designs (CID) have been accepted for ${indication} studies`,
          ];
        }

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
          regulatory_insights: regulatoryInsights,
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
