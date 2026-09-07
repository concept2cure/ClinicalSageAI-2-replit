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
import {
  composeAllSections,
  composePassFailureMessage,
  composeSingleSection,
  failedPassForSectionKey,
  loadCanonicalSources,
  persistComposedSection,
  type ComposePassSkip,
  NO_CANONICAL_SOURCES_ERROR,
  NO_CANONICAL_SOURCES_HINT,
} from '../cmc/module3-section-recompose';
import { bridgeCompileToArtifact, classifyAndMapArtifactToSource, getModule3BuildStatus } from '../module3-convergence-service';
import { detectContradictions, deriveImpactTasks } from '../cmc-impact-contradiction-engine';
import { readContradictionRegisters } from '../cmc/contradiction-registers';

interface CommandContext {
  userId: number;
  organizationId: number;
  activeProjectId?: number;
}

interface CommandResult {
  success: boolean;
  action: string;
  message: string;
  data?: unknown;
}

/**
 * Composition passes that could not run are SAID, not hidden behind a shorter
 * section list — the chat reply is the only place an AnA user would learn that
 * the appendix or regional sections were not composed.
 */
function skippedPassNote(skipped: ComposePassSkip[]): string {
  if (skipped.length === 0) return '';
  return `\n\n_Not composed:_ ${skipped.map(s => `${s.pass} pass (${s.reason})`).join('; ')}`;
}

// ── module3_build_all ─────────────────────────────────────────────────────────

export async function module3BuildAll(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_build_all', message: 'Project ID required' };

  /* Load and compose through the ONE canonical implementation the compile
     route, /build-section and the refresh paths use
     (services/cmc/module3-section-recompose). This handler carried its own copy
     of the compose+persist body: it never wrote the 'compiled' provenance event
     the API compile route writes (so an AnA build left no trace), and it never
     composed the 3.2.A / 3.2.R sections the shared composition emits.

     Reading and composing happen OUTSIDE the write transaction: composition's
     regional pass is best-effort, and a failed statement inside a transaction
     aborts it — the upserts would then fail with "current transaction is
     aborted" and bury the real cause. */
  const sourceObjects = await loadCanonicalSources(pool, orgId, projectId);

  /* Fail closed rather than writing 17 clean-but-empty sections with
     stale = false over whatever was there — the same refusal the compile route,
     /build-section and refresh-stale make. This branch used to answer
     `success: true`, which reported "nothing was built" as a completed build. */
  if (sourceObjects.length === 0) {
    return {
      success: false,
      action: 'module3_build_all',
      message: `${NO_CANONICAL_SOURCES_ERROR} ${NO_CANONICAL_SOURCES_HINT}`,
      data: { compiledCount: 0 },
    };
  }

  const { sections: compiled, skipped } = await composeAllSections(pool, orgId, projectId, sourceObjects);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const section of compiled) {
      /* Building does NOT reset approval_state — un-approving on new content is
         the refresh path's job, at parity with the API compile route. */
      await persistComposedSection(client, {
        orgId,
        projectId,
        section,
        actorId: ctx.userId ?? null,
        eventType: 'compiled',
        resetApprovalToDraft: false,
        eventPayloadExtra: { trigger: 'ana-build-all' },
      });
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
        }, { createdById: ctx.userId ?? null });
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
      message: `Compiled ${compiled.length} Module 3 subsections. ${withData.length} have source data, ${empty.length} are empty. ${bridged.length} bridged to governed artifacts.${skippedPassNote(skipped)}${summaryBlock}${navHint}`,
      data: {
        compiledCount: compiled.length,
        withDataCount: withData.length,
        emptyCount: empty.length,
        bridgedCount: bridged.length,
        bridgedArtifacts: bridged,
        skippedPasses: skipped,
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
    return { success: false, action: 'module3_build_all', message: `Build failed: ${(err as Error).message}` };
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

  /* Load, compose and persist through the ONE canonical implementation
     (services/cmc/module3-section-recompose) that compile, /build-section,
     refresh and refresh-stale use. This handler carried its own copy: it wrote
     no provenance event, and it composed only the core sections, so the 3.2.A /
     3.2.R keys the shared composition emits could never be built here.

     Reading and composing happen outside the write transaction — composition's
     best-effort regional read must not be able to abort it. */
  const sourceObjects = await loadCanonicalSources(pool, orgId, projectId);

  // Same fail-closed refusal as every other build path: composing from zero
  // sources yields a clean-but-empty section written with stale = false.
  if (sourceObjects.length === 0) {
    return {
      success: false,
      action: 'module3_build_section',
      message: `${NO_CANONICAL_SOURCES_ERROR} ${NO_CANONICAL_SOURCES_HINT}`,
    };
  }

  const { section, skipped } = await composeSingleSection(pool, orgId, projectId, sectionKey, sourceObjects);
  if (!section) {
    // A pass that could not RUN is our error, not a finding that the section
    // does not apply to this dossier.
    const failedPass = failedPassForSectionKey(sectionKey, skipped);
    return {
      success: false,
      action: 'module3_build_section',
      message: failedPass
        ? composePassFailureMessage(sectionKey, failedPass)
        : `Section ${sectionKey} not found in composition rules`,
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    /* Building does NOT reset approval_state, at parity with the API routes. */
    await persistComposedSection(client, {
      orgId,
      projectId,
      section,
      actorId: ctx.userId ?? null,
      eventType: 'compiled',
      resetApprovalToDraft: false,
      eventPayloadExtra: { trigger: 'ana-build-section' },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  // Bridge to governed artifact
  let bridgedArtifact: { artifactId: string; isNew: boolean } | null = null;
  try {
    const result = await bridgeCompileToArtifact(orgId, projectId, sectionKey, {
      narrativeDraft: section.narrativeDraft,
      tables: section.tables,
      completeness: section.completeness,
      missingInputs: section.missingInputs,
      lineage: section.lineage,
    }, { createdById: ctx.userId ?? null });
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

// ── module3_missing_inputs ────────────────────────────────────────────────────

export async function module3MissingInputs(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_missing_inputs', message: 'Project ID required' };

  const { sections: statuses } = await getModule3BuildStatus(orgId, projectId);
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

  const { sections: statuses } = await getModule3BuildStatus(orgId, projectId);
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

export async function module3RefreshStale(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_refresh_stale', message: 'Project ID required' };

  const { sections: statuses } = await getModule3BuildStatus(orgId, projectId);
  const stale = statuses.filter(s => s.isStale);
  if (stale.length === 0) {
    return { success: true, action: 'module3_refresh_stale', message: 'No stale sections to refresh.' };
  }

  /* Full recompile from current sources, through the ONE canonical
     implementation the compile route, /build-section and the refresh endpoint
     also use (services/cmc/module3-section-recompose). This handler used to
     carry its own copy of the compose+persist body: a bare UPDATE that wrote
     deterministic_json/narrative_text/compiled_hash but left cmc_section_lineage
     pointing at the sources of the PREVIOUS compile and recorded no provenance
     event, so a section could be refreshed with no trace of it having happened.
     Composition now also covers the 3.2.A and 3.2.R sections the compile route
     can create, which this copy could never refresh. */
  const sourceObjects = await loadCanonicalSources(pool, orgId, projectId);

  // Fail closed rather than composing clean-but-empty bodies over stale ones —
  // the same refusal the compile route and the refresh endpoint make.
  if (sourceObjects.length === 0) {
    return {
      success: false,
      action: 'module3_refresh_stale',
      message: `${NO_CANONICAL_SOURCES_ERROR} ${NO_CANONICAL_SOURCES_HINT}`,
    };
  }

  const { sections: allComposed, skipped } = await composeAllSections(pool, orgId, projectId, sourceObjects);
  const staleKeys = new Set(stale.map(s => s.sectionKey));
  const toRefresh = allComposed.filter(section => staleKeys.has(section.sectionKey));

  /* One transaction for the whole refresh. persistComposedSection DELETEs the
     section's cmc_section_lineage rows before re-inserting them; on a bare pool
     those statements can land on different pooled connections and nothing rolls
     back, so a failure after the DELETE would leave a section with no lineage at
     all — the traceability this path exists to keep correct, silently dropped. */
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const section of toRefresh) {
      // Refreshing replaces content, so approval drops back to draft — the
      // behaviour this handler already had, kept explicit as a parameter.
      await persistComposedSection(client, {
        orgId,
        projectId,
        section,
        actorId: ctx.userId ?? null,
        eventType: 'refreshed',
        resetApprovalToDraft: true,
        eventPayloadExtra: { trigger: 'ana-refresh-stale' },
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return {
      success: false,
      action: 'module3_refresh_stale',
      message: `Refresh failed, nothing was written: ${(err as Error).message}`,
    };
  } finally {
    client.release();
  }

  // Bridging is post-commit and non-fatal, as on every other build path.
  const refreshed: string[] = [];
  for (const section of toRefresh) {
    try {
      await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
        narrativeDraft: section.narrativeDraft,
        tables: section.tables,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        lineage: section.lineage,
      }, { createdById: ctx.userId ?? null });
    } catch { /* non-fatal */ }
    refreshed.push(section.sectionKey);
  }

  return {
    success: true,
    action: 'module3_refresh_stale',
    message: `Refreshed ${refreshed.length} stale sections: ${refreshed.join(', ')}${skippedPassNote(skipped)}\n\nGoverned artifacts updated. Click any refreshed section in the dossier tree to review.`,
    data: { refreshedSections: refreshed, skippedPasses: skipped },
  };
}

// ── module3_readiness ─────────────────────────────────────────────────────────

export async function module3Readiness(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_readiness', message: 'Project ID required' };

  const [sectionsRes, contradictionsRes] = await Promise.all([
    pool.query(`SELECT approval_state, stale FROM cmc_module3_sections WHERE organization_id=$1 AND project_id=$2`, [orgId, projectId]),
    pool.query(`SELECT severity, status FROM cmc_contradictions WHERE organization_id=$1 AND project_id=$2`, [orgId, projectId]),
  ]);

  const total = sectionsRes.rows.length;
  const approved = sectionsRes.rows.filter((r: any) => r.approval_state === 'approved').length;
  const stale = sectionsRes.rows.filter((r: any) => r.stale).length;
  const openCritical = contradictionsRes.rows.filter((r: any) => r.severity === 'critical' && r.status !== 'resolved').length;
  const exportReady = total > 0 && approved === total && stale === 0 && openCritical === 0;

  const blockers: string[] = [];
  if (stale > 0) blockers.push(`${stale} stale section${stale > 1 ? 's' : ''} — use **/m3 refresh** to recompile`);
  if (openCritical > 0) blockers.push(`${openCritical} unresolved critical contradiction${openCritical > 1 ? 's' : ''} — use **/m3 contradictions** to review`);
  if (approved < total) blockers.push(`${total - approved} section${total - approved > 1 ? 's' : ''} not yet approved`);
  const blockerBlock = blockers.length > 0 ? `\n\n**Blockers:**\n${blockers.map(b => `- ${b}`).join('\n')}` : '';

  return {
    success: true,
    action: 'module3_readiness',
    message: `**Module 3 Readiness:** ${approved}/${total} sections approved, ${stale} stale, ${openCritical} critical contradictions. Export ${exportReady ? '**READY**' : '**BLOCKED**'}.${blockerBlock}`,
    data: { totalSections: total, approvedSections: approved, staleSections: stale, openCriticalContradictions: openCritical, exportReady },
  };
}

// ── module3_contradictions ────────────────────────────────────────────────────

export async function module3Contradictions(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_contradictions', message: 'Project ID required' };

  /* One tenant-scoped sweep, shared with the HTTP surface. These five reads
     used to filter by project_id ALONE — and the project id is caller-supplied,
     on a shared uuid space — so this handler returned another organization's
     registers to whoever asked. The same SQL also selected columns the tables
     do not have (method_name / study_name), so it raised against a provisioned
     database. Both are fixed by there being one implementation. */
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

  const [sourcesRes, sectionsRes, contradictionsRes] = await Promise.all([
    pool.query(
      `SELECT source_type AS "sourceType", COUNT(*)::int AS "count"
       FROM cmc_source_objects
       WHERE organization_id = $1 AND project_id = $2
       GROUP BY source_type`,
      [orgId, projectId],
    ),
    pool.query(
      `SELECT approval_state AS "approvalState", stale
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId],
    ),
    pool.query(
      `SELECT severity, status
       FROM cmc_contradictions
       WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId],
    ),
  ]);

  const sourceTypeBreakdown: Record<string, number> = {};
  let totalSources = 0;
  for (const row of sourcesRes.rows) {
    const t = String(row.sourceType ?? 'unknown');
    const n = Number(row.count ?? 0);
    sourceTypeBreakdown[t] = n;
    totalSources += n;
  }

  const totalSections = sectionsRes.rows.length;
  const approvedSections = sectionsRes.rows.filter((r: any) => r.approvalState === 'approved').length;
  const staleSections = sectionsRes.rows.filter((r: any) => r.stale).length;

  const openContradictions = contradictionsRes.rows.filter(
    (r: any) => r.status !== 'resolved' && r.status !== 'closed',
  );
  const openCritical = openContradictions.filter((r: any) => r.severity === 'critical').length;
  const openHigh = openContradictions.filter((r: any) => r.severity === 'high').length;

  const exportReady = totalSections > 0
    && approvedSections === totalSections
    && staleSections === 0
    && openCritical === 0;

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
  const blockerBlock = blockerLines.length > 0
    ? `\n\n**Blockers:**\n${blockerLines.map(b => `- ${b}`).join('\n')}`
    : '';

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
    },
  };
}

// ── module3_classify_source ───────────────────────────────────────────────────

export async function module3ClassifySource(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  const artifactId = params.artifactId as string;
  const sourceType = params.sourceType as string;
  const ctdSection = (params.ctdSection as string) || null;
  if (!projectId || !artifactId || !sourceType) {
    return { success: false, action: 'module3_classify_source', message: 'Project ID, artifactId, and sourceType required' };
  }

  const result = await classifyAndMapArtifactToSource(orgId, projectId, artifactId, {
    submissionTrack: 'IND',
    dossierModule: '3',
    ctdSection,
    sourceType: sourceType as any,
    useAsModule3Source: true,
    tags: [],
  });

  return {
    success: true,
    action: 'module3_classify_source',
    message: `Artifact ${artifactId} classified as ${sourceType} source${ctdSection ? ` for ${ctdSection}` : ''}.`,
    data: result,
  };
}

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
