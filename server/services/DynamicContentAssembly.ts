import { db } from '../db';
import { fda510kDocuments, fda510kStageProgress, fda510kProjects } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { smartFieldLinking } from './SmartFieldLinking.js';
import CrossReferenceMapper from './CrossReferenceMapping.js';

interface AssemblySection {
  id: string;
  title: string;
  content: string;
  required: boolean;
  condition?: (data: any) => boolean;
  completeness: number;
  missingFields: string[];
  dependencies?: string[];
}

interface DocumentAssembly {
  documentId: string;
  documentType: string;
  sections: AssemblySection[];
  overallCompleteness: number;
  metadata: {
    totalSections: number;
    completedSections: number;
    requiredSections: number;
    requiredComplete: number;
    lastUpdated: Date;
    validationStatus: 'valid' | 'warning' | 'error';
    validationMessages: string[];
  };
}

interface ConditionalRule {
  field: string;
  operator: 'equals' | 'contains' | 'exists' | 'notExists' | 'in' | 'notIn';
  value?: any;
  action: 'include' | 'exclude' | 'require' | 'optional';
}

export class DynamicContentAssembly {
  private crossReferenceMapper: CrossReferenceMapper;
  private conditionalRules: Map<string, ConditionalRule[]> = new Map();
  
  constructor() {
    this.crossReferenceMapper = new CrossReferenceMapper();
    this.initializeConditionalRules();
  }
  
  /**
   * Initialize conditional rules for dynamic content assembly
   */
  private initializeConditionalRules() {
    // Device class-specific rules
    this.conditionalRules.set('clinical_data', [
      {
        field: 'device.classification',
        operator: 'equals',
        value: 'Class III',
        action: 'require'
      },
      {
        field: 'device.classification',
        operator: 'in',
        value: ['Class I', 'Class II'],
        action: 'optional'
      }
    ]);
    
    // Sterile device rules
    this.conditionalRules.set('sterilization', [
      {
        field: 'device.isSterile',
        operator: 'equals',
        value: true,
        action: 'require'
      },
      {
        field: 'device.isSterile',
        operator: 'equals',
        value: false,
        action: 'exclude'
      }
    ]);
    
    // Software device rules
    this.conditionalRules.set('software_validation', [
      {
        field: 'device.containsSoftware',
        operator: 'equals',
        value: true,
        action: 'require'
      }
    ]);
    
    // Electrical device rules
    this.conditionalRules.set('electromagnetic_compatibility', [
      {
        field: 'device.isElectrical',
        operator: 'equals',
        value: true,
        action: 'require'
      }
    ]);
    
    // Biocompatibility rules
    this.conditionalRules.set('biocompatibility', [
      {
        field: 'device.patientContact',
        operator: 'exists',
        action: 'require'
      },
      {
        field: 'device.patientContact.duration',
        operator: 'equals',
        value: 'permanent',
        action: 'require'
      }
    ]);
  }
  
  /**
   * Assemble a complete document with conditional logic and completeness tracking
   */
  async assembleDocument(
    projectId: number,
    documentType: string,
    options?: {
      includeOptional?: boolean;
      validateOnly?: boolean;
      format?: 'html' | 'markdown' | 'json';
    }
  ): Promise<DocumentAssembly> {
    // Get all workflow data for the project
    const workflowData = await this.getWorkflowData(projectId);
    
    // Get document template sections
    const sections = this.getDocumentSections(documentType);
    
    // Process each section
    const assembledSections: AssemblySection[] = [];
    let totalCompleteness = 0;
    let requiredSections = 0;
    let requiredComplete = 0;
    
    for (const section of sections) {
      // Check if section should be included based on conditional rules
      const shouldInclude = await this.evaluateSectionConditions(
        section.id,
        workflowData,
        options?.includeOptional
      );
      
      if (!shouldInclude && !options?.validateOnly) {
        continue;
      }
      
      // Assemble section content
      const assembledSection = await this.assembleSection(
        section,
        workflowData,
        projectId
      );
      
      // Track completeness
      totalCompleteness += assembledSection.completeness;
      if (assembledSection.required) {
        requiredSections++;
        if (assembledSection.completeness === 100) {
          requiredComplete++;
        }
      }
      
      assembledSections.push(assembledSection);
    }
    
    // Calculate overall completeness
    const overallCompleteness = assembledSections.length > 0
      ? Math.round(totalCompleteness / assembledSections.length)
      : 0;
    
    // Validate document assembly
    const validationResults = await this.validateAssembly(
      assembledSections,
      workflowData
    );
    
    const assembly: DocumentAssembly = {
      documentId: `${documentType}_${projectId}_${Date.now()}`,
      documentType,
      sections: assembledSections,
      overallCompleteness,
      metadata: {
        totalSections: assembledSections.length,
        completedSections: assembledSections.filter(s => s.completeness === 100).length,
        requiredSections,
        requiredComplete,
        lastUpdated: new Date(),
        validationStatus: validationResults.status,
        validationMessages: validationResults.messages
      }
    };
    
    // Save assembly to database if not validate-only
    if (!options?.validateOnly && db) {
      await this.saveAssembly(assembly, projectId);
    }
    
    return assembly;
  }
  
  /**
   * Assemble a single section with content from workflow data
   */
  private async assembleSection(
    section: any,
    workflowData: any,
    projectId: number
  ): Promise<AssemblySection> {
    const missingFields: string[] = [];
    let sectionContent = section.template || '';
    let fieldsFound = 0;
    let totalFields = 0;
    
    // Get field mappings for this section
    // Since CrossReferenceMapper doesn't have getFieldMappingsForSection, we'll use a simple mapping
    const fieldMappings = this.getFieldMappingsForSection(section.id);
    
    // Replace placeholders with actual data
    for (const mapping of fieldMappings) {
      totalFields++;
      const value = this.getNestedValue(workflowData, mapping.sourcePath);
      
      if (value !== undefined && value !== null && value !== '') {
        fieldsFound++;
        const placeholder = mapping.placeholder || `[${mapping.fieldName}]`;
        sectionContent = sectionContent.replace(
          new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          value
        );
      } else if (mapping.required) {
        missingFields.push(mapping.fieldName);
      }
    }
    
    // Calculate section completeness
    const completeness = totalFields > 0
      ? Math.round((fieldsFound / totalFields) * 100)
      : section.content ? 100 : 0;
    
    // Check dependencies
    const dependenciesMet = await this.checkDependencies(
      section.dependencies || [],
      workflowData
    );
    
    return {
      id: section.id,
      title: section.title,
      content: sectionContent,
      required: section.required || false,
      condition: section.condition,
      completeness: dependenciesMet ? completeness : 0,
      missingFields,
      dependencies: section.dependencies
    };
  }
  
  /**
   * Evaluate conditional rules for a section
   */
  private async evaluateSectionConditions(
    sectionId: string,
    workflowData: any,
    includeOptional?: boolean
  ): Promise<boolean> {
    const rules = this.conditionalRules.get(sectionId);
    if (!rules || rules.length === 0) {
      return true; // No conditions, include by default
    }
    
    let shouldInclude = true;
    let isRequired = false;
    
    for (const rule of rules) {
      const fieldValue = this.getNestedValue(workflowData, rule.field);
      const conditionMet = this.evaluateCondition(fieldValue, rule);
      
      switch (rule.action) {
        case 'require':
          if (conditionMet) isRequired = true;
          break;
        case 'exclude':
          if (conditionMet) shouldInclude = false;
          break;
        case 'optional':
          if (!conditionMet && !includeOptional) shouldInclude = false;
          break;
        case 'include':
          if (conditionMet) shouldInclude = true;
          break;
      }
    }
    
    return shouldInclude;
  }
  
  /**
   * Evaluate a single condition
   */
  private evaluateCondition(fieldValue: any, rule: ConditionalRule): boolean {
    switch (rule.operator) {
      case 'equals':
        return fieldValue === rule.value;
      case 'contains':
        return fieldValue?.includes?.(rule.value);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'notExists':
        return fieldValue === undefined || fieldValue === null;
      case 'in':
        return Array.isArray(rule.value) && rule.value.includes(fieldValue);
      case 'notIn':
        return Array.isArray(rule.value) && !rule.value.includes(fieldValue);
      default:
        return false;
    }
  }
  
  /**
   * Check if section dependencies are met
   */
  private async checkDependencies(
    dependencies: string[],
    workflowData: any
  ): Promise<boolean> {
    if (!dependencies || dependencies.length === 0) {
      return true;
    }
    
    for (const dep of dependencies) {
      const value = this.getNestedValue(workflowData, dep);
      if (!value) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Validate the document assembly
   */
  private async validateAssembly(
    sections: AssemblySection[],
    workflowData: any
  ): Promise<{ status: 'valid' | 'warning' | 'error'; messages: string[] }> {
    const messages: string[] = [];
    let hasErrors = false;
    let hasWarnings = false;
    
    // Check required sections
    const incompletRequired = sections.filter(
      s => s.required && s.completeness < 100
    );
    
    if (incompletRequired.length > 0) {
      hasErrors = true;
      incompletRequired.forEach(s => {
        messages.push(
          `Required section "${s.title}" is incomplete (${s.completeness}%). Missing: ${s.missingFields.join(', ')}`
        );
      });
    }
    
    // Check section dependencies
    for (const section of sections) {
      if (section.dependencies && section.dependencies.length > 0) {
        const depsMet = await this.checkDependencies(section.dependencies, workflowData);
        if (!depsMet && section.completeness > 0) {
          hasWarnings = true;
          messages.push(
            `Section "${section.title}" has unmet dependencies: ${section.dependencies.join(', ')}`
          );
        }
      }
    }
    
    // Check for placeholder text remaining
    const placeholderPattern = /\[.*?\]/g;
    sections.forEach(section => {
      const placeholders = section.content.match(placeholderPattern);
      if (placeholders && placeholders.length > 0) {
        hasWarnings = true;
        messages.push(
          `Section "${section.title}" contains unfilled placeholders: ${placeholders.slice(0, 3).join(', ')}${placeholders.length > 3 ? '...' : ''}`
        );
      }
    });
    
    return {
      status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid',
      messages
    };
  }
  
  /**
   * Get workflow data for a project
   */
  private async getWorkflowData(projectId: number): Promise<any> {
    if (!db) {
      return {};
    }
    
    const stageProgress = await db
      .select()
      .from(fda510kStageProgress)
      .where(eq(fda510kStageProgress.projectId, projectId));
    
    // Merge all stage data
    const workflowData: any = {};
    
    for (const progress of stageProgress) {
      const data = progress.collectedData || {};
      Object.assign(workflowData, data);
    }
    
    return workflowData;
  }
  
  /**
   * Get document sections based on type
   */
  private getDocumentSections(documentType: string): any[] {
    // This would normally come from database or configuration
    // Simplified for demonstration
    const sectionMap: Record<string, any[]> = {
      'main_510k': [
        {
          id: 'cover_letter',
          title: 'Cover Letter',
          template: 'Dear FDA Reviewer,\n\nWe are submitting this 510(k) for [Device Trade Name]...',
          required: true
        },
        {
          id: 'executive_summary',
          title: 'Executive Summary',
          template: 'Device Name: [Device Trade Name]\nIntended Use: [Intended Use]...',
          required: true
        },
        {
          id: 'device_description',
          title: 'Device Description',
          template: 'The [Device Trade Name] is a [Device Classification] device...',
          required: true
        },
        {
          id: 'substantial_equivalence',
          title: 'Substantial Equivalence',
          template: 'The subject device is substantially equivalent to [Predicate Device]...',
          required: true,
          dependencies: ['predicate.kNumber']
        },
        {
          id: 'performance_data',
          title: 'Performance Data',
          template: 'Performance testing demonstrates [Test Results]...',
          required: false
        },
        {
          id: 'clinical_data',
          title: 'Clinical Data',
          template: 'Clinical evaluation shows [Clinical Results]...',
          required: false,
          dependencies: ['clinical.studyProtocol']
        },
        {
          id: 'sterilization',
          title: 'Sterilization',
          template: 'The device is sterilized using [Sterilization Method]...',
          required: false
        },
        {
          id: 'biocompatibility',
          title: 'Biocompatibility',
          template: 'Biocompatibility testing per ISO 10993...',
          required: false
        },
        {
          id: 'software_validation',
          title: 'Software Validation',
          template: 'Software validation conducted per FDA guidance...',
          required: false
        },
        {
          id: 'labeling',
          title: 'Labeling',
          template: 'Device labeling includes [Labeling Content]...',
          required: true
        }
      ],
      'FDA3514': [
        {
          id: 'section1',
          title: 'Device Identification',
          template: 'Trade Name: [Device Trade Name]\nCommon Name: [Common Name]...',
          required: true
        },
        {
          id: 'section2',
          title: 'Classification',
          template: 'Device Class: [Device Classification]\nProduct Code: [Product Code]...',
          required: true
        },
        {
          id: 'section3',
          title: 'Intended Use',
          template: 'Intended Use: [Intended Use]...',
          required: true
        }
      ]
    };
    
    return sectionMap[documentType] || [];
  }
  
  /**
   * Save assembly to database
   */
  private async saveAssembly(
    assembly: DocumentAssembly,
    projectId: number
  ): Promise<void> {
    if (!db) return;
    
    const documentData = {
      documentId: assembly.documentId,
      projectId,
      documentType: assembly.documentType,
      documentName: `${assembly.documentType} - Assembled`,
      content: JSON.stringify(assembly.sections),
      version: 1,
      status: assembly.metadata.validationStatus === 'valid' ? 'complete' : 'draft',
      completeness: assembly.overallCompleteness,
      formData: assembly.metadata,
      createdBy: 1,
      updatedBy: 1,
      organizationId: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.insert(fda510kDocuments).values(documentData);
  }
  
  /**
   * Get field mappings for a section
   */
  private getFieldMappingsForSection(sectionId: string): any[] {
    // Simple field mappings based on section
    const mappings: Record<string, any[]> = {
      'cover_letter': [
        { sourcePath: 'device.deviceName', fieldName: 'Device Trade Name', placeholder: '[Device Trade Name]', required: true },
        { sourcePath: 'device.intendedUse', fieldName: 'Intended Use', placeholder: '[Intended Use]', required: true }
      ],
      'executive_summary': [
        { sourcePath: 'device.deviceName', fieldName: 'Device Trade Name', placeholder: '[Device Trade Name]', required: true },
        { sourcePath: 'device.intendedUse', fieldName: 'Intended Use', placeholder: '[Intended Use]', required: true },
        { sourcePath: 'device.classification', fieldName: 'Device Classification', placeholder: '[Device Classification]', required: true }
      ],
      'device_description': [
        { sourcePath: 'device.deviceName', fieldName: 'Device Trade Name', placeholder: '[Device Trade Name]', required: true },
        { sourcePath: 'device.classification', fieldName: 'Device Classification', placeholder: '[Device Classification]', required: true }
      ],
      'substantial_equivalence': [
        { sourcePath: 'predicate.deviceName', fieldName: 'Predicate Device', placeholder: '[Predicate Device]', required: true },
        { sourcePath: 'predicate.kNumber', fieldName: 'Predicate K Number', placeholder: '[XXXXXX]', required: true }
      ],
      'performance_data': [
        { sourcePath: 'testing.results', fieldName: 'Test Results', placeholder: '[Test Results]', required: false }
      ],
      'clinical_data': [
        { sourcePath: 'clinical.results', fieldName: 'Clinical Results', placeholder: '[Clinical Results]', required: false }
      ],
      'sterilization': [
        { sourcePath: 'sterilization.method', fieldName: 'Sterilization Method', placeholder: '[Sterilization Method]', required: false }
      ],
      'biocompatibility': [],
      'software_validation': [],
      'labeling': [
        { sourcePath: 'labeling.content', fieldName: 'Labeling Content', placeholder: '[Labeling Content]', required: true }
      ],
      'section1': [
        { sourcePath: 'device.deviceName', fieldName: 'Device Trade Name', placeholder: '[Device Trade Name]', required: true },
        { sourcePath: 'device.commonName', fieldName: 'Common Name', placeholder: '[Common Name]', required: true }
      ],
      'section2': [
        { sourcePath: 'device.classification', fieldName: 'Device Classification', placeholder: '[Device Classification]', required: true },
        { sourcePath: 'regulatory.productCode', fieldName: 'Product Code', placeholder: '[Product Code]', required: true }
      ],
      'section3': [
        { sourcePath: 'device.intendedUse', fieldName: 'Intended Use', placeholder: '[Intended Use]', required: true }
      ]
    };
    
    return mappings[sectionId] || [];
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }
  
  /**
   * Get completeness report for a project
   */
  async getCompletenessReport(projectId: number): Promise<{
    overall: number;
    byDocument: Record<string, number>;
    bySection: Record<string, number>;
    criticalMissing: string[];
    recommendations: string[];
  }> {
    const documentTypes = ['main_510k', 'FDA3514', 'FDA3601', 'FDA3881', 'FDA3654'];
    const byDocument: Record<string, number> = {};
    const bySection: Record<string, number> = {};
    const criticalMissing: string[] = [];
    const recommendations: string[] = [];
    
    // Check each document type
    for (const docType of documentTypes) {
      const assembly = await this.assembleDocument(projectId, docType, {
        validateOnly: true
      });
      
      byDocument[docType] = assembly.overallCompleteness;
      
      // Track section completeness
      assembly.sections.forEach(section => {
        bySection[section.id] = section.completeness;
        
        // Track critical missing fields
        if (section.required && section.completeness < 100) {
          criticalMissing.push(
            ...section.missingFields.map(f => `${section.title}: ${f}`)
          );
        }
      });
    }
    
    // Calculate overall completeness
    const overallValues = Object.values(byDocument);
    const overall = overallValues.length > 0
      ? Math.round(overallValues.reduce((a, b) => a + b, 0) / overallValues.length)
      : 0;
    
    // Generate recommendations
    if (overall < 50) {
      recommendations.push('Focus on completing device identification and classification sections first');
    }
    if (!bySection['substantial_equivalence'] || bySection['substantial_equivalence'] < 100) {
      recommendations.push('Complete predicate device comparison for substantial equivalence');
    }
    if (!bySection['labeling'] || bySection['labeling'] < 100) {
      recommendations.push('Ensure all labeling requirements are documented');
    }
    
    return {
      overall,
      byDocument,
      bySection,
      criticalMissing,
      recommendations
    };
  }
  
  /**
   * Generate document preview with live data
   */
  async generatePreview(
    projectId: number,
    documentType: string,
    format: 'html' | 'markdown' | 'json' = 'html'
  ): Promise<string> {
    const assembly = await this.assembleDocument(projectId, documentType, {
      includeOptional: true,
      format
    });
    
    if (format === 'json') {
      return JSON.stringify(assembly, null, 2);
    }
    
    let preview = '';
    
    if (format === 'html') {
      preview = `
        <div class="document-preview">
          <h1>${assembly.documentType}</h1>
          <div class="completeness-bar">
            <div class="progress" style="width: ${assembly.overallCompleteness}%"></div>
            <span>${assembly.overallCompleteness}% Complete</span>
          </div>
      `;
      
      for (const section of assembly.sections) {
        preview += `
          <div class="section ${section.required ? 'required' : 'optional'}">
            <h2>${section.title}</h2>
            <div class="section-completeness">${section.completeness}% Complete</div>
            <div class="section-content">${section.content.replace(/\n/g, '<br>')}</div>
            ${section.missingFields.length > 0 ? 
              `<div class="missing-fields">Missing: ${section.missingFields.join(', ')}</div>` : ''}
          </div>
        `;
      }
      
      preview += '</div>';
    } else { // markdown
      preview = `# ${assembly.documentType}\n\n`;
      preview += `**Completeness:** ${assembly.overallCompleteness}%\n\n`;
      
      for (const section of assembly.sections) {
        preview += `## ${section.title}${section.required ? ' (Required)' : ''}\n\n`;
        preview += `_${section.completeness}% Complete_\n\n`;
        preview += `${section.content}\n\n`;
        if (section.missingFields.length > 0) {
          preview += `> **Missing:** ${section.missingFields.join(', ')}\n\n`;
        }
      }
    }
    
    return preview;
  }
}

// Export singleton instance
export const dynamicContentAssembly = new DynamicContentAssembly();