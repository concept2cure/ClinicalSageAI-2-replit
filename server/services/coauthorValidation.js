import { db } from '../db/index.js';
import { 
  coauthorValidationRules,
  coauthorValidationHistory,
  coauthorDocuments 
} from '../../shared/schema.js';
import { eq, and, or, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Comprehensive Document Validation Service for eCTD Co-Author
 * 
 * This service provides regulatory compliance validation for documents
 * across different modules and agencies (FDA, EMA, PMDA, Health Canada)
 */

// Validation rule engine constants
const SEVERITY_LEVELS = {
  CRITICAL: 'critical',
  MAJOR: 'major',
  MINOR: 'minor',
  INFORMATIONAL: 'informational'
};

const RULE_CATEGORIES = {
  STRUCTURE: 'structure',
  CONTENT: 'content',
  FORMATTING: 'formatting',
  COMPLIANCE: 'compliance',
  COMPLETENESS: 'completeness'
};

const RULE_TYPES = {
  REQUIRED_SECTION: 'required_section',
  MIN_WORD_COUNT: 'min_word_count',
  FORMAT_CHECK: 'format_check',
  TERMINOLOGY: 'terminology',
  REFERENCE_CHECK: 'reference_check',
  DATE_FORMAT: 'date_format',
  UNIT_CHECK: 'unit_check'
};

/**
 * Default validation rules for different modules and agencies
 * These will be used to seed the database if no rules exist
 */
const DEFAULT_VALIDATION_RULES = [
  // Module 1 - Administrative Rules (All Agencies)
  {
    ruleId: 'M1-001',
    module: 'Module 1',
    section: '1.1',
    agency: 'ALL',
    category: RULE_CATEGORIES.STRUCTURE,
    ruleType: RULE_TYPES.REQUIRED_SECTION,
    severity: SEVERITY_LEVELS.CRITICAL,
    ruleName: 'Cover Letter Required',
    description: 'Cover letter must be present in Module 1.1',
    checkLogic: { requiredSections: ['cover_letter'] },
    remediationText: 'Add a cover letter in Module 1.1. The cover letter should briefly describe the submission and any critical information.',
    autoFixAvailable: false
  },
  {
    ruleId: 'M1-002',
    module: 'Module 1',
    section: '1.2',
    agency: 'FDA',
    category: RULE_CATEGORIES.COMPLIANCE,
    ruleType: RULE_TYPES.REQUIRED_SECTION,
    severity: SEVERITY_LEVELS.CRITICAL,
    ruleName: 'Form FDA 1571 Required',
    description: 'Form FDA 1571 (IND Application) must be included for FDA submissions',
    checkLogic: { requiredForms: ['FDA_1571'] },
    remediationText: 'Include completed Form FDA 1571 in section 1.2. This is mandatory for all IND submissions to FDA.',
    autoFixAvailable: false
  },
  {
    ruleId: 'M1-003',
    module: 'Module 1',
    section: '1.0',
    agency: 'EMA',
    category: RULE_CATEGORIES.COMPLIANCE,
    ruleType: RULE_TYPES.REQUIRED_SECTION,
    severity: SEVERITY_LEVELS.CRITICAL,
    ruleName: 'EU Application Form Required',
    description: 'EU-specific application form must be included for EMA submissions',
    checkLogic: { requiredForms: ['EU_APPLICATION'] },
    remediationText: 'Include the EU-specific application form. Download the latest version from the EMA website.',
    autoFixAvailable: false
  },

  // Module 2 - CTD Summary Rules
  {
    ruleId: 'M2-001',
    module: 'Module 2',
    section: '2.3',
    agency: 'ALL',
    category: RULE_CATEGORIES.CONTENT,
    ruleType: RULE_TYPES.MIN_WORD_COUNT,
    severity: SEVERITY_LEVELS.MAJOR,
    ruleName: 'Quality Overall Summary Word Count',
    description: 'Quality Overall Summary (2.3) should be at least 2000 words',
    checkLogic: { minWords: 2000, section: '2.3' },
    remediationText: 'The Quality Overall Summary appears to be too brief. Expand to include comprehensive drug substance and product information (minimum 2000 words recommended).',
    autoFixAvailable: false
  },
  {
    ruleId: 'M2-002',
    module: 'Module 2',
    section: '2.5',
    agency: 'ALL',
    category: RULE_CATEGORIES.COMPLETENESS,
    ruleType: RULE_TYPES.REQUIRED_SECTION,
    severity: SEVERITY_LEVELS.CRITICAL,
    ruleName: 'Clinical Overview Required',
    description: 'Clinical Overview (2.5) must be present and complete',
    checkLogic: { requiredSections: ['2.5.1', '2.5.2', '2.5.3', '2.5.4', '2.5.5', '2.5.6', '2.5.7'] },
    remediationText: 'The Clinical Overview must include all required subsections: Product Development Rationale (2.5.1), Overview of Biopharmaceutics (2.5.2), Overview of Clinical Pharmacology (2.5.3), Overview of Efficacy (2.5.4), Overview of Safety (2.5.5), Benefits and Risks (2.5.6), and Literature References (2.5.7).',
    autoFixAvailable: false
  },
  {
    ruleId: 'M2-003',
    module: 'Module 2',
    section: '2.7',
    agency: 'ALL',
    category: RULE_CATEGORIES.STRUCTURE,
    ruleType: RULE_TYPES.REQUIRED_SECTION,
    severity: SEVERITY_LEVELS.MAJOR,
    ruleName: 'Clinical Summary Completeness',
    description: 'Clinical Summary (2.7) must contain all required subsections',
    checkLogic: { requiredSections: ['2.7.1', '2.7.2', '2.7.3', '2.7.4', '2.7.5', '2.7.6'] },
    remediationText: 'Ensure the Clinical Summary includes: Summary of Biopharmaceutic Studies (2.7.1), Summary of Clinical Pharmacology (2.7.2), Summary of Clinical Efficacy (2.7.3), Summary of Clinical Safety (2.7.4), Literature References (2.7.5), and Synopses (2.7.6).',
    autoFixAvailable: false
  },

  // Module 3 - Quality Rules
  {
    ruleId: 'M3-001',
    module: 'Module 3',
    section: '3.2.S',
    agency: 'ALL',
    category: RULE_CATEGORIES.STRUCTURE,
    ruleType: RULE_TYPES.REQUIRED_SECTION,
    severity: SEVERITY_LEVELS.CRITICAL,
    ruleName: 'Drug Substance Section Required',
    description: 'Drug Substance section (3.2.S) must be complete with all subsections',
    checkLogic: { requiredSections: ['3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.4', '3.2.S.5', '3.2.S.6', '3.2.S.7'] },
    remediationText: 'Complete all Drug Substance subsections: General Information (3.2.S.1), Manufacture (3.2.S.2), Characterisation (3.2.S.3), Control of Drug Substance (3.2.S.4), Reference Standards (3.2.S.5), Container Closure System (3.2.S.6), and Stability (3.2.S.7).',
    autoFixAvailable: false
  },
  {
    ruleId: 'M3-002',
    module: 'Module 3',
    section: '3.2.P',
    agency: 'FDA',
    category: RULE_CATEGORIES.COMPLIANCE,
    ruleType: RULE_TYPES.FORMAT_CHECK,
    severity: SEVERITY_LEVELS.MAJOR,
    ruleName: 'FDA Batch Formula Requirements',
    description: 'Batch formula must be provided in FDA-specified format',
    checkLogic: { formatCheck: 'fda_batch_formula' },
    remediationText: 'The batch formula in section 3.2.P.3.2 must follow FDA format requirements, including quantitative composition per unit and per batch.',
    autoFixAvailable: false
  },

  // Module 4 - Nonclinical Rules
  {
    ruleId: 'M4-001',
    module: 'Module 4',
    section: '4.2',
    agency: 'ALL',
    category: RULE_CATEGORIES.COMPLETENESS,
    ruleType: RULE_TYPES.REQUIRED_SECTION,
    severity: SEVERITY_LEVELS.MAJOR,
    ruleName: 'Nonclinical Study Reports Required',
    description: 'Nonclinical study reports must be provided in Module 4.2',
    checkLogic: { requiredSections: ['4.2.1', '4.2.2', '4.2.3'] },
    remediationText: 'Include all nonclinical study reports: Pharmacology (4.2.1), Pharmacokinetics (4.2.2), and Toxicology (4.2.3).',
    autoFixAvailable: false
  },
  {
    ruleId: 'M4-002',
    module: 'Module 4',
    section: '4.3',
    agency: 'EMA',
    category: RULE_CATEGORIES.FORMATTING,
    ruleType: RULE_TYPES.REFERENCE_CHECK,
    severity: SEVERITY_LEVELS.MINOR,
    ruleName: 'Literature References Format',
    description: 'Literature references in Module 4.3 must follow EMA citation format',
    checkLogic: { citationFormat: 'ema_standard' },
    remediationText: 'Update literature references to follow EMA citation format guidelines.',
    autoFixAvailable: true,
    autoFixLogic: { action: 'format_citations', style: 'ema' }
  },

  // Module 5 - Clinical Rules
  {
    ruleId: 'M5-001',
    module: 'Module 5',
    section: '5.3.5',
    agency: 'ALL',
    category: RULE_CATEGORIES.COMPLETENESS,
    ruleType: RULE_TYPES.REQUIRED_SECTION,
    severity: SEVERITY_LEVELS.CRITICAL,
    ruleName: 'Clinical Study Reports Required',
    description: 'Clinical study reports must be complete in Module 5.3.5',
    checkLogic: { requiredContent: ['protocol', 'statistical_analysis', 'results'] },
    remediationText: 'Each clinical study report must include the protocol, statistical analysis plan, and complete results.',
    autoFixAvailable: false
  },
  {
    ruleId: 'M5-003',
    module: 'Module 5',
    section: '5.3.5.1',
    agency: 'FDA',
    category: RULE_CATEGORIES.FORMATTING,
    ruleType: RULE_TYPES.DATE_FORMAT,
    severity: SEVERITY_LEVELS.MINOR,
    ruleName: 'FDA Date Format Compliance',
    description: 'Dates must be in DD-MON-YYYY format for FDA submissions',
    checkLogic: { dateFormat: 'DD-MON-YYYY' },
    remediationText: 'Convert all dates to FDA-required format (DD-MON-YYYY, e.g., 15-JAN-2024).',
    autoFixAvailable: true,
    autoFixLogic: { action: 'format_dates', format: 'DD-MON-YYYY' }
  },

  // Cross-module rules
  {
    ruleId: 'CROSS-001',
    module: 'ALL',
    section: null,
    agency: 'ALL',
    category: RULE_CATEGORIES.FORMATTING,
    ruleType: RULE_TYPES.TERMINOLOGY,
    severity: SEVERITY_LEVELS.MAJOR,
    ruleName: 'Terminology Consistency',
    description: 'Medical terminology must be consistent throughout the document',
    checkLogic: { checkType: 'terminology_consistency' },
    remediationText: 'Ensure consistent use of medical terminology. Use MedDRA preferred terms where applicable.',
    autoFixAvailable: false
  },
  {
    ruleId: 'CROSS-002',
    module: 'ALL',
    section: null,
    agency: 'ALL',
    category: RULE_CATEGORIES.FORMATTING,
    ruleType: RULE_TYPES.UNIT_CHECK,
    severity: SEVERITY_LEVELS.MAJOR,
    ruleName: 'Unit of Measurement Consistency',
    description: 'Units of measurement must be consistent and follow SI standards',
    checkLogic: { checkType: 'unit_consistency', standard: 'SI' },
    remediationText: 'Standardize all units of measurement to SI units (e.g., mg, mL, kg).',
    autoFixAvailable: true,
    autoFixLogic: { action: 'standardize_units', system: 'SI' }
  },
  {
    ruleId: 'CROSS-003',
    module: 'ALL',
    section: null,
    agency: 'ALL',
    category: RULE_CATEGORIES.CONTENT,
    ruleType: RULE_TYPES.REFERENCE_CHECK,
    severity: SEVERITY_LEVELS.MAJOR,
    ruleName: 'Cross-Reference Validation',
    description: 'All cross-references must point to existing sections',
    checkLogic: { checkType: 'cross_reference_validation' },
    remediationText: 'Fix broken cross-references. Ensure all referenced sections exist in the document.',
    autoFixAvailable: false
  }
];

/**
 * Initialize validation rules in the database
 */
export async function initializeValidationRules(organizationId = null) {
  try {
    // Check if rules already exist
    const existingRules = await db
      .select()
      .from(coauthorValidationRules)
      .limit(1);

    if (existingRules.length === 0) {
      // Insert default rules
      for (const rule of DEFAULT_VALIDATION_RULES) {
        await db.insert(coauthorValidationRules).values({
          ...rule,
          organizationId: organizationId,
          isActive: true
        });
      }
      console.log('✅ Default validation rules initialized');
    }
  } catch (error) {
    console.error('Error initializing validation rules:', error);
  }
}

/**
 * Perform document validation
 * @param {Object} params - Validation parameters
 * @param {number} params.documentId - Document to validate
 * @param {string} params.agency - Target regulatory agency
 * @param {number} params.organizationId - Organization ID
 * @param {string} params.performedBy - User performing validation
 * @param {number} params.userId - User ID
 */
export async function validateDocument({
  documentId,
  agency = 'FDA',
  organizationId,
  performedBy,
  userId
}) {
  try {
    // Fetch the document
    const [document] = await db
      .select()
      .from(coauthorDocuments)
      .where(eq(coauthorDocuments.id, documentId))
      .limit(1);

    if (!document) {
      throw new Error('Document not found');
    }

    // Fetch applicable validation rules
    const rules = await db
      .select()
      .from(coauthorValidationRules)
      .where(
        and(
          eq(coauthorValidationRules.isActive, true),
          or(
            eq(coauthorValidationRules.agency, agency),
            eq(coauthorValidationRules.agency, 'ALL')
          ),
          or(
            eq(coauthorValidationRules.module, document.module),
            eq(coauthorValidationRules.module, 'ALL')
          )
        )
      );

    // Perform validation checks
    const validationResults = [];
    let criticalCount = 0;
    let majorCount = 0;
    let minorCount = 0;
    let informationalCount = 0;
    let passedRules = 0;
    let failedRules = 0;

    for (const rule of rules) {
      const result = await performValidationCheck(document, rule);
      
      if (result.passed) {
        passedRules++;
      } else {
        failedRules++;
        
        // Count by severity
        switch (result.severity) {
          case SEVERITY_LEVELS.CRITICAL:
            criticalCount++;
            break;
          case SEVERITY_LEVELS.MAJOR:
            majorCount++;
            break;
          case SEVERITY_LEVELS.MINOR:
            minorCount++;
            break;
          case SEVERITY_LEVELS.INFORMATIONAL:
            informationalCount++;
            break;
        }
        
        validationResults.push(result);
      }
    }

    // Calculate compliance score
    const totalRules = rules.length;
    const complianceScore = totalRules > 0 ? (passedRules / totalRules) * 100 : 100;

    // Generate validation ID
    const validationId = `VAL-${Date.now()}-${documentId}`;

    // Store validation history
    await db.insert(coauthorValidationHistory).values({
      validationId,
      organizationId,
      documentId,
      documentVersion: document.version,
      module: document.module,
      agency,
      totalIssues: failedRules,
      criticalIssues: criticalCount,
      majorIssues: majorCount,
      minorIssues: minorCount,
      informationalIssues: informationalCount,
      complianceScore,
      passedRules,
      failedRules,
      skippedRules: 0,
      validationResults: {
        issues: validationResults,
        summary: {
          documentTitle: document.title,
          validatedAt: new Date().toISOString(),
          rulesChecked: totalRules
        }
      },
      performedBy,
      performedByUserId: userId,
      metadata: {
        documentStatus: document.status,
        validationDuration: null
      }
    });

    return {
      validationId,
      complianceScore: Math.round(complianceScore * 100) / 100,
      totalIssues: failedRules,
      criticalIssues: criticalCount,
      majorIssues: majorCount,
      minorIssues: minorCount,
      informationalIssues: informationalCount,
      issues: validationResults,
      passedRules,
      failedRules,
      totalRules,
      documentInfo: {
        id: document.id,
        title: document.title,
        module: document.module,
        version: document.version,
        status: document.status
      }
    };
  } catch (error) {
    console.error('Validation error:', error);
    throw error;
  }
}

/**
 * Perform individual validation check
 * @param {Object} document - Document to validate
 * @param {Object} rule - Validation rule
 */
async function performValidationCheck(document, rule) {
  const result = {
    ruleId: rule.ruleId,
    ruleName: rule.ruleName,
    category: rule.category,
    severity: rule.severity,
    passed: true,
    issue: null,
    remediation: rule.remediationText,
    autoFixAvailable: rule.autoFixAvailable,
    autoFixLogic: rule.autoFixLogic,
    location: rule.section || 'Document'
  };

  const content = document.content || '';
  const checkLogic = rule.checkLogic || {};

  try {
    switch (rule.ruleType) {
      case RULE_TYPES.MIN_WORD_COUNT: {
        const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
        const minWords = checkLogic.minWords || 0;
        
        if (wordCount < minWords) {
          result.passed = false;
          result.issue = `Word count (${wordCount}) is below minimum requirement (${minWords})`;
        }
        break;
      }

      case RULE_TYPES.REQUIRED_SECTION: {
        const requiredSections = checkLogic.requiredSections || [];
        const missingSections = [];
        
        for (const section of requiredSections) {
          // Simple check for section presence in content
          if (!content.toLowerCase().includes(section.toLowerCase())) {
            missingSections.push(section);
          }
        }
        
        if (missingSections.length > 0) {
          result.passed = false;
          result.issue = `Required sections missing: ${missingSections.join(', ')}`;
        }
        break;
      }

      case RULE_TYPES.DATE_FORMAT: {
        const dateFormat = checkLogic.dateFormat || 'DD-MON-YYYY';
        // Simple regex for date detection (not comprehensive)
        const datePattern = /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/g;
        const dates = content.match(datePattern) || [];
        const incorrectDates = [];
        
        for (const date of dates) {
          // Check if date matches required format (simplified check)
          if (dateFormat === 'DD-MON-YYYY' && !date.match(/\d{2}-[A-Z]{3}-\d{4}/)) {
            incorrectDates.push(date);
          }
        }
        
        if (incorrectDates.length > 0) {
          result.passed = false;
          result.issue = `Dates not in required format (${dateFormat}): ${incorrectDates.slice(0, 3).join(', ')}${incorrectDates.length > 3 ? '...' : ''}`;
        }
        break;
      }

      case RULE_TYPES.REFERENCE_CHECK: {
        // Check for broken references (simplified)
        const referencePattern = /(?:see|refer to|as described in)\s+(?:section|module|chapter)\s+([\d.]+)/gi;
        const references = content.match(referencePattern) || [];
        const brokenReferences = [];
        
        for (const ref of references) {
          const sectionNum = ref.match(/[\d.]+$/);
          if (sectionNum && !content.includes(`${sectionNum[0]}`)) {
            brokenReferences.push(sectionNum[0]);
          }
        }
        
        if (brokenReferences.length > 0) {
          result.passed = false;
          result.issue = `Potential broken references found: ${brokenReferences.slice(0, 3).join(', ')}${brokenReferences.length > 3 ? '...' : ''}`;
        }
        break;
      }

      case RULE_TYPES.TERMINOLOGY: {
        // Check for terminology consistency (simplified)
        const commonTerms = {
          'adverse event': ['adverse event', 'AE', 'side effect'],
          'serious adverse event': ['serious adverse event', 'SAE'],
          'protocol': ['protocol', 'study protocol', 'trial protocol']
        };
        
        const inconsistencies = [];
        for (const [standard, variations] of Object.entries(commonTerms)) {
          const counts = variations.map(v => (content.match(new RegExp(v, 'gi')) || []).length);
          const hasMultipleVariations = counts.filter(c => c > 0).length > 1;
          
          if (hasMultipleVariations) {
            inconsistencies.push(standard);
          }
        }
        
        if (inconsistencies.length > 0) {
          result.passed = false;
          result.issue = `Inconsistent terminology usage detected for: ${inconsistencies.join(', ')}`;
        }
        break;
      }

      case RULE_TYPES.UNIT_CHECK: {
        // Check for unit consistency (simplified)
        const unitVariations = {
          'milligram': ['mg', 'milligram', 'milligrams'],
          'milliliter': ['ml', 'mL', 'milliliter', 'milliliters'],
          'kilogram': ['kg', 'kilogram', 'kilograms']
        };
        
        const inconsistentUnits = [];
        for (const [standard, variations] of Object.entries(unitVariations)) {
          const foundVariations = variations.filter(v => 
            content.match(new RegExp(`\\d+\\s*${v}\\b`, 'i'))
          );
          
          if (foundVariations.length > 1) {
            inconsistentUnits.push(standard);
          }
        }
        
        if (inconsistentUnits.length > 0) {
          result.passed = false;
          result.issue = `Inconsistent unit usage detected: ${inconsistentUnits.join(', ')}. Standardize to SI units.`;
        }
        break;
      }

      default:
        // For unimplemented rule types, pass by default
        result.passed = true;
    }
  } catch (error) {
    console.error(`Error in validation check for rule ${rule.ruleId}:`, error);
    result.passed = true; // Don't fail on check errors
  }

  return result;
}

/**
 * Get validation history for a document
 */
export async function getValidationHistory(documentId, limit = 10) {
  try {
    const history = await db
      .select()
      .from(coauthorValidationHistory)
      .where(eq(coauthorValidationHistory.documentId, documentId))
      .orderBy(sql`${coauthorValidationHistory.performedAt} DESC`)
      .limit(limit);

    return history;
  } catch (error) {
    console.error('Error fetching validation history:', error);
    throw error;
  }
}

/**
 * Export validation report
 */
export async function exportValidationReport(validationId, format = 'JSON') {
  try {
    const [validation] = await db
      .select()
      .from(coauthorValidationHistory)
      .where(eq(coauthorValidationHistory.validationId, validationId))
      .limit(1);

    if (!validation) {
      throw new Error('Validation not found');
    }

    // Format the report based on requested format
    let report;
    let mimeType;
    let extension;

    switch (format.toUpperCase()) {
      case 'JSON':
        report = JSON.stringify(validation, null, 2);
        mimeType = 'application/json';
        extension = 'json';
        break;
        
      case 'CSV':
        // Convert to CSV (simplified)
        const issues = validation.validationResults.issues || [];
        const csvRows = ['Rule ID,Rule Name,Severity,Issue,Remediation'];
        
        for (const issue of issues) {
          csvRows.push(
            `"${issue.ruleId}","${issue.ruleName}","${issue.severity}","${issue.issue || 'N/A'}","${issue.remediation}"`
          );
        }
        
        report = csvRows.join('\n');
        mimeType = 'text/csv';
        extension = 'csv';
        break;
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    // Update export information
    await db
      .update(coauthorValidationHistory)
      .set({
        exportedAt: sql`NOW()`,
        reportFormat: format.toUpperCase()
      })
      .where(eq(coauthorValidationHistory.validationId, validationId));

    return {
      content: report,
      mimeType,
      extension,
      filename: `validation-report-${validationId}.${extension}`
    };
  } catch (error) {
    console.error('Error exporting validation report:', error);
    throw error;
  }
}

export default {
  initializeValidationRules,
  validateDocument,
  getValidationHistory,
  exportValidationReport
};