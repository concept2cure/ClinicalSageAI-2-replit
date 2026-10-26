/** Resolve the existing universal template sources on the caller's executor. */
import { getBuiltinAuthoringTemplate, type BuiltinAuthoringTemplate } from './builtin-authoring-templates';
import { builtinTemplateSource, builtinTemplateSectionMetadata, resolveTemplateSections, type TemplateSectionSeed } from './authoring-template-sections';
import type { Queryable } from './authoring-evidence';
import { AssemblyError, assemblyHash, type AssemblyDocument, type AssemblyTemplate } from './authoring-assembly-plan';
import { parseRecordedTemplateSource, type RecordedTemplateFilingContext } from '../../../shared/authoring/recorded-template-source';
import { getApplicationType, isDeviceRegistryEntry } from '../../../shared/regulatory/global-document-registry';
import { assertPreparationScope } from '../market-specs/document-preparation';
import { FILING_CATALOG, regionalDeviceApplicationClassOf, resolveFilingCatalogEntry } from '../../../shared/regulatory/filing-catalog';
import { filingDocumentClassForFiling } from '../../../shared/regulatory/filing-document-classes';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';
import { AGENCY_TO_CODE, PROGRAM_TO_DOC_TYPE, documentAgencyCandidates, resolveDocumentClass } from '../c2c/document-class';
import { PROGRAM_TYPE_REGISTRY } from '../c2c/program-registry-context';

interface BoundFilingScope {
  docType: string; agency: string; region: string; registryIds: string[]; exactRegistryId?: string; snapshot: string;
}

const agencyKey = (raw: string): string => raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
function programForDocType(docType: string): string | undefined {
  return Object.keys(PROGRAM_TO_DOC_TYPE).find(key => PROGRAM_TO_DOC_TYPE[key] === docType);
}

/** Registry pathways and the existing fixed program contexts, never titles or format guesses. */
function registryClass(registryId: string) {
  const entry = resolveFilingCatalogEntry(registryId);
  if (!entry) return null;
  const fixed = Object.keys(PROGRAM_TYPE_REGISTRY).find(key => PROGRAM_TYPE_REGISTRY[key].registryId === entry.registryId);
  const pathway = filingDocumentClassForFiling(entry.registryId)?.docType ?? fixed ?? entry.pathwayKey;
  const program = pathway && (PROGRAM_TO_DOC_TYPE[pathway] ? pathway : programForDocType(pathway));
  return program ? resolveDocumentClass(program, entry.agency) : null;
}

function scopeRegion(value: string, docType: string): string | undefined {
  if (value.trim().toUpperCase() === 'GLOBAL' || AGENCY_TO_CODE[agencyKey(value)] === 'ich') return 'GLOBAL';
  const direct = canonicalRegionOf(value) ?? canonicalRegionOf(agencyKey(value));
  if (direct) return direct;
  const regional = regionalDeviceApplicationClassOf(docType);
  const klass = resolveDocumentClass(programForDocType(docType), value);
  if (regional && klass?.agency === regional.packAgency) return getApplicationType(regional.registryId)?.region;
  const authority = Object.keys(AGENCY_TO_CODE).find(key => AGENCY_TO_CODE[key] === klass?.agency && canonicalRegionOf(key));
  return canonicalRegionOf(klass?.agency) ?? canonicalRegionOf(authority);
}

const filingUnverified = () => new AssemblyError(503, 'ASSEMBLY_FILING_UNVERIFIED',
  'The document’s recorded filing identity could not be verified. Check its filing or use a matching unbound working document before building. Nothing was changed.');
const filingMismatch = () => new AssemblyError(409, 'ASSEMBLY_FILING_SCOPE_MISMATCH',
  'The selected template conflicts with this document’s bound filing. Use a matching template or an unbound working document. Nothing was changed.');

function boundRegistrySelection(row: Record<string, unknown>, docType: string, agency: string): string | undefined {
  if (row.filing_scope === 'market' || row.program_metadata == null) return undefined;
  const metadata = row.program_metadata;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) throw filingUnverified();
  const chosen = (metadata as Record<string, unknown>).submissionTypeId;
  if (chosen == null) return undefined;
  if (typeof chosen !== 'string' || !chosen.trim()) throw filingUnverified();
  const entry = resolveFilingCatalogEntry(chosen);
  const klass = entry && registryClass(entry.registryId);
  if (!entry || klass?.docType !== docType || !documentAgencyCandidates(docType, klass.agency).includes(agency)) throw filingUnverified();
  return entry.registryId;
}

function boundClass(row: Record<string, unknown>) {
  const docType = typeof row.doc_type === 'string' ? row.doc_type.trim().toLowerCase() : '';
  const agency = typeof row.agency === 'string' ? row.agency.trim().toLowerCase() : '';
  if (!programForDocType(docType) || !Object.values(AGENCY_TO_CODE).includes(agency)
      || !documentAgencyCandidates(docType, agency).length) throw filingUnverified();
  return { docType, agency };
}

function boundRegion(row: Record<string, unknown>, docType: string, agency: string): string {
  const home = row.filing_scope !== 'market' ? resolveDocumentClass(
    typeof row.program_type === 'string' ? row.program_type : null, typeof row.primary_agency === 'string' ? row.primary_agency : null) : null;
  const homeRegion = home?.docType === docType && documentAgencyCandidates(docType, home.agency).includes(agency)
    ? scopeRegion(String(row.primary_agency), docType) : undefined;
  const region = homeRegion ?? scopeRegion(agency, docType);
  if (!region) throw filingUnverified();
  return region;
}

function boundScope(row: Record<string, unknown>): BoundFilingScope {
  const { docType, agency } = boundClass(row);
  const exactRegistryId = boundRegistrySelection(row, docType, agency);
  const registryIds = exactRegistryId ? [exactRegistryId] : FILING_CATALOG.filter(entry => {
    const klass = registryClass(entry.registryId);
    return klass?.docType === docType && documentAgencyCandidates(docType, klass.agency).includes(agency);
  }).map(entry => entry.registryId);
  const region = boundRegion(row, docType, agency);
  return { docType, agency, region, registryIds, ...(exactRegistryId ? { exactRegistryId } : {}),
    snapshot: assemblyHash({ id: row.id, orgId: row.org_id, projectId: row.project_id, docType, agency,
      filingScope: row.filing_scope ?? 'home', programType: row.program_type ?? null,
      primaryAgency: row.primary_agency ?? null, programMetadata: row.program_metadata ?? null, registryIds }) };
}

async function boundFilingScope(q: Queryable, tenantId: number, doc: AssemblyDocument, lock: boolean): Promise<BoundFilingScope | null> {
  if (doc.c2c_document_id == null || doc.c2c_document_id === '') return null;
  if (typeof doc.c2c_document_id !== 'string') throw filingUnverified();
  let row: Record<string, unknown> | undefined;
  try {
    const sql = lock
      ? `SELECT d.*, COALESCE(to_jsonb(d)->>'filing_scope','home') AS filing_scope,
         p.program_type, p.primary_agency, to_jsonb(p)->'metadata' AS program_metadata
         FROM c2c_documents d JOIN regulatory_programs p ON p.id=d.project_id AND p.organization_id=d.org_id AND p.deleted_at IS NULL
         WHERE d.id=$1 AND d.org_id=$2 AND d.project_id=$3 FOR SHARE OF d,p`
      : `SELECT d.*, COALESCE(to_jsonb(d)->>'filing_scope','home') AS filing_scope,
         p.program_type, p.primary_agency, to_jsonb(p)->'metadata' AS program_metadata
         FROM c2c_documents d JOIN regulatory_programs p ON p.id=d.project_id AND p.organization_id=d.org_id AND p.deleted_at IS NULL
         WHERE d.id=$1 AND d.org_id=$2 AND d.project_id=$3`;
    const result = await q.query(sql, [doc.c2c_document_id, tenantId, doc.client_program_id]);
    row = result.rows.length === 1 ? result.rows[0] : undefined;
  } catch { throw filingUnverified(); }
  if (!row) throw new AssemblyError(404, 'ASSEMBLY_FILING_NOT_FOUND', 'The bound filing was not found in this project. Nothing was changed.');
  return boundScope(row);
}

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

function componentFitsRegistry(registryId: string, selected: BuiltinAuthoringTemplate): boolean {
  if (!selected.entryId.startsWith('component:')) return true;
  const entry = getApplicationType(registryId);
  if (!entry) return false;
  try {
    assertPreparationScope({ entry, templateId: selected.entryId.slice('component:'.length) }, undefined);
    return true;
  } catch { return false; }
}

function recordedApplicability(doc: AssemblyDocument, selected: BuiltinAuthoringTemplate): void {
  const provenance = doc.provenance && typeof doc.provenance === 'object' ? doc.provenance as Record<string, unknown> : {};
  if (provenance.templateSource == null) return;
  let recorded;
  try { recorded = parseRecordedTemplateSource(provenance.templateSource, doc.template_id); }
  catch { throw new AssemblyError(503, 'ASSEMBLY_TEMPLATE_SCOPE_UNVERIFIED', 'The document’s recorded template scope could not be verified. Nothing was changed.'); }
  if (!recorded) return;
  if (conflictsWithRecordedScope(recorded.filingContext, selected.filingContext)
      || (recorded.filingContext?.registryId && !componentFitsRegistry(recorded.filingContext.registryId, selected))) throw new AssemblyError(409, 'ASSEMBLY_TEMPLATE_SCOPE_MISMATCH',
    'The selected template conflicts with this document’s recorded region or application. Use a matching document. Nothing was changed.');
}

function declaredAgencyFits(scope: BoundFilingScope, raw: unknown): void {
  if (raw == null || raw === '') return;
  if (typeof raw !== 'string') throw new AssemblyError(503, 'ASSEMBLY_TEMPLATE_SCOPE_UNVERIFIED', 'The template’s receiving authority could not be verified. Nothing was changed.');
  const code = resolveDocumentClass(programForDocType(scope.docType), raw)?.agency ?? AGENCY_TO_CODE[agencyKey(raw)];
  if (!code) throw new AssemblyError(503, 'ASSEMBLY_TEMPLATE_SCOPE_UNVERIFIED', 'The template’s receiving authority could not be verified. Nothing was changed.');
  if (code !== 'ich' && (scopeRegion(raw, scope.docType) !== scope.region
      || !documentAgencyCandidates(scope.docType, code).includes(scope.agency))) throw filingMismatch();
}

const commonModule = (selected: BuiltinAuthoringTemplate): boolean => Boolean(selected.module && selected.module !== 'M1');

function legacyIndApplicability(scope: BoundFilingScope, selected: BuiltinAuthoringTemplate, device: boolean): void {
  if (!device && commonModule(selected)) return;
  const ind = registryClass('US_IND');
  if (device || !ind || scope.region !== getApplicationType('US_IND')?.region || scope.docType !== ind.docType
      || !documentAgencyCandidates(ind.docType, ind.agency).includes(scope.agency)
      || (scope.exactRegistryId && scope.exactRegistryId !== 'US_IND')) throw filingMismatch();
}

function registryFilingApplicability(scope: BoundFilingScope, registryId: string): void {
  const klass = registryClass(registryId);
  if (scope.exactRegistryId && registryId !== scope.exactRegistryId) throw filingMismatch();
  if (klass ? klass.docType !== scope.docType || !documentAgencyCandidates(klass.docType, klass.agency).includes(scope.agency)
    : !scope.registryIds.includes(registryId)) throw filingMismatch();
}

function builtinFilingApplicability(scope: BoundFilingScope | null, selected: BuiltinAuthoringTemplate): void {
  if (!scope) return;
  const device = scope.registryIds.some(id => { const entry = getApplicationType(id); return entry && isDeviceRegistryEntry(entry); });
  const context = selected.filingContext;
  if (!context) return legacyIndApplicability(scope, selected, device);
  if (context.region !== 'GLOBAL' && context.region !== scope.region) throw filingMismatch();
  // Harmonised CTD documents/components retain their shared placement in the
  // matching medicinal module. A device class does not inherit that allowance.
  if (context.region === 'GLOBAL' && commonModule(selected) && !device) return;
  if (context.registryId) registryFilingApplicability(scope, context.registryId);
  else if (scope.registryIds.length && !scope.registryIds.some(id => componentFitsRegistry(id, selected))) throw filingMismatch();
  if (context.region !== 'GLOBAL') declaredAgencyFits(scope, context.agency);
}

function storedFilingApplicability(scope: BoundFilingScope | null, row: Record<string, unknown>): void {
  if (!scope) return;
  const rawRegions = row.regions;
  if (rawRegions != null && !Array.isArray(rawRegions)) throw new AssemblyError(503, 'ASSEMBLY_TEMPLATE_SCOPE_UNVERIFIED',
    'The template’s recorded regions could not be verified. Nothing was changed.');
  const regions = (rawRegions ?? []) as unknown[];
  const resolved = regions.map(value => typeof value === 'string' ? scopeRegion(value, scope.docType) : undefined);
  if (resolved.some(region => !region)) throw new AssemblyError(503, 'ASSEMBLY_TEMPLATE_SCOPE_UNVERIFIED',
    'The template’s recorded regions could not be verified. Nothing was changed.');
  if (resolved.length && !resolved.includes('GLOBAL') && !resolved.includes(scope.region)) throw filingMismatch();
  declaredAgencyFits(scope, row.agency);
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
    draftingModeFor: code => builtin.sections.find(row => row.code === code)?.guidance.drafting_mode,
    guidanceFor: code => builtin.sections.find(row => row.code === code)?.guidance.guidance_text };
}

export async function resolveAssemblyTemplate(q: Queryable, tenantId: number, templateId: string, doc: AssemblyDocument, lock: boolean): Promise<AssemblyTemplate> {
  const filing = await boundFilingScope(q, tenantId, doc, lock);
  const target = filing ? { filingSnapshot: filing.snapshot } : {};
  const builtin = await getBuiltinAuthoringTemplate(templateId);
  if (builtin && (doc.module ?? null) !== builtin.module) {
    throw new AssemblyError(409, 'TEMPLATE_MODULE_MISMATCH', 'This template belongs to a different document module or whole-document scope. Open a document with the matching scope. Nothing was changed.');
  }
  if (builtin) recordedApplicability(doc, builtin);
  if (builtin) builtinFilingApplicability(filing, builtin);
  const stored = builtin ? null : await persistedHeader(q, tenantId, templateId, lock);
  if (stored) { persistedModule(doc, stored.row); storedFilingApplicability(filing, stored.row); }
  const sections = await resolveTemplateSections(q, tenantId, templateId, { builtin, transaction: true, lock });
  if (!Array.isArray(sections)) throw new AssemblyError(sections.status, sections.code ?? 'ASSEMBLY_TEMPLATE_NOT_FOUND', sections.error);
  if (builtin) return { ...resolvedBuiltin(builtin, sections), ...target };
  const { kind, row } = stored!;
  const regions = Array.isArray(row.regions) ? row.regions : [row.agency];
  const region = regions.length === 1 ? draftRegion(regions[0]) : null;
  const eligibility = ownEligibility(row, region);
  const identity = { id: templateId, kind, header: row, sections };
  return { id: templateId, name: String(row.template_name ?? 'Selected template'), snapshot: assemblyHash(identity), sections,
    ...target,
    draftRegion: region, aiDraftable: eligibility.eligible, aiDraftableReason: eligibility.reason,
    limitations: ['Stored template structure and text are copied as recorded. Template selection does not establish applicability, verified evidence, approval or filing readiness.'],
    metadataFor: () => ({ template_id: templateId, seeded: true, template_store: kind }), guidanceFor: () => undefined };
}
