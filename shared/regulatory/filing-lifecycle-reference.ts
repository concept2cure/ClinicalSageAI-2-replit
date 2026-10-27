/** Existing authored filing-family guides, relocated from the catalogue owner.
 * These static examples are reference prose, never project clocks or verdicts. */
import { AGENCY_LABEL, filingWfCode, resolveFilingCatalogEntry, type FilingCatalogEntry } from './filing-catalog';

export interface FilingLoopReturn {
  label: string;
  desc: string;
}

export interface FilingLoop {
  label: string;
  clock: string;
  stages: string[];
  ret: FilingLoopReturn;
}

export const FILING_WF_LABEL: Record<string, string> = {
  IND: 'IND', NDA: 'NDA', BLA: 'BLA', MAA: 'MAA', CSR: 'CSR',
  '510k': '510(k)', PMA: 'PMA', denovo: 'De Novo', CER: 'CER',
  ANDA: 'ANDA', '505b2': '505(b)(2)', biosimilar: 'Biosimilar 351(k)', DMF: 'DMF',
  IDE: 'IDE', HDE: 'HDE', IVDR: 'IVDR', MDR: 'EU MDR', STED: 'STED',
  designation: 'Designation', postmarket: 'Post-Market', presub: 'Pre-Sub',
  samd: 'SaMD', qms: 'QMS', pv: 'PV', clindoc: 'Clinical Doc', eua: 'EUA',
  cdx: 'CDx', pmdevice: 'PM Device', ivdpresub: 'IVD Pre-Sub', ldt: 'LDT',
  intldevice: 'Intl Device', advice: 'Sci. Advice', ivdpostmarket: 'IVD Post-Mkt',
};

/* ---- Filing lifecycle loop ---- */

export const FILING_LOOP_ARCHETYPE: Record<string, string> = {
  NDA: 'marketing', BLA: 'marketing', MAA: 'marketing', ANDA: 'marketing',
  '505b2': 'marketing', biosimilar: 'marketing',
  '510k': 'device', denovo: 'device', PMA: 'device', HDE: 'device',
  IND: 'clinical', IDE: 'clinical',
  presub: 'presub', advice: 'presub', ivdpresub: 'presub',
  designation: 'designation',
  CER: 'euconformity', IVDR: 'euconformity', MDR: 'euconformity', STED: 'euconformity',
  postmarket: 'postmarket', pmdevice: 'postmarket', ivdpostmarket: 'postmarket', pv: 'postmarket',
  DMF: 'cmc', qms: 'cmc',
  CSR: 'clindoc', clindoc: 'clindoc', eua: 'presub', cdx: 'device', ldt: 'presub', intldevice: 'euconformity',
};

export const FILING_LOOP: Record<string, FilingLoop> = {
  marketing: {
    label: 'Marketing authorization', clock: 'FDA: PDUFA 10 mo standard / 6 mo priority -- EMA: CHMP 210 active days',
    stages: ['Pre-sub / EOP2', 'Assemble dossier', 'Submit to gateway', 'Filing / validation', 'Agency review', 'Response to deficiencies', 'Approval'],
    ret: { label: 'Complete Response Letter (CRL) -- Day-120 List of Questions', desc: 'FDA issues a CRL (or EMA a Day-120/180 LoQ) describing every deficiency. Decompose it, respond section-by-section, and resubmit -- the loop runs back through review.' } },
  device: {
    label: 'US device market authorization', clock: '510(k): 90 FDA days -- De Novo: 150 days -- PMA: 180 days + panel',
    stages: ['Pre-Sub (Q-Sub)', 'Compile submission', 'Submit (eSTAR/eCopy)', 'Acceptance / filing review', 'Substantive review', 'Response to deficiencies', 'Clearance / approval'],
    ret: { label: 'Additional Information (AI) request -- Major Deficiency Letter', desc: 'FDA places the submission on hold with an AI request (510(k)/De Novo) or a Major Deficiency Letter (PMA). The clock stops until you respond; 510(k) AI responses are due within 180 days.' } },
  clinical: {
    label: 'Clinical-trial authorization', clock: 'IND: 30-day default review -- IDE: 30-day FDA decision',
    stages: ['Pre-IND meeting', 'Assemble IND/IDE', 'Submit', '30-day safety review', 'Trial may proceed', 'Amendments & safety reports', 'Ongoing'],
    ret: { label: 'Clinical Hold', desc: 'FDA may place a full or partial clinical hold within 30 days. Resolve every hold issue in a complete response; the trial resumes only on FDA\'s written removal of the hold.' } },
  presub: {
    label: 'Pre-submission / agency feedback', clock: 'FDA Q-Sub: ~70-day meeting -- EMA Scientific Advice: ~40–70 days',
    stages: ['Frame the questions', 'Draft briefing package', 'Submit request', 'Agency preparation', 'Meeting / written response', 'Incorporate feedback'],
    ret: { label: 'No denial loop', desc: 'Feedback interactions do not get denied -- the output is agency advice or written responses that shape your development plan and de-risk the eventual marketing application.' } },
  designation: {
    label: 'Special designation', clock: 'FDA BTD/Fast Track: 60 days -- Orphan: ~90 days -- EMA PRIME/Orphan: per COMP/CHMP cycle',
    stages: ['Assess eligibility', 'Assemble request', 'Submit', 'Agency review', 'Granted / denied'],
    ret: { label: 'Denial (request may be resubmitted)', desc: 'A denied designation can be re-requested with additional data as the program matures -- it does not block the underlying application.' } },
  euconformity: {
    label: 'EU / international device conformity', clock: 'Notified Body review of the technical file; timeline varies by NB and device class',
    stages: ['Build technical file', 'Clinical/performance evaluation', 'NB submission', 'NB review', 'Deficiency (NCR) response', 'CE certificate'],
    ret: { label: 'Notified Body Non-Conformity (NCR) / Deficiency', desc: 'The Notified Body raises non-conformities against the GSPRs. Close every NCR with evidence before the CE certificate is issued.' } },
  postmarket: {
    label: 'Post-approval lifecycle', clock: 'Prior-Approval Supplement: 4 mo -- CBE-30: 30 days -- Variation Type II: 60–90 days',
    stages: ['Assess change / signal', 'Classify the filing', 'Prepare', 'Submit', 'Agency review / notification', 'Implemented'],
    ret: { label: 'Deficiency on the supplement / variation', desc: 'The agency can raise deficiencies on a supplement or variation just like an original application; respond and the change is approved for implementation.' } },
  cmc: {
    label: 'CMC / quality', clock: 'Reviewed within the referencing IND/NDA/BLA or as a standalone DMF assessment',
    stages: ['Author quality data', 'Assemble Module 3 / DMF', 'Submit / reference', 'Assessment', 'Deficiency response', 'Accepted'],
    ret: { label: 'CMC Deficiency / Complete Response (quality)', desc: 'Quality deficiencies (specifications, stability, comparability) are raised against Module 3; resolve them to clear the quality review.' } },
  clindoc: {
    label: 'Clinical document', clock: 'Authored to ICH standards; reviewed as part of the parent submission',
    stages: ['Draft to ICH template', 'Bind evidence', 'Internal review', 'Finalize', 'File into dossier'],
    ret: { label: 'Reviewer questions (in the parent application)', desc: 'Clinical documents are assessed inside the marketing application; questions arrive as part of the CRL / LoQ for the parent filing.' } },
};

export interface RecordedFilingContext { programType: unknown; primaryAgency: unknown }
export interface FilingLifecycleReference {
  basis: 'authored_reference';
  state: 'matched';
  scope: 'filing_family';
  filing: Pick<FilingCatalogEntry, 'id' | 'registryId' | 'displayName' | 'agency' | 'region'>;
  archetype: string;
  loop: FilingLoop;
}

interface LifecycleAdmission { archetype: string; programTypes: readonly string[] }

/** Exact selections whose existing prose covers this filing family. This is
 * reference admission only: it grants no market/build/clinical eligibility.
 * An empty type list preserves intake reference without blessing an unmodeled
 * project type (or one of the historical generic intake fallbacks). */
const ADMISSIONS: ReadonlyMap<string, LifecycleAdmission> = new Map([
  ['US_IND', { archetype: 'clinical', programTypes: ['ind'] }],
  ['US_IDE', { archetype: 'clinical', programTypes: ['ide'] }],
  ['US_NDA', { archetype: 'marketing', programTypes: ['nda'] }],
  ['US_BLA', { archetype: 'marketing', programTypes: ['bla'] }],
  ['US_ANDA', { archetype: 'marketing', programTypes: ['anda'] }],
  ['US_505B2', { archetype: 'marketing', programTypes: ['nda'] }],
  ['US_351K', { archetype: 'marketing', programTypes: ['bla'] }],
  ['EU_MAA', { archetype: 'marketing', programTypes: ['maa'] }],
  ['EU_BIOSIMILAR_MAA', { archetype: 'marketing', programTypes: ['maa'] }],
  ['US_510K', { archetype: 'device', programTypes: ['510k'] }],
  ['US_PMA', { archetype: 'device', programTypes: ['pma'] }],
  ['US_DE_NOVO', { archetype: 'device', programTypes: ['de_novo'] }],
  ['US_510K_IVD', { archetype: 'device', programTypes: ['510k'] }],
  ['US_PMA_IVD', { archetype: 'device', programTypes: ['pma'] }],
  ['US_DE_NOVO_IVD', { archetype: 'device', programTypes: ['de_novo'] }],
  ['US_CDX_PMA', { archetype: 'device', programTypes: ['pma'] }],
  ['US_CDX_510K', { archetype: 'device', programTypes: ['510k'] }],
  ['US_QSUB', { archetype: 'presub', programTypes: ['device'] }],
  ['US_IVD_QSUB', { archetype: 'presub', programTypes: ['ivd'] }],
  ['US_SAMD_PRESUB', { archetype: 'presub', programTypes: ['device'] }],
  ['EU_SCIENTIFIC_ADVICE', { archetype: 'presub', programTypes: [] }],
  ['US_BTD', { archetype: 'designation', programTypes: ['designation'] }],
  ['US_FAST_TRACK', { archetype: 'designation', programTypes: ['fast_track'] }],
  ['US_ORPHAN', { archetype: 'designation', programTypes: ['orphan'] }],
  ['EU_PRIME', { archetype: 'designation', programTypes: [] }],
  ['EU_ORPHAN', { archetype: 'designation', programTypes: [] }],
  ['EU_MDR_CLASS_IIA', { archetype: 'euconformity', programTypes: ['mdr'] }],
  ['EU_MDR_CLASS_IIB', { archetype: 'euconformity', programTypes: ['mdr'] }],
  ['EU_MDR_CLASS_III', { archetype: 'euconformity', programTypes: ['mdr'] }],
  ['EU_IVDR_CLASS_B', { archetype: 'euconformity', programTypes: ['ivdr'] }],
  ['EU_IVDR_CLASS_CD', { archetype: 'euconformity', programTypes: ['ivdr'] }],
  ['US_NDA_SUPP', { archetype: 'postmarket', programTypes: ['pas'] }],
  ['US_BLA_SUPP', { archetype: 'postmarket', programTypes: ['pas'] }],
  ['US_CBE', { archetype: 'postmarket', programTypes: ['cbe'] }],
  ['EU_VARIATION_II', { archetype: 'postmarket', programTypes: [] }],
  ['US_DMF', { archetype: 'cmc', programTypes: ['dmf'] }],
  ['EU_ASMF', { archetype: 'cmc', programTypes: ['dmf'] }],
  ['ICH_CSR', { archetype: 'clindoc', programTypes: ['csr'] }],
  ['ICH_PROTOCOL', { archetype: 'clindoc', programTypes: ['protocol'] }],
  ['ICH_IB', { archetype: 'clindoc', programTypes: ['ib'] }],
  ['ICH_SAP', { archetype: 'clindoc', programTypes: ['sap'] }],
  ['ICH_ICF', { archetype: 'clindoc', programTypes: ['icf'] }],
]);

const words = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
/** Only established storage keys and display labels are spelling aliases. */
function knownAgency(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const key = words(value);
  return Object.entries(AGENCY_LABEL).find(([code, label]) => words(code) === key || words(label) === key)?.[0] ?? null;
}

function contextMatches(entry: FilingCatalogEntry, admission: LifecycleAdmission, recorded: RecordedFilingContext): boolean {
  if (recorded === null || typeof recorded !== 'object' || typeof recorded.programType !== 'string') return false;
  const programType = recorded.programType.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const agency = knownAgency(recorded.primaryAgency);
  return admission.programTypes.includes(programType) && agency !== null && agency === knownAgency(entry.agency);
}

/** A known exact catalogue id selects authored family prose. Project callers
 * must additionally match their recorded type AND agency; missing or disputed
 * identity never falls through to a US application or another guide. */
export function filingLifecycleReferenceFor(id: string | null | undefined, recorded?: RecordedFilingContext): FilingLifecycleReference | null {
  if (typeof id !== 'string' || !id.trim()) return null;
  const entry = resolveFilingCatalogEntry(id.trim());
  if (!entry || id.trim().toLowerCase() !== entry.id) return null;
  const admission = ADMISSIONS.get(entry.registryId);
  if (!admission || (recorded !== undefined && !contextMatches(entry, admission, recorded))) return null;
  const loop = FILING_LOOP[admission.archetype];
  if (!loop) return null;
  const { registryId, displayName, agency, region } = entry;
  return { basis: 'authored_reference', state: 'matched', scope: 'filing_family',
    filing: { id: entry.id, registryId, displayName, agency, region }, archetype: admission.archetype, loop };
}

/** Exact catalogue facts for metadata and workflow-label search. Resolving
 * these facts never admits a lifecycle guide or a project/build capability. */
export function filingReferenceFactsFor(id: string | null | undefined) {
  if (typeof id !== 'string' || !id.trim()) return null;
  const entry = resolveFilingCatalogEntry(id.trim());
  if (!entry || id.trim().toLowerCase() !== entry.id) return null;
  const workflow = filingWfCode(entry);
  return { entry, workflowLabel: FILING_WF_LABEL[workflow] ?? workflow };
}
