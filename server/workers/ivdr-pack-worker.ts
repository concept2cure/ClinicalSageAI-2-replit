/**
 * IVDR Pack Build Worker
 *
 * Minimal in-process worker that:
 *   1. Claims QUEUED jobs via SELECT ... FOR UPDATE SKIP LOCKED
 *   2. Validates readiness (binder claims + evidence)
 *   3. Builds deterministic snapshot
 *   4. Generates manifest JSON
 *   5. Computes hashes (stable-stringify → SHA-256)
 *   6. Creates pack + snapshot records in a single transaction
 *   7. Emits audit events
 *
 * Runs on a 2-second interval (configurable). Safe for multiple instances
 * due to SKIP LOCKED.
 *
 * @module server/workers/ivdr-pack-worker
 * @version 1.0.0
 */

import { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { buildManifestV1 } from '../services/ivdrPackManifest';
import { buildIvdrPackContent } from '../services/ivdrPackContent';
import { generateIvdrDocx } from '../services/docxGenerator';
import { renderIvdrPackHtml } from '../services/ivdrPackHtml';
import { renderHtmlToPdfTracked } from '../export/renderers';
import { putBytes, isVaultAvailable } from '../services/vaultService';
import archiver from 'archiver';

// ── Stable stringify (in-line to avoid import issues in worker context) ──────

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !isFinite(value)) return 'null';
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (typeof value === 'object') {
    if (typeof (value as any).toJSON === 'function')
      return stableStringify((value as any).toJSON());
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs: string[] = [];
    for (const key of keys) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      pairs.push(JSON.stringify(key) + ':' + stableStringify(v));
    }
    return '{' + pairs.join(',') + '}';
  }
  return 'null';
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ── Safe error mapping for pack build failures ──────────────────────────────

interface SafePackError {
  code: string;
  label: string;
}

function safePackError(error: any): SafePackError {
  const msg = error?.message || '';

  if (msg.includes('IVDR_NOT_READY'))
    return { code: 'IVDR_NOT_READY', label: 'Required binder claims not approved' };
  if (msg.includes('IVDR_NO_CLAIMS'))
    return { code: 'IVDR_NO_CLAIMS', label: 'No required claims found for this pack type' };
  if (msg.includes('IVDR_MISSING_EVIDENCE'))
    return { code: 'IVDR_MISSING_EVIDENCE', label: 'One or more claims missing evidence' };
  if (msg.includes('IVDR_SNAPSHOT_FAILED'))
    return { code: 'IVDR_SNAPSHOT_FAILED', label: 'Snapshot generation failed' };
  if (msg.includes('IVDR_HASH_FAILED'))
    return { code: 'IVDR_HASH_FAILED', label: 'Hash computation failed' };
  if (msg.includes('IVDR_VAULT_UNAVAILABLE'))
    return { code: 'IVDR_VAULT_UNAVAILABLE', label: 'Vault storage not available' };
  if (msg.includes('IVDR_ARTIFACT'))
    return { code: 'IVDR_ARTIFACT_FAILED', label: 'Artifact generation or upload failed' };
  if (error?.code === '42P01')
    return { code: 'IVDR_NOT_PROVISIONED', label: 'IVDR tables not yet provisioned' };
  if (error?.code === '23503')
    return { code: 'IVDR_FK_VIOLATION', label: 'Referenced record no longer exists' };
  if (error?.code === '23505')
    return { code: 'IVDR_DUPLICATE', label: 'Pack version conflict — retry' };

  return { code: 'IVDR_PACK_BUILD_FAILED', label: 'Pack build failed unexpectedly' };
}

// ── Audit event emitter ─────────────────────────────────────────────────────

async function emitAudit(
  client: PoolClient | Pool,
  orgId: number,
  projectId: string,
  userId: string,
  userName: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const numericUserId = Number(userId) || 0;
    const now = new Date();
    await client.query(
      `INSERT INTO audit_events
         (organization_id, event_type, entity_type, entity_id, user_id, user_name, metadata, "timestamp", created_at)
       VALUES ($1, $2, 'ivdr_pack', 0, $3, $4, $5::json, $6, $6)`,
      [
        orgId,
        eventType,
        numericUserId,
        userName || userId,
        JSON.stringify({ ...payload, projectId }),
        now,
      ]
    );
  } catch (err) {
    console.error(`[IVDR-PackWorker] Audit emit failed for ${eventType}:`, err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER CORE
// ═══════════════════════════════════════════════════════════════════════════════

interface ClaimedJob {
  id: string;
  organization_id: number;
  project_id: string;
  pack_type: string;
  requested_by_user_id: string;
  outputs: string[];
  use_latest_approved: boolean;
  sign_build: boolean;
}

/**
 * Claim the next QUEUED job using FOR UPDATE SKIP LOCKED.
 * Safe for concurrent workers.
 */
async function claimNextJob(pool: Pool): Promise<ClaimedJob | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const jobRes = await client.query(
      `SELECT id, organization_id, project_id, pack_type,
              requested_by_user_id, outputs, use_latest_approved, sign_build
       FROM ivdr_pack_build_jobs
       WHERE status = 'QUEUED'
       ORDER BY requested_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );

    if (jobRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const job = jobRes.rows[0];

    await client.query(
      `UPDATE ivdr_pack_build_jobs SET status = 'RUNNING', started_at = NOW() WHERE id = $1`,
      [job.id]
    );

    await client.query('COMMIT');

    return {
      ...job,
      outputs: Array.isArray(job.outputs) ? job.outputs : JSON.parse(job.outputs || '["MANIFEST"]'),
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Main pack build pipeline.
 * Runs inside a transaction for atomicity.
 */
async function runPackBuild(pool: Pool, job: ClaimedJob): Promise<string> {
  const orgId = job.organization_id;
  const projectId = job.project_id;
  const packType = job.pack_type;
  const userId = job.requested_by_user_id || 'system';

  // ── Step 1: Validate readiness ─────────────────────────────────────────

  const requiredClaims = await pool.query(
    `SELECT c.id, c.claim_key, c.title, c.status,
            (SELECT COUNT(*) FROM ivdr_binder_evidence e WHERE e.claim_id = c.id AND e.removed_at IS NULL) AS evidence_count
     FROM ivdr_binder_claims c
     WHERE c.organization_id = $1 AND c.project_id = $2
       AND c.required_for_pack = TRUE
       AND (c.pack_scope = $3 OR c.pack_scope = 'BOTH')`,
    [orgId, projectId, packType]
  );

  if (requiredClaims.rows.length === 0) {
    throw new Error('IVDR_NO_CLAIMS');
  }

  for (const claim of requiredClaims.rows) {
    if (claim.status !== 'APPROVED') {
      throw new Error(`IVDR_NOT_READY: claim ${claim.claim_key} is ${claim.status}`);
    }
    if (parseInt(claim.evidence_count, 10) === 0) {
      throw new Error(`IVDR_MISSING_EVIDENCE: claim ${claim.claim_key} has no evidence`);
    }
  }

  // ── Step 2: Build snapshot ─────────────────────────────────────────────

  // Collect all claims + evidence for this pack
  const allClaims = await pool.query(
    `SELECT id, claim_key, title, status, required_for_pack
     FROM ivdr_binder_claims
     WHERE organization_id = $1 AND project_id = $2
       AND (pack_scope = $3 OR pack_scope = 'BOTH')
     ORDER BY claim_key`,
    [orgId, projectId, packType]
  );

  const claimIds = allClaims.rows.map((c: any) => c.id);
  const requiredClaimIds = allClaims.rows
    .filter((c: any) => c.required_for_pack)
    .map((c: any) => c.id);

  let evidenceIds: string[] = [];
  let vaultRefs: Array<{ vaultFileId: string; vaultVersionId: string; title?: string }> = [];

  if (claimIds.length > 0) {
    const evidenceResult = await pool.query(
      `SELECT id, vault_file_id, vault_version_id
       FROM ivdr_binder_evidence
       WHERE claim_id = ANY($1) AND removed_at IS NULL
       ORDER BY created_at`,
      [claimIds]
    );
    evidenceIds = evidenceResult.rows.map((e: any) => e.id);
    vaultRefs = evidenceResult.rows.map((e: any) => ({
      vaultFileId: e.vault_file_id,
      vaultVersionId: e.vault_version_id,
    }));
  }

  // Collect IVDR record IDs (classifications, validations, evidence, cdx)
  const classResult = await pool
    .query(
      `SELECT id FROM ivdr_classifications WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orgId]
    )
    .catch(() => ({ rows: [] }));

  const analyticalResult = await pool
    .query(
      `SELECT id FROM ivdr_analytical_validations WHERE organization_id = $1 ORDER BY created_at`,
      [orgId]
    )
    .catch(() => ({ rows: [] }));

  const clinicalResult = await pool
    .query(`SELECT id FROM ivdr_clinical_evidence WHERE organization_id = $1 ORDER BY created_at`, [
      orgId,
    ])
    .catch(() => ({ rows: [] }));

  const cdxResult = await pool
    .query(
      `SELECT id FROM ivdr_cdx_workflows WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orgId]
    )
    .catch(() => ({ rows: [] }));

  const snapshot = {
    snapshotVersion: '1.0' as const,
    organizationId: orgId,
    projectId,
    packType,
    ivdrRecordIds: {
      classificationId: classResult.rows[0]?.id || undefined,
      analyticalValidationIds: analyticalResult.rows.map((r: any) => r.id),
      clinicalEvidenceIds: clinicalResult.rows.map((r: any) => r.id),
      cdxWorkflowId: cdxResult.rows[0]?.id || undefined,
    },
    binder: {
      claimIds,
      requiredClaimIds,
      claimEvidenceIds: evidenceIds,
    },
    vault: {
      refs: vaultRefs,
      excerpts: [], // filled when excerpt selection is implemented
    },
    buildOptions: {
      useLatestApprovedOnly: job.use_latest_approved,
      outputs: job.outputs,
    },
  };

  const snapshotStable = stableStringify(snapshot);
  const snapshotHash = sha256(snapshotStable);

  // ── Step 3: Allocate version + create pack in a transaction ────────────

  const client = await pool.connect();
  let packId: string;
  let packVersion: number;

  try {
    await client.query('BEGIN');

    // Lock or create counter row
    await client.query(
      `INSERT INTO ivdr_pack_counters (organization_id, project_id, pack_type, next_version)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (organization_id, project_id, pack_type) DO NOTHING`,
      [orgId, projectId, packType]
    );

    const counterRow = await client.query(
      `SELECT next_version FROM ivdr_pack_counters
       WHERE organization_id = $1 AND project_id = $2 AND pack_type = $3
       FOR UPDATE`,
      [orgId, projectId, packType]
    );

    packVersion = counterRow.rows[0].next_version as number;

    // Increment counter
    await client.query(
      `UPDATE ivdr_pack_counters SET next_version = next_version + 1
       WHERE organization_id = $1 AND project_id = $2 AND pack_type = $3`,
      [orgId, projectId, packType]
    );

    // Build the manifest hash (the manifest content includes the snapshot hash)
    const manifestContent = {
      manifestVersion: '1.0',
      packId: 'pending', // will be filled after insert
      packType,
      packVersion,
      snapshotHash,
      generatedAt: new Date().toISOString(),
      claims: allClaims.rows.map((c: any) => ({
        claimId: c.id,
        claimKey: c.claim_key,
        status: c.status,
      })),
    };
    const manifestStable = stableStringify(manifestContent);
    const manifestHash = sha256(manifestStable);

    // Insert pack row with BUILDING status — NOT SUCCEEDED yet
    const packResult = await client.query(
      `INSERT INTO ivdr_packs
         (organization_id, project_id, pack_type, pack_version, status,
          created_by_user_id, manifest_hash_sha256, snapshot_hash_sha256)
       VALUES ($1, $2, $3, $4, 'BUILDING', $5, $6, $7)
       RETURNING id`,
      [orgId, projectId, packType, packVersion, userId, manifestHash, snapshotHash]
    );

    packId = packResult.rows[0].id;

    // Insert snapshot
    await client.query(
      `INSERT INTO ivdr_pack_snapshots
         (organization_id, project_id, pack_id, snapshot_json, snapshot_hash_sha256)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [orgId, projectId, packId, snapshotStable, snapshotHash]
    );

    // Pack stays BUILDING — promoted after artifacts are stored
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // ── Steps 4-9: Artifact generation + vault storage ─────────────────────
  // Wrapped in try/catch so pack row is marked FAILED on error
  // (not left BUILDING forever).

  try {
    // ── Step 4: Generate manifest via manifest builder ─────────────────────

    console.log(`[IVDR-PackWorker] Generating artifacts for pack ${packId}`);

    const {
      manifest,
      manifestJson,
      manifestHash: mHash,
    } = await buildManifestV1({
      pool,
      packId,
      packType,
      packVersion,
      organizationId: orgId,
      projectId,
      snapshotHashSha256: snapshotHash,
      claimIds,
    });

    const manifestBuf = Buffer.from(manifestJson, 'utf8');

    // ── Step 5: Build content model → DOCX & PDF ───────────────────────────

    const buildWarnings: Array<{ code: string; message: string; timestamp: string }> = [];

    const packContent = await buildIvdrPackContent({
      pool,
      organizationId: orgId,
      projectId,
      packId,
      packType,
      packVersion,
      manifest,
    });

    const docxBuf = await generateIvdrDocx(packContent);

    const html = renderIvdrPackHtml(packContent);
    const { buffer: pdfBuf, usedFallback } = await renderHtmlToPdfTracked(html);

    if (usedFallback) {
      const warning = {
        code: 'PDF_FALLBACK',
        message: 'PDF rendered via PDFKit plain-text fallback (Puppeteer unavailable)',
        timestamp: new Date().toISOString(),
      };
      buildWarnings.push(warning);
      console.warn(
        `[IVDR-PackWorker] Puppeteer unavailable — PDF rendered via plain-text fallback for pack ${packId}`
      );
      await emitAudit(pool, orgId, projectId, userId, userId, 'PACK_BUILD_WARNING', {
        packId,
        packVersion,
        warning: warning.message,
      });
    }

    // ── Step 6: Back-fill artifact hashes into manifest, then package ZIP ───

    // Compute artifact content hashes
    const docxSha256 = createHash('sha256').update(docxBuf).digest('hex');
    const pdfSha256 = createHash('sha256').update(pdfBuf).digest('hex');

    // Inject into manifest so the ZIP contains the self-referencing manifest
    manifest.hashes.artifactHashes = {
      docx: docxSha256,
      pdf: pdfSha256,
    };
    if (buildWarnings.length > 0) {
      (manifest as any).buildWarnings = buildWarnings;
    }

    // Re-serialize manifest with artifact hashes
    const finalManifestJson = JSON.stringify(manifest, null, 2);
    const manifestBufFinal = Buffer.from(finalManifestJson, 'utf8');

    const zipBuf = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      const baseName = `IVDR_${packType}_v${packVersion}`;
      archive.append(manifestBufFinal, { name: `${baseName}_manifest.json` });
      archive.append(docxBuf, { name: `${baseName}.docx` });
      archive.append(pdfBuf, { name: `${baseName}.pdf` });
      archive.finalize();
    });

    // ── Step 7: Upload all artifacts to vault ───────────────────────────────

    if (!isVaultAvailable()) {
      throw new Error('IVDR_VAULT_UNAVAILABLE');
    }

    const baseName = `IVDR_${packType}_v${packVersion}`;
    const vaultMeta = { packId, packType, packVersion: String(packVersion) };

    const [manifestVault, docxVault, pdfVault, zipVault] = await Promise.all([
      putBytes({
        orgId,
        projectId,
        filename: `${baseName}_manifest.json`,
        bytes: manifestBufFinal,
        mime: 'application/json',
        metadata: vaultMeta,
      }),
      putBytes({
        orgId,
        projectId,
        filename: `${baseName}.docx`,
        bytes: docxBuf,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        metadata: vaultMeta,
      }),
      putBytes({
        orgId,
        projectId,
        filename: `${baseName}.pdf`,
        bytes: pdfBuf,
        mime: 'application/pdf',
        metadata: vaultMeta,
      }),
      putBytes({
        orgId,
        projectId,
        filename: `${baseName}.zip`,
        bytes: zipBuf,
        mime: 'application/zip',
        metadata: vaultMeta,
      }),
    ]);

    console.log(
      `[IVDR-PackWorker] Stored 4 artifacts in vault: manifest=${manifestVault.sha256.substring(0, 12)}… docx=${docxVault.sha256.substring(0, 12)}… pdf=${pdfVault.sha256.substring(0, 12)}… zip=${zipVault.sha256.substring(0, 12)}…`
    );

    // ── Step 8: Update pack with vault refs, artifact hashes, warnings → promote ──

    const hasWarnings = buildWarnings.length > 0;

    await pool.query(
      `UPDATE ivdr_packs SET
       status = 'SUCCEEDED',
       manifest_hash_sha256 = $2,
       manifest_vault_file_id = $3, manifest_vault_version_id = $4,
       pdf_vault_file_id = $5, pdf_vault_version_id = $6,
       docx_vault_file_id = $7, docx_vault_version_id = $8,
       zip_vault_file_id = $9, zip_vault_version_id = $10,
       manifest_sha256 = $11, manifest_size_bytes = $12,
       pdf_sha256 = $13, pdf_size_bytes = $14,
       docx_sha256 = $15, docx_size_bytes = $16,
       zip_sha256 = $17, zip_size_bytes = $18,
       has_warnings = $19, warnings_jsonb = $20
     WHERE id = $1`,
      [
        packId,
        mHash,
        manifestVault.vaultFileId,
        manifestVault.vaultVersionId,
        pdfVault.vaultFileId,
        pdfVault.vaultVersionId,
        docxVault.vaultFileId,
        docxVault.vaultVersionId,
        zipVault.vaultFileId,
        zipVault.vaultVersionId,
        manifestVault.sha256,
        manifestVault.sizeBytes,
        pdfVault.sha256,
        pdfVault.sizeBytes,
        docxVault.sha256,
        docxVault.sizeBytes,
        zipVault.sha256,
        zipVault.sizeBytes,
        hasWarnings,
        hasWarnings ? JSON.stringify(buildWarnings) : null,
      ]
    );

    // ── Step 9: Emit audit event ───────────────────────────────────────────

    await emitAudit(pool, orgId, projectId, userId, userId, 'PACK_BUILD_COMPLETED', {
      packId,
      packVersion,
      manifestHash: mHash,
      snapshotHash,
      claimCount: allClaims.rows.length,
      evidenceCount: evidenceIds.length,
      hasWarnings,
      warnings: buildWarnings,
      artifacts: {
        manifest: { sha256: manifestVault.sha256, sizeBytes: manifestVault.sizeBytes },
        docx: { sha256: docxVault.sha256, sizeBytes: docxVault.sizeBytes },
        pdf: { sha256: pdfVault.sha256, sizeBytes: pdfVault.sizeBytes },
        zip: { sha256: zipVault.sha256, sizeBytes: zipVault.sizeBytes },
      },
    });

    return packId;
  } catch (artifactError: any) {
    // ── Pack row must reflect reality: mark FAILED with error details ────
    const { code, label } = safePackError(artifactError);
    try {
      await pool.query(
        `UPDATE ivdr_packs SET
           status = 'FAILED',
           has_warnings = true,
           warnings_jsonb = $2
         WHERE id = $1 AND status = 'BUILDING'`,
        [
          packId,
          JSON.stringify([
            {
              code: 'PACK_BUILD_FAILED',
              errorCode: code,
              message: label,
              timestamp: new Date().toISOString(),
            },
          ]),
        ]
      );
      console.error(`[IVDR-PackWorker] Pack ${packId} marked FAILED: ${code} — ${label}`);
    } catch (updateErr) {
      // Best-effort: if we can't update the pack, still propagate the original error
      console.error(`[IVDR-PackWorker] Failed to mark pack ${packId} as FAILED:`, updateErr);
    }
    throw artifactError;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER LOOP
// ═══════════════════════════════════════════════════════════════════════════════

let workerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the pack build worker loop.
 * Polls every `intervalMs` (default 2000ms) for QUEUED jobs.
 */
export function startPackBuildWorker(pool: Pool, intervalMs = 2000): void {
  // Environment gate: only start worker if explicitly enabled.
  // Prevents every server instance from running the worker in multi-instance deployments.
  if (process.env.ENABLE_IVDR_WORKER !== 'true') {
    console.log('[IVDR-PackWorker] Worker disabled by env (set ENABLE_IVDR_WORKER=true to enable)');
    return;
  }

  if (workerTimer) {
    console.warn('[IVDR-PackWorker] Worker already running, skipping duplicate start');
    return;
  }

  console.log(`[IVDR-PackWorker] Worker enabled, starting poll loop (interval: ${intervalMs}ms)`);

  let idleLogCounter = 0;

  workerTimer = setInterval(async () => {
    try {
      const job = await claimNextJob(pool);
      if (!job) {
        // Log idle state every ~60s (30 ticks at 2s interval) to avoid spam
        idleLogCounter++;
        if (idleLogCounter % 30 === 1) {
          console.log('[IVDR-PackWorker] Worker running, idle — no queued jobs');
        }
        return;
      }
      idleLogCounter = 0; // reset on activity

      console.log(`[IVDR-PackWorker] Processing job ${job.id} for project ${job.project_id}`);

      try {
        const packId = await runPackBuild(pool, job);

        await pool.query(
          `UPDATE ivdr_pack_build_jobs
           SET status = 'SUCCEEDED', completed_at = NOW(), output_pack_id = $2
           WHERE id = $1`,
          [job.id, packId]
        );

        console.log(`[IVDR-PackWorker] Job ${job.id} succeeded → pack ${packId}`);
      } catch (buildError: any) {
        const { code, label } = safePackError(buildError);
        console.error(`[IVDR-PackWorker] Job ${job.id} failed: ${code} — ${label}`);

        await pool.query(
          `UPDATE ivdr_pack_build_jobs
           SET status = 'FAILED', completed_at = NOW(), error_code = $2, error_label = $3
           WHERE id = $1`,
          [job.id, code, label]
        );

        await emitAudit(
          pool,
          job.organization_id,
          job.project_id,
          job.requested_by_user_id || 'system',
          job.requested_by_user_id || 'system',
          'PACK_BUILD_FAILED',
          {
            jobId: job.id,
            errorCode: code,
            errorLabel: label,
          }
        );
      }
    } catch (loopError) {
      // Claim or outer error — log but don't crash the loop
      console.error('[IVDR-PackWorker] Worker loop error:', loopError);
    }
  }, intervalMs);
}

/**
 * Stop the pack build worker loop.
 */
export function stopPackBuildWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    console.log('[IVDR-PackWorker] Worker stopped');
  }
}
