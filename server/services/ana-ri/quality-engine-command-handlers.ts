/**
 * AnA command handlers for the deterministic CMC quality engines.
 *
 * ── Why these are not in module3-command-handlers ───────────────────────────
 * They are not Module 3 handlers. `ich_compliance` runs the ICH compliance
 * check, `control_strategy` the control-strategy generator and
 * `variations_classify` the variation classifier — three deterministic engines
 * over a program's recorded CMC data, none of which composes, persists or
 * reads a `cmc_module3_sections` row. They sat in the Module 3 module only
 * because that is where the CMC commands were first written, and they pushed
 * it past its line budget.
 *
 * Each reaches its engine through a dynamic import, so this module's only
 * static dependency is the command contract.
 *
 * Every figure here comes from the engine; the model narrates (CLAUDE.md
 * Rule 2). `variations_classify` is withheld from the launch catalog
 * (decision 2026-10-05) — its route is unmapped and no screen calls it.
 *
 * @module server/services/ana-ri/quality-engine-command-handlers
 */
import type { CommandContext, CommandResult } from './command-types';

// ── ich_compliance ────────────────────────────────────────────────────────────
//
// Runs the deterministic ICH compliance check for the active CMC project
// across Q1A/Q2/Q3A-B/Q3D/Q6A-B/Q8/Q9/Q10. Returns a structured report
// with overall status (compliant / warnings / non_compliant), per-guideline
// status, and the failing findings with their guideline citations.

export async function ichCompliance(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) {
    return { success: false, action: 'ich_compliance', message: 'Project ID required' };
  }
  const { runIchComplianceCheck } = await import('../cmc/ich-compliance-checker');
  const report = await runIchComplianceCheck(orgId, projectId);

  const failing = report.findings.filter(f => f.status === 'fail');
  const warnings = report.findings.filter(f => f.status === 'warning');

  const statusLabel =
    report.overallStatus === 'compliant' ? '**COMPLIANT**'
    : report.overallStatus === 'warnings' ? '**WARNINGS**'
    : '**NON-COMPLIANT**';

  const guidelineLines = Object.entries(report.guidelineStatus)
    .map(([g, s]) => `- ${g}: ${s}`)
    .join('\n');

  const failingLines = failing.slice(0, 5).map(f =>
    `- **${f.guideline}** ${f.ruleId}: ${f.message}`
  ).join('\n');
  const warningLines = warnings.slice(0, 5).map(f =>
    `- ${f.guideline} ${f.ruleId}: ${f.message}`
  ).join('\n');

  const message =
    `**ICH compliance:** ${statusLabel}\n\n` +
    `Findings: ${report.counts.pass} pass / ${report.counts.warning} warnings / ${report.counts.fail} fail\n\n` +
    `**Guideline status**\n${guidelineLines}` +
    (failingLines ? `\n\n**Failing (top 5)**\n${failingLines}` : '') +
    (warningLines ? `\n\n**Warnings (top 5)**\n${warningLines}` : '');

  return {
    success: true,
    action: 'ich_compliance',
    message,
    data: report,
  };
}

// ── control_strategy ──────────────────────────────────────────────────────────
//
// Generates a deterministic ICH Q8/Q9/Q10/Q11-grade control strategy for
// the active CMC project. Reads CMC source data via the QbD analyzer +
// analytical methods + stability and composes release tests, in-process
// controls, stability monitoring, raw material controls — each with
// risk-based justification and guideline citation.

export async function controlStrategy(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) {
    return { success: false, action: 'control_strategy', message: 'Project ID required' };
  }
  const scope = (params.scope as 'drug_substance' | 'drug_product' | 'both') || 'both';
  const { generateControlStrategy } = await import('../cmc/control-strategy-generator');
  const strategy = await generateControlStrategy(orgId, projectId, scope);

  const byType: Record<string, number> = {};
  for (const c of strategy.controlElements) {
    byType[c.controlType] = (byType[c.controlType] ?? 0) + 1;
  }
  const typeLines = Object.entries(byType)
    .map(([t, n]) => `- ${t.replace(/_/g, ' ')}: ${n}`)
    .join('\n');

  const gapBlock = strategy.gaps.length > 0
    ? `\n\n**Open gaps:**\n${strategy.gaps.slice(0, 5).map(g => `- ${g}`).join('\n')}`
    : '\n\nNo open gaps identified.';

  const message =
    `**Control strategy (${scope.replace('_', ' ')})**\n\n` +
    `Control elements: ${strategy.controlElements.length}\n${typeLines}\n\n` +
    `CQAs covered: ${strategy.cqas.length}  ·  CPPs covered: ${strategy.cpps.length}\n` +
    `Citations: ${strategy.citations.join(', ')}` +
    gapBlock;

  return {
    success: true,
    action: 'control_strategy',
    message,
    data: strategy,
  };
}

// ── variations_classify ───────────────────────────────────────────────────────
//
// Classifies a proposed manufacturing variation against FDA 21 CFR 314.70
// + SUPAC + EMA Commission Reg 1234/2008 + ICH Q12. Pure deterministic;
// caller supplies the change spec, this returns reporting category, SUPAC
// tier, BE requirement, impacted CTD sections, cross-module impact.

export async function variationsClassify(
  _ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  if (!params.dosageFormFamily || !params.changeCategory) {
    return {
      success: false,
      action: 'variations_classify',
      message: 'dosageFormFamily and changeCategory are required (e.g. immediate_release_oral_solid + scale_up).',
    };
  }
  const { classifyVariation } = await import('../cmc/supac-classifier');
  const classification = classifyVariation(params as unknown as Parameters<typeof classifyVariation>[0]);

  const moduleLines = classification.crossModuleImpact
    .map(m => `- ${m.module}: ${m.sections.slice(0, 3).join(', ')}${m.required ? ' (required)' : ' (recommended)'}`)
    .join('\n');

  const message =
    `**Variation classification**\n\n` +
    `FDA: **${classification.fdaReportingCategory.toUpperCase().replace(/_/g, ' ')}**` +
      (classification.supacTier !== 'not_applicable' ? `  ·  SUPAC: ${classification.supacTier.replace('_', ' ')}` : '') +
      `  ·  EMA: ${classification.emaVariationCategory.toUpperCase().replace(/_/g, ' ')}\n` +
    `BE: ${classification.bioequivalence.replace(/_/g, ' ')}  ·  Timeline: ~${classification.estimatedTimelineDays} days\n\n` +
    `**Impacted CTD sections**\n${classification.impactedCtdSections.map(s => `- ${s}`).join('\n')}\n\n` +
    `**Cross-module impact**\n${moduleLines}\n\n` +
    `**Citations**\n${classification.citations.map(c => `- ${c}`).join('\n')}`;

  return {
    success: true,
    action: 'variations_classify',
    message,
    data: classification,
  };
}
