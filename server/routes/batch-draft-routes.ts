/**
 * Batch Draft API Routes
 *
 * Backs the ui-v2 `BatchDraft` surface (parallel eCTD section drafting). The
 * surface renders a dossier "spine" of draftable document leaves; the user
 * selects several, drafts them in parallel, reviews the results, and accepts
 * the ones worth keeping.
 *
 *   GET  /spine                    the persisted spine (read model)
 *   POST /documents/:id/accept     write an accepted draft into its document,
 *                                  preserving what it replaced
 *
 * Generation itself is NOT here — it is POST /api/claude/batch
 * (server/routes/ana-intelligence.ts), which is stateless and returns prose
 * without touching any document. That is why acceptance needs its own route:
 * it is the only step that changes a regulated document.
 *
 * Source of truth: `coauthor_documents` (shared/schema coauthorDocuments) — the
 * canonical eCTD Co-Author document table already served by
 * server/routes/coauthor.ts. Each row is one leaf in the dossier spine. Field
 * mapping (surface LeafSection field ← column):
 *   id      ← id                    (serial PK, stable unique leaf key)
 *   num     ← module_number         ('—' when the row carries no eCTD number,
 *                                     mirroring the fixture's numberless leaves)
 *   title   ← title
 *   status  ← status                (draft | in-progress | review | approved |
 *                                     finalized — the REAL stored lifecycle
 *                                     state; NOT remapped to the fixture words)
 *   pct     ← completion_percentage (null when never computed — not fabricated)
 *   preview ← content               (plain-text excerpt of the stored HTML;
 *                                     null when the document has no content)
 *
 * Honest gaps (returned as documented nulls — never fabricated):
 *   • program  — coauthor_documents has no program/application entity, so the
 *                spine header program is null; the surface already falls back to
 *                'Active dossier'.
 *   • standard — the 'eCTD' | 'multi' label is not persisted per document; null
 *                (the surface omits it when absent).
 *   • framework — the regulatory framework accepted drafts were written
 *                against, once any have been accepted. Null until then, and
 *                null again whenever the org's documents disagree; the surface
 *                then makes the user state it. See deriveFramework.
 *   • The spine is returned as a FLAT list of leaves (no folder hierarchy); the
 *     surface flattens the tree before use (bdFlatten), so nothing is lost.
 *
 * Tenant isolation: organization id comes from the authenticated request
 * context only (never the client body) and the table is queried through the
 * request-scoped Drizzle client (requestDb) so RLS session vars apply. The
 * mount adds `authenticateToken`.
 *
 * Style template: server/routes/pharmacovigilance-routes.ts /
 * server/routes/source-tracer-routes.ts (Router factory default export, org id
 * from req context, scoped logger, honest error shaping, fail-closed on a
 * missing table).
 *
 * @module routes/batch-draft-routes
 */

import { Router, Request, Response } from 'express';
import { asc, eq, sql } from 'drizzle-orm';

import { requestDb } from '../db/requestDb';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import { enforceAuthorLineage } from '../services/clinical-regulatory-evidence/lineage-gate';
import { coauthorDocuments } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('batch-draft-routes');

// Defensive upper bound on spine size (a spine is the whole document
// architecture; realistic dossiers are well under this).
const MAX_LEAVES = 1000;

// Upper bound on an accepted draft. A single eCTD leaf section is prose, not a
// dossier; anything past this is a client bug or an abuse attempt, and the
// document body is copied once more into the version snapshot on every accept.
const MAX_CONTENT_CHARS = 400_000;

/**
 * The frameworks the drafting service actually has expectations for
 * (AnaDocumentDraftingService `RegulatoryFramework`). Duplicated as a runtime
 * set rather than imported so this read/write route does not pull the whole
 * drafting service — the union is asserted against the source of truth in
 * server/routes/__tests__/batch-draft-accept.test.ts.
 */
export const REGULATORY_FRAMEWORKS = new Set([
  'fda_510k',
  'fda_pma',
  'eu_mdr',
  'ich_clinical',
  'cer_clinical_evaluation',
  'general_regulatory',
]);

// ─── Display shape (mirrors client BatchDraft LeafSection / DossierSpine) ────────

interface BatchDraftLeaf {
  /** Stable unique leaf id (coauthor_documents.id) — used for React keys. */
  id: string;
  /** Display/section number (e.g. '3.2.S.4.1'); '—' when the row has none. */
  num: string;
  title: string;
  /** Real stored lifecycle state; NOT remapped to the fixture vocabulary. */
  status: string;
  /** Completion percentage, or null when never computed (not fabricated). */
  pct: number | null;
  /** Plain-text excerpt of the stored document HTML, or null when empty. */
  preview: string | null;
}

interface BatchDraftSpine {
  /** No program entity is persisted — null; surface falls back to 'Active dossier'. */
  program: string | null;
  /** 'eCTD' | 'multi' label is not persisted — null. */
  standard: string | null;
  /**
   * The regulatory framework the org's documents have actually been drafted
   * against, recorded by the acceptance route below in
   * `coauthor_documents.metadata.regulatoryFramework`.
   *
   * Returned ONLY when every document that carries the field agrees on one
   * value. A dossier whose sections were accepted under different frameworks
   * has no single answer, so this is null and the surface makes the user state
   * the framework explicitly — the same behaviour as a dossier that has never
   * been drafted. Guessing here would author regulatory prose to the wrong
   * expectations, which is the one failure mode this whole picker exists to
   * prevent.
   */
  framework: string | null;
  /** Flat list of draftable document leaves (surface flattens before use). */
  tree: BatchDraftLeaf[];
}

/** Metadata shape this module reads/writes on `coauthor_documents.metadata`. */
interface CoauthorDocumentMetadata {
  regulatoryFramework?: unknown;
}

// ─── Derivation helpers (honest: yield a value ONLY when one is really present) ─

/**
 * Entities decoded for readability in the preview text.
 *
 * `&lt;` and `&gt;` are deliberately NOT here. They used to be, and decoding
 * them was an XSS step: TipTap escapes angle brackets a user types, so a
 * document body containing the literal text `<img src=x onerror=...>` is stored
 * as `&lt;img src=x onerror=...&gt;` — inert. Decoding it back reconstituted
 * live markup in a field the client then concatenated into an HTML string and
 * injected via dangerouslySetInnerHTML (BatchDraft.tsx). The preview is plain
 * text; it has no reason to contain an angle bracket, and now cannot.
 *
 * Decoding `&amp;` first is safe: input `&amp;lt;` yields the literal text
 * `&lt;`, not `<`.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Produce a short plain-text preview from the stored TipTap HTML content.
 * Strips tags, decodes a handful of common entities, collapses whitespace, and
 * truncates. Returns null when the document carries no usable text — never a
 * placeholder or fabricated summary.
 *
 * The result is TEXT. Callers must escape it before placing it in markup.
 */
function derivePreview(content: string | null): string | null {
  if (!content) return null;
  let text = content.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;|&quot;|&#39;|&nbsp;/g, m => HTML_ENTITIES[m] ?? ' ');
  // Any angle bracket still present came from raw markup rather than an
  // entity — strip it so the preview cannot carry a tag under any encoding.
  text = text.replace(/[<>]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 240 ? `${text.slice(0, 240).trimEnd()}…` : text;
}

/**
 * The single regulatory framework this org's documents were drafted against,
 * or null when there is no unanimous answer.
 *
 * Unanimity is the whole point. `DocumentDraftRequest.framework` decides the
 * regulatory expectations the generated prose is written to, so a wrong value
 * produces confident, plausible, WRONG text — much harder to catch in review
 * than a blank field. Documents that carry no framework at all are ignored
 * rather than treated as disagreement (a half-drafted dossier still has one
 * filing type); two DIFFERENT recorded frameworks is genuine disagreement and
 * yields null.
 */
export function deriveFramework(metadatas: Array<unknown>): string | null {
  let found: string | null = null;
  for (const meta of metadatas) {
    if (!meta || typeof meta !== 'object') continue;
    const raw = (meta as CoauthorDocumentMetadata).regulatoryFramework;
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value) continue;
    if (found === null) found = value;
    else if (found !== value) return null;
  }
  return found;
}

// ─── Router Factory ─────────────────────────────────────────────────────────────

export default function createBatchDraftRoutes(): Router {
  const router = Router();

  /**
   * Resolve the tenant organization id from trusted authenticated context.
   * coauthor_documents.organization_id is an integer, so this returns a number
   * (mirrors server/routes/source-tracer-routes.ts).
   */
  function getOrganizationId(req: Request): number {
    const trusted =
      (req as any).user?.organizationId ??
      (req as any).user?.tenantId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).tenantId;
    const orgId = parseInt(String(trusted), 10);
    if (isNaN(orgId) || orgId <= 0) {
      throw new Error('BD_NO_TENANT: authenticated organization context required');
    }
    return orgId;
  }

  /**
   * Who is making the change, for the version row and the audit event.
   *
   * Read from the authenticated request context ONLY — never the body. An
   * attributable audit trail whose attribution the client can set is not an
   * audit trail. `userId` is null rather than 0 when the token carries no
   * numeric id, so the audit row says "unknown user" instead of "user 0".
   */
  function getActor(req: Request): { userId: number | null; userLabel: string; userRole: string } {
    const u = ((req as any).user ?? {}) as Record<string, unknown>;
    const rawId = Number(u.id ?? u.userId);
    return {
      userId: Number.isFinite(rawId) && rawId > 0 ? rawId : null,
      userLabel: String(u.name ?? u.email ?? 'System'),
      userRole: String(u.role ?? 'user'),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/batch-draft/spine
  // The org's persisted eCTD document spine — every draftable leaf with its real
  // status, completion percentage, and a content-derived preview. The surface
  // filters this to the "still to draft" set and drives parallel drafting via a
  // separate streaming POST (window.C2C_AUTHORING.batchDraft).
  // ═══════════════════════════════════════════════════════════════════════════
  router.get('/spine', async (req: Request, res: Response) => {
    let organizationId: number;
    try {
      organizationId = getOrganizationId(req);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unauthorized',
      });
    }

    try {
      const db = requestDb(req);
      const rows = await db
        .select({
          id: coauthorDocuments.id,
          moduleNumber: coauthorDocuments.moduleNumber,
          title: coauthorDocuments.title,
          status: coauthorDocuments.status,
          completionPercentage: coauthorDocuments.completionPercentage,
          content: coauthorDocuments.content,
          metadata: coauthorDocuments.metadata,
        })
        .from(coauthorDocuments)
        .where(eq(coauthorDocuments.organizationId, organizationId))
        .orderBy(asc(coauthorDocuments.moduleNumber), asc(coauthorDocuments.title))
        .limit(MAX_LEAVES);

      const tree: BatchDraftLeaf[] = rows.map(r => ({
        id: String(r.id),
        num: r.moduleNumber ?? '—',
        title: r.title,
        status: r.status,
        pct: r.completionPercentage ?? null,
        preview: derivePreview(r.content),
      }));

      const spine: BatchDraftSpine = {
        program: null,
        standard: null,
        framework: deriveFramework(rows.map(r => r.metadata)),
        tree,
      };

      return res.json({ success: true, data: spine });
    } catch (error: any) {
      // Fail-closed if the co-author document table has not been migrated yet
      // (42P01 undefined_table / 42703 undefined_column) — never fabricate.
      if (error?.code === '42P01' || error?.code === '42703') {
        logger.warn('coauthor_documents not available; returning 503', { code: error.code });
        return res.status(503).json({
          success: false,
          error: 'COAUTHOR_DOCUMENTS_TABLE_MISSING',
        });
      }
      logger.error('batch draft spine error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to load batch draft spine' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/batch-draft/documents/:id/accept
  //
  // Accept an AnA batch draft into the eCTD document it was drafted for.
  //
  // WHY THIS ROUTE EXISTS. Acceptance on the BatchDraft surface used to
  // dispatch through `window.C2C_AUTHORING.saveSection`, a runtime channel this
  // repo never provides, and the card was marked accepted even when that call
  // rejected. The drafting itself is now real — so every accepted draft was
  // real generated regulatory prose that the surface discarded on unmount. A
  // drafting service whose output cannot be kept is not a drafting service.
  //
  // WHY NOT `PUT /api/coauthor/documents/:id`. That route accepts content, but
  // it neither snapshots the content it replaces nor records who replaced it.
  // Overwriting the body of a regulated document with machine-generated prose
  // and keeping no prior copy is not a save we can offer. This route makes the
  // write reversible and attributable:
  //
  //   1. the content being REPLACED is snapshotted into
  //      coauthor_document_versions (a table the schema has always declared and
  //      no code has ever written to) — so the accept can be undone;
  //   2. the new content, the framework it was drafted against, and the model
  //      that produced it are written to the document;
  //   3. an audit_events row records the acceptance (21 CFR Part 11 §11.10(e)).
  //
  // All three happen in ONE transaction on the request-scoped, RLS-bound
  // connection: either the document changed and the change is attributable, or
  // nothing happened.
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/documents/:id/accept', async (req: Request, res: Response) => {
    let organizationId: number;
    try {
      organizationId = getOrganizationId(req);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unauthorized',
      });
    }

    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid document id' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    const content = typeof body.content === 'string' ? body.content : '';
    if (!content.trim()) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return res.status(413).json({
        success: false,
        error: `content exceeds ${MAX_CONTENT_CHARS} characters`,
      });
    }

    // A framework outside the service's own union is not recorded. It would be
    // handed straight back to the next batch as the default, so an unrecognised
    // value would silently become the expectations the next drafts are written
    // to. Reject rather than store something the drafting service cannot honour.
    const framework = typeof body.framework === 'string' ? body.framework.trim() : '';
    if (framework && !REGULATORY_FRAMEWORKS.has(framework)) {
      return res.status(400).json({ success: false, error: 'Unrecognised regulatory framework' });
    }

    const model = typeof body.model === 'string' ? body.model.slice(0, 120) : null;

    const actor = getActor(req);
    /* The accepted text becomes this person's to answer for; the lineage gate
       below records every clause as their assertion, and a placeholder is not
       a person (ledger L160). */
    if (actor.userId == null) {
      return res.status(401).json({
        success: false,
        error: 'An identified user is required to accept a draft into a document (21 CFR Part 11).',
      });
    }
    const rdb = requestDb(req);
    let inTransaction = false;

    try {
      await rdb.execute(sql`BEGIN`);
      inTransaction = true;

      // FOR UPDATE: the snapshot below reads the content this statement is
      // about to replace. Without the row lock a concurrent accept on the same
      // section could interleave between the read and the write, and the
      // version history would no longer describe what actually happened.
      const { rows: docRows } = await rdb.execute(sql`
        SELECT id, content, status
          FROM coauthor_documents
         WHERE id = ${documentId} AND organization_id = ${organizationId}
         FOR UPDATE
      `);

      if (!docRows.length) {
        await rdb.execute(sql`ROLLBACK`);
        inTransaction = false;
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      const previousContent = (docRows[0] as { content: string | null }).content;

      // Snapshot only when there is something to lose. A section that has never
      // carried content has no prior state, and writing an empty version row
      // would put a version in the history that never existed as a document.
      let versionNumber: number | null = null;
      if (previousContent && previousContent.trim()) {
        const { rows: versionRows } = await rdb.execute(sql`
          INSERT INTO coauthor_document_versions
            (document_id, version_number, content, created_by, change_summary)
          SELECT ${documentId},
                 COALESCE(MAX(version_number), 0) + 1,
                 ${previousContent},
                 ${actor.userLabel},
                 'Superseded by an accepted AnA batch draft'
            FROM coauthor_document_versions
           WHERE document_id = ${documentId}
          RETURNING version_number
        `);
        versionNumber = Number((versionRows[0] as { version_number: number }).version_number);
      }

      // `metadata` is merged, never replaced — other writers keep their keys.
      // The double cast works whether the deployed column is json or jsonb.
      const metadataPatch: Record<string, unknown> = {
        lastDraftSource: 'ana-batch',
        lastDraftModel: model,
      };
      if (framework) metadataPatch.regulatoryFramework = framework;

      await rdb.execute(sql`
        UPDATE coauthor_documents
           SET content = ${content},
               metadata = (
                 COALESCE(metadata::jsonb, '{}'::jsonb) || ${JSON.stringify(metadataPatch)}::jsonb
               )::json,
               updated_at = NOW()
         WHERE id = ${documentId} AND organization_id = ${organizationId}
      `);

      /* Lineage in the same transaction as the content (ledger L160): the
         batch drafts carry no parked sources, so every clause is recorded as
         the accepting person's assertion, and a gap rolls the accept back. */
      const client = queryableFromDrizzle(rdb);
      await enforceAuthorLineage(
        client,
        organizationId,
        { documentTable: 'coauthor_documents', documentId: String(documentId) },
        content,
        String(actor.userId),
      );

      // 21 CFR Part 11 §11.10(e) — same transaction as the change it describes,
      // so an acceptance can never exist without its audit record.
      await rdb.execute(sql`
        INSERT INTO audit_events
          (organization_id, event_type, entity_type, entity_id, user_id, user_name,
           user_role, ip_address, timestamp, reason, metadata,
           regulatory_significant, gxp_relevant, created_at)
        VALUES (${organizationId}, 'coauthor_document.draft_accepted', 'coauthor_document',
                ${documentId}, ${actor.userId}, ${actor.userLabel}, ${actor.userRole},
                ${req.ip ?? ''}, NOW(), 'AnA batch draft accepted into document',
                ${JSON.stringify({
                  framework: framework || null,
                  model,
                  supersededVersion: versionNumber,
                  contentChars: content.length,
                })},
                true, true, NOW())
      `);

      await rdb.execute(sql`COMMIT`);
      inTransaction = false;

      return res.json({
        success: true,
        data: {
          documentId,
          /** Version the REPLACED content was preserved as; null when the
           *  section was empty and nothing needed preserving. */
          supersededVersion: versionNumber,
          framework: framework || null,
        },
      });
    } catch (error: any) {
      if (inTransaction) {
        await rdb.execute(sql`ROLLBACK`).catch(() => undefined);
      }
      if (error?.code === '42P01' || error?.code === '42703') {
        logger.warn('acceptance target table not available; returning 503', { code: error.code });
        return res.status(503).json({ success: false, error: 'COAUTHOR_DOCUMENTS_TABLE_MISSING' });
      }
      logger.error('batch draft accept error', {
        documentId,
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to save the accepted draft' });
    }
  });

  return router;
}
