// Document Type Configurations for Medical Device Regulatory Submissions

const DocTypeConfigs = {
  cerv2_510k: {
    key: 'cerv2_510k',
    label: 'FDA 510(k) Submission',
    agency: 'FDA',
    pathway: 'Device',
    stylePack: '510k_v1',
    sections: [
      { id: 'admin', title: '1. Administrative Information', required: true },
      { id: 'ifu', title: '2. Indications for Use', required: true },
      { id: 'desc', title: '3. Device Description', required: true },
      { id: 'pred', title: '4. Predicate Devices', required: true },
      { id: 'se', title: '5. Substantial Equivalence Discussion', required: true },
      { id: 'testing', title: '6. Performance Testing (Bench/Clinical)' },
      { id: 'labeling', title: '7. Labeling' },
      { id: 'concl', title: '8. Conclusion' },
    ],
  },
  cerv2_pma: {
    key: 'cerv2_pma',
    label: 'FDA PMA Application',
    agency: 'FDA',
    pathway: 'Device',
    stylePack: 'pma_v1',
    sections: [
      { id: 'summary', title: '1. Summary and General Information', required: true },
      { id: 'nonclin', title: '2. Nonclinical Laboratory Studies', required: true },
      { id: 'clin', title: '3. Clinical Investigations', required: true },
      { id: 'mfgqa', title: '4. Manufacturing and Quality Systems' },
      { id: 'labeling', title: '5. Labeling' },
      { id: 'risk', title: '6. Risk/Benefit Determination' },
      { id: 'pms', title: '7. Post-Approval Study / PMS (if applicable)' },
    ],
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
      { id: 'concl', title: '8. Conclusions & Recommendations' },
    ],
  },
};

module.exports = {
  DOC_TYPES: DocTypeConfigs,
  getDocType: key => DocTypeConfigs[key],
  getAllDocTypes: () => Object.values(DocTypeConfigs),
};
