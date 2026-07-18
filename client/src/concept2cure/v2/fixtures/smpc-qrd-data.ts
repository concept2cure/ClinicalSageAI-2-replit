/**
 * EU SmPC (QRD template) fixture — the offline fallback for the SmpcLabeling
 * surface. Mirrors the server buildSmpcReadiness output shape
 * (server/services/labeling/smpc-qrd-catalog.ts) so live ?? fixture is seamless.
 * A realistic mid-authoring state (front sections final, clinical particulars in
 * draft/review, pharma particulars missing).
 */
export type SmpcStatus = 'missing' | 'draft' | 'review' | 'final';

export interface SmpcSectionRow {
  number: string;
  title: string;
  depth: number;
  required: boolean;
  status: SmpcStatus;
}

export interface SmpcReadiness {
  sections: SmpcSectionRow[];
  finalRequired: number;
  totalRequired: number;
  completenessPct: number;
  ready: boolean;
  outstanding: string[];
}

const CATALOG: Array<[string, string, number, boolean]> = [
  ['1', 'Name of the medicinal product', 0, true],
  ['2', 'Qualitative and quantitative composition', 0, true],
  ['3', 'Pharmaceutical form', 0, true],
  ['4', 'Clinical particulars', 0, true],
  ['4.1', 'Therapeutic indications', 1, true],
  ['4.2', 'Posology and method of administration', 1, true],
  ['4.3', 'Contraindications', 1, true],
  ['4.4', 'Special warnings and precautions for use', 1, true],
  ['4.5', 'Interaction with other medicinal products and other forms of interaction', 1, true],
  ['4.6', 'Fertility, pregnancy and lactation', 1, true],
  ['4.7', 'Effects on ability to drive and use machines', 1, true],
  ['4.8', 'Undesirable effects', 1, true],
  ['4.9', 'Overdose', 1, true],
  ['5', 'Pharmacological properties', 0, true],
  ['5.1', 'Pharmacodynamic properties', 1, true],
  ['5.2', 'Pharmacokinetic properties', 1, true],
  ['5.3', 'Preclinical safety data', 1, true],
  ['6', 'Pharmaceutical particulars', 0, true],
  ['6.1', 'List of excipients', 1, true],
  ['6.2', 'Incompatibilities', 1, true],
  ['6.3', 'Shelf life', 1, true],
  ['6.4', 'Special precautions for storage', 1, true],
  ['6.5', 'Nature and contents of container', 1, true],
  ['6.6', 'Special precautions for disposal and other handling', 1, true],
  ['7', 'Marketing authorisation holder', 0, true],
  ['8', 'Marketing authorisation number(s)', 0, false],
  ['9', 'Date of first authorisation / renewal of the authorisation', 0, false],
  ['10', 'Date of revision of the text', 0, false],
];

// Demo status mix.
const DEMO: Record<string, SmpcStatus> = {
  '1': 'final', '2': 'final', '3': 'final',
  '4.1': 'review', '4.2': 'draft', '4.3': 'draft', '4.4': 'draft', '4.8': 'draft',
  '5.1': 'draft', '5.3': 'draft',
};

const sections: SmpcSectionRow[] = CATALOG.map(([number, title, depth, required]) => ({
  number, title, depth, required, status: DEMO[number] ?? 'missing',
}));
const required = sections.filter((s) => s.required);
const finalRequired = required.filter((s) => s.status === 'final').length;

export const SMPC_FIXTURE: SmpcReadiness = {
  sections,
  finalRequired,
  totalRequired: required.length,
  completenessPct: required.length ? Math.round((finalRequired / required.length) * 100) : 0,
  ready: required.length > 0 && finalRequired === required.length,
  outstanding: required.filter((s) => s.status !== 'final').map((s) => s.number),
};
