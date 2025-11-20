/**
 * Regulatory Service
 *
 * This service handles regulatory requirements for different frameworks
 * and provides methods to check compliance against these requirements.
 */

/**
 * Get all required sections for a specific regulatory framework
 *
 * @param {string} framework - The regulatory framework (mdr, fda, ukca, etc.)
 * @returns {Promise<string[]>} - List of required sections for the framework
 */
const getRequiredSections = async framework => {
  // In a production environment, this would come from a database
  const frameworkSectionsMap = {
    mdr: [
      'Executive Summary',
      'Scope',
      'Device Description',
      'Equivalence Assessment',
      'Clinical Background',
      'State of the Art',
      'Clinical Data',
      'Safety',
      'Literature Review',
      'GSPR Mapping',
      'Risk Analysis',
      'Benefit-Risk',
      'PMS',
      'PMCF',
      'Conclusions',
    ],
    fda: [
      'Executive Summary',
      'Device Description',
      'Intended Use',
      'Predicate Comparison',
      'Regulatory History',
      'Clinical Data',
      'Safety & Effectiveness',
      'Literature Review',
      'Risk Analysis',
      'Labeling',
      'Conclusions',
    ],
    ukca: [
      'Executive Summary',
      'Scope',
      'Device Description',
      'Equivalence Assessment',
      'Clinical Background',
      'State of the Art',
      'Clinical Data',
      'Safety',
      'Literature Review',
      'UK Conformity Requirements',
      'Risk Analysis',
      'Benefit-Risk',
      'PMS',
      'PMCF',
      'Conclusions',
    ],
  };

  return frameworkSectionsMap[framework] || [];
};

/**
 * Get requirements for a specific regulatory framework
 *
 * @param {string} framework - The regulatory framework (mdr, fda, ukca, etc.)
 * @returns {Promise<Object>} - Requirements for the framework
 */
const getRequirements = async framework => {
  const requirementsMap = {
    mdr: {
      name: 'EU Medical Device Regulation (MDR)',
      version: '2017/745',
      sections: await getRequiredSections(framework),
      criticalSections: ['Safety', 'Clinical Data', 'GSPR Mapping'],
      references: ['MEDDEV 2.7/1 Rev 4', 'MDCG 2020-13', 'MDCG 2022-14'],
    },
    fda: {
      name: 'US FDA',
      version: '510(k) / PMA',
      sections: await getRequiredSections(framework),
      criticalSections: ['Safety & Effectiveness', 'Clinical Data', 'Predicate Comparison'],
      references: ['FDA 21 CFR Part 820', 'FDA Guidance on CERs', 'FDA Clinical Studies Guidance'],
    },
    ukca: {
      name: 'UK Conformity Assessment',
      version: 'UK MDR 2002 (as amended)',
      sections: await getRequiredSections(framework),
      criticalSections: ['Safety', 'Clinical Data', 'UK Conformity Requirements'],
      references: [
        'UK Medical Devices Regulations 2002',
        'UKCA Guidance for Medical Devices',
        'MDCG 2020-13 (adapted)',
      ],
    },
  };

  return (
    requirementsMap[framework] || {
      name: 'Unknown Framework',
      version: 'N/A',
      sections: [],
      criticalSections: [],
    }
  );
};

/**
 * Get requirements for a specific section within a framework
 *
 * @param {string} section - The section name
 * @param {string} framework - The regulatory framework
 * @returns {Promise<Object>} - Requirements for the section
 */
const getSectionRequirements = async (section, framework) => {
  // In a real implementation, this would be fetched from a database
  // This is a simplified version for demonstration purposes

  // Common requirements across frameworks
  const commonRequirements = {
    'Clinical Data': {
      description: 'Analysis of clinical investigation data',
      elements: [
        'Summary of clinical investigations',
        'Analysis of clinical outcomes',
        'Discussion of clinical significance',
        'Identification of any bias or confounding factors',
      ],
      regulatoryReferences: {
        mdr: 'Annex XIV, Part A MDR 2017/745',
        fda: '21 CFR 860.7',
        ukca: 'UK MDR Schedule 3, Part II',
      },
    },
    Safety: {
      description: 'Evaluation of device safety profile',
      elements: [
        'Summary of safety-related events',
        'Analysis of adverse events',
        'Risk quantification',
        'Comparison to state of the art',
      ],
      regulatoryReferences: {
        mdr: 'Annex I, Chapter I MDR 2017/745',
        fda: '21 CFR 860.7(d)(1)',
        ukca: 'UK MDR Schedule 1, Part I',
      },
    },
    'Literature Review': {
      description: 'Systematic review of relevant scientific literature',
      elements: [
        'Search methodology',
        'Inclusion/exclusion criteria',
        'Literature appraisal',
        'Data extraction and analysis',
      ],
      regulatoryReferences: {
        mdr: 'MEDDEV 2.7/1 Rev 4, Section 8',
        fda: 'FDA Guidance on Literature Reviews',
        ukca: 'MHRA Guidance on Literature Reviews',
      },
    },
  };

  // Framework-specific requirements
  const frameworkSpecificRequirements = {
    mdr: {
      'GSPR Mapping': {
        description: 'Mapping of evidence to General Safety and Performance Requirements',
        elements: [
          'Comprehensive GSPR list',
          'Evidence for each applicable requirement',
          'Justification for non-applicable requirements',
          'Gap analysis and mitigation',
        ],
        regulatoryReferences: {
          mdr: 'Annex I MDR 2017/745',
        },
      },
    },
    fda: {
      'Predicate Comparison': {
        description: 'Substantial equivalence comparison to predicate device',
        elements: [
          'Identification of predicate device',
          'Comparative analysis of technological characteristics',
          'Comparative analysis of performance',
          'Discussion of differences and impact',
        ],
        regulatoryReferences: {
          fda: '21 CFR 807.92(a)(3)',
        },
      },
    },
    ukca: {
      'UK Conformity Requirements': {
        description: 'Compliance with UK-specific regulations',
        elements: [
          'UK Essential Requirements mapping',
          'UK-specific regulatory considerations',
          'Brexit-related impacts assessment',
          'UKCA marking requirements',
        ],
        regulatoryReferences: {
          ukca: 'UK Medical Devices Regulations 2002 (as amended)',
        },
      },
    },
  };

  // Combine common and framework-specific requirements
  if (commonRequirements[section]) {
    return commonRequirements[section];
  } else if (
    frameworkSpecificRequirements[framework] &&
    frameworkSpecificRequirements[framework][section]
  ) {
    return frameworkSpecificRequirements[framework][section];
  } else {
    return {
      description: `Requirements for ${section}`,
      elements: ['No specific requirements defined'],
      regulatoryReferences: {},
    };
  }
};

module.exports = {
  getRequiredSections,
  getRequirements,
  getSectionRequirements,
};
