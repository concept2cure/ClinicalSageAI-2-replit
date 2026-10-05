import express from 'express';
import { getPool } from '../../db';
import { z } from 'zod';
import { writeThroughBatchRecord } from '../../services/cmc-write-through';
/* The one path from a register save to the Module 3 canonical layer: it awaits
   the write, reports { module3Linked, module3Warning } in the response and
   meters a failure. The program is the stored row's project_id, never the
   request body's, so no request is handed to it here. */
import { linkToModule3 } from '../../services/cmc/link-to-module3';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';
import { BINDING_BASIS, persistGovernedActionSignature } from '../../services/part11/signature-persistence';
import { signMeaningRefusal, type GovernedSignMeaning } from '../../services/part11/signature-meanings';
import { refusedWithoutSigningAuthority, verifiedReauthFactors } from './cmc-signer';
import { clientIpOf } from '../../utils/client-ip';
import { resolveActorUserId } from './governance';
import { batchReleaseRefusal, batchWriteRefusal } from '../../services/cmc/signed-record';
import { filedProjectOnCreate, RegisterWriteRefusal } from '../../services/cmc/register-writes';
/* The CANONICAL org resolver. This module defined its own, reading two of the
   four places the canonical one reads, in its own order — and a second answer
   to "which organization is this" is a tenant-isolation decision, not a helper
   (`ci:tenant-resolvers`). */
import { resolveOrgId } from '../../types/auth-request';

const router = express.Router();



/**
 * The caller's organization, or null when the request carries no usable tenant.
 *
 * `cmc_batch_records` names its owner in TWO columns: `organization_id INTEGER
 * NOT NULL` (migrations/0006, the original and authoritative one) and a later
 * nullable `tenant_id TEXT` (db/migrations/20260401_cmc_convergence_os.sql,
 * added to an already-populated table with no backfill). Reads therefore have
 * to accept either — but they must NEVER accept `tenant_id IS NULL`, which made
 * every pre-20260401 row visible to every organization.
 *
 * The two columns have different types, so a single bound parameter cannot
 * serve both: Postgres infers it as text from `tenant_id = $n` and then rejects
 * `organization_id = $n` with `operator does not exist: integer = text`. Hence
 * `tenantParams`, which returns the same identity twice — once as text for
 * tenant_id, once as a number for organization_id.
 */
/** `[textForTenantId, intForOrganizationId]` — see resolveOrgId. */
function tenantParams(orgId: number): [string, number] {
  return [String(orgId), orgId];
}

// Validation schemas
const createBatchSchema = z.object({
  projectId: z.string().uuid().optional(),
  batchNumber: z.string().min(1, 'Batch number is required'),
  productName: z.string().min(1, 'Product name is required'),
  batchSize: z.string().optional(),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().optional(),
  manufacturingSite: z.string().optional(),
  status: z.string().optional().default('in-progress'),
  processParameters: z.any().optional(),
  inProcessControls: z.any().optional(),
  yieldData: z.any().optional(),
  deviations: z.any().optional(),
});

const updateBatchSchema = z.object({
  batchNumber: z.string().optional(),
  productName: z.string().optional(),
  batchSize: z.string().optional(),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().optional(),
  manufacturingSite: z.string().optional(),
  status: z.string().optional(),
  processParameters: z.any().optional(),
  inProcessControls: z.any().optional(),
  yieldData: z.any().optional(),
  deviations: z.any().optional(),
});

const releaseSchema = z.object({
  releaseTesting: z.any(),
  /* Accepted for older clients and IGNORED: who released the batch is the
     session's signer, never a name the request types. */
  releasedBy: z.string().optional(),
  decision: z.enum(['approved', 'rejected', 'conditional']),
  comments: z.string().optional(),
  reason: z.string().min(8, 'A reason of at least 8 characters is required.'),
  /** Optional: when declared it must be the disposition's own meaning (releaseMeaning). */
  meaning: z.string().optional(),
  reauth: z
    .object({
      password: z.string().optional(),
      totp: z.string().optional(),
    })
    .optional(),
  idempotencyKey: z.string().optional(),
});

type ReleaseStatus = 'released' | 'conditional-release' | 'rejected' | 'pending-review';

/**
 * The release evaluation: each submitted test's verdict and the status the
 * disposition lands in. Pure (it reads only the request), so it runs before
 * the signer is asked for anything and the signature's meaning can follow it.
 */
function evaluateRelease(data: { releaseTesting?: unknown; decision: 'approved' | 'rejected' | 'conditional' }) {
  const releaseTestingData = data.releaseTesting || {};
  const testResults: Array<{ test: string; result: unknown; passed: boolean; evaluatedAt: string }> = [];
  let allPassed = true;
  if (typeof releaseTestingData === 'object') {
    for (const [testName, testValue] of Object.entries(releaseTestingData)) {
      const passed = testValue !== null && testValue !== undefined && testValue !== 'fail';
      testResults.push({ test: testName, result: testValue, passed, evaluatedAt: new Date().toISOString() });
      if (!passed) allPassed = false;
    }
  }
  let releaseStatus: ReleaseStatus;
  if (data.decision === 'rejected') releaseStatus = 'rejected';
  else if (data.decision === 'conditional') releaseStatus = 'conditional-release';
  else releaseStatus = allPassed ? 'released' : 'pending-review';
  return { testResults, allPassed, releaseStatus };
}

/*
 * What a batch disposition signature means (21 CFR 11.50(a)(3)). The release
 * route stored 'release' for every disposition, so a rejected batch carried a
 * signature that said it was released (P0-10b fix round, DP-58). The meaning
 * now follows the status the disposition lands in: 'release' only for a batch
 * this act releases, and 'responsibility' (the quality unit's, for the
 * disposition, 21 CFR 211.22(a)) for a conditional release, a rejection, or an
 * approval the release tests hold at pending-review. The disposition and the
 * status are on the signature manifest's `act`. The release form offers the
 * disposition and no separate meaning, so the disposition is what the signer
 * declared. A signer who also declares a meaning must declare this one: one
 * that contradicts the disposition is refused, never substituted.
 */
function releaseMeaning(releaseStatus: ReleaseStatus): GovernedSignMeaning {
  return releaseStatus === 'released' ? 'release' : 'responsibility';
}

/** The disposition's meaning, or the 400 body when the declared meaning is unknown or contradicts it. */
function dispositionMeaning(
  releaseStatus: ReleaseStatus,
  declared: string | undefined,
): { meaning: GovernedSignMeaning } | { refusal: { success: false; error: string; message: string } } {
  const meaning = releaseMeaning(releaseStatus);
  if (declared === undefined) return { meaning };
  const unknown = signMeaningRefusal(declared);
  if (unknown) {
    return { refusal: { success: false, error: unknown.error, message: `The signature meaning is not one the platform records. ${unknown.detail} Nothing was signed.` } };
  }
  if (declared !== meaning) {
    return {
      refusal: {
        success: false,
        error: 'SIGNATURE_MEANING_CONFLICT',
        message: `A disposition that leaves the batch '${releaseStatus}' is signed with the meaning '${meaning}', not '${declared}'. Nothing was signed.`,
      },
    };
  }
  return { meaning };
}

// GET /api/cmc/batch-records/:projectId - List batch records
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const orgId = resolveOrgId(req);
    if (orgId === null) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const pool = getPool();


    const result = await pool.query(
      `SELECT * FROM cmc_batch_records
       WHERE project_id = $1 AND (tenant_id = $2 OR organization_id = $3)
       ORDER BY created_at DESC`,
      // tenant_id OR organization_id — never `OR tenant_id IS NULL`, which made
      // every pre-20260401 row readable by every organization. Those rows are
      // not unattributed; organization_id names their real owner. See
      // resolveOrgId for why the identity is bound twice.
      [projectId, ...tenantParams(orgId)]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Batch] Error fetching batch records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch records',
      message: 'Operation failed',
    });
  }
});

/**
 * What a new batch is filed under, or why it is refused (409): a disposition
 * is only ever the signed release (services/cmc/signed-record), and the
 * program named must be this organisation's.
 */
async function batchFiling(
  orgId: number,
  body: Record<string, unknown>,
  sentProjectId: unknown,
): Promise<{ projectId: string | null } | { refusal: Record<string, unknown> }> {
  const signed = batchWriteRefusal(body);
  if (signed) return { refusal: { success: false, error: signed, code: 'SIGNED_RECORD' } };
  try {
    return { projectId: await filedProjectOnCreate(orgId, sentProjectId) };
  } catch (e) {
    if (e instanceof RegisterWriteRefusal) return { refusal: { success: false, error: e.message } };
    throw e;
  }
}

// POST /api/cmc/batch-records - Create batch record
router.post('/', async (req, res) => {
  try {
    const validationResult = createBatchSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const pool = getPool();
    const orgId = resolveOrgId(req);
    if (orgId === null) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const filing = await batchFiling(orgId, req.body ?? {}, data.projectId);
    if ('refusal' in filing) return res.status(409).json(filing.refusal);
    const { projectId } = filing;

    const result = await pool.query(
      `INSERT INTO cmc_batch_records (
        project_id, tenant_id, organization_id, batch_number, product_name, batch_size,
        manufacturing_date, expiry_date, manufacturing_site,
        status, process_parameters, in_process_controls,
        yield_data, deviations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        projectId,
        // organization_id is NOT NULL on the provisioned table (migrations/0006)
        // and IS the tenant — the same value, written to both columns so reads
        // scoped by either agree. tenantParams supplies it in each column's own
        // type; see its note.
        ...tenantParams(orgId),
        data.batchNumber,
        data.productName,
        data.batchSize || null,
        data.manufacturingDate || null,
        data.expiryDate || null,
        data.manufacturingSite || null,
        data.status || 'in-progress',
        JSON.stringify(data.processParameters || null),
        JSON.stringify(data.inProcessControls || null),
        JSON.stringify(data.yieldData || null),
        JSON.stringify(data.deviations || null),
      ]
    );

    const batch = result.rows[0];
    console.log(`[CMC Batch] Created batch record ${batch.id}: ${data.batchNumber}`);
    const linkage = await linkToModule3('write_through_batch', orgId, batch, writeThroughBatchRecord);

    res.status(201).json({
      success: true,
      data: batch,
      message: 'Batch record created successfully',
      timestamp: new Date().toISOString(),
      ...linkage,
    });
  } catch (error) {
    console.error('[CMC Batch] Error creating batch record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create batch record',
      message: 'Operation failed',
    });
  }
});

// PUT /api/cmc/batch-records/:id - Update batch record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validationResult = updateBatchSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const pool = getPool();
    const orgId = resolveOrgId(req);
    if (orgId === null) {
      return res.status(401).json({ success: false, error: 'Tenant context required' });
    }

    // Verify record exists and belongs to tenant
    const existing = await pool.query(
      `SELECT * FROM cmc_batch_records WHERE id = $1 AND (tenant_id = $2 OR organization_id = $3)`,
      [id, ...tenantParams(orgId)]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Batch record not found' });
    }
    /* Release testing and dispositions are the signed release's alone, and a
       batch that carries a signed disposition is closed to ordinary edits
       (services/cmc/signed-record). */
    const refusal = batchWriteRefusal(req.body ?? {}, existing.rows[0]);
    if (refusal) return res.status(409).json({ success: false, error: refusal, code: 'SIGNED_RECORD' });

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      batchNumber: 'batch_number',
      productName: 'product_name',
      batchSize: 'batch_size',
      manufacturingDate: 'manufacturing_date',
      expiryDate: 'expiry_date',
      manufacturingSite: 'manufacturing_site',
      status: 'status',
      processParameters: 'process_parameters',
      inProcessControls: 'in_process_controls',
      yieldData: 'yield_data',
      deviations: 'deviations',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        updates.push(`${col} = $${paramIndex}`);
        const val = (data as any)[key];
        if (typeof val === 'object' && val !== null) {
          values.push(JSON.stringify(val));
        } else {
          values.push(val);
        }
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    values.push(id, ...tenantParams(orgId));
    // The UPDATE carries the tenant predicate itself. It used to be
    // `WHERE id = $n` alone, inheriting its scope from the SELECT above — but a
    // SELECT is not a lock, and a write scoped by primary key alone is one
    // refactor away from being reachable without that SELECT at all.
    const updateQuery = `
      UPDATE cmc_batch_records
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex} AND (tenant_id = $${paramIndex + 1} OR organization_id = $${paramIndex + 2})
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, values);

    console.log(`[CMC Batch] Updated batch record ${id}`);
    // Fail closed on an UPDATE that matched nothing: the row was re-tenanted or
    // deleted between the existence SELECT and here. Reporting 200 over it
    // would tell the caller a change landed that did not.
    const updatedBatch = updateResult.rows[0];
    if (!updatedBatch) {
      return res.status(404).json({ success: false, error: 'Batch record not found' });
    }
    const linkage = await linkToModule3('write_through_batch', orgId, updatedBatch, writeThroughBatchRecord);

    res.json({
      success: true,
      data: updatedBatch,
      message: 'Batch record updated successfully',
      timestamp: new Date().toISOString(),
      ...linkage,
    });
  } catch (error) {
    console.error('[CMC Batch] Error updating batch record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update batch record',
      message: 'Operation failed',
    });
  }
});

// POST /api/cmc/batch-records/:id/release - Release testing and batch disposition.
// High-risk governed sign: the disposition's meaning, the signer's authority and
// re-authentication, then UPDATE + ledger write + the
// electronic_signatures row in one transaction. Until 2026-10-01 the ledger was
// the only record, so an inspector querying electronic_signatures found no
// release signature at all (P0-10b, DP-02), and any member who knew their own
// password could sign it (P0-10b fix round).
router.post('/:id/release', async (req, res) => {
  const { id } = req.params;
  const validationResult = releaseSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid input data',
      details: validationResult.error.errors,
    });
  }

  const data = validationResult.data;
  const { testResults, allPassed, releaseStatus } = evaluateRelease(data);
  const declared = dispositionMeaning(releaseStatus, data.meaning);
  if ('refusal' in declared) return res.status(400).json(declared.refusal);
  const { meaning } = declared;
  const pool = getPool();
  const orgId = resolveOrgId(req);
  if (orgId === null) {
    return res.status(401).json({ success: false, error: 'Tenant context required' });
  }
  const userId = resolveActorUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  // Signing authority (§11.10(g)), then the re-auth gate, before any write.
  if (await refusedWithoutSigningAuthority(res, { userId, orgId })) return;
  const reauthResult = await verifyReauth(userId, data.reauth);
  if (!reauthResult.ok) {
    res.setHeader('WWW-Authenticate', 'ReAuth required');
    return res.status(401).json({ error: reauthResult.error ?? 'REAUTH_REQUIRED' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify record exists and belongs to tenant
    const existing = await client.query(
      `SELECT * FROM cmc_batch_records WHERE id = $1 AND (tenant_id = $2 OR organization_id = $3)`,
      [id, ...tenantParams(orgId)]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Batch record not found' });
    }

    const batch = existing.rows[0];
    const finalRefusal = batchReleaseRefusal(batch);
    if (finalRefusal) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: finalRefusal, code: 'ALREADY_DISPOSITIONED' });
    }
    /* Who released the batch is the signer of this session. It used to be
       `releasedBy` from the request body, a name the client typed. */
    const signer = await client.query(`SELECT name, email FROM users WHERE id = $1`, [userId]);
    const releasedBy = String(signer.rows[0]?.name || signer.rows[0]?.email || `user ${userId}`);

    // The release evaluation (evaluateRelease) ran before the signer was asked
    // for anything, so the signature's meaning could follow its status.
    const releaseRecord = {
      decision: data.decision,
      releasedBy,
      comments: data.comments || null,
      testResults,
      allTestsPassed: allPassed,
      releaseStatus,
      releasedAt: new Date().toISOString(),
    };

    // Update batch record with release data
    const updateResult = await client.query(
      `UPDATE cmc_batch_records
       SET release_testing = $1,
           release_status = $2,
           released_by = $3,
           released_at = NOW(),
           status = $4,
           updated_at = NOW()
       WHERE id = $5 AND (tenant_id = $6 OR organization_id = $7)
       RETURNING *`,
      [
        JSON.stringify(releaseRecord),
        releaseStatus,
        releasedBy,
        releaseStatus === 'released' ? 'completed' : batch.status,
        id,
        ...tenantParams(orgId),
      ]
    );

    // Fail closed BEFORE the signature. If the UPDATE matched nothing — the row
    // was re-tenanted or deleted after the existence SELECT — the handler used
    // to continue: it recorded a governed e-signature against `batch:${id}`,
    // COMMITted, and returned 200 with `batchRecord: undefined`. Under
    // 21 CFR 11.50 a signature manifestation names the record it applies to, so
    // a release signature over a record this transaction did not write is a
    // falsified one, and the 200 tells a QA head a batch was dispositioned when
    // no such disposition exists.
    if (!updateResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Batch record not found' });
    }

    const governance = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'sign',
      target: `batch:${id}`,
      reason: data.reason,
      payload: { meaning, decision: data.decision, releaseStatus },
      domain: 'biopharma',
      surface: 'cmc-batch',
      idempotencyKey: data.idempotencyKey ?? null,
    });

    // 21 CFR Part 11 signature row, same transaction as the ledger pair: the
    // signer's printed name, time and meaning (11.50) bound to the act (11.70).
    // The factors are the ones verifyReauth verified above.
    await persistGovernedActionSignature(client, {
      orgId,
      userId,
      target: `batch:${id}`,
      reason: data.reason,
      payload: { meaning },
      actionId: governance.actionId,
      auditId: governance.auditId,
      sha256Chain: governance.sha256Chain,
      ...verifiedReauthFactors(data.reauth),
      ipAddress: clientIpOf(req),
      occurredAt: new Date(),
      binding: { digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER, note: 'No content digest is registered for a batch record, so none is claimed: bound_payload_digest is the governed action audit sha256 chain hash (target, payload hash, actor, time), not a content hash.' },
      extraManifest: { act: { decision: data.decision, releaseStatus } },
      complianceStatement: 'Batch release disposition applied under 21 CFR Part 11 §11.50/§11.70/§11.200; ledger-chained to the audit_logs sha256 chain.',
    });

    await client.query('COMMIT');

    console.log(`[CMC Batch] Release testing for batch ${id}: ${releaseStatus}`);
    /* The release decision is committed under its signature above; whether it
       reached the dossier layer is reported, never assumed. */
    const releasedBatch = updateResult.rows[0];
    const linkage = await linkToModule3('write_through_batch', orgId, releasedBatch, writeThroughBatchRecord);

    return res.json({
      success: true,
      data: {
        batchRecord: releasedBatch,
        releaseEvaluation: releaseRecord,
      },
      governance: { actionId: governance.actionId, sha256Chain: governance.sha256Chain },
      message: `Batch ${releaseStatus === 'released' ? 'released' : 'release decision recorded'} successfully`,
      timestamp: new Date().toISOString(),
      ...linkage,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    console.error('[CMC Batch] Error processing release:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process batch release',
      message: 'Operation failed',
    });
  } finally {
    client.release();
  }
});

export default router;
