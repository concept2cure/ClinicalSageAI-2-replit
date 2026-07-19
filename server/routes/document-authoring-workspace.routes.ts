/**
 * Document Authoring Workspace — read-model API for the `document-authoring`
 * ui-v2 surface (client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx).
 *
 * The surface is a full-bleed 3-pane authoring editor: a document tree (left),
 * an editable canvas of content blocks (center), and a comments rail (right).
 * Prior to this endpoint it rendered a hardcoded fixture
 * (v2/fixtures/project2-data.ts). This route serves the three panes that CAN
 * be sourced honestly from persisted, org-scoped data:
 *
 *   • program  — header metadata (title / module code / active section /
 *                readiness / target-filing quarter), derived from the scoped
 *                `projects` row and the active `documents` row.
 *   • tree     — org (optionally project) documents grouped into CTD-module
 *                volumes, from `documents`.
 *   • comments — the active document's review thread, from `document_comments`.
 *
 * HONESTY (regulated product — see the honesty rule in the design brief):
 * the center canvas renders per-block CONFIDENCE scores, per-block PROVENANCE
 * (source / model / audit id), verification FLAGS, and citation SPANS. NONE of
 * those exist as a governed, queryable store for eCTD authoring content in the
 * current schema (`document_versions.content` is a single opaque text blob;
 * there is no per-paragraph confidence, model attribution, audit-id linkage,
 * or citation extraction). Fabricating those numbers on regulatory content is
 * exactly what the honesty rule forbids, so `blocks` is returned EMPTY and the
 * reason is surfaced in `meta.blocksReason`. Every other omitted/derived field
 * is documented in `meta` and in the route's caveats. Delivering the AI-drafted
 * block content faithfully requires a new governed block store + drafting
 * pipeline (a separate build), not a query.
 *
 * Mounted (auth-gated) at /api/document-authoring — see
 * bootstrap/register-document-routes.ts. Read-only; no writes, no audit entry.
 *
 * @module routes/document-authoring-workspace.routes
 */

import { Router, type Request, type Response } from 'express';
import { and, eq, desc } from 'drizzle-orm';

import { db } from '../db.js';
import { documents, documentComments, projects } from '../../shared/schema.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('document-authoring-workspace-routes');

// ─── Display shape (mirrors v2/fixtures/project2-data.ts) ──────────────────────

interface DocProgramView {
  title: string | null;
  code: string | null;
  section: string | null;
  /** 0–100; derived from the scoped documents' status distribution. null when empty. */
  readiness: number | null;
  /** "Q{n} {yyyy}" from the project target end date, else null. */
  due: string | null;
}

interface DocTreeItemView {
  id: string;
  num: string;
  label: string;
  status: string; // surface vocab: complete | review | draft
  active?: boolean;
}

interface DocTreeVolumeView {
  vol: string;
  items: DocTreeItemView[];
}

/** Block shape the canvas renders. Returned empty — see the module honesty note. */
interface DocBlockView {
  id: string;
  kind: string;
  text?: string;
  conf?: number;
  prov?: { source: string; model: string; audit: string };
  spans?: Array<{ t?: string; cite?: string }>;
  flag?: { sev: string; msg: string };
}

interface DocCommentView {
  id: string;
  block: string;
  author: string;
  role: string;
  when: string;
  ai: boolean;
  body: string;
}

interface DocumentAuthoringWorkspaceView {
  program: DocProgramView;
  tree: DocTreeVolumeView[];
  blocks: DocBlockView[];
  comments: DocCommentView[];
  activeDocumentId: string | null;
  meta: {
    blocksAvailable: boolean;
    blocksReason: string;
    readinessBasis: string;
    commentAuthorshipAvailable: boolean;
    totalDocuments: number;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Numeric org id from the auth/tenant context. null when absent (→ 401). */
function getOrgId(req: Request): number | null {
  const raw =
    (req as any).user?.organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).organizationId ??
    (req as any).tenantId;
  const orgId = Number(raw);
  return Number.isFinite(orgId) && orgId > 0 ? orgId : null;
}

/** Parse an optional positive integer query param. */
function parseId(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** documents.module ("M2") → "eCTD · Module 2" for the program breadcrumb. */
function moduleCodeLabel(mod: string | null | undefined): string | null {
  if (!mod) return null;
  const digits = mod.match(/\d+/)?.[0];
  return digits ? `eCTD · Module ${digits}` : `eCTD · ${mod.trim()}`;
}

/** documents.module ("M2") → "Module 2" volume header. Null → "Unfiled". */
function volumeLabel(mod: string | null | undefined): string {
  if (!mod) return 'Unfiled';
  const digits = mod.match(/\d+/)?.[0];
  return digits ? `Module ${digits}` : mod.trim();
}

/** Sort key for a volume (numeric module first, ungrouped last). */
function volumeOrder(mod: string | null | undefined): number {
  const digits = mod?.match(/\d+/)?.[0];
  return digits ? Number(digits) : 9999;
}

/** documents.status → the surface's status vocabulary. */
function treeStatus(status: string): string {
  switch (status) {
    case 'approved':
    case 'effective':
      return 'complete';
    case 'in_review':
    case 'pending_approval':
      return 'review';
    default:
      return 'draft'; // draft, obsolete, anything else
  }
}

/** Readiness contribution per document status. */
function statusWeight(status: string): number {
  switch (status) {
    case 'approved':
    case 'effective':
      return 1;
    case 'in_review':
    case 'pending_approval':
      return 0.5;
    default:
      return 0;
  }
}

/** document_comments.comment_type → a display label for the role slot. */
function commentRoleLabel(commentType: string | null | undefined): string {
  switch (commentType) {
    case 'review':
      return 'Review';
    case 'approval':
      return 'Approval';
    case 'question':
      return 'Question';
    case 'suggestion':
      return 'Suggestion';
    case 'general':
      return 'General';
    default:
      return 'Comment';
  }
}

/** Coarse relative time ("12 min ago") from a timestamp. */
function relativeTime(from: Date, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} d ago`;
  if (hours > 0) return `${hours} h ago`;
  if (mins > 0) return `${mins} min ago`;
  return 'just now';
}

/** Date → "Q3 2026" filing-quarter label. */
function quarterLabel(d: Date): string {
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

// ─── Router Factory ─────────────────────────────────────────────────────────────

export default function createDocumentAuthoringWorkspaceRoutes(): Router {
  const router = Router();

  /**
   * GET /api/document-authoring/workspace?projectId=&documentId=
   *
   * Returns the document-authoring surface read-model for the caller's org.
   *   - projectId  (optional) scopes the tree/program to one project.
   *   - documentId (optional) selects the active section; otherwise the most
   *     recently updated authorable document is used.
   */
  router.get('/workspace', async (req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const orgId = getOrgId(req);
    if (orgId == null) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const projectId = parseId(req.query.projectId);
    const documentIdParam = parseId(req.query.documentId);

    try {
      // ── Documents in scope (org, optionally project) → tree + readiness ──
      const scopedWhere =
        projectId != null
          ? and(eq(documents.organizationId, orgId), eq(documents.projectId, projectId))
          : eq(documents.organizationId, orgId);

      const docRows = await db
        .select()
        .from(documents)
        .where(scopedWhere)
        .orderBy(desc(documents.updatedAt))
        .limit(500);

      // ── Active document: explicit id (org-checked) or best authorable pick ──
      let activeDoc: (typeof docRows)[number] | null = null;
      if (documentIdParam != null) {
        const rows = await db
          .select()
          .from(documents)
          .where(and(eq(documents.id, documentIdParam), eq(documents.organizationId, orgId)))
          .limit(1);
        activeDoc = rows[0] ?? null;
        if (!activeDoc) {
          return res.status(404).json({ success: false, error: 'Document not found' });
        }
      } else {
        activeDoc =
          docRows.find(
            d =>
              d.status === 'draft' ||
              d.status === 'in_review' ||
              d.status === 'pending_approval'
          ) ??
          docRows[0] ??
          null;
      }

      // ── Optional project row → program title + due quarter ──
      const projectRows =
        projectId != null
          ? await db
              .select()
              .from(projects)
              .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
              .limit(1)
          : [];
      const project = projectRows[0] ?? null;

      // ── Program (header) ──
      const readiness =
        docRows.length > 0
          ? Math.round(
              (docRows.reduce((sum, d) => sum + statusWeight(d.status), 0) / docRows.length) * 100
            )
          : null;

      const program: DocProgramView = {
        title: project?.name ?? activeDoc?.title ?? null,
        code: moduleCodeLabel(activeDoc?.module),
        section: activeDoc?.title ?? null,
        readiness,
        due: project?.targetEndDate ? quarterLabel(project.targetEndDate) : null,
      };

      // ── Tree (documents grouped into module volumes) ──
      const groups = new Map<string, { order: number; items: DocTreeItemView[] }>();
      for (const d of docRows) {
        const vol = volumeLabel(d.module);
        if (!groups.has(vol)) {
          groups.set(vol, { order: volumeOrder(d.module), items: [] });
        }
        const item: DocTreeItemView = {
          id: String(d.id),
          num: d.documentCode,
          label: d.title,
          status: treeStatus(d.status),
        };
        if (activeDoc && d.id === activeDoc.id) {
          item.active = true;
        }
        groups.get(vol)!.items.push(item);
      }
      const tree: DocTreeVolumeView[] = Array.from(groups.entries())
        .map(([vol, g]) => ({ vol, order: g.order, items: g.items }))
        .sort((a, b) => a.order - b.order)
        .map(({ vol, items }) => ({ vol, items }));

      // ── Comments (active document's review thread) ──
      let comments: DocCommentView[] = [];
      if (activeDoc) {
        const commentRows = await db
          .select()
          .from(documentComments)
          .where(eq(documentComments.documentId, activeDoc.id))
          .orderBy(documentComments.createdAt)
          .limit(200);

        comments = commentRows.map(c => ({
          id: String(c.id),
          block: c.sectionReference ?? '',
          author: c.authorName,
          role: commentRoleLabel(c.commentType),
          when: relativeTime(c.createdAt),
          // No AI-authorship marker exists on document_comments; never guessed.
          ai: false,
          body: c.content,
        }));
      }

      const data: DocumentAuthoringWorkspaceView = {
        program,
        tree,
        // Intentionally empty — no governed per-block confidence/provenance store.
        blocks: [],
        comments,
        activeDocumentId: activeDoc ? String(activeDoc.id) : null,
        meta: {
          blocksAvailable: false,
          blocksReason:
            'No governed per-block confidence/provenance/citation store exists for eCTD authoring content; blocks are omitted rather than fabricated.',
          readinessBasis:
            'derived: round(100 * Σ statusWeight / documentCount), approved|effective=1, in_review|pending_approval=0.5, else 0',
          commentAuthorshipAvailable: false,
          totalDocuments: docRows.length,
        },
      };

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('workspace read error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res
        .status(500)
        .json({ success: false, error: 'Failed to load document authoring workspace' });
    }
  });

  return router;
}
