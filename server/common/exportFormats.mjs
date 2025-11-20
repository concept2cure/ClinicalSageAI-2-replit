// Export Format Configurations for FDA and EU Compliance

// FDA Export Configuration (21 CFR Part 820, Part 11)
const FDA_FORMAT = {
  documentType: 'FDA Submission',
  formatting: {
    fontFamily: 'Times New Roman',
    fontSize: '12pt',
    lineHeight: 1.5,
    margins: {
      top: '1 inch',
      bottom: '1 inch',
      left: '1.25 inch',
      right: '1 inch'
    },
    pageNumbering: 'bottom-center',
    headers: {
      includeDocumentType: true,
      includeSubmissionNumber: true,
      includeDateGenerated: true
    },
    footers: {
      includePageNumber: true,
      includeConfidentialStatement: true,
      text: 'CONFIDENTIAL - FDA SUBMISSION'
    }
  },
  sections: {
    coverPage: {
      required: true,
      elements: [
        'FDA Logo',
        'Submission Type',
        'Device Name',
        'Manufacturer Information',
        'Date of Submission',
        'FDA Establishment Registration Number'
      ]
    },
    tableOfContents: {
      required: true,
      autoGenerate: true,
      includePageNumbers: true
    },
    executiveSummary: {
      required: true,
      maxPages: 5
    },
    signatures: {
      required: true,
      electronicSignature: true,
      cfr21Part11Compliant: true
    }
  },
  metadata: {
    documentControl: {
      versionControl: true,
      changeHistory: true,
      auditTrail: true
    },
    regulatoryReferences: {
      include21CFR820: true,
      include21CFR11: true,
      includeFDCActSections: true
    }
  }
};

// EU MDR/IVDR Export Configuration (Regulation 2017/745, 2017/746)
const EU_FORMAT = {
  documentType: 'EU MDR/IVDR Submission',
  formatting: {
    fontFamily: 'Arial, Helvetica',
    fontSize: '11pt',
    lineHeight: 1.4,
    margins: {
      top: '2.5 cm',
      bottom: '2.5 cm',
      left: '3 cm',
      right: '2.5 cm'
    },
    pageNumbering: 'bottom-right',
    headers: {
      includeDocumentType: true,
      includeCEMark: true,
      includeNotifiedBodyNumber: true
    },
    footers: {
      includePageNumber: true,
      includeConfidentialStatement: true,
      text: 'CONFIDENTIAL - EU MDR/IVDR SUBMISSION'
    }
  },
  sections: {
    coverPage: {
      required: true,
      elements: [
        'CE Mark (if applicable)',
        'Notified Body Information',
        'Device Classification',
        'Manufacturer Details',
        'Authorized Representative (if applicable)',
        'Date of Compilation'
      ]
    },
    tableOfContents: {
      required: true,
      autoGenerate: true,
      includeAnnexReferences: true
    },
    technicalDocumentation: {
      required: true,
      structure: 'Annex II and III MDR/IVDR'
    },
    clinicalEvaluation: {
      required: true,
      includePMCF: true,  // Post-Market Clinical Follow-up
      includePMS: true    // Post-Market Surveillance
    },
    languageRequirements: {
      primaryLanguage: 'English',
      memberStateLanguages: true
    }
  },
  metadata: {
    documentControl: {
      versionControl: true,
      changeTracking: true,
      documentLifecycle: true
    },
    regulatoryReferences: {
      includeMDR2017_745: true,
      includeIVDR2017_746: true,
      includeISO13485: true,
      includeISO14971: true
    },
    harmonizedStandards: {
      includeENISO: true,
      listApplicableStandards: true
    }
  }
};

// 510(k) Specific Export Format
const FDA_510K_FORMAT = {
  ...FDA_FORMAT,
  documentType: '510(k) Premarket Notification',
  specificRequirements: {
    coverLetter: {
      required: true,
      includeDeviceName: true,
      include510kNumber: true,
      includeContactInfo: true
    },
    substantialEquivalence: {
      required: true,
      predicateComparison: true,
      comparisonTables: true,
      performanceData: true
    },
    sections: [
      '1. Device Name',
      '2. Establishment Registration',
      '3. Class II Summary and Certification',
      '4. Indications for Use',
      '5. 510(k) Summary or Statement',
      '6. Truthful and Accuracy Statement',
      '7. Device Description',
      '8. Substantial Equivalence Discussion',
      '9. Proposed Labeling',
      '10. Performance Data',
      '11. Biocompatibility',
      '12. Software Validation (if applicable)',
      '13. Sterilization (if applicable)',
      '14. Shelf Life (if applicable)',
      '15. Clinical Studies (if applicable)'
    ]
  },
  eSTAR: {
    compatible: true,
    format: 'FDA eSTAR v2.0',
    xmlGeneration: true
  }
};

// PMA Specific Export Format
const FDA_PMA_FORMAT = {
  ...FDA_FORMAT,
  documentType: 'Premarket Approval (PMA)',
  specificRequirements: {
    administrativeInformation: {
      required: true,
      pmaNumber: true,
      supplementNumber: false
    },
    modules: {
      moduleA: 'Administrative Information',
      moduleB: 'Device Description',
      moduleC: 'Manufacturing Information',
      moduleD: 'Reference to Performance Standards',
      moduleE: 'Nonclinical Laboratory Studies',
      moduleF: 'Clinical Investigations',
      moduleG: 'Summary of Safety and Effectiveness',
      moduleH: 'Labeling',
      moduleI: 'Environmental Assessment',
      moduleJ: 'Other Information'
    },
    clinicalData: {
      required: true,
      studyProtocols: true,
      informedConsent: true,
      caseReportForms: true,
      statisticalAnalysis: true
    }
  }
};

// CER Specific Export Format (EU)
const EU_CER_FORMAT = {
  ...EU_FORMAT,
  documentType: 'Clinical Evaluation Report (CER)',
  specificRequirements: {
    structure: {
      executiveSummary: true,
      scopeAndPlan: true,
      clinicalBackground: true,
      deviceDescription: true,
      clinicalEvaluation: true,
      postMarketData: true,
      conclusions: true,
      dateAndSignatures: true,
      qualificationOfAuthors: true,
      references: true,
      appendices: true
    },
    meddevGuidelines: {
      includeMEDDEV2_7_1Rev4: true,
      clinicalDataSources: [
        'Clinical investigations',
        'Literature review',
        'Post-market surveillance',
        'Post-market clinical follow-up'
      ]
    },
    riskBenefitAnalysis: {
      required: true,
      quantitativeAnalysis: true,
      qualitativeAnalysis: true,
      comparisonWithAlternatives: true
    },
    languageVersions: {
      primaryEnglish: true,
      memberStateTranslations: false
    }
  }
};

// Helper function to format document according to specifications
function formatDocument(content, docType, exportFormat) {
  let format;
  
  switch (docType) {
    case '510k':
      format = FDA_510K_FORMAT;
      break;
    case 'pma':
      format = FDA_PMA_FORMAT;
      break;
    case 'cer':
      format = EU_CER_FORMAT;
      break;
    default:
      format = FDA_FORMAT;
  }
  
  // Apply formatting rules
  const formattedContent = {
    metadata: {
      documentType: format.documentType,
      generatedDate: new Date().toISOString(),
      formatVersion: exportFormat === 'pdf' ? 'PDF/A-2' : 'DOCX',
      compliance: format.metadata
    },
    formatting: format.formatting,
    content: content,
    sections: format.sections || format.specificRequirements?.sections || []
  };
  
  return formattedContent;
}

// Helper function to validate document completeness
function validateDocumentCompleteness(content, docType) {
  const errors = [];
  const warnings = [];
  
  // Check for required sections based on document type
  let requiredSections = [];
  
  switch (docType) {
    case '510k':
      requiredSections = FDA_510K_FORMAT.specificRequirements.sections;
      break;
    case 'pma':
      requiredSections = Object.values(FDA_PMA_FORMAT.specificRequirements.modules);
      break;
    case 'cer':
      requiredSections = Object.keys(EU_CER_FORMAT.specificRequirements.structure);
      break;
  }
  
  // Check each required section
  requiredSections.forEach(section => {
    const sectionName = typeof section === 'string' ? section : section.name;
    if (!content.toLowerCase().includes(sectionName.toLowerCase())) {
      warnings.push(`Missing or incomplete section: ${sectionName}`);
    }
  });
  
  // Check for minimum content length
  if (content.length < 1000) {
    errors.push('Document appears to be incomplete (less than 1000 characters)');
  }
  
  // Check for placeholder text
  const placeholders = ['[PLACEHOLDER]', '[TODO]', '[INSERT', '[PENDING]', 'TBD'];
  placeholders.forEach(placeholder => {
    if (content.includes(placeholder)) {
      warnings.push(`Found placeholder text: ${placeholder}`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    completeness: Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5))
  };
}

// Helper function to generate cover page
function generateCoverPage(docType, metadata) {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  let coverPage = '';
  
  switch (docType) {
    case '510k':
      coverPage = `
510(k) PREMARKET NOTIFICATION

Device Name: ${metadata.deviceName || '[Device Name]'}
510(k) Number: ${metadata.k510Number || '[To be assigned]'}
Manufacturer: ${metadata.manufacturerName || '[Manufacturer Name]'}
Date: ${date}

Submitted to:
U.S. Food and Drug Administration
Center for Devices and Radiological Health
Document Control Center - WO66-G609
10903 New Hampshire Avenue
Silver Spring, MD 20993-0002

CONFIDENTIAL
`;
      break;
      
    case 'pma':
      coverPage = `
PREMARKET APPROVAL APPLICATION (PMA)

Device Name: ${metadata.deviceName || '[Device Name]'}
PMA Number: ${metadata.pmaNumber || '[To be assigned]'}
Manufacturer: ${metadata.manufacturerName || '[Manufacturer Name]'}
Date: ${date}

Submitted to:
U.S. Food and Drug Administration
Center for Devices and Radiological Health

CONFIDENTIAL
`;
      break;
      
    case 'cer':
      coverPage = `
CLINICAL EVALUATION REPORT (CER)
According to MEDDEV 2.7/1 Rev. 4

Device Name: ${metadata.deviceName || '[Device Name]'}
Device Classification: ${metadata.deviceClass || '[Class]'}
Manufacturer: ${metadata.manufacturerName || '[Manufacturer Name]'}
Date: ${date}

Prepared for:
${metadata.notifiedBody || '[Notified Body Name]'}
Notified Body Number: ${metadata.notifiedBodyNumber || '[NB Number]'}

In accordance with:
- Regulation (EU) 2017/745 (MDR)
- Regulation (EU) 2017/746 (IVDR)

CONFIDENTIAL
`;
      break;
  }
  
  return coverPage;
}

export {
  FDA_FORMAT,
  EU_FORMAT,
  FDA_510K_FORMAT,
  FDA_PMA_FORMAT,
  EU_CER_FORMAT,
  formatDocument,
  validateDocumentCompleteness,
  generateCoverPage
};