import express from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import {
  markStaleSections,
  summarizeSectionDiff,
  createSourceHash,
} from '../../services/cmc-module3-compiler';
import { CMC_SOURCE_TYPES, impactedSectionsForSourceType } from '../../services/module3Composer';
import { compiledRecordOf, composeProjectModule3, persistComposedSection } from '../../services/cmc/module3-compile';
import { detectContradictions, deriveImpactTasks } from '../../services/cmc-impact-contradiction-engine';
import { syncContradictionTasks } from '../../services/cmc/contradiction-tasks';
import { readContradictionRegisters } from '../../services/cmc/contradiction-registers';
import { buildCanonicalGovernedState } from '../../services/governed-ana-execution.js';
import { evaluateFinalExportGate, evaluateModule3GovernedState } from '../../services/cmc/final-export-gate';
import { readCompiledRecord, type CompiledRecordStatus } from '../../services/cmc/compiled-record';
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
  /* Derived from the composer's own list — the enum here used to be a
     hand-copied subset that refused five types the composer requires. */
  sourceType: z.enum(CMC_SOURCE_TYPES),
  sourceKey: z.string().min(1),
  sourcePayload: z.record(z.any()),
  version: z.number().int().positive().optional(),
});

const resolveContradictionSchema = z.object({
  resolutionNote: z.string().min(3),
});

/**
 * Why an approval is refused on an incomplete compiled record, in the signer's
 * own terms: which section, how complete, which inputs are still missing, and
 * what to do about it. Rendered verbatim by the surface.
 */
function incompleteSectionRefusal(sectionKey: string, record: CompiledRecordStatus): string {
  const verdict =
    record.completeness == null
      ? `§${sectionKey} has no compiled completeness record and cannot be approved.`
      : `§${sectionKey} is ${record.completeness}% complete and cannot be approved.`;
  const remedy =
    record.missingInputs.length > 0
      ? ` Missing required inputs: ${record.missingInputs.join(', ')}. Record them and recompile.`
      : ' Recompile the section so the compiler records what it establishes.';
  return verdict + remedy;
}

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
              approval_state as "approvalState", updated_at as "updatedAt", deterministic_json as "deterministicJson"
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY section_key`,
      [orgId, projectId]
    );
    /* The compiler's completeness and missing inputs travel with every row,
       read by the one rule the approve route and the export gate apply — so a
       surface can show the signer what those two will refuse before they sign.
       The compiled blob itself stays behind: this is a register, not the dossier. */
    const data = rows.map(({ deterministicJson, ...row }: Record<string, unknown>) => {
      const record = readCompiledRecord({ deterministicJson });
      return { ...row, completeness: record.completeness, missingInputs: record.missingInputs };
    });
    return res.json({ success: true, data });
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

    /* One composition for the project — core sections, emittable 3.2.A
       appendices and 3.2.R for the recorded region — and one persistence per
       section (row, lineage, provenance), shared with /refresh and AnA's
       refresh so no caller can write a section record the composer did not
       produce. */
    const { sources, sections: compiled } = await composeProjectModule3(client, orgId, projectId);

    // Refuse to compile from nothing. Zero sources would still yield seventeen
    // bodies reading "has no source data available" at completeness 0, landed
    // not-stale over whatever approval state was already there — exactly what
    // the export gate reads. Compiling a project with no canonical sources is
    // never a legitimate request; 409 says so.
    if (sources.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'No canonical source objects for this project — nothing to compile.',
        hint: 'Upsert source objects via POST /api/cmc/module3-os/source-objects/:projectId first.',
      });
    }

    const actorId = String((req as any).user?.id || 'system');
    for (const section of compiled) {
      await persistComposedSection(client, orgId, projectId, section, { actorId, event: 'compiled' });
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
    /* The ONE tenant-scoped register sweep
       (services/cmc/contradiction-registers). This body used to live here and
       in services/ana-ri/module3-command-handlers.ts, and the two copies had
       already drifted: this one still carried `OR tenant_id IS NULL` on
       quality_specifications — which made every legacy row readable by every
       organization — and bound ONE parameter against cmc_batch_records'
       `tenant_id TEXT` and `organization_id INTEGER`, which Postgres rejects
       with `operator does not exist: integer = text`. */
    const registers = await readContradictionRegisters(pool, { organizationId: orgId, projectId });

    const contradictions = detectContradictions(registers);

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

    // The same evaluation the final-export gate runs, so this read cannot be
    // more optimistic than the gate it previews. It used to compute
    // `exportReady` from approvals alone and stamp a degraded governed state
    // beside it — reporting "export ready" in the exact state where the gate
    // fails closed and refuses.
    const { state } = await evaluateModule3GovernedState({
      orgId,
      projectId,
      actorId: (req as any).user?.id || 'system',
    });

    const exportReady =
      state.totalSections > 0 &&
      state.approvedSections === state.totalSections &&
      state.staleSections === 0 &&
      state.openCriticalContradictions === 0 &&
      state.sectionsWithoutProvenance === 0 &&
      state.incompleteApprovedSections.length === 0 &&
      state.governedStateEvaluated &&
      !state.fabricBlocks &&
      !state.governedDecisionsBlock;

    return res.json({
      success: true,
      data: {
        totalSections: state.totalSections,
        approvedSections: state.approvedSections,
        staleSections: state.staleSections,
        openCriticalContradictions: state.openCriticalContradictions,
        sectionsWithoutProvenance: state.sectionsWithoutProvenance,
        // Approved sections whose own compiled record says they are not
        // complete. An approval is not evidence the content exists.
        incompleteApprovedSections: state.incompleteApprovedSections,
        // False means the governed-decision fabric did not return a verdict —
        // NOT that it looked and cleared the project.
        governedStateEvaluated: state.governedStateEvaluated,
        exportReady,
        canonicalGovernedState: state.canonicalGovernedState,
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
    } catch {
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

      /* The export gate's rule, applied at the signature. An approval is a
         claim about content that was reviewed; this section's own compiled
         record says the content is not there. Found live: 21/21 approved,
         three at 0% completeness, and the gate refusing the whole export
         after every signature was already on the ledger. Refuse here, with
         the same reading the gate uses, so the signer is told NOW — and
         nothing is written: no version row, no state flip, no governed
         action, no signature. */
      const compiledRecord = readCompiledRecord(section);
      if (!compiledRecord.complete) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: incompleteSectionRefusal(sectionKey, compiledRecord),
          data: { completeness: compiledRecord.completeness, missingInputs: compiledRecord.missingInputs },
        });
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

/**
 * Refresh ONE section from the project's canonical sources.
 *
 * The body is not read. This route used to take `deterministicJson` from the
 * request and write it verbatim — so a caller could write `completeness: 100,
 * missingInputs: []` and the approve route and the export gate, which trust
 * that record as the compiler's verdict, would let an empty section through
 * to a §11 signature and a placed leaf without a compile. A refreshed record
 * is only ever what the composer produced; the section returns to draft
 * because its content changed under any approval it carried.
 */
router.post('/sections/:projectId/:sectionKey/refresh', async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;
    await client.query('BEGIN');
    const sectionRes = await client.query(
      `SELECT id, deterministic_json, approval_state FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
      [orgId, projectId, sectionKey]
    );
    const section = sectionRes.rows[0];
    if (!section) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    const { sources, sections } = await composeProjectModule3(client, orgId, projectId);
    if (sources.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'No canonical source objects for this project — there is nothing to refresh the section from.',
      });
    }
    const composed = sections.find((s) => s.sectionKey === sectionKey);
    if (!composed) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `Section ${sectionKey} is not composable from this project's sources (no rule, or no region), so it cannot be refreshed.`,
      });
    }

    const diffSummary = summarizeSectionDiff(section.deterministic_json, compiledRecordOf(composed));
    const actorId = String((req as any).user?.id || 'system');
    await persistComposedSection(client, orgId, projectId, composed, {
      actorId,
      event: 'refreshed',
      eventPayload: { diffSummary, priorApprovalState: section.approval_state },
    });
    await client.query('COMMIT');

    /* The governed artifact follows the section, as it does after a compile. */
    let bridged: { bridged: boolean; reason?: string; detail?: string } = { bridged: false, reason: 'not-attempted' };
    try {
      bridged = await bridgeCompileToArtifact(orgId, projectId, composed.sectionKey, {
        narrativeDraft: composed.narrativeDraft,
        tables: composed.tables,
        completeness: composed.completeness,
        missingInputs: composed.missingInputs,
        lineage: composed.lineage,
      }, { createdById: Number((req as any).user?.id) || null });
    } catch (bridgeErr) {
      bridged = { bridged: false, reason: 'error', detail: bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr) };
    }

    res.json({
      success: true,
      sectionKey,
      state: 'draft',
      completeness: composed.completeness,
      missingInputs: composed.missingInputs,
      diffSummary,
      artifactBridged: bridged.bridged,
      ...(bridged.bridged ? {} : { artifactBridgeSkipped: { reason: bridged.reason, detail: bridged.detail } }),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error instanceof Error ? error.message : String(error)).includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, logger, 'refreshing sections', error);
  } finally {
    client.release();
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
      // Each refusal carries a DIFFERENT useful answer, so discriminate rather
      // than reaching for one shape: the gate refusal carries the governed
      // state it refused on, and 'nothing-placeable' carries the per-section
      // reasons nothing could be filed. Dropping the latter would leave the
      // caller a bare "placed nothing" with no remedy.
      return res.status(409).json(
        result.refusedBy === 'final-export-gate'
          ? { success: false, error: result.error, data: result.data }
          : { success: false, error: result.error, skipped: result.skipped },
      );
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
