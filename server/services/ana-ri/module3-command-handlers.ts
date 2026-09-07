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
import { impactedSectionsForSourceType, type ComposedSection } from '../module3Composer';
import { composeProjectModule3, persistComposedSection } from '../cmc/module3-compile';
import { bridgeCompileToArtifact, classifyAndMapArtifactToSource, getModule3BuildStatus } from '../module3-convergence-service';
import { detectContradictions, deriveImpactTasks } from '../cmc-impact-contradiction-engine';

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

// ── module3_build_all ─────────────────────────────────────────────────────────

export async function module3BuildAll(ctx: CommandContext, params: Record<string, unknown>): Promise<CommandResult> {
  const pool = getPool();
  const orgId = ctx.organizationId;
  const projectId = (params.projectId as string) || String(ctx.activeProjectId || '');
  if (!projectId) return { success: false, action: 'module3_build_all', message: 'Project ID required' };

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
      return { success: true, action: 'module3_build_all', message: 'No source objects found. Upload and classify source documents first.', data: { compiledCount: 0 } };
    }

    for (const section of compiled) {
      await persistComposedSection(client, orgId, projectId, section, { actorId: String(ctx.userId ?? 'system'), event: 'compiled' });
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

  /* Composed and persisted through the one service the compile route uses
     — row, lineage and provenance in one transaction. */
  const client = await pool.connect();
  let section: ComposedSection | undefined;
  try {
    await client.query('BEGIN');
    const { sources, sections: allComposed } = await composeProjectModule3(client, orgId, projectId);
    if (sources.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, action: 'module3_build_section', message: 'No canonical source objects for this project — nothing to build from. Upload and classify source documents first.' };
    }
    section = allComposed.find(s => s.sectionKey === sectionKey);
    if (!section) {
      await client.query('ROLLBACK');
      return { success: false, action: 'module3_build_section', message: `Section ${sectionKey} is not composable from this project's sources (no composition rule, or no recorded region for a regional section).` };
    }
    await persistComposedSection(client, orgId, projectId, section, { actorId: String(ctx.userId ?? 'system'), event: 'compiled' });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
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
      await persistComposedSection(client, orgId, projectId, section, { actorId: String(ctx.userId ?? 'system'), event: 'refreshed' });
      refreshed.push(section.sectionKey);
      toBridge.push(section);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, action: 'module3_refresh_stale', message: `Refresh failed and nothing was written: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    client.release();
  }
  const bridgeSkips: string[] = [];
  for (const section of toBridge) {
    try {
      await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
        narrativeDraft: section.narrativeDraft,
        tables: section.tables,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        lineage: section.lineage,
      }, { createdById: ctx.userId ?? null });
    } catch (err) {
      bridgeSkips.push(`${section.sectionKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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

  const [specs, methods, stability, batch, comparability] = await Promise.all([
    pool.query(`SELECT material_name as "materialName", acceptance_criteria as "acceptanceCriteria" FROM quality_specifications WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT method_name as "methodName", purpose FROM analytical_methods WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT study_name as "studyName", status FROM stability_studies WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT batch_number as "batchNumber", disposition FROM cmc_batch_records WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT assessment_name as "assessmentName", regulatory_risk_level as "regulatoryRiskLevel" FROM cmc_comparability_assessments WHERE project_id = $1`, [projectId]),
  ]);

  const contradictions = detectContradictions({
    specifications: specs.rows, methods: methods.rows, stability: stability.rows,
    batch: batch.rows, comparability: comparability.rows,
  });

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
