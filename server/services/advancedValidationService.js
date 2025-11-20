/**
 * Advanced Validation Service - Sprint 3
 * Multi-Agency Validation: Advanced Features & Cross-Module Integration
 *
 * Implements sophisticated validation rules, proactive compliance monitoring,
 * and deep integration with platform modules for comprehensive regulatory intelligence.
 */

import { db } from '../db/index.js';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class AdvancedValidationService {
  constructor() {
    this.validationRules = {
      ICH_M4: {
        modules: ['Module_1', 'Module_2', 'Module_3', 'Module_4', 'Module_5'],
        structuralRequirements: {
          Module_1: ['Regional_Administrative_Information', 'Product_Information'],
          Module_2: ['CTD_Summaries', 'Overall_Summary'],
          Module_3: ['Quality_Overall_Summary', 'Body_of_Data'],
          Module_4: ['Study_Reports', 'Literature_References'],
          Module_5: ['Clinical_Study_Reports', 'Tabulated_Summaries'],
        },
      },
      crossReferencePatterns: [
        /Section\s+(\d+(?:\.\d+)*)/gi,
        /Table\s+(\d+(?:\.\d+)*)/gi,
        /Figure\s+(\d+(?:\.\d+)*)/gi,
        /Appendix\s+([A-Z]\d*)/gi,
      ],
      consistencyChecks: [
        'drug_name',
        'study_id',
        'primary_endpoint',
        'indication',
        'dose_regimen',
        'population',
        'study_duration',
      ],
    };
  }

  /**
   * Perform granular ICH M4 compliance validation
   */
  async validateICHM4Compliance(documentContent, documentMetadata, tenantId) {
    const issues = [];

    try {
      // Analyze document structure
      const structuralAnalysis = await this.analyzeDocumentStructure(documentContent);

      // Check module-specific requirements
      const moduleType = this.identifyModuleType(documentMetadata);
      if (moduleType && this.validationRules.ICH_M4.structuralRequirements[moduleType]) {
        const requiredSections = this.validationRules.ICH_M4.structuralRequirements[moduleType];

        for (const section of requiredSections) {
          if (!structuralAnalysis.sections.includes(section)) {
            issues.push({
              type: 'ICH_M4_STRUCTURAL',
              severity: 'Critical',
              violation: `Missing required section: ${section}`,
              module: moduleType,
              recommendedAction: `Add ${section} section as per ICH M4 guidelines`,
              regulatoryReference: 'ICH M4: Organization of the Common Technical Document',
              affectedAgencies: ['FDA', 'EMA', 'PMDA'],
            });
          }
        }
      }

      // Validate table formatting
      const tableIssues = await this.validateTableFormatting(documentContent);
      issues.push(...tableIssues);

      // Check hyperlinking standards
      const hyperlinkIssues = await this.validateHyperlinkStandards(documentContent);
      issues.push(...hyperlinkIssues);

      return issues;
    } catch (error) {
      console.error('ICH M4 validation error:', error);
      return [
        {
          type: 'VALIDATION_ERROR',
          severity: 'Major',
          violation: 'Unable to complete ICH M4 validation',
          error: error.message,
        },
      ];
    }
  }

  /**
   * Validate cross-references within document and to external documents
   */
  async validateCrossReferences(documentContent, documentId, tenantId) {
    const issues = [];

    try {
      // Extract internal references
      const internalRefs = this.extractInternalReferences(documentContent);

      // Validate internal references exist
      for (const ref of internalRefs) {
        if (!this.validateInternalReference(documentContent, ref)) {
          issues.push({
            type: 'CROSS_REFERENCE_INTERNAL',
            severity: 'Major',
            violation: `Invalid internal reference: ${ref.text}`,
            location: ref.location,
            recommendedAction: `Verify ${ref.type} ${ref.number} exists in document`,
            affectedAgencies: ['FDA', 'EMA'],
          });
        }
      }

      // Validate external references
      const externalRefs = this.extractExternalReferences(documentContent);
      const externalValidation = await this.validateExternalReferences(externalRefs, tenantId);
      issues.push(...externalValidation);

      return issues;
    } catch (error) {
      console.error('Cross-reference validation error:', error);
      return [
        {
          type: 'VALIDATION_ERROR',
          severity: 'Major',
          violation: 'Unable to complete cross-reference validation',
          error: error.message,
        },
      ];
    }
  }

  /**
   * Validate consistency across submission modules
   */
  async validateSubmissionConsistency(documentId, tenantId) {
    const issues = [];

    try {
      // Get all documents in the same submission
      const submissionDocuments = await db.query(
        `
        SELECT id, title, content, metadata, module_type
        FROM unified_documents 
        WHERE tenant_id = $1 
        AND submission_id = (
          SELECT submission_id FROM unified_documents 
          WHERE id = $2 AND tenant_id = $1
        )
      `,
        [tenantId, documentId]
      );

      if (submissionDocuments.rows.length < 2) {
        return issues; // No consistency checks needed for single document
      }

      // Extract key entities from each document
      const documentEntities = [];
      for (const doc of submissionDocuments.rows) {
        const entities = await this.extractKeyEntities(doc.content);
        documentEntities.push({
          documentId: doc.id,
          title: doc.title,
          entities,
        });
      }

      // Check consistency across documents
      for (const checkField of this.validationRules.consistencyChecks) {
        const fieldValues = documentEntities
          .map(doc => ({
            documentId: doc.documentId,
            title: doc.title,
            value: doc.entities[checkField],
          }))
          .filter(item => item.value);

        if (fieldValues.length > 1) {
          const uniqueValues = [...new Set(fieldValues.map(item => item.value))];

          if (uniqueValues.length > 1) {
            issues.push({
              type: 'CONSISTENCY_VIOLATION',
              severity: 'Critical',
              violation: `Inconsistent ${checkField} across submission`,
              details: fieldValues.map(item => `${item.title}: ${item.value}`).join('; '),
              recommendedAction: `Standardize ${checkField} across all submission documents`,
              affectedAgencies: ['FDA', 'EMA', 'PMDA'],
              crossDocumentIssue: true,
            });
          }
        }
      }

      return issues;
    } catch (error) {
      console.error('Submission consistency validation error:', error);
      return [
        {
          type: 'VALIDATION_ERROR',
          severity: 'Major',
          violation: 'Unable to complete submission consistency validation',
          error: error.message,
        },
      ];
    }
  }

  /**
   * Enhanced knowledge graph integration for regulatory intelligence
   */
  async enhanceWithKnowledgeGraph(issues, tenantId) {
    try {
      // Query knowledge graph for regulatory context
      const kgData = await db.query(
        `
        SELECT entity_1, entity_2, relation_type, confidence_score, context
        FROM knowledge_graph_relations
        WHERE tenant_id = $1 AND confidence_score > 0.7
        ORDER BY confidence_score DESC
      `,
        [tenantId]
      );

      // Enhance issues with knowledge graph context
      const enhancedIssues = [];

      for (const issue of issues) {
        const relevantKG = kgData.rows.filter(
          kg =>
            issue.violation.toLowerCase().includes(kg.entity_1.toLowerCase()) ||
            issue.violation.toLowerCase().includes(kg.entity_2.toLowerCase())
        );

        if (relevantKG.length > 0) {
          enhancedIssues.push({
            ...issue,
            knowledgeGraphContext: relevantKG.map(kg => ({
              relationship: `${kg.entity_1} ${kg.relation_type} ${kg.entity_2}`,
              confidence: kg.confidence_score,
              context: kg.context,
            })),
            enhancedRecommendation: await this.generateEnhancedRecommendation(issue, relevantKG),
          });
        } else {
          enhancedIssues.push(issue);
        }
      }

      return enhancedIssues;
    } catch (error) {
      console.error('Knowledge graph enhancement error:', error);
      return issues; // Return original issues if enhancement fails
    }
  }

  /**
   * Helper methods for validation logic
   */
  async analyzeDocumentStructure(content) {
    const sections = [];
    const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      sections.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    return {
      sections,
      wordCount: content.replace(/<[^>]*>/g, '').split(/\s+/).length,
      hasTableOfContents: content.includes('Table of Contents') || content.includes('TOC'),
      hasFigures: /<figure/i.test(content),
      hasTables: /<table/i.test(content),
    };
  }

  identifyModuleType(metadata) {
    const modulePatterns = {
      Module_1: /module.?1|administrative|regional/i,
      Module_2: /module.?2|summary|overview/i,
      Module_3: /module.?3|quality|chemistry/i,
      Module_4: /module.?4|nonclinical|preclinical/i,
      Module_5: /module.?5|clinical|study.?report/i,
    };

    for (const [module, pattern] of Object.entries(modulePatterns)) {
      if (pattern.test(metadata.title || '') || pattern.test(metadata.document_type || '')) {
        return module;
      }
    }

    return null;
  }

  async validateTableFormatting(content) {
    const issues = [];
    const tableRegex = /<table[^>]*>(.*?)<\/table>/gis;
    let match;
    let tableIndex = 0;

    while ((match = tableRegex.exec(content)) !== null) {
      tableIndex++;
      const tableContent = match[1];

      // Check for proper headers
      if (!/<th[^>]*>/i.test(tableContent)) {
        issues.push({
          type: 'TABLE_FORMATTING',
          severity: 'Major',
          violation: `Table ${tableIndex} missing proper headers`,
          recommendedAction: 'Add table headers using <th> elements',
          affectedAgencies: ['FDA', 'EMA'],
        });
      }

      // Check for table caption
      if (!/<caption[^>]*>/i.test(match[0])) {
        issues.push({
          type: 'TABLE_FORMATTING',
          severity: 'Minor',
          violation: `Table ${tableIndex} missing caption`,
          recommendedAction: 'Add descriptive table caption',
          affectedAgencies: ['FDA', 'EMA'],
        });
      }
    }

    return issues;
  }

  async validateHyperlinkStandards(content) {
    const issues = [];
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[1];
      const linkText = match[2];

      // Check for proper link text
      if (
        linkText.toLowerCase().includes('click here') ||
        linkText.toLowerCase().includes('here')
      ) {
        issues.push({
          type: 'HYPERLINK_STANDARDS',
          severity: 'Minor',
          violation: `Non-descriptive link text: "${linkText}"`,
          recommendedAction: 'Use descriptive link text that explains the destination',
          affectedAgencies: ['FDA', 'EMA'],
        });
      }

      // Check for external links without proper indication
      if (
        href.startsWith('http') &&
        !linkText.includes('external') &&
        !linkText.includes('External')
      ) {
        issues.push({
          type: 'HYPERLINK_STANDARDS',
          severity: 'Minor',
          violation: `External link without indication: "${linkText}"`,
          recommendedAction: 'Indicate external links clearly',
          affectedAgencies: ['FDA', 'EMA'],
        });
      }
    }

    return issues;
  }

  extractInternalReferences(content) {
    const references = [];

    for (const pattern of this.validationRules.crossReferencePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        references.push({
          type: match[0].split(' ')[0].toLowerCase(),
          number: match[1],
          text: match[0],
          location: match.index,
        });
      }
    }

    return references;
  }

  validateInternalReference(content, reference) {
    const targetPatterns = {
      section: new RegExp(`<h[1-6][^>]*>.*?${reference.number}.*?</h[1-6]>`, 'i'),
      table: new RegExp(`<table[^>]*>.*?${reference.number}.*?</table>`, 'is'),
      figure: new RegExp(`<figure[^>]*>.*?${reference.number}.*?</figure>`, 'is'),
      appendix: new RegExp(`appendix.*?${reference.number}`, 'i'),
    };

    const pattern = targetPatterns[reference.type];
    return pattern ? pattern.test(content) : false;
  }

  extractExternalReferences(content) {
    const references = [];
    const patterns = [
      /\[(\d+)\]/g, // Citation numbers
      /\(([^)]+\s+\d{4})\)/g, // Author year citations
      /DOI:\s*([^\s]+)/gi, // DOI references
      /PMID:\s*(\d+)/gi, // PubMed IDs
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        references.push({
          type: pattern.toString().includes('DOI')
            ? 'DOI'
            : pattern.toString().includes('PMID')
              ? 'PMID'
              : 'citation',
          reference: match[1],
          location: match.index,
        });
      }
    }

    return references;
  }

  async validateExternalReferences(references, tenantId) {
    const issues = [];

    // Check if references exist in knowledge base
    for (const ref of references) {
      const exists = await db.query(
        `
        SELECT id FROM unified_documents 
        WHERE tenant_id = $1 AND (
          title ILIKE $2 OR 
          content ILIKE $2 OR 
          metadata::text ILIKE $2
        )
      `,
        [tenantId, `%${ref.reference}%`]
      );

      if (exists.rows.length === 0) {
        issues.push({
          type: 'EXTERNAL_REFERENCE',
          severity: 'Major',
          violation: `External reference not found: ${ref.reference}`,
          recommendedAction: 'Verify reference exists or add to document repository',
          affectedAgencies: ['FDA', 'EMA'],
        });
      }
    }

    return issues;
  }

  async extractKeyEntities(content) {
    try {
      const prompt = `Extract key regulatory entities from this document content. Return only a JSON object with these fields:
      {
        "drug_name": "string",
        "study_id": "string", 
        "primary_endpoint": "string",
        "indication": "string",
        "dose_regimen": "string",
        "population": "string",
        "study_duration": "string"
      }
      
      Content: ${content.substring(0, 3000)}...`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Entity extraction error:', error);
      return {};
    }
  }

  async generateEnhancedRecommendation(issue, knowledgeGraphData) {
    try {
      const kgContext = knowledgeGraphData
        .map(kg => `${kg.entity_1} ${kg.relation_type} ${kg.entity_2}: ${kg.context}`)
        .join('\n');

      const prompt = `Based on this regulatory validation issue and knowledge graph context, provide an enhanced recommendation:

      Issue: ${issue.violation}
      Current Recommendation: ${issue.recommendedAction}
      
      Knowledge Graph Context:
      ${kgContext}
      
      Provide a more specific, actionable recommendation that incorporates the knowledge graph insights.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Enhanced recommendation generation error:', error);
      return issue.recommendedAction;
    }
  }
}

export default new AdvancedValidationService();
