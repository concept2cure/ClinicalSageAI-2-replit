/**
 * Compliance Rules Engine
 * 
 * Phase 5: Intelligent Document System
 * Real-time compliance scoring and validation for regulatory documents.
 * 
 * Features:
 * - Rule-based document validation
 * - Real-time compliance scoring
 * - Missing section detection
 * - Citation completeness checking
 * - Regulatory standard alignment (ICH, FDA, etc.)
 * - 21 CFR Part 11 compliance verification
 */

import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SubmissionType = 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO' | 'EUA';

export type RuleSeverity = 'error' | 'warning' | 'info';

export type RuleCategory =
  | 'structure'
  | 'content'
  | 'citation'
  | 'format'
  | 'completeness'
  | 'regulatory'
  | 'data_integrity'
  | 'signature';

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
  applicableSubmissions: SubmissionType[];
  regulatoryReference?: string;
  check: (document: DocumentToValidate) => ComplianceViolation[];
}

export interface ComplianceViolation {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  category: RuleCategory;
  message: string;
  suggestion?: string;
  location?: {
    section?: string;
    line?: number;
    range?: { from: number; to: number };
  };
  regulatoryReference?: string;
}

export interface DocumentToValidate {
  id: string;
  title: string;
  content: string;
  type: string;
  submissionType: SubmissionType;
  sections: DocumentSection[];
  citations: Citation[];
  metadata: Record<string, unknown>;
}

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  level: number;
  required: boolean;
  order: number;
}

export interface Citation {
  id: string;
  text: string;
  sourceId: string;
  sourceHash: string;
  verified: boolean;
}

export interface ComplianceScore {
  overall: number;
  breakdown: {
    structure: number;
    content: number;
    citations: number;
    format: number;
    completeness: number;
    regulatory: number;
    dataIntegrity: number;
    signature: number;
  };
  violations: ComplianceViolation[];
  passedRules: number;
  totalRules: number;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Required Sections by Submission Type
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_SECTIONS: Record<SubmissionType, string[]> = {
  IND: [
    'Cover Letter',
    'Form FDA 1571',
    'Table of Contents',
    'Introductory Statement',
    'General Investigational Plan',
    'Investigator\'s Brochure',
    'Clinical Protocol',
    'Chemistry, Manufacturing, and Controls (CMC)',
    'Pharmacology and Toxicology',
    'Previous Human Experience',
  ],
  '510K': [
    'Cover Letter',
    'CDRH Premarket Review Submission Cover Sheet',
    'Table of Contents',
    'Indications for Use Statement',
    'Device Description',
    'Substantial Equivalence Comparison',
    'Non-Clinical Performance Testing',
    'Biocompatibility',
    'Sterilization and Shelf Life',
    'Software Documentation',
    'Labeling',
  ],
  NDA: [
    'Cover Letter',
    'Form FDA 356h',
    'Table of Contents',
    'Module 1: Administrative Information',
    'Module 2: CTD Summaries',
    'Module 3: Quality',
    'Module 4: Nonclinical Study Reports',
    'Module 5: Clinical Study Reports',
    'Patent Information',
    'Exclusivity Claims',
  ],
  BLA: [
    'Cover Letter',
    'Form FDA 356h',
    'Table of Contents',
    'Module 1: Administrative Information',
    'Module 2: CTD Summaries',
    'Module 3: Quality',
    'Module 4: Nonclinical Study Reports',
    'Module 5: Clinical Study Reports',
    'Product Description',
    'Manufacturing Information',
  ],
  PMA: [
    'Cover Letter',
    'Table of Contents',
    'Device Description',
    'Indications for Use',
    'Marketing History',
    'Summary of Studies',
    'Nonclinical Laboratory Studies',
    'Clinical Investigations',
    'Bibliography',
    'Labeling',
  ],
  MAA: [
    'Cover Letter',
    'Module 1: Administrative Information',
    'Module 2: CTD Summaries',
    'Module 3: Quality',
    'Module 4: Nonclinical Study Reports',
    'Module 5: Clinical Study Reports',
    'Risk Management Plan',
    'Environmental Risk Assessment',
  ],
  DE_NOVO: [
    'Cover Letter',
    'De Novo Request Cover Sheet',
    'Table of Contents',
    'Device Description',
    'Indications for Use',
    'Risks and Mitigations',
    'Performance Testing',
    'Clinical Data',
    'Proposed Classification',
    'Labeling',
  ],
  EUA: [
    'Cover Letter',
    'EUA Request Letter',
    'Summary of Available Data',
    'Device Description',
    'Instructions for Use',
    'Known Benefits and Risks',
    'Authorization Scope',
    'Conditions of Authorization',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Rules Engine
// ─────────────────────────────────────────────────────────────────────────────

export class ComplianceRulesEngine {
  private static instance: ComplianceRulesEngine;
  private rules: Map<string, ComplianceRule> = new Map();

  private constructor() {
    this.initializeDefaultRules();
  }

  static getInstance(): ComplianceRulesEngine {
    if (!ComplianceRulesEngine.instance) {
      ComplianceRulesEngine.instance = new ComplianceRulesEngine();
    }
    return ComplianceRulesEngine.instance;
  }

  /**
   * Initialize default compliance rules
   */
  private initializeDefaultRules(): void {
    // Structure Rules
    this.addRule({
      id: 'STRUCT-001',
      name: 'Required Sections Present',
      description: 'All required sections for the submission type must be present',
      category: 'structure',
      severity: 'error',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      regulatoryReference: '21 CFR Part 314',
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        const required = REQUIRED_SECTIONS[doc.submissionType] || [];
        const sectionTitles = doc.sections.map(s => s.title.toLowerCase());

        for (const requiredSection of required) {
          const found = sectionTitles.some(t => 
            t.includes(requiredSection.toLowerCase()) ||
            requiredSection.toLowerCase().includes(t)
          );
          if (!found) {
            violations.push({
              ruleId: 'STRUCT-001',
              ruleName: 'Required Sections Present',
              severity: 'error',
              category: 'structure',
              message: `Missing required section: ${requiredSection}`,
              suggestion: `Add a section titled "${requiredSection}"`,
              regulatoryReference: '21 CFR Part 314',
            });
          }
        }
        return violations;
      },
    });

    this.addRule({
      id: 'STRUCT-002',
      name: 'Section Order',
      description: 'Sections should follow the standard regulatory order',
      category: 'structure',
      severity: 'warning',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA'],
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        const required = REQUIRED_SECTIONS[doc.submissionType] || [];
        let lastFoundIndex = -1;

        for (const section of doc.sections) {
          const expectedIndex = required.findIndex(r => 
            section.title.toLowerCase().includes(r.toLowerCase())
          );
          if (expectedIndex !== -1 && expectedIndex < lastFoundIndex) {
            violations.push({
              ruleId: 'STRUCT-002',
              ruleName: 'Section Order',
              severity: 'warning',
              category: 'structure',
              message: `Section "${section.title}" appears out of standard order`,
              suggestion: 'Consider reordering sections to match regulatory standards',
              location: { section: section.id },
            });
          }
          if (expectedIndex !== -1) {
            lastFoundIndex = expectedIndex;
          }
        }
        return violations;
      },
    });

    // Content Rules
    this.addRule({
      id: 'CONTENT-001',
      name: 'Minimum Content Length',
      description: 'Sections should have sufficient content',
      category: 'content',
      severity: 'warning',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        for (const section of doc.sections) {
          if (section.required && section.content.length < 100) {
            violations.push({
              ruleId: 'CONTENT-001',
              ruleName: 'Minimum Content Length',
              severity: 'warning',
              category: 'content',
              message: `Section "${section.title}" has insufficient content (${section.content.length} chars)`,
              suggestion: 'Expand this section with more detailed information',
              location: { section: section.id },
            });
          }
        }
        return violations;
      },
    });

    this.addRule({
      id: 'CONTENT-002',
      name: 'No Placeholder Text',
      description: 'Document should not contain placeholder or TODO text',
      category: 'content',
      severity: 'error',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        const placeholderPatterns = [
          /\[TODO\]/gi,
          /\[PLACEHOLDER\]/gi,
          /\[INSERT.*?\]/gi,
          /\[TBD\]/gi,
          /\[PENDING\]/gi,
          /XXXX/g,
          /lorem ipsum/gi,
        ];

        for (const pattern of placeholderPatterns) {
          const matches = doc.content.match(pattern);
          if (matches) {
            violations.push({
              ruleId: 'CONTENT-002',
              ruleName: 'No Placeholder Text',
              severity: 'error',
              category: 'content',
              message: `Document contains placeholder text: "${matches[0]}"`,
              suggestion: 'Replace placeholder text with actual content',
            });
          }
        }
        return violations;
      },
    });

    // Citation Rules
    this.addRule({
      id: 'CITE-001',
      name: 'All Claims Cited',
      description: 'Key claims should have supporting citations',
      category: 'citation',
      severity: 'warning',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        const claimPatterns = [
          /demonstrated\s+that/gi,
          /studies\s+show/gi,
          /clinical\s+data\s+indicates/gi,
          /evidence\s+suggests/gi,
          /proven\s+to\s+be/gi,
          /has\s+been\s+established/gi,
        ];

        for (const pattern of claimPatterns) {
          const matches = doc.content.match(pattern);
          if (matches && doc.citations.length === 0) {
            violations.push({
              ruleId: 'CITE-001',
              ruleName: 'All Claims Cited',
              severity: 'warning',
              category: 'citation',
              message: 'Document contains claims but no citations are present',
              suggestion: 'Add citations to support claims and statements',
            });
            break;
          }
        }
        return violations;
      },
    });

    this.addRule({
      id: 'CITE-002',
      name: 'Citation Integrity',
      description: 'All citations should be verified against source documents',
      category: 'citation',
      severity: 'error',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      regulatoryReference: '21 CFR Part 11',
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        for (const citation of doc.citations) {
          if (!citation.verified) {
            violations.push({
              ruleId: 'CITE-002',
              ruleName: 'Citation Integrity',
              severity: 'error',
              category: 'citation',
              message: `Citation "${citation.text.slice(0, 50)}..." has not been verified`,
              suggestion: 'Verify citation against source document',
              regulatoryReference: '21 CFR Part 11 § 11.10(e)',
            });
          }
        }
        return violations;
      },
    });

    // Regulatory Rules
    this.addRule({
      id: 'REG-001',
      name: 'Regulatory Terminology',
      description: 'Document should use appropriate regulatory terminology',
      category: 'regulatory',
      severity: 'info',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        const informalTerms: Record<string, string> = {
          'side effect': 'adverse event',
          'drug': 'medicinal product (MAA) / drug product (FDA)',
          'patient': 'subject (clinical trials)',
          'test': 'study / investigation',
        };

        for (const [informal, formal] of Object.entries(informalTerms)) {
          if (doc.content.toLowerCase().includes(informal)) {
            violations.push({
              ruleId: 'REG-001',
              ruleName: 'Regulatory Terminology',
              severity: 'info',
              category: 'regulatory',
              message: `Consider using regulatory term "${formal}" instead of "${informal}"`,
              suggestion: `Replace "${informal}" with "${formal}" for regulatory consistency`,
            });
          }
        }
        return violations;
      },
    });

    // Data Integrity Rules (21 CFR Part 11)
    this.addRule({
      id: 'DATA-001',
      name: 'Audit Trail Required',
      description: 'Changes to critical data must be tracked',
      category: 'data_integrity',
      severity: 'error',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      regulatoryReference: '21 CFR Part 11 § 11.10(e)',
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        // In production, this would check if audit trail is enabled
        if (!doc.metadata.auditTrailEnabled) {
          violations.push({
            ruleId: 'DATA-001',
            ruleName: 'Audit Trail Required',
            severity: 'error',
            category: 'data_integrity',
            message: 'Document does not have audit trail enabled',
            suggestion: 'Enable audit trail for 21 CFR Part 11 compliance',
            regulatoryReference: '21 CFR Part 11 § 11.10(e)',
          });
        }
        return violations;
      },
    });

    // Signature Rules
    this.addRule({
      id: 'SIG-001',
      name: 'Electronic Signature Required',
      description: 'Submission documents must be electronically signed',
      category: 'signature',
      severity: 'error',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      regulatoryReference: '21 CFR Part 11 § 11.100',
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        if (!doc.metadata.signed) {
          violations.push({
            ruleId: 'SIG-001',
            ruleName: 'Electronic Signature Required',
            severity: 'error',
            category: 'signature',
            message: 'Document has not been electronically signed',
            suggestion: 'Obtain required electronic signatures before submission',
            regulatoryReference: '21 CFR Part 11 § 11.100',
          });
        }
        return violations;
      },
    });

    // Format Rules
    this.addRule({
      id: 'FMT-001',
      name: 'Maximum Document Size',
      description: 'Individual documents should not exceed size limits',
      category: 'format',
      severity: 'warning',
      applicableSubmissions: ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
      check: (doc) => {
        const violations: ComplianceViolation[] = [];
        const maxSizeBytes = 10 * 1024 * 1024; // 10MB
        const contentSize = new Blob([doc.content]).size;
        
        if (contentSize > maxSizeBytes) {
          violations.push({
            ruleId: 'FMT-001',
            ruleName: 'Maximum Document Size',
            severity: 'warning',
            category: 'format',
            message: `Document exceeds recommended size (${Math.round(contentSize / 1024 / 1024)}MB)`,
            suggestion: 'Consider splitting into smaller sections',
          });
        }
        return violations;
      },
    });
  }

  /**
   * Add a compliance rule
   */
  addRule(rule: ComplianceRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove a compliance rule
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Get all rules for a submission type
   */
  getRulesForSubmission(submissionType: SubmissionType): ComplianceRule[] {
    return Array.from(this.rules.values()).filter(
      rule => rule.applicableSubmissions.includes(submissionType)
    );
  }

  /**
   * Validate a document against all applicable rules
   */
  validateDocument(document: DocumentToValidate): ComplianceScore {
    const applicableRules = this.getRulesForSubmission(document.submissionType);
    const violations: ComplianceViolation[] = [];
    let passedRules = 0;

    const categoryScores: Record<RuleCategory, { passed: number; total: number }> = {
      structure: { passed: 0, total: 0 },
      content: { passed: 0, total: 0 },
      citation: { passed: 0, total: 0 },
      format: { passed: 0, total: 0 },
      completeness: { passed: 0, total: 0 },
      regulatory: { passed: 0, total: 0 },
      data_integrity: { passed: 0, total: 0 },
      signature: { passed: 0, total: 0 },
    };

    for (const rule of applicableRules) {
      const ruleViolations = rule.check(document);
      categoryScores[rule.category].total++;

      if (ruleViolations.length === 0) {
        passedRules++;
        categoryScores[rule.category].passed++;
      } else {
        violations.push(...ruleViolations);
      }
    }

    // Calculate category scores
    const breakdown: ComplianceScore['breakdown'] = {
      structure: this.calculateCategoryScore(categoryScores.structure),
      content: this.calculateCategoryScore(categoryScores.content),
      citations: this.calculateCategoryScore(categoryScores.citation),
      format: this.calculateCategoryScore(categoryScores.format),
      completeness: this.calculateCategoryScore(categoryScores.completeness),
      regulatory: this.calculateCategoryScore(categoryScores.regulatory),
      dataIntegrity: this.calculateCategoryScore(categoryScores.data_integrity),
      signature: this.calculateCategoryScore(categoryScores.signature),
    };

    // Calculate overall score with weighted categories
    const weights = {
      structure: 0.15,
      content: 0.15,
      citations: 0.1,
      format: 0.05,
      completeness: 0.15,
      regulatory: 0.15,
      dataIntegrity: 0.15,
      signature: 0.1,
    };

    let overall = 0;
    let totalWeight = 0;
    for (const [category, weight] of Object.entries(weights)) {
      const score = breakdown[category as keyof typeof breakdown];
      if (score !== null) {
        overall += score * weight;
        totalWeight += weight;
      }
    }
    overall = totalWeight > 0 ? Math.round(overall / totalWeight) : 100;

    return {
      overall,
      breakdown,
      violations,
      passedRules,
      totalRules: applicableRules.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate score for a category
   */
  private calculateCategoryScore(category: { passed: number; total: number }): number {
    if (category.total === 0) return 100;
    return Math.round((category.passed / category.total) * 100);
  }

  /**
   * Get violation summary by severity
   */
  getViolationSummary(violations: ComplianceViolation[]): Record<RuleSeverity, number> {
    return {
      error: violations.filter(v => v.severity === 'error').length,
      warning: violations.filter(v => v.severity === 'warning').length,
      info: violations.filter(v => v.severity === 'info').length,
    };
  }

  /**
   * Get all registered rules
   */
  getAllRules(): ComplianceRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Hash a rule set for integrity verification
   */
  hashRuleSet(): string {
    const ruleIds = Array.from(this.rules.keys()).sort().join(',');
    return crypto.createHash('sha256').update(ruleIds).digest('hex').slice(0, 16);
  }
}

export default ComplianceRulesEngine;
