/**
 * CDISC SEND Validation Service
 * Implements FDA's Study Data Technical Conformance Guide requirements
 * for nonclinical data validation and Technical Rejection Criteria (TRC) checks
 */

// SEND Domain definitions based on SENDIG v3.1.1
const SEND_DOMAINS = {
  // Trial Design Domains
  TS: {
    name: 'Trial Summary',
    required: true,
    class: 'TRIAL DESIGN',
    variables: {
      STUDYID: { required: true, type: 'Char', role: 'Identifier' },
      DOMAIN: { required: true, type: 'Char', role: 'Identifier', expectedValue: 'TS' },
      TSSEQ: { required: true, type: 'Num', role: 'Identifier' },
      TSPARMCD: { required: true, type: 'Char', role: 'Topic', controlledTerms: true },
      TSPARM: { required: true, type: 'Char', role: 'Synonym Qualifier' },
      TSVAL: { required: false, type: 'Char', role: 'Result' }
    }
  },
  
  // Demographics Domain
  DM: {
    name: 'Demographics',
    required: true,
    class: 'SPECIAL PURPOSE',
    variables: {
      STUDYID: { required: true, type: 'Char', role: 'Identifier' },
      DOMAIN: { required: true, type: 'Char', role: 'Identifier', expectedValue: 'DM' },
      USUBJID: { required: true, type: 'Char', role: 'Identifier' },
      SUBJID: { required: true, type: 'Char', role: 'Topic' },
      RFSTDTC: { required: true, type: 'Char', role: 'Record Qualifier' },
      RFENDTC: { required: true, type: 'Char', role: 'Record Qualifier' },
      SPECIES: { required: true, type: 'Char', role: 'Record Qualifier', controlledTerms: true },
      STRAIN: { required: true, type: 'Char', role: 'Record Qualifier' },
      SEX: { required: true, type: 'Char', role: 'Record Qualifier', controlledTerms: true },
      AGE: { required: false, type: 'Num', role: 'Record Qualifier' },
      AGEU: { required: false, type: 'Char', role: 'Variable Qualifier', controlledTerms: true }
    }
  },
  
  // Exposure Domain  
  EX: {
    name: 'Exposure',
    required: true,
    class: 'INTERVENTIONS',
    variables: {
      STUDYID: { required: true, type: 'Char', role: 'Identifier' },
      DOMAIN: { required: true, type: 'Char', role: 'Identifier', expectedValue: 'EX' },
      USUBJID: { required: true, type: 'Char', role: 'Identifier' },
      EXSEQ: { required: true, type: 'Num', role: 'Identifier' },
      EXTRT: { required: true, type: 'Char', role: 'Topic' },
      EXDOSE: { required: false, type: 'Num', role: 'Record Qualifier' },
      EXDOSU: { required: false, type: 'Char', role: 'Variable Qualifier', controlledTerms: true },
      EXDOSFRQ: { required: false, type: 'Char', role: 'Record Qualifier', controlledTerms: true },
      EXROUTE: { required: false, type: 'Char', role: 'Record Qualifier', controlledTerms: true },
      EXSTDTC: { required: true, type: 'Char', role: 'Timing' },
      EXENDTC: { required: false, type: 'Char', role: 'Timing' }
    }
  },

  // Laboratory Test Results
  LB: {
    name: 'Laboratory Test Results', 
    required: false,
    class: 'FINDINGS',
    variables: {
      STUDYID: { required: true, type: 'Char', role: 'Identifier' },
      DOMAIN: { required: true, type: 'Char', role: 'Identifier', expectedValue: 'LB' },
      USUBJID: { required: true, type: 'Char', role: 'Identifier' },
      LBSEQ: { required: true, type: 'Num', role: 'Identifier' },
      LBTESTCD: { required: true, type: 'Char', role: 'Topic', controlledTerms: true },
      LBTEST: { required: true, type: 'Char', role: 'Synonym Qualifier' },
      LBCAT: { required: false, type: 'Char', role: 'Grouping Qualifier' },
      LBORRES: { required: false, type: 'Char', role: 'Result' },
      LBORRESU: { required: false, type: 'Char', role: 'Variable Qualifier', controlledTerms: true },
      LBSTRESC: { required: false, type: 'Char', role: 'Result' },
      LBSTRESN: { required: false, type: 'Num', role: 'Result' },
      LBSTRESU: { required: false, type: 'Char', role: 'Variable Qualifier', controlledTerms: true },
      LBDTC: { required: false, type: 'Char', role: 'Timing' },
      LBDY: { required: false, type: 'Num', role: 'Timing' }
    }
  },

  // Clinical Observations
  CL: {
    name: 'Clinical Observations',
    required: false,
    class: 'FINDINGS',
    variables: {
      STUDYID: { required: true, type: 'Char', role: 'Identifier' },
      DOMAIN: { required: true, type: 'Char', role: 'Identifier', expectedValue: 'CL' },
      USUBJID: { required: true, type: 'Char', role: 'Identifier' },
      CLSEQ: { required: true, type: 'Num', role: 'Identifier' },
      CLTESTCD: { required: true, type: 'Char', role: 'Topic', controlledTerms: true },
      CLTEST: { required: true, type: 'Char', role: 'Synonym Qualifier' },
      CLCAT: { required: false, type: 'Char', role: 'Grouping Qualifier' },
      CLORRES: { required: false, type: 'Char', role: 'Result' },
      CLSTRESC: { required: false, type: 'Char', role: 'Result' },
      CLDTC: { required: false, type: 'Char', role: 'Timing' },
      CLDY: { required: false, type: 'Num', role: 'Timing' }
    }
  },

  // Microscopic Findings
  MI: {
    name: 'Microscopic Findings',
    required: false,
    class: 'FINDINGS',
    variables: {
      STUDYID: { required: true, type: 'Char', role: 'Identifier' },
      DOMAIN: { required: true, type: 'Char', role: 'Identifier', expectedValue: 'MI' },
      USUBJID: { required: true, type: 'Char', role: 'Identifier' },
      MISEQ: { required: true, type: 'Num', role: 'Identifier' },
      MISPEC: { required: true, type: 'Char', role: 'Topic', controlledTerms: true },
      MIORRES: { required: false, type: 'Char', role: 'Result' },
      MISTRESC: { required: false, type: 'Char', role: 'Result', controlledTerms: true },
      MIDTC: { required: false, type: 'Char', role: 'Timing' },
      MIDY: { required: false, type: 'Num', role: 'Timing' }
    }
  }
};

// SEND Controlled Terminology (subset of SEND-CT)
const SEND_CONTROLLED_TERMS = {
  SPECIES: ['RAT', 'MOUSE', 'DOG', 'MONKEY', 'RABBIT', 'GUINEA PIG', 'HAMSTER', 'PIG', 'MINIPIG'],
  SEX: ['M', 'F', 'U'],
  ROUTE: ['ORAL', 'ORAL GAVAGE', 'DIETARY', 'INTRAVENOUS', 'INTRAVENOUS BOLUS', 
          'SUBCUTANEOUS', 'INTRAMUSCULAR', 'DERMAL', 'INHALATION', 'INTRANASAL'],
  DOSU: ['mg/kg', 'mg/kg/day', 'mg/animal', 'mg/animal/day', 'mg/L', 'ppm', '%'],
  AGEU: ['DAYS', 'WEEKS', 'MONTHS', 'YEARS'],
  LBTESTCD: ['ALT', 'AST', 'ALP', 'BILI', 'BUN', 'CREAT', 'GLUC', 'CHOL', 'TRIG', 
             'ALB', 'PROT', 'HCT', 'HGB', 'RBC', 'WBC', 'PLAT'],
  CLTESTCD: ['BDWT', 'LENGTH', 'PULSE', 'RESP', 'TEMP', 'CONSMP', 'FNDEXAM']
};

// Technical Rejection Criteria (TRC) Rules based on FDA guidance
const TRC_RULES = {
  // File-level checks
  FILE_CHECKS: {
    PDF_BOOKMARKS: {
      id: 'TRC-001',
      description: 'PDF files must contain bookmarks',
      severity: 'ERROR',
      category: 'Document Structure'
    },
    PDF_HYPERLINKS: {
      id: 'TRC-002', 
      description: 'PDF hyperlinks must be functional',
      severity: 'ERROR',
      category: 'Document Structure'
    },
    FILE_SIZE: {
      id: 'TRC-003',
      description: 'Individual files must not exceed 100MB',
      severity: 'ERROR',
      category: 'File Requirements',
      maxSize: 104857600 // 100MB in bytes
    },
    FILE_NAMING: {
      id: 'TRC-004',
      description: 'File names must follow eCTD naming conventions',
      severity: 'ERROR',
      category: 'File Requirements',
      pattern: /^[a-z0-9\-]+\.(pdf|xpt|xml)$/i
    }
  },

  // Dataset-level checks  
  DATASET_CHECKS: {
    XPT_FORMAT: {
      id: 'TRC-101',
      description: 'Dataset files must be in SAS XPT v5 format',
      severity: 'ERROR',
      category: 'Dataset Requirements'
    },
    DATASET_SIZE: {
      id: 'TRC-102',
      description: 'Dataset files must not exceed 5GB',
      severity: 'ERROR',
      category: 'Dataset Requirements',
      maxSize: 5368709120 // 5GB in bytes
    },
    DATASET_NAMING: {
      id: 'TRC-103',
      description: 'Dataset names must be 8 characters or less',
      severity: 'ERROR',
      category: 'Dataset Requirements',
      maxLength: 8
    },
    VARIABLE_NAMING: {
      id: 'TRC-104',
      description: 'Variable names must be 8 characters or less',
      severity: 'ERROR',
      category: 'Dataset Requirements',
      maxLength: 8
    },
    VARIABLE_LABELS: {
      id: 'TRC-105',
      description: 'Variable labels must be 40 characters or less',
      severity: 'ERROR',
      category: 'Dataset Requirements',
      maxLength: 40
    }
  },

  // SEND-specific checks
  SEND_CHECKS: {
    REQUIRED_DOMAINS: {
      id: 'TRC-201',
      description: 'Required SEND domains must be present',
      severity: 'ERROR',
      category: 'SEND Compliance',
      required: ['TS', 'DM', 'EX']
    },
    STUDYID_CONSISTENCY: {
      id: 'TRC-202',
      description: 'STUDYID must be consistent across all domains',
      severity: 'ERROR',
      category: 'SEND Compliance'
    },
    USUBJID_FORMAT: {
      id: 'TRC-203',
      description: 'USUBJID must follow format: STUDYID-SITEID-SUBJID',
      severity: 'ERROR',
      category: 'SEND Compliance',
      pattern: /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/
    },
    CONTROLLED_TERMS: {
      id: 'TRC-204',
      description: 'Values must conform to SEND controlled terminology',
      severity: 'ERROR',
      category: 'SEND Compliance'
    },
    DATE_FORMAT: {
      id: 'TRC-205',
      description: 'Dates must be in ISO 8601 format',
      severity: 'ERROR',
      category: 'SEND Compliance',
      pattern: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/
    }
  },

  // Define.xml checks
  DEFINE_CHECKS: {
    DEFINE_PRESENT: {
      id: 'TRC-301',
      description: 'Define.xml must be present for study data',
      severity: 'ERROR',
      category: 'Metadata Requirements'
    },
    DEFINE_VERSION: {
      id: 'TRC-302',
      description: 'Define.xml must use version 2.0 or 2.1',
      severity: 'ERROR',
      category: 'Metadata Requirements',
      allowedVersions: ['2.0', '2.1']
    },
    CODELISTS: {
      id: 'TRC-303',
      description: 'All coded values must have corresponding codelists in define.xml',
      severity: 'ERROR',
      category: 'Metadata Requirements'
    }
  }
};

/**
 * Validate SEND dataset structure
 * @param {Object} dataset - Dataset to validate
 * @param {string} domainName - SEND domain name (e.g., 'DM', 'EX')
 * @returns {Object} Validation results with errors and warnings
 */
export function validateSENDDataset(dataset, domainName) {
  const results = {
    valid: true,
    errors: [],
    warnings: [],
    info: []
  };

  // Check if domain exists in SEND specifications
  const domainSpec = SEND_DOMAINS[domainName];
  if (!domainSpec) {
    results.valid = false;
    results.errors.push({
      code: 'SEND-001',
      message: `Unknown SEND domain: ${domainName}`,
      severity: 'ERROR'
    });
    return results;
  }

  // Validate required variables
  Object.entries(domainSpec.variables).forEach(([varName, varSpec]) => {
    if (varSpec.required && !dataset.variables?.includes(varName)) {
      results.valid = false;
      results.errors.push({
        code: 'SEND-002',
        variable: varName,
        message: `Required variable ${varName} is missing from ${domainName} domain`,
        severity: 'ERROR'
      });
    }
  });

  // Validate variable naming conventions
  dataset.variables?.forEach(varName => {
    if (varName.length > 8) {
      results.valid = false;
      results.errors.push({
        code: 'TRC-104',
        variable: varName,
        message: `Variable name '${varName}' exceeds 8 character limit`,
        severity: 'ERROR'
      });
    }
  });

  // Check for unexpected variables
  dataset.variables?.forEach(varName => {
    if (!domainSpec.variables[varName]) {
      results.warnings.push({
        code: 'SEND-003',
        variable: varName,
        message: `Variable '${varName}' is not standard in ${domainName} domain`,
        severity: 'WARNING'
      });
    }
  });

  return results;
}

/**
 * Validate controlled terminology
 * @param {string} value - Value to validate
 * @param {string} termType - Type of controlled term (e.g., 'SPECIES', 'SEX')
 * @returns {boolean} True if valid
 */
export function validateControlledTerm(value, termType) {
  const allowedValues = SEND_CONTROLLED_TERMS[termType];
  if (!allowedValues) return true; // No controlled terms defined
  
  return allowedValues.includes(value?.toUpperCase());
}

/**
 * Run comprehensive TRC validation
 * @param {Object} submission - Submission data to validate
 * @returns {Object} TRC validation results
 */
export function runTRCValidation(submission) {
  const results = {
    passed: true,
    score: 100,
    errors: [],
    warnings: [],
    categories: {}
  };

  // Initialize category scores
  const categories = ['Document Structure', 'Dataset Requirements', 'SEND Compliance', 'Metadata Requirements'];
  categories.forEach(cat => {
    results.categories[cat] = { passed: 0, failed: 0, score: 100 };
  });

  // Run file-level checks
  if (submission.files) {
    submission.files.forEach(file => {
      // Check file size
      if (file.size > TRC_RULES.FILE_CHECKS.FILE_SIZE.maxSize) {
        results.errors.push({
          rule: TRC_RULES.FILE_CHECKS.FILE_SIZE,
          file: file.name,
          message: `File size (${(file.size / 1048576).toFixed(2)}MB) exceeds 100MB limit`
        });
        results.categories['File Requirements'].failed++;
      }

      // Check file naming
      if (!TRC_RULES.FILE_CHECKS.FILE_NAMING.pattern.test(file.name)) {
        results.errors.push({
          rule: TRC_RULES.FILE_CHECKS.FILE_NAMING,
          file: file.name,
          message: 'File name does not follow eCTD naming conventions'
        });
        results.categories['File Requirements'].failed++;
      }
    });
  }

  // Run dataset checks
  if (submission.datasets) {
    // Check for required domains
    const presentDomains = Object.keys(submission.datasets);
    TRC_RULES.SEND_CHECKS.REQUIRED_DOMAINS.required.forEach(domain => {
      if (!presentDomains.includes(domain)) {
        results.errors.push({
          rule: TRC_RULES.SEND_CHECKS.REQUIRED_DOMAINS,
          message: `Required SEND domain '${domain}' is missing`
        });
        results.categories['SEND Compliance'].failed++;
      }
    });

    // Validate each dataset
    Object.entries(submission.datasets).forEach(([domain, dataset]) => {
      const domainValidation = validateSENDDataset(dataset, domain);
      if (!domainValidation.valid) {
        results.errors.push(...domainValidation.errors);
        results.categories['SEND Compliance'].failed += domainValidation.errors.length;
      }
      results.warnings.push(...domainValidation.warnings);
    });
  }

  // Check for define.xml
  if (!submission.defineXML) {
    results.errors.push({
      rule: TRC_RULES.DEFINE_CHECKS.DEFINE_PRESENT,
      message: 'Define.xml is missing'
    });
    results.categories['Metadata Requirements'].failed++;
  }

  // Calculate scores
  let totalChecks = 0;
  let passedChecks = 0;

  Object.values(results.categories).forEach(cat => {
    const total = cat.passed + cat.failed;
    if (total > 0) {
      cat.score = Math.round((cat.passed / total) * 100);
      totalChecks += total;
      passedChecks += cat.passed;
    }
  });

  results.score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
  results.passed = results.errors.length === 0;

  return results;
}

/**
 * Generate Define.xml for SEND datasets
 * @param {Object} datasets - SEND datasets
 * @param {Object} metadata - Study metadata
 * @returns {string} Define.xml content
 */
export function generateDefineXML(datasets, metadata) {
  const xml = [];
  
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3"');
  xml.push('     xmlns:def="http://www.cdisc.org/ns/def/v2.1"');
  xml.push('     xmlns:xlink="http://www.w3.org/1999/xlink"');
  xml.push('     ODMVersion="1.3.2"');
  xml.push('     FileOID="DEFINE"');
  xml.push(`     FileType="Snapshot">`);
  
  xml.push(`  <Study OID="${metadata.studyId}">`);
  xml.push(`    <GlobalVariables>`);
  xml.push(`      <StudyName>${metadata.studyName}</StudyName>`);
  xml.push(`      <StudyDescription>${metadata.studyDescription}</StudyDescription>`);
  xml.push(`      <ProtocolName>${metadata.protocolName}</ProtocolName>`);
  xml.push(`    </GlobalVariables>`);
  
  // Add metadata for each dataset
  Object.entries(datasets).forEach(([domain, dataset]) => {
    xml.push(`    <MetaDataVersion OID="MDV.${domain}">`);
    xml.push(`      <def:Standards>`);
    xml.push(`        <def:Standard OID="STD.SEND" Name="SEND-IG" Type="IG" Version="3.1.1"/>`);
    xml.push(`      </def:Standards>`);
    
    // Add item definitions for each variable
    const domainSpec = SEND_DOMAINS[domain];
    if (domainSpec) {
      xml.push(`      <ItemGroupDef OID="IG.${domain}" Name="${domain}" Domain="${domain}">`);
      
      Object.entries(domainSpec.variables).forEach(([varName, varSpec]) => {
        xml.push(`        <ItemRef ItemOID="IT.${domain}.${varName}" Mandatory="${varSpec.required ? 'Yes' : 'No'}"/>`);
      });
      
      xml.push(`      </ItemGroupDef>`);
    }
    
    xml.push(`    </MetaDataVersion>`);
  });
  
  xml.push(`  </Study>`);
  xml.push('</ODM>');
  
  return xml.join('\n');
}

/**
 * Auto-fix common SEND compliance issues
 * @param {Object} dataset - Dataset to fix
 * @param {string} domain - Domain name
 * @returns {Object} Fixed dataset with applied corrections
 */
export function autoFixSENDIssues(dataset, domain) {
  const fixed = { ...dataset };
  const corrections = [];
  
  // Fix variable naming (truncate to 8 characters)
  if (fixed.variables) {
    fixed.variables = fixed.variables.map(varName => {
      if (varName.length > 8) {
        const newName = varName.substring(0, 8);
        corrections.push({
          type: 'VARIABLE_NAME',
          original: varName,
          corrected: newName,
          reason: 'Truncated to 8 character limit'
        });
        return newName;
      }
      return varName;
    });
  }
  
  // Add missing required variables
  const domainSpec = SEND_DOMAINS[domain];
  if (domainSpec) {
    Object.entries(domainSpec.variables).forEach(([varName, varSpec]) => {
      if (varSpec.required && !fixed.variables?.includes(varName)) {
        if (!fixed.variables) fixed.variables = [];
        fixed.variables.push(varName);
        corrections.push({
          type: 'MISSING_VARIABLE',
          variable: varName,
          action: 'Added required variable'
        });
      }
    });
  }
  
  // Fix date formats
  if (fixed.data) {
    fixed.data = fixed.data.map(row => {
      const fixedRow = { ...row };
      Object.keys(fixedRow).forEach(key => {
        if (key.endsWith('DTC') && fixedRow[key]) {
          // Convert various date formats to ISO 8601
          const dateStr = fixedRow[key];
          if (!TRC_RULES.SEND_CHECKS.DATE_FORMAT.pattern.test(dateStr)) {
            // Attempt to parse and reformat
            const parsed = new Date(dateStr);
            if (!isNaN(parsed)) {
              fixedRow[key] = parsed.toISOString().split('T')[0];
              corrections.push({
                type: 'DATE_FORMAT',
                variable: key,
                original: dateStr,
                corrected: fixedRow[key]
              });
            }
          }
        }
      });
      return fixedRow;
    });
  }
  
  return { dataset: fixed, corrections };
}

/**
 * Get validation summary for display
 * @param {Object} results - Validation results
 * @returns {Object} Summary statistics
 */
export function getValidationSummary(results) {
  return {
    overallScore: results.score,
    passed: results.passed,
    errorCount: results.errors.length,
    warningCount: results.warnings.length,
    categories: Object.entries(results.categories).map(([name, data]) => ({
      name,
      score: data.score,
      passed: data.passed,
      failed: data.failed,
      status: data.score >= 90 ? 'success' : data.score >= 70 ? 'warning' : 'error'
    })),
    criticalErrors: results.errors.filter(e => e.severity === 'ERROR'),
    canSubmit: results.score >= 95 && results.errors.filter(e => e.severity === 'ERROR').length === 0
  };
}