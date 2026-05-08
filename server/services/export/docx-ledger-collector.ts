/**
 * Audit ledger collector.
 *
 * Pulls every provenance row for an artifact so the docx-ledger-embedder
 * can serialize it into a stable AnALedger XML payload. The collector is
 * tenant-scoped (organizationId on every query) and tolerant of missing
 * tables — anything not migrated yet contributes empty arrays so the
 * ledger still ships, just with whatever's available.
 *
 * The AnALedger contract:
 *   - artifact + active version + content_hash
 *   - org / project metadata
 *   - sentence-citation array (current snapshot)
 *   - gap classifications + readiness rollup
 *   - audit log (regulatory_audit_logs scoped to entity_type='artifact')
 *   - e-signatures (concept2cure_signatures across the artifact's versions)
 *   - applied + superseded proposals (forensic completeness)
 *   - citation run summary (count + latest)
 *   - model versions used (extracted from run_metadata)
 *
 * @module server/services/export/docx-ledger-collector
 */
import { getPool } from '../../db/runtime.js';

export interface LedgerArtifact {
  artifactId: string;
  artifactPk: number;
  organizationId: number;
  projectId: number;
  title: string;
  ctdSection: string | null;
  type: string;
  category: string;
  status: string;
  version: number;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lockedAt: string | null;
}

export interface LedgerOrganization {
  organizationId: number;
  name: string | null;
  uuid: string | null;
}

export interface LedgerProject {
  projectId: number;
  name: string | null;
}

export interface LedgerCitations {
  citationRunId: string | null;
  citationsAt: string | null;
  ranAgainstContentHash: string | null;
  /** Raw citations array as persisted on the artifact. */
  sentences: unknown[];
  totalSentences: number;
  supportedCount: number;
  contradictedCount: number;
  gapCount: number;
  totalReadinessDelta: number;
  filingBlocked: boolean;
}

export interface LedgerAuditEntry {
  auditId: string;
  action: string;
  actionCategory: string;
  changeReason: string | null;
  previousValue: unknown;
  newValue: unknown;
  userId: number | null;
  userName: string | null;
  userRole: string | null;
  ipAddress: string | null;
  isGxpRelevant: boolean;
  timestamp: string;
  metadata: unknown;
}

export interface LedgerSignature {
  signatureId: string;
  artifactVersionId: number | null;
  signatureType: string;
  signaturePurpose: string;
  signatureMeaning: string | null;
  signerId: number;
  signerName: string;
  signerEmail: string;
  signerRole: string | null;
  authenticationMethod: string;
  authenticationTimestamp: string;
  secondFactorVerified: boolean;
  signatureHash: string;
  signedAt: string;
}

export interface LedgerProposal {
  proposalId: string;
  status: string;
  threadId: string;
  sectionCode: string | null;
  targetAgency: string | null;
  rationale: string | null;
  contentHash: string;
  createdBy: number | null;
  createdAt: string;
  appliedAt: string | null;
  appliedAuditId: string | null;
  appliedVersionId: number | null;
  expiresAt: string;
}

export interface LedgerRunSummary {
  totalRuns: number;
  latestRunId: string | null;
  latestRunAt: string | null;
  modelsUsed: string[];
}

export interface ArtifactLedger {
  schemaVersion: string;
  generatedAt: string;
  artifact: LedgerArtifact;
  organization: LedgerOrganization;
  project: LedgerProject;
  citations: LedgerCitations | null;
  auditLog: LedgerAuditEntry[];
  signatures: LedgerSignature[];
  proposals: LedgerProposal[];
  runs: LedgerRunSummary;
}

const MAX_AUDIT = 500;
const MAX_PROPOSALS = 50;
const MAX_SIGNATURES = 200;
const ANALEDGER_SCHEMA_VERSION = '1.0';

function isMissingTable(err: any): boolean {
  return err?.code === '42P01';
}

async function loadArtifact(
  artifactId: string,
  organizationId: number
): Promise<{
  artifact: LedgerArtifact;
  organization: LedgerOrganization;
  project: LedgerProject;
  citations: LedgerCitations | null;
} | null> {
  const { rows } = await getPool().query(
    `SELECT a.id, a.artifact_id, a.organization_id, a.project_id,
            a.title, a.ctd_section, a.type, a.category, a.status,
            a.version, a.content_hash, a.created_at, a.updated_at,
            a.published_at, a.locked_at,
            a.citations, a.citation_run_id, a.citations_at,
            r.artifact_content_hash AS ran_against_content_hash,
            r.total_sentences, r.supported_count, r.contradicted_count,
            r.gap_count, r.total_readiness_delta, r.filing_blocked,
            o.name AS org_name, o.uuid AS org_uuid,
            p.name AS project_name
       FROM concept2cure_artifacts a
       LEFT JOIN ana_artifact_citation_runs r ON r.id = a.citation_run_id
       LEFT JOIN organizations o ON o.id = a.organization_id
       LEFT JOIN projects p ON p.id = a.project_id
      WHERE a.artifact_id = $1
        AND a.organization_id = $2
      LIMIT 1`,
    [artifactId, organizationId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    artifact: {
      artifactId: r.artifact_id,
      artifactPk: r.id,
      organizationId: r.organization_id,
      projectId: r.project_id,
      title: r.title,
      ctdSection: r.ctd_section,
      type: r.type,
      category: r.category,
      status: r.status,
      version: r.version,
      contentHash: r.content_hash,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
      lockedAt: r.locked_at ? new Date(r.locked_at).toISOString() : null,
    },
    organization: {
      organizationId: r.organization_id,
      name: r.org_name ?? null,
      uuid: r.org_uuid ?? null,
    },
    project: {
      projectId: r.project_id,
      name: r.project_name ?? null,
    },
    citations: r.citation_run_id
      ? {
          citationRunId: r.citation_run_id,
          citationsAt: r.citations_at ? new Date(r.citations_at).toISOString() : null,
          ranAgainstContentHash: r.ran_against_content_hash ?? null,
          sentences: Array.isArray(r.citations) ? r.citations : [],
          totalSentences: Number(r.total_sentences) || 0,
          supportedCount: Number(r.supported_count) || 0,
          contradictedCount: Number(r.contradicted_count) || 0,
          gapCount: Number(r.gap_count) || 0,
          totalReadinessDelta: Number(r.total_readiness_delta) || 0,
          filingBlocked: !!r.filing_blocked,
        }
      : null,
  };
}

async function loadAuditLog(
  artifactId: string,
  organizationId: number
): Promise<LedgerAuditEntry[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT audit_id, action, action_category, change_reason,
              previous_value, new_value, user_id, user_name, user_role,
              ip_address, is_gxp_relevant, "timestamp", metadata
         FROM regulatory_audit_logs
        WHERE entity_type = 'artifact'
          AND entity_id = $1
          AND organization_id = $2
        ORDER BY "timestamp" ASC
        LIMIT $3`,
      [artifactId, organizationId, MAX_AUDIT]
    );
    return rows.map((r: any) => ({
      auditId: r.audit_id,
      action: r.action,
      actionCategory: r.action_category,
      changeReason: r.change_reason ?? null,
      previousValue: r.previous_value ?? null,
      newValue: r.new_value ?? null,
      userId: r.user_id ?? null,
      userName: r.user_name ?? null,
      userRole: r.user_role ?? null,
      ipAddress: r.ip_address ?? null,
      isGxpRelevant: !!r.is_gxp_relevant,
      timestamp: new Date(r.timestamp).toISOString(),
      metadata: r.metadata ?? null,
    }));
  } catch (err: any) {
    if (!isMissingTable(err)) {
      console.warn('[docx-ledger-collector] audit load failed:', err?.message);
    }
    return [];
  }
}

async function loadSignatures(
  artifactPk: number,
  organizationId: number
): Promise<LedgerSignature[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT signature_id, artifact_version_id, signature_type,
              signature_purpose, signature_meaning, signer_id,
              signer_name, signer_email, signer_role,
              authentication_method, authentication_timestamp,
              second_factor_verified, signature_hash, signed_at
         FROM concept2cure_signatures
        WHERE artifact_id = $1
          AND organization_id = $2
          AND status = 'active'
        ORDER BY signed_at ASC
        LIMIT $3`,
      [artifactPk, organizationId, MAX_SIGNATURES]
    );
    return rows.map((r: any) => ({
      signatureId: r.signature_id,
      artifactVersionId: r.artifact_version_id ?? null,
      signatureType: r.signature_type,
      signaturePurpose: r.signature_purpose,
      signatureMeaning: r.signature_meaning ?? null,
      signerId: r.signer_id,
      signerName: r.signer_name,
      signerEmail: r.signer_email,
      signerRole: r.signer_role ?? null,
      authenticationMethod: r.authentication_method,
      authenticationTimestamp: new Date(r.authentication_timestamp).toISOString(),
      secondFactorVerified: !!r.second_factor_verified,
      signatureHash: r.signature_hash,
      signedAt: new Date(r.signed_at).toISOString(),
    }));
  } catch (err: any) {
    if (!isMissingTable(err)) {
      console.warn('[docx-ledger-collector] signatures load failed:', err?.message);
    }
    return [];
  }
}

async function loadProposals(
  artifactId: string,
  organizationId: number
): Promise<LedgerProposal[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT id, status, thread_id, section_code, target_agency,
              rationale, content_hash, created_by, created_at,
              applied_at, applied_audit_id, applied_version_id, expires_at
         FROM ana_submission_chat_proposals
        WHERE artifact_id = $1
          AND organization_id = $2
          AND status IN ('applied', 'superseded')
        ORDER BY created_at ASC
        LIMIT $3`,
      [artifactId, organizationId, MAX_PROPOSALS]
    );
    return rows.map((r: any) => ({
      proposalId: r.id,
      status: r.status,
      threadId: r.thread_id,
      sectionCode: r.section_code ?? null,
      targetAgency: r.target_agency ?? null,
      rationale: r.rationale ?? null,
      contentHash: r.content_hash,
      createdBy: r.created_by ?? null,
      createdAt: new Date(r.created_at).toISOString(),
      appliedAt: r.applied_at ? new Date(r.applied_at).toISOString() : null,
      appliedAuditId: r.applied_audit_id ?? null,
      appliedVersionId: r.applied_version_id ?? null,
      expiresAt: new Date(r.expires_at).toISOString(),
    }));
  } catch (err: any) {
    if (!isMissingTable(err)) {
      console.warn('[docx-ledger-collector] proposals load failed:', err?.message);
    }
    return [];
  }
}

async function loadRunSummary(
  artifactId: string,
  organizationId: number
): Promise<LedgerRunSummary> {
  const empty: LedgerRunSummary = {
    totalRuns: 0,
    latestRunId: null,
    latestRunAt: null,
    modelsUsed: [],
  };
  try {
    const [countRes, latestRes] = await Promise.all([
      getPool().query(
        `SELECT COUNT(*)::int AS c
           FROM ana_artifact_citation_runs
          WHERE artifact_id = $1
            AND organization_id = $2`,
        [artifactId, organizationId]
      ),
      getPool().query(
        `SELECT id, created_at, run_metadata
           FROM ana_artifact_citation_runs
          WHERE artifact_id = $1
            AND organization_id = $2
          ORDER BY created_at DESC
          LIMIT 25`,
        [artifactId, organizationId]
      ),
    ]);
    const totalRuns = Number(countRes.rows[0]?.c) || 0;
    const latestRow = latestRes.rows[0];
    const modelSet = new Set<string>();
    for (const row of latestRes.rows) {
      const meta = row.run_metadata as any;
      if (meta && typeof meta === 'object') {
        if (typeof meta.strategy === 'string') modelSet.add(`strategy:${meta.strategy}`);
        if (typeof meta.model === 'string') modelSet.add(meta.model);
      }
    }
    return {
      totalRuns,
      latestRunId: latestRow?.id ?? null,
      latestRunAt: latestRow?.created_at
        ? new Date(latestRow.created_at).toISOString()
        : null,
      modelsUsed: Array.from(modelSet).sort(),
    };
  } catch (err: any) {
    if (!isMissingTable(err)) {
      console.warn('[docx-ledger-collector] run summary failed:', err?.message);
    }
    return empty;
  }
}

/**
 * Live entry: pull everything that goes into the AnALedger for an
 * artifact. Tenant-scoped. Returns null when the artifact is missing
 * or cross-tenant.
 */
export async function collectArtifactLedger(
  artifactId: string,
  organizationId: number
): Promise<ArtifactLedger | null> {
  const head = await loadArtifact(artifactId, organizationId);
  if (!head) return null;

  const [auditLog, signatures, proposals, runs] = await Promise.all([
    loadAuditLog(artifactId, organizationId),
    loadSignatures(head.artifact.artifactPk, organizationId),
    loadProposals(artifactId, organizationId),
    loadRunSummary(artifactId, organizationId),
  ]);

  return {
    schemaVersion: ANALEDGER_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    artifact: head.artifact,
    organization: head.organization,
    project: head.project,
    citations: head.citations,
    auditLog,
    signatures,
    proposals,
    runs,
  };
}
