/** Existing template resolution plus IND start checks; all writes remain in authoring-documents. */
import { createScopedLogger } from '../../utils/logger';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from './authoring-program-access';
import { getIndAuthoringTemplate, indTemplateSnapshot } from './ind-authoring-templates';
import type { IndAuthoringTemplate } from './ind-template-types';
import type { AuthoringPool, Binding, CreateContext, CreateDocumentInput, Refusal } from './authoring-documents';

const logger = createScopedLogger('authoring-documents');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TemplateSectionSeed {
  code: string;
  title: string;
  content: string;
  ordering: number;
}

/**
 * Resolve the template BEFORE anything is written.
 *
 * Two template stores are legitimate here and the picker offers both: the
 * GLOBAL regulatory reference store (intelligence.document_templates —
 * structure + guidance, no prose) and the org's own authoring_templates
 * (tenant-scoped, sections WITH content). A create that cannot honor its
 * chosen template must refuse before the INSERT, not lie after it.
 */
export async function resolveTemplateSections(
  pool: AuthoringPool,
  tenantId: number,
  templateId: string,
): Promise<TemplateSectionSeed[] | Refusal> {
  if (!UUID_RE.test(templateId)) {
    return { kind: 'refused', status: 400, error: 'template_id must be a valid UUID' };
  }
  const builtin = getIndAuthoringTemplate(templateId);
  if (builtin) return builtin.sections;
  // (a) The global reference store. Deliberately no tenant filter — these
  // templates describe agency expectations, not customer content; tenancy
  // comes from the document being created. FAIL SOFT to zero rows when the
  // intelligence schema is absent (a separate bundle, missing in some
  // deployments and the authoring harness).
  let globalSections: { rows: any[] } = { rows: [] };
  try {
    globalSections = await pool.query(
      `SELECT ts.section_code, ts.section_title, ts.ordering
         FROM intelligence.template_sections ts
         JOIN intelligence.document_templates t ON t.id = ts.template_id AND t.status = 'active'
        WHERE ts.template_id = $1
        ORDER BY ts.ordering`,
      [templateId],
    );
  } catch (intelErr) {
    logger.warn('Global template store unavailable during create; trying the org store', {
      error: intelErr instanceof Error ? intelErr.message : String(intelErr),
    });
  }
  if (globalSections.rows.length > 0) {
    return globalSections.rows.map((r: any, i: number) => ({
      code: String(r.section_code),
      title: String(r.section_title),
      // Structure and guidance only — the honest scaffold starts empty.
      content: '',
      ordering: Number.isFinite(Number(r.ordering)) ? Number(r.ordering) : i,
    }));
  }
  // (b) The org's own template store (tenant-scoped, carries content).
  const orgTemplate = await pool.query(
    `SELECT template_content FROM authoring_templates
      WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
    [templateId, tenantId],
  );
  const orgSections = orgTemplate.rows[0]?.template_content?.sections;
  if (Array.isArray(orgSections) && orgSections.length > 0) {
    return orgSections.map((s: any, i: number) => ({
      code: String(s.code ?? ''),
      title: String(s.title ?? ''),
      content: typeof s.content === 'string' ? s.content : '',
      ordering: Number.isFinite(Number(s.order_index)) ? Number(s.order_index) : i,
    }));
  }
  return {
    kind: 'refused',
    status: 404,
    // The client appends its own "Nothing was persisted." on every failed
    // create — the reason must not restate it (double-period, said twice).
    error: 'No template with this id has any sections in your organization or the global reference store.',
  };
}

/** A builtin must use its actual module and the current writable project. */
export async function refuseIndTemplateStart(ctx: CreateContext, input: CreateDocumentInput, builtin: IndAuthoringTemplate | undefined): Promise<Refusal | null> {
  if (!builtin) return null;
  if (input.module !== undefined && input.module !== builtin.module) return { kind: 'refused', status: 400, error: 'Choose the module recorded by this IND template.', code: 'TEMPLATE_MODULE_MISMATCH' };
  try {
    await authorizeAuthoringProgram(ctx.pool, { tenantId: ctx.tenantId, actor: ctx.actor, programId: String(input.client_program_id) });
    return null;
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) return { kind: 'refused', status: error.status, error: error.message, code: error.code };
    throw error;
  }
}

export function indTemplateSource(builtin: IndAuthoringTemplate | undefined) {
  return builtin ? { id: builtin.id, entryId: builtin.entryId, version: builtin.version,
    sha256: indTemplateSnapshot(builtin), kind: builtin.kind, aiDraftable: builtin.aiDraftable,
    authoringMode: builtin.authoringMode, originalFormat: builtin.originalFormat, limitations: builtin.limitations } : null;
}

type TemplateSource = ReturnType<typeof indTemplateSource>;

export function indTemplateDocumentFields(builtin: IndAuthoringTemplate | undefined, fallbackModule: unknown, source: TemplateSource) {
  return { module: builtin ? builtin.module : fallbackModule == null ? null : String(fallbackModule),
    ...(source ? { provenance: { source: 'template', governedWrite: 'unverified', templateSource: source } } : {}) };
}

export function indTemplateSectionMetadata(builtin: IndAuthoringTemplate | undefined, source: TemplateSource, code: string) {
  return builtin ? { templateSource: source, templateGuidance: builtin.sections.find(row => row.code === code)?.guidance } : {};
}

export async function templateWorkingBinding(builtin: IndAuthoringTemplate | undefined, existing: () => Promise<Binding>): Promise<Binding> {
  return builtin ? { documentId: null, reason: 'IND template working copy; review and deliberately place it through the governed filing workflow.' } : existing();
}
