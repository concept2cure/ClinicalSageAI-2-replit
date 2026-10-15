/**
 * §3.2.R.1 — United States, for an IND.
 *
 * ── The defect this replaces (discovery map 2026-10-04, us-32r-written-for-nda)
 * The one US regional generator wrote for a marketing application whatever the
 * submission was: "Submission Type: NDA / ANDA / BLA (as applicable)",
 * executed batch records under 21 CFR 314.50(d)(1)(ii), comparability
 * protocols under 314.70, Form FDA 356h, and patent and exclusivity
 * information. Placed into an IND, the leaf told FDA the sponsor was filing a
 * marketing application. It named obligations an IND does not have and
 * omitted the ones it does.
 *
 * An IND's regional CMC obligations are those of 21 CFR 312.23(a)(7). Each row
 * below cites the requirement the CMC regulatory record (services/cmc/knowledge)
 * holds for it, and the test pins that every one exists:
 *   - the manufacturers;
 *   - the placebo;
 *   - the investigator labels;
 *   - the environmental analysis;
 *   - the phase 1 risk statement;
 *   - the link between the clinical material and the toxicology material;
 *   - CMC changes as information amendments.
 * Module 1 items are stated, never attested.
 *
 * module3-extensions.ts renders these rows with its own status vocabulary.
 *
 * @module server/services/cmc/us-ind-regional
 */
import type { CanonicalSource } from '../module3Composer';

/** Where the dossier stands on an item; rendered by the regional composer's own constructors. */
export type IndRegionalStatus =
  | { kind: 'cross-referenced'; section: string }
  | { kind: 'module1'; location: string }
  | { kind: 'not-recorded'; note?: string }
  | { kind: 'as-they-occur'; text: string };

export interface IndRegionalRow {
  item: string;
  /** The regulation or guidance that requires it. */
  basis: string;
  /** The CMC regulatory record's requirement for it (services/cmc/knowledge). */
  recordRequirementId: string;
  status: IndRegionalStatus;
}

/** The source fields the IND section reads, so completeness is scored on what it uses. */
export const US_IND_REGIONAL_FIELDS = ['dosageFormDescription', 'strength', 'composition', 'manufacturingSite'];

const firstValue = (sources: CanonicalSource[], field: string): string => {
  for (const s of sources) {
    const v = s.sourcePayload?.[field];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '';
};

/** A drug product or formulation the program records as a placebo, by its own name. */
function placeboRecorded(sources: CanonicalSource[]): boolean {
  return sources.some((s) => {
    if (s.sourceType !== 'drug_product' && s.sourceType !== 'formulation_record') return false;
    const p = s.sourcePayload ?? {};
    return /placebo/i.test(String(p.name ?? p.productName ?? p.formulationName ?? ''));
  });
}

export function usIndRegionalRows(sources: CanonicalSource[]): IndRegionalRow[] {
  const site = firstValue(sources, 'manufacturingSite');
  return [
    {
      item: `Manufacturer name and address (drug substance and drug product)${site ? ` — ${site}` : ''}`,
      basis: '21 CFR 312.23(a)(7)(iv)(a)–(b)',
      recordRequirementId: 'fda-req-003',
      status: site ? { kind: 'cross-referenced', section: '3.2.S.2.1 / 3.2.P.3.1' } : { kind: 'not-recorded' },
    },
    {
      item: 'Placebo: composition, manufacture and control',
      basis: '21 CFR 312.23(a)(7)(iv)(c)',
      recordRequirementId: 'fda-req-005',
      status: placeboRecorded(sources)
        ? { kind: 'cross-referenced', section: '3.2.P' }
        : { kind: 'not-recorded', note: 'required only if a placebo is used in a controlled trial' },
    },
    {
      item: 'Labels and labeling provided to each investigator',
      basis: '21 CFR 312.23(a)(7)(iv)(d); 21 CFR 312.6',
      recordRequirementId: 'fda-req-006',
      status: { kind: 'module1', location: 'Module 1 (1.14 Labeling)' },
    },
    {
      item: 'Environmental analysis: claim of categorical exclusion, or an environmental assessment',
      basis: '21 CFR 312.23(a)(7)(iv)(e); 21 CFR 25.31(e)',
      recordRequirementId: 'fda-req-007',
      status: { kind: 'module1', location: 'Module 1 (1.12.14 Environmental analysis)' },
    },
    {
      item: 'Chemistry or manufacturing signals of potential human risk (phase 1)',
      basis: 'FDA guidance: Content and Format of INDs for Phase 1 Studies (1995)',
      recordRequirementId: 'fda-req-011',
      status: { kind: 'not-recorded' },
    },
    {
      item: 'Relation of the clinical drug product to the material used in the toxicology studies (phase 1)',
      basis: 'FDA guidance: Content and Format of INDs for Phase 1 Studies (1995)',
      recordRequirementId: 'fda-req-012',
      status: { kind: 'not-recorded' },
    },
    {
      item: 'CMC changes as development proceeds',
      basis: '21 CFR 312.31 (information amendments); 21 CFR 312.33 (annual report)',
      recordRequirementId: 'fda-req-009',
      status: { kind: 'as-they-occur', text: 'Filed as "Information Amendment: Chemistry, Manufacturing, and Control" when they occur' },
    },
  ];
}

export function usIndRegionalNarrative(sources: CanonicalSource[]): string {
  const form = firstValue(sources, 'dosageFormDescription');
  const strength = firstValue(sources, 'strength');
  const comp = firstValue(sources, 'composition');
  return (
    'Per ICH M4Q, Section 3.2.R.1 (Regional Information) — United States carries the FDA-specific chemistry, ' +
    'manufacturing and controls information for this Investigational New Drug application, under ' +
    '21 CFR 312.23(a)(7). The amount of information is scaled to the phase of investigation, the proposed ' +
    'duration, the dosage form and the information otherwise available (21 CFR 312.23(a)(7)(i)). ' +
    (form ? `The drug product is a ${form}${strength ? ` (${strength})` : ''}. ` : '') +
    '\n\nThe table below lists each IND regional item, the regulation that requires it and where this dossier ' +
    'stands on it. The investigator labeling and the environmental analysis are filed in Module 1. Module 3 does ' +
    'not carry Module 1, so this section states those requirements and does not attest that they have been met. ' +
    'Marketing-application items (executed batch records, Form FDA 356h, patent and exclusivity information) ' +
    'do not apply to an IND and are not listed.' +
    (comp ? `\n\nComposition statement: ${comp}.` : '')
  );
}

/** The applications this section is written for. */
export function isUsClinicalTrialApplication(applicationType: string | null | undefined): boolean {
  return String(applicationType ?? '').trim().toLowerCase() === 'ind';
}
