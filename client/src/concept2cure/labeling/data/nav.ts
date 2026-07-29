// Labeling nav — copy sourced from ui_kits/labeling (LB_DOC_KIND, suggestions).
// Four live surfaces, each backed by server/routes/mdx-labeling.ts.

export interface LabelingNavItem {
  id: string;
  label: string;
  icon: string;
}

export const LABELING_NAV: LabelingNavItem[] = [
  { id: 'overview',     label: 'Labeling overview',   icon: 'tag' },
  { id: 'documents',    label: 'Labeling documents',  icon: 'fileText' },
  { id: 'translations', label: 'Translation coverage', icon: 'globe' },
  { id: 'symbols',      label: 'ISO 15223-1 symbols', icon: 'shapes' },
];

export const HERE_LABEL_LABELING: Record<string, string> = {
  overview:     'Labeling overview',
  documents:    'Labeling documents',
  translations: 'Translation coverage',
  symbols:      'ISO 15223-1 symbols',
};

// Human-readable doc-kind labels — mirror LB_DOC_KIND from the kit.
export const DOC_KIND_LABEL: Record<string, string> = {
  ifu:             'IFU',
  package_insert:  'Package insert',
  patient_label:   'Patient label',
  operator_manual: 'Operator manual',
  service_manual:  'Service manual',
  quick_ref:       'Quick reference',
  box_label:       'Box label',
};

// Three AnA prompts per surface (sentence case, second person, no emoji).
export const LABELING_SUGGESTIONS: Record<string, string[]> = {
  overview: [
    'Which IFU translations are blocking the EU launch',
    'Check the symbol set against ISO 15223-1 for the box label',
    'Reconcile the IFU against the cleared indications for use',
  ],
  documents: [
    'List every labeling document still in draft',
    'Show which documents are approved across every language',
    'What is the fastest path to get the operator manual to review',
  ],
  translations: [
    'List every translation not yet approved and what each needs',
    'Show which languages still need back-translation verification',
    'Which markets are blocked by a pending translation',
  ],
  symbols: [
    'Verify the symbol set against ISO 15223-1 for this label',
    'Draft the MR-conditional statement for the patient label',
    'Which required symbols are missing from the package label',
  ],
};
