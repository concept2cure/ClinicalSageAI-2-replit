import { EventEmitter } from 'events';
import CrossReferenceMapper from './CrossReferenceMapping.js';
import { db } from '../db';
import { fda510kDocuments, fda510kStageProgress } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface FieldLink {
  workflowField: string;
  documentFields: {
    documentType: string;
    fieldPath: string;
    section?: string;
  }[];
  validation?: {
    required?: boolean;
    maxLength?: number;
    pattern?: string;
  };
  transform?: (value: any) => any;
}

interface FieldUpdate {
  source: 'workflow' | 'document';
  field: string;
  value: any;
  previousValue?: any;
  timestamp: Date;
  userId?: number;
  metadata?: Record<string, any>;
}

export class SmartFieldLinking extends EventEmitter {
  private fieldLinks: Map<string, FieldLink> = new Map();
  private fieldSubscriptions: Map<string, Set<string>> = new Map();
  private crossReferenceMapper: CrossReferenceMapper;
  private updateQueue: FieldUpdate[] = [];
  private isProcessing = false;

  constructor() {
    super();
    this.crossReferenceMapper = new CrossReferenceMapper();
    this.initializeFieldLinks();
  }

  /**
   * Initialize field links based on cross-reference mappings
   */
  private initializeFieldLinks() {
    // Device Information Fields
    this.registerFieldLink({
      workflowField: 'device.deviceName',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'coverPage.deviceName', section: '5.1' },
        { documentType: 'FDA3514', fieldPath: 'section1.proprietaryName' },
        { documentType: 'FDA3601', fieldPath: 'deviceIdentification.name' },
        { documentType: 'FDA3881', fieldPath: 'device.tradeName' }
      ],
      validation: { required: true, maxLength: 200 }
    });

    this.registerFieldLink({
      workflowField: 'device.intendedUse',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'indications.intendedUse', section: '6.1' },
        { documentType: 'FDA3514', fieldPath: 'section3.intendedUse' },
        { documentType: 'FDA3881', fieldPath: 'device.indications' }
      ],
      validation: { required: true, maxLength: 5000 }
    });

    this.registerFieldLink({
      workflowField: 'device.classification',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'classification.deviceClass', section: '2.1' },
        { documentType: 'FDA3514', fieldPath: 'section2.classification' },
        { documentType: 'FDA3654', fieldPath: 'regulatory.classification' }
      ],
      validation: { required: true, pattern: '^Class (I|II|III)$' }
    });

    // Manufacturer Information
    this.registerFieldLink({
      workflowField: 'manufacturer.companyName',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'applicant.name', section: '1.1' },
        { documentType: 'FDA3514', fieldPath: 'applicant.organizationName' },
        { documentType: 'FDA3601', fieldPath: 'manufacturer.name' },
        { documentType: 'FDA3881', fieldPath: 'sponsor.companyName' }
      ],
      validation: { required: true, maxLength: 300 }
    });

    this.registerFieldLink({
      workflowField: 'manufacturer.address',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'applicant.address', section: '1.2' },
        { documentType: 'FDA3514', fieldPath: 'applicant.address' },
        { documentType: 'FDA3601', fieldPath: 'manufacturer.facilityAddress' }
      ],
      transform: (value: any) => {
        // Transform address object to formatted string
        if (typeof value === 'object') {
          return `${value.street}, ${value.city}, ${value.state} ${value.zip}, ${value.country}`;
        }
        return value;
      }
    });

    // Predicate Device Information
    this.registerFieldLink({
      workflowField: 'predicate.kNumber',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'substantialEquivalence.predicateDevice', section: '12.1' },
        { documentType: 'FDA3514', fieldPath: 'section5.predicateDeviceNumber' },
        { documentType: 'FDA3881', fieldPath: 'comparison.predicateK' }
      ],
      validation: { 
        required: true, 
        pattern: '^K\\d{6}$'
      },
      transform: (value: string) => value.toUpperCase()
    });

    // Testing Information
    this.registerFieldLink({
      workflowField: 'testing.biocompatibility',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'performance.biocompatibility', section: '14.1' },
        { documentType: 'FDA3654', fieldPath: 'testing.biocompatibilityData' }
      ]
    });

    this.registerFieldLink({
      workflowField: 'testing.sterilization',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'sterilization.method', section: '15.1' },
        { documentType: 'FDA3601', fieldPath: 'processing.sterilizationMethod' }
      ]
    });

    // Labeling
    this.registerFieldLink({
      workflowField: 'labeling.userManual',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'labeling.instructions', section: '11.1' },
        { documentType: 'FDA3514', fieldPath: 'section7.labelingSpecimen' }
      ]
    });

    // Clinical Data
    this.registerFieldLink({
      workflowField: 'clinical.studyProtocol',
      documentFields: [
        { documentType: 'main_510k', fieldPath: 'clinical.protocol', section: '21.1' },
        { documentType: 'FDA3654', fieldPath: 'clinical.studyDesign' }
      ]
    });

    console.log(`✅ Smart Field Linking initialized with ${this.fieldLinks.size} field mappings`);
  }

  /**
   * Register a field link between workflow and documents
   */
  private registerFieldLink(link: FieldLink) {
    this.fieldLinks.set(link.workflowField, link);
    
    // Create reverse mapping for document fields
    link.documentFields.forEach(docField => {
      const key = `${docField.documentType}.${docField.fieldPath}`;
      if (!this.fieldSubscriptions.has(key)) {
        this.fieldSubscriptions.set(key, new Set());
      }
      this.fieldSubscriptions.get(key)!.add(link.workflowField);
    });
  }

  /**
   * Update a field value and propagate changes
   */
  async updateField(update: FieldUpdate): Promise<void> {
    // Add to queue
    this.updateQueue.push(update);
    
    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processUpdateQueue();
    }
  }

  /**
   * Process queued updates
   */
  private async processUpdateQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.updateQueue.length > 0) {
      const update = this.updateQueue.shift()!;
      
      try {
        if (update.source === 'workflow') {
          await this.propagateFromWorkflow(update);
        } else {
          await this.propagateFromDocument(update);
        }
        
        // Emit update event for real-time sync
        this.emit('fieldUpdated', update);
      } catch (error) {
        console.error('Error processing field update:', error);
        this.emit('updateError', { update, error });
      }
    }

    this.isProcessing = false;
  }

  /**
   * Propagate changes from workflow to documents
   */
  private async propagateFromWorkflow(update: FieldUpdate): Promise<void> {
    const link = this.fieldLinks.get(update.field);
    if (!link) return;

    // Validate field value
    if (link.validation) {
      const validationResult = this.validateField(update.value, link.validation);
      if (!validationResult.valid) {
        throw new Error(`Validation failed: ${validationResult.error}`);
      }
    }

    // Transform value if needed
    const transformedValue = link.transform ? link.transform(update.value) : update.value;

    // Update all linked document fields
    for (const docField of link.documentFields) {
      await this.updateDocumentField(
        docField.documentType,
        docField.fieldPath,
        transformedValue,
        update.userId
      );
    }
  }

  /**
   * Propagate changes from document to workflow
   */
  private async propagateFromDocument(update: FieldUpdate): Promise<void> {
    const [documentType, ...fieldPathParts] = update.field.split('.');
    const fieldPath = fieldPathParts.join('.');
    
    const key = `${documentType}.${fieldPath}`;
    const workflowFields = this.fieldSubscriptions.get(key);
    
    if (!workflowFields) return;

    for (const workflowField of workflowFields) {
      await this.updateWorkflowField(workflowField, update.value, update.userId);
    }
  }

  /**
   * Update a document field in the database
   */
  private async updateDocumentField(
    documentType: string,
    fieldPath: string,
    value: any,
    userId?: number
  ): Promise<void> {
    if (!db) {
      console.error('Database connection not available');
      return;
    }
    
    // Implementation would update the specific field in the document
    // This is a simplified version - real implementation would handle nested paths
    const documents = await db
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.documentType, documentType))
      .limit(1);

    if (documents.length > 0) {
      const document = documents[0];
      const content = typeof document.content === 'string' 
        ? JSON.parse(document.content) 
        : document.content;
      
      // Update nested field using path
      this.setNestedField(content, fieldPath, value);
      
      await db
        .update(fda510kDocuments)
        .set({
          content: JSON.stringify(content),
          updatedBy: userId || document.updatedBy,
          updatedAt: new Date()
        })
        .where(eq(fda510kDocuments.id, document.id));
    }
  }

  /**
   * Update a workflow field in the database
   */
  private async updateWorkflowField(
    fieldPath: string,
    value: any,
    userId?: number
  ): Promise<void> {
    if (!db) {
      console.error('Database connection not available');
      return;
    }
    
    // Parse field path to determine stage and section
    const [category, fieldName] = fieldPath.split('.');
    
    // Map category to stage/section (simplified)
    const stageMapping: Record<string, { stage: string; section: string }> = {
      'device': { stage: 'setup', section: 'device_info' },
      'manufacturer': { stage: 'setup', section: 'manufacturer_info' },
      'predicate': { stage: 'strategy', section: 'predicate_comparison' },
      'testing': { stage: 'evidence_plan', section: 'test_plan' },
      'labeling': { stage: 'submission_review', section: 'labeling' },
      'clinical': { stage: 'clinical_regulatory', section: 'clinical_data' }
    };

    const mapping = stageMapping[category];
    if (!mapping) return;

    // Get existing progress
    const progress = await db
      .select()
      .from(fda510kStageProgress)
      .where(
        and(
          eq(fda510kStageProgress.stageName, mapping.stage),
          eq(fda510kStageProgress.sectionName, mapping.section)
        )
      )
      .limit(1);

    if (progress.length > 0) {
      const data = progress[0].collectedData || {};
      this.setNestedField(data, fieldPath, value);
      
      await db
        .update(fda510kStageProgress)
        .set({
          collectedData: data,
          updatedAt: new Date()
        })
        .where(eq(fda510kStageProgress.id, progress[0].id));
    }
  }

  /**
   * Helper to set nested field value
   */
  private setNestedField(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    let current = obj;
    for (const key of keys) {
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[lastKey] = value;
  }

  /**
   * Validate field value
   */
  private validateField(value: any, validation: any): { valid: boolean; error?: string } {
    if (validation.required && !value) {
      return { valid: false, error: 'Field is required' };
    }

    if (validation.maxLength && value?.length > validation.maxLength) {
      return { valid: false, error: `Maximum length is ${validation.maxLength}` };
    }

    if (validation.pattern && value) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return { valid: false, error: `Value does not match required pattern: ${validation.pattern}` };
      }
    }

    return { valid: true };
  }

  /**
   * Get all field links for a workflow section
   */
  getFieldLinksForSection(section: string): FieldLink[] {
    const links: FieldLink[] = [];
    
    this.fieldLinks.forEach((link, key) => {
      if (key.startsWith(section)) {
        links.push(link);
      }
    });
    
    return links;
  }

  /**
   * Check field completeness for a project
   */
  async checkFieldCompleteness(projectId: number): Promise<{
    complete: number;
    total: number;
    missing: string[];
  }> {
    const missing: string[] = [];
    let complete = 0;
    const total = this.fieldLinks.size;

    // Check each field link
    for (const [fieldPath, link] of this.fieldLinks) {
      if (link.validation?.required) {
        // Check if field has value in workflow data
        const hasValue = await this.checkWorkflowFieldValue(projectId, fieldPath);
        
        if (hasValue) {
          complete++;
        } else {
          missing.push(fieldPath);
        }
      } else {
        complete++; // Optional fields count as complete
      }
    }

    return { complete, total, missing };
  }

  /**
   * Check if a workflow field has a value
   */
  private async checkWorkflowFieldValue(projectId: number, fieldPath: string): Promise<boolean> {
    // Implementation would check the actual database
    // This is simplified for demonstration
    return true;
  }

  /**
   * Subscribe to field updates
   */
  subscribeToField(fieldPath: string, callback: (update: FieldUpdate) => void): void {
    this.on(`field:${fieldPath}`, callback);
  }

  /**
   * Unsubscribe from field updates
   */
  unsubscribeFromField(fieldPath: string, callback: (update: FieldUpdate) => void): void {
    this.off(`field:${fieldPath}`, callback);
  }
}

// Export singleton instance
export const smartFieldLinking = new SmartFieldLinking();