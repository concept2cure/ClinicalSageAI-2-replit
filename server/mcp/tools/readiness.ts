/**
 * Readiness tools — the deterministic verdicts the launch definition names.
 *
 * c2c_assess_sequence_readiness is THE readiness tool: the same server-side
 * dispatch/freeze gate composition Submission Center shows, computed from the
 * sequence's real leaves. Numbers and verdicts come from the engine; nothing
 * here is estimated.
 */

import { z } from 'zod';
import { defineTool, ok, refused, errorMessage } from './runtime';
import { MCP_SCOPES } from '../config';

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const assessSequenceReadiness = defineTool({
  name: 'c2c_assess_sequence_readiness',
  title: 'Assess sequence readiness',
  description:
    'Filing-readiness assessment for one eCTD sequence, computed by the platform’s dispatch-readiness ' +
    'engine from its real leaves: structural findings (errors block, warnings do not), required Module 1 ' +
    'coverage, shadow-review presence, external (agency-grade) validator posture, Part 11 release-signature ' +
    'state, and the composed FREEZE and DISPATCH gate verdicts with their blockers. The verdict is the ' +
    'engine’s; report it verbatim.',
  inputSchema: { sequence_id: z.number().int().positive().describe('A sequence id from c2c_list_sequences.') },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/ectd/assess-dispatch-readiness.ts assessSequenceDispatchReadiness',
  async run(input, ctx) {
    const { assessSequenceDispatchReadiness } = await import('../../services/ectd/assess-dispatch-readiness');
    let a;
    try {
      a = await assessSequenceDispatchReadiness({ sequenceId: input.sequence_id, organizationId: ctx.principal.organizationId });
    } catch (err) {
      return refused(errorMessage(err));
    }
    const gate = a.gate;
    const freeze = a.freezeGate;
    const summary =
      `Sequence ${a.sequenceId} (${a.region}, ${a.sequenceStatus}): ${a.leafCount} leaves, ` +
      `${a.validationErrors} structural error(s), ${a.unacknowledgedShadowCriticals} unacknowledged shadow critical(s); ` +
      `freeze gate ${freeze.cleared ? 'CLEAR' : 'BLOCKED'}, dispatch gate ${gate.cleared ? 'CLEAR' : 'BLOCKED'}` +
      (gate.blockers.length ? ` — ${gate.blockers.join(' | ')}` : '') + '.';
    return ok(summary, {
      sequenceId: a.sequenceId,
      region: a.region,
      sequenceStatus: a.sequenceStatus,
      leafCount: a.leafCount,
      validationErrors: a.validationErrors,
      unacknowledgedShadowCriticals: a.unacknowledgedShadowCriticals,
      shadowReviewRunCount: a.shadowReviewRunCount,
      shadowReviewMissing: a.shadowReviewMissing,
      externalValidation: a.externalValidation,
      releaseSignature: a.releaseSignature,
      freezeGate: a.freezeGate,
      dispatchGate: a.gate,
      readiness: a.readiness,
      signOff: { url: `${ctx.config.appBaseUrl}/concept2cure/submission-center` },
    });
  },
});

export const readinessOverview = defineTool({
  name: 'c2c_readiness_overview',
  title: 'Organisation readiness overview',
  description:
    'Organisation-wide readiness rollup across projects as the platform’s readiness aggregator computes it ' +
    '(per-project score, at-risk list, next actions). Honest empty when the organisation has no projects. ' +
    'Every number is the aggregator’s; the connector adds nothing.',
  inputSchema: {
    submission_type: z.enum(['IND', 'NDA', 'BLA', 'ALL']).default('ALL'),
    at_risk_threshold: z.number().int().min(0).max(100).default(60),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/ana/org-readiness-overview.ts getOrgReadinessOverview',
  async run(input, ctx) {
    const { getOrgReadinessOverview } = await import('../../services/ana/org-readiness-overview');
    const overview = await getOrgReadinessOverview(ctx.principal.organizationId, {
      submissionType: input.submission_type,
      atRiskThreshold: input.at_risk_threshold,
    });
    const o = overview as unknown as Record<string, unknown>;
    const projects = Array.isArray(o.projects) ? (o.projects as unknown[]) : [];
    return ok(
      projects.length === 0
        ? 'No projects to assess: the organisation has no active projects, so there is no readiness to report.'
        : `Readiness overview across ${projects.length} project(s) computed by the platform aggregator.`,
      { organizationId: ctx.principal.organizationId, overview: o },
    );
  },
});

export const gaReadinessProbe = defineTool({
  name: 'c2c_ga_readiness_probe',
  title: 'Deployment readiness probe',
  description:
    'Summary of this deployment’s submission-readiness preflight: whether the licensed eCTD DTDs/stylesheets ' +
    'per region, the eSTAR templates and an agency-grade validator are present or configured, what each ' +
    'missing item blocks, and the actions to clear them. Observes files and configuration only; it never ' +
    'reports ready on the strength of a document. Not tenant data.',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/submission-readiness/procurement-preflight.ts runProcurementPreflight',
  async run() {
    const { runProcurementPreflight } = await import('../../services/submission-readiness/procurement-preflight');
    const report = await runProcurementPreflight();
    return ok(
      `Deployment preflight: ${report.summary.satisfied}/${report.summary.total} items satisfied` +
        (report.ready ? ' — READY.' : ` — NOT READY. ${report.summary.missing} missing: ${report.actions.slice(0, 5).join(' | ')}`),
      { ready: report.ready, summary: report.summary, items: report.items, actions: report.actions },
    );
  },
});
