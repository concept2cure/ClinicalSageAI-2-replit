/**
 * eCTD Validator Utility
 *
 * Implements validation and structure checking for ICH Electronic Common Technical Document (eCTD) v3.2.2
 * Based on specifications from: https://ich.org/page/ich-electronic-common-technical-document-ectd-v322-specification-and-related-files
 *
 * This utility helps ensure that document structure, file naming, XML metadata, and folder organization
 * comply with the ICH eCTD specifications required for electronic regulatory submissions.
 */

// eCTD Controlled Vocabularies
const ectdVocabularies = {
  countries: ['us', 'eu', 'jp', 'ca', 'ch', 'au', 'br', 'cn', 'in', 'kr', 'ru', 'tw'],
  languages: ['en', 'fr', 'de', 'it', 'es', 'ja', 'zh', 'ko', 'ru', 'pt'],
  documentTypes: [
    'cover-letter',
    'index',
    'application-form',
    'pi',
    'gmpc',
    'expert-report',
    'quality',
    'non-clinical',
    'clinical',
    'regional',
  ],
  lifecycleOperations: ['new', 'replace', 'append', 'delete'],
  fileFormats: {
    documents: ['pdf'],
    images: ['jpg', 'jpeg', 'png', 'gif', 'svg'],
    datasets: ['xml', 'xpt'],
  },
};

// eCTD Module Structure with Folder Paths and File Naming Requirements
const ectdStructure = {
  m1: {
    title: 'Administrative Information and Prescribing Information',
    folderPath: 'm1',
    regionSpecific: true,
    regions: {
      us: {
        folderPath: 'm1/us',
        sections: {
          1.1: {
            title: 'Forms and Administrative Information',
            folderPath: 'm1/us/11-admin',
            fileNaming: 'us-regional-11-{documentType}-{sequenceNumber}',
          },
          1.2: {
            title: 'Cover Letters',
            folderPath: 'm1/us/12-cover',
            fileNaming: 'us-regional-12-cover-{sequenceNumber}',
          },
          1.3: {
            title: 'Administrative Information',
            folderPath: 'm1/us/13-admin',
          },
          1.4: {
            title: 'References',
            folderPath: 'm1/us/14-references',
          },
          1.14: {
            title: 'Labeling',
            folderPath: 'm1/us/114-labeling',
          },
        },
      },
      eu: {
        folderPath: 'm1/eu',
        // EU-specific sections would be defined here
      },
      jp: {
        folderPath: 'm1/jp',
        // Japan-specific sections would be defined here
      },
    },
  },
  m2: {
    title: 'Common Technical Document Summaries',
    folderPath: 'm2',
    sections: {
      2.1: {
        title: 'CTD Table of Contents',
        folderPath: 'm2/21-toc',
        fileNaming: 'ctd-toc-{sequenceNumber}',
      },
      2.2: {
        title: 'Introduction',
        folderPath: 'm2/22-intro',
        fileNaming: 'introduction-{sequenceNumber}',
      },
      2.3: {
        title: 'Quality Overall Summary',
        folderPath: 'm2/23-qos',
        fileNaming: 'qos-{section}-{sequenceNumber}',
      },
      2.4: {
        title: 'Nonclinical Overview',
        folderPath: 'm2/24-nonclin-over',
        fileNaming: 'nonclinical-overview-{sequenceNumber}',
      },
      2.5: {
        title: 'Clinical Overview',
        folderPath: 'm2/25-clin-over',
        fileNaming: 'clinical-overview-{sequenceNumber}',
      },
      2.6: {
        title: 'Nonclinical Written and Tabulated Summaries',
        folderPath: 'm2/26-nonclin-sum',
        sections: {
          '2.6.1': {
            title: 'Introduction',
            fileNaming: 'nonclinical-summary-intro-{sequenceNumber}',
          },
          '2.6.2': {
            title: 'Pharmacology Written Summary',
            fileNaming: 'nonclinical-summary-pharm-{sequenceNumber}',
          },
          // Additional subsections would be defined here
        },
      },
      2.7: {
        title: 'Clinical Summary',
        folderPath: 'm2/27-clin-sum',
        sections: {
          '2.7.1': {
            title: 'Summary of Biopharmaceutic Studies and Analytical Methods',
            fileNaming: 'clinical-summary-biopharm-{sequenceNumber}',
          },
          '2.7.2': {
            title: 'Summary of Clinical Pharmacology Studies',
            fileNaming: 'clinical-summary-pharm-{sequenceNumber}',
          },
          '2.7.3': {
            title: 'Summary of Clinical Efficacy',
            fileNaming: 'clinical-summary-efficacy-{sequenceNumber}',
          },
          '2.7.4': {
            title: 'Summary of Clinical Safety',
            fileNaming: 'clinical-summary-safety-{sequenceNumber}',
          },
          '2.7.5': {
            title: 'Literature References',
            fileNaming: 'clinical-summary-references-{sequenceNumber}',
          },
          '2.7.6': {
            title: 'Synopsis of Individual Studies',
            fileNaming: 'clinical-summary-synopsis-{sequenceNumber}',
          },
        },
      },
    },
  },
  m3: {
    title: 'Quality',
    folderPath: 'm3',
    sections: {
      3.1: {
        title: 'Table of Contents of Module 3',
        folderPath: 'm3/31-toc',
        fileNaming: 'm3-toc-{sequenceNumber}',
      },
      3.2: {
        title: 'Body of Data',
        folderPath: 'm3/32-body-data',
        sections: {
          '3.2.S': {
            title: 'Drug Substance',
            folderPath: 'm3/32-body-data/32s-drug-sub',
            sections: {
              '3.2.S.1': {
                title: 'General Information',
                folderPath: 'm3/32-body-data/32s-drug-sub/32s1-gen-info',
              },
              '3.2.S.2': {
                title: 'Manufacture',
                folderPath: 'm3/32-body-data/32s-drug-sub/32s2-manuf',
              },
              '3.2.S.3': {
                title: 'Characterisation',
                folderPath: 'm3/32-body-data/32s-drug-sub/32s3-charac',
              },
              '3.2.S.4': {
                title: 'Control of Drug Substance',
                folderPath: 'm3/32-body-data/32s-drug-sub/32s4-contr-drug-sub',
              },
              '3.2.S.5': {
                title: 'Reference Standards or Materials',
                folderPath: 'm3/32-body-data/32s-drug-sub/32s5-ref-stand',
              },
              '3.2.S.6': {
                title: 'Container Closure System',
                folderPath: 'm3/32-body-data/32s-drug-sub/32s6-cont-closure-sys',
              },
              '3.2.S.7': {
                title: 'Stability',
                folderPath: 'm3/32-body-data/32s-drug-sub/32s7-stab',
              },
            },
          },
          '3.2.P': {
            title: 'Drug Product',
            folderPath: 'm3/32-body-data/32p-drug-prod',
            sections: {
              '3.2.P.1': {
                title: 'Description and Composition of the Drug Product',
                folderPath: 'm3/32-body-data/32p-drug-prod/32p1-desc-comp',
              },
              '3.2.P.2': {
                title: 'Pharmaceutical Development',
                folderPath: 'm3/32-body-data/32p-drug-prod/32p2-pharm-dev',
              },
              '3.2.P.3': {
                title: 'Manufacture',
                folderPath: 'm3/32-body-data/32p-drug-prod/32p3-manuf',
              },
              '3.2.P.4': {
                title: 'Control of Excipients',
                folderPath: 'm3/32-body-data/32p-drug-prod/32p4-contr-excip',
              },
              '3.2.P.5': {
                title: 'Control of Drug Product',
                folderPath: 'm3/32-body-data/32p-drug-prod/32p5-contr-drug-prod',
              },
              '3.2.P.6': {
                title: 'Reference Standards or Materials',
                folderPath: 'm3/32-body-data/32p-drug-prod/32p6-ref-stand',
              },
              '3.2.P.7': {
                title: 'Container Closure System',
                folderPath: 'm3/32-body-data/32p-drug-prod/32p7-cont-closure-sys',
              },
              '3.2.P.8': {
                title: 'Stability',
                folderPath: 'm3/32-body-data/32p-drug-prod/32p8-stab',
              },
            },
          },
          '3.2.A': {
            title: 'Appendices',
            folderPath: 'm3/32-body-data/32a-app',
            sections: {
              '3.2.A.1': {
                title: 'Facilities and Equipment',
                folderPath: 'm3/32-body-data/32a-app/32a1-fac-equip',
              },
              '3.2.A.2': {
                title: 'Adventitious Agents Safety Evaluation',
                folderPath: 'm3/32-body-data/32a-app/32a2-advent-agent',
              },
              '3.2.A.3': {
                title: 'Excipients',
                folderPath: 'm3/32-body-data/32a-app/32a3-excip',
              },
            },
          },
          '3.2.R': {
            title: 'Regional Information',
            folderPath: 'm3/32-body-data/32r-reg-info',
          },
        },
      },
      3.3: {
        title: 'Literature References',
        folderPath: 'm3/33-lit-ref',
      },
    },
  },
  m4: {
    title: 'Nonclinical Study Reports',
    folderPath: 'm4',
    sections: {
      4.1: {
        title: 'Table of Contents of Module 4',
        folderPath: 'm4/41-toc',
        fileNaming: 'm4-toc-{sequenceNumber}',
      },
      4.2: {
        title: 'Study Reports',
        folderPath: 'm4/42-stud-rep',
        sections: {
          '4.2.1': {
            title: 'Pharmacology',
            folderPath: 'm4/42-stud-rep/421-pharmacol',
            sections: {
              '4.2.1.1': {
                title: 'Primary Pharmacodynamics',
                folderPath: 'm4/42-stud-rep/421-pharmacol/4211-prim-pd',
              },
              '4.2.1.2': {
                title: 'Secondary Pharmacodynamics',
                folderPath: 'm4/42-stud-rep/421-pharmacol/4212-sec-pd',
              },
              '4.2.1.3': {
                title: 'Safety Pharmacology',
                folderPath: 'm4/42-stud-rep/421-pharmacol/4213-safety-pharmacol',
              },
              '4.2.1.4': {
                title: 'Pharmacodynamic Drug Interactions',
                folderPath: 'm4/42-stud-rep/421-pharmacol/4214-pd-drug-interact',
              },
            },
          },
          '4.2.2': {
            title: 'Pharmacokinetics',
            folderPath: 'm4/42-stud-rep/422-pk',
            sections: {
              '4.2.2.1': {
                title: 'Analytical Methods and Validation Reports',
                folderPath: 'm4/42-stud-rep/422-pk/4221-analyt-met-val',
              },
              '4.2.2.2': {
                title: 'Absorption',
                folderPath: 'm4/42-stud-rep/422-pk/4222-absorp',
              },
              '4.2.2.3': {
                title: 'Distribution',
                folderPath: 'm4/42-stud-rep/422-pk/4223-distrib',
              },
              '4.2.2.4': {
                title: 'Metabolism',
                folderPath: 'm4/42-stud-rep/422-pk/4224-metab',
              },
              '4.2.2.5': {
                title: 'Excretion',
                folderPath: 'm4/42-stud-rep/422-pk/4225-excr',
              },
              '4.2.2.6': {
                title: 'Pharmacokinetic Drug Interactions',
                folderPath: 'm4/42-stud-rep/422-pk/4226-pk-drug-interact',
              },
              '4.2.2.7': {
                title: 'Other Pharmacokinetic Studies',
                folderPath: 'm4/42-stud-rep/422-pk/4227-other-pk-stud',
              },
            },
          },
          '4.2.3': {
            title: 'Toxicology',
            folderPath: 'm4/42-stud-rep/423-tox',
            sections: {
              '4.2.3.1': {
                title: 'Single-Dose Toxicity',
                folderPath: 'm4/42-stud-rep/423-tox/4231-single-dose-tox',
              },
              '4.2.3.2': {
                title: 'Repeat-Dose Toxicity',
                folderPath: 'm4/42-stud-rep/423-tox/4232-repeat-dose-tox',
              },
              '4.2.3.3': {
                title: 'Genotoxicity',
                folderPath: 'm4/42-stud-rep/423-tox/4233-genotox',
                sections: {
                  '4.2.3.3.1': {
                    title: 'In vitro',
                    folderPath: 'm4/42-stud-rep/423-tox/4233-genotox/42331-in-vitro',
                  },
                  '4.2.3.3.2': {
                    title: 'In vivo',
                    folderPath: 'm4/42-stud-rep/423-tox/4233-genotox/42332-in-vivo',
                  },
                },
              },
              '4.2.3.4': {
                title: 'Carcinogenicity',
                folderPath: 'm4/42-stud-rep/423-tox/4234-carcigen',
                sections: {
                  '4.2.3.4.1': {
                    title: 'Long-term Studies',
                    folderPath: 'm4/42-stud-rep/423-tox/4234-carcigen/42341-lt-stud',
                  },
                  '4.2.3.4.2': {
                    title: 'Short or Medium-term Studies',
                    folderPath: 'm4/42-stud-rep/423-tox/4234-carcigen/42342-smt-stud',
                  },
                  '4.2.3.4.3': {
                    title: 'Other Studies',
                    folderPath: 'm4/42-stud-rep/423-tox/4234-carcigen/42343-other-stud',
                  },
                },
              },
              '4.2.3.5': {
                title: 'Reproductive and Developmental Toxicity',
                folderPath: 'm4/42-stud-rep/423-tox/4235-repro-dev-tox',
                sections: {
                  '4.2.3.5.1': {
                    title: 'Fertility and Early Embryonic Development',
                    folderPath: 'm4/42-stud-rep/423-tox/4235-repro-dev-tox/42351-fert-embryo-dev',
                  },
                  '4.2.3.5.2': {
                    title: 'Embryo-Fetal Development',
                    folderPath: 'm4/42-stud-rep/423-tox/4235-repro-dev-tox/42352-embryo-fetal-dev',
                  },
                  '4.2.3.5.3': {
                    title: 'Prenatal and Postnatal Development',
                    folderPath: 'm4/42-stud-rep/423-tox/4235-repro-dev-tox/42353-pre-postnatal-dev',
                  },
                  '4.2.3.5.4': {
                    title: 'Studies in Juvenile Animals',
                    folderPath: 'm4/42-stud-rep/423-tox/4235-repro-dev-tox/42354-juv-stud',
                  },
                },
              },
              '4.2.3.6': {
                title: 'Local Tolerance',
                folderPath: 'm4/42-stud-rep/423-tox/4236-loc-tol',
              },
              '4.2.3.7': {
                title: 'Other Toxicity Studies',
                folderPath: 'm4/42-stud-rep/423-tox/4237-other-tox-stud',
                sections: {
                  '4.2.3.7.1': {
                    title: 'Antigenicity',
                    folderPath: 'm4/42-stud-rep/423-tox/4237-other-tox-stud/42371-antigen',
                  },
                  '4.2.3.7.2': {
                    title: 'Immunotoxicity',
                    folderPath: 'm4/42-stud-rep/423-tox/4237-other-tox-stud/42372-immunotox',
                  },
                  '4.2.3.7.3': {
                    title: 'Mechanistic Studies',
                    folderPath: 'm4/42-stud-rep/423-tox/4237-other-tox-stud/42373-mechan-stud',
                  },
                  '4.2.3.7.4': {
                    title: 'Dependence',
                    folderPath: 'm4/42-stud-rep/423-tox/4237-other-tox-stud/42374-dep',
                  },
                  '4.2.3.7.5': {
                    title: 'Metabolites',
                    folderPath: 'm4/42-stud-rep/423-tox/4237-other-tox-stud/42375-metab',
                  },
                  '4.2.3.7.6': {
                    title: 'Impurities',
                    folderPath: 'm4/42-stud-rep/423-tox/4237-other-tox-stud/42376-imp',
                  },
                  '4.2.3.7.7': {
                    title: 'Other',
                    folderPath: 'm4/42-stud-rep/423-tox/4237-other-tox-stud/42377-other',
                  },
                },
              },
            },
          },
        },
      },
      4.3: {
        title: 'Literature References',
        folderPath: 'm4/43-lit-ref',
      },
    },
  },
  m5: {
    title: 'Clinical Study Reports',
    folderPath: 'm5',
    sections: {
      5.1: {
        title: 'Table of Contents of Module 5',
        folderPath: 'm5/51-toc',
        fileNaming: 'm5-toc-{sequenceNumber}',
      },
      5.2: {
        title: 'Tabular Listing of All Clinical Studies',
        folderPath: 'm5/52-tab',
        fileNaming: 'tabular-listing-{sequenceNumber}',
      },
      5.3: {
        title: 'Clinical Study Reports',
        folderPath: 'm5/53-clin-stud-rep',
        sections: {
          '5.3.1': {
            title: 'Reports of Biopharmaceutic Studies',
            folderPath: 'm5/53-clin-stud-rep/531-rep-biopharm-stud',
            sections: {
              '5.3.1.1': {
                title: 'Bioavailability (BA) Study Reports',
                folderPath: 'm5/53-clin-stud-rep/531-rep-biopharm-stud/5311-ba-stud-rep',
              },
              '5.3.1.2': {
                title: 'Comparative BA and Bioequivalence (BE) Study Reports',
                folderPath: 'm5/53-clin-stud-rep/531-rep-biopharm-stud/5312-compar-ba-be-stud-rep',
              },
              '5.3.1.3': {
                title: 'In Vitro-In Vivo Correlation Study Reports',
                folderPath:
                  'm5/53-clin-stud-rep/531-rep-biopharm-stud/5313-in-vitro-in-vivo-corr-stud-rep',
              },
              '5.3.1.4': {
                title: 'Reports of Bioanalytical and Analytical Methods for Human Studies',
                folderPath: 'm5/53-clin-stud-rep/531-rep-biopharm-stud/5314-bioanalyt-analyt-met',
              },
            },
          },
          '5.3.2': {
            title: 'Reports of Studies Pertinent to Pharmacokinetics using Human Biomaterials',
            folderPath: 'm5/53-clin-stud-rep/532-rep-stud-pk-human-biomat',
            sections: {
              '5.3.2.1': {
                title: 'Plasma Protein Binding Study Reports',
                folderPath:
                  'm5/53-clin-stud-rep/532-rep-stud-pk-human-biomat/5321-plasma-prot-bind-stud-rep',
              },
              '5.3.2.2': {
                title: 'Reports of Hepatic Metabolism and Drug Interaction Studies',
                folderPath:
                  'm5/53-clin-stud-rep/532-rep-stud-pk-human-biomat/5322-rep-hep-metab-interact-stud',
              },
              '5.3.2.3': {
                title: 'Studies Using Other Human Biomaterials',
                folderPath:
                  'm5/53-clin-stud-rep/532-rep-stud-pk-human-biomat/5323-stud-other-human-biomat',
              },
            },
          },
          '5.3.3': {
            title: 'Reports of Human Pharmacokinetic (PK) Studies',
            folderPath: 'm5/53-clin-stud-rep/533-rep-human-pk-stud',
            sections: {
              '5.3.3.1': {
                title: 'Healthy Subject PK and Initial Tolerability Study Reports',
                folderPath:
                  'm5/53-clin-stud-rep/533-rep-human-pk-stud/5331-healthy-subj-pk-init-tol-stud-rep',
              },
              '5.3.3.2': {
                title: 'Patient PK and Initial Tolerability Study Reports',
                folderPath:
                  'm5/53-clin-stud-rep/533-rep-human-pk-stud/5332-patient-pk-init-tol-stud-rep',
              },
              '5.3.3.3': {
                title: 'Intrinsic Factor PK Study Reports',
                folderPath:
                  'm5/53-clin-stud-rep/533-rep-human-pk-stud/5333-intrin-factor-pk-stud-rep',
              },
              '5.3.3.4': {
                title: 'Extrinsic Factor PK Study Reports',
                folderPath:
                  'm5/53-clin-stud-rep/533-rep-human-pk-stud/5334-extrin-factor-pk-stud-rep',
              },
              '5.3.3.5': {
                title: 'Population PK Study Reports',
                folderPath: 'm5/53-clin-stud-rep/533-rep-human-pk-stud/5335-pop-pk-stud-rep',
              },
            },
          },
          '5.3.4': {
            title: 'Reports of Human Pharmacodynamic (PD) Studies',
            folderPath: 'm5/53-clin-stud-rep/534-rep-human-pd-stud',
            sections: {
              '5.3.4.1': {
                title: 'Healthy Subject PD and PK/PD Study Reports',
                folderPath:
                  'm5/53-clin-stud-rep/534-rep-human-pd-stud/5341-healthy-subj-pd-stud-rep',
              },
              '5.3.4.2': {
                title: 'Patient PD and PK/PD Study Reports',
                folderPath: 'm5/53-clin-stud-rep/534-rep-human-pd-stud/5342-patient-pd-stud-rep',
              },
            },
          },
          '5.3.5': {
            title: 'Reports of Efficacy and Safety Studies',
            folderPath: 'm5/53-clin-stud-rep/535-rep-effic-safety-stud',
            sections: {
              '5.3.5.1': {
                title:
                  'Study Reports of Controlled Clinical Studies Pertinent to the Claimed Indication',
                folderPath: 'm5/53-clin-stud-rep/535-rep-effic-safety-stud/5351-stud-rep-contr',
              },
              '5.3.5.2': {
                title: 'Study Reports of Uncontrolled Clinical Studies',
                folderPath: 'm5/53-clin-stud-rep/535-rep-effic-safety-stud/5352-stud-rep-uncontr',
              },
              '5.3.5.3': {
                title: 'Reports of Analyses of Data from More than One Study',
                folderPath:
                  'm5/53-clin-stud-rep/535-rep-effic-safety-stud/5353-rep-analys-data-more-one-stud',
              },
              '5.3.5.4': {
                title: 'Other Clinical Study Reports',
                folderPath: 'm5/53-clin-stud-rep/535-rep-effic-safety-stud/5354-other-stud-rep',
              },
            },
          },
          '5.3.6': {
            title: 'Reports of Postmarketing Experience',
            folderPath: 'm5/53-clin-stud-rep/536-postmark-exp',
          },
          '5.3.7': {
            title: 'Case Report Forms and Individual Patient Listings',
            folderPath: 'm5/53-clin-stud-rep/537-crf-ipl',
          },
        },
      },
      5.4: {
        title: 'Literature References',
        folderPath: 'm5/54-lit-ref',
      },
    },
  },
};

/**
 * XML DTD and Schema Information
 *
 * These are the DTD and Schema references for eCTD XML files
 */
const ectdXmlInfo = {
  dtdUrl:
    'https://www.ich.org/fileadmin/Public_Web_Site/ICH_Products/Electronic_Common_Technical_Document/eCTD_Definition_V3_2_2/DTD_v3_2/ich-ectd-3-2.dtd',
  schemaUrls: {
    main: 'https://www.ich.org/fileadmin/Public_Web_Site/ICH_Products/Electronic_Common_Technical_Document/eCTD_Definition_V3_2_2/XML_Schema_v3_2_2/ich-ectd-3-2.xsd',
    common:
      'https://www.ich.org/fileadmin/Public_Web_Site/ICH_Products/Electronic_Common_Technical_Document/eCTD_Definition_V3_2_2/XML_Schema_v3_2_2/common-v1-0.xsd',
  },
  namespaces: {
    ich: 'http://www.ich.org/ectd',
    xlink: 'http://www.w3.org/1999/xlink',
  },
};

/**
 * Validates a file path against eCTD folder structure
 * @param {string} filePath - File path to validate
 * @returns {Object} Validation result
 */
export function validateEctdFilePath(filePath) {
  // Normalize file path to use forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/');
  const result = {
    valid: false,
    module: null,
    section: null,
    errors: [],
  };

  // Check if path starts with m1-m5
  const moduleMatch = normalizedPath.match(/^(m[1-5])\//i);
  if (!moduleMatch) {
    result.errors.push('File path does not start with a valid module (m1-m5)');
    return result;
  }

  const moduleId = moduleMatch[1].toLowerCase();
  result.module = moduleId;

  // Find matching section
  let found = false;
  let sectionInfo = null;

  const findMatchingSection = (structure, path, parentSection = '') => {
    if (found) return;

    Object.keys(structure).forEach(key => {
      const item = structure[key];
      if (item.folderPath && path.startsWith(item.folderPath + '/')) {
        found = true;
        sectionInfo = {
          id: parentSection ? `${parentSection}.${key}` : key,
          title: item.title,
          folderPath: item.folderPath,
          fileNaming: item.fileNaming,
        };
      }

      // Recursively check sections
      if (item.sections) {
        findMatchingSection(item.sections, path, key);
      }

      // Check region-specific sections for module 1
      if (item.regions) {
        Object.keys(item.regions).forEach(region => {
          if (item.regions[region].sections) {
            findMatchingSection(item.regions[region].sections, path, `${region}.${key}`);
          }
        });
      }
    });
  };

  findMatchingSection({ [moduleId]: ectdStructure[moduleId] }, normalizedPath);

  if (!found) {
    result.errors.push(`File path does not match any valid eCTD folder structure in ${moduleId}`);
    return result;
  }

  result.section = sectionInfo.id;
  result.valid = true;

  return result;
}

/**
 * Validates a file name against eCTD naming conventions
 * @param {string} fileName - File name to validate
 * @param {string} sectionId - CTD section ID
 * @param {Object} options - Additional options (sequenceNumber, etc.)
 * @returns {Object} Validation result
 */
export function validateEctdFileName(fileName, sectionId, options = {}) {
  const result = {
    valid: true,
    errors: [],
  };

  // Extract section info
  const moduleMatch = sectionId.match(/^([1-5])/);
  if (!moduleMatch) {
    result.valid = false;
    result.errors.push('Invalid section ID');
    return result;
  }

  const moduleNum = moduleMatch[1];
  const moduleId = `m${moduleNum}`;

  // Find section path
  let sectionPath = null;
  let fileNamingPattern = null;

  // Helper function to traverse eCTD structure
  const findSection = (sections, targetId, parentId = '') => {
    if (sectionPath) return;

    Object.keys(sections).forEach(key => {
      const fullId = parentId ? `${parentId}.${key}` : key;
      if (fullId === sectionId || key === sectionId) {
        sectionPath = sections[key].folderPath;
        fileNamingPattern = sections[key].fileNaming;
        return;
      }

      if (sections[key].sections) {
        findSection(sections[key].sections, targetId, fullId);
      }
    });
  };

  if (moduleId === 'm1') {
    // Handle region-specific sections
    Object.keys(ectdStructure.m1.regions).forEach(region => {
      findSection(ectdStructure.m1.regions[region].sections, sectionId);
    });
  } else {
    findSection(ectdStructure[moduleId].sections, sectionId);
  }

  if (!sectionPath) {
    result.valid = false;
    result.errors.push(`Could not find section with ID: ${sectionId}`);
    return result;
  }

  // Check file extension
  if (!fileName.endsWith('.pdf') && !fileName.match(/\.(xml|xpt|jpg|jpeg|png|gif)$/i)) {
    result.valid = false;
    result.errors.push('File must have an approved extension (pdf, xml, xpt, jpg, jpeg, png, gif)');
  }

  // Check file naming pattern if available
  if (fileNamingPattern) {
    // Replace placeholders in pattern
    const expectedPattern = fileNamingPattern
      .replace('{sequenceNumber}', options.sequenceNumber || '\\d+')
      .replace('{documentType}', options.documentType || '[a-z-]+')
      .replace('{section}', options.section || '[a-z0-9-]+');

    // Create regex from pattern
    const patternRegex = new RegExp(`^${expectedPattern}\\.(pdf|xml|xpt|jpg|jpeg|png|gif)$`, 'i');

    if (!patternRegex.test(fileName)) {
      result.valid = false;
      result.errors.push(`File name does not match expected pattern: ${fileNamingPattern}`);
    }
  }

  // Check file name length
  if (fileName.length > 64) {
    result.valid = false;
    result.errors.push('File name exceeds maximum length of 64 characters');
  }

  // Check for invalid characters
  if (/[^a-z0-9\-_.]/i.test(fileName)) {
    result.valid = false;
    result.errors.push(
      'File name contains invalid characters (only a-z, A-Z, 0-9, hyphen, underscore, period allowed)'
    );
  }

  return result;
}

/**
 * Generates an eCTD-compliant file path for a given section
 * @param {string} sectionId - CTD section ID (e.g., "3.2.S.1.1")
 * @param {string} region - Region code for Module 1 (e.g., "us", "eu")
 * @returns {string} eCTD-compliant file path
 */
export function generateEctdFilePath(sectionId, region = null) {
  // Extract module number
  const moduleMatch = sectionId.match(/^([1-5])/);
  if (!moduleMatch) {
    throw new Error('Invalid section ID');
  }

  const moduleNum = moduleMatch[1];
  const moduleId = `m${moduleNum}`;

  // Special handling for module 1 (region-specific)
  if (moduleNum === '1') {
    if (!region || !ectdStructure.m1.regions[region]) {
      throw new Error(`Valid region code required for Module 1 (received: ${region})`);
    }

    // Find section in region-specific structure
    let sectionPath = null;

    const findM1Section = (sections, targetId, parentId = '') => {
      if (sectionPath) return;

      Object.keys(sections).forEach(key => {
        const fullId = parentId ? `${parentId}.${key}` : key;
        const shortId = key;

        if (fullId === sectionId || shortId === sectionId) {
          sectionPath = sections[key].folderPath;
          return;
        }

        if (sections[key].sections) {
          findM1Section(sections[key].sections, targetId, fullId);
        }
      });
    };

    findM1Section(ectdStructure.m1.regions[region].sections, sectionId);

    if (sectionPath) {
      return sectionPath;
    } else {
      throw new Error(`Section ${sectionId} not found in Module 1 (${region})`);
    }
  }

  // For modules 2-5
  let sectionPath = null;

  const findSection = (sections, targetId, parentId = '') => {
    if (sectionPath) return;

    Object.keys(sections).forEach(key => {
      const fullId = parentId ? `${parentId}.${key}` : key;
      const shortId = key;

      if (fullId === sectionId || shortId === sectionId) {
        sectionPath = sections[key].folderPath;
        return;
      }

      if (sections[key].sections) {
        findSection(sections[key].sections, targetId, key);
      }
    });
  };

  findSection(ectdStructure[moduleId].sections, sectionId);

  if (sectionPath) {
    return sectionPath;
  } else {
    throw new Error(`Section ${sectionId} not found in Module ${moduleNum}`);
  }
}

/**
 * Generates an eCTD-compliant file name
 * @param {string} sectionId - CTD section ID (e.g., "3.2.S.1.1")
 * @param {Object} options - Filename options (sequenceNumber, documentType, etc.)
 * @returns {string} eCTD-compliant file name
 */
export function generateEctdFileName(sectionId, options = {}) {
  // Extract module number
  const moduleMatch = sectionId.match(/^([1-5])/);
  if (!moduleMatch) {
    throw new Error('Invalid section ID');
  }

  const moduleNum = moduleMatch[1];
  const moduleId = `m${moduleNum}`;

  // Find section info and naming pattern
  let fileNamingPattern = null;
  let region = options.region || null;

  // Helper function to traverse eCTD structure
  const findSection = (sections, targetId, parentId = '') => {
    if (fileNamingPattern) return;

    Object.keys(sections).forEach(key => {
      const fullId = parentId ? `${parentId}.${key}` : key;
      if (fullId === sectionId || key === sectionId) {
        fileNamingPattern = sections[key].fileNaming;
        return;
      }

      if (sections[key].sections) {
        findSection(sections[key].sections, targetId, fullId);
      }
    });
  };

  if (moduleId === 'm1' && region) {
    // Handle region-specific sections
    findSection(ectdStructure.m1.regions[region].sections, sectionId);
  } else {
    findSection(ectdStructure[moduleId].sections, sectionId);
  }

  // If no naming pattern found, use a default
  if (!fileNamingPattern) {
    // Convert section ID to kebab case for filename (e.g., 3.2.S.1.1 -> 32s11)
    const sectionForFile = sectionId.toLowerCase().replace(/\./g, '');
    fileNamingPattern = `${moduleId}-${sectionForFile}-{sequenceNumber}`;
  }

  // Replace placeholders in pattern
  const fileName = fileNamingPattern
    .replace('{sequenceNumber}', options.sequenceNumber || '0000')
    .replace('{documentType}', options.documentType || 'document')
    .replace('{section}', options.section || '');

  // Add file extension
  return `${fileName}.pdf`;
}

/**
 * Creates an empty eCTD structure with directories for all modules
 * @param {Object} options - Options (basePath, includeAllSections)
 * @returns {Array} Array of directory paths to create
 */
export function createEctdFolderStructure(options = {}) {
  const basePath = options.basePath || '';
  const includeAllSections = options.includeAllSections || false;
  const dirsToCreate = [];

  // Helper to recursively collect directory paths
  const collectDirs = (structure, parentPath = '') => {
    Object.keys(structure).forEach(key => {
      const item = structure[key];

      if (item.folderPath) {
        dirsToCreate.push(`${basePath}/${item.folderPath}`);
      }

      // Process sections if includeAllSections is true
      if (includeAllSections && item.sections) {
        collectDirs(item.sections);
      }

      // Process regions for Module 1
      if (item.regions) {
        Object.keys(item.regions).forEach(region => {
          if (item.regions[region].folderPath) {
            dirsToCreate.push(`${basePath}/${item.regions[region].folderPath}`);
          }

          if (includeAllSections && item.regions[region].sections) {
            collectDirs(item.regions[region].sections);
          }
        });
      }
    });
  };

  collectDirs(ectdStructure);

  return dirsToCreate;
}

/**
 * Generates a basic eCTD index.xml template
 * @param {Object} options - Options for the index.xml
 * @returns {string} XML string for index.xml
 */
export function generateEctdIndexXml(options = {}) {
  const {
    submissionId = '0000',
    submissionType = 'original',
    applicationNumber = '',
    regionCode = 'us',
    sequenceNumber = '0000',
    applicant = 'Company Name',
    productName = 'Product Name',
    dtdVersion = '3.2',
  } = options;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:submission SYSTEM "https://www.ich.org/fileadmin/Public_Web_Site/ICH_Products/Electronic_Common_Technical_Document/eCTD_Definition_V3_2_2/DTD_v3_2/ich-ectd-3-2.dtd">
<ectd:submission xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink">
  <ectd:admin>
    <ectd:submission-id>${submissionId}</ectd:submission-id>
    <ectd:submission-type>${submissionType}</ectd:submission-type>
    <ectd:application-number>${applicationNumber}</ectd:application-number>
    <ectd:submission-description>eCTD Submission</ectd:submission-description>
    <ectd:applicant>${applicant}</ectd:applicant>
    <ectd:agency>FDA</ectd:agency>
    <ectd:product-name>${productName}</ectd:product-name>
    <ectd:dtd-version>${dtdVersion}</ectd:dtd-version>
    <ectd:submission-unit>initial-application</ectd:submission-unit>
    <ectd:mode>new</ectd:mode>
    <ectd:number>0000</ectd:number>
    <ectd:relevant-information></ectd:relevant-information>
  </ectd:admin>
  <ectd:m1-regional>
    <!-- Placeholder for Module 1 regional information -->
  </ectd:m1-regional>
  <ectd:m2-common-technical-document-summaries>
    <!-- Placeholder for Module 2 content -->
  </ectd:m2-common-technical-document-summaries>
  <ectd:m3-quality>
    <!-- Placeholder for Module 3 content -->
  </ectd:m3-quality>
  <ectd:m4-nonclinical-study-reports>
    <!-- Placeholder for Module 4 content -->
  </ectd:m4-nonclinical-study-reports>
  <ectd:m5-clinical-study-reports>
    <!-- Placeholder for Module 5 content -->
  </ectd:m5-clinical-study-reports>
</ectd:submission>`;
}

export default {
  ectdStructure,
  ectdVocabularies,
  ectdXmlInfo,
  validateEctdFilePath,
  validateEctdFileName,
  generateEctdFilePath,
  generateEctdFileName,
  createEctdFolderStructure,
  generateEctdIndexXml,
};
