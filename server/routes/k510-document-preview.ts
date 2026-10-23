/** Live, project- and document-class-scoped preview for existing MDX sections.
 * UUID/code identifiers resolve the canonical program; numeric FDA identifiers
 * require its recorded project anchor. A missing document is empty, an unreadable
 * store is unavailable, and no path falls back to organization-wide content. */
import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requestPgClient, type RequestSqlClient } from '../db/requestDb';
import { requireCurrentProgramAccess, ProgramReadAccessError } from '../services/c2c/current-program-access';
import { PROGRAM_TO_DOC_TYPE } from '../services/c2c/document-class';
import { loadGovernedDeviceDocument, loadGovernedSectionRows, governedSectionsToDeviceSections, type DeviceContentClient } from '../services/pathway-engines/estar/estar-content-leaves';
import { recordAuditRow } from '../services/audit/audit-write-outcome';

const router = Router();
router.use(authenticateToken);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_TYPES = ['k510', 'denovo', 'pma', 'cer', 'mdr', 'ivdr'] as const;
type PreviewDocType = (typeof DOC_TYPES)[number];
interface PreviewProgram { id: string; name: string | null; status: string | null; program_type: string }

function validRequestedType(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && (DOC_TYPES as readonly string[]).includes(value));
}
function currentUserId(req: Request): number | undefined {
  const id = Number(req.user?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/** Resolve identifiers only through recorded identities; admission follows before content. */
async function resolveProgram(q: RequestSqlClient, ident: string, org: number): Promise<PreviewProgram | null> {
  if (/^\d+$/.test(ident)) {
    const legacy = await q.query(`SELECT p.regulatory_program_id AS program_id
      FROM fda_510k_projects f JOIN projects p ON p.id=f.project_id AND p.organization_id=f.organization_id
      WHERE f.id=$1 AND f.organization_id=$2`, [Number(ident), org]);
    const programId = legacy.rows[0]?.program_id;
    if (!programId) {
      if (legacy.rows.length) throw new ProgramReadAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', 'This legacy device record needs a verified project relationship before its document can be previewed.');
      return null;
    }
    return resolveProgram(q, String(programId), org);
  }
  const statement = UUID_RE.test(ident)
    ? 'SELECT id, name, status, program_type FROM regulatory_programs WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL LIMIT 1'
    : 'SELECT id, name, status, program_type FROM regulatory_programs WHERE code=$1 AND organization_id=$2 AND deleted_at IS NULL LIMIT 1';
  const result = await q.query(statement, [ident, org]);
  return (result.rows[0] as unknown as PreviewProgram | undefined) ?? null;
}

function documentType(value: unknown, program: PreviewProgram): PreviewDocType | null {
  const requested = value === undefined ? PROGRAM_TO_DOC_TYPE[program.program_type.toLowerCase()] : value;
  return typeof requested === 'string' && (DOC_TYPES as readonly string[]).includes(requested) ? requested as PreviewDocType : null;
}

async function readPreview(q: RequestSqlClient, organizationId: number, programId: string, docType: PreviewDocType) {
  const contentClient: DeviceContentClient = { query: async <T>(text: string, params?: unknown[]) => ({ rows: (await q.query(text, params)).rows as T[] }) };
  const doc = await loadGovernedDeviceDocument(organizationId, programId, contentClient, [docType]);
  if (!doc) return { documentId: null, sections: [] };
  const governed = await loadGovernedSectionRows(doc.id, contentClient);
  const adapted = governedSectionsToDeviceSections(governed);
  const sections = governed.map((row, index) => ({
    id: row.id ?? row.section_key, documentId: doc.id,
    sectionNumber: row.section_key, sectionKey: row.section_key, sectionTitle: row.label, category: row.label,
    status: row.status ?? 'todo', completionPercentage: null,
    content: adapted[index].content ?? '', contentLength: (adapted[index].content ?? '').length,
    isRequired: row.mandatory === true, parentSectionId: null, level: null, displayOrder: index,
    updatedAt: null, draftSource: null, draftedAt: null, draftedSummary: null, acceptedAt: null,
  }));
  return { documentId: doc.id, sections };
}

type PreviewSections = Awaited<ReturnType<typeof readPreview>>['sections'];
function assembleMarkdown(program: PreviewProgram, sections: PreviewSections): string {
  const lines = [`# ${program.name ?? 'Device project'}`, '', `Status: **${program.status ?? 'unknown'}**`, ''];
  for (const section of sections) {
    lines.push(`## §${section.sectionNumber} — ${section.sectionTitle}`, '', `_Status: ${section.status}_`, '',
      section.content.trim() || (section.isRequired ? '_(Section pending — required for submission.)_' : '_(Section empty — optional.)_'), '');
  }
  return lines.join('\n');
}

router.get('/:projectIdent/document-preview', async (req: Request, res: Response) => {
  const orgId = Number(req.user?.organizationId);
  if (!Number.isSafeInteger(orgId) || orgId <= 0) return res.status(403).json({ error: 'Organization context required' });
  const ident = String(req.params.projectIdent ?? '').trim();
  if (!ident) return res.status(422).json({ error: 'projectIdent is required' });
  if (!validRequestedType(req.query.docType)) {
    return res.status(422).json({ error: 'A supported device document class is required' });
  }
  try {
    const q = requestPgClient(req);
    const project = await resolveProgram(q, ident, orgId);
    if (!project) return res.status(404).json({ error: 'Project not found in your organization' });
    const userId = currentUserId(req);
    await requireCurrentProgramAccess(q, { organizationId: orgId, userId, programId: project.id });
    const docType = documentType(req.query.docType, project);
    if (!docType) return res.status(422).json({ error: 'This project has no supported device document class for preview' });
    const { documentId, sections } = await readPreview(q, orgId, project.id, docType);
    const approvedCount = sections.filter(section => ['validated', 'approved', 'locked', 'finalized'].includes(section.status)).length;
    const draftingCount = sections.filter(section => ['draft', 'drafting', 'drafted', 'in_progress'].includes(section.status)).length;
    const todoCount = sections.filter(section => ['todo', 'not_started', 'pending'].includes(section.status)).length;
    const auditTrail = await recordAuditRow({ tenantId: orgId, userId,
      action: 'k510_workflow.document_preview.read', resourceType: 'k510_document_preview', resourceId: project.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'],
      details: { programId: project.id, documentId, docType, sectionCount: sections.length, approvedCount, draftingCount, todoCount },
    });
    return res.json({ access: { auditTrail }, projectId: project.id, documentId, docType,
      documentTitle: project.name ?? 'Device project', projectStatus: project.status ?? 'unknown', assembledAt: new Date().toISOString(),
      totalSections: sections.length, approvedCount, draftingCount, todoCount,
      // The governed section store has statuses, not completion percentages.
      completionPercentage: null, sections, assembledMarkdown: assembleMarkdown(project, sections),
    });
  } catch (error) {
    if (error instanceof ProgramReadAccessError) return res.status(error.status).json({ error: error.message, code: error.code });
    return res.status(503).json({ error: 'This project document could not be read. Try again shortly.', code: 'DOCUMENT_PREVIEW_UNAVAILABLE' });
  }
});

export default router;
