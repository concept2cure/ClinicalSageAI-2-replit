// Mock data for development purposes
const mockProducts = [
  {
    id: 'PROD-001',
    name: 'LumenTrial-XR',
    indication: 'Type 2 Diabetes Mellitus',
    type: 'Small Molecule',
    phase: 'Phase 2',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'PROD-002',
    name: 'Concept2Cure-IV',
    indication: 'Rheumatoid Arthritis',
    type: 'Biologic',
    phase: 'Phase 1',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'PROD-003',
    name: 'RegulatoryCTX',
    indication: 'Major Depressive Disorder',
    type: 'Small Molecule',
    phase: 'Pre-IND',
    updatedAt: new Date().toISOString(),
  },
];

const mockSafetyData = {
  totalStudies: 12,
  preclinicalStudies: 8,
  clinicalStudies: 4,
  safetySignals: {
    total: 6,
    critical: 1,
    major: 2,
    minor: 3,
  },
  keyFindings: [
    {
      title: 'Hepatotoxicity in high dose group',
      description: 'Elevated ALT and AST observed in preclinical rat studies at 50mg/kg dose.',
      severity: 'critical',
    },
    {
      title: 'Mild hypotension in clinical studies',
      description: 'Transient decrease in blood pressure observed in 15% of subjects.',
      severity: 'major',
    },
    {
      title: 'Headache and dizziness reported',
      description: 'Common adverse events in Phase 1 studies, resolved without intervention.',
      severity: 'minor',
    },
  ],
  preclinical: {
    toxicology: 85,
    pharmacology: 100,
    adme: 90,
    studies: [
      {
        title: '28-Day Repeat Dose Toxicity Study in Rats',
        type: 'GLP Toxicology',
        status: 'complete',
        date: '2023-10-15',
      },
      {
        title: 'Cardiovascular Safety Pharmacology',
        type: 'GLP Safety Pharmacology',
        status: 'complete',
        date: '2023-09-02',
      },
      {
        title: 'Genotoxicity Panel',
        type: 'GLP Genetic Toxicology',
        status: 'in-progress',
        date: '2023-12-10',
      },
    ],
  },
  clinical: {
    studies: [
      {
        title: 'First-in-Human Phase 1 Study',
        type: 'Phase 1',
        status: 'complete',
      },
      {
        title: 'Multiple Ascending Dose Study',
        type: 'Phase 1',
        status: 'complete',
      },
    ],
    totalSubjects: 86,
    saes: 3,
    relatedSaes: 1,
    adverseEvents: [
      {
        term: 'Headache',
        severity: 'mild',
        incidence: 15.3,
        relatedToTreatment: true,
      },
      {
        term: 'Nausea',
        severity: 'moderate',
        incidence: 8.7,
        relatedToTreatment: true,
      },
      {
        term: 'Elevated liver enzymes',
        severity: 'severe',
        incidence: 2.1,
        relatedToTreatment: true,
      },
    ],
  },
};

const mockEfficacyData = {
  endpointsMet: {
    primary: 2,
    secondary: 4,
  },
  totalEndpoints: {
    primary: 3,
    secondary: 6,
  },
  statisticalPower: 83,
  keyFindings: [
    {
      title: 'Primary endpoint achieved',
      description: 'HbA1c reduction of 1.2% at week 12 compared to placebo (p<0.001).',
      status: 'positive',
      pValue: 0.0008,
    },
    {
      title: 'Secondary endpoint not met',
      description: 'Body weight reduction did not reach statistical significance.',
      status: 'negative',
      pValue: 0.078,
    },
    {
      title: 'Dose-response relationship established',
      description: 'Clear dose-response for efficacy parameters across 3 dose levels.',
      status: 'positive',
    },
  ],
  dosingRegimens: [
    {
      dose: '10 mg',
      frequency: 'Once daily',
      response: 45,
    },
    {
      dose: '25 mg',
      frequency: 'Once daily',
      response: 68,
    },
    {
      dose: '50 mg',
      frequency: 'Once daily',
      response: 82,
    },
  ],
  subgroups: [
    {
      name: 'Age >65 years',
      effectSize: 'Similar to overall population',
      significant: true,
    },
    {
      name: 'Renal impairment',
      effectSize: 'Reduced efficacy (30% less)',
      significant: true,
    },
    {
      name: 'Prior medication use',
      effectSize: 'No difference',
      significant: false,
    },
  ],
};

const mockRegulatoryChecklist = {
  items: [
    {
      id: 'check-1',
      category: 'Administrative',
      title: 'Form FDA 1571 completed',
      description:
        'Investigational New Drug Application form with all fields completed and signed.',
      status: 'complete',
      priority: 'critical',
      required: true,
    },
    {
      id: 'check-2',
      category: 'Administrative',
      title: 'Form FDA 1572 for each investigator',
      description: 'Statement of Investigator forms for all participating clinical investigators.',
      status: 'incomplete',
      priority: 'critical',
      required: true,
      additionalInfo:
        'Missing forms for 2 investigators. Names have been highlighted in the system.',
    },
    {
      id: 'check-3',
      category: 'CMC',
      title: 'Manufacturing information provided',
      description: 'Complete information on drug substance and drug product manufacturing.',
      status: 'incomplete',
      priority: 'critical',
      required: true,
      additionalInfo: 'Stability data is insufficient. Need 6-month data at minimum.',
    },
    {
      id: 'check-4',
      category: 'Nonclinical',
      title: 'Pharmacology studies included',
      description: 'Primary and secondary pharmacology studies supporting the proposed indication.',
      status: 'complete',
      priority: 'standard',
      required: true,
    },
    {
      id: 'check-5',
      category: 'Nonclinical',
      title: 'Toxicology package complete',
      description: 'Full toxicology data package supporting the proposed clinical trial duration.',
      status: 'complete',
      priority: 'critical',
      required: true,
    },
    {
      id: 'check-6',
      category: 'Clinical',
      title: 'Protocol finalized and signed',
      description: 'Final clinical protocol with investigator signatures.',
      status: 'incomplete',
      priority: 'standard',
      required: true,
    },
    {
      id: 'check-7',
      category: 'Clinical',
      title: 'Informed consent document',
      description: 'Patient informed consent form meeting 21 CFR 50 requirements.',
      status: 'incomplete',
      priority: 'standard',
      required: true,
    },
  ],
};

const mockSubmissionPreview = {
  indNumber: 'IND 123456',
  submissionType: 'Original IND',
  status: 'ready',
  totalSize: '1.23 GB',
  generatedDate: '2023-12-15',
  format: 'eCTD',
  forms: [
    {
      name: 'Form FDA 1571',
      description: 'Investigational New Drug Application',
      status: 'complete',
    },
    {
      name: 'Form FDA 1572',
      description: 'Statement of Investigator',
      status: 'incomplete',
    },
    {
      name: 'Form FDA 3674',
      description: 'ClinicalTrials.gov Certification of Compliance',
      status: 'complete',
    },
  ],
  documents: [
    {
      name: 'Investigator Brochure',
      type: 'PDF',
      size: '15.6 MB',
    },
    {
      name: 'Clinical Protocol',
      type: 'PDF',
      size: '2.8 MB',
    },
    {
      name: 'CMC Information',
      type: 'PDF',
      size: '45.2 MB',
    },
    {
      name: 'Toxicology Report',
      type: 'PDF',
      size: '38.7 MB',
    },
  ],
};

const mockSignoffData = {
  signaturesRequired: 5,
  signaturesCompleted: 3,
  overallStatus: 'pending', // approved, rejected, pending
  deadline: 'Dec 31, 2023',
  approvals: [
    {
      name: 'Dr. Jane Smith',
      role: 'Principal Investigator',
      status: 'approved',
      required: true,
      signedDate: 'Dec 10, 2023',
      comments: 'Approved with minor comments on protocol section 4.2.',
    },
    {
      name: 'Dr. Michael Johnson',
      role: 'Medical Monitor',
      status: 'approved',
      required: true,
      signedDate: 'Dec 12, 2023',
    },
    {
      name: 'Sarah Williams',
      role: 'Regulatory Affairs Director',
      status: 'approved',
      required: true,
      signedDate: 'Dec 15, 2023',
    },
    {
      name: 'Dr. Robert Chen',
      role: 'Chief Medical Officer',
      status: 'pending',
      required: true,
    },
    {
      name: 'Lisa Thompson',
      role: 'Quality Assurance Manager',
      status: 'pending',
      required: true,
    },
  ],
};

// Service implementation
const indWizardService = {
  // List all products
  listProducts: async () => {
    // In a real implementation, this would be an API call
    return Promise.resolve(mockProducts);
  },

  // Create a protocol draft for a product
  createProtocolDraft: async productId => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    const product = mockProducts.find(p => p.id === productId);
    if (!product) {
      return Promise.reject(new Error('Product not found'));
    }

    // Return a mock draft and submission ID
    return Promise.resolve({
      draft: {
        title: `Phase 2 Study of ${product.name} in ${product.indication}`,
        phase: 'Phase 2',
        sponsor: 'Concept2Cure Pharmaceuticals',
        indication: product.indication,
        objective: `To evaluate the safety and efficacy of ${product.name} in patients with ${product.indication}`,
        design: 'Randomized, double-blind, placebo-controlled',
        duration: '12 weeks',
        population: `Adult patients with ${product.indication}`,
        sampleSize: '120 patients',
        eligibility: `Inclusion Criteria:\n1. Adults aged 18-75 years\n2. Confirmed diagnosis of ${product.indication}\n3. Stable condition for at least 3 months\n\nExclusion Criteria:\n1. History of malignancy within 5 years\n2. Severe renal or hepatic impairment\n3. Current participation in other clinical trials`,
        primaryEndpoint: `Change from baseline in severity of ${product.indication} symptoms at Week 12`,
        secondaryEndpoints: `1. Change in quality of life scores\n2. Time to symptom improvement\n3. Treatment-emergent adverse events`,
        safetyEndpoints: `1. Incidence of adverse events\n2. Clinically significant changes in laboratory parameters\n3. Changes in vital signs and ECG parameters`,
      },
      submissionId: 'SUB-' + Math.floor(100000 + Math.random() * 900000),
    });
  },

  // Regenerate a specific section of the protocol
  regenerateSection: async (submissionId, section) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    // In a real implementation, this would call an AI service
    // to regenerate the specific section
    return Promise.resolve(true);
  },

  // Get safety data for a product
  getSafetyData: async (productId, submissionId) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Return mock safety data
    return Promise.resolve(mockSafetyData);
  },

  // Get efficacy data for a product
  getEfficacyData: async (productId, submissionId) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return mock efficacy data
    return Promise.resolve(mockEfficacyData);
  },

  // Get regulatory checklist for a submission
  getRegulatoryChecklist: async submissionId => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));

    // Return mock checklist data
    return Promise.resolve(mockRegulatoryChecklist);
  },

  // Get submission preview data
  getSubmissionPreview: async submissionId => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Return mock preview data
    return Promise.resolve(mockSubmissionPreview);
  },

  // Get signoff status for a submission
  getSignoffStatus: async submissionId => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 600));

    // Return mock signoff data
    return Promise.resolve(mockSignoffData);
  },

  // Get submission status (for progress indicator)
  getSubmissionStatus: async submissionId => {
    // Simulate API call
    // Return a percentage complete value between 0-100
    return Promise.resolve({
      percentComplete: Math.floor(Math.random() * 100),
      status: 'in-progress',
    });
  },
};

export default indWizardService;
