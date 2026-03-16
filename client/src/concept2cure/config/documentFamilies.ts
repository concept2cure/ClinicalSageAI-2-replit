/**
 * Document Family Definitions
 * Maps document families to their CTD sections and package modes.
 */

export interface DocumentFamily {
  id: string;
  name: string;
  ctdSection: string;
  packageModes: string[];
  description: string;
  category: 'administrative' | 'quality' | 'nonclinical' | 'clinical' | 'device' | 'operational';
}

export const DOCUMENT_FAMILIES: DocumentFamily[] = [
  {
    id: 'cover-letter',
    name: 'Cover Letter',
    ctdSection: 'm1',
    packageModes: ['IND', 'NDA', 'BLA', '510K', 'PMA', 'DE_NOVO'],
    description: 'Formal cover letter for regulatory submission',
    category: 'administrative',
  },
  {
    id: 'device-description',
    name: 'Device Description',
    ctdSection: 'device-description',
    packageModes: ['510K', 'PMA', 'DE_NOVO'],
    description: 'Detailed description of the medical device',
    category: 'device',
  },
  {
    id: 'predicate-comparison',
    name: 'Predicate Comparison / SE Summary',
    ctdSection: 'se-summary',
    packageModes: ['510K'],
    description: 'Substantial equivalence comparison with predicate device',
    category: 'device',
  },
  {
    id: 'cer-summary',
    name: 'CER Executive Summary',
    ctdSection: 'cer-summary',
    packageModes: ['510K', 'PMA', 'DE_NOVO', 'CER'],
    description: 'Clinical Evaluation Report executive summary',
    category: 'clinical',
  },
  {
    id: 'protocol-synopsis',
    name: 'Protocol Synopsis',
    ctdSection: 'm5-protocol',
    packageModes: ['IND', 'NDA', 'BLA'],
    description: 'Clinical study protocol synopsis',
    category: 'clinical',
  },
  {
    id: 'cmc-overview',
    name: 'CMC Overview (Module 3 QOS)',
    ctdSection: 'm3-qos',
    packageModes: ['IND', 'NDA', 'BLA'],
    description: 'Quality Overall Summary for CMC information',
    category: 'quality',
  },
  {
    id: 'ind-cover-letter',
    name: 'IND Cover Letter',
    ctdSection: 'm1-cover',
    packageModes: ['IND'],
    description: 'IND-specific cover letter',
    category: 'administrative',
  },
  {
    id: 'readiness-memo',
    name: 'Readiness Memo',
    ctdSection: 'operational',
    packageModes: ['IND', 'NDA', 'BLA', '510K', 'PMA', 'DE_NOVO'],
    description: 'Submission readiness assessment memo',
    category: 'operational',
  },
  {
    id: 'sponsor-handoff',
    name: 'Sponsor Handoff Brief',
    ctdSection: 'operational',
    packageModes: ['IND', 'NDA', 'BLA', '510K', 'PMA', 'DE_NOVO'],
    description: 'Brief for sponsor/CRO handoff',
    category: 'operational',
  },
  {
    id: 'transmittal',
    name: 'Transmittal',
    ctdSection: 'operational',
    packageModes: ['IND', 'NDA', 'BLA', '510K', 'PMA', 'DE_NOVO'],
    description: 'Package transmittal document',
    category: 'operational',
  },
];

/** Look up a document family by keywords in user prompt */
export function detectDocumentFamily(prompt: string): DocumentFamily | null {
  const lower = prompt.toLowerCase();

  const patterns: Array<[string[], string]> = [
    [['cover letter', 'coverletter'], 'cover-letter'],
    [['device description', 'device desc'], 'device-description'],
    [['predicate', 'substantial equivalence', 'se summary', 'se comparison'], 'predicate-comparison'],
    [['cer', 'clinical evaluation', 'cer summary'], 'cer-summary'],
    [['protocol synopsis', 'protocol summary'], 'protocol-synopsis'],
    [['cmc', 'quality overall', 'module 3', 'qos'], 'cmc-overview'],
    [['ind cover', 'ind letter'], 'ind-cover-letter'],
    [['readiness', 'readiness memo', 'readiness assessment'], 'readiness-memo'],
    [['handoff', 'hand-off', 'sponsor brief'], 'sponsor-handoff'],
    [['transmittal', 'transmit'], 'transmittal'],
  ];

  for (const [keywords, familyId] of patterns) {
    if (keywords.some(kw => lower.includes(kw))) {
      return DOCUMENT_FAMILIES.find(f => f.id === familyId) || null;
    }
  }
  return null;
}
