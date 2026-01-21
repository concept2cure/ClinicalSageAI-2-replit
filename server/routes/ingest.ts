import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';
import { toSql } from 'pgvector';
import fs from 'fs';
import path from 'path';
import { pool } from '../lib/db.js';
import { checkAuth } from '../controllers/auth.js';
import auditService from '../services/auditService.js';
import { generateEmbedding } from '../utils/ai_engine.js';
import { calculateHash, redactPHI } from '../utils/compliance';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF files are allowed'));
  },
});

router.post('/upload', checkAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const tokenTenantId = req.user?.organizationId;
    if (!tokenTenantId || Number.isNaN(Number(tokenTenantId))) {
      return res.status(403).json({ error: 'Tenant context missing from token' });
    }

    const tenantIdHeader = req.headers['x-organization-id'];
    if (tenantIdHeader && Number(tenantIdHeader) !== Number(tokenTenantId)) {
      return res.status(403).json({ error: 'Tenant mismatch' });
    }

    const tenantId = Number(tokenTenantId);

    const header = req.file.buffer.subarray(0, 4).toString('utf8');
    if (!header.startsWith('%PDF')) {
      return res.status(400).json({ error: 'Invalid PDF file' });
    }

    console.log(`[INGEST] 📥 Receiving file: ${req.file.originalname}`);

    const fileHash = calculateHash(req.file.buffer);
    const wormRoot = process.env.WORM_STORAGE_DIR || path.resolve(process.cwd(), 'worm_storage');
    const tenantWormDir = path.join(wormRoot, String(tenantId));
    const stagingDir = path.join(wormRoot, '_staging', String(tenantId));
    const stagingPath = path.join(stagingDir, `${fileHash}-${Date.now()}.pdf`);
    const wormPath = path.join(tenantWormDir, `${fileHash}.pdf`);

    let deepData: Record<string, unknown> | null = null;
    let protocolId = '';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id FROM csr_deep_vault WHERE deep_data->>'file_hash' = $1 AND deep_data->>'tenant_id' = $2 LIMIT 1`,
        [fileHash, String(tenantId)]
      );

      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Document already ingested' });
      }

      await fs.promises.mkdir(stagingDir, { recursive: true });
      await fs.promises.writeFile(stagingPath, req.file.buffer, { flag: 'wx', mode: 0o600 });

      const data = await pdf(req.file.buffer);
      const text = redactPHI((data.text || '').toLowerCase());

      console.log(`[INGEST] 🧠 Vectorizing content (${text.length} chars)...`);
      const vector = await generateEmbedding(text);

      const adverseCount = (text.match(/adverse event/g) || []).length;
      const seriousCount = (text.match(/serious/g) || []).length;
      const patientCount = (text.match(/patient/g) || []).length;

      protocolId = req.file.originalname.replace(/\.pdf$/i, '').toUpperCase();

      console.log(`[INGEST] 🧠 Analyzed ${protocolId}: ${adverseCount} AEs found.`);

      const query = `
        INSERT INTO csr_deep_vault (filename, ingest_date, deep_data, embedding)
        VALUES ($1, NOW(), $2, $3)
        RETURNING id;
      `;

      const actorId = Number.isFinite(Number(req.user?.appUserId))
        ? Number(req.user?.appUserId)
        : null;

      deepData = {
        protocol_id: protocolId,
        adverse_events: adverseCount,
        serious_ae: seriousCount,
        enrollment_current: patientCount,
        status: 'Active',
        file_hash: fileHash,
        worm_storage_path: wormPath,
        worm_storage_root: wormRoot,
        worm_storage_status: 'staged',
        worm_storage_staging_path: stagingPath,
        file_size_bytes: req.file.size,
        mime_type: req.file.mimetype,
        extracted_text_length: text.length,
        ingested_by: actorId,
        custodian_id: actorId,
        tenant_id: tenantId,
        compliance: {
          sha256: fileHash,
          phi_redacted: true,
          data_processing_agreement: 'v2026.1',
          immutable_storage: true,
        },
        source_storage: {
          type: 'worm_fs',
          path: wormPath,
          immutable: true,
          stored_at: null,
        },
        ingested_at: new Date().toISOString(),
      };

      const insertResult = await client.query(query, [req.file.originalname, deepData, toSql(vector)]);
      const vaultId = insertResult.rows[0]?.id;

      const auditUserId = actorId;

      await client.query(
        `INSERT INTO audit_logs (
          tenant_id, user_id, action, resource_type, resource_id,
          details, ip_address, user_agent, session_id, severity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId,
          auditUserId,
          auditService.ACTIONS.DATA_IMPORT,
          auditService.RESOURCE_TYPES.ANALYSIS,
          protocolId,
          JSON.stringify({
            filename: req.file.originalname,
            fileHash,
            fileSizeBytes: req.file.size,
            mimeType: req.file.mimetype,
            wormPath,
            adverse_events: adverseCount,
            serious_ae: seriousCount,
            enrollment_current: patientCount,
            phi_redacted: true,
          }),
          req.ip,
          req.headers['user-agent'] || null,
          req.headers['x-session-id'] || null,
          auditService.SEVERITY.INFO,
        ]
      );

      await client.query('COMMIT');

      await fs.promises.mkdir(tenantWormDir, { recursive: true });
      try {
        await fs.promises.rename(stagingPath, wormPath);
        await pool.query(
          `UPDATE csr_deep_vault
           SET deep_data = jsonb_set(
             jsonb_set(deep_data, '{worm_storage_status}', '"stored"'::jsonb, true),
             '{source_storage,stored_at}', to_jsonb(NOW()), true
           )
           WHERE id = $1`,
          [vaultId]
        );
      } catch (storageError) {
        await pool.query(
          `UPDATE csr_deep_vault
           SET deep_data = jsonb_set(
             jsonb_set(deep_data, '{worm_storage_status}', '"failed"'::jsonb, true),
             '{worm_storage_error}', to_jsonb($2::text), true
           )
           WHERE id = $1`,
          [vaultId, (storageError as Error)?.message || 'WORM storage failed']
        );
        await auditService.logAction({
          tenantId,
          userId: auditUserId,
          action: 'worm.storage.failed',
          resourceType: auditService.RESOURCE_TYPES.ANALYSIS,
          resourceId: protocolId,
          details: {
            filename: req.file.originalname,
            fileHash,
            wormPath,
            stagingPath,
            error: (storageError as Error)?.message || 'WORM storage failed',
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || null,
          sessionId: req.headers['x-session-id'] || null,
          severity: auditService.SEVERITY.HIGH,
        });
      }
    } catch (txError) {
      await client.query('ROLLBACK');
      try {
        await fs.promises.unlink(stagingPath);
      } catch (_) {
        // Swallow cleanup errors to preserve original failure context
      }
      throw txError;
    } finally {
      client.release();
    }

    res.json({ success: true, analysis: deepData, hash: fileHash });
  } catch (error) {
    console.error('[INGEST ERROR]', error);
    res.status(500).json({ error: 'Ingestion failed' });
  }
});

export default router;
