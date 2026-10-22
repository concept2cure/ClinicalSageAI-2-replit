/**
 * Module 3 Workflow Command Handlers for AnA
 *
 * Phase 7 — Module 3 Workflow Convergence
 *
 * These handlers are invoked by the AnA command executor when the user
 * triggers Module 3 build/refresh/readiness/lineage actions through chat.
 * All handlers call the same underlying pipeline used by the workspace/editor.
 */

import { getPool } from '../../db';
import { type ComposedSection } from '../module3Composer';
import { composeProjectModule3, persistComposedSection } from '../cmc/module3-compile';
import { anaCompositionRefusal, refusedByCompositionScope } from '../cmc/composition-scope';
import {
  bridgeCompileToArtifact,
  classifyAndMapArtifactToSource,
  getModule3BuildStatus,
  type DossierUploadClassification,
} from '../module3-convergence-service';
import { resolveToRegistryId } from '../../../shared/regulatory/submission-type-bridge';
import { detectContradictions, deriveImpactTasks } from '../cmc-impact-contradiction-engine';
import { readContradictionRegisters } from '../cmc/contradiction-registers';
import { NO_CANONICAL_SOURCES_REMEDY } from '../cmc/link-to-module3';
import { evaluateFinalExportGate, type FinalExportGateVerdict } from '../cmc/final-export-gate';
import type { CommandContext, CommandResult } from './command-types';

/**
 * The user a Module 3 write is attributed to. 2026-10-15: these handlers
 * persisted with `String(ctx.userId ?? 'system')` and classification passed no
 * actor at all, so a command that reached them without a user wrote its
 * provenance as 'system'. It is refused instead.
 */
function commandActor(ctx: CommandContext): number | null {
  return Number.isInteger(ctx.userId) && ctx.userId > 0 ? ctx.userId : null;
}

function refusedWithoutActor(action: string): CommandResult {
  return {
    success: false,
    action,
    message: 'This command records Module 3 provenance and carries no acting user, so it was refused; nothing was written.',
  };
}

// ── module3_build_all ─────────────────────────────────────────────────────────

export async function module3BuildAll(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_build_all', message: 'Project ID required' };
  const actorId = commandActor(ctx);
  if (actorId === null) return refusedWithoutActor('module3_build_all');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    /* The ONE composition and persistence the compile route uses
       (services/cmc/module3-compile): core sections, emittable 3.2.A
       appendices and 3.2.R; row, lineage and provenance per section. This
       handler used to compose the core only and write its own upsert with no
       provenance event. */
    const { sources: sourceObjects, sections: compiled } = await composeProjectModule3(client, orgId, projectId);

    if (sourceObjects.length === 0) {
      await client.query('ROLLBACK');
      /* A build that composed nothing is a refusal, not a success. Reported as
         `success: true` with `compiledCount: 0` it reads to the caller — and to
         the assistant relaying it — as a completed build of an empty Module 3,
         which is the fabricated readiness this codebase forbids. The
         single-section path (module3BuildSection) already refuses on the same
         condition; this is the same answer in the same words. */
      return { success: false, action: 'module3_build_all', message: `No canonical source objects for this project — nothing to build from. ${NO_CANONICAL_SOURCES_REMEDY}` };
    }

    for (const section of compiled) {
      await persistComposedSection(client, orgId, projectId, section, { actorId: String(actorId), event: 'compiled' });
    }
    await client.query('COMMIT');

    // Bridge to governed artifacts
    const bridged: Array<{ sectionKey: string; artifactId: string; isNew: boolean }> = [];
    for (const section of compiled) {
      try {
        const result = await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
          narrativeDraft: section.narrativeDraft,
          tables: section.tables,
          completeness: section.completeness,
          missingInputs: section.missingInputs,
          lineage: section.lineage,
        }, { createdById: actorId });
        if (result.bridged) bridged.push({ sectionKey: section.sectionKey, artifactId: result.artifactId, isNew: result.isNew });
      } catch { /* non-fatal */ }
    }

    const withData = compiled.filter(s => s.lineage.length > 0);
    const empty = compiled.filter(s => s.lineage.length === 0);

    const sectionSummaryLines = compiled
      .filter(s => s.lineage.length > 0)
      .map(s => {
        const b = bridged.find(br => br.sectionKey === s.sectionKey);
        return `- **${s.sectionKey}**: ${s.completeness}% complete${s.missingInputs.length > 0 ? ` (missing: ${s.missingInputs.join(', ')})` : ''}${b ? ` → artifact ready` : ''}`;
      });
    const summaryBlock = sectionSummaryLines.length > 0 ? `\n\n${sectionSummaryLines.join('\n')}` : '';
    const navHint = bridged.length > 0 ? `\n\nOpen the **M3 Build** inspector in the editor ribbon or click any Module 3 section in the dossier tree to view governed artifacts.` : '';

    return {
      success: true,
      action: 'module3_build_all',
      message: `Compiled ${compiled.length} Module 3 subsections. ${withData.length} have source data, ${empty.length} are empty. ${bridged.length} bridged to governed artifacts.${summaryBlock}${navHint}`,
      data: {
        compiledCount: compiled.length,
        withDataCount: withData.length,
        emptyCount: empty.length,
        bridgedCount: bridged.length,
        bridgedArtifacts: bridged,
        sections: compiled.map(s => {
          const b = bridged.find(br => br.sectionKey === s.sectionKey);
          return {
            sectionKey: s.sectionKey,
            completeness: s.completeness,
            missingInputs: s.missingInputs,
            sourceCount: s.lineage.length,
            artifactId: b?.artifactId ?? null,
          };
        }),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    return anaCompositionRefusal(err, 'module3_build_all', `Build failed: ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

// ── module3_build_section ─────────────────────────────────────────────────────

export async function module3BuildSection(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  const sectionKey = params.sectionKey as string;
  if (!projectId || !sectionKey) return { success: false, action: 'module3_build_section', message: 'Project ID and sectionKey required (e.g. 3.2.S.4)' };
  const actorId = commandActor(ctx);
  if (actorId === null) return refusedWithoutActor('module3_build_section');

  /* Composed and persisted through the one service the compile route uses
     — row, lineage and provenance in one transaction. */
  const client = await pool.connect();
  let section: ComposedSection | undefined;
  try {
    await client.query('BEGIN');
    const { sources, sections: allComposed } = await composeProjectModule3(client, orgId, projectId);
    if (sources.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, action: 'module3_build_section', message: `No canonical source objects for this project — nothing to build from. ${NO_CANONICAL_SOURCES_REMEDY}` };
    }
    section = allComposed.find(s => s.sectionKey === sectionKey);
    if (!section) {
      await client.query('ROLLBACK');
      return { success: false, action: 'module3_build_section', message: `Section ${sectionKey} is not composable from this project's sources (no composition rule, or no recorded region for a regional section).` };
    }
    await persistComposedSection(client, orgId, projectId, section, { actorId: String(actorId), event: 'compiled' });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (refusedByCompositionScope(err)) return anaCompositionRefusal(err, 'module3_build_section', '');
    throw err;
  } finally {
    client.release();
  }
  if (!section) return { success: false, action: 'module3_build_section', message: `Section ${sectionKey} was not built.` };

  // Bridge to governed artifact
  let bridgedArtifact: { artifactId: string; isNew: boolean } | null = null;
  try {
    const result = await bridgeCompileToArtifact(orgId, projectId, sectionKey, {
      narrativeDraft: section.narrativeDraft,
      tables: section.tables,
      completeness: section.completeness,
      missingInputs: section.missingInputs,
      lineage: section.lineage,
    }, { createdById: actorId });
    if (result.bridged) bridgedArtifact = { artifactId: result.artifactId, isNew: result.isNew };
  } catch { /* non-fatal */ }

  const missingLine = section.missingInputs.length > 0 ? `\n\nMissing inputs: ${section.missingInputs.join(', ')}` : '';
  const navLine = bridgedArtifact ? `\n\nClick **${sectionKey}** in the dossier tree to open the governed artifact, or use the **M3 Build** inspector in the editor ribbon.` : '';

  return {
    success: true,
    action: 'module3_build_section',
    message: `Built section **${sectionKey}** — ${section.completeness}% complete.${bridgedArtifact ? ` Governed artifact created.` : ''}${missingLine}${navLine}`,
    data: { sectionKey, completeness: section.completeness, missingInputs: section.missingInputs, bridgedArtifact, artifactId: bridgedArtifact?.artifactId ?? null },
  };
}

/**
 * The build status, or the composition boundary's refusal as this command's
 * answer. getModule3BuildStatus refuses a program outside the boundary
 * (decision P-28) rather than score it on small-molecule rules, and the
 * assistant relays the reason instead of reporting a tool failure.
 */
async function buildStatusFor(
  action: string,
  orgId: number,
  projectId: string,
): Promise<{ statuses: Awaited<ReturnType<typeof getModule3BuildStatus>>['sections'] } | { refused: CommandResult }> {
  try {
    return { statuses: (await getModule3BuildStatus(orgId, projectId)).sections };
  } catch (err) {
    if (refusedByCompositionScope(err)) return { refused: anaCompositionRefusal(err, action, '') };
    throw err;
  }
}

// ── module3_missing_inputs ────────────────────────────────────────────────────

export async function module3MissingInputs(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_missing_inputs', message: 'Project ID required' };

  const status = await buildStatusFor('module3_missing_inputs', orgId, projectId);
  if ('refused' in status) return status.refused;
  const { statuses } = status;
  const withMissing = statuses.filter(s => s.missingInputs.length > 0);

  if (withMissing.length === 0) {
    return { success: true, action: 'module3_missing_inputs', message: 'All Module 3 subsections have complete input data.', data: { sections: [] } };
  }

  const lines = withMissing.map(s => `- **${s.sectionKey}** (${s.sectionLabel}): missing ${s.missingInputs.join(', ')}`);
  return {
    success: true,
    action: 'module3_missing_inputs',
    message: `${withMissing.length} Module 3 subsections have missing inputs:\n${lines.join('\n')}`,
    data: { sections: withMissing.map(s => ({ sectionKey: s.sectionKey, label: s.sectionLabel, missingInputs: s.missingInputs })) },
  };
}

// ── module3_stale_sections ────────────────────────────────────────────────────

export async function module3StaleSections(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_stale_sections', message: 'Project ID required' };

  const status = await buildStatusFor('module3_stale_sections', orgId, projectId);
  if ('refused' in status) return status.refused;
  const { statuses } = status;
  const stale = statuses.filter(s => s.isStale);

  if (stale.length === 0) {
    return { success: true, action: 'module3_stale_sections', message: 'No stale Module 3 sections.', data: { sections: [] } };
  }

  const lines = stale.map(s => `- **${s.sectionKey}** (${s.sectionLabel}): ${s.staleReason || 'source data changed'}`);
  return {
    success: true,
    action: 'module3_stale_sections',
    message: `${stale.length} Module 3 sections are stale:\n${lines.join('\n')}`,
    data: { sections: stale.map(s => ({ sectionKey: s.sectionKey, label: s.sectionLabel, staleReason: s.staleReason })) },
  };
}

// ── module3_refresh_stale ─────────────────────────────────────────────────────

/** Bridge each refreshed section to its governed artifact; the sections that could not be, with why. */
async function bridgeRefreshedSections(
  orgId: number,
  projectId: string,
  sections: ComposedSection[],
  actorId: number,
): Promise<string[]> {
  const skips: string[] = [];
  for (const section of sections) {
    try {
      await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
        narrativeDraft: section.narrativeDraft,
        tables: section.tables,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        lineage: section.lineage,
      }, { createdById: actorId });
    } catch (err) {
      skips.push(`${section.sectionKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return skips;
}

export async function module3RefreshStale(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_refresh_stale', message: 'Project ID required' };
  const actorId = commandActor(ctx);
  if (actorId === null) return refusedWithoutActor('module3_refresh_stale');

  const status = await buildStatusFor('module3_refresh_stale', orgId, projectId);
  if ('refused' in status) return status.refused;
  const { statuses } = status;
  const stale = statuses.filter(s => s.isStale);
  if (stale.length === 0) {
    return { success: true, action: 'module3_refresh_stale', message: 'No stale sections to refresh.' };
  }

  /* The ONE composition and persistence the compile and refresh routes use
     (services/cmc/module3-compile): row, lineage rewritten to the sources
     read, provenance event — this handler used to run its own UPDATE with
     none of that, leaving lineage pointing at the previous compile. */
  const client = await pool.connect();
  const staleKeys = new Set(stale.map(s => s.sectionKey));
  const refreshed: string[] = [];
  const toBridge: ComposedSection[] = [];
  try {
    await client.query('BEGIN');
    const { sources, sections: allComposed } = await composeProjectModule3(client, orgId, projectId);
    if (sources.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, action: 'module3_refresh_stale', message: 'No canonical source objects for this project — there is nothing to refresh from.' };
    }
    for (const section of allComposed) {
      if (!staleKeys.has(section.sectionKey)) continue;
      await persistComposedSection(client, orgId, projectId, section, { actorId: String(actorId), event: 'refreshed' });
      refreshed.push(section.sectionKey);
      toBridge.push(section);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return anaCompositionRefusal(err, 'module3_refresh_stale', `Refresh failed and nothing was written: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    client.release();
  }
  const bridgeSkips = await bridgeRefreshedSections(orgId, projectId, toBridge, actorId);

  return {
    success: true,
    action: 'module3_refresh_stale',
    message:
      `Refreshed ${refreshed.length} stale sections: ${refreshed.join(', ')}` +
      (bridgeSkips.length > 0
        ? `\n\n${bridgeSkips.length} governed artifact(s) could not be updated: ${bridgeSkips.join('; ')}.`
        : '\n\nGoverned artifacts updated. Click any refreshed section in the dossier tree to review.'),
    data: { refreshedSections: refreshed, artifactBridgeSkips: bridgeSkips },
  };
}

// ── module3_readiness ─────────────────────────────────────────────────────────

export async function module3Readiness(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_readiness', message: 'Project ID required' };

  /* The ONE final-export gate (services/cmc/final-export-gate). This command
     used to count approvals, stale flags and critical contradictions itself
     and say "Export READY" when they cleared, while the gate also refuses on
     source drift, superseded Vault evidence, missing lineage, incomplete or
     unplaceable approved sections and the governed-decision fabric. AnA told a
     user Module 3 was ready when export and placement then refused. */
  const verdict = await evaluateFinalExportGate({ orgId, projectId, actorId: String(ctx.userId) });
  const { totalSections: total, approvedSections: approved, staleSections: stale, openCriticalContradictions: openCritical } = verdict.data;
  const exportReady = verdict.allowed;

  const blockers: string[] = [];
  if (stale > 0) blockers.push(`${stale} stale section${stale > 1 ? 's' : ''} — use **/m3 refresh** to recompile`);
  if (openCritical > 0) blockers.push(`${openCritical} unresolved critical contradiction${openCritical > 1 ? 's' : ''} — use **/m3 contradictions** to review`);
  if (approved < total) blockers.push(`${total - approved} section${total - approved > 1 ? 's' : ''} not yet approved`);
  const blockerBlock = exportBlockerBlock(verdict, blockers);

  return {
    success: true,
    action: 'module3_readiness',
    message: `**Module 3 Readiness:** ${approved}/${total} sections approved, ${stale} stale, ${openCritical} critical contradictions. Export ${exportReady ? '**READY**' : '**BLOCKED**'}.${blockerBlock}`,
    data: { totalSections: total, approvedSections: approved, staleSections: stale, openCriticalContradictions: openCritical, exportReady, blockedBecause: verdict.error ?? null },
  };
}

/** The gate's own sentence first, then the command hints that apply. */
function exportBlockerBlock(verdict: FinalExportGateVerdict, hints: string[]): string {
  if (verdict.allowed) return '';
  const lines = [`Export gate: ${verdict.error ?? 'final export is refused'}`, ...hints];
  return `\n\n**Blockers:**\n${lines.map(b => `- ${b}`).join('\n')}`;
}

// ── module3_contradictions ────────────────────────────────────────────────────

export async function module3Contradictions(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_contradictions', message: 'Project ID required' };

  /* The ONE tenant-scoped register sweep (services/cmc/contradiction-registers).
     This ran here as five inline queries filtered by project_id ALONE — the
     caller supplies the project id, so any organization could read another
     sponsor's specifications, batches and comparability assessments through it.
     Two of the five also selected columns these tables do not have
     (analytical_methods.method_name, stability_studies.study_name), so on a
     provisioned database the sweep raised rather than returning rows. */
  const registers = await readContradictionRegisters(pool, { organizationId: orgId, projectId });

  const contradictions = detectContradictions(registers);

  if (contradictions.length === 0) {
    return { success: true, action: 'module3_contradictions', message: 'No contradictions detected in Module 3 data.', data: { contradictions: [] } };
  }

  const lines = contradictions.map(c => `- **${c.contradictionType}** (${c.severity}): ${c.details} → impacts ${c.impactedSections.join(', ')}`);
  return {
    success: true,
    action: 'module3_contradictions',
    message: `${contradictions.length} contradictions detected:\n${lines.join('\n')}`,
    data: { contradictions, impactTasks: deriveImpactTasks(contradictions) },
  };
}

// ── module3_lineage ───────────────────────────────────────────────────────────

export async function module3Lineage(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  const sectionKey = params.sectionKey as string;
  if (!projectId || !sectionKey) return { success: false, action: 'module3_lineage', message: 'Project ID and sectionKey required' };

  const sectionRes = await pool.query(
    `SELECT id FROM cmc_module3_sections WHERE organization_id=$1 AND project_id=$2 AND section_key=$3`,
    [orgId, projectId, sectionKey]
  );
  if (sectionRes.rows.length === 0) {
    return { success: true, action: 'module3_lineage', message: `Section ${sectionKey} has not been compiled yet.`, data: { sources: [] } };
  }

  const lineageRes = await pool.query(
    `SELECT sl.source_hash_at_compile, so.source_type as "sourceType", so.source_key as "sourceKey", so.source_hash as "currentHash"
     FROM cmc_section_lineage sl JOIN cmc_source_objects so ON so.id = sl.source_object_id
     WHERE sl.section_id = $1`,
    [sectionRes.rows[0].id]
  );

  const drifted = lineageRes.rows.filter((r: any) => r.source_hash_at_compile !== r.currentHash);
  return {
    success: true,
    action: 'module3_lineage',
    message: `Section ${sectionKey} has ${lineageRes.rows.length} source inputs. ${drifted.length > 0 ? `${drifted.length} sources have changed since last compile (stale).` : 'All sources are current.'}`,
    data: { sectionKey, sources: lineageRes.rows, driftedCount: drifted.length },
  };
}

// ── cmc_status ────────────────────────────────────────────────────────────────
//
// Single-call CMC status for a project. Combines source-object inventory,
// section approval state, stale counts, and open contradictions in one
// message — what a CMC lead wants to see when the user types `/cmc` with
// no further arguments.

export async function cmcStatus(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'cmc_status', message: 'Project ID required' };

  // Section counts and the export verdict come from the ONE final-export gate,
  // as in module3Readiness above; the inventory and high-severity count are
  // this command's own reads.
  const [sourcesRes, contradictionsRes, verdict] = await Promise.all([
    pool.query(
      `SELECT source_type AS "sourceType", COUNT(*)::int AS "count"
       FROM cmc_source_objects
       WHERE organization_id = $1 AND project_id = $2
       GROUP BY source_type`,
      [orgId, projectId],
    ),
    pool.query(
      `SELECT severity, status
       FROM cmc_contradictions
       WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId],
    ),
    evaluateFinalExportGate({ orgId, projectId, actorId: String(ctx.userId) }),
  ]);

  const sourceTypeBreakdown: Record<string, number> = {};
  let totalSources = 0;
  for (const row of sourcesRes.rows) {
    const t = String(row.sourceType ?? 'unknown');
    const n = Number(row.count ?? 0);
    sourceTypeBreakdown[t] = n;
    totalSources += n;
  }

  const { totalSections, approvedSections, staleSections, openCriticalContradictions: openCritical } = verdict.data;
  const openHigh = contradictionsRes.rows.filter(
    (r: any) => r.status !== 'resolved' && r.status !== 'closed' && r.severity === 'high',
  ).length;
  const exportReady = verdict.allowed;

  const sourceLines = totalSources === 0
    ? '_No CMC source objects uploaded._'
    : Object.entries(sourceTypeBreakdown)
        .map(([t, n]) => `- ${t}: ${n}`)
        .join('\n');

  const blockerLines: string[] = [];
  if (staleSections > 0) blockerLines.push(`${staleSections} stale section${staleSections > 1 ? 's' : ''} — \`/m3 refresh\` to recompile`);
  if (openCritical > 0) blockerLines.push(`${openCritical} unresolved critical contradiction${openCritical > 1 ? 's' : ''} — \`/m3 contradictions\` to review`);
  if (openHigh > 0) blockerLines.push(`${openHigh} unresolved high-severity contradiction${openHigh > 1 ? 's' : ''}`);
  if (totalSections > 0 && approvedSections < totalSections) {
    blockerLines.push(`${totalSections - approvedSections} section${totalSections - approvedSections > 1 ? 's' : ''} not yet approved`);
  }
  const blockerBlock = exportBlockerBlock(verdict, blockerLines);

  const message =
    `**CMC status**\n` +
    `Sources (${totalSources}):\n${sourceLines}\n\n` +
    `Module 3 sections: ${approvedSections}/${totalSections} approved, ${staleSections} stale\n` +
    `Open contradictions: ${openCritical} critical, ${openHigh} high\n\n` +
    `Module 3 export: ${exportReady ? '**READY**' : '**BLOCKED**'}` +
    blockerBlock;

  return {
    success: true,
    action: 'cmc_status',
    message,
    data: {
      totalSources,
      sourceTypeBreakdown,
      totalSections,
      approvedSections,
      staleSections,
      openCritical,
      openHigh,
      exportReady,
      blockedBecause: verdict.error ?? null,
    },
  };
}

// ── module3_classify_source ───────────────────────────────────────────────────

const PROGRAM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The classification's tracks, by the registry id a recorded type resolves to. */
const TRACK_BY_REGISTRY_ID: Partial<Record<string, DossierUploadClassification['submissionTrack']>> = {
  US_IND: 'IND',
  US_NDA: 'NDA',
  US_BLA: 'BLA',
  US_510K: '510K',
  US_PMA: 'PMA',
  EU_CER: 'CER',
};

/**
 * The submission type the project records: a program's own `program_type` (by
 * its uuid, or through a legacy projects.id anchored to one), else a legacy
 * project's `metadata.submissionType`. `found: false` when the id is no program
 * or project of this organization.
 */
async function recordedSubmissionType(
  orgId: number,
  projectId: string,
): Promise<{ found: boolean; type: string | null }> {
  const pool = getPool();
  if (PROGRAM_ID_RE.test(projectId)) {
    const { rows } = await pool.query(
      `SELECT program_type FROM regulatory_programs
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [projectId, orgId],
    );
    if (rows.length === 0) return { found: false, type: null };
    return { found: true, type: String(rows[0].program_type ?? '').trim() || null };
  }
  const id = /^\d+$/.test(projectId) ? Number(projectId) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) return { found: false, type: null };
  const { rows } = await pool.query(
    `SELECT rp.program_type, p.metadata
       FROM projects p
       LEFT JOIN regulatory_programs rp
         ON rp.id = p.regulatory_program_id AND rp.organization_id = p.organization_id
        AND rp.deleted_at IS NULL
      WHERE p.id = $1 AND p.organization_id = $2`,
    [id, orgId],
  );
  if (rows.length === 0) return { found: false, type: null };
  const meta = (rows[0].metadata ?? {}) as Record<string, unknown>;
  const type = rows[0].program_type || meta.submissionType || meta.submission_type;
  return { found: true, type: String(type ?? '').trim() || null };
}

export async function module3ClassifySource(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  const artifactId = params.artifactId as string;
  const sourceType = params.sourceType as string;
  const ctdSection = (params.ctdSection as string) || null;
  if (!projectId || !artifactId || !sourceType) {
    return { success: false, action: 'module3_classify_source', message: 'Project ID, artifactId, and sourceType required' };
  }
  const actorId = commandActor(ctx);
  if (actorId === null) return refusedWithoutActor('module3_classify_source');

  /* 2026-10-15: every source was classified under submissionTrack 'IND',
     whatever the program files, and that track was written into the source
     payload and its provenance event. It is the recorded one, or the command
     is refused. */
  const recorded = await recordedSubmissionType(orgId, String(projectId).trim());
  if (!recorded.found) {
    return {
      success: false,
      action: 'module3_classify_source',
      message: `${projectId} is not a program or project of this organization, so its submission track is not established; nothing was classified.`,
    };
  }
  const registryId = recorded.type ? resolveToRegistryId(recorded.type) : null;
  const submissionTrack = registryId ? TRACK_BY_REGISTRY_ID[registryId] : undefined;
  if (!submissionTrack) {
    return {
      success: false,
      action: 'module3_classify_source',
      message: recorded.type
        ? `This program records its application as "${recorded.type}", which the Module 3 source classification ` +
          'has no track for (it carries IND, NDA, BLA, 510(k), PMA and CER); nothing was classified.'
        : 'This project records no submission type, so the track to classify the source under is not established; ' +
          'nothing was classified. Record its submission type, then classify again.',
    };
  }

  const result = await classifyAndMapArtifactToSource(orgId, projectId, artifactId, {
    submissionTrack,
    dossierModule: '3',
    ctdSection,
    sourceType: sourceType as any,
    useAsModule3Source: true,
    tags: [],
  }, { actorUserId: actorId });

  return {
    success: true,
    action: 'module3_classify_source',
    message: `Artifact ${artifactId} classified as ${sourceType} source${ctdSection ? ` for ${ctdSection}` : ''}.`,
    data: result,
  };
}
