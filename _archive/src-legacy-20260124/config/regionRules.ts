/**
 * Region-specific module folder rules and validation requirements
 */

export type RegionType = 'FDA' | 'EMA' | 'PMDA' | 'HC';

// Required modules per region - modules that must exist in the submission
export const requiredModules: Record<RegionType, string[]> = {
  FDA: ['m1', 'm1.1', 'm1.3'],
  EMA: ['m1', 'm1.0', 'm1.2'],
  PMDA: ['m1', 'jp-annex'],
  HC: ['m1', 'm1.0', 'm1.2.3'],
};

// Module folder structure hints
export const moduleFolderHints: Record<string, string> = {
  // FDA module hints
  m1: 'Administrative Information and Prescribing Information',
  'm1.1': 'Forms and Cover Letters',
  'm1.2': 'FDA Table of Contents',
  'm1.3': 'Administrative Information',
  'm1.4': 'References',
  m2: 'Common Technical Document Summaries',
  'm2.1': 'CTD Table of Contents',
  'm2.2': 'Introduction to the CTD',
  'm2.3': 'Quality Overall Summary',
  'm2.4': 'Nonclinical Overview',
  'm2.5': 'Clinical Overview',
  'm2.6': 'Nonclinical Written and Tabulated Summaries',
  'm2.7': 'Clinical Summary',
  m3: 'Quality',
  m4: 'Nonclinical Study Reports',
  m5: 'Clinical Study Reports',

  // EMA specific modules
  'm1.0': 'Cover Letter (EMA specific)',
  'm1.0.1': 'Cover Letter (EMA specific)',
  'm1.0.2': 'Application Form (EMA specific)',

  // PMDA specific modules
  'jp-annex': 'Japan Regional Annex (PMDA specific)',
  'jp-m1': 'Module 1 Japan Region',
  'jp-m1.1': 'Module 1.1 Japan Region',

  // Health Canada specific modules
  'm1.2.3': 'Product Monograph (Health Canada specific)',
};

// Module validation rules
export const moduleValidationRules: Record<RegionType, Record<string, string[]>> = {
  FDA: {
    'm1.1': ['Cover letter must be PDF', 'Form FDA 1571 must be included'],
    'm1.3': [
      'FDA forms must be included',
      'Statement of right of reference must be included if applicable',
    ],
    'm2.5': ['Clinical overview must be present', 'Must include efficacy and safety conclusions'],
  },
  EMA: {
    'm1.0': ['Application form must be included', 'Cover letter must reference procedure number'],
    'm1.2': ['Comprehensive TOC must be included'],
    'm2.3': ['QOS must be present with all sections completed'],
  },
  PMDA: {
    'jp-annex': ['Must contain Japan-specific data', 'Must be in proper PMDA format'],
    m1: ['Module 1 must contain Japan regional information'],
  },
  HC: {
    'm1.0': ['Cover letter must reference HC submission number'],
    'm1.2.3': ['Product Monograph must be provided in both English and French'],
  },
};

// Hierarchical module and folder structure
export const hierarchicalModuleStructure = [
  { id: 'm1', parent: null, droppable: true, text: 'Module 1: Administrative Information' },
  { id: 'm1.1', parent: 'm1', droppable: true, text: 'Module 1.1: Forms and Cover Letters' },
  { id: 'm1.2', parent: 'm1', droppable: true, text: 'Module 1.2: Table of Contents' },
  { id: 'm1.3', parent: 'm1', droppable: true, text: 'Module 1.3: Administrative Information' },
  { id: 'm1.4', parent: 'm1', droppable: true, text: 'Module 1.4: References' },
  { id: 'm2', parent: null, droppable: true, text: 'Module 2: CTD Summaries' },
  { id: 'm2.1', parent: 'm2', droppable: true, text: 'Module 2.1: CTD Table of Contents' },
  { id: 'm2.2', parent: 'm2', droppable: true, text: 'Module 2.2: Introduction' },
  { id: 'm2.3', parent: 'm2', droppable: true, text: 'Module 2.3: Quality Overall Summary' },
  { id: 'm2.4', parent: 'm2', droppable: true, text: 'Module 2.4: Nonclinical Overview' },
  { id: 'm2.5', parent: 'm2', droppable: true, text: 'Module 2.5: Clinical Overview' },
  { id: 'm2.6', parent: 'm2', droppable: true, text: 'Module 2.6: Nonclinical Summary' },
  { id: 'm2.7', parent: 'm2', droppable: true, text: 'Module 2.7: Clinical Summary' },
  { id: 'm3', parent: null, droppable: true, text: 'Module 3: Quality' },
  { id: 'm3.1', parent: 'm3', droppable: true, text: 'Module 3.1: TOC of Module 3' },
  { id: 'm3.2', parent: 'm3', droppable: true, text: 'Module 3.2: Body of Data' },
  { id: 'm4', parent: null, droppable: true, text: 'Module 4: Nonclinical Study Reports' },
  { id: 'm4.1', parent: 'm4', droppable: true, text: 'Module 4.1: TOC of Module 4' },
  { id: 'm4.2', parent: 'm4', droppable: true, text: 'Module 4.2: Study Reports' },
  { id: 'm5', parent: null, droppable: true, text: 'Module 5: Clinical Study Reports' },
  { id: 'm5.1', parent: 'm5', droppable: true, text: 'Module 5.1: TOC of Module 5' },
  { id: 'm5.2', parent: 'm5', droppable: true, text: 'Module 5.2: Clinical Study Reports' },

  // EMA specific
  { id: 'm1.0', parent: 'm1', droppable: true, text: 'Module 1.0: Cover Letter (EMA)' },
  { id: 'm1.0.1', parent: 'm1.0', droppable: true, text: 'Module 1.0.1: Cover Letter' },
  { id: 'm1.0.2', parent: 'm1.0', droppable: true, text: 'Module 1.0.2: Application Form' },

  // PMDA specific
  { id: 'jp-annex', parent: null, droppable: true, text: 'JP Annex: Japan Regional Annex' },
  { id: 'jp-m1', parent: 'jp-annex', droppable: true, text: 'JP Module 1' },
  { id: 'jp-m1.1', parent: 'jp-m1', droppable: true, text: 'JP Module 1.1' },

  // Health Canada specific
  { id: 'm1.2.3', parent: 'm1.2', droppable: true, text: 'Module 1.2.3: Product Monograph' },
];

// Generate region-specific module tree
export function getRegionSpecificModuleTree(region: RegionType) {
  // Base modules common to all regions
  const baseModules = [
    'm1',
    'm2',
    'm3',
    'm4',
    'm5',
    'm1.1',
    'm1.2',
    'm1.3',
    'm1.4',
    'm2.1',
    'm2.2',
    'm2.3',
    'm2.4',
    'm2.5',
    'm2.6',
    'm2.7',
    'm3.1',
    'm3.2',
    'm4.1',
    'm4.2',
    'm5.1',
    'm5.2',
  ];

  // Region-specific modules
  const regionModules: Record<RegionType, string[]> = {
    FDA: [],
    EMA: ['m1.0', 'm1.0.1', 'm1.0.2'],
    PMDA: ['jp-annex', 'jp-m1', 'jp-m1.1'],
    HC: ['m1.2.3'],
  };

  // Combine base modules with region-specific modules
  const allowedModules = [...baseModules, ...regionModules[region]];

  // Filter the hierarchical structure to only include allowed modules for the region
  return hierarchicalModuleStructure.filter(item => allowedModules.includes(item.id));
}

// Rules for relocating documents based on region
export function getModuleRewriteRules(region: RegionType): Record<string, string> {
  // If a document is added to these folders, rewrite its module to follow region-specific structure
  switch (region) {
    case 'EMA':
      return {
        'm1.1': 'm1.0.1', // Cover letters go to m1.0.1 in EMA structure
        'm1.2': 'm1.2', // TOC stays in m1.2
      };
    case 'PMDA':
      return {
        'm1.1': 'jp-m1.1', // Cover letters go to Japan-specific Module 1.1
        m1: 'jp-m1', // Module 1 documents go to Japan-specific Module 1
      };
    case 'HC':
      return {
        'm1.2': 'm1.2.3', // Product information goes to Module 1.2.3 in HC structure
      };
    default:
      return {}; // No rewrites for FDA
  }
}
