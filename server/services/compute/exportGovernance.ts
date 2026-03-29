/**
 * Export Governance Service
 *
 * Creates governed artifact records for export operations (PDF, DOCX, ZIP).
 * Export artifacts store reference metadata (filename, size, hash) rather than
 * the full binary content, since the file is streamed to the client.
 *
 * Each governed export creates:
 *   1. concept2cure_artifacts record (type='export_document', category='document')
 *   2. concept2cure_artifact_versions record (immutable version snapshot)
 *   3. concept2cure_provenance_events record (export provenance chain)
 *   4. regulatory_audit_logs record (21 CFR Part 11 audit trail)
 *   5. concept2cure_submission_snapshots record (immutable export snapshot)
 */
import crypto from 'node:crypto';
import { getPool } from '../../db.ts';
import { emitTraceEvent, createTraceId } from '../generation-guard.js';

export interface ExportGovernanceInput {
  organizationId: number;
  projectId: number;
  userId: number;
  userName: string;
  userRole: string;
  title: string;
  /** Stringified content that was exported (e.g., the TipTap JSON or HTML source) */
  sourceContent: string;
  /** The rendered output hash (SHA-256 of the PDF/DOCX/ZIP buffer) */
  exportHash: string;
  exportFormat: 'pdf' | 'docx' | 'zip';
  exportFilename: string;
  exportFileSize: number;
  /** Document type context: cerv2_510k, cerv2_pma, cerv2_cer, estar_510k */
  docType: string;
  /** CTD section if known */
  ctdSection?: string;
  /** The API route that produced this export */
  backendRoute: string;
  /** Governance metadata from the request */
  governance?: {
    aiGenerated: boolean;
    humanReviewApproved: boolean;
    reviewerName?: string;
    reviewTimestamp?: string;
  };
  ipAddress?: string;
}

export interface ExportGovernanceResult {
  artifactId: string;
  version: number;
  artifactTitle: string;
  artifactStatus: string;
  placementState: 'placed' | 'unplaced';
  provenanceEventId: string;
  auditId: string;
  snapshotId: string;
  governanceSource: string;
  governed: true;
}

/**
 * Register a governed export artifact with full provenance chain.
 *
 * Creates all 5 records in a single transaction. If the transaction fails,
 * the export still proceeds (degraded mode), and the caller gets null.
 */
export async function registerGovernedExport(
  input: ExportGovernanceInput
): Promise<ExportGovernanceResult | null> {
  const pool = getPool();
  const client = await pool.connect();
  const now = new Date();
  const externalArtifactId = `artifact_export_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const sourceContentHash = crypto.createHash('sha256').update(input.sourceContent).digest('hex');

  try {
    await client.query('BEGIN');

    // 1. Create artifact record
    const artifactInsert = await client.query(
      `INSERT INTO concept2cure_artifacts (
        artifact_id, project_id, organization_id, type, category, title, content,
        content_hash, version, ctd_section, status, created_by_id, metadata, created_at, updated_at
      ) VALUES ($1,$2,$3,'export_document','document',$4,$5,$6,1,$7,'draft',$8,$9,$10,$10)
      RETURNING id, artifact_id, version`,
      [
        externalArtifactId,
        input.projectId,
        input.organizationId,
        input.title,
        `[Governed Export: ${input.exportFormat.toUpperCase()}] ${input.exportFilename} (${input.exportFileSize} bytes)`,
        sourceContentHash,
        input.ctdSection ?? null,
        input.userId,
        JSON.stringify({
          source: 'governed_export',
          governanceSource: 'export',
          exportFormat: input.exportFormat,
          exportFilename: input.exportFilename,
          exportFileSize: input.exportFileSize,
          exportHash: input.exportHash,
          docType: input.docType,
          governed: true,
          provenancePresent: true,
          auditPresent: true,
          placementPresent: !!input.ctdSection,
          aiGenerated: input.governance?.aiGenerated ?? true,
          humanReviewApproved: input.governance?.humanReviewApproved ?? false,
          reviewerName: input.governance?.reviewerName,
          reviewTimestamp: input.governance?.reviewTimestamp,
          backendRoute: input.backendRoute,
        }),
        now,
      ]
    );

    const artifactPk = artifactInsert.rows[0].id;

    // 2. Create immutable version record
    const versionInsert = await client.query(
      `INSERT INTO concept2cure_artifact_versions (
        artifact_id, organization_id, version, content, content_hash,
        change_description, created_by_id, created_at, updated_at
      ) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$7)
      RETURNING id`,
      [
        artifactPk,
        input.organizationId,
        `[Governed Export: ${input.exportFormat.toUpperCase()}] ${input.exportFilename}`,
        sourceContentHash,
        `Governed ${input.exportFormat.toUpperCase()} export of ${input.docType} document "${input.title}"`,
        input.userId,
        now,
      ]
    );

    const versionPk = versionInsert.rows[0].id;

    // 3. Create provenance event
    const provenanceEventId = `prov_export_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await client.query(
      `INSERT INTO concept2cure_provenance_events (
        event_id, artifact_id, artifact_version_id, organization_id,
        event_type, event_action, actor_id, actor_name, actor_email,
        details, source_description, backend_route, backend_service,
        ip_address, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,'export',$5,$6,$7,NULL,$8,$9,$10,'cerv2-export',$11,$12,$12)`,
      [
        provenanceEventId,
        artifactPk,
        versionPk,
        input.organizationId,
        `governed_${input.exportFormat}_export`,
        input.userId,
        input.userName,
        JSON.stringify({
          exportFormat: input.exportFormat,
          exportFilename: input.exportFilename,
          exportFileSize: input.exportFileSize,
          exportHash: input.exportHash,
          sourceContentHash,
          docType: input.docType,
          governance: input.governance,
          generatedAt: now.toISOString(),
        }),
        `Governed ${input.exportFormat.toUpperCase()} export: ${input.title}`,
        input.backendRoute,
        input.ipAddress || '127.0.0.1',
        now,
      ]
    );

    // 4. Create audit log entry
    const auditId = `audit_export_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await client.query(
      `INSERT INTO regulatory_audit_logs (
        audit_id, organization_id, entity_type, entity_id, action, action_category,
        previous_value, new_value, user_id, user_name, user_role, ip_address,
        is_gxp_relevant, timestamp, metadata, created_at, updated_at
      ) VALUES ($1,$2,'artifact',$3,'EXPORT','data-change',NULL,$4,$5,$6,$7,$8,TRUE,$9,$10,$9,$9)`,
      [
        auditId,
        input.organizationId,
        externalArtifactId,
        JSON.stringify({
          title: input.title,
          exportFormat: input.exportFormat,
          exportFilename: input.exportFilename,
          exportFileSize: input.exportFileSize,
          exportHash: input.exportHash,
          docType: input.docType,
          aiGenerated: input.governance?.aiGenerated ?? true,
          humanReviewApproved: input.governance?.humanReviewApproved ?? false,
        }),
        input.userId,
        input.userName,
        input.userRole,
        input.ipAddress || '127.0.0.1',
        now,
        JSON.stringify({
          source: 'governed_export',
          backendRoute: input.backendRoute,
          provenanceEventId,
        }),
      ]
    );

    // 5. Create immutable submission snapshot
    const snapshotId = `snap_export_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await client.query(
      `INSERT INTO concept2cure_submission_snapshots (
        snapshot_id, artifact_id, organization_id, version_id,
        content_hash, export_hash, title, ctd_section,
        filename, file_size, action_type,
        actor_id, actor_name, actor_role,
        metadata, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)`,
      [
        snapshotId,
        artifactPk,
        input.organizationId,
        versionPk,
        sourceContentHash,
        input.exportHash,
        input.title,
        input.ctdSection ?? null,
        input.exportFilename,
        input.exportFileSize,
        `export-${input.exportFormat}`,
        input.userId,
        input.userName,
        input.userRole,
        JSON.stringify({
          docType: input.docType,
          governance: input.governance,
          provenanceEventId,
          auditId,
        }),
        now,
      ]
    );

    await client.query('COMMIT');

    // Trace: export_success
    const traceId = createTraceId();
    emitTraceEvent({
      traceId,
      timestamp: now.toISOString(),
      event: 'export_success',
      sourceSystem: (input.docType === 'cerv2_510k' ? 'cerv2_510k' : input.docType === 'cerv2_pma' ? 'cerv2_pma' : input.docType === 'cerv2_cer' ? 'cerv2_cer' : 'document_builder') as any,
      projectId: input.projectId,
      artifactId: externalArtifactId,
      userId: input.userId,
      metadata: {
        exportFormat: input.exportFormat,
        exportFilename: input.exportFilename,
        exportFileSize: input.exportFileSize,
        provenanceEventId,
        auditId,
        snapshotId,
      },
    });

    return {
      artifactId: externalArtifactId,
      version: 1,
      artifactTitle: input.title,
      artifactStatus: 'draft',
      placementState: input.ctdSection ? 'placed' : 'unplaced',
      provenanceEventId,
      auditId,
      snapshotId,
      governanceSource: 'export',
      governed: true,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ExportGovernance] Failed to register governed export — degraded mode:', error);

    // Trace: export_failure
    emitTraceEvent({
      traceId: createTraceId(),
      timestamp: new Date().toISOString(),
      event: 'export_failure',
      sourceSystem: 'document_builder' as any,
      projectId: input.projectId,
      userId: input.userId,
      metadata: { error: (error as Error).message, exportFormat: input.exportFormat },
    });

    return null;
  } finally {
    client.release();
  }
}

/**
 * Lightweight governance hook for routes that stream exports.
 *
 * Call this AFTER the export buffer is ready but BEFORE sending the response.
 * Non-blocking: if governance write fails, the export still proceeds (degraded mode).
 * Returns the governance result or null on failure.
 */
export async function registerExportGovernanceQuick(opts: {
  organizationId: number;
  projectId: number;
  userId: number;
  userName: string;
  userRole?: string;
  title: string;
  exportFormat: 'pdf' | 'docx' | 'zip' | 'csv' | 'xml' | 'markdown' | 'bibtex' | 'ris';
  exportFilename: string;
  exportFileSize: number;
  exportHash?: string;
  docType: string;
  backendRoute: string;
  ctdSection?: string;
  ipAddress?: string;
}): Promise<ExportGovernanceResult | null> {
  try {
    const contentHash = opts.exportHash ?? crypto.createHash('sha256')
      .update(`${opts.title}:${opts.exportFilename}:${opts.exportFileSize}`)
      .digest('hex');

    const normalizedFormat = (['pdf', 'docx', 'zip'].includes(opts.exportFormat)
      ? opts.exportFormat
      : 'zip') as 'pdf' | 'docx' | 'zip';

    return await registerGovernedExport({
      organizationId: opts.organizationId,
      projectId: opts.projectId,
      userId: opts.userId,
      userName: opts.userName,
      userRole: opts.userRole || 'user',
      title: opts.title,
      sourceContent: `[Export: ${opts.exportFormat}] ${opts.title}`,
      exportHash: contentHash,
      exportFormat: normalizedFormat,
      exportFilename: opts.exportFilename,
      exportFileSize: opts.exportFileSize,
      docType: opts.docType,
      backendRoute: opts.backendRoute,
      ctdSection: opts.ctdSection,
      ipAddress: opts.ipAddress,
    });
  } catch (err) {
    console.error('[ExportGovernanceQuick] Non-blocking governance registration failed:', err);
    return null;
  }
}
