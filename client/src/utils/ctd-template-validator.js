/**
 * CTD Template Validator
 *
 * This utility provides functions for validating Common Technical Document (CTD)
 * templates against ICH specifications. It includes functions for structural
 * validation, content requirements, and template completeness.
 */

// Full CTD structure definition following ICH guidelines
const ctdStructure = {
  module1: {
    title: 'Administrative Information and Prescribing Information',
    description: 'Region-specific administrative documents for regulatory authorities',
    sections: {
      1.1: {
        title: 'Comprehensive Table of Contents',
        required: true,
        description: 'Complete table of contents for all modules',
      },
      1.2: {
        title: 'Cover Letter',
        required: true,
        description: 'Introductory cover letter to regulatory authority',
      },
      1.3: {
        title: 'Application Form',
        required: true,
        description: 'Region-specific application forms',
      },
      1.4: {
        title: 'Product Information',
        required: true,
        description: 'Labeling and packaging information',
      },
      1.5: {
        title: 'Administrative Information',
        required: true,
        description: 'Regional administrative information',
      },
      1.6: {
        title: 'References',
        required: false,
        description: 'References to previous applications and correspondence',
      },
    },
    regionSpecific: true,
  },
  module2: {
    title: 'Common Technical Document Summaries',
    description: 'Overview and summary of modules 3 to 5',
    sections: {
      2.1: {
        title: 'CTD Table of Contents',
        required: true,
        description: 'Table of contents for modules 2-5',
      },
      2.2: {
        title: 'CTD Introduction',
        required: true,
        description: 'Introduction to the pharmaceutical product',
      },
      2.3: {
        title: 'Quality Overall Summary',
        required: true,
        description: 'Summary of module 3 content',
        subsections: {
          '2.3.S': {
            title: 'Drug Substance',
            required: true,
            description: 'Summary of drug substance information',
          },
          '2.3.P': {
            title: 'Drug Product',
            required: true,
            description: 'Summary of drug product information',
          },
          '2.3.A': {
            title: 'Appendices',
            required: false,
            description: 'Appendices to the quality overall summary',
          },
          '2.3.R': {
            title: 'Regional Information',
            required: false,
            description: 'Region-specific quality information',
          },
        },
      },
      2.4: {
        title: 'Nonclinical Overview',
        required: true,
        description: 'Overview of nonclinical evaluation',
      },
      2.5: {
        title: 'Clinical Overview',
        required: true,
        description: 'Overview of clinical studies',
        subsections: {
          '2.5.1': {
            title: 'Product Development Rationale',
            required: true,
            description: 'Rationale for the development of the pharmaceutical',
          },
          '2.5.2': {
            title: 'Overview of Biopharmaceutics',
            required: true,
            description: 'Overview of biopharmaceutical studies',
          },
          '2.5.3': {
            title: 'Overview of Clinical Pharmacology',
            required: true,
            description: 'Overview of clinical pharmacology studies',
          },
          '2.5.4': {
            title: 'Overview of Efficacy',
            required: true,
            description: 'Overview of clinical efficacy',
          },
          '2.5.5': {
            title: 'Overview of Safety',
            required: true,
            description: 'Overview of clinical safety',
          },
          '2.5.6': {
            title: 'Benefits and Risks Conclusions',
            required: true,
            description: 'Assessment of benefits and risks',
          },
        },
      },
      2.6: {
        title: 'Nonclinical Written and Tabulated Summaries',
        required: true,
        description: 'Detailed summaries of nonclinical information',
        subsections: {
          '2.6.1': {
            title: 'Introduction',
            required: true,
            description: 'Introduction to nonclinical summaries',
          },
          '2.6.2': {
            title: 'Pharmacology Written Summary',
            required: true,
            description: 'Summary of pharmacology studies',
          },
          '2.6.3': {
            title: 'Pharmacology Tabulated Summary',
            required: true,
            description: 'Tabulated data of pharmacology studies',
          },
          '2.6.4': {
            title: 'Pharmacokinetics Written Summary',
            required: true,
            description: 'Summary of pharmacokinetic studies',
          },
          '2.6.5': {
            title: 'Pharmacokinetics Tabulated Summary',
            required: true,
            description: 'Tabulated data of pharmacokinetic studies',
          },
          '2.6.6': {
            title: 'Toxicology Written Summary',
            required: true,
            description: 'Summary of toxicology studies',
          },
          '2.6.7': {
            title: 'Toxicology Tabulated Summary',
            required: true,
            description: 'Tabulated data of toxicology studies',
          },
        },
      },
      2.7: {
        title: 'Clinical Summary',
        required: true,
        description: 'Detailed summary of clinical information',
        subsections: {
          '2.7.1': {
            title: 'Summary of Biopharmaceutic Studies and Analytical Methods',
            required: true,
            description: 'Summary of biopharmaceutic and analytical studies',
          },
          '2.7.2': {
            title: 'Summary of Clinical Pharmacology Studies',
            required: true,
            description: 'Summary of clinical pharmacology studies',
          },
          '2.7.3': {
            title: 'Summary of Clinical Efficacy',
            required: true,
            description: 'Summary of clinical efficacy',
          },
          '2.7.4': {
            title: 'Summary of Clinical Safety',
            required: true,
            description: 'Summary of clinical safety',
          },
          '2.7.5': {
            title: 'Literature References',
            required: false,
            description: 'References to literature used in clinical summary',
          },
          '2.7.6': {
            title: 'Synopsis of Individual Studies',
            required: true,
            description: 'Synopses of individual clinical studies',
          },
        },
      },
    },
  },
  module3: {
    title: 'Quality',
    description: 'Chemical, pharmaceutical, and biological documentation',
    sections: {
      3.1: {
        title: 'Table of Contents of Module 3',
        required: true,
        description: 'Table of contents for module 3',
      },
      3.2: {
        title: 'Body of Data',
        required: true,
        description: 'Main quality data',
        subsections: {
          '3.2.S': {
            title: 'Drug Substance',
            required: true,
            description: 'Information on drug substance',
            subsections: {
              '3.2.S.1': {
                title: 'General Information',
                required: true,
                description: 'General information about drug substance',
              },
              '3.2.S.2': {
                title: 'Manufacture',
                required: true,
                description: 'Manufacturing process for drug substance',
              },
              '3.2.S.3': {
                title: 'Characterization',
                required: true,
                description: 'Characterization of drug substance',
              },
              '3.2.S.4': {
                title: 'Control of Drug Substance',
                required: true,
                description: 'Quality control of drug substance',
              },
              '3.2.S.5': {
                title: 'Reference Standards or Materials',
                required: true,
                description: 'Reference standards for drug substance',
              },
              '3.2.S.6': {
                title: 'Container Closure System',
                required: true,
                description: 'Container closure system for drug substance',
              },
              '3.2.S.7': {
                title: 'Stability',
                required: true,
                description: 'Stability data for drug substance',
              },
            },
          },
          '3.2.P': {
            title: 'Drug Product',
            required: true,
            description: 'Information on drug product',
            subsections: {
              '3.2.P.1': {
                title: 'Description and Composition of the Drug Product',
                required: true,
                description: 'Description and composition of drug product',
              },
              '3.2.P.2': {
                title: 'Pharmaceutical Development',
                required: true,
                description: 'Development of drug product formulation',
              },
              '3.2.P.3': {
                title: 'Manufacture',
                required: true,
                description: 'Manufacturing process for drug product',
              },
              '3.2.P.4': {
                title: 'Control of Excipients',
                required: true,
                description: 'Quality control of excipients',
              },
              '3.2.P.5': {
                title: 'Control of Drug Product',
                required: true,
                description: 'Quality control of drug product',
              },
              '3.2.P.6': {
                title: 'Reference Standards or Materials',
                required: true,
                description: 'Reference standards for drug product',
              },
              '3.2.P.7': {
                title: 'Container Closure System',
                required: true,
                description: 'Container closure system for drug product',
              },
              '3.2.P.8': {
                title: 'Stability',
                required: true,
                description: 'Stability data for drug product',
              },
            },
          },
          '3.2.A': {
            title: 'Appendices',
            required: false,
            description: 'Appendices to quality data',
            subsections: {
              '3.2.A.1': {
                title: 'Facilities and Equipment',
                required: false,
                description: 'Information on facilities and equipment',
              },
              '3.2.A.2': {
                title: 'Adventitious Agents Safety Evaluation',
                required: false,
                description: 'Evaluation of adventitious agents safety',
              },
              '3.2.A.3': {
                title: 'Excipients',
                required: false,
                description: 'Information on novel excipients',
              },
            },
          },
          '3.2.R': {
            title: 'Regional Information',
            required: false,
            description: 'Region-specific quality information',
          },
        },
      },
      3.3: {
        title: 'Literature References',
        required: false,
        description: 'References to literature used in quality module',
      },
    },
  },
  module4: {
    title: 'Nonclinical Study Reports',
    description: 'Pharmacology, pharmacokinetics, and toxicology study reports',
    sections: {
      4.1: {
        title: 'Table of Contents of Module 4',
        required: true,
        description: 'Table of contents for module 4',
      },
      4.2: {
        title: 'Study Reports',
        required: true,
        description: 'Nonclinical study reports',
        subsections: {
          '4.2.1': {
            title: 'Pharmacology',
            required: true,
            description: 'Pharmacology studies',
            subsections: {
              '4.2.1.1': {
                title: 'Primary Pharmacodynamics',
                required: true,
                description: 'Primary pharmacodynamics studies',
              },
              '4.2.1.2': {
                title: 'Secondary Pharmacodynamics',
                required: false,
                description: 'Secondary pharmacodynamics studies',
              },
              '4.2.1.3': {
                title: 'Safety Pharmacology',
                required: true,
                description: 'Safety pharmacology studies',
              },
              '4.2.1.4': {
                title: 'Pharmacodynamic Drug Interactions',
                required: false,
                description: 'Studies on pharmacodynamic drug interactions',
              },
            },
          },
          '4.2.2': {
            title: 'Pharmacokinetics',
            required: true,
            description: 'Pharmacokinetic studies',
            subsections: {
              '4.2.2.1': {
                title: 'Analytical Methods and Validation Reports',
                required: true,
                description: 'Analytical methods used in pharmacokinetic studies',
              },
              '4.2.2.2': {
                title: 'Absorption',
                required: true,
                description: 'Absorption studies',
              },
              '4.2.2.3': {
                title: 'Distribution',
                required: true,
                description: 'Distribution studies',
              },
              '4.2.2.4': {
                title: 'Metabolism',
                required: true,
                description: 'Metabolism studies',
              },
              '4.2.2.5': {
                title: 'Excretion',
                required: true,
                description: 'Excretion studies',
              },
              '4.2.2.6': {
                title: 'Pharmacokinetic Drug Interactions',
                required: false,
                description: 'Studies on pharmacokinetic drug interactions',
              },
              '4.2.2.7': {
                title: 'Other Pharmacokinetic Studies',
                required: false,
                description: 'Other pharmacokinetic studies',
              },
            },
          },
          '4.2.3': {
            title: 'Toxicology',
            required: true,
            description: 'Toxicology studies',
            subsections: {
              '4.2.3.1': {
                title: 'Single-Dose Toxicity',
                required: true,
                description: 'Single-dose toxicity studies',
              },
              '4.2.3.2': {
                title: 'Repeat-Dose Toxicity',
                required: true,
                description: 'Repeat-dose toxicity studies',
              },
              '4.2.3.3': {
                title: 'Genotoxicity',
                required: true,
                description: 'Genotoxicity studies',
                subsections: {
                  '4.2.3.3.1': {
                    title: 'In vitro',
                    required: true,
                    description: 'In vitro genotoxicity studies',
                  },
                  '4.2.3.3.2': {
                    title: 'In vivo',
                    required: true,
                    description: 'In vivo genotoxicity studies',
                  },
                },
              },
              '4.2.3.4': {
                title: 'Carcinogenicity',
                required: false,
                description: 'Carcinogenicity studies',
                subsections: {
                  '4.2.3.4.1': {
                    title: 'Long-term Studies',
                    required: false,
                    description: 'Long-term carcinogenicity studies',
                  },
                  '4.2.3.4.2': {
                    title: 'Short- or Medium-term Studies',
                    required: false,
                    description: 'Short- or medium-term carcinogenicity studies',
                  },
                  '4.2.3.4.3': {
                    title: 'Other Studies',
                    required: false,
                    description: 'Other carcinogenicity studies',
                  },
                },
              },
              '4.2.3.5': {
                title: 'Reproductive and Developmental Toxicity',
                required: true,
                description: 'Reproductive and developmental toxicity studies',
                subsections: {
                  '4.2.3.5.1': {
                    title: 'Fertility and Early Embryonic Development',
                    required: true,
                    description: 'Fertility and early embryonic development studies',
                  },
                  '4.2.3.5.2': {
                    title: 'Embryo-fetal Development',
                    required: true,
                    description: 'Embryo-fetal development studies',
                  },
                  '4.2.3.5.3': {
                    title: 'Prenatal and Postnatal Development, Including Maternal Function',
                    required: true,
                    description: 'Prenatal and postnatal development studies',
                  },
                  '4.2.3.5.4': {
                    title: 'Studies in Which the Offspring Are Dosed and/or Further Evaluated',
                    required: false,
                    description: 'Studies with dosed offspring',
                  },
                },
              },
              '4.2.3.6': {
                title: 'Local Tolerance',
                required: false,
                description: 'Local tolerance studies',
              },
              '4.2.3.7': {
                title: 'Other Toxicity Studies',
                required: false,
                description: 'Other toxicity studies',
                subsections: {
                  '4.2.3.7.1': {
                    title: 'Antigenicity',
                    required: false,
                    description: 'Antigenicity studies',
                  },
                  '4.2.3.7.2': {
                    title: 'Immunotoxicity',
                    required: false,
                    description: 'Immunotoxicity studies',
                  },
                  '4.2.3.7.3': {
                    title: 'Mechanistic Studies',
                    required: false,
                    description: 'Mechanistic studies',
                  },
                  '4.2.3.7.4': {
                    title: 'Dependence',
                    required: false,
                    description: 'Dependence studies',
                  },
                  '4.2.3.7.5': {
                    title: 'Metabolites',
                    required: false,
                    description: 'Studies on metabolites',
                  },
                  '4.2.3.7.6': {
                    title: 'Impurities',
                    required: false,
                    description: 'Studies on impurities',
                  },
                  '4.2.3.7.7': {
                    title: 'Other',
                    required: false,
                    description: 'Other toxicity studies',
                  },
                },
              },
            },
          },
        },
      },
      4.3: {
        title: 'Literature References',
        required: false,
        description: 'References to literature used in nonclinical module',
      },
    },
  },
  module5: {
    title: 'Clinical Study Reports',
    description: 'Clinical study reports and related information',
    sections: {
      5.1: {
        title: 'Table of Contents of Module 5',
        required: true,
        description: 'Table of contents for module 5',
      },
      5.2: {
        title: 'Tabular Listing of All Clinical Studies',
        required: true,
        description: 'Tabular listing of all clinical studies',
      },
      5.3: {
        title: 'Clinical Study Reports',
        required: true,
        description: 'Reports of clinical studies',
        subsections: {
          '5.3.1': {
            title: 'Reports of Biopharmaceutic Studies',
            required: true,
            description: 'Biopharmaceutic study reports',
            subsections: {
              '5.3.1.1': {
                title: 'Bioavailability (BA) Study Reports',
                required: false,
                description: 'Bioavailability study reports',
              },
              '5.3.1.2': {
                title: 'Comparative BA and Bioequivalence (BE) Study Reports',
                required: false,
                description: 'Comparative BA and BE study reports',
              },
              '5.3.1.3': {
                title: 'In Vitro-In Vivo Correlation Study Reports',
                required: false,
                description: 'In vitro-in vivo correlation study reports',
              },
              '5.3.1.4': {
                title: 'Reports of Bioanalytical and Analytical Methods for Human Studies',
                required: true,
                description: 'Bioanalytical and analytical method reports',
              },
            },
          },
          '5.3.2': {
            title: 'Reports of Studies Pertinent to Pharmacokinetics Using Human Biomaterials',
            required: true,
            description: 'PK studies using human biomaterials',
            subsections: {
              '5.3.2.1': {
                title: 'Plasma Protein Binding Study Reports',
                required: false,
                description: 'Plasma protein binding study reports',
              },
              '5.3.2.2': {
                title: 'Reports of Hepatic Metabolism and Drug Interaction Studies',
                required: false,
                description: 'Hepatic metabolism and drug interaction studies',
              },
              '5.3.2.3': {
                title: 'Studies Using Other Human Biomaterials',
                required: false,
                description: 'Studies using other human biomaterials',
              },
            },
          },
          '5.3.3': {
            title: 'Reports of Human Pharmacokinetic (PK) Studies',
            required: true,
            description: 'Human PK study reports',
            subsections: {
              '5.3.3.1': {
                title: 'Healthy Subject PK and Initial Tolerability Study Reports',
                required: true,
                description: 'Healthy subject PK and tolerability studies',
              },
              '5.3.3.2': {
                title: 'Patient PK and Initial Tolerability Study Reports',
                required: false,
                description: 'Patient PK and tolerability studies',
              },
              '5.3.3.3': {
                title: 'Intrinsic Factor PK Study Reports',
                required: false,
                description: 'Intrinsic factor PK studies',
              },
              '5.3.3.4': {
                title: 'Extrinsic Factor PK Study Reports',
                required: false,
                description: 'Extrinsic factor PK studies',
              },
              '5.3.3.5': {
                title: 'Population PK Study Reports',
                required: false,
                description: 'Population PK studies',
              },
            },
          },
          '5.3.4': {
            title: 'Reports of Human Pharmacodynamic (PD) Studies',
            required: true,
            description: 'Human PD study reports',
            subsections: {
              '5.3.4.1': {
                title: 'Healthy Subject PD and PK/PD Study Reports',
                required: false,
                description: 'Healthy subject PD and PK/PD studies',
              },
              '5.3.4.2': {
                title: 'Patient PD and PK/PD Study Reports',
                required: true,
                description: 'Patient PD and PK/PD studies',
              },
            },
          },
          '5.3.5': {
            title: 'Reports of Efficacy and Safety Studies',
            required: true,
            description: 'Efficacy and safety study reports',
            subsections: {
              '5.3.5.1': {
                title:
                  'Study Reports of Controlled Clinical Studies Pertinent to the Claimed Indication',
                required: true,
                description: 'Controlled clinical studies for the claimed indication',
              },
              '5.3.5.2': {
                title: 'Study Reports of Uncontrolled Clinical Studies',
                required: false,
                description: 'Uncontrolled clinical studies',
              },
              '5.3.5.3': {
                title: 'Reports of Analyses of Data from More than One Study',
                required: false,
                description: 'Analyses of data from multiple studies',
              },
              '5.3.5.4': {
                title: 'Other Clinical Study Reports',
                required: false,
                description: 'Other clinical study reports',
              },
            },
          },
          '5.3.6': {
            title: 'Reports of Postmarketing Experience',
            required: false,
            description: 'Postmarketing experience reports',
          },
          '5.3.7': {
            title: 'Case Report Forms and Individual Patient Listings',
            required: false,
            description: 'Case report forms and patient listings',
          },
        },
      },
      5.4: {
        title: 'Literature References',
        required: false,
        description: 'References to literature used in clinical module',
      },
    },
  },
};

/**
 * Get the complete CTD structure
 * @returns {Object} The complete CTD structure
 */
export function getFullCTDStructure() {
  return ctdStructure;
}

/**
 * Get a specific section from the CTD structure
 * @param {string} sectionId - The section ID (e.g., "3.2.S.2.1")
 * @returns {Object|null} The section object or null if not found
 */
export function getCTDSection(sectionId) {
  if (!sectionId) return null;

  // Extract the module number
  const moduleMatch = sectionId.match(/^([1-5])/);
  if (!moduleMatch) return null;

  const moduleNum = moduleMatch[1];
  const moduleId = `module${moduleNum}`;

  // If the section is just the module number, return the module
  if (sectionId === moduleNum) {
    return ctdStructure[moduleId];
  }

  // Traverse the structure to find the specified section
  let section = null;

  const findSection = (sections, targetId, path = '') => {
    if (section) return;

    Object.keys(sections).forEach(key => {
      const currentPath = path ? `${path}.${key}` : key;
      if (currentPath === sectionId || key === sectionId) {
        section = { ...sections[key], id: key };
        return;
      }

      if (sections[key].subsections) {
        findSection(sections[key].subsections, targetId, currentPath);
      }
    });
  };

  findSection(ctdStructure[moduleId].sections, sectionId);

  return section;
}

/**
 * Validate a CTD template structure
 * @param {Object} template - The template to validate
 * @param {string} moduleSection - The module section the template belongs to
 * @returns {Object} Validation result with errors and warnings
 */
export function validateCTDTemplate(template, moduleSection) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Check if the template has the required properties
  if (!template.id) {
    result.valid = false;
    result.errors.push('Template is missing ID');
  }

  if (!template.title) {
    result.valid = false;
    result.errors.push('Template is missing title');
  }

  if (!template.moduleSection) {
    result.valid = false;
    result.errors.push('Template is missing module section');
  } else if (template.moduleSection !== moduleSection) {
    result.valid = false;
    result.errors.push(
      `Template module section (${template.moduleSection}) does not match expected section (${moduleSection})`
    );
  }

  // Check that the structure is present
  if (!template.structure || typeof template.structure !== 'object') {
    result.valid = false;
    result.errors.push('Template is missing structure or structure is not an object');
  }

  // Check that sections are defined
  if (!template.sections || !Array.isArray(template.sections) || template.sections.length === 0) {
    result.valid = false;
    result.errors.push('Template is missing sections or sections is not an array');
  }

  // Get the section from CTD structure to check if all required sections are included
  const ctdSectionInfo = getCTDSection(moduleSection);

  if (ctdSectionInfo && ctdSectionInfo.subsections) {
    // Check if all required subsections are included
    const requiredSubsections = Object.keys(ctdSectionInfo.subsections).filter(
      key => ctdSectionInfo.subsections[key].required
    );

    if (template.sections) {
      const templateSectionIds = template.sections.map(s => s.id);

      requiredSubsections.forEach(requiredId => {
        if (!templateSectionIds.includes(requiredId)) {
          result.warnings.push(`Template is missing required subsection ${requiredId}`);
        }
      });
    }
  }

  return result;
}

/**
 * Get required sections for a CTD module or section
 * @param {string} moduleOrSectionId - The module or section ID
 * @returns {Array} List of required sections
 */
export function getRequiredCTDSections(moduleOrSectionId) {
  if (!moduleOrSectionId) return [];

  // If it's a module ID (e.g., "module1", "module2", etc.)
  if (moduleOrSectionId.startsWith('module')) {
    const moduleId = moduleOrSectionId;
    const requiredSections = [];

    Object.keys(ctdStructure[moduleId].sections).forEach(sectionKey => {
      const section = ctdStructure[moduleId].sections[sectionKey];
      if (section.required) {
        requiredSections.push({
          id: sectionKey,
          title: section.title,
          description: section.description,
        });
      }
    });

    return requiredSections;
  }

  // If it's a section ID (e.g., "3.2.S", "5.3.5.1", etc.)
  const section = getCTDSection(moduleOrSectionId);
  if (!section || !section.subsections) return [];

  const requiredSubsections = [];

  Object.keys(section.subsections).forEach(subSectionKey => {
    const subSection = section.subsections[subSectionKey];
    if (subSection.required) {
      requiredSubsections.push({
        id: subSectionKey,
        title: subSection.title,
        description: subSection.description,
      });
    }
  });

  return requiredSubsections;
}

/**
 * Generate a skeleton template for a CTD section
 * @param {string} sectionId - The section ID
 * @returns {Object} A skeleton template
 */
export function generateCTDTemplateSkeleton(sectionId) {
  const section = getCTDSection(sectionId);
  if (!section) return null;

  // Extract module number from section ID
  const moduleMatch = sectionId.match(/^([1-5])/);
  if (!moduleMatch) return null;

  const moduleNum = moduleMatch[1];
  const moduleId = `module${moduleNum}`;

  // Generate template sections
  const templateSections = [];

  if (section.subsections) {
    Object.keys(section.subsections).forEach(key => {
      templateSections.push({
        id: key,
        title: section.subsections[key].title,
        required: section.subsections[key].required,
      });
    });
  }

  // Generate a basic structure based on the section
  const templateStructure = {
    sections: [
      {
        title: section.title.toUpperCase(),
        content: '',
      },
    ],
  };

  // Add subsections if available
  if (section.subsections) {
    templateStructure.sections[0].subsections = Object.keys(section.subsections).map(key => ({
      title: `${key} ${section.subsections[key].title}`,
      content: '',
    }));
  }

  return {
    id: `ctd-${sectionId.toLowerCase().replace(/\./g, '-')}`,
    title: section.title,
    moduleId,
    moduleSection: sectionId,
    description: section.description || `${section.title} for CTD Module ${moduleNum}`,
    documentType: getDocumentTypeForSection(moduleNum),
    version: '1.0',
    lastUpdated: new Date().toISOString().split('T')[0],
    usageCount: 0,
    popularity: 5,
    sections: templateSections,
    structure: templateStructure,
  };
}

/**
 * Get a default document type based on module number
 * @param {string} moduleNum - The module number (1-5)
 * @returns {string} A document type
 */
function getDocumentTypeForSection(moduleNum) {
  switch (moduleNum) {
    case '1':
      return 'Administrative';
    case '2':
      return 'Summary';
    case '3':
      return 'Quality';
    case '4':
      return 'Nonclinical';
    case '5':
      return 'Clinical';
    default:
      return 'Document';
  }
}

export default {
  getFullCTDStructure,
  getCTDSection,
  validateCTDTemplate,
  getRequiredCTDSections,
  generateCTDTemplateSkeleton,
};
