/**
 * Regulatory Filing & Document Taxonomy -- the Filings catalog's view of the
 * ONE filing catalog (shared/regulatory/filing-catalog.ts).
 *
 * This file used to carry its own hand-written list of 113 filing types,
 * drifting from both the canonical registry and the wizard's mirror — three
 * different answers to "how many filing types do you support", and stale
 * regulatory metadata (an IB still in M5, an ANDA still scoped M1–M3) after
 * the canonical copies were corrected. BP-W1-2 retires the list:
 * FILINGS_TAXONOMY is DERIVED here, so both surfaces render the same entries,
 * the same metadata, and the same (computed) count.
 *
 * The workflow-code tables and lifecycle-loop archetypes below are the
 * catalog page's own domain content and remain authored here.
 */
import {
  filingCatalogTree,
  filingWfCode,
} from '@shared/regulatory/filing-catalog';

/* ---- Interfaces ---- */

export interface FilingItem {
  n: string;
  a: string;
  f: string;
  c: string;
  wf: string;
  d: string;
}

export interface FilingCategory {
  cat: string;
  desc: string;
  items: FilingItem[];
}

export interface FilingSegment {
  seg: string;
  label: string;
  sub: string;
  icon: string;
  cats: FilingCategory[];
}

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

/* ---- Taxonomy -- derived, not authored ---- */

/** Legacy short segment keys the catalog page uses as tab state. */
const SEG_KEY: Record<string, { seg: string; icon: string }> = {
  pharma_biotech: { seg: 'pharma', icon: 'beaker' },
  medical_devices: { seg: 'device', icon: 'stethoscope' },
  diagnostics_ivd: { seg: 'ivd', icon: 'microscope' },
  cross_cutting: { seg: 'cross', icon: 'layers' },
};

export const FILINGS_TAXONOMY: FilingSegment[] = filingCatalogTree().map((seg) => ({
  seg: SEG_KEY[seg.id]?.seg ?? seg.id,
  label: seg.title,
  sub: seg.subtitle,
  icon: SEG_KEY[seg.id]?.icon ?? seg.iconHint,
  cats: seg.categories.map((cat) => ({
    cat: cat.title,
    desc: cat.description,
    items: cat.entries.map((e) => ({
      n: e.displayName,
      a: e.agency,
      f: e.submissionFormat,
      c: e.ctdModule,
      wf: filingWfCode(e),
      d: e.description,
    })),
  })),
}));


/* ---- Workflow surface mapping ---- */

export const FILING_WF_SURFACE: Record<string, string> = {
  IND: 'document-authoring', NDA: 'document-authoring', BLA: 'document-authoring', MAA: 'document-authoring',
  CSR: 'document-authoring', '510k': 'document-authoring', PMA: 'document-authoring',
  denovo: 'document-authoring', CER: 'document-authoring', ANDA: 'document-authoring',
  '505b2': 'document-authoring', biosimilar: 'document-authoring', DMF: 'document-authoring',
  IDE: 'document-authoring', HDE: 'document-authoring', IVDR: 'document-authoring',
  MDR: 'document-authoring', STED: 'document-authoring',
  designation: 'document-authoring', postmarket: 'document-authoring', presub: 'document-authoring',
  samd: 'document-authoring', qms: 'document-authoring', pv: 'document-authoring',
  clindoc: 'document-authoring', eua: 'document-authoring', cdx: 'document-authoring',
  pmdevice: 'document-authoring', ivdpresub: 'document-authoring', ldt: 'document-authoring',
  intldevice: 'document-authoring', advice: 'document-authoring', ivdpostmarket: 'document-authoring',
};


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
