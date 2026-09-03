import express from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import {
  markStaleSections,
  summarizeSectionDiff,
  createSourceHash,
} from '../../services/cmc-module3-compiler';
import { composeModule3FromCanonicalSources, impactedSectionsForSourceType } from '../../services/module3Composer';
import { composeAppendices, composeRegional, emittableAppendices } from '../../services/module3-extensions';
import { regionCodeForPrimaryRegion, resolveSubmissionSpine } from '../../services/cmc/submission-spine';
import { detectContradictions, deriveImpactTasks } from '../../services/cmc-impact-contradiction-engine';
import { syncContradictionTasks } from '../../services/cmc/contradiction-tasks';
import { buildCanonicalGovernedState } from '../../services/governed-ana-execution.js';
import { evaluateFinalExportGate } from '../../services/cmc/final-export-gate';
import { placeModule3IntoSubmission } from '../../services/cmc/place-module3-into-submission';
import { bridgeCompileToArtifact } from '../../services/module3-convergence-service';
import { verifyReauth, recordGovernedAction } from '../../routes/c2c/actions';
import {
  persistGovernedActionSignature,
  sha256CanonicalJson,
  BINDING_BASIS,
} from '../../services/part11/signature-persistence';
import { SIGNATURE_MEANINGS, resolveActorUserId } from './governance';
import { serverError } from '../../lib/api-response';
import { createScopedLogger } from '../../utils/logger';

/** The §11.50(a)(3) meanings a signature may carry. */
type SignatureMeaning = (typeof SIGNATURE_MEANINGS)[number];

const router = express.Router();

const logger = createScopedLogger('cmc-module3-os');

const upsertSourceObjectSchema = z.object({
  sourceType: z.enum([
    'drug_substance',
    'drug_product',
    'specification',
    'method',
    'stability',
    'batch',
    'change_control',
    'comparability',
    'manufacturing_process',
    'characterization',
    'reference_standard',
    'container_closure',
    'excipient',
    'qc_result',
  ]),
  sourceKey: z.string().min(1),
  sourcePayload: z.record(z.any()),
  version: z.number().int().positive().optional(),
});

const resolveContradictionSchema = z.object({
  resolutionNote: z.string().min(3),
});

function getOrgId(req: express.Request): number {
  const orgId = parseInt(
    String((req as any).tenantId || (req as any).tenantContext?.organizationId || 0),
    10
  );
  if (!orgId || Number.isNaN(orgId)) throw new Error('Organization context required');
  return orgId;
}


router.post('/source-objects/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");
    const data = upsertSourceObjectSchema.parse(req.body);
    const pool = getPool();
    const sourceHash = createSourceHash(data.sourcePayload as Record<string, any>);
    const version = data.version || 1;

    const inserted = await pool.query(
      `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload, source_hash, version)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
       ON CONFLICT (organization_id, project_id, source_type, source_key, version)
       DO UPDATE SET source_payload = excluded.source_payload, source_hash = excluded.source_hash, updated_at = NOW()
       RETURNING id, source_type as "sourceType", source_key as "sourceKey", source_hash as "sourceHash", version`,
      [orgId, projectId, data.sourceType, data.sourceKey, JSON.stringify(data.sourcePayload), sourceHash, version]
    );

    await pool.query(
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1,$2,'source_object',$3,'upserted',$4::jsonb,$5)`,
      [
        orgId,
        projectId,
        inserted.rows[0].id,
        JSON.stringify({ sourceType: data.sourceType, sourceKey: data.sourceKey, version }),
        (req as any).user?.id || 'system',
      ]
    );

    return res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid source object payload', details: error.errors });
    }
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'saving source objects', error);
  }
});

router.get('/sections/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT section_key as "sectionKey", section_path as "sectionPath", stale, stale_reason as "staleReason",
              approval_state as "approvalState", updated_at as "updatedAt"
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY section_key`,
      [orgId, projectId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'loading sections', error);
  }
});

router.post('/compile/:projectId', async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, source_type as "sourceType", source_payload as "sourcePayload", source_hash as "sourceHash"
       FROM cmc_source_objects
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY updated_at DESC`,
      [orgId, projectId]
    );

    // Refuse to compile from nothing.
    //
    // composeModule3FromCanonicalSources is MODULE3_SECTION_RULES.map(...) — it
    // emits all 17 sections unconditionally, so zero sources still yields 17
    // bodies reading "has no source data available", with completeness 0 and no
    // lineage. The upsert below then writes `stale = false, stale_reason = NULL`
    // and does not touch approval_state, so those empty bodies land marked
    // not-stale over whatever approval state was already there — which is
    // exactly what canFinalizeExport reads before releasing a Module 3.
    //
    // Compiling a project that has no canonical sources is never a legitimate
    // request; it is either a mistake or a probe. 409 says so, instead of
    // manufacturing seventeen empty-but-clean sections. The AnA command handler
    // already guards this way (server/services/ana-ri/module3-command-handlers.ts).
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'No canonical source objects for this project — nothing to compile.',
        hint: 'Upsert source objects via POST /api/cmc/module3-os/source-objects/:projectId first.',
      });
    }

    let compiled = composeModule3FromCanonicalSources(rows as any);

    /* ── Appendices (3.2.A) ──
       module3-extensions has carried generators for 3.2.A.1 Facilities,
       3.2.A.2 Adventitious Agents and 3.2.A.3 Excipients since it was written,
       and nothing in the product's own compile path ever called them: a product
       using an animal-derived excipient could not produce the CTD section that
       exists to declare it.

       An OPTIONAL appendix with no matched source is not emitted at all.
       composeAppendices scores an unmatched optional rule 100% complete, so
       emitting it would put a fully-complete section into the dossier asserting
       things about data nobody recorded — the precise hazard 3.2.A.3's own
       fail-closed branch exists to avoid. A required appendix IS emitted, with
       its honest incompleteness. */
    try {
      const appendices = emittableAppendices(composeAppendices(rows as any));
      compiled = compiled.concat(appendices);
    } catch (appendixErr) {
      // Said, not swallowed — the same posture as the regional pass below.
      console.warn(
        '[module3-os] appendix (3.2.A) composition skipped:',
        appendixErr instanceof Error ? appendixErr.message : String(appendixErr),
      );
    }

    /* ── Regional Information (3.2.R) ──
       The core composer deliberately owns only S/P/3.1/3.3 (defining R rules
       there once produced duplicate appendix leaves and region leakage — see
       the NOTE in MODULE3_SECTION_RULES); module3-extensions owns the
       region-specific dispatch. Composed here for the REGION THE LINKED
       SUBMISSION RECORDS, resolved through the same spine identity the eCTD
       compile runs against — so the section the initial-sequence gate
       requires ('3.2.R') is authorable, approvable and placeable through the
       same lifecycle as every other Module 3 section. No spine, or a market
       the composer has no generator for → nothing is composed: an honest gap
       beats a guessed region's regional form in a filing. */
    try {
      const prog = await client.query(
        `SELECT id, program_type AS "programType", product_name AS "productName", name, code
           FROM regulatory_programs
          WHERE id = $1 AND organization_id = $2`,
        [projectId, orgId],
      );
      const p = prog.rows[0] as
        | { id: string; programType: string | null; productName: string | null; name: string | null; code: string | null }
        | undefined;
      if (p) {
        const spine = await resolveSubmissionSpine(
          { programId: p.id, programType: p.programType, productName: p.productName, title: p.name, programCode: p.code },
          orgId,
        );
        const region = regionCodeForPrimaryRegion(spine?.primaryRegion);
        if (region) compiled = compiled.concat(composeRegional(rows as any, region));
      }
    } catch (regionalErr) {
      // The core compose stands either way — but a skipped regional pass is
      // SAID, not swallowed: the compile gate will name the missing 3.2.R.
      console.warn(
        '[module3-os] regional (3.2.R) composition skipped:',
        regionalErr instanceof Error ? regionalErr.message : String(regionalErr),
      );
    }

    for (const section of compiled) {
      const upsert = await client.query(
        `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'draft')
         ON CONFLICT (organization_id, project_id, section_key)
         DO UPDATE SET deterministic_json = excluded.deterministic_json,
                       compiled_hash = excluded.compiled_hash,
                       stale = excluded.stale,
                       stale_reason = excluded.stale_reason,
                       narrative_text = excluded.narrative_text,
                       updated_at = now()
         RETURNING id`,
        [
          orgId,
          projectId,
          section.sectionKey,
          section.sectionPath,
          JSON.stringify({
            ...section.structuredPayload,
            completeness: section.completeness,
            missingInputs: section.missingInputs,
          }),
          section.narrativeDraft,
          createSourceHash(section.structuredPayload),
          false,
          null,
        ]
      );
      const sectionId = upsert.rows[0]?.id;
      if (!sectionId) continue;

      // Scoped by org as well as section id. `sectionId` comes from the upsert's
      // RETURNING, so before the arbiter carried organization_id this deleted the
      // VICTIM's provenance rows — the traceability tying each Module 3 section
      // back to the source objects it was compiled from.
      await client.query(
        `DELETE FROM cmc_section_lineage WHERE section_id = $1 AND organization_id = $2`,
        [sectionId, orgId]
      );
      for (const lin of section.lineage) {
        await client.query(
          `INSERT INTO cmc_section_lineage (organization_id, section_id, source_object_id, source_hash_at_compile)
           VALUES ($1, $2, $3, $4)`,
          [orgId, sectionId, lin.sourceObjectId, lin.sourceHashAtCompile]
        );
      }
      await client.query(
        `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
         VALUES ($1,$2,'section',$3,'compiled',$4::jsonb,$5)`,
        [
          orgId,
          projectId,
          sectionId,
          JSON.stringify({
            sectionKey: section.sectionKey,
            completeness: section.completeness,
            missingInputs: section.missingInputs,
            narrativeMechanism: 'deterministic_with_ai_optional',
          }),
          (req as any).user?.id || 'system',
        ]
      );
    }
    await client.query('COMMIT');

    // ── AUTO-BRIDGE: Create/update governed artifacts for each compiled section ──
    // Phase 5 — Module 3 Workflow Convergence: compile results must become governed artifacts
    const bridgedArtifacts: Array<{ sectionKey: string; artifactId: string; isNew: boolean }> = [];
    // A bridge that could not run is reported, not swallowed: this loop's old
    // catch-and-warn hid the integer/uuid spine break, so every wizard-created
    // program "compiled successfully" while creating zero governed artifacts.
    const bridgeSkips: Array<{ sectionKey: string; reason: string; detail: string }> = [];
    for (const section of compiled) {
      try {
        const bridged = await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
          narrativeDraft: section.narrativeDraft,
          tables: section.tables,
          completeness: section.completeness,
          missingInputs: section.missingInputs,
          lineage: section.lineage,
        }, { createdById: Number((req as any).user?.id) || null });
        if (bridged.bridged) {
          bridgedArtifacts.push({
            sectionKey: section.sectionKey,
            artifactId: bridged.artifactId,
            isNew: bridged.isNew,
          });
        } else {
          bridgeSkips.push({ sectionKey: section.sectionKey, reason: bridged.reason, detail: bridged.detail });
        }
      } catch (bridgeErr) {
        bridgeSkips.push({
          sectionKey: section.sectionKey,
          reason: 'error',
          detail: bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr),
        });
      }
    }

    res.json({ success: true, compiledCount: compiled.length, sections: compiled, bridgedArtifacts, bridgeSkips });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'compiling', error);
  } finally {
    client.release();
  }
});

router.post('/source-changed/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");
    const { changedSourceType, reason } = req.body;
    const pool = getPool();
    const sectionsRes = await pool.query(
      `SELECT section_key as "sectionKey", section_path as "sectionPath", deterministic_json as "deterministicJson", compiled_hash as "compiledHash"
       FROM cmc_module3_sections WHERE organization_id=$1 AND project_id=$2`,
      [orgId, projectId]
    );
    const staleSections = impactedSectionsForSourceType(changedSourceType);
    const stale = markStaleSections(
      sectionsRes.rows.map((r: any) => ({ ...r, lineage: [], stale: false, staleReason: null })),
      changedSourceType,
      reason || 'Source changed'
    );
    for (const s of stale.filter((x) => x.stale && staleSections.includes(x.sectionKey))) {
      await pool.query(
        `UPDATE cmc_module3_sections SET stale = true, stale_reason = $1, updated_at = now() WHERE organization_id=$2 AND project_id=$3 AND section_key=$4`,
        [s.staleReason, orgId, projectId, s.sectionKey]
      );
    }
    res.json({ success: true, staleSections: stale.filter((s) => s.stale).map((s) => s.sectionKey) });
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'saving source changed', error);
  }
});

router.post('/contradictions/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");
    const pool = getPool();
    /* The sweep reads the REAL register shapes, tenant-scoped:
       - quality_specifications / cmc_batch_records / cmc_comparability_
         assessments carry a uuid project_id, so the project filter applies
         only when the id IS a uuid (a legacy numeric id matches nothing —
         honestly — instead of aborting the whole statement with 22P02);
       - analytical_methods / stability_studies are the ORGANIZATION's
         registers (no project column by design), read org-wide — and their
         columns are `title` / `study_title`, which the previous SQL imagined
         as method_name / study_name, so this endpoint had never returned
         anything but 500 against a provisioned database. Every query also
         carries the org — the old ones filtered by project alone, which on
         the shared-uuid space was a cross-tenant read. */
    const isUuidProject = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
    const noRows = Promise.resolve({ rows: [] as any[] });
    const [specs, methods, stability, batch, comparability] = await Promise.all([
      isUuidProject
        ? pool.query(
            `SELECT material_name as "materialName", acceptance_criteria as "acceptanceCriteria"
             FROM quality_specifications
             WHERE project_id = $1::uuid AND (tenant_id = $2 OR tenant_id IS NULL)`,
            [projectId, orgId]
          )
        : noRows,
      pool.query(
        // The engine's contract reads `validationStatus` (ICH Q2 validated /
        // verified / transferred); the table's column is `status`.
        `SELECT title as "methodName", purpose, status as "validationStatus"
         FROM analytical_methods WHERE organization_id = $1`,
        [orgId]
      ),
      pool.query(
        `SELECT study_title as "studyName", status FROM stability_studies WHERE organization_id = $1`,
        [orgId]
      ),
      isUuidProject
        ? pool.query(
            `SELECT batch_number as "batchNumber", disposition FROM cmc_batch_records
             WHERE project_id = $1::uuid AND (tenant_id = $2 OR organization_id = $2)`,
            [projectId, orgId]
          )
        : noRows,
      isUuidProject
        ? pool.query(
            `SELECT assessment_name as "assessmentName", regulatory_risk_level as "regulatoryRiskLevel"
             FROM cmc_comparability_assessments
             WHERE project_id = $1::uuid AND organization_id = $2`,
            [projectId, orgId]
          )
        : noRows,
    ]);

    const contradictions = detectContradictions({
      specifications: specs.rows,
      methods: methods.rows,
      stability: stability.rows,
      batch: batch.rows,
      comparability: comparability.rows,
    });

    // Wrap DELETE + INSERT in a transaction to prevent partial state
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM cmc_contradictions WHERE organization_id = $1 AND project_id = $2`, [
        orgId,
        projectId,
      ]);
      for (const c of contradictions) {
        await client.query(
          `INSERT INTO cmc_contradictions (organization_id, project_id, severity, contradiction_type, details, impacted_sections, required_reviewers)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
          [
            orgId,
            projectId,
            c.severity,
            c.contradictionType,
            c.details,
            JSON.stringify(c.impactedSections),
            JSON.stringify(c.requiredReviewers),
          ]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    /* Route the derived work into the central task board.
       `deriveImpactTasks` has always produced a title, priority and reviewer
       list per contradiction, and this endpoint returned that array and threw
       it away — so the one place the product knows exactly who must do what
       never became something anyone was holding.

       Additive and non-blocking by design: an existing task for a contradiction
       type is left alone (it carries assignment and status the sweep knows
       nothing about), and a tasking failure does not fail the sweep — but is
       reported, so the caller never assumes tasks landed when they did not.
       See services/cmc/contradiction-tasks. */
    const taskSync = await syncContradictionTasks({
      organizationId: orgId,
      projectUuid: String(projectId),
      contradictions,
    });

    res.json({
      success: true,
      contradictions,
      impactTasks: deriveImpactTasks(contradictions),
      tasks: taskSync,
    });
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'saving contradictions', error);
  }
});

router.get('/contradictions/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, severity, contradiction_type as "contradictionType", details,
              impacted_sections as "impactedSections", required_reviewers as "requiredReviewers",
              status, updated_at as "updatedAt"
       FROM cmc_contradictions
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY updated_at DESC`,
      [orgId, projectId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'loading contradictions', error);
  }
});

router.patch('/contradictions/:id/resolve', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const idRaw = req.params.id; const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? "");
    const parsed = resolveContradictionSchema.parse(req.body || {});
    const pool = getPool();
    const updated = await pool.query(
      `UPDATE cmc_contradictions
       SET status = 'resolved',
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING id, project_id as "projectId"`,
      [orgId, id]
    );
    const row = updated.rows[0];
    if (!row) return res.status(404).json({ success: false, error: 'Contradiction not found' });

    await pool.query(
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1,$2,'contradiction',$3,'resolved',$4::jsonb,$5)`,
      [
        orgId,
        row.projectId,
        id,
        JSON.stringify({ resolutionNote: parsed.resolutionNote }),
        (req as any).user?.id || 'system',
      ]
    );
    return res.json({ success: true, data: { id, status: 'resolved' } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid resolution payload', details: error.errors });
    }
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'resolving contradictions', error);
  }
});

router.get('/readiness/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");
    const pool = getPool();
    const [sections, contradictions] = await Promise.all([
      pool.query(
        `SELECT approval_state, stale
         FROM cmc_module3_sections
         WHERE organization_id = $1 AND project_id = $2`,
        [orgId, projectId]
      ),
      pool.query(
        `SELECT severity, status
         FROM cmc_contradictions
         WHERE organization_id = $1 AND project_id = $2`,
        [orgId, projectId]
      ),
    ]);

    const totalSections = sections.rows.length;
    const approvedSections = sections.rows.filter((r: any) => r.approval_state === 'approved').length;
    const staleSections = sections.rows.filter((r: any) => Boolean(r.stale)).length;
    const openCriticalContradictions = contradictions.rows.filter(
      (r: any) => r.severity === 'critical' && r.status !== 'resolved'
    ).length;

    const exportReady = totalSections > 0 && approvedSections === totalSections && staleSections === 0 && openCriticalContradictions === 0;

    let canonicalGovernedState: Record<string, any> | null = null;
    try {
      const unresolvedContradictions = contradictions.rows.filter((r: any) => r.status !== 'resolved').length;
      canonicalGovernedState = await buildCanonicalGovernedState({
        context: {
          organizationId: String(orgId),
          projectId: String(projectId),
          actorId: (req as any).user?.id || 'system',
          intendedAction: 'export',
          documentType: 'cmc_module3',
          ctdSection: '3',
        },
        documentState: {
          hasContent: totalSections > 0,
          hasEvidence: totalSections > 0,
          hasBeenReviewed: approvedSections > 0,
          hasApproval: exportReady,
          hasPlacement: true,
          placementValid: true,
          hasProvenance: true,
          unresolvedContradictionCount: unresolvedContradictions,
          criticalContradictionCount: openCriticalContradictions,
          isStale: staleSections > 0,
          completenessScore: totalSections > 0 ? approvedSections / totalSections : 0,
        },
      });
    } catch (fabricErr) {
      canonicalGovernedState = { error: 'Canonical governed-state evaluation failed', degraded: true };
    }

    return res.json({
      success: true,
      data: {
        totalSections,
        approvedSections,
        staleSections,
        openCriticalContradictions,
        exportReady,
        canonicalGovernedState,
      },
    });
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'loading readiness', error);
  }
});

router.get('/provenance/:projectId/:sectionKey', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;
    const pool = getPool();
    const sectionRes = await pool.query(
      `SELECT id
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
      [orgId, projectId, sectionKey]
    );
    const section = sectionRes.rows[0];
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    const { rows } = await pool.query(
      `SELECT event_type as "eventType", event_payload as "eventPayload", created_by as "createdBy", created_at as "createdAt"
       FROM cmc_provenance_events
       WHERE organization_id = $1 AND project_id = $2 AND artifact_type = 'section' AND artifact_id = $3
       ORDER BY created_at DESC`,
      [orgId, projectId, section.id]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'loading provenance', error);
  }
});

router.post('/sections/:projectId/:sectionKey/approve', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;

    // §11.10(g) / §11.200 re-authentication. Approving a Module 3 section is a
    // signature event, so the signer's credentials are verified BEFORE any
    // write — fail closed, consistent with the specification-approve and
    // batch-release endpoints. The client sends `reauth: { password, totp }`.
    const actorId = resolveActorUserId(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });
    }
    const reauthResult = await verifyReauth(actorId, (req.body ?? {}).reauth);
    if (!reauthResult.ok) {
      res.setHeader('WWW-Authenticate', 'ReAuth required');
      return res.status(401).json({ success: false, error: reauthResult.error ?? 'REAUTH_REQUIRED' });
    }

    const pool = getPool();

    const blocking = await pool.query(
      `SELECT id FROM cmc_contradictions
       WHERE organization_id = $1 AND project_id = $2 AND status <> 'resolved' AND severity = 'critical'
       LIMIT 1`,
      [orgId, projectId]
    );
    if (blocking.rows.length > 0) {
      return res
        .status(409)
        .json({ success: false, error: 'Critical contradictions must be resolved before approval.' });
    }

    let canonicalGovernedState: Record<string, any> | null = null;
    try {
      const unresolvedContradictions = blocking.rows.length; // already queried above
      canonicalGovernedState = await buildCanonicalGovernedState({
        context: {
          organizationId: String(orgId),
          projectId: String(projectId),
          actorId: (req as any).user?.id || 'system',
          intendedAction: 'approve',
          documentType: 'cmc_module3',
          ctdSection: sectionKey,
        },
        documentState: {
          hasContent: true,
          hasEvidence: true,
          hasBeenReviewed: true,
          hasApproval: false, // not yet approved — that is what we are doing
          hasPlacement: true,
          placementValid: true,
          hasProvenance: true,
          unresolvedContradictionCount: unresolvedContradictions,
          criticalContradictionCount: unresolvedContradictions,
          isStale: false,
        },
      });
    } catch (fabricErr) {
      canonicalGovernedState = { error: 'Canonical governed-state evaluation failed', degraded: true };
    }

    // The version snapshot + section flip + provenance event + the hash-chained
    // governed-action record are one atomic transaction: approval either lands
    // as a complete §11 signature (audit chain included) or not at all —
    // consistent with the specification-approve / batch-release endpoints.
    const client = await pool.connect();
    let responsePayload: Record<string, unknown>;
    try {
      await client.query('BEGIN');

      const sectionRes = await client.query(
        `SELECT id, deterministic_json, approval_state
         FROM cmc_module3_sections
         WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
        [orgId, projectId, sectionKey]
      );
      const section = sectionRes.rows[0];
      if (!section) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Section not found' });
      }

      const verRes = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) as max_version
         FROM cmc_module3_section_versions
         WHERE section_id = $1`,
        [section.id]
      );
      const versionNumber = Number(verRes.rows[0]?.max_version || 0) + 1;
      const insertedVersion = await client.query(
        `INSERT INTO cmc_module3_section_versions (organization_id, section_id, project_id, version_number, snapshot_json, diff_summary, state, created_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,'approved',$7)
         RETURNING id`,
        [
          orgId,
          section.id,
          projectId,
          versionNumber,
          JSON.stringify(section.deterministic_json),
          JSON.stringify({ approvedFromState: section.approval_state }),
          String(actorId),
        ]
      );
      const approvedVersionId = insertedVersion.rows[0].id;
      await client.query(
        `UPDATE cmc_module3_sections
         SET approval_state = 'approved', approved_version_id = $1, stale = false, stale_reason = null, updated_at = NOW()
         WHERE id = $2`,
        [approvedVersionId, section.id]
      );
      await client.query(
        `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
         VALUES ($1,$2,'section',$3,'approved',$4::jsonb,$5)`,
        [
          orgId,
          projectId,
          section.id,
          JSON.stringify({ sectionKey, versionNumber }),
          String(actorId),
        ]
      );

      const signTarget = `cmc_module3_section:${projectId}/${sectionKey}`;
      const signReason =
        typeof (req.body ?? {}).reason === 'string' && (req.body as any).reason.trim()
          ? (req.body as any).reason.trim()
          : `Approved Module 3 section ${sectionKey}`;
      /* §11.50(a)(3): the signed record must show the MEANING of the signature.
         The signer's form has always offered one and this endpoint always wrote
         the constant 'approval', so a signature applied as review or
         responsibility was recorded as an approval. It is parsed here rather
         than trusted: an unrecognised value falls back to 'approval' (what this
         endpoint does) instead of writing whatever arrived into a signed
         record. */
      const signMeaning = SIGNATURE_MEANINGS.includes((req.body ?? {}).meaning)
        ? ((req.body as { meaning: SignatureMeaning }).meaning)
        : 'approval';

      // §11.10(e) hash-chained governed-action record (audit_logs + c2c_ana_actions),
      // the same ledger the specification-approve and batch-release endpoints write.
      const governance = await recordGovernedAction(client, {
        orgId,
        userId: actorId,
        command: 'sign',
        target: signTarget,
        reason: signReason,
        payload: { meaning: signMeaning, versionNumber, approvedVersionId },
        domain: 'cmc',
        surface: 'cmc-module3-section-approve',
        idempotencyKey: (req.body ?? {}).idempotencyKey ?? null,
      });

      // 21 CFR Part 11 signature row, same transaction as the ledger pair.
      // Approving a Module 3 CTD section is a document-approval signature that
      // ships inside an NDA/BLA — an inspector querying electronic_signatures
      // must find it. The §11.70 binding is a real content digest over the
      // frozen version snapshot this transaction just wrote, so it is
      // re-derivable from cmc_module3_section_versions.snapshot_json. §11.200
      // factors are the ones verifyReauth actually verified above.
      await persistGovernedActionSignature(client, {
        orgId,
        userId: actorId,
        target: signTarget,
        reason: signReason,
        payload: { meaning: signMeaning },
        actionId: governance.actionId,
        auditId: governance.auditId,
        sha256Chain: governance.sha256Chain,
        authenticationMethod: (req.body ?? {}).reauth?.totp ? 'password+totp' : 'password',
        secondFactorVerified: Boolean((req.body ?? {}).reauth?.totp),
        ipAddress:
          (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
          req.socket?.remoteAddress ||
          null,
        occurredAt: new Date(),
        binding: {
          digest: sha256CanonicalJson({
            organizationId: orgId,
            projectId,
            sectionKey,
            versionNumber,
            approvedVersionId,
            snapshot: section.deterministic_json,
          }),
          basis: BINDING_BASIS.CMC_MODULE3_SECTION_VERSION,
          note: 'sha256 over the canonical JSON of the approved cmc_module3_section_versions snapshot (organization, project, section key, version number, version id and the frozen deterministic_json) at approval time.',
        },
        complianceStatement:
          'Module 3 section approval applied under 21 CFR Part 11 §11.50/§11.70/§11.200; ledger-chained to the audit_logs sha256 chain.',
      });

      await client.query('COMMIT');
      responsePayload = {
        success: true,
        sectionKey,
        versionNumber,
        approvedVersionId,
        canonicalGovernedState,
        governance: { actionId: governance.actionId, sha256Chain: governance.sha256Chain },
      };
    } catch (txErr) {
      try { await client.query('ROLLBACK'); } catch { /* rollback best-effort */ }
      throw txErr;
    } finally {
      client.release();
    }
    res.json(responsePayload);
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'approving sections', error);
  }
});

router.post('/sections/:projectId/:sectionKey/refresh', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;
    const pool = getPool();
    const sectionRes = await pool.query(
      `SELECT id, deterministic_json, approval_state FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
      [orgId, projectId, sectionKey]
    );
    const section = sectionRes.rows[0];
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    const payload = req.body?.deterministicJson || section.deterministic_json;
    const diffSummary = summarizeSectionDiff(section.deterministic_json, payload);
    await pool.query(
      `UPDATE cmc_module3_sections
       SET deterministic_json = $1::jsonb, approval_state = 'draft', stale = false, stale_reason = null, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(payload), section.id]
    );
    await pool.query(
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1,$2,'section',$3,'refreshed',$4::jsonb,$5)`,
      [
        orgId,
        projectId,
        section.id,
        JSON.stringify({ sectionKey, diffSummary, priorApprovalState: section.approval_state }),
        (req as any).user?.id || 'system',
      ]
    );
    res.json({ success: true, sectionKey, state: 'draft', diffSummary });
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'refreshing sections', error);
  }
});

router.post('/guard/final-export/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");
    // The verdict lives in evaluateFinalExportGate so the placement path
    // (place-into-submission below) refuses on exactly the same answer.
    const verdict = await evaluateFinalExportGate({
      orgId,
      projectId,
      actorId: (req as any).user?.id || 'system',
    });
    if (!verdict.allowed) {
      return res.status(409).json({ success: false, error: verdict.error, data: verdict.data });
    }
    return res.json({
      success: true,
      message: 'Final export gate passed',
      canonicalGovernedState: verdict.data.canonicalGovernedState,
    });
  } catch (error) {
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'saving final export', error);
  }
});

/**
 * POST /place-into-submission/:projectId — the CMC → IND seam.
 *
 * Places every approved §3.2 section into a sequence of the canonical
 * submission core: a point-in-time snapshot into coauthor_documents (the
 * canonical renderable leaf source) and a real submission_leaves row at the
 * m-prefixed section code. Refuses outright — before any write — unless the
 * final-export gate passes; the refusal body carries the gate's own verdict.
 */
router.post('/place-into-submission/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId; const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : (projectIdRaw ?? "");

    const actorId = resolveActorUserId(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });
    }

    const parsed = z
      .object({ submissionId: z.number().int().positive(), sequenceId: z.number().int().positive() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'submissionId and sequenceId are required (the target sequence for the Module 3 leaves).',
      });
    }

    const result = await placeModule3IntoSubmission({
      orgId,
      userId: Number(actorId),
      cmcProjectId: projectId,
      submissionId: parsed.data.submissionId,
      sequenceId: parsed.data.sequenceId,
    });

    if (!result.placed) {
      // The gate's verdict is the useful answer — surface it verbatim, as the
      // guard endpoint would have.
      return res.status(409).json({ success: false, error: result.error, data: result.data });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    if (msg.includes('INVALID_STATE') || msg.includes('immutable')) {
      return res.status(409).json({ success: false, error: msg });
    }
    if (msg.includes('NOT_FOUND') || msg.includes('FORBIDDEN')) {
      return res.status(404).json({ success: false, error: msg });
    }
    return res.status(500).json({ success: false, error: msg || 'Placement failed' });
  }
});

export default router;
