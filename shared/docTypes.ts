// Document Type Configurations for Medical Device Regulatory Documents

export const DocTypeConfigs = {
  cerv2_510k: {
    key: 'cerv2_510k',
    label: 'FDA 510(k)',
    agency: 'FDA',
    pathway: 'Diagnostics',
    stylePack: '510k_fda_v1',
    sections: [
      { id: 'cover', title: 'Cover Letter', required: true },
      { id: 'toc', title: 'Table of Contents', required: true },
      { id: 'summary', title: '510(k) Summary', required: true },
      { id: 'device', title: '1. Device Description' },
      { id: 'predicate', title: '2. Predicate Device(s)' },
      { id: 'comparison', title: '3. Substantial Equivalence Comparison', required: true },
      { id: 'performance', title: '4. Performance Data' },
      { id: 'biocompat', title: '5. Biocompatibility (if applicable)' },
      { id: 'software', title: '6. Software Validation (if applicable)' },
      { id: 'labeling', title: '7. Proposed Labeling' }
    ]
  },
  cerv2_pma: {
    key: 'cerv2_pma',
    label: 'FDA PMA',
    agency: 'FDA',
    pathway: 'Diagnostics',
    stylePack: 'pma_fda_v1',
    sections: [
      { id: 'admin', title: '1. Administrative Information', required: true },
      { id: 'device', title: '2. Device Description' },
      { id: 'nonclinical', title: '3. Nonclinical Studies', required: true },
      { id: 'mfgqa', title: '4. Manufacturing and Quality Systems' },
      { id: 'labeling', title: '5. Labeling' },
      { id: 'risk', title: '6. Risk/Benefit Determination' },
      { id: 'pms', title: '7. Post-Approval Study / PMS (if applicable)' }
    ]
  },
  cerv2_cer: {
    key: 'cerv2_cer',
    label: 'EU MDR CER',
    agency: 'EU',
    pathway: 'Diagnostics',
    stylePack: 'cer_mdr_v1',
    sections: [
      { id: 'sota', title: '1. State of the Art', required: true },
      { id: 'device', title: '2. Device/Intended Purpose' },
      { id: 'dataset', title: '3. Clinical Data Set (Literature + Studies)', required: true },
      { id: 'appraisal', title: '4. Critical Appraisal & Weighting', required: true },
      { id: 'benefitrisk', title: '5. Benefit–Risk Determination', required: true },
      { id: 'gspr', title: '6. GSPR Mapping' },
      { id: 'pms', title: '7. PMS Plan / PMCF' },
      { id: 'concl', title: '8. Conclusions & Recommendations' }
    ]
  }
};

export const DOC_TYPES = DocTypeConfigs;

export const getDocType = (key: string) => DocTypeConfigs[key as keyof typeof DocTypeConfigs];
export const getAllDocTypes = () => Object.values(DocTypeConfigs);