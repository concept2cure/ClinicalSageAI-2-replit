/**
 * Vault document ingestion — the write path into vault.documents.
 *
 * Accepts a multipart file upload plus regulatory metadata and:
 *   1. Validates the payload (Zod schema)
 *   2. Verifies file bytes (magic-byte signature + ClamAV)
 *   3. Persists the file to local storage (tenant-scoped path)
 *   4. INSERTs a vault.documents row (processing_status = 'PENDING')
 *   5. Extracts text via the OCR service and stores it inline
 *   6. Returns the document record for the caller to track
 *
 * Mount: POST /api/vault/ingest
 *
 * Why this exists: prior to this route no production code path ever wrote
 * to vault.documents — documents could not enter the RAG corpus.
 * See DATA_KNOWLEDGE_MEMORY_LAYER_AUDIT.md §3 (GAP 1).
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db';
import { createScopedLogger } from '../utils/logger';
import { verifyFileSignature } from '../utils/fileSignature';
import { scanBuffer as scanForViruses } from '../utils/virusScan';

const logger = createScopedLogger('vault-ingest');

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.txt', '.rtf', '.xlsx', '.xls', '.csv', '.md',
]);
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed`));
    }
  },
  limits: { fileSize: MAX_FILE_SIZE },
});

const IngestBodySchema = z.object({
  programId: z.string().uuid('programId must be a UUID'),
  documentCode: z.string().min(1, 'documentCode is required'),
  documentTitle: z.string().min(1, 'documentTitle is required'),
  documentType: z.enum([
    'CSR', 'PROTOCOL', 'CER', 'IB', 'DSUR', 'PSUR',
    'SAP', 'SAR', 'MODULE_2', 'MODULE_3', 'MODULE_4', 'MODULE_5',
    'SOP', 'REPORT', 'CORRESPONDENCE', 'OTHER',
  ]),
  version: z.string().optional(),
  classification: z.enum(['CONFIDENTIAL', 'INTERNAL', 'CONTROLLED', 'PUBLIC']).optional(),
  retentionPolicy: z.string().optional(),
  parentDocumentId: z.string().uuid().optional(),
  supersedesId: z.string().uuid().optional(),
});

function sha256Bytes(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export default function createVaultIngestRoutes(): Router {
  const router = Router();

  router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    const fileBuffer: Buffer | undefined = (req as any).file?.buffer;
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_FILE_RECEIVED',
          message: 'Send the file as multipart/form-data under the field name "file".',
        },
      });
    }

    const parsed = IngestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
      });
    }
    const data = parsed.data;

    // Tenant ownership guard: this route runs on the owner `pool` connection
    // (RLS-bypassing), so it MUST verify at the application layer that the
    // caller's organization owns the target program before writing anything.
    // `vault.documents.program_id` carries no FK; the canonical org→program
    // mapping is `regulatory_programs` (uuid id, integer organization_id).
    const authedUser = (req as any).user;
    const rawOrg = authedUser?.organizationId ?? authedUser?.tenantId;
    const orgId = Number(rawOrg);
    if (rawOrg === undefined || rawOrg === null || rawOrg === '' || Number.isNaN(orgId)) {
      return res.status(403).json({
        error: {
          code: 'NO_ORG_CONTEXT',
          message: 'An authenticated organization context is required to ingest documents.',
        },
      });
    }
    try {
      const owns = await pool.query(
        `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [data.programId, orgId],
      );
      if (owns.rowCount === 0) {
        logger.warn('Vault ingest denied: program not owned by caller organization', {
          programId: data.programId,
          orgId,
        });
        return res.status(403).json({
          error: {
            code: 'PROGRAM_FORBIDDEN',
            message: 'Program not found or not owned by your organization.',
          },
        });
      }
    } catch (ownErr: any) {
      logger.error('Vault ingest program-ownership check failed', { err: ownErr?.message });
      return res.status(500).json({
        error: { code: 'OWNERSHIP_CHECK_FAILED', message: 'Could not verify program ownership.' },
      });
    }

    const fileName = (req as any).file?.originalname || 'document';
    const mimeType = (req as any).file?.mimetype || 'application/octet-stream';
    const fileSize = fileBuffer.length;
    const userId = (req as any).user?.id ?? null;

    // File signature verification
    const sig = verifyFileSignature(fileBuffer, mimeType);
    if (!sig.ok) {
      logger.warn('Vault ingest rejected by signature check', { fileName, reason: sig.reason });
      return res.status(400).json({
        error: { code: 'FILE_SIGNATURE_MISMATCH', message: 'File content does not match declared type' },
      });
    }

    // Virus scan
    const scan = await scanForViruses(fileBuffer);
    if (!scan.clean) {
      logger.warn('Vault ingest rejected by virus scanner', { fileName, signature: scan.signature });
      return res.status(400).json({
        error: { code: 'FILE_SCAN_REJECTED', message: 'File rejected by content scan' },
      });
    }

    const contentHash = sha256Bytes(fileBuffer);

    // Tenant-scoped local storage path (mirrors chat upload pattern)
    const storagePath = `uploads/vault/${data.programId}/${contentHash}${path.extname(fileName)}`;
    const s3Key = storagePath; // local-mode: key == path
    const s3Bucket = 'local';  // no S3 configured; downstream can migrate later

    try {
      const resolved = path.resolve(process.cwd(), storagePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, fileBuffer);
    } catch (err) {
      logger.warn('Vault file persistence failed (non-fatal)', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }

    // Text extraction (best-effort)
    let extractedText: string | null = null;
    let pageCount: number | null = null;
    let wordCount: number | null = null;
    try {
      const { extractDocumentText } = await import('../services/ocr/index.js');
      const extracted = await extractDocumentText(fileBuffer, mimeType, fileName);
      if (extracted.text && extracted.text.trim().length > 0) {
        extractedText = extracted.text;
        wordCount = extracted.text.trim().split(/\s+/).length;
        logger.info('Vault ingest text extracted', { chars: extracted.text.length, wordCount });
      }
    } catch (extractErr: any) {
      logger.warn('Vault ingest text extraction failed (non-fatal)', { err: extractErr?.message });
    }

    // INSERT into vault.documents
    const client = await pool.connect();
    try {
      // tenant-isolation-safe: vault.documents is program-scoped (program_id, no
      // org_id column); the caller's ownership of data.programId was already
      // enforced above against regulatory_programs.organization_id (403 on
      // mismatch), so this write is confined to a program the acting org owns.
      const result = await client.query(
        `INSERT INTO vault.documents (
          program_id, document_code, document_title, document_type,
          version, s3_bucket, s3_key, file_name, file_size, mime_type,
          content_hash, classification, retention_policy,
          parent_document_id, supersedes_id,
          extracted_text, page_count, word_count,
          processing_status, created_by
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15,
          $16, $17, $18,
          'PENDING', $19
        )
        ON CONFLICT (program_id, document_code, version) DO UPDATE SET
          document_title = EXCLUDED.document_title,
          document_type = EXCLUDED.document_type,
          s3_bucket = EXCLUDED.s3_bucket,
          s3_key = EXCLUDED.s3_key,
          file_name = EXCLUDED.file_name,
          file_size = EXCLUDED.file_size,
          mime_type = EXCLUDED.mime_type,
          content_hash = EXCLUDED.content_hash,
          classification = EXCLUDED.classification,
          retention_policy = EXCLUDED.retention_policy,
          parent_document_id = EXCLUDED.parent_document_id,
          supersedes_id = EXCLUDED.supersedes_id,
          extracted_text = EXCLUDED.extracted_text,
          page_count = EXCLUDED.page_count,
          word_count = EXCLUDED.word_count,
          processing_status = 'PENDING',
          updated_at = NOW()
        RETURNING id, processing_status, created_at, updated_at`,
        [
          data.programId,
          data.documentCode,
          data.documentTitle,
          data.documentType,
          data.version ?? '1.0',
          s3Bucket,
          s3Key,
          fileName,
          fileSize,
          mimeType,
          contentHash,
          data.classification ?? 'INTERNAL',
          data.retentionPolicy ?? null,
          data.parentDocumentId ?? null,
          data.supersedesId ?? null,
          extractedText,
          pageCount,
          wordCount,
          userId,
        ],
      );

      const doc = result.rows[0];
      logger.info('Vault document ingested', {
        id: doc.id,
        code: data.documentCode,
        type: data.documentType,
        size: fileSize,
        hasText: !!extractedText,
      });

      res.status(201).json({
        success: true,
        document: {
          id: doc.id,
          programId: data.programId,
          documentCode: data.documentCode,
          documentTitle: data.documentTitle,
          documentType: data.documentType,
          version: data.version ?? '1.0',
          fileName,
          fileSize,
          mimeType,
          contentHash,
          processingStatus: doc.processing_status,
          hasExtractedText: !!extractedText,
          wordCount,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        },
      });
    } catch (err: any) {
      logger.error('Vault ingest DB insert failed', { err: err?.message });
      res.status(500).json({
        error: { code: 'INGEST_FAILED', message: 'Failed to ingest document into vault' },
      });
    } finally {
      client.release();
    }
  });

  return router;
}
