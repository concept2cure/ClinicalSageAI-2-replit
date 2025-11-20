/**
 * Comprehensive ICH Guidelines Database
 * International Council for Harmonisation Guidelines for Pharmaceutical Development
 * Authentic regulatory guidance for eCTD submissions
 */

const ichGuidelines = {
  // ICH M4 - Common Technical Document
  M4: {
    title:
      'ICH M4 - The Common Technical Document for the Registration of Pharmaceuticals for Human Use',
    sections: {
      'M4(R4)': {
        title:
          'Organization of the Common Technical Document for the Registration of Pharmaceuticals for Human Use',
        description: 'Provides guidance on the organization of the Common Technical Document (CTD)',
        modules: {
          1: 'Administrative Information and Prescribing Information',
          2: 'CTD Summaries',
          3: 'Quality',
          4: 'Nonclinical Study Reports',
          5: 'Clinical Study Reports',
        },
        keyRequirements: [
          'Standardized format for regulatory submissions',
          'Consistent organization across regions',
          'Electronic submission compatibility',
          'Comprehensive quality documentation',
        ],
      },
      'M4S(R2)': {
        title: 'Specification for Submission Formats for eCTD',
        description:
          'Technical specifications for electronic Common Technical Document submissions',
        requirements: [
          'XML backbone structure',
          'PDF format for documents',
          'Standardized folder structure',
          'Digital signatures and checksums',
        ],
      },
    },
  },

  // ICH E Series - Efficacy Guidelines
  E: {
    E1: {
      title: 'ICH E1 - The Extent of Population Exposure to Assess Clinical Safety',
      description: 'Guidance on the extent of population exposure needed to assess clinical safety',
      requirements: [
        'Minimum 1500 patients exposed to investigational drug',
        '300-600 patients for 6 months',
        '100 patients for 1 year',
        'Special populations consideration',
      ],
    },
    E2A: {
      title:
        'ICH E2A - Clinical Safety Data Management: Definitions and Standards for Expedited Reporting',
      description: 'Standards for expedited reporting of adverse drug reactions',
      timelines: {
        'Fatal/Life-threatening': '7 calendar days',
        'Serious non-fatal': '15 calendar days',
        'Follow-up information': '15 calendar days',
      },
    },
    E3: {
      title: 'ICH E3 - Structure and Content of Clinical Study Reports',
      description: 'Comprehensive guidance on clinical study report structure',
      sections: [
        'Title Page',
        'Synopsis',
        'Table of Contents',
        'List of Abbreviations and Definitions',
        'Ethics',
        'Investigators and Study Administrative Structure',
        'Introduction',
        'Study Objectives',
        'Study Design',
        'Selection of Study Population',
        'Treatments',
        'Assessment of Efficacy',
        'Assessment of Safety',
        'Statistics',
        'Results and Tables, Figures, and Graphs',
        'Discussion and Conclusions',
        'Tables, Figures, and Graphs',
        'Reference List',
        'Appendices',
      ],
    },
    E6: {
      title: 'ICH E6(R2) - Good Clinical Practice',
      description:
        'International standard for designing, conducting, recording and reporting clinical trials',
      principles: [
        'Protection of rights, safety and well-being of trial subjects',
        'Credible clinical trial data generation',
        'Compliance with approved protocol',
        'Accurate data recording and reporting',
        'Investigator qualifications and resources',
        'Quality assurance and quality control',
      ],
    },
    E8: {
      title: 'ICH E8(R1) - General Considerations for Clinical Studies',
      description: 'General considerations for the planning and design of clinical studies',
      studyTypes: [
        'Exploratory studies',
        'Confirmatory studies',
        'Dose-response studies',
        'Comparative studies',
        'Multi-regional clinical trials',
      ],
    },
    E9: {
      title: 'ICH E9(R1) - Statistical Principles for Clinical Trials',
      description: 'Statistical principles and methodology for clinical trials',
      concepts: [
        'Study design and planning',
        'Study conduct considerations',
        'Statistical analysis principles',
        'Estimands framework',
        'Handling of missing data',
        'Sensitivity analyses',
      ],
    },
  },

  // ICH Q Series - Quality Guidelines
  Q: {
    Q1A: {
      title: 'ICH Q1A(R2) - Stability Testing of New Drug Substances and Products',
      description: 'Stability testing requirements for new drug substances and products',
      conditions: {
        'Long-term': '25°C ± 2°C/60% RH ± 5% RH for 12 months',
        Intermediate: '30°C ± 2°C/65% RH ± 5% RH for 6 months',
        Accelerated: '40°C ± 2°C/75% RH ± 5% RH for 6 months',
      },
    },
    Q2: {
      title: 'ICH Q2(R2) - Validation of Analytical Procedures',
      description: 'Requirements for validation of analytical procedures',
      parameters: [
        'Accuracy',
        'Precision (repeatability and intermediate precision)',
        'Specificity',
        'Detection limit',
        'Quantitation limit',
        'Linearity',
        'Range',
        'Robustness',
      ],
    },
    Q3A: {
      title: 'ICH Q3A(R2) - Impurities in New Drug Substances',
      description: 'Guidance on impurities in new drug substances',
      thresholds: {
        Identification: '≥0.10% or 1.0 mg per day intake (whichever is lower)',
        Qualification: '≥0.15% or 1.0 mg per day intake (whichever is lower)',
      },
    },
    Q6A: {
      title:
        'ICH Q6A - Test Procedures and Acceptance Criteria for New Drug Substances and New Drug Products: Chemical Substances',
      description: 'Specifications for new drug substances and drug products',
      tests: [
        'Appearance',
        'Identity',
        'Assay',
        'Impurities',
        'Water content',
        'Residual solvents',
        'Particle size',
        'Dissolution',
        'Content uniformity',
      ],
    },
    Q8: {
      title: 'ICH Q8(R2) - Pharmaceutical Development',
      description: 'Systematic approach to pharmaceutical development',
      elements: [
        'Quality target product profile (QTPP)',
        'Critical quality attributes (CQAs)',
        'Risk assessment',
        'Design space',
        'Control strategy',
        'Product lifecycle management',
      ],
    },
    Q9: {
      title: 'ICH Q9 - Quality Risk Management',
      description: 'Principles and examples of tools for quality risk management',
      process: [
        'Risk assessment (identification, analysis, evaluation)',
        'Risk control (reduction, acceptance)',
        'Risk communication',
        'Risk review',
      ],
    },
    Q10: {
      title: 'ICH Q10 - Pharmaceutical Quality System',
      description: 'Model for an effective pharmaceutical quality system',
      elements: [
        'Management responsibility',
        'Resource management',
        'Product realization',
        'Measurement, analysis and improvement',
      ],
    },
    Q11: {
      title: 'ICH Q11 - Development and Manufacture of Drug Substances',
      description: 'Guidance on development and manufacture of drug substances',
      sections: [
        'Manufacturing process development',
        'Manufacturing process description',
        'Control of materials',
        'Controls of critical steps and intermediates',
        'Process validation',
        'Manufacturing process development',
      ],
    },
    Q12: {
      title:
        'ICH Q12 - Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management',
      description: 'Framework for managing post-approval changes',
      categories: [
        'Established conditions',
        'Post-approval change management protocols',
        'Comparability protocols',
        'Risk-based approaches',
      ],
    },
  },

  // ICH S Series - Safety Guidelines
  S: {
    S1A: {
      title: 'ICH S1A - Guideline on the Need for Carcinogenicity Studies of Pharmaceuticals',
      description: 'Guidance on when carcinogenicity studies are needed',
      triggers: [
        'Chronic treatment (≥6 months)',
        "Intermittent treatment over patient's lifetime",
        'Concern based on chemical structure',
        'Evidence of pre-neoplastic lesions',
      ],
    },
    S2: {
      title: 'ICH S2(R1) - Genotoxicity Testing and Data Interpretation',
      description: 'Standard battery of genotoxicity tests',
      battery: [
        'In vitro gene mutation test in bacteria',
        'In vitro chromosome aberration test or in vitro micronucleus test',
        'In vivo chromosome damage test',
      ],
    },
    S5: {
      title: 'ICH S5(R3) - Detection of Reproductive and Developmental Toxicity',
      description: 'Studies to assess reproductive and developmental toxicity',
      studies: [
        'Fertility and early embryonic development',
        'Embryo-fetal development',
        'Pre- and post-natal development',
      ],
    },
    S6: {
      title: 'ICH S6(R1) - Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals',
      description: 'Preclinical safety evaluation for biotechnology products',
      considerations: [
        'Species selection',
        'Immunogenicity assessment',
        'Tissue cross-reactivity',
        'Repeat-dose toxicity studies',
        'Safety pharmacology',
      ],
    },
    S7A: {
      title: 'ICH S7A - Safety Pharmacology Studies for Human Pharmaceuticals',
      description: 'Core battery of safety pharmacology studies',
      systems: ['Central nervous system', 'Cardiovascular system', 'Respiratory system'],
    },
    S7B: {
      title:
        'ICH S7B - The Nonclinical Evaluation of the Potential for Delayed Ventricular Repolarization (QT Interval Prolongation)',
      description: 'Assessment of QT interval prolongation potential',
      studies: ['In vitro hERG assay', 'In vivo QT assessment', 'Integrated risk assessment'],
    },
  },

  // eCTD Module Structure Mapping
  eCTDModuleMapping: {
    'Module 1': {
      sections: [
        '1.0 Cover Letter',
        '1.1 Comprehensive Table of Contents',
        '1.2 Application Form',
        '1.3 Product Information',
        '1.4 Information about the Experts',
        '1.5 Specific Requirements for Different Regions',
      ],
      ichGuidelines: ['M4(R4)', 'M4S(R2)'],
    },
    'Module 2': {
      sections: [
        '2.1 Table of Contents of Module 2',
        '2.2 Introduction',
        '2.3 Quality Overall Summary',
        '2.4 Nonclinical Overview',
        '2.5 Clinical Overview',
        '2.6 Nonclinical Written and Tabulated Summaries',
        '2.7 Clinical Summary',
      ],
      ichGuidelines: ['M4(R4)', 'E3', 'Q8(R2)', 'Q9', 'Q10'],
    },
    'Module 3': {
      sections: [
        '3.1 Table of Contents of Module 3',
        '3.2 Body of Data',
        '3.3 Literature References',
      ],
      ichGuidelines: ['Q1A(R2)', 'Q2(R2)', 'Q3A(R2)', 'Q6A', 'Q8(R2)', 'Q9', 'Q10', 'Q11', 'Q12'],
    },
    'Module 4': {
      sections: [
        '4.1 Table of Contents of Module 4',
        '4.2 Study Reports',
        '4.3 Literature References',
      ],
      ichGuidelines: ['S1A', 'S2(R1)', 'S5(R3)', 'S6(R1)', 'S7A', 'S7B'],
    },
    'Module 5': {
      sections: [
        '5.1 Table of Contents of Module 5',
        '5.2 Tabular Listing of All Clinical Studies',
        '5.3 Clinical Study Reports',
        '5.4 Literature References',
      ],
      ichGuidelines: ['E1', 'E2A', 'E3', 'E6(R2)', 'E8(R1)', 'E9(R1)'],
    },
  },

  // Submission Type Specific Requirements
  submissionTypes: {
    IND: {
      applicableGuidelines: ['E6(R2)', 'E8(R1)', 'S7A', 'S7B', 'S2(R1)'],
      requiredModules: ['Module 1', 'Module 2', 'Module 4'],
      keyRequirements: [
        'Investigational plan',
        'Chemistry, manufacturing and controls information',
        'Pharmacology and toxicology information',
        'Clinical protocols and investigator information',
      ],
    },
    NDA: {
      applicableGuidelines: ['M4(R4)', 'E3', 'E6(R2)', 'E9(R1)', 'Q1A(R2)', 'Q2(R2)', 'Q6A'],
      requiredModules: ['Module 1', 'Module 2', 'Module 3', 'Module 4', 'Module 5'],
      keyRequirements: [
        'Complete CTD submission',
        'Comprehensive clinical data',
        'Full chemistry and manufacturing controls',
        'Risk evaluation and mitigation strategies',
      ],
    },
    BLA: {
      applicableGuidelines: ['M4(R4)', 'S6(R1)', 'E6(R2)', 'Q8(R2)', 'Q10', 'Q11'],
      requiredModules: ['Module 1', 'Module 2', 'Module 3', 'Module 4', 'Module 5'],
      keyRequirements: [
        'Biologics-specific manufacturing information',
        'Potency assays and specifications',
        'Immunogenicity assessment',
        'Facility information and inspection readiness',
      ],
    },
  },
};

module.exports = ichGuidelines;
