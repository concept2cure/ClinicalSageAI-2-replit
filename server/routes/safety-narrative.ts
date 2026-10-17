/**
 * Safety Narrative Service — API Routes
 *
 * RESTful endpoints for generating regulatory-grade safety narratives:
 * - Aggregate safety narratives (ICH E3 Section 12)
 * - Individual SAE case narratives
 * - Benefit-risk assessment summaries (FDA/EMA frameworks)
 * - Safety signal assessment summaries (CIOMS/ICH E2E)
 * - Cross-study integrated safety summaries
 */

import { Router, Request, Response } from 'express';
import { safetyNarrativeService } from '../services/safety-narrative-service';
import { assembleOrgSaeCases } from '../services/pv/sae-cases-view-assembler';
import { pool } from '../db';
import { writeChainedAuditRow } from '../services/auditService';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import { ProjectAdmissionRefusal, requireCurrentProjectActor, requireProjectAdmission } from './c2c/project-access';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../lib/project-id';
import { readProgramAnchorRow } from '../services/c2c/program-project-anchor';
import { programInOrganization } from '../services/c2c/program-access';
import { requestDb, requestPgClient } from '../db/requestDb';
import type { PoolClient } from 'pg';

const logger = createScopedLogger('safety-narrative');

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Stored PV refs can name either existing project spine. No prefix coercion,
 * guessed anchor, or unavailable policy becomes an organisation-wide grant. */
async function requireCaseProjectAccess(req: Request, orgId: number, ref: unknown, forWrite: boolean) {
  const actor = await requireCurrentProjectActor(req, forWrite);
  if (ref === null || ref === undefined || ref === '') return actor;
  let projectId = parseIntegerProjectId(ref);
  if (projectId === null && looksLikeProgramUuid(ref)) {
    const programId = String(ref).trim().toLowerCase();
    if (!await programInOrganization(requestPgClient(req), programId, orgId)) {
      throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    projectId = (await readProgramAnchorRow(requestDb(req), {
      programId, orgId, context: 'safety-case', requireUnique: true,
    }))?.id ?? null;
  }
  if (projectId === null) {
    throw new ProjectAdmissionRefusal(409, 'SAE_CASE_PROJECT_UNRESOLVED', 'The case project relationship must be verified before this record can be used.');
  }
  await requireProjectAdmission(req, String(projectId), forWrite);
  return actor;
}

async function readCasesForActor(req: Request, orgId: number, caseId?: string) {
  await requireCurrentProjectActor(req, false);
  const decisions = new Map<unknown, boolean>();
  return assembleOrgSaeCases(orgId, new Date(), { caseId, canReadProject: async (ref) => {
    if (decisions.has(ref)) return decisions.get(ref) === true;
    try {
      await requireCaseProjectAccess(req, orgId, ref, false);
      decisions.set(ref, true); return true;
    } catch (error) {
      if (error instanceof ProjectAdmissionRefusal && [403, 404, 409].includes(error.status)) {
        decisions.set(ref, false); return false;
      }
      throw error;
    }
  } });
}

function sendCaseAccessRefusal(res: Response, error: unknown): boolean {
  if (!(error instanceof ProjectAdmissionRefusal)) return false;
  res.status(error.status).json({ saved: false, error: { code: error.code, message: error.message } });
  return true;
}

/**
 * GET /cases — the org's individual SAE case worklist, assembled ENTIRELY from the
 * real, org-scoped pharmacovigilance store (`adverse_events`, the table
 * pharmacovigilanceService writes) and shaped to exactly the keys the v2
 * SafetyNarrative surface renders. Each case's 21 CFR 312.32(c) / ICH E2A
 * expedited-reporting clock is computed LIVE from its facts (awareness date +
 * seriousness + causality + expectedness + outcome) by the pure PV module. There is
 * no legacy/seed blob and no fallback: an org with no adverse events returns an empty
 * list and the surface renders its own honest empty state. Trial-only fields the PV
 * intake store does not carry (demographics, arm, medical history, con-meds) are
 * honestly absent. See sae-cases-view-assembler.
 *
 * A FAILED read is never reported as an empty worklist. This endpoint is a
 * pharmacovigilance read: "no serious adverse events" and "the adverse-event
 * query failed" are opposite safety claims, and a reviewer cannot tell them
 * apart from a 200 carrying `[]`. A missing store answers 503 (an operator must
 * run migrations before this surface means anything); any other fault answers
 * 500. `adverse_events` is created by the PV migrations, so the 503 branch is
 * an unprovisioned-deployment guard, not a normal state.
 */
router.get('/cases', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const data = await readCasesForActor(req, orgId);
    return res.json({ data, meta: { count: data.length, source: 'adverse_events' } });
  } catch (err) {
    if (sendCaseAccessRefusal(res, err)) return;
    if ((err as { code?: string })?.code === '42P01') {
      console.error('[safety-narrative] adverse_events store not provisioned — failing closed');
      return res.status(503).json({
        error: {
          code: 'AE_STORE_UNPROVISIONED',
          message:
            'The adverse-event store is not provisioned in this deployment; SAE cases cannot be read. Run the pharmacovigilance migrations.',
        },
      });
    }
    console.error(
      '[safety-narrative] SAE case read failed:',
      err instanceof Error ? err.message : String(err),
    );
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read SAE cases.' } });
  }
});

router.get('/cases/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  try {
    const data = (await readCasesForActor(req, orgId, String(req.params.id)))[0];
    if (!data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No accessible SAE case was found.' } });
    return res.json({ data });
  } catch (error) {
    if (sendCaseAccessRefusal(res, error)) return;
    return res.status(503).json({ error: { code: 'SAE_CASE_READ_UNAVAILABLE', message: 'The SAE case could not be read. Retry the read before making another change.' } });
  }
});


/* The structured case fields a safety writer may edit on this surface, mapped
   to their `adverse_events` columns. Anything not on this list is not writable
   here — a PATCH cannot reach a column by naming it. */
const EDITABLE_CASE_FIELDS: Record<string, { column: string; kind: 'text' | 'text[]' }> = {
  causality: { column: 'causality', kind: 'text' },
  outcome: { column: 'outcome', kind: 'text' },
  expectedness: { column: 'expectedness', kind: 'text' },
  reactionPt: { column: 'reaction_pt', kind: 'text' },
  eventDescription: { column: 'event_description', kind: 'text' },
  onsetDate: { column: 'onset_date', kind: 'text' },
  reportDate: { column: 'report_date', kind: 'text' },
  suspectProduct: { column: 'suspect_product', kind: 'text' },
  suspectProductDose: { column: 'suspect_product_dose', kind: 'text' },
  seriousnessCriteria: { column: 'seriousness_criteria', kind: 'text[]' },
  narrative: { column: 'narrative', kind: 'text' },
};

/**
 * PATCH /cases/:id — persist a safety writer's edits to an SAE case and its
 * narrative.
 *
 * The surface's "Save version" button used to fire a toast reading "Narrative
 * versioning isn't wired to the safety store yet — nothing was saved", and it
 * was telling the truth: a writer completed the structured case (severity,
 * causality, outcome, seriousness criteria), composed the ICH E3 §16
 * narrative, and lost every edit on reload. The surface even disclosed it to
 * AnA — "there is no case-write endpoint, so edits are not persisted". This is
 * that endpoint.
 *
 * The PREVIOUS narrative and the previous value of every field being changed
 * go into the audit entry, which is what makes this a version rather than an
 * overwrite: `adverse_events` holds one narrative per case, so the history
 * lives in the audit trail and a prior text is always recoverable.
 *
 * A reason for change is required. This is a pharmacovigilance record that
 * feeds an expedited-reporting clock; a change to causality or seriousness can
 * move a case between a 7-day and a 15-day obligation, and an audit trail that
 * records the new value without the grounds is not one.
 */
function caseEditPlan(caseId: string, orgId: number, fields: Record<string, unknown>, before: Record<string, unknown>) {
    const sets: string[] = [];
    const values: unknown[] = [caseId, String(orgId)];
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, raw] of Object.entries(fields)) {
      const spec = EDITABLE_CASE_FIELDS[key];
      let next: unknown;
      if (spec.kind === 'text[]') {
        if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) {
          return { error: `${key} must be an array of strings.` } as const;
        }
        next = raw;
      } else {
        if (raw !== null && typeof raw !== 'string') {
          return { error: `${key} must be a string or null.` } as const;
        }
        next = raw === null || raw === '' ? null : raw;
      }
      // The deployed PV column is TEXT containing JSON, not a PostgreSQL array.
      values.push(spec.kind === 'text[]' ? JSON.stringify(next) : next);
      sets.push(`${spec.column} = $${values.length}`);
      changed[key] = { from: before[spec.column] ?? null, to: next };
    }
    return { sets, values, changed };
}

async function sendSavedCase(req: Request, res: Response, input: {
  orgId: number; caseId: string; recoveryUrl: string; changedFields: string[];
}) {
  const { orgId, caseId, recoveryUrl, changedFields } = input;
    // Re-assemble so the caller gets the case as the STORE now holds it,
    // including the recomputed expedited-reporting clock — a causality edit can
    // move a case between a 7-day and a 15-day obligation, and the writer has
    // to see that happen.
    const meta = { changedFields, auditTrail: { persisted: true, chained: true } };
    try {
      const fresh = (await readCasesForActor(req, orgId, caseId)).find((c) => String(c.id) === caseId);
      if (!fresh) throw new Error('Confirmed SAE save is not currently readable');
      return res.json({ saved: true, data: fresh, meta });
    } catch {
      return res.json({ saved: true, caseId, data: null, recoveryUrl, meta: { ...meta, readback: {
        available: false, code: 'SAE_CASE_READBACK_UNAVAILABLE',
        message: 'The case and its audit history were saved. Its current display could not be refreshed. Read the case before making another change.',
      } } });
    }
}

function caseEditPayload(req: Request, res: Response): { reason: string; fields: Record<string, unknown> } | null {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const reason = typeof b.reasonForChange === 'string' ? b.reasonForChange.trim() : '';
  if (reason.length < 8) {
    res.status(400).json({
      error: {
        code: 'REASON_REQUIRED',
        message: 'A reason for change of at least 8 characters is required to save a safety-narrative version.',
      },
    });
    return null;
  }

  const fields = (b.fields ?? {}) as Record<string, unknown>;
  const unknownFields = Object.keys(fields).filter((k) => !(k in EDITABLE_CASE_FIELDS));
  if (unknownFields.length > 0) {
    res.status(400).json({
      error: {
        code: 'FIELD_NOT_WRITABLE',
        message: `Not writable from this surface: ${unknownFields.join(', ')}.`,
      },
    });
    return null;
  }
  if (Object.keys(fields).length === 0) {
    res.status(400).json({ error: { code: 'NOTHING_TO_SAVE', message: 'No changed fields were sent.' } });
    return null;
  }

  return { reason, fields };
}

router.patch('/cases/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const caseId = String(req.params.id);
  const payload = caseEditPayload(req, res);
  if (!payload) return;
  const { reason, fields } = payload;

  let client: PoolClient | undefined;
  let commitAttempted = false;
  let committed = false;
  let writingAudit = false;
  let releaseError: Error | undefined;
  const recoveryUrl = `/api/safety-narratives/cases/${encodeURIComponent(caseId)}`;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Lock the row so two writers cannot both save against the same pre-image
    // and have one silently win — on a case whose causality drives a reporting
    // deadline, a lost update is a missed obligation.
    const { rows: found } = await client.query(
      `SELECT project_id, ${Object.values(EDITABLE_CASE_FIELDS).map((f) => f.column).join(', ')}
         FROM adverse_events WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [caseId, String(orgId)],
    );
    if (found.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such SAE case in this organization.' } });
    }
    const before = found[0] as Record<string, unknown>;
    const actor = await requireCaseProjectAccess(req, orgId, before.project_id, true);

    const plan = caseEditPlan(caseId, orgId, fields, before);
    if ('error' in plan) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: { code: 'VALIDATION', message: plan.error } });
    }
    const { sets, values, changed } = plan;

    const { rows: updated } = await client.query(
      `UPDATE adverse_events SET ${sets.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING id`,
      values,
    );
    if (updated.length !== 1) throw new Error('SAE case update did not return exactly one record');
    writingAudit = true;
    await writeChainedAuditRow(client, {
      organizationId: orgId,
      userId: actor.userId,
      action: 'SAE_CASE_NARRATIVE_SAVED',
      resourceType: 'adverse_event',
      resourceId: String(updated[0]?.id ?? caseId),
      reason,
      details: {
        reasonForChange: reason,
        // Both sides of every changed field — this is what makes the save a
        // version rather than an overwrite of a record with no history.
        changed,
      },
    });
    writingAudit = false;
    commitAttempted = true;
    await client.query('COMMIT');
    committed = true;

    return await sendSavedCase(req, res, { orgId, caseId, recoveryUrl, changedFields: Object.keys(changed) });
  } catch (err) {
    if (commitAttempted && !committed) {
      releaseError = new Error('SAE case COMMIT result was not confirmed');
      return res.status(503).json({ saved: null, caseId, recoveryUrl, error: {
        code: 'SAE_CASE_COMMIT_UNCONFIRMED',
        message: 'The save result could not be confirmed. Read the case and its audit history before retrying this change.',
      } });
    }
    await client?.query('ROLLBACK').catch(() => { releaseError = new Error('SAE case rollback could not be confirmed'); });
    if (sendCaseAccessRefusal(res, err)) return;
    if (writingAudit) return res.status(503).json({ saved: false, error: {
      code: 'SAE_CASE_HISTORY_UNAVAILABLE', message: 'The case history could not be recorded, so this change was rolled back.',
    } });
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({
        error: { code: 'AE_STORE_UNPROVISIONED', message: 'The adverse-event store is not provisioned in this deployment.' },
      });
    }
    console.error('[safety-narrative] case save failed:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to save the SAE case.' } });
  } finally {
    client?.release(releaseError);
  }
});

// ── Aggregate Safety Narrative ───────────────────────────────

/**
 * POST /api/safety-narratives/aggregate
 * Generate an ICH E3 Section 12 aggregate safety narrative
 */
router.post('/aggregate', async (req: Request, res: Response) => {
  try {
    const {
      studyId, studyTitle, indication, treatmentArms,
      teaeData, saeData, deaths, discontinuationsDueToAE,
      labFindings, narrativeType,
    } = req.body;

    if (!studyId || !studyTitle || !indication || !treatmentArms || !narrativeType) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: studyId, studyTitle, indication, treatmentArms, narrativeType',
      });
    }

    // The safety datasets must be supplied EXPLICITLY as arrays. An omitted
    // field must not be coerced to [] — downstream the empty array renders the
    // affirmative claims "No SAEs were reported during the study." / "No deaths
    // were reported during the study." into an ICH E3 §12 / DSUR section. A
    // caller that simply failed to attach the data (a broken upstream join, a
    // client bug) would otherwise ship a false "zero events" statement that is
    // indistinguishable from a study that genuinely had none. The caller must
    // affirmatively declare "none" by sending [], never by omission.
    if (!Array.isArray(teaeData) || !Array.isArray(saeData) || !Array.isArray(deaths)) {
      return res.status(400).json({
        success: false,
        error:
          'teaeData, saeData, and deaths must each be provided as an array (use [] to affirmatively declare none — omission is rejected so a missing dataset is never reported as "no events").',
      });
    }

    const result = await safetyNarrativeService.generateAggregateSafetyNarrative({
      studyId,
      studyTitle,
      indication,
      treatmentArms: treatmentArms || [],
      teaeData,
      saeData,
      deaths,
      discontinuationsDueToAE: discontinuationsDueToAE || {},
      labFindings,
      narrativeType,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Aggregate safety narrative error:', error);
    return serverError(res, logger, 'saving aggregate', error);
  }
});

// ── Individual SAE Narrative ─────────────────────────────────

/**
 * POST /api/safety-narratives/sae
 * Generate an individual SAE case narrative
 */
router.post('/sae', async (req: Request, res: Response) => {
  try {
    const {
      caseId, patientAge, patientSex, relevantMedicalHistory,
      treatmentArm, drugName, dose, eventTerm, eventDescription,
      onsetDate, onsetStudyDay, seriousnessCriteria, severity,
      actionTaken, outcome, causalityAssessment,
      rechallenge, dechallenge, concomitantMedications, relevantLabValues,
    } = req.body;

    if (!caseId || !eventTerm || !drugName) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: caseId, eventTerm, drugName',
      });
    }

    const narrative = await safetyNarrativeService.generateSAENarrative({
      caseId,
      // null = not reported. Never fabricate a "0-year-old" patient from an
      // omitted age; the narrative builder renders "age not reported".
      patientAge: patientAge ?? null,
      patientSex: patientSex || 'Unknown',
      relevantMedicalHistory: relevantMedicalHistory || [],
      treatmentArm: treatmentArm || 'Unknown',
      drugName,
      dose: dose || 'Not specified',
      eventTerm,
      eventDescription: eventDescription || '',
      onsetDate: onsetDate || 'Unknown',
      // null = not reported. Never fabricate "Study Day 0" from an omitted day.
      onsetStudyDay: onsetStudyDay ?? null,
      seriousnessCriteria: seriousnessCriteria || [],
      severity: severity || 'Unknown',
      actionTaken: actionTaken || 'unknown',
      outcome: outcome || 'unknown',
      causalityAssessment: causalityAssessment || 'Not assessed',
      rechallenge,
      dechallenge,
      concomitantMedications,
      relevantLabValues,
    });

    res.json({
      success: true,
      data: {
        caseId,
        narrative,
        wordCount: narrative.split(/\s+/).length,
      },
    });
  } catch (error: any) {
    console.error('SAE narrative error:', error);
    return serverError(res, logger, 'saving SAE', error);
  }
});

// ── Benefit-Risk Assessment ──────────────────────────────────

/**
 * POST /api/safety-narratives/benefit-risk
 * Generate a benefit-risk assessment narrative (FDA/EMA BRAT framework)
 */
router.post('/benefit-risk', async (req: Request, res: Response) => {
  try {
    const { indication, treatmentName, efficacySummary, safetySummary, context } = req.body;

    if (!indication || !treatmentName || !efficacySummary || !safetySummary) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: indication, treatmentName, efficacySummary, safetySummary',
      });
    }

    const result = await safetyNarrativeService.generateBenefitRiskSummary({
      indication,
      treatmentName,
      efficacySummary,
      safetySummary,
      // Do not fabricate the disease severity / patient population the
      // benefit-risk argument is weighed against. An omitted context yields
      // honest "not specified" markers (rendered verbatim by the service),
      // never a clinically specific default like "moderate" / "adults" that
      // would misstate the population for a severe or pediatric indication.
      context: context || {
        availableTherapies: [],
        diseaseSeverity: 'not specified',
        patientPopulation: 'not specified',
      },
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Benefit-risk narrative error:', error);
    return serverError(res, logger, 'saving benefit risk', error);
  }
});

// ── Safety Signal Assessment ─────────────────────────────────

/**
 * POST /api/safety-narratives/signal-summary
 * Generate a signal assessment summary for PSUR/PBRER
 */
router.post('/signal-summary', async (req: Request, res: Response) => {
  try {
    const { signals } = req.body;

    if (!Array.isArray(signals)) {
      return res.status(400).json({
        success: false,
        error: 'Required field: signals (array of SignalData)',
      });
    }

    const narrative = await safetyNarrativeService.generateSignalSummary(signals);

    res.json({
      success: true,
      data: {
        narrative,
        signalCount: signals.length,
        wordCount: narrative.split(/\s+/).length,
      },
    });
  } catch (error: any) {
    console.error('Signal summary error:', error);
    return serverError(res, logger, 'saving signal summary', error);
  }
});

// ── Cross-Study Safety Comparison ────────────────────────────

/**
 * POST /api/safety-narratives/cross-study
 * Generate an integrated cross-study safety summary for IB/ISS
 */
router.post('/cross-study', async (req: Request, res: Response) => {
  try {
    const { studies } = req.body;

    if (!Array.isArray(studies) || studies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Required field: studies (non-empty array of CrossStudySafetyInput)',
      });
    }

    const narrative = await safetyNarrativeService.generateCrossStudySafetySummary(studies);

    res.json({
      success: true,
      data: {
        narrative,
        studyCount: studies.length,
        wordCount: narrative.split(/\s+/).length,
      },
    });
  } catch (error: any) {
    console.error('Cross-study safety summary error:', error);
    return serverError(res, logger, 'saving cross study', error);
  }
});

export default router;
