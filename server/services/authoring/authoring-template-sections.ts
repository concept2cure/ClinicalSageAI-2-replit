/** Existing template resolution and builtin start checks; writes stay in authoring-documents. */
import { createScopedLogger } from '../../utils/logger';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from './authoring-program-access';
import { getBuiltinAuthoringTemplate, builtinTemplateSnapshot, type BuiltinAuthoringTemplate } from './builtin-authoring-templates';
import type { Binding, CreateContext, CreateDocumentInput, Refusal } from './authoring-documents';
import type { Queryable } from './authoring-evidence';

const logger = createScopedLogger('authoring-documents');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TemplateSectionSeed {
  code: string;
  title: string;
  content: string;
  ordering: number;
}

interface TemplateResolveOptions { builtin: BuiltinAuthoringTemplate | undefined; transaction?: boolean; lock?: boolean }

async function globalTemplateSections(pool: Queryable, templateId: string, resolved?: TemplateResolveOptions): Promise<TemplateSectionSeed[]> {
  try {
    // A failed optional query aborts PostgreSQL transactions before JS catches
    // it. Probe absent bundles safely when running on a transaction client.
    const available = !resolved?.transaction || (await pool.query(
      "SELECT to_regclass('intelligence.template_sections') IS NOT NULL AND to_regclass('intelligence.document_templates') IS NOT NULL AS available",
    )).rows[0]?.available === true;
    if (!available) return [];
    const sql = resolved?.lock
      ? `SELECT ts.section_code, ts.section_title, ts.ordering
         FROM intelligence.template_sections ts
         JOIN intelligence.document_templates t ON t.id = ts.template_id AND t.status = 'active'
         WHERE ts.template_id = $1
         ORDER BY ts.ordering, ts.section_code, ts.section_title FOR SHARE OF ts, t`
      : `SELECT ts.section_code, ts.section_title, ts.ordering
         FROM intelligence.template_sections ts
         JOIN intelligence.document_templates t ON t.id = ts.template_id AND t.status = 'active'
         WHERE ts.template_id = $1
         ORDER BY ts.ordering, ts.section_code, ts.section_title`;
    const result = await pool.query(
      sql,
      [templateId],
    );
    return result.rows.map((row: Record<string, unknown>, index: number) => ({
      code: String(row.section_code), title: String(row.section_title), content: '',
      ordering: Number.isFinite(Number(row.ordering)) ? Number(row.ordering) : index,
    }));
  } catch (error) {
    if (resolved?.transaction) throw error;
    logger.warn('Global template store unavailable during create; trying the org store', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
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
  pool: Queryable,
  tenantId: number,
  templateId: string,
  resolved?: TemplateResolveOptions,
): Promise<TemplateSectionSeed[] | Refusal> {
  if (!UUID_RE.test(templateId)) {
    return { kind: 'refused', status: 400, error: 'template_id must be a valid UUID' };
  }
  const builtin = resolved ? resolved.builtin : await getBuiltinAuthoringTemplate(templateId);
  if (builtin) return builtin.sections;
  // (a) The global reference store. Deliberately no tenant filter — these
  // templates describe agency expectations, not customer content; tenancy
  // comes from the document being created. FAIL SOFT to zero rows when the
  // intelligence schema is absent (a separate bundle, missing in some
  // deployments and the authoring harness).
  const globalSections = await globalTemplateSections(pool, templateId, resolved);
  if (globalSections.length > 0) return globalSections;
  // (b) The org's own template store (tenant-scoped, carries content).
  const sql = resolved?.lock
    ? `SELECT template_content FROM authoring_templates
       WHERE id = $1 AND tenant_id = $2 AND is_active = true FOR SHARE`
    : `SELECT template_content FROM authoring_templates
       WHERE id = $1 AND tenant_id = $2 AND is_active = true`;
  const orgTemplate = await pool.query(
    sql,
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
export async function refuseBuiltinTemplateStart(ctx: CreateContext, input: CreateDocumentInput, builtin: BuiltinAuthoringTemplate | undefined): Promise<Refusal | null> {
  if (!builtin) return null;
  if (input.module !== undefined && input.module !== builtin.module) return { kind: 'refused', status: 400,
    error: `Choose the module recorded by this ${builtin.filingContext ? 'regulatory' : 'IND'} template.`, code: 'TEMPLATE_MODULE_MISMATCH' };
  try {
    await authorizeAuthoringProgram(ctx.pool, { tenantId: ctx.tenantId, actor: ctx.actor, programId: String(input.client_program_id) });
    return null;
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) return { kind: 'refused', status: error.status, error: error.message, code: error.code };
    throw error;
  }
}

export function builtinTemplateSource(builtin: BuiltinAuthoringTemplate | undefined) {
  return builtin ? { id: builtin.id, entryId: builtin.entryId, version: builtin.version,
    sha256: builtinTemplateSnapshot(builtin), kind: builtin.kind, aiDraftable: builtin.aiDraftable,
    authoringMode: builtin.authoringMode, originalFormat: builtin.originalFormat, limitations: builtin.limitations,
    ...(builtin.filingContext ? { filingContext: { ...builtin.filingContext } } : {}) } : null;
}

type TemplateSource = ReturnType<typeof builtinTemplateSource>;

export function builtinTemplateDocumentFields(builtin: BuiltinAuthoringTemplate | undefined, fallbackModule: unknown, source: TemplateSource) {
  return { module: builtin ? builtin.module : fallbackModule == null ? null : String(fallbackModule),
    ...(source ? { provenance: { source: 'template', governedWrite: 'unverified', templateSource: source } } : {}) };
}

export function builtinTemplateSectionMetadata(builtin: BuiltinAuthoringTemplate | undefined, source: TemplateSource, code: string) {
  return builtin ? { templateSource: source, templateGuidance: builtin.sections.find(row => row.code === code)?.guidance } : {};
}

export async function templateWorkingBinding(builtin: BuiltinAuthoringTemplate | undefined, existing: () => Promise<Binding>): Promise<Binding> {
  return builtin ? { documentId: null,
    reason: `${builtin.filingContext ? 'Regulatory' : 'IND'} template working copy; review and deliberately place it through the governed filing workflow.` } : existing();
}
