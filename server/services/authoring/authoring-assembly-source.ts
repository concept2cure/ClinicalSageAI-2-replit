/** Resolve the existing universal template sources on the caller's executor. */
import { getBuiltinAuthoringTemplate, type BuiltinAuthoringTemplate } from './builtin-authoring-templates';
import { builtinTemplateSource, builtinTemplateSectionMetadata, resolveTemplateSections, type TemplateSectionSeed } from './authoring-template-sections';
import type { Queryable } from './authoring-evidence';
import { AssemblyError, assemblyHash, type AssemblyDocument, type AssemblyTemplate } from './authoring-assembly-plan';
import { parseRecordedTemplateSource, type RecordedTemplateFilingContext } from '../../../shared/authoring/recorded-template-source';

function draftRegion(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[ _-]/g, '') : '';
  if (['US', 'FDA'].includes(value)) return 'FDA';
  if (['CA', 'HC', 'CANADA', 'HEALTHCANADA'].includes(value)) return 'Health Canada';
  if (['EU', 'EMA', 'EMEA'].includes(value)) return 'EMA';
  if (['JP', 'JAPAN', 'PMDA'].includes(value)) return 'PMDA';
  return null;
}

async function persistedHeader(q: Queryable, tenantId: number, templateId: string, lock: boolean): Promise<{ kind: string; row: Record<string, unknown> }> {
  const available = (await q.query("SELECT to_regclass('intelligence.template_sections') IS NOT NULL AND to_regclass('intelligence.document_templates') IS NOT NULL AS available")).rows[0]?.available === true;
  if (available) {
    const sql = lock
      ? `SELECT t.* FROM intelligence.document_templates t
         WHERE t.id=$1 AND t.status='active' AND EXISTS(SELECT 1 FROM intelligence.template_sections ts WHERE ts.template_id=t.id)
         FOR SHARE OF t`
      : `SELECT t.* FROM intelligence.document_templates t
         WHERE t.id=$1 AND t.status='active' AND EXISTS(SELECT 1 FROM intelligence.template_sections ts WHERE ts.template_id=t.id)`;
    const global = await q.query(sql, [templateId]);
    if (global.rows[0]) return { kind: 'global', row: global.rows[0] };
  }
  const sql = lock
    ? 'SELECT * FROM authoring_templates WHERE id=$1 AND tenant_id=$2 AND is_active=true FOR SHARE'
    : 'SELECT * FROM authoring_templates WHERE id=$1 AND tenant_id=$2 AND is_active=true';
  const own = await q.query(sql, [templateId, tenantId]);
  if (!own.rows[0]) throw new AssemblyError(404, 'ASSEMBLY_TEMPLATE_NOT_FOUND', 'This template is no longer available. Refresh the template list. Nothing was changed.');
  return { kind: 'organization', row: own.rows[0] };
}

function ownEligibility(row: Record<string, unknown>, region: string | null) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  const eligible = metadata.aiDraftable === true && region !== null;
  return { eligible, reason: eligible ? 'This template explicitly permits AnA drafting for its recorded region.' :
    'AnA drafting eligibility and one supported drafting region are not recorded for this template. Build its structure and review the text manually.' };
}

function conflictsWithRecordedScope(before: RecordedTemplateFilingContext | undefined, after: RecordedTemplateFilingContext | undefined): boolean {
  const previousRegion = before?.region ?? 'US';
  const nextRegion = after?.region ?? 'US';
  const regionConflict = previousRegion !== 'GLOBAL' && nextRegion !== 'GLOBAL' && previousRegion !== nextRegion;
  const filingConflict = Boolean(before?.registryId && after?.registryId && before.registryId !== after.registryId);
  return regionConflict || filingConflict;
}

function recordedApplicability(doc: AssemblyDocument, selected: BuiltinAuthoringTemplate): void {
  const provenance = doc.provenance && typeof doc.provenance === 'object' ? doc.provenance as Record<string, unknown> : {};
  if (provenance.templateSource == null) return;
  let recorded;
  try { recorded = parseRecordedTemplateSource(provenance.templateSource, doc.template_id); }
  catch { throw new AssemblyError(503, 'ASSEMBLY_TEMPLATE_SCOPE_UNVERIFIED', 'The document’s recorded template scope could not be verified. Nothing was changed.'); }
  if (!recorded) return;
  if (conflictsWithRecordedScope(recorded.filingContext, selected.filingContext)) throw new AssemblyError(409, 'ASSEMBLY_TEMPLATE_SCOPE_MISMATCH',
    'The selected template conflicts with this document’s recorded region or application. Use a matching document. Nothing was changed.');
}

function persistedModule(doc: AssemblyDocument, row: Record<string, unknown>): void {
  const match = typeof row.module_path === 'string' ? /^([1-5])(?:\.|$)/.exec(row.module_path) : null;
  if (match && doc.module !== `M${match[1]}`) throw new AssemblyError(409, 'TEMPLATE_MODULE_MISMATCH',
    'This reference template belongs to a different recorded CTD module. Nothing was changed.');
}

function resolvedBuiltin(builtin: BuiltinAuthoringTemplate, sections: TemplateSectionSeed[]): AssemblyTemplate {
  const source = builtinTemplateSource(builtin)!;
  const region = builtin.filingContext ? draftRegion(builtin.filingContext.region) : 'FDA';
  const eligible = builtin.aiDraftable && region !== null;
  return { id: builtin.id, name: builtin.name, snapshot: source.sha256, sections,
    draftRegion: region, aiDraftable: eligible,
    aiDraftableReason: eligible ? 'The recorded narrative template permits AnA drafting; source and human review are still required.' :
      'This preparation template or unresolved regional scope does not permit automatic AnA drafting. Retain its originals and complete it manually.',
    limitations: [...builtin.limitations],
    metadataFor: code => ({ template_id: builtin.id, seeded: true, ...builtinTemplateSectionMetadata(builtin, source, code) }),
    guidanceFor: code => builtin.sections.find(row => row.code === code)?.guidance.guidance_text };
}

export async function resolveAssemblyTemplate(q: Queryable, tenantId: number, templateId: string, doc: AssemblyDocument, lock: boolean): Promise<AssemblyTemplate> {
  const builtin = await getBuiltinAuthoringTemplate(templateId);
  if (builtin && (doc.module ?? null) !== builtin.module) {
    throw new AssemblyError(409, 'TEMPLATE_MODULE_MISMATCH', 'This template belongs to a different document module or whole-document scope. Open a document with the matching scope. Nothing was changed.');
  }
  if (builtin) recordedApplicability(doc, builtin);
  const sections = await resolveTemplateSections(q, tenantId, templateId, { builtin, transaction: true, lock });
  if (!Array.isArray(sections)) throw new AssemblyError(sections.status, sections.code ?? 'ASSEMBLY_TEMPLATE_NOT_FOUND', sections.error);
  if (builtin) return resolvedBuiltin(builtin, sections);
  const { kind, row } = await persistedHeader(q, tenantId, templateId, lock);
  persistedModule(doc, row);
  const regions = Array.isArray(row.regions) ? row.regions : [row.agency];
  const region = regions.length === 1 ? draftRegion(regions[0]) : null;
  const eligibility = ownEligibility(row, region);
  const identity = { id: templateId, kind, header: row, sections };
  return { id: templateId, name: String(row.template_name ?? 'Selected template'), snapshot: assemblyHash(identity), sections,
    draftRegion: region, aiDraftable: eligibility.eligible, aiDraftableReason: eligibility.reason,
    limitations: ['Stored template structure and text are copied as recorded. Template selection does not establish applicability, verified evidence, approval or filing readiness.'],
    metadataFor: () => ({ template_id: templateId, seeded: true, template_store: kind }), guidanceFor: () => undefined };
}
