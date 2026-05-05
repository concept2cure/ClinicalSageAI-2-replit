/**
 * MDX Dossier adapter API routes — kit-shaped views over the per-pathway
 * section storage tables. Mirrors the in-memory `DossierStore` from the
 * design-system kit (`design-system/ui_kits/mdx/dossier-store.jsx`) so
 * panes can read real section content without knowing which table backs
 * each pathway.
 *
 * Mounted at:  /api/mdx/dossier
 *
 * Endpoints:
 *   GET   /api/mdx/dossier/:pathway/:projectIdent/sections
 *         List all sections for a program (kit shape).
 *   GET   /api/mdx/dossier/:pathway/:projectIdent/sections/:sectionId
 *         Single section view — body / meta / attachments / folder path.
 *   PATCH /api/mdx/dossier/:pathway/:projectIdent/sections/:sectionId
 *         Persist a body edit; writes a Part 11 audit_events row tagged
 *         with the section's entity_id so useAuditTrail picks it up.
 *
 * Pathways:
 *   - 'k510' → cerv2_510k_sections (full content)
 *   - 'cer'  → cer_sections (content lives as JSON)
 *   - 'pma'  → not yet backed by a dedicated section table; returns the
 *              shape with empty body and a `pending: true` flag in meta
 *              so panes can render a "section storage pending" state
 *              instead of a hard error. When a PMA section table lands
 *              this is the single point to update.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { and, asc, eq } from 'drizzle-orm';
import {
  cerv2510kSections,
  cerSections,
  cerReports,
  fda510kProjects,
  projects,
  auditEvents,
} from '../../shared/schema';
import { regulatoryPrograms } from '../../shared/schema/programs';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Pathway = 'k510' | 'pma' | 'cer';

function getOrgId(req: Request): number | null {
  const v =
    (req as any).organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).user?.organizationId ??
    (req as any).tenantId;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getUserId(req: Request): { id: number; name: string; role: string } {
  const id = Number((req as any).user?.id ?? (req as any).userId ?? 0);
  return {
    id,
    name: (req as any).user?.name ?? 'You',
    role: (req as any).user?.role ?? 'Reg Lead',
  };
}

function isPathway(s: string): s is Pathway {
  return s === 'k510' || s === 'pma' || s === 'cer';
}

// ─── Project resolution per pathway ────────────────────────────────────────

interface ProjectResolved {
  /** Stable numeric / textual identifier — used as the audit entity scoping anchor. */
  id: string;
  title: string;
  /** When set, caller can use as a URL segment for re-fetch. */
  ident: string;
}

async function resolveK510Project(orgId: number, ident: string): Promise<ProjectResolved | null> {
  if (/^\d+$/.test(ident)) {
    const [row] = await db
      .select({ id: fda510kProjects.id, deviceName: fda510kProjects.deviceName })
      .from(fda510kProjects)
      .where(and(eq(fda510kProjects.id, Number(ident)), eq(fda510kProjects.organizationId, orgId)))
      .limit(1);
    if (row) return { id: String(row.id), title: row.deviceName ?? '', ident };
  }
  if (UUID_RE.test(ident)) {
    const [row] = await db
      .select({ id: regulatoryPrograms.id, name: regulatoryPrograms.name })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, ident), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (row) return { id: row.id, title: row.name ?? '', ident };
  }
  const [row] = await db
    .select({ id: regulatoryPrograms.id, name: regulatoryPrograms.name })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.code, ident), eq(regulatoryPrograms.organizationId, orgId)))
    .limit(1);
  if (row) return { id: row.id, title: row.name ?? '', ident };
  return null;
}

async function resolveCerReport(orgId: number, ident: string): Promise<ProjectResolved | null> {
  /* CER project ident can be a reportId (text), a numeric cer_reports.id, or a programs.code. */
  const tryReportId = await db
    .select({ id: cerReports.id, reportId: cerReports.reportId, deviceName: cerReports.deviceName })
    .from(cerReports)
    .where(and(eq(cerReports.reportId, ident), eq(cerReports.organizationId, orgId)))
    .limit(1);
  if (tryReportId[0]) {
    return { id: tryReportId[0].reportId, title: tryReportId[0].deviceName ?? '', ident };
  }
  if (/^\d+$/.test(ident)) {
    const [row] = await db
      .select({ id: cerReports.id, reportId: cerReports.reportId, deviceName: cerReports.deviceName })
      .from(cerReports)
      .where(and(eq(cerReports.id, Number(ident)), eq(cerReports.organizationId, orgId)))
      .limit(1);
    if (row) return { id: row.reportId, title: row.deviceName ?? '', ident };
  }
  return null;
}

async function resolvePmaProject(orgId: number, ident: string): Promise<ProjectResolved | null> {
  /* PMA tracking lives on the generic `projects` table; ident is project id or code. */
  if (/^\d+$/.test(ident)) {
    const [row] = await db
      .select({ id: projects.id, name: projects.name, code: projects.code })
      .from(projects)
      .where(and(eq(projects.id, Number(ident)), eq(projects.organizationId, orgId)))
      .limit(1);
    if (row) return { id: String(row.id), title: row.name, ident };
  }
  const [row] = await db
    .select({ id: projects.id, name: projects.name, code: projects.code })
    .from(projects)
    .where(and(eq(projects.code, ident), eq(projects.organizationId, orgId)))
    .limit(1);
  if (row) return { id: String(row.id), title: row.name, ident };
  return null;
}

async function resolveProject(
  pathway: Pathway,
  orgId: number,
  ident: string,
): Promise<ProjectResolved | null> {
  if (pathway === 'k510') return resolveK510Project(orgId, ident);
  if (pathway === 'cer')  return resolveCerReport(orgId, ident);
  return resolvePmaProject(orgId, ident);
}

// ─── Section list ──────────────────────────────────────────────────────────

interface KitSectionListItem {
  id: string | number;
  num: string;
  label: string;
  status: 'complete' | 'review' | 'draft' | 'na' | 'empty' | 'blocked';
  required: boolean;
  category?: string;
}

function statusFromBackend(s: string | null | undefined): KitSectionListItem['status'] {
  const v = (s ?? '').toLowerCase();
  if (v === 'approved' || v === 'validated' || v === 'complete') return 'complete';
  if (v === 'review' || v === 'in_review')                       return 'review';
  if (v === 'drafting' || v === 'in_progress' || v === 'draft')  return 'draft';
  if (v === 'na' || v === 'not_applicable')                       return 'na';
  if (v === 'blocked')                                            return 'blocked';
  return 'empty';
}

async function listSectionsK510(orgId: number): Promise<KitSectionListItem[]> {
  const rows = await db
    .select()
    .from(cerv2510kSections)
    .where(eq(cerv2510kSections.organizationId, orgId))
    .orderBy(asc(cerv2510kSections.displayOrder));
  return rows.map((r) => ({
    id:       r.id,
    num:      `§${r.sectionNumber ?? r.id}`,
    label:    r.sectionTitle ?? `Section ${r.id}`,
    status:   statusFromBackend(r.status),
    required: Boolean(r.isRequired),
    category: r.category ?? undefined,
  }));
}

async function listSectionsCer(reportId: string): Promise<KitSectionListItem[]> {
  const rows = await db
    .select()
    .from(cerSections)
    .where(eq(cerSections.reportId, reportId))
    .orderBy(asc(cerSections.order));
  return rows.map((r) => ({
    id:       r.sectionId,
    num:      r.sectionId,
    label:    r.title,
    status:   statusFromBackend(r.status),
    required: true,
  }));
}

async function listSectionsPma(): Promise<KitSectionListItem[]> {
  /* PMA section storage is not yet backed by a dedicated table — return an
     empty list so the pane renders a clean empty state. When a PMA section
     table lands, populate this. */
  return [];
}

// ─── Section detail (body + meta + attachments) ────────────────────────────

interface KitSectionMeta {
  sectionId: string | number;
  label: string;
  status: KitSectionListItem['status'];
  version: number;
  lastEdited: string;
  lastEditor: string;
  pending?: boolean;
}

interface KitSectionView {
  body: string;
  meta: KitSectionMeta;
  attachments: unknown[];
  folder: string;
}

function jsonContentToMarkdown(json: unknown): string {
  if (json == null) return '';
  if (typeof json === 'string') return json;
  if (Array.isArray(json)) {
    return json
      .map((p) => (typeof p === 'string' ? p : JSON.stringify(p, null, 2)))
      .join('\n\n');
  }
  if (typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (typeof obj.markdown === 'string') return obj.markdown;
    if (typeof obj.body === 'string')     return obj.body;
    if (typeof obj.text === 'string')     return obj.text;
    return JSON.stringify(json, null, 2);
  }
  return String(json);
}

async function getSectionK510(orgId: number, sectionIdent: string): Promise<KitSectionView | null> {
  const sectionId = Number(sectionIdent);
  if (!Number.isFinite(sectionId)) return null;
  const [row] = await db
    .select()
    .from(cerv2510kSections)
    .where(and(eq(cerv2510kSections.id, sectionId), eq(cerv2510kSections.organizationId, orgId)))
    .limit(1);
  if (!row) return null;
  return {
    body:        row.content ?? '',
    meta: {
      sectionId:  row.id,
      label:      row.sectionTitle ?? `Section ${row.id}`,
      status:     statusFromBackend(row.status),
      version:    1, /* version bumped via cerv2_section_versions on PATCH */
      lastEdited: row.updatedAt?.toISOString() ?? '',
      lastEditor: '',
    },
    attachments: [],
    folder:      `Files/Dossier/510(k)/${row.sectionNumber ?? row.id} ${row.sectionTitle ?? ''}`.trim(),
  };
}

async function getSectionCer(reportId: string, sectionIdent: string): Promise<KitSectionView | null> {
  const [row] = await db
    .select()
    .from(cerSections)
    .where(and(eq(cerSections.reportId, reportId), eq(cerSections.sectionId, sectionIdent)))
    .limit(1);
  if (!row) return null;
  return {
    body:        jsonContentToMarkdown(row.content),
    meta: {
      sectionId:  row.sectionId,
      label:      row.title,
      status:     statusFromBackend(row.status),
      version:    1,
      lastEdited: row.updatedAt?.toISOString() ?? '',
      lastEditor: '',
    },
    attachments: [],
    folder:      `Files/Dossier/CER/${row.sectionId} ${row.title}`.trim(),
  };
}

async function getSectionPma(): Promise<KitSectionView> {
  return {
    body:        '',
    meta: {
      sectionId:  '—',
      label:      'PMA section storage pending',
      status:     'empty',
      version:    0,
      lastEdited: '',
      lastEditor: '',
      pending:    true,
    },
    attachments: [],
    folder:      'Files/Dossier/PMA',
  };
}

// ─── Audit-event writer (Part 11 hash chain) ───────────────────────────────

async function writeSectionEditAudit(
  orgId: number,
  user: { id: number; name: string; role: string },
  pathway: Pathway,
  resolved: ProjectResolved,
  sectionIdent: string,
  diffSummary: string,
  ip: string | null,
) {
  await db.insert(auditEvents).values({
    organizationId: orgId,
    eventType:      'section.edit',
    entityType:     `dossier.${pathway}`,
    entityId:       Number.isFinite(Number(sectionIdent)) ? Number(sectionIdent) : 0,
    userId:         user.id || null,
    userName:       user.name,
    userRole:       user.role,
    ipAddress:      ip ?? '',
    reason:         diffSummary,
    metadata:       {
      pathway,
      sectionIdent,
      projectIdent: resolved.ident,
      projectId:    resolved.id,
      diff:         diffSummary,
    },
    requiresSignature:     false,
    regulatorySignificant: true,
    gxpRelevant:           true,
  } as any);
}

function approxDiff(prev: string, next: string): string {
  const a = prev.split('\n');
  const b = next.split('\n');
  const setA = new Set(a);
  const setB = new Set(b);
  let add = 0;
  let rem = 0;
  for (const l of b) if (!setA.has(l)) add += l.length;
  for (const l of a) if (!setB.has(l)) rem += l.length;
  return `+${Math.max(1, Math.round(add / 8))} / −${Math.max(0, Math.round(rem / 8))}`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

router.get('/:pathway/:projectIdent/sections', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
    const pathway = String(req.params.pathway);
    if (!isPathway(pathway)) return res.status(400).json({ error: 'Invalid pathway' });

    const ident = String(req.params.projectIdent);
    const resolved = await resolveProject(pathway, orgId, ident);
    if (!resolved) return res.status(404).json({ error: 'Project not found' });

    let sections: KitSectionListItem[] = [];
    if (pathway === 'k510')      sections = await listSectionsK510(orgId);
    else if (pathway === 'cer')  sections = await listSectionsCer(resolved.id);
    else                          sections = await listSectionsPma();

    res.json({
      project: { id: resolved.id, ident: resolved.ident, title: resolved.title },
      sections,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.get('/:pathway/:projectIdent/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
    const pathway = String(req.params.pathway);
    if (!isPathway(pathway)) return res.status(400).json({ error: 'Invalid pathway' });

    const ident = String(req.params.projectIdent);
    const sectionId = String(req.params.sectionId);
    const resolved = await resolveProject(pathway, orgId, ident);
    if (!resolved) return res.status(404).json({ error: 'Project not found' });

    let view: KitSectionView | null = null;
    if (pathway === 'k510')      view = await getSectionK510(orgId, sectionId);
    else if (pathway === 'cer')  view = await getSectionCer(resolved.id, sectionId);
    else                          view = await getSectionPma();

    if (!view) return res.status(404).json({ error: 'Section not found' });
    res.json({ data: view });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.patch('/:pathway/:projectIdent/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
    const pathway = String(req.params.pathway);
    if (!isPathway(pathway)) return res.status(400).json({ error: 'Invalid pathway' });

    const user = getUserId(req);
    const ident = String(req.params.projectIdent);
    const sectionId = String(req.params.sectionId);
    const body = String(req.body?.body ?? '');
    const reason = String(req.body?.reason ?? '');

    const resolved = await resolveProject(pathway, orgId, ident);
    if (!resolved) return res.status(404).json({ error: 'Project not found' });

    let nextView: KitSectionView | null = null;

    if (pathway === 'k510') {
      const numericId = Number(sectionId);
      if (!Number.isFinite(numericId)) return res.status(400).json({ error: 'Invalid section id' });
      const [prev] = await db
        .select({ content: cerv2510kSections.content })
        .from(cerv2510kSections)
        .where(and(eq(cerv2510kSections.id, numericId), eq(cerv2510kSections.organizationId, orgId)))
        .limit(1);
      if (!prev) return res.status(404).json({ error: 'Section not found' });
      await db
        .update(cerv2510kSections)
        .set({ content: body, updatedAt: new Date() })
        .where(and(eq(cerv2510kSections.id, numericId), eq(cerv2510kSections.organizationId, orgId)));
      const diff = approxDiff(prev.content ?? '', body);
      await writeSectionEditAudit(
        orgId, user, pathway, resolved, sectionId,
        reason || diff,
        (req.ip ?? null) as string | null,
      );
      nextView = await getSectionK510(orgId, sectionId);
    } else if (pathway === 'cer') {
      const [prev] = await db
        .select({ content: cerSections.content })
        .from(cerSections)
        .where(and(eq(cerSections.reportId, resolved.id), eq(cerSections.sectionId, sectionId)))
        .limit(1);
      if (!prev) return res.status(404).json({ error: 'Section not found' });
      await db
        .update(cerSections)
        .set({ content: { markdown: body }, updatedAt: new Date() })
        .where(and(eq(cerSections.reportId, resolved.id), eq(cerSections.sectionId, sectionId)));
      const diff = approxDiff(jsonContentToMarkdown(prev.content), body);
      await writeSectionEditAudit(
        orgId, user, pathway, resolved, sectionId,
        reason || diff,
        (req.ip ?? null) as string | null,
      );
      nextView = await getSectionCer(resolved.id, sectionId);
    } else {
      return res.status(501).json({ error: 'PMA section editing not yet supported' });
    }

    res.json({ data: nextView });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

export default router;
