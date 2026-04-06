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
import { composeModule3FromCanonicalSources, impactedSectionsForSourceType } from '../module3Composer';
import { createSourceHash } from '../cmc-module3-compiler';
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

    const { rows: sourceObjects } = await client.query(
      `SELECT id, source_type as "sourceType", source_payload as "sourcePayload", source_hash as "sourceHash"
       FROM cmc_source_objects WHERE organization_id = $1 AND project_id = $2 ORDER BY updated_at DESC`,
      [orgId, projectId]
    );

    if (sourceObjects.length === 0) {
      await client.query('ROLLBACK');
      return { success: true, action: 'module3_build_all', message: 'No source objects found. Upload and classify source documents first.', data: { compiledCount: 0 } };
    }

    const compiled = composeModule3FromCanonicalSources(sourceObjects as any);

    for (const section of compiled) {
      await client.query(
        `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,false,null,'draft')
         ON CONFLICT (project_id, section_key)
         DO UPDATE SET deterministic_json = excluded.deterministic_json, compiled_hash = excluded.compiled_hash, stale = false, stale_reason = null, narrative_text = excluded.narrative_text, updated_at = now()
         RETURNING id`,
        [orgId, projectId, section.sectionKey, section.sectionPath,
         JSON.stringify({ ...section.structuredPayload, completeness: section.completeness, missingInputs: section.missingInputs }),
         section.narrativeDraft, createSourceHash(section.structuredPayload)]
      );
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
        });
        if (result) bridged.push({ sectionKey: section.sectionKey, artifactId: result.artifactId, isNew: result.isNew });
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

  const { rows: sourceObjects } = await pool.query(
    `SELECT id, source_type as "sourceType", source_payload as "sourcePayload", source_hash as "sourceHash"
     FROM cmc_source_objects WHERE organization_id = $1 AND project_id = $2`,
    [orgId, projectId]
  );

  const allComposed = composeModule3FromCanonicalSources(sourceObjects as any);
  const section = allComposed.find(s => s.sectionKey === sectionKey);
  if (!section) return { success: false, action: 'module3_build_section', message: `Section ${sectionKey} not found in composition rules` };

  // Upsert compiled section
  await pool.query(
    `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, approval_state)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,false,'draft')
     ON CONFLICT (project_id, section_key)
     DO UPDATE SET deterministic_json = excluded.deterministic_json, compiled_hash = excluded.compiled_hash, stale = false, stale_reason = null, narrative_text = excluded.narrative_text, updated_at = now()`,
    [orgId, projectId, section.sectionKey, section.sectionPath,
     JSON.stringify({ ...section.structuredPayload, completeness: section.completeness, missingInputs: section.missingInputs }),
     section.narrativeDraft, createSourceHash(section.structuredPayload)]
  );

  // Bridge to governed artifact
  let bridgedArtifact: { artifactId: string; isNew: boolean } | null = null;
  try {
    bridgedArtifact = await bridgeCompileToArtifact(orgId, projectId, sectionKey, {
      narrativeDraft: section.narrativeDraft,
      tables: section.tables,
      completeness: section.completeness,
      missingInputs: section.missingInputs,
      lineage: section.lineage,
    });
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

  const statuses = await getModule3BuildStatus(orgId, projectId);
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

  const statuses = await getModule3BuildStatus(orgId, projectId);
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

  const statuses = await getModule3BuildStatus(orgId, projectId);
  const stale = statuses.filter(s => s.isStale);
  if (stale.length === 0) {
    return { success: true, action: 'module3_refresh_stale', message: 'No stale sections to refresh.' };
  }

  // Full recompile from current sources
  const { rows: sourceObjects } = await pool.query(
    `SELECT id, source_type as "sourceType", source_payload as "sourcePayload", source_hash as "sourceHash"
     FROM cmc_source_objects WHERE organization_id = $1 AND project_id = $2`,
    [orgId, projectId]
  );

  const allComposed = composeModule3FromCanonicalSources(sourceObjects as any);
  const staleKeys = new Set(stale.map(s => s.sectionKey));
  const refreshed: string[] = [];

  for (const section of allComposed) {
    if (!staleKeys.has(section.sectionKey)) continue;
    await pool.query(
      `UPDATE cmc_module3_sections SET deterministic_json = $1::jsonb, narrative_text = $2, compiled_hash = $3, stale = false, stale_reason = null, approval_state = 'draft', updated_at = now()
       WHERE organization_id = $4 AND project_id = $5 AND section_key = $6`,
      [JSON.stringify({ ...section.structuredPayload, completeness: section.completeness, missingInputs: section.missingInputs }),
       section.narrativeDraft, createSourceHash(section.structuredPayload), orgId, projectId, section.sectionKey]
    );
    try {
      await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
        narrativeDraft: section.narrativeDraft,
        tables: section.tables,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        lineage: section.lineage,
      });
    } catch { /* non-fatal */ }
    refreshed.push(section.sectionKey);
  }

  return {
    success: true,
    action: 'module3_refresh_stale',
    message: `Refreshed ${refreshed.length} stale sections: ${refreshed.join(', ')}\n\nGoverned artifacts updated. Click any refreshed section in the dossier tree to review.`,
    data: { refreshedSections: refreshed },
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
