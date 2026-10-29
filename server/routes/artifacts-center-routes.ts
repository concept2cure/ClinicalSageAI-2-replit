/**
 * Governed artifacts across the projects the caller can open, and one
 * artifact's governed export.
 *
 * GET / backs the Vault's organization view of governed artifacts
 * (client/src/concept2cure/v2/surfaces/VaultGovernedArtifacts.tsx,
 * OrganizationGovernedArtifacts). It was the Artifacts center's gallery
 * (AdminSurfaces.tsx ArtifactsCenter), which retired into the Vault (D2, fold
 * F3 slice C, 2026-10-29). The gallery listed every artifact of the
 * organization to any member, archived rows included. It now lists the
 * non-archived artifacts of the projects the sharing policy admits the caller
 * to (getAccessibleReportProjectIds, the policy the project Vault admits a
 * project by), and nothing when it admits none. A refused or unverifiable
 * access check is answered as such, never as an empty listing.
 *
 * The read itself is the registry's one read
 * (server/services/artifact-registry-read.ts), shared with the project Vault's
 * "Governed artifacts" branch since fold F3 slice A (2026-10-29): one query,
 * one signature rule (shared/artifact-governance.ts), never a second copy.
 *
 * Style template: server/routes/pharmacovigilance-routes.ts /
 * pharmacovigilance-board.routes.ts (Router factory default export, org id from
 * tenant/user context, scoped logger, honest error shaping, { success, data }
 * envelope, fail-closed on a missing table).
 *
 * Response: { success: true, data: ArtifactCenterRow[], total, meta: { scope:
 *   'accessible-projects', total, listed, truncated } }. `total` counts every
 *   row the scope matches, before the window.
 *
 * ── FIELD SOURCES (OrganizationArtifactRow ← concept2cure_artifacts a) ────────
 *   id    ← a.artifact_id                                    (real)
 *   name  ← a.title                                          (real)
 *   ver   ← 'v' || a.version                                 (real int, prefixed)
 *   sig   ← EXISTS active concept2cure_signatures row        (real — governed)
 *   prog  ← COALESCE(projects.code, projects.name)           (real program code)
 *   size  ← octet_length(a.content) formatted                (real content bytes)
 *   when  ← relative time from a.updated_at                  (derived from real)
 *   kind  ← COALESCE(metadata->>'documentType', a.type)      (real, humanized)
 *   fmt   ← derived from a.category ('document' → 'docx')     (derived, documented)
 *   model ← metadata->>'model'|'modelTier'|'aiModel' else null (honest null gap)
 *
 * ── HONESTY NOTES (regulated product — no fabricated values) ──────────────────
 *   • model: the artifacts table does not persist the AnA model/tier that
 *     produced the content. It is returned as the real metadata value when a
 *     caller stored one, otherwise null — never a fabricated tier name.
 *   • fmt: concept2cure_artifacts store editable TEXT content, not rendered
 *     export files, so no per-row file format is persisted. Every artifact these
 *     writeback paths produce is category='document' (an editable regulatory
 *     document that opens in the editor), which the surface represents as 'docx'
 *     (open-to-edit). fmt is DERIVED from the real category, not invented per row
 *     as pdf/xlsx/pptx variety the data cannot support.
 *   • size: the byte length of the STORED content (octet_length), not the size
 *     of a rendered DOCX/PDF — those files are not stored on the row.
 *   • sig is truthful: it reflects a real active row in the append-only,
 *     immutable concept2cure_signatures ledger (21 CFR Part 11), joined on the
 *     artifact's internal id and org. No signature/hash value is ever invented.
 *
 * @module routes/artifacts-center-routes
 */

import { Router, Request, Response } from 'express';

import { createScopedLogger } from '../utils/logger.js';
import { pool } from '../db.js';
import { generateDocxBuffer } from '../services/docxGenerator.js';
import { shouldEnforceExportReviewGate } from '../services/export/exportReviewGate.js';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence.js';
import { authedUserId } from '../utils/authedActor.js';
import {
  artifactCtdSection,
  artifactGovernance,
  artifactRegistryStatus,
  formatContentBytes,
  readArtifactRegistry,
} from '../services/artifact-registry-read.js';
import type { ArtifactOrigin } from '../../shared/artifact-governance.js';
import { ProgramReadAccessError, readCurrentProgramActor } from '../services/c2c/current-program-access.js';
import { getAccessibleReportProjectIds } from '../services/report-os/project-access.js';

const logger = createScopedLogger('artifacts-center-routes');

/** The listing's window. The response says when there are more (meta.truncated). */
const MAX_ROWS = 200;

// ── Display-shape row (OrganizationArtifactRow in client surfaces/VaultOrganizationArtifacts.tsx) ──

interface ArtifactCenterRow {
  id: string;
  name: string;
  kind: string;
  fmt: string;
  size: string;
  /**
   * GAP: concept2cure_artifacts does not persist the AnA model/tier that
   * produced the content, so this is null unless a caller stored metadata.model.
   * Never fabricated.
   */
  model: string | null;
  when: string;
  ver: string;
  sig: boolean;
  reviewed: boolean;
  sourceCount: number;
  prog: string;
  /* The row facts the converged CSV manifest writes, from the same read the
     project Vault's leaves are built from (fold F3 slice B, 2026-10-29). Null
     where the row records none. */
  ctdSection: string | null;
  /** The registry status in the Vault's vocabulary (artifactRegistryStatus). */
  status: string;
  origin: ArtifactOrigin | null;
  author: string | null;
  /** The hash the writer recorded, not a SHA-256 of a rendered file. */
  contentHash: string | null;
}

// ── Pure helpers ────────────────────────────────────────────────────────────────

/* The byte size of the stored content is formatContentBytes in the shared read
   (services/artifact-registry-read.ts), where it moved on 2026-10-29 so the
   project Vault's leaves state it the same way. */

/** Relative "Updated" label derived from the real updated_at timestamp. Matches
 *  the fixture style: '30 min ago', '2 h ago', 'yesterday', '3 d ago'. */
function relativeTime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} d ago`;
  return d.toISOString().slice(0, 10);
}

// ── Router factory ──────────────────────────────────────────────────────────────

export default function createArtifactsCenterRoutes(): Router {
  const router = Router();

  /**
   * Numeric org id from the request tenant/user context. concept2cure_artifacts
   * keys organization_id as INTEGER, so a non-numeric tenant id is treated as no
   * context (fail closed) rather than silently coerced.
   */
  function getOrgId(req: Request): number {
    const raw =
      (req as any).tenantId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).organizationId ??
      (req as any).user?.organizationId;
    const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
    if (raw == null || !Number.isFinite(n)) {
      throw new Error('NO_TENANT: Organization context required');
    }
    return n;
  }

  /**
   * GET /api/artifacts-center
   * The governed artifacts of the projects the caller can open, newest-updated
   * first, for the Vault's organization view.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);

      /* Which projects the caller can open, by the policy the project Vault
         admits a project by (canAccessReportProject, through
         installProjectRouteAccess). Bound into the read before the window and
         the count, so neither says anything about a project the caller cannot
         open. A refusal, or a check that could not run, is not "none". */
      let projectIds: number[];
      try {
        const userId = authedUserId(req);
        const actor = await readCurrentProgramActor(pool, { organizationId: orgId, userId: userId ?? undefined });
        projectIds = await getAccessibleReportProjectIds(orgId, actor, pool);
      } catch (accessError) {
        const failure = accessError instanceof ProgramReadAccessError
          ? accessError
          : new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Project access could not be verified, so no governed artifact was listed.');
        return res.status(failure.status).json({ success: false, error: failure.code, message: failure.message });
      }

      // One past the window, so a full window can say it is full.
      const read = await readArtifactRegistry({ organizationId: orgId, projectIds, limit: MAX_ROWS + 1 });
      const truncated = read.length > MAX_ROWS;
      const rawRows = truncated ? read.slice(0, MAX_ROWS) : read;
      const counted = Number(read[0]?.total_rows);
      const total = Number.isFinite(counted) && counted >= rawRows.length ? counted : rawRows.length;

      const data: ArtifactCenterRow[] = rawRows.map(r => {
        const version = Number(r.version);
        const g = artifactGovernance(r);
        return {
          id: r.artifact_id,
          name: r.title ?? '',
          kind: g.kind,
          fmt: g.fmt,
          size: formatContentBytes(Number(r.content_bytes)),
          model: g.model,
          when: r.updated_at == null ? '' : relativeTime(r.updated_at),
          ver: `v${Number.isFinite(version) ? version : 1}`,
          sig: g.sig,
          reviewed: g.reviewed,
          sourceCount: g.sourceCount,
          /* The version the signature covers, and whether that is still the
             current one (shared/artifact-governance.ts). `sigStale` is only
             asserted when both numbers are known. */
          sigVersion: g.sigVersion,
          sigStale: g.sigStale,
          prog: r.program || `proj_${r.project_id}`,
          ctdSection: artifactCtdSection(r.ctd_section),
          status: artifactRegistryStatus(r.status),
          origin: g.origin,
          author: r.author_name ?? null,
          contentHash: r.content_hash ?? null,
        };
      });

      return res.json({
        success: true,
        data,
        total,
        meta: { scope: 'accessible-projects', total, listed: data.length, truncated },
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('NO_TENANT')) {
        return res.status(400).json({ success: false, error: 'Organization context required' });
      }
      // Fail closed when the governed tables are not provisioned for this
      // deployment (undefined_table): the Vault says so, never "none".
      const code = (error as { code?: string } | null)?.code;
      if (code === '42P01') {
        return res.status(503).json({ success: false, error: 'ARTIFACTS_TABLE_MISSING' });
      }
      logger.error('governed artifacts listing error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to load the governed artifacts' });
    }
  });

  /**
   * Download one governed artifact as a file.
   *
   * ── Why this exists ────────────────────────────────────────────────────────
   * The Artifacts Center's per-row "Download" button ran
   * `onAsk('Download <name> (PDF, 24 KB)')` — it typed the file's name into the
   * chat rail as a sentence. No file was produced. The gallery read above
   * deliberately returns `octet_length(a.content)` rather than the content, so
   * the client had nothing to render even if it had wanted to, and there was no
   * per-artifact endpoint to ask.
   *
   * This is that endpoint. It re-reads the artifact org-scoped (never trusting
   * an id the client supplies to reach across tenants), renders the stored
   * content, and streams it back.
   *
   * ── The export-review gate is NOT skipped ──────────────────────────────────
   * Governed regulatory content must not leave the system without a persisted
   * decision covering its current version. A download route that trusted a
   * caller-supplied approval boolean would fabricate governance. This route
   * derives authorization from an active signature or current-version review
   * decision, scoped to the artifact's organization.
   */
  router.get('/:artifactId/export', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const artifactId = String(req.params.artifactId || '').trim();
      if (!artifactId) {
        return res.status(400).json({ success: false, error: 'An artifact id is required.' });
      }

      const format = String(req.query.format || 'docx').toLowerCase();
      if (format !== 'docx' && format !== 'txt') {
        // PDF rendering for artifacts goes through the chat exporter, which
        // takes a different payload; offering it here without wiring it would
        // be the same empty promise this route replaces.
        return res.status(400).json({
          success: false,
          error: 'Unsupported format. This endpoint renders docx or txt.',
        });
      }

      const { rows } = await pool.query(
        `SELECT a.title,
                a.content,
                a.version,
                EXISTS (
                  SELECT 1
                    FROM concept2cure_signatures s
                    JOIN concept2cure_artifact_versions v
                      ON v.id = s.artifact_version_id
                   WHERE s.artifact_id = a.id
                     AND s.organization_id = a.organization_id
                     AND s.status = 'active'
                     AND v.version = a.version
                ) AS is_signed,
                EXISTS (
                  SELECT 1 FROM concept2cure_review_decisions d
                   WHERE d.artifact_id = a.id
                     AND d.organization_id = a.organization_id
                     AND d.decision = 'approve'
                     AND d.version_reviewed = a.version
                ) AS is_reviewed
           FROM concept2cure_artifacts a
          WHERE a.artifact_id = $1 AND a.organization_id = $2`,
        [artifactId, orgId]
      );
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'That artifact was not found in your organization.',
        });
      }

      const row = rows[0] as {
        title: string | null;
        content: string | null;
        version: number;
        is_signed: boolean;
        is_reviewed: boolean;
      };

      const content = typeof row.content === 'string' ? row.content : '';
      if (!content.trim()) {
        // An artifact row with no content is a real state (a placeholder minted
        // before drafting). Reported as what it is, rather than shipping an
        // empty file the user has to open to discover was empty.
        return res.status(409).json({
          success: false,
          error: 'That artifact has no content to export yet.',
        });
      }

      /* The export-review gate is read from persisted state, never asserted by
         the caller. The approval must cover the current artifact version.
         Whether the gate is ON comes from the ONE canonical enable decision
         (server/services/export/exportReviewGate.ts): always enforced in
         production, opt-in outside it. */
      if (!row.is_signed && !row.is_reviewed && shouldEnforceExportReviewGate()) {
        return res.status(403).json({
          success: false,
          error: 'HUMAN_REVIEW_REQUIRED',
          message:
            'The current artifact version has no persisted approval decision or active signature.',
        });
      }

      const notice =
        'DRAFT — NOT AGENCY-VALIDATED. This artifact is not an agency submission, agency decision, or evidence of agency acceptance.';
      const exportContent = `${notice}\n\n${content}`;
      res.setHeader('X-Concept2Cure-Draft', 'true');
      res.setHeader('X-Concept2Cure-Agency-Validated', 'false');
      res.setHeader(
        'X-Concept2Cure-Human-Review-Recorded',
        String(row.is_reviewed || row.is_signed)
      );
      res.setHeader(
        'X-Concept2Cure-Export-Authorization',
        row.is_reviewed
          ? 'persisted-review-decision'
          : row.is_signed
          ? 'current-version-signature'
          : 'none'
      );

      const title = row.title || 'artifact';
      const safeTitle = title.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'artifact';

      /* Recorded before it is delivered (D5, 2026-10-01): approved or signed
         content leaving the system is an EXPORT_GENERATED row carrying the
         SHA-256 of the exact bytes and who took them, and no file without it. */
      const userId = authedUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: 'An identified user is required to export.' });
      }
      const file =
        format === 'txt'
          ? { buffer: Buffer.from(exportContent, 'utf8'), mimeType: 'text/plain; charset=utf-8', ext: 'txt', sourceType: 'export_txt' as const }
          : {
              buffer: await generateDocxBuffer(title, exportContent),
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              ext: 'docx',
              sourceType: 'export_docx' as const,
            };
      try {
        await sendAuditedDownload(res, {
          organizationId: orgId,
          userId,
          sourceType: file.sourceType,
          backendRoute: '/api/artifacts-center/:artifactId/export',
          resourceType: 'artifacts_center_export',
          resourceId: artifactId,
          programUuid: null,
          filename: `${safeTitle}.${file.ext}`,
          mimeType: file.mimeType,
          buffer: file.buffer,
          metadata: { version: row.version, authorization: row.is_reviewed ? 'persisted-review-decision' : row.is_signed ? 'current-version-signature' : 'none' },
        });
      } catch (err) {
        if (!isUnauditedExportRefusal(err)) throw err;
        return res.status(503).json({
          success: false,
          code: 'UNAUDITED_EXPORT_REFUSED',
          error: 'The file was not delivered because its record could not be written. Try again.',
        });
      }
    } catch (error) {
      logger.error('artifact export failed', {
        err: error instanceof Error ? error.message : String(error),
        artifactId: String(req.params.artifactId || ''),
      });
      return res.status(500).json({
        success: false,
        error: 'The artifact could not be exported.',
      });
    }
  });

  return router;
}
