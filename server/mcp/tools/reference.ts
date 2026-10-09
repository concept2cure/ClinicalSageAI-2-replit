/**
 * Reference tools — ICH corpus, the regulatory-currency registry, the
 * deficiency taxonomy. Static, citable, versioned data; no model.
 */

import { z } from 'zod';
import { defineTool, ok, callAnaHandler } from './runtime';
import { MCP_SCOPES } from '../config';

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const lookupIchGuideline = defineTool({
  name: 'c2c_lookup_ich_guideline',
  title: 'Look up ICH guideline',
  description:
    'Look up an ICH guideline by code (E6(R3), E9(R1), M4Q(R1), Q1A(R2) …) or topic in the platform’s ' +
    'structured ICH corpus: title, category, status, scope, key requirements and the regulators that ' +
    'implement it. Read-only reference data; confirm the current revision on ich.org before citing.',
  inputSchema: { guideline: z.string().min(1).max(120).describe('Code or topic, e.g. "E6(R3)" or "estimands"') },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'AnA lookup_ich_guideline → server/services/ana-ri/ich-guideline-corpus.ts',
  async run(input, ctx) {
    const outcome = await callAnaHandler('lookup_ich_guideline', { guideline: input.guideline }, ctx);
    if (outcome.kind === 'refused') return outcome;
    const d = outcome.data;
    const count = d.match === 'exact' ? 1 : Number(d.count ?? 0);
    return ok(count === 0 ? `No ICH guideline matched "${input.guideline}".` : `${count} ICH guideline match(es) for "${input.guideline}".`, d);
  },
});

export const checkRegulatoryCurrency = defineTool({
  name: 'c2c_check_regulatory_currency',
  title: 'Check regulatory currency',
  description:
    'Guidance lookup against the platform’s dated regulatory-currency registry: the facts that match a ' +
    'topic/jurisdiction with their status as of today (in force, mandatory upcoming, superseded …), when ' +
    'each was last verified against its source, and — when drafted_on is given — the change radar of facts ' +
    'that took effect after that date. Report status and verification age verbatim; stale facts are flagged.',
  inputSchema: {
    topic: z.string().max(120).optional().describe('e.g. "eCTD v4", "EUDAMED", "ICH E6(R3)", "annual report"'),
    jurisdiction: z.enum(['US', 'EU', 'JP', 'UK', 'CA', 'ICH', 'GLOBAL']).optional(),
    segment: z.string().max(40).optional().describe('pharma | biotech | mdx | ivd'),
    drafted_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('ISO date the document was drafted; enables the change radar.'),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'AnA check_regulatory_currency + guidance_change_radar → server/services/regulatory-currency/currency-registry.ts',
  async run(input, ctx) {
    const currency = await callAnaHandler(
      'check_regulatory_currency',
      { topic: input.topic, jurisdiction: input.jurisdiction, segment: input.segment },
      ctx,
    );
    if (currency.kind === 'refused') return currency;
    let radar: Record<string, unknown> | null = null;
    if (input.drafted_on) {
      const r = await callAnaHandler(
        'guidance_change_radar',
        { topics: input.topic ? [input.topic] : undefined, jurisdictions: input.jurisdiction ? [input.jurisdiction] : undefined, draftedOn: input.drafted_on },
        ctx,
      );
      radar = r.kind === 'refused' ? { refused: r.reason } : r.data;
    }
    const result = (currency.data.result ?? {}) as Record<string, unknown>;
    return ok(
      `${Number(result.matchCount ?? 0)} registry fact(s) matched as of ${String(result.asOf ?? 'today')}; ` +
        `${Number(result.staleCount ?? 0)} past their verification window` +
        (radar && typeof radar.result === 'object' && radar.result
          ? `; change radar: ${Number((radar.result as Record<string, unknown>).driftCount ?? 0)} drift(s) since ${input.drafted_on}.`
          : '.'),
      { currency: currency.data, changeRadar: radar },
    );
  },
});

export const lookupSubmissionDeficiencies = defineTool({
  name: 'c2c_lookup_submission_deficiencies',
  title: 'Look up submission deficiencies',
  description:
    'The platform’s deficiency taxonomy for a submission type: the reviewer deficiencies most likely to be ' +
    'raised (category, severity, likelihood, reviewer language, mitigations, references). Deterministic ' +
    'reference data for pre-empting agency findings; not a prediction about your dossier.',
  inputSchema: {
    submission_type: z.enum(['ind', 'nda', 'bla', '510k', 'pma', 'de_novo', 'cer', 'ectd', 'general']),
    critical_only: z.boolean().default(false),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'AnA lookup_submission_deficiencies → server/services/ana/submission-deficiency-taxonomy',
  async run(input, ctx) {
    const outcome = await callAnaHandler(
      'lookup_submission_deficiencies',
      { submission_type: input.submission_type, critical_only: input.critical_only },
      ctx,
    );
    if (outcome.kind === 'refused') return outcome;
    const list = Array.isArray(outcome.data.deficiencies) ? (outcome.data.deficiencies as unknown[]) : [];
    return ok(`${list.length} ${input.critical_only ? 'critical ' : ''}deficiency pattern(s) for ${input.submission_type.toUpperCase()}.`, outcome.data);
  },
});
