/**
 * Intelligence tools — the deterministic prediction layer and the precedent
 * corpus. Both are honest about cold start: an un-ingested corpus yields n=0
 * and a "not assessed" artifact, never a number.
 */

import { z } from 'zod';
import { defineTool, ok, callAnaHandler } from './runtime';
import { MCP_SCOPES } from '../config';

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const runCrlPremortem = defineTool({
  name: 'c2c_run_crl_premortem',
  title: 'Run CRL/RTF pre-mortem',
  description:
    'CRL/RTF pre-mortem on a passage of submission text: a deterministic reviewer-trigger scan (pattern id, ' +
    'severity, matched text, reviewer question, regulatory basis, remediation) calibrated against the ' +
    'precedent corpus (n, confidence, citations). Cold-start honest: with no ingested precedents the ' +
    'denominator is 0 and confidence is low — report that, do not fill it in.',
  inputSchema: {
    text: z.string().min(20).max(60000).describe('The section or passage to scan.'),
    location: z.string().max(120).default('document').describe('Where the text sits, e.g. "Module 2.5 §4"'),
    submission_type: z.string().max(20).optional().describe('IND, NDA, BLA, 510k …'),
    agency: z.string().max(20).optional().describe('FDA, EMA, PMDA …'),
    indication: z.string().max(200).optional(),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'AnA run_submission_premortem → intelligence/rim quickPatternScan + submission-premortem-core composePremortem + precedent-engine',
  async run(input, ctx) {
    const outcome = await callAnaHandler(
      'run_submission_premortem',
      { text: input.text, location: input.location, submission_type: input.submission_type, agency: input.agency, indication: input.indication },
      ctx,
    );
    if (outcome.kind === 'refused') return outcome;
    const d = outcome.data;
    const findings = Array.isArray(d.findings) ? (d.findings as unknown[]) : [];
    return ok(
      `${findings.length} reviewer-trigger finding(s); overall risk ${String(d.overallRisk ?? d.riskLevel ?? 'n/a')}, ` +
        `confidence ${String(d.confidence ?? 'n/a')} (precedent n=${Number(d.precedentCount ?? 0)}).`,
      d,
    );
  },
});

export const searchPrecedents = defineTool({
  name: 'c2c_search_precedents',
  title: 'Search regulatory precedents',
  description:
    'Search the platform’s precedent corpus (public precedents plus your organisation’s private ones; never ' +
    'another tenant’s) by submission type, indication, therapeutic area, device class or product code. ' +
    'Returns an honest empty set when the corpus has not been ingested for that slice.',
  inputSchema: {
    submission_type: z.string().min(2).max(20).describe('e.g. NDA, BLA, 510k, PMA'),
    indication: z.string().max(200).optional(),
    therapeutic_area: z.string().max(120).optional(),
    product_type: z.string().max(40).optional(),
    device_class: z.string().max(5).optional(),
    device_name: z.string().max(200).optional(),
    product_code: z.string().max(10).optional(),
    query: z.string().max(300).optional(),
    limit: z.number().int().min(1).max(25).default(10),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'AnA lookup_regulatory_precedents → server/services/precedent-engine.ts search',
  async run(input, ctx) {
    const outcome = await callAnaHandler(
      'lookup_regulatory_precedents',
      {
        submission_type: input.submission_type,
        indication: input.indication,
        therapeutic_area: input.therapeutic_area,
        product_type: input.product_type,
        device_class: input.device_class,
        device_name: input.device_name,
        product_code: input.product_code,
        query: input.query,
        limit: input.limit,
      },
      ctx,
    );
    if (outcome.kind === 'refused') return outcome;
    const count = Number(outcome.data.count ?? 0);
    return ok(
      count === 0
        ? `No precedents in the corpus for ${input.submission_type}${input.indication ? ` / ${input.indication}` : ''}. The corpus has not been ingested for this slice; this is an empty result, not a finding.`
        : `${count} precedent(s) for ${input.submission_type}.`,
      outcome.data,
    );
  },
});
