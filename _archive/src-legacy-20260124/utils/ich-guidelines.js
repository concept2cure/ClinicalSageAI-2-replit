/**
 * ICH Guidelines Utility
 *
 * This utility provides access to International Council for Harmonisation (ICH)
 * guidelines that are relevant to CTD submissions and eCTD format requirements.
 * It maps CTD sections to their corresponding ICH guidelines.
 */

// ICH Guidelines collection
const ichGuidelines = {
  // Quality Guidelines
  Q1A: {
    title: 'Stability Testing of New Drug Substances and Products',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.7', '3.2.P.8'],
    description: 'Defines stability testing requirements for new drug substances and products',
  },
  Q1B: {
    title: 'Stability Testing: Photostability Testing of New Drug Substances and Products',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.7.3', '3.2.P.8.3'],
    description: 'Provides recommendations for photostability testing',
  },
  Q1C: {
    title: 'Stability Testing for New Dosage Forms',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.P.8'],
    description: 'Extends stability testing recommendations to new dosage forms',
  },
  Q1D: {
    title:
      'Bracketing and Matrixing Designs for Stability Testing of New Drug Substances and Products',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.7', '3.2.P.8'],
    description: 'Provides guidance on reduced stability testing designs',
  },
  Q1E: {
    title: 'Evaluation of Stability Data',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.7.3', '3.2.P.8.3'],
    description: 'Guidance on evaluating stability data for shelf-life determination',
  },
  Q2: {
    title: 'Validation of Analytical Procedures',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.4.3', '3.2.P.5.3'],
    description: 'Recommendations for validation of analytical procedures',
  },
  Q3A: {
    title: 'Impurities in New Drug Substances',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.3.2'],
    description: 'Guidance on impurities in new drug substances',
  },
  Q3B: {
    title: 'Impurities in New Drug Products',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.P.5.5'],
    description: 'Guidance on impurities in new drug products',
  },
  Q3C: {
    title: 'Impurities: Guideline for Residual Solvents',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.3.2', '3.2.P.5.5'],
    description: 'Recommendations for residual solvent limits in pharmaceuticals',
  },
  Q4B: {
    title: 'Evaluation and Recommendation of Pharmacopoeial Texts',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.4.1', '3.2.P.5.1'],
    description: 'Guidance on use of pharmacopoeial methods across ICH regions',
  },
  Q5A: {
    title: 'Viral Safety Evaluation of Biotechnology Products',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.A.2'],
    description: 'Recommendations for viral safety evaluation of biotech products',
  },
  Q5B: {
    title: 'Quality of Biotechnological Products: Analysis of the Expression Construct',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.2.6'],
    description: 'Guidance on characterizing expression constructs in biotech products',
  },
  Q5C: {
    title: 'Quality of Biotechnological Products: Stability Testing',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.7', '3.2.P.8'],
    description: 'Stability testing recommendations for biotech products',
  },
  Q5D: {
    title: 'Derivation and Characterisation of Cell Substrates',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.2.3'],
    description: 'Guidance on characterizing cell substrates used in production',
  },
  Q5E: {
    title: 'Comparability of Biotechnological/Biological Products',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.2.6', '3.2.P.2.3'],
    description: 'Guidance on demonstrating comparability after manufacturing changes',
  },
  Q6A: {
    title:
      'Specifications: Test Procedures and Acceptance Criteria for New Drug Substances and Products',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.4', '3.2.P.5'],
    description: 'Guidance on setting specifications for new drug substances and products',
  },
  Q6B: {
    title:
      'Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.4', '3.2.P.5'],
    description: 'Guidance on setting specifications for biotech products',
  },
  Q7: {
    title: 'Good Manufacturing Practice Guide for Active Pharmaceutical Ingredients',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.2.1'],
    description: 'GMP guidance for API manufacturing',
  },
  Q8: {
    title: 'Pharmaceutical Development',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.P.2'],
    description: 'Guidance on pharmaceutical development using Quality by Design principles',
  },
  Q9: {
    title: 'Quality Risk Management',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.P.2', '3.2.P.3'],
    description: 'Guidance on quality risk management approaches',
  },
  Q10: {
    title: 'Pharmaceutical Quality System',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.2', '3.2.P.3'],
    description: 'Framework for effective quality management systems',
  },
  Q11: {
    title: 'Development and Manufacture of Drug Substances',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S.2'],
    description: 'Guidance on development and manufacturing of drug substances',
  },
  Q12: {
    title:
      'Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management',
    url: 'https://ich.org/page/quality-guidelines',
    sections: ['3.2.S', '3.2.P'],
    description: 'Framework for management of post-approval CMC changes',
  },

  // Safety Guidelines
  S1A: {
    title: 'Guideline on the Need for Carcinogenicity Studies of Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.4'],
    description: 'Guidance on when carcinogenicity studies are needed',
  },
  S1B: {
    title: 'Testing for Carcinogenicity of Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.4'],
    description: 'Recommendations for carcinogenicity testing approaches',
  },
  S1C: {
    title: 'Dose Selection for Carcinogenicity Studies of Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.4'],
    description: 'Guidance on dose selection for carcinogenicity studies',
  },
  S2: {
    title: 'Guidance on Genotoxicity Testing and Data Interpretation for Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.3'],
    description: 'Recommendations for genotoxicity testing strategy',
  },
  S3A: {
    title:
      'Note for Guidance on Toxicokinetics: Assessment of Systemic Exposure in Toxicity Studies',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.2', '4.2.3'],
    description: 'Guidance on toxicokinetic evaluation within toxicity studies',
  },
  S3B: {
    title: 'Pharmacokinetics: Guidance for Repeated Dose Tissue Distribution Studies',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.2'],
    description: 'Recommendations for tissue distribution studies',
  },
  S4: {
    title: 'Duration of Chronic Toxicity Testing in Animals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.2'],
    description: 'Guidance on duration of chronic toxicity studies',
  },
  S5: {
    title: 'Detection of Toxicity to Reproduction for Human Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.5'],
    description: 'Recommendations for reproductive toxicity testing',
  },
  S6: {
    title: 'Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2'],
    description: 'Guidance on nonclinical testing of biotech products',
  },
  S7A: {
    title: 'Safety Pharmacology Studies for Human Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.1.3'],
    description: 'Guidance on core battery of safety pharmacology studies',
  },
  S7B: {
    title:
      'The Non-clinical Evaluation of the Potential for Delayed Ventricular Repolarization (QT Interval Prolongation) by Human Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.1.3'],
    description: 'Guidance on assessing QT prolongation risk in nonclinical studies',
  },
  S8: {
    title: 'Immunotoxicity Studies for Human Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.7.2'],
    description: 'Recommendations for immunotoxicity evaluation',
  },
  S9: {
    title: 'Nonclinical Evaluation for Anticancer Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2'],
    description: 'Guidance on nonclinical testing of anticancer drugs',
  },
  S10: {
    title: 'Photosafety Evaluation of Pharmaceuticals',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.7'],
    description: 'Recommendations for photosafety assessment',
  },
  S11: {
    title: 'Nonclinical Safety Testing in Support of Development of Paediatric Medicines',
    url: 'https://ich.org/page/safety-guidelines',
    sections: ['4.2.3.5.4'],
    description: 'Guidance on juvenile animal studies for pediatric medicines',
  },

  // Efficacy Guidelines
  E1: {
    title: 'The Extent of Population Exposure to Assess Clinical Safety',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Recommendations for patient exposure to support safety evaluation',
  },
  E2A: {
    title: 'Clinical Safety Data Management: Definitions and Standards for Expedited Reporting',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Guidance on adverse event reporting during clinical trials',
  },
  E2B: {
    title:
      'Clinical Safety Data Management: Data Elements for Transmission of Individual Case Safety Reports',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Specifications for electronic transmission of safety reports',
  },
  E2C: {
    title: 'Periodic Benefit-Risk Evaluation Report',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.6'],
    description: 'Guidance on periodic safety update reports',
  },
  E2D: {
    title: 'Post-approval Safety Data Management',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.6'],
    description: 'Recommendations for postmarketing safety data handling',
  },
  E2F: {
    title: 'Development Safety Update Report',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Guidance on annual safety reports during development',
  },
  E3: {
    title: 'Structure and Content of Clinical Study Reports',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Detailed guidance on format and content of clinical study reports',
  },
  E4: {
    title: 'Dose-Response Information to Support Drug Registration',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5', '2.7.3'],
    description: 'Guidance on dose-response studies and analysis',
  },
  E5: {
    title: 'Ethnic Factors in the Acceptability of Foreign Clinical Data',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5.3'],
    description: 'Framework for evaluating foreign clinical data for registration',
  },
  E6: {
    title: 'Good Clinical Practice',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Standards for designing, conducting, and reporting clinical trials',
  },
  E7: {
    title: 'Studies in Support of Special Populations: Geriatrics',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5', '2.7.3'],
    description: 'Guidance on clinical studies in geriatric populations',
  },
  E8: {
    title: 'General Considerations for Clinical Trials',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Basic principles for clinical trials',
  },
  E9: {
    title: 'Statistical Principles for Clinical Trials',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5.3', '2.7.3'],
    description: 'Statistical considerations for design, conduct, and analysis of clinical trials',
  },
  E10: {
    title: 'Choice of Control Group and Related Issues in Clinical Trials',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5', '2.5'],
    description: 'Guidance on control group selection for clinical trials',
  },
  E11: {
    title: 'Clinical Investigation of Medicinal Products in the Pediatric Population',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Special considerations for pediatric clinical studies',
  },
  E12: {
    title: 'Principles for Clinical Evaluation of New Antihypertensive Drugs',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Specific recommendations for antihypertensive drug development',
  },
  E14: {
    title:
      'Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential for Non-Antiarrhythmic Drugs',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.4'],
    description: 'Guidance on clinical QT studies',
  },
  E15: {
    title:
      'Definitions for Genomic Biomarkers, Pharmacogenomics, Pharmacogenetics, Genomic Data and Sample Coding Categories',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Standardized terminology for genomic biomarkers',
  },
  E16: {
    title:
      'Biomarkers Related to Drug or Biotechnology Product Development: Context, Structure and Format of Qualification Submissions',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Guidance on biomarker qualification submissions',
  },
  E17: {
    title: 'General Principles for Planning and Design of Multi-Regional Clinical Trials',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Planning and design of multi-regional clinical trials',
  },
  E18: {
    title: 'Genomic Sampling and Management of Genomic Data',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Collection, storage, and handling of genomic samples and data',
  },
  E19: {
    title: 'Optimization of Safety Data Collection',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5', '5.3.6'],
    description: 'Selective approach to safety data collection in late-stage clinical trials',
  },
  E20: {
    title: 'Adaptive Clinical Trials',
    url: 'https://ich.org/page/efficacy-guidelines',
    sections: ['5.3.5'],
    description: 'Guidance on adaptive clinical trial designs',
  },

  // Multidisciplinary Guidelines
  M1: {
    title: 'Medical Dictionary for Regulatory Activities (MedDRA)',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['2.7.4', '5.3.5'],
    description: 'Standardized medical terminology for regulatory activities',
  },
  M2: {
    title: 'Electronic Standards for Transmission of Regulatory Information',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['1.1'],
    description: 'Electronic standards for regulatory information',
  },
  M3: {
    title:
      'Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization for Pharmaceuticals',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['4.2', '2.4'],
    description: 'Guidance on timing of nonclinical studies relative to clinical development',
  },
  M4: {
    title: 'The Common Technical Document',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['1.1', '2.1'],
    description: 'Structure and organization of CTD for marketing applications',
  },
  M5: {
    title: 'Data Elements and Standards for Drug Dictionaries',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['2.3', '2.7'],
    description: 'Standards for drug dictionaries to support medicinal product identification',
  },
  M6: {
    title: 'Gene Therapy',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['3.2', '4.2', '5.3'],
    description: 'Development and evaluation of gene therapy products',
  },
  M7: {
    title:
      'Assessment and Control of DNA Reactive (Mutagenic) Impurities in Pharmaceuticals to Limit Potential Carcinogenic Risk',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['3.2.S.3.2', '3.2.P.5.5'],
    description: 'Guidance on mutagenic impurities assessment and control',
  },
  M8: {
    title: 'Electronic Common Technical Document (eCTD)',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['1.1'],
    description: 'Electronic specification for CTD submissions',
  },
  M9: {
    title: 'Biopharmaceutics Classification System-based Biowaivers',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['3.2.P.2', '5.3.1'],
    description: 'Framework for biowaivers based on BCS',
  },
  M10: {
    title: 'Bioanalytical Method Validation and Study Sample Analysis',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['4.2.2.1', '5.3.1.4'],
    description: 'Validation of bioanalytical methods for nonclinical and clinical studies',
  },
  M11: {
    title: 'Clinical electronic Structured Harmonized Protocol (CeSHarP)',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['5.3.5'],
    description: 'Standardized structure and format for clinical protocols',
  },
  M12: {
    title: 'Drug Interaction Studies',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['4.2.2.6', '5.3.3.4'],
    description: 'Evaluation of drug-drug interactions in drug development',
  },
  M13: {
    title: 'Bioequivalence for Immediate-Release Solid Oral Dosage Forms',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['5.3.1.2'],
    description: 'Harmonized approach to bioequivalence studies',
  },
  M14: {
    title: 'Pediatric Extrapolation',
    url: 'https://ich.org/page/multidisciplinary-guidelines',
    sections: ['5.3.5.3'],
    description: 'Framework for extrapolating efficacy data to pediatric populations',
  },
};

/**
 * Get relevant ICH guidelines for a CTD section
 * @param {string} ctdSection - The CTD section ID (e.g., "3.2.S.2.1")
 * @returns {Array} Array of relevant guidelines with their descriptions
 */
export function mapCTDToGuidelines(ctdSection) {
  if (!ctdSection) return [];

  const relevantGuidelines = [];

  // First, exact match
  Object.keys(ichGuidelines).forEach(key => {
    const guideline = ichGuidelines[key];
    if (guideline.sections.includes(ctdSection)) {
      relevantGuidelines.push({
        id: key,
        title: `${key} - ${guideline.title}`,
        description: guideline.description,
        url: guideline.url,
      });
    }
  });

  // Then, parent section matches (e.g., for 3.2.S.2.1, check guidelines for 3.2.S.2)
  if (ctdSection.includes('.')) {
    const parentSection = ctdSection.split('.').slice(0, -1).join('.');
    Object.keys(ichGuidelines).forEach(key => {
      const guideline = ichGuidelines[key];
      // Only add if not already added
      if (
        guideline.sections.includes(parentSection) &&
        !relevantGuidelines.some(g => g.id === key)
      ) {
        relevantGuidelines.push({
          id: key,
          title: `${key} - ${guideline.title}`,
          description: guideline.description,
          url: guideline.url,
        });
      }
    });

    // For very specific sections, check two levels up (e.g., for 3.2.S.2.1.1, also check guidelines for 3.2.S.2)
    if (parentSection.includes('.')) {
      const grandparentSection = parentSection.split('.').slice(0, -1).join('.');
      Object.keys(ichGuidelines).forEach(key => {
        const guideline = ichGuidelines[key];
        // Only add if not already added
        if (
          guideline.sections.includes(grandparentSection) &&
          !relevantGuidelines.some(g => g.id === key)
        ) {
          relevantGuidelines.push({
            id: key,
            title: `${key} - ${guideline.title}`,
            description: guideline.description,
            url: guideline.url,
          });
        }
      });
    }
  }

  // Finally, check for module-level guidelines
  if (ctdSection.match(/^[1-5]/)) {
    const moduleNum = ctdSection.charAt(0);
    Object.keys(ichGuidelines).forEach(key => {
      const guideline = ichGuidelines[key];
      // Only add if not already added
      if (key === `M${moduleNum}` && !relevantGuidelines.some(g => g.id === key)) {
        relevantGuidelines.push({
          id: key,
          title: `${key} - ${guideline.title}`,
          description: guideline.description,
          url: guideline.url,
        });
      }
    });
  }

  return relevantGuidelines;
}

/**
 * Get all ICH guidelines
 * @returns {Object} Object containing all ICH guidelines
 */
export function getAllGuidelines() {
  return ichGuidelines;
}

/**
 * Search ICH guidelines based on keyword
 * @param {string} keyword - The keyword to search for
 * @returns {Array} Array of matching guidelines
 */
export function searchGuidelines(keyword) {
  if (!keyword) return [];

  const lowercaseKeyword = keyword.toLowerCase();
  const results = [];

  Object.keys(ichGuidelines).forEach(key => {
    const guideline = ichGuidelines[key];
    if (
      key.toLowerCase().includes(lowercaseKeyword) ||
      guideline.title.toLowerCase().includes(lowercaseKeyword) ||
      guideline.description.toLowerCase().includes(lowercaseKeyword)
    ) {
      results.push({
        id: key,
        title: `${key} - ${guideline.title}`,
        description: guideline.description,
        url: guideline.url,
        sections: guideline.sections,
      });
    }
  });

  return results;
}

/**
 * Get guidelines by category
 * @param {string} category - The category (Q, S, E, M)
 * @returns {Array} Array of guidelines in the specified category
 */
export function getGuidelinesByCategory(category) {
  if (!category || !['Q', 'S', 'E', 'M'].includes(category)) return [];

  const results = [];

  Object.keys(ichGuidelines).forEach(key => {
    if (key.startsWith(category)) {
      const guideline = ichGuidelines[key];
      results.push({
        id: key,
        title: `${key} - ${guideline.title}`,
        description: guideline.description,
        url: guideline.url,
        sections: guideline.sections,
      });
    }
  });

  return results;
}

export default {
  mapCTDToGuidelines,
  getAllGuidelines,
  searchGuidelines,
  getGuidelinesByCategory,
};
