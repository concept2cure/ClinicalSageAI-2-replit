/**
 * Artifacts Center — cross-project governed artifact gallery read route.
 *
 * Backs the ui-v2 "Artifacts Center" surface
 * (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx → ArtifactsCenter),
 * which today maps the ARTIFACTS fixture directly. It returns one row per
 * governed artifact the org owns, in the surface's ArtifactEntry display shape,
 * sourced from the concept2cure_artifacts / concept2cure_signatures / projects
 * tables. No new SQL objects — a single org-scoped read + a signature EXISTS
 * subquery, mirroring the raw-pool pattern in server/routes/c2c/documents.ts.
 *
 * Style template: server/routes/pharmacovigilance-routes.ts /
 * pharmacovigilance-board.routes.ts (Router factory default export, org id from
 * tenant/user context, scoped logger, honest error shaping, { success, data }
 * envelope, fail-closed on a missing table).
 *
 * Response: { success: true, data: ArtifactCenterRow[], total }
 *
 * ── FIELD SOURCES (ArtifactEntry ← concept2cure_artifacts a) ──────────────────
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

const logger = createScopedLogger('artifacts-center-routes');

/** Hard cap on rendered rows — this is a gallery, mirrors the existing
 *  /api/concept2cure/artifacts read (LIMIT 200). */
const MAX_ROWS = 200;

// ── Display-shape row (mirrors ArtifactEntry in fixtures/admin-data.ts) ──────────

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
}

/** Raw projection returned by the org-scoped read below. */
interface RawArtifactRow {
  artifact_id: string;
  title: string;
  kind_source: string | null;
  category: string | null;
  type: string | null;
  version: number | string;
  updated_at: Date | string;
  project_id: number;
  content_bytes: number | string;
  model: string | null;
  program: string | null;
  is_signed: boolean;
  is_reviewed: boolean;
  source_count: number | string;
  /** Version the newest active signature covers; null when unsigned or when
   *  the signature's version row is missing. */
  signed_version: number | string | null;
}

// ── Pure helpers ────────────────────────────────────────────────────────────────

/** Human byte size from the stored content's octet length (real, not a
 *  rendered-file size). Matches the fixture style: '182 KB', '1.4 MB'. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

/** Humanize the artifact's real kind source (metadata.documentType ?? type):
 *  'regulatory_document' → 'Regulatory document'; an explicit documentType such
 *  as 'IND Cover Letter' passes through unchanged. */
function humanizeKind(raw: string | null): string {
  const s = (raw ?? '').trim();
  if (!s) return 'Document';
  const normalized = s.replace(/[_-]+/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Derive the surface's format key from the real category. These artifacts are
 * editable TEXT documents (no rendered-file format is stored); the writeback
 * paths produce category='document', which the surface treats as 'docx'
 * (open-to-edit). Documented derivation, not a fabricated per-row format.
 */
function deriveFmt(category: string | null): string {
  const c = (category ?? '').toLowerCase().trim();
  if (!c || c === 'document') return 'docx';
  return c;
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
   * Cross-project governed artifact gallery for the ui-v2 Artifacts Center
   * surface, in ArtifactEntry display shape, newest-updated first.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);

      const result = await pool.query(
        `SELECT
           a.artifact_id                                   AS artifact_id,
           a.title                                         AS title,
           COALESCE(a.metadata ->> 'documentType', a.type) AS kind_source,
           a.category                                      AS category,
           a.type                                          AS type,
           a.version                                       AS version,
           a.updated_at                                    AS updated_at,
           a.project_id                                    AS project_id,
           octet_length(a.content)                         AS content_bytes,
           COALESCE(
             a.metadata ->> 'model',
             a.metadata ->> 'modelTier',
             a.metadata ->> 'aiModel'
           )                                               AS model,
           COALESCE(p.code, p.name)                        AS program,
           EXISTS (
             SELECT 1
               FROM concept2cure_signatures s
              WHERE s.artifact_id = a.id
                AND s.organization_id = a.organization_id
                AND s.status = 'active'
           )                                               AS is_signed,
           EXISTS (
             SELECT 1 FROM concept2cure_review_decisions d
              WHERE d.artifact_id = a.id
                AND d.organization_id = a.organization_id
                AND d.decision = 'approve'
                AND d.version_reviewed = a.version
           )                                               AS is_reviewed,
           CASE
             WHEN json_typeof(a.metadata -> 'sourceArtifactIds') = 'array'
             THEN json_array_length(a.metadata -> 'sourceArtifactIds')
             ELSE 0
           END                                             AS source_count,
           /* Which version the newest active signature actually covers.
              is_signed above is EXISTS-any: it says a signature exists, not
              that it covers what you are looking at. An artifact signed at v3
              and edited to v7 satisfies it exactly as well as one signed a
              moment ago, so the badge read "signed" for content nobody had
              approved. Version content is immutable here — an edit mints a new
              version rather than rewriting one — so the old signature is not
              invalid, it simply covers earlier bytes. That distinction is the
              honest one to draw, and it needs the version number to draw it.

              Deliberately NOT folded into is_signed: some writers set
              artifact_version_id to a predecessor snapshot, so requiring
              equality here would report freshly-signed artifacts as unsigned.
              Under-reporting a signature is its own falsehood. The number is
              reported and the caller compares. */
           (
             SELECT v.version
               FROM concept2cure_signatures s
               JOIN concept2cure_artifact_versions v ON v.id = s.artifact_version_id
              WHERE s.artifact_id = a.id
                AND s.organization_id = a.organization_id
                AND s.status = 'active'
              ORDER BY s.id DESC
              LIMIT 1
           )                                               AS signed_version
         FROM concept2cure_artifacts a
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.organization_id = $1
         ORDER BY a.updated_at DESC
         LIMIT ${MAX_ROWS}`,
        [orgId]
      );

      const rawRows = result.rows as RawArtifactRow[];

      const data: ArtifactCenterRow[] = rawRows.map(r => {
        const version = Number(r.version);
        const rawSignedVersion = r.signed_version == null ? null : Number(r.signed_version);
        const signedVersion =
          rawSignedVersion !== null && Number.isFinite(rawSignedVersion) ? rawSignedVersion : null;
        return {
          id: r.artifact_id,
          name: r.title,
          kind: humanizeKind(r.kind_source ?? r.type),
          fmt: deriveFmt(r.category),
          size: formatBytes(Number(r.content_bytes)),
          model: r.model ?? null,
          when: relativeTime(r.updated_at),
          ver: `v${Number.isFinite(version) ? version : 1}`,
          sig: r.is_signed === true,
          reviewed: r.is_reviewed === true,
          sourceCount: Number(r.source_count) || 0,
          /* The version the signature covers, and whether that is still the
             current one. `sigStale` is only asserted when BOTH numbers are
             known — an unresolvable signed_version reports null rather than
             guessing, because "we cannot tell whether this approval still
             applies" and "this approval is out of date" are different things
             to tell a reviewer. */
          sigVersion: signedVersion,
          sigStale:
            r.is_signed === true && signedVersion !== null && Number.isFinite(version)
              ? signedVersion !== version
              : null,
          prog: r.program || `proj_${r.project_id}`,
        };
      });

      return res.json({ success: true, data, total: data.length });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('NO_TENANT')) {
        return res.status(400).json({ success: false, error: 'Organization context required' });
      }
      // Fail closed when the governed tables are not provisioned for this
      // deployment (undefined_table) — the surface keeps its honest fixture.
      const code = (error as { code?: string } | null)?.code;
      if (code === '42P01') {
        return res.status(503).json({ success: false, error: 'ARTIFACTS_TABLE_MISSING' });
      }
      logger.error('artifacts center list error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to load artifacts center' });
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

      if (format === 'txt') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.txt"`);
        return res.send(exportContent);
      }

      const buffer = await generateDocxBuffer(title, exportContent);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.docx"`);
      return res.send(buffer);
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
