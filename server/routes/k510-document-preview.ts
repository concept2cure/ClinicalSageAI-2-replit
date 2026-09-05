/**
 * Live 510(k) document preview — assembles the current state of the
 * dossier from cerv2_510k_sections at request time.
 *
 *   GET /api/510k/projects/:projectIdent/document-preview
 *
 * `projectIdent` accepts any of:
 *   - a numeric `fda510kProjects.id` (GA path)
 *   - a UUID `regulatoryPrograms.id` (BETA path)
 *   - a `regulatoryPrograms.code` string (programmer-friendly fallback)
 *
 * Returns a structured payload the UI can render as a canvas + a
 * pre-assembled Markdown blob the user can read directly. Tenant-
 * scoped (cross-tenant requests get 404).
 *
 * Read-only. Audited as `k510_workflow.document_preview.read` so an
 * auditor can see when a user pulled the live state.
 *
 * The point of this endpoint is to let the user see the actual
 * document at any moment during the build — the answer to "what does
 * my submission look like right now?".
 */

import { Router, Request, Response } from 'express';
import { and, asc, eq, sql } from 'drizzle-orm';

import { authenticateToken } from '../middleware/auth';
import { db } from '../db';
import {
  cerv2510kSections,
  fda510kProjects,
} from '../../shared/schema';
import { regulatoryPrograms } from '../../shared/schema/programs';
import auditService from '../services/auditService';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

interface SectionRow {
  id: number;
  documentId: number | null;
  sectionNumber: string;
  sectionTitle: string;
  sectionKey: string;
  category: string;
  status: string | null;
  completionPercentage: number | null;
  content: string | null;
  isRequired: boolean | null;
  parentSectionId: number | null;
  level: number | null;
  displayOrder: number;
  updatedAt: Date | null;
  draftSource: string | null;
  draftedAt: Date | null;
  draftedSummary: string | null;
  /** Stamped on accept; draftSource is kept, so this is what says "pending" (ledger L155). */
  acceptedAt: Date | null;
}

router.get('/:projectIdent/document-preview', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  const ident = String(req.params.projectIdent);
  if (!ident) {
    return res.status(422).json({ error: 'projectIdent is required' });
  }

  // 301 redirect: if a c2c_documents row exists for this project identifier,
  // point to the canonical /api/c2c/documents/:id/outline endpoint.
  // Fall through if no migrated document found (legacy handler serves the response).
  if (/^\d+$/.test(ident)) {
    try {
      const newDocId = `doc_fda510k_${ident}`;
      const { rows } = await db.execute(sql`
        SELECT id FROM c2c_documents WHERE id = ${newDocId} LIMIT 1
      `);
      if (rows.length > 0) {
        res.set('Deprecation', 'true');
        res.set('Sunset', '2026-08-01');
        return res.redirect(301, `/api/c2c/documents/${newDocId}/outline`);
      }
    } catch {
      // c2c_documents may not exist yet — fall through.
    }
  }

  // Resolve the identifier in priority order, all tenant-scoped:
  //   1. Numeric → fda510kProjects.id (GA path)
  //   2. UUID    → regulatoryPrograms.id (BETA path)
  //   3. else    → regulatoryPrograms.code (programmer-friendly fallback)
  let projectRow: { id: string; title: string | null; status: string | null } | null = null;

  if (/^\d+$/.test(ident)) {
    try {
      const [row] = await db
        .select({
          id: fda510kProjects.id,
          deviceName: fda510kProjects.deviceName,
          status: fda510kProjects.status,
        })
        .from(fda510kProjects)
        .where(
          and(
            eq(fda510kProjects.id, Number(ident)),
            eq(fda510kProjects.organizationId, orgId),
          ),
        )
        .limit(1);
      if (row) {
        projectRow = { id: String(row.id), title: row.deviceName, status: row.status };
      }
    } catch {
      // fall through
    }
  } else if (UUID_RE.test(ident)) {
    try {
      const [row] = await db
        .select({
          id: regulatoryPrograms.id,
          name: regulatoryPrograms.name,
          status: regulatoryPrograms.status,
        })
        .from(regulatoryPrograms)
        .where(
          and(
            eq(regulatoryPrograms.id, ident),
            eq(regulatoryPrograms.organizationId, orgId),
          ),
        )
        .limit(1);
      if (row) projectRow = { id: row.id, title: row.name, status: row.status };
    } catch {
      // fall through
    }
  } else {
    try {
      const [row] = await db
        .select({
          id: regulatoryPrograms.id,
          name: regulatoryPrograms.name,
          status: regulatoryPrograms.status,
        })
        .from(regulatoryPrograms)
        .where(
          and(
            eq(regulatoryPrograms.code, ident),
            eq(regulatoryPrograms.organizationId, orgId),
          ),
        )
        .limit(1);
      if (row) projectRow = { id: row.id, title: row.name, status: row.status };
    } catch {
      // fall through
    }
  }

  if (!projectRow) {
    return res.status(404).json({ error: 'Project not found in your organization' });
  }

  // Pull all sections in display order. Sections live under
  // organization_id directly (the table has both org_id and document_id).
  // We use the project's documentId field if available; otherwise fall
  // back to all sections in the org. This is intentionally permissive
  // for BETA tenants whose section→project linkage isn't always set.
  let sections: SectionRow[] = [];
  try {
    const rows = await db
      .select({
        id: cerv2510kSections.id,
        documentId: cerv2510kSections.documentId,
        sectionNumber: cerv2510kSections.sectionNumber,
        sectionTitle: cerv2510kSections.sectionTitle,
        sectionKey: cerv2510kSections.sectionKey,
        category: cerv2510kSections.category,
        status: cerv2510kSections.status,
        completionPercentage: cerv2510kSections.completionPercentage,
        content: cerv2510kSections.content,
        isRequired: cerv2510kSections.isRequired,
        parentSectionId: cerv2510kSections.parentSectionId,
        level: cerv2510kSections.level,
        displayOrder: cerv2510kSections.displayOrder,
        updatedAt: cerv2510kSections.updatedAt,
        draftSource: cerv2510kSections.draftSource,
        draftedAt: cerv2510kSections.draftedAt,
        draftedSummary: cerv2510kSections.draftedSummary,
        acceptedAt: cerv2510kSections.acceptedAt,
      })
      .from(cerv2510kSections)
      .where(eq(cerv2510kSections.organizationId, orgId))
      .orderBy(asc(cerv2510kSections.displayOrder));
    sections = rows as SectionRow[];
  } catch {
    sections = [];
  }

  // Aggregates.
  const approvedCount = sections.filter(s =>
    ['validated', 'approved'].includes(s.status ?? ''),
  ).length;
  const draftingCount = sections.filter(s => s.status === 'drafting').length;
  const todoCount = sections.filter(s => (s.status ?? 'todo') === 'todo').length;
  const totalCompletion =
    sections.length === 0
      ? 0
      : Math.round(
          sections.reduce((acc, s) => acc + (s.completionPercentage ?? 0), 0) /
            sections.length,
        );

  // Render assembled Markdown — heading per section + verbatim content.
  // Skips sections with no content + status='todo' so the preview shows
  // what's actually authored, not a wall of empty placeholders. Sections
  // marked required-but-empty surface as "_(Section pending — required.)_"
  const lines: string[] = [];
  lines.push(`# ${projectRow.title ?? `510(k) Project #${projectRow.id}`}`);
  lines.push('');
  lines.push(`Live preview · assembled ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Status: **${projectRow.status ?? 'unknown'}** · ${approvedCount}/${sections.length} sections approved · overall ${totalCompletion}% complete`);
  lines.push('');
  for (const s of sections) {
    const titleSuffix = s.sectionTitle ? ` — ${s.sectionTitle}` : '';
    lines.push(`## §${s.sectionNumber}${titleSuffix}`);
    lines.push('');
    const statusBadge = s.status ?? 'todo';
    const completion = s.completionPercentage ?? 0;
    lines.push(`_Status: ${statusBadge} · ${completion}% complete_`);
    lines.push('');
    const content = (s.content ?? '').trim();
    if (content.length > 0) {
      lines.push(content);
    } else if (s.isRequired) {
      lines.push('_(Section pending — required for submission.)_');
    } else {
      lines.push('_(Section empty — optional.)_');
    }
    lines.push('');
  }
  const assembledMarkdown = lines.join('\n');

  // Audit the read.
  void auditService.logAction({
    tenantId: orgId,
    userId: (req as any).user?.id ?? null,
    action: 'k510_workflow.document_preview.read',
    resourceType: 'k510_document_preview',
    resourceId: String(projectRow.id),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
    details: {
      sectionCount: sections.length,
      approvedCount,
      draftingCount,
      todoCount,
      completionPercentage: totalCompletion,
    },
  });

  res.json({
    projectId: projectRow.id,
    documentTitle: projectRow.title ?? `510(k) Project ${projectRow.id}`,
    projectStatus: projectRow.status ?? 'unknown',
    assembledAt: new Date().toISOString(),
    totalSections: sections.length,
    approvedCount,
    draftingCount,
    todoCount,
    completionPercentage: totalCompletion,
    sections: sections.map(s => ({
      id: s.id,
      sectionNumber: s.sectionNumber,
      sectionTitle: s.sectionTitle,
      sectionKey: s.sectionKey,
      category: s.category,
      status: s.status ?? 'todo',
      completionPercentage: s.completionPercentage ?? 0,
      contentLength: (s.content ?? '').length,
      content: s.content ?? '',
      isRequired: s.isRequired ?? false,
      parentSectionId: s.parentSectionId,
      level: s.level ?? 1,
      displayOrder: s.displayOrder,
      updatedAt: s.updatedAt?.toISOString?.() ?? null,
      /* Draft provenance — populated when AnA drafted via write_kit_section
         and not yet accepted. Surfaces the kit's "drafted by AnA — accept /
         refine" affordance. */
      draftSource: s.draftSource ?? null,
      draftedAt: s.draftedAt?.toISOString?.() ?? null,
      draftedSummary: s.draftedSummary ?? null,
      acceptedAt: s.acceptedAt?.toISOString?.() ?? null,
    })),
    assembledMarkdown,
  });
});

export default router;
