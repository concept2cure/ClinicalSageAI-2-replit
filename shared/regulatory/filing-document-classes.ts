/**
 * Filing document classes — the filings that are a DOCUMENT, not an application.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * The New project wizard (Projects.tsx `programTypeFor`) knows application
 * types: IND, CTA, NDA, BLA, ANDA, MAA, J-NDA, DMF and the device pathways.
 * Every other filing in the catalog fell through to one of them. A Prior
 * Approval Supplement, a CBE-30, an NDA/BLA annual report, an IND amendment, an
 * IND safety report, an IND annual report, a Type A/B/C meeting package, an
 * orphan or breakthrough designation request and a pediatric study plan were
 * each scaffolded as the 73-node NDA dossier, and a clinical study report as
 * the 108-node IND. The project read as created, the Vault rendered an NDA, and
 * the CSR — which has its own pack, csr:ich — was not offered at all.
 *
 * Every one of those filings already had its own outline in the platform:
 * `getRegistryDocumentTemplate` (server/services/market-specs/
 * document-template-library.ts) serves it to AnA and to the Authoring template
 * picker. Only project creation never asked for it.
 *
 * ── What a class is ───────────────────────────────────────────────────────────
 * One value is the program type, the governed document's doc_type and its rule
 * pack's doc_type, as `dmf` already is. A class is never an application: it
 * creates no submission spine (DRUG_APPLICATION_TYPES), and the market verdict
 * offers it as "Author documents" only (market-support.ts). Supplements and
 * safety reports are claims the product must not make as sequences
 * (docs/design/WORKFLOW_DECISION_2026-10-08.md §5); authoring their documents
 * is not that claim.
 *
 * The outline itself is not kept here. Each class's rule pack is minted from
 * the outline `getRegistryDocumentTemplate` returns for its first registry id
 * (the CSR from the full ICH E3 tree), and a contract test holds the pack to
 * that outline (tests/schema-contract/c2c-filing-class-packs.contract.test.ts),
 * so the scaffold, AnA and the Authoring picker give one answer.
 *
 * Pure data and lookups. Read by the client wizard and the server alike.
 *
 * @module shared/regulatory/filing-document-classes
 */

export interface FilingDocumentClass {
  /** program_type, c2c_documents.doc_type and c2c_rule_packs.doc_type: one value. */
  docType: string;
  /** c2c_rule_packs.agency of the class's pack. */
  packAgency: 'fda' | 'ema' | 'ich';
  /** The class as a person reads it, for the offer sentence and the review step. */
  label: string;
  /** GLOBAL_REGISTRY ids that create this class. The first is the outline's source. */
  registryIds: readonly string[];
  /**
   * The product class a filing fixes, where the filing itself names it. A class
   * covers drugs and biologics alike, so the person states it (P-21) — except
   * where the filing is one application's own: an sBLA is a biologics licence
   * supplement (21 CFR 601.12), so the wizard does not ask and the server does
   * not take a different answer by default.
   */
  productTypeByFiling?: Readonly<Record<string, 'drug' | 'biologic'>>;
}

export const FILING_DOCUMENT_CLASSES: readonly FilingDocumentClass[] = [
  // ── FDA post-approval (21 CFR 314.70, 314.81; 601.12) ──
  // US_BLA_SUPP shares the PAS outline: 21 CFR 601.12(b) is the biologics
  // prior-approval category and the supplement carries the same parts. The
  // pack's uncertainties say the BLA rule text was not re-read for it.
  // US_NDA_SUPP is "NDA/BLA Supplement (Prior Approval)" in the registry, so it
  // fixes no class; US_BLA_SUPP is the biologics licence's own.
  { docType: 'pas', packAgency: 'fda', label: 'Prior Approval Supplement', registryIds: ['US_NDA_SUPP', 'US_BLA_SUPP'], productTypeByFiling: { US_BLA_SUPP: 'biologic' } },
  { docType: 'cbe', packAgency: 'fda', label: 'CBE-30 / CBE-0 supplement', registryIds: ['US_CBE'] },
  { docType: 'annual_report', packAgency: 'fda', label: 'NDA/BLA annual report', registryIds: ['US_NDA_ANNUAL'] },
  { docType: 'rems', packAgency: 'fda', label: 'REMS', registryIds: ['US_REMS'] },
  { docType: 'pader', packAgency: 'fda', label: 'PADER', registryIds: ['US_PADER'] },
  // ── FDA IND lifecycle (21 CFR 312.30–312.33) ──
  { docType: 'ind_amendment', packAgency: 'fda', label: 'IND amendment', registryIds: ['US_IND_AMENDMENT'] },
  { docType: 'ind_safety_report', packAgency: 'fda', label: 'IND safety report', registryIds: ['US_IND_SR'] },
  { docType: 'ind_annual_report', packAgency: 'fda', label: 'IND annual report', registryIds: ['US_IND_ANNUAL'] },
  // ── FDA requests and plans ──
  // The Pre-IND meeting is not here on purpose: it creates the IND it is about
  // (filing-catalog.ts PATHWAY_BY_ID us_pre_ind → 'ind').
  { docType: 'briefing', packAgency: 'fda', label: 'FDA formal meeting package', registryIds: ['US_TYPE_A_MEETING', 'US_TYPE_B_MEETING', 'US_TYPE_C_MEETING'] },
  { docType: 'orphan', packAgency: 'fda', label: 'orphan drug designation request', registryIds: ['US_ORPHAN'] },
  { docType: 'designation', packAgency: 'fda', label: 'expedited program designation request', registryIds: ['US_BTD', 'US_FAST_TRACK', 'US_RMAT'] },
  { docType: 'psp', packAgency: 'fda', label: 'pediatric study plan', registryIds: ['US_PSP'] },
  // ── Harmonised clinical and safety documents (ICH) ──
  { docType: 'csr', packAgency: 'ich', label: 'clinical study report', registryIds: ['ICH_CSR'] },
  { docType: 'protocol', packAgency: 'ich', label: 'clinical trial protocol', registryIds: ['ICH_PROTOCOL'] },
  { docType: 'ib', packAgency: 'ich', label: "investigator's brochure", registryIds: ['ICH_IB'] },
  { docType: 'sap', packAgency: 'ich', label: 'statistical analysis plan', registryIds: ['ICH_SAP'] },
  { docType: 'icf', packAgency: 'ich', label: 'informed consent form', registryIds: ['ICH_ICF'] },
  { docType: 'dsur', packAgency: 'ich', label: 'DSUR', registryIds: ['ICH_DSUR'] },
  // ── EU periodic safety ──
  { docType: 'psur', packAgency: 'ema', label: 'PSUR / PBRER', registryIds: ['EU_PSUR'] },
];

const BY_REGISTRY_ID: ReadonlyMap<string, FilingDocumentClass> = new Map(
  FILING_DOCUMENT_CLASSES.flatMap((c) => c.registryIds.map((id) => [id, c] as const)),
);
const BY_DOC_TYPE: ReadonlyMap<string, FilingDocumentClass> = new Map(
  FILING_DOCUMENT_CLASSES.map((c) => [c.docType, c] as const),
);

/** The class a registry filing creates (any id casing: 'US_CBE', 'us_cbe'), or null for an application or an unclassed filing. */
export function filingDocumentClassForFiling(registryId: string | null | undefined): FilingDocumentClass | null {
  return BY_REGISTRY_ID.get(String(registryId ?? '').trim().toUpperCase()) ?? null;
}

/** The class a program type names, or null when the program type is an application (or unknown). */
export function filingDocumentClassOf(programType: string | null | undefined): FilingDocumentClass | null {
  return BY_DOC_TYPE.get(String(programType ?? '').trim().toLowerCase()) ?? null;
}

/** The product class a registry filing fixes (an sBLA: 'biologic'), or null when the person states it. */
export function productTypeFixedByFiling(registryId: string | null | undefined): 'drug' | 'biologic' | null {
  const id = String(registryId ?? '').trim().toUpperCase();
  return BY_REGISTRY_ID.get(id)?.productTypeByFiling?.[id] ?? null;
}

/** A class or application type as a sentence names it: "An IND safety report", "A PAS"; mid-sentence, "an IND safety report". */
export function filingTypeInSentence(programType: string, midSentence = false): string {
  const label = filingDocumentClassOf(programType)?.label ?? String(programType).toUpperCase().replace(/_/g, ' ');
  const word = /^[aeiou]/i.test(label) || /^(FDA|NDA|NDS|MAA|IND|ANDA|EU|RMP|HDE|IDE|IVD|MDR|IVDR)\b/.test(label) ? 'An' : 'A';
  return `${midSentence ? word.toLowerCase() : word} ${label}`;
}

/**
 * Why a class's documents are authored here and never sent from here — the one
 * wording the market offer, the project's Submit tab, Submission Readiness and
 * the add-market refusal share. It states the platform's limit, never a
 * regulatory fact: a supplement, an IND amendment or a meeting package IS sent
 * to the agency, as a sequence to its parent application; this platform does
 * not build that sequence (review finding, 2026-10-18).
 */
export function classNotSequencedReason(c: FilingDocumentClass, agency?: string): string {
  if (c.docType === 'pas' || c.docType === 'cbe') {
    return `An FDA supplement is not built as a sequence yet, so this platform sends nothing for the ${c.label}.`;
  }
  if (c.packAgency === 'ich') {
    return `The ${c.label} is a harmonised (ICH) document placed into an application's sequence; this platform sends nothing for it on its own.`;
  }
  return `This platform builds no ${agency ?? c.packAgency.toUpperCase()} sequence for the ${c.label} on its own.`;
}

/** Every class's program type, for the create endpoint's accepted set and the document-class map. */
export function filingDocumentClassTypes(): string[] {
  return FILING_DOCUMENT_CLASSES.map((c) => c.docType);
}
