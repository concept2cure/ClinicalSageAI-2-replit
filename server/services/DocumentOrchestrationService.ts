import { db } from '../db';
import { 
  fda510kProjects, 
  fda510kDocuments, 
  fda510kDataMappings,
  fda510kTemplates,
  fda510kStageProgress,
  documentAuditTrail
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';
import FDA510kTemplateService from './FDA510kTemplateServiceBackend.js';
import CrossReferenceMapper from './CrossReferenceMapping.js';
import { smartFieldLinking } from './SmartFieldLinking.js';

interface WorkflowData {
  deviceInfo?: any;
  regulatoryInfo?: any;
  predicateComparison?: any;
  testingData?: any;
  clinicalData?: any;
  labelingInfo?: any;
  qualitySystem?: any;
  [key: string]: any;
}

interface MappingRule {
  id: number;
  mappingCode: string;
  mappingName: string;
  sourceType: string;
  sourceReference: string;
  targetTemplate: string;
  targetField: string;
  transformationType?: string | null;
  transformationRules?: any;
}

interface DocumentMetadata {
  documentId: string;
  projectId: number;
  documentType: string;
  version: number;
  status: string;
  lockedBy?: number | null;
  lockedAt?: Date | null;
  finalHash?: string | null;
}

class DocumentOrchestrationService {
  private templateService: FDA510kTemplateService;
  private crossReferenceMapper: CrossReferenceMapper;

  constructor() {
    this.templateService = new FDA510kTemplateService();
    this.crossReferenceMapper = new CrossReferenceMapper();
  }

  /**
   * Main orchestration method - takes workflow data and generates all documents
   */
  async orchestrateDocumentGeneration(projectId: string, userId: string, organizationId: string): Promise<any> {
    try {
      // Keep projectId as number for database queries
      const projectIdNum = parseInt(projectId);
      // Keep user and org IDs as strings to support UUIDs and other formats
      if (!userId) {
        throw new Error('User context required');
      }
      if (!organizationId) {
        throw new Error('Organization context required');
      }
      const userIdStr = userId;
      const orgIdStr = organizationId;

      // For database operations that expect numbers, convert when needed
      const userIdNum = parseInt(userIdStr);
      const orgIdNum = parseInt(orgIdStr);

      // 1. Fetch project and all workflow data
      const project = await this.fetchProject(projectIdNum);
      if (!project) throw new Error('Project not found');

      const workflowData = await this.aggregateWorkflowData(projectIdNum);

      // 2. Load mapping rules for this organization
      const mappingRules = await this.loadMappingRules(orgIdNum);
      
      // 2a. Create intelligent cross-reference mapping
      const crossRefRules = await this.crossReferenceMapper.createMappingRules(
        projectIdNum,
        (project as any).templateId || 'default',
        orgIdNum
      );
      
      // 2b. Map workflow data to eSTAR sections
      const mappedSections = await this.crossReferenceMapper.mapDataToSections(
        workflowData,
        crossRefRules
      );

      // 3. Generate main 510(k) document sections with enhanced mapping
      const mainDocument = await this.generateMainDocument(
        project, 
        workflowData, 
        mappingRules, 
        userIdNum, 
        orgIdNum,
        mappedSections  // Pass mapped sections
      );

      // 4. Generate FDA forms
      const forms = await this.generateFDAForms(
        project, 
        workflowData, 
        userIdNum, 
        orgIdNum
      );

      // 5. Create audit trail - use original string IDs for better tracking
      await this.createAuditTrail(projectIdNum, userIdNum, orgIdNum, 'document_generated', {
        mainDocumentId: mainDocument.documentId,
        formIds: forms.map(f => f.documentId),
        userIdStr,  // Include original string ID for audit
        orgIdStr    // Include original string ID for audit
      });

      return {
        success: true,
        mainDocument,
        forms,
        message: 'Documents generated successfully'
      };
    } catch (error) {
      console.error('Document orchestration error:', error);
      throw error;
    }
  }

  /**
   * Fetch project details
   */
  private async fetchProject(projectId: number) {
    const [project] = await db!
      .select()
      .from(fda510kProjects)
      .where(eq(fda510kProjects.id, projectId))
      .limit(1);
    
    return project;
  }

  /**
   * Aggregate all workflow data from different stages
   */
  private async aggregateWorkflowData(projectId: number): Promise<WorkflowData> {
    // Fetch all stage progress for this project
    const stageProgress = await db!
      .select()
      .from(fda510kStageProgress)
      .where(eq(fda510kStageProgress.projectId, projectId));

    // Aggregate data from all stages
    const workflowData: WorkflowData = {};
    
    for (const stage of stageProgress) {
      if (stage.collectedData) {
        const stageData = typeof stage.collectedData === 'string' 
          ? JSON.parse(stage.collectedData) 
          : stage.collectedData;
        
        // Map stage data to workflow sections based on stageName
        switch (stage.stageName) {
          case 'setup':
          case 'device_information':
            workflowData.deviceInfo = { ...workflowData.deviceInfo, ...stageData };
            break;
          case 'strategy':
          case 'regulatory_strategy':
            workflowData.regulatoryInfo = { ...workflowData.regulatoryInfo, ...stageData };
            break;
          case 'evidence_plan':
          case 'predicate_comparison':
            workflowData.predicateComparison = { ...workflowData.predicateComparison, ...stageData };
            break;
          case 'data_collection':
          case 'testing_requirements':
            workflowData.testingData = { ...workflowData.testingData, ...stageData };
            break;
          case 'document_authoring':
          case 'clinical_data':
            workflowData.clinicalData = { ...workflowData.clinicalData, ...stageData };
            break;
          case 'submission_qa':
          case 'labeling':
            workflowData.labelingInfo = { ...workflowData.labelingInfo, ...stageData };
            break;
          case 'submission':
          case 'quality_system':
            workflowData.qualitySystem = { ...workflowData.qualitySystem, ...stageData };
            break;
          default:
            // Store other data by stageName
            workflowData[stage.stageName] = stageData;
        }
      }
    }

    return workflowData;
  }

  /**
   * Load data mapping rules for the organization
   */
  private async loadMappingRules(organizationId: number): Promise<MappingRule[]> {
    const mappings = await db!
      .select()
      .from(fda510kDataMappings)
      .where(eq(fda510kDataMappings.organizationId, organizationId));

    // If no custom mappings, use default mappings
    if (mappings.length === 0) {
      return this.getDefaultMappingRules(organizationId);
    }

    return mappings as MappingRule[];
  }

  /**
   * Get default mapping rules for standard 510(k) sections
   */
  private getDefaultMappingRules(organizationId: number): MappingRule[] {
    return [
      // Device Information mappings
      {
        id: 0,
        mappingCode: 'DEV_NAME',
        mappingName: 'Device Trade Name',
        sourceType: 'workflow',
        sourceReference: 'deviceInfo.deviceName',
        targetTemplate: '3.0',
        targetField: '[Device Trade Name]',
        transformationType: 'direct',
        transformationRules: null
      },
      {
        id: 0,
        mappingCode: 'DEV_COMMON',
        mappingName: 'Common Name',
        sourceType: 'workflow',
        sourceReference: 'deviceInfo.commonName',
        targetTemplate: '3.0',
        targetField: '[Common Name]',
        transformationType: 'direct',
        transformationRules: null
      },
      {
        id: 0,
        mappingCode: 'DEV_DESC',
        mappingName: 'Device Description',
        sourceType: 'workflow',
        sourceReference: 'deviceInfo.description',
        targetTemplate: '7.0',
        targetField: '[Device Description]',
        transformationType: 'direct',
        transformationRules: null
      },
      {
        id: 0,
        mappingCode: 'DEV_IND',
        mappingName: 'Indications for Use',
        sourceType: 'workflow',
        sourceReference: 'deviceInfo.indicationsForUse',
        targetTemplate: '4.0',
        targetField: '[Indications for Use]',
        transformationType: 'direct',
        transformationRules: null
      },
      // Regulatory mappings
      {
        id: 0,
        mappingCode: 'REG_CODE',
        mappingName: 'Product Code',
        sourceType: 'workflow',
        sourceReference: 'regulatoryInfo.productCode',
        targetTemplate: '3.0',
        targetField: '[3-letter FDA Product Code]',
        transformationType: 'direct',
        transformationRules: null
      },
      {
        id: 0,
        mappingCode: 'REG_NUM',
        mappingName: 'Regulation Number',
        sourceType: 'workflow',
        sourceReference: 'regulatoryInfo.regulationNumber',
        targetTemplate: '3.0',
        targetField: '[XXX.XXXX]',
        transformationType: 'direct',
        transformationRules: null
      },
      // Predicate mappings
      {
        id: 0,
        mappingCode: 'PRED_NAME',
        mappingName: 'Predicate Device Name',
        sourceType: 'workflow',
        sourceReference: 'predicateComparison.predicateName',
        targetTemplate: '9.0',
        targetField: '[Predicate Device Name]',
        transformationType: 'direct',
        transformationRules: null
      },
      {
        id: 0,
        mappingCode: 'PRED_K',
        mappingName: 'Predicate K Number',
        sourceType: 'workflow',
        sourceReference: 'predicateComparison.predicateKNumber',
        targetTemplate: '9.0',
        targetField: '[XXXXXX]',
        transformationType: 'direct',
        transformationRules: null
      },
      // Company Info mappings
      {
        id: 0,
        mappingCode: 'COMP_NAME',
        mappingName: 'Company Name',
        sourceType: 'workflow',
        sourceReference: 'deviceInfo.companyName',
        targetTemplate: '1.0',
        targetField: '[Company Name]',
        transformationType: 'direct',
        transformationRules: null
      },
      {
        id: 0,
        mappingCode: 'COMP_ADDR',
        mappingName: 'Company Address',
        sourceType: 'workflow',
        sourceReference: 'deviceInfo.companyAddress',
        targetTemplate: '1.0',
        targetField: '[Street Address]',
        transformationType: 'direct',
        transformationRules: null
      }
    ];
  }

  /**
   * Generate the main 510(k) document
   */
  private async generateMainDocument(
    project: any,
    workflowData: WorkflowData,
    mappingRules: MappingRule[],
    userId: number,
    organizationId: number,
    mappedSections?: Record<string, any>  // Enhanced eSTAR mapped sections
  ): Promise<any> {
    const documentId = this.generateDocumentId();
    
    // Get all section templates
    const templates = this.templateService.getAllTemplates();
    const populatedSections: any = {};

    // Process each section template
    for (const [sectionId, template] of Object.entries(templates)) {
      // Get mappings for this section
      const sectionMappings = mappingRules.filter(m => m.targetTemplate === sectionId);
      
      // Populate template with data
      let populatedContent = (template as any).template;
      
      // First, apply enhanced eSTAR section mapping if available
      if (mappedSections) {
        const sectionKey = `section_${sectionId.replace('.', '_')}`;
        if (mappedSections[sectionKey]) {
          // Apply mapped section data to template
          for (const [field, value] of Object.entries(mappedSections[sectionKey])) {
            const placeholder = `\\[${field}\\]`;
            populatedContent = populatedContent.replace(
              new RegExp(placeholder, 'gi'),
              String(value)
            );
          }
        }
      }
      
      // Then apply standard mapping rules
      for (const mapping of sectionMappings) {
        const value = this.extractValueFromPath(workflowData, mapping.sourceReference);
        
        if (value !== undefined) {
          // Apply transformation if specified
          const transformedValue = mapping.transformationType 
            ? this.applyTransformation(value, mapping.transformationType, mapping.transformationRules)
            : value;
          
          // Replace placeholder in template
          populatedContent = populatedContent.replace(
            new RegExp(this.escapeRegExp(mapping.targetField), 'g'),
            transformedValue
          );
        }
      }
      
      populatedSections[sectionId] = {
        ...(template as any),
        content: populatedContent,
        populated: true,
        eStarMapped: mappedSections ? !!mappedSections[`section_${sectionId.replace('.', '_')}`] : false
      };
    }

    // Save to database
    const [document] = await (db!.insert(fda510kDocuments) as any).values({
      documentId: documentId,
      projectId: project.id,
      templateId: 1, // Reference to main-510k template
      documentType: '510k-main',
      documentName: `510(k) Submission - ${project.deviceName || 'Project ' + project.id}`,
      content: JSON.stringify(populatedSections),
      version: 1,
      status: 'draft',
      formData: {
        sections: Object.keys(populatedSections),
        generatedAt: new Date().toISOString(),
        generatedBy: userId
      },
      createdBy: userId,
      updatedBy: userId,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    return document;
  }

  /**
   * Generate FDA forms (3514, 3601, 3881)
   */
  private async generateFDAForms(
    project: any,
    workflowData: WorkflowData,
    userId: number,
    organizationId: number
  ): Promise<any[]> {
    const forms = [];
    const mapper = new CrossReferenceMapper();

    // Add organizationId to workflowData for mapper
    const enrichedWorkflowData = {
      ...workflowData,
      organizationId
    };

    // Generate FDA Forms using enhanced CrossReferenceMapper
    const fdaFormTypes = ['FDA_3514', 'FDA_3601', 'FDA_3881', 'FDA_3654'];
    
    for (const formType of fdaFormTypes) {
      try {
        // Use the new dynamic document assembly
        const assembledForm = await mapper.assembleDocument(
          project.id,
          formType,
          enrichedWorkflowData
        );

        // Save the form to database
        const formData = {
          documentId: `${formType}_${project.id}_${Date.now()}`,
          projectId: project.id,
          documentType: formType,
          documentName: this.getFDAFormTitle(formType),
          content: assembledForm.content,
          version: 1,
          status: 'draft',
          completeness: assembledForm.metadata.completeness,
          formData: assembledForm.metadata,
          createdBy: userId,
          updatedBy: userId,
          organizationId
        };

        // Save to database
        await (db!.insert(fda510kDocuments) as any).values({
          ...formData,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        forms.push(formData);
        console.log(`Generated ${formType} with ${assembledForm.metadata.completeness}% completeness`);
      } catch (error) {
        console.error(`Error generating ${formType}:`, error);
      }
    }

    // Create smart field links for bidirectional synchronization
    const smartLinks = await mapper.createSmartFieldLinks(project.id, enrichedWorkflowData);
    console.log(`Created ${smartLinks.bidirectionalLinks.length} smart field links for FDA forms`);

    return forms;
  }
  
  /**
   * Get FDA form title based on form type
   */
  private getFDAFormTitle(formType: string): string {
    const titles: Record<string, string> = {
      'FDA_3514': 'FDA Form 3514 - CDRH Premarket Notification Cover Sheet',
      'FDA_3601': 'FDA Form 3601 - User Fee Cover Sheet',
      'FDA_3881': 'FDA Form 3881 - Indications for Use',
      'FDA_3654': 'FDA Form 3654 - Certification/Disclosure Statement'
    };
    return titles[formType] || formType;
  }

  /**
   * Generate FDA Form 3601 - User Fee Cover Sheet
   */
  private async generateForm3601(
    project: any,
    workflowData: WorkflowData,
    userId: number,
    organizationId: number
  ): Promise<any> {
    const formData = {
      applicantName: workflowData.deviceInfo?.companyName || '',
      applicantAddress: workflowData.deviceInfo?.companyAddress || '',
      applicantCity: workflowData.deviceInfo?.companyCity || '',
      applicantState: workflowData.deviceInfo?.companyState || '',
      applicantZip: workflowData.deviceInfo?.companyZip || '',
      applicantPhone: workflowData.deviceInfo?.companyPhone || '',
      applicantEmail: workflowData.deviceInfo?.companyEmail || '',
      deviceTradeName: workflowData.deviceInfo?.deviceName || '',
      deviceClassification: workflowData.regulatoryInfo?.deviceClass || 'Class II',
      productCode: workflowData.regulatoryInfo?.productCode || '',
      regulationNumber: workflowData.regulatoryInfo?.regulationNumber || '',
      feeType: '510(k) Premarket Notification',
      paymentMethod: workflowData.regulatoryInfo?.paymentMethod || 'To be determined',
      smallBusiness: workflowData.regulatoryInfo?.smallBusiness || false
    };

    const documentId = this.generateDocumentId();
    
    const [document] = await (db!.insert(fda510kDocuments) as any).values({
      documentId: documentId,
      projectId: project.id,
      templateId: 2, // Reference to form-3601 template
      documentType: 'fda-form',
      title: 'FDA Form 3601 - User Fee Cover Sheet',
      content: JSON.stringify(formData),
      version: 1,
      status: 'draft',
      metadata: {
        formType: '3601',
        formVersion: '2024',
        generatedAt: new Date().toISOString()
      },
      createdBy: userId,
      updatedBy: userId,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    return document;
  }

  /**
   * Generate FDA Form 3514 - CDRH Premarket Review Submission Cover Sheet
   */
  private async generateForm3514(
    project: any,
    workflowData: WorkflowData,
    userId: number,
    organizationId: number
  ): Promise<any> {
    const formData = {
      submissionType: '510(k)',
      deviceName: workflowData.deviceInfo?.deviceName || '',
      commonName: workflowData.deviceInfo?.commonName || '',
      classificationName: workflowData.regulatoryInfo?.classificationName || '',
      productCode: workflowData.regulatoryInfo?.productCode || '',
      regulationNumber: workflowData.regulatoryInfo?.regulationNumber || '',
      panel: workflowData.regulatoryInfo?.panel || '',
      applicantInfo: {
        name: workflowData.deviceInfo?.companyName || '',
        address: workflowData.deviceInfo?.companyAddress || '',
        contact: workflowData.deviceInfo?.contactName || '',
        phone: workflowData.deviceInfo?.companyPhone || '',
        email: workflowData.deviceInfo?.companyEmail || ''
      },
      correspondenceInfo: {
        sameAsApplicant: true
      },
      consultantInfo: workflowData.regulatoryInfo?.consultant || null
    };

    const documentId = this.generateDocumentId();
    
    const [document] = await (db!.insert(fda510kDocuments) as any).values({
      documentId: documentId,
      projectId: project.id,
      templateId: 3, // Reference to form-3514 template
      documentType: 'fda-form',
      title: 'FDA Form 3514 - CDRH Premarket Review Submission Cover Sheet',
      content: JSON.stringify(formData),
      version: 1,
      status: 'draft',
      metadata: {
        formType: '3514',
        formVersion: '2024',
        generatedAt: new Date().toISOString()
      },
      createdBy: userId,
      updatedBy: userId,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    return document;
  }

  /**
   * Generate FDA Form 3881 - Indications for Use
   */
  private async generateForm3881(
    project: any,
    workflowData: WorkflowData,
    userId: number,
    organizationId: number
  ): Promise<any> {
    const formData = {
      kNumber: 'K' + new Date().getFullYear() + Math.random().toString().slice(2, 8),
      deviceName: workflowData.deviceInfo?.deviceName || '',
      indicationsForUse: workflowData.deviceInfo?.indicationsForUse || '',
      prescriptionUse: workflowData.regulatoryInfo?.prescriptionDevice !== false,
      overTheCounterUse: workflowData.regulatoryInfo?.prescriptionDevice === false,
      enclosures: workflowData.regulatoryInfo?.enclosures || []
    };

    const documentId = this.generateDocumentId();
    
    const [document] = await (db!.insert(fda510kDocuments) as any).values({
      documentId: documentId,
      projectId: project.id,
      templateId: 4, // Reference to form-3881 template
      documentType: 'fda-form',
      title: 'FDA Form 3881 - Indications for Use',
      content: JSON.stringify(formData),
      version: 1,
      status: 'draft',
      metadata: {
        formType: '3881',
        formVersion: '2024',
        generatedAt: new Date().toISOString()
      },
      createdBy: userId,
      updatedBy: userId,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    return document;
  }

  /**
   * Generate FDA Form 3654 - Certification
   */
  private async generateForm3654(
    project: any,
    workflowData: WorkflowData,
    userId: number,
    organizationId: number
  ): Promise<any> {
    const formData = {
      applicantName: workflowData.deviceInfo?.manufacturerName || '',
      deviceName: workflowData.deviceInfo?.deviceName || '',
      submissionNumber: 'K' + new Date().getFullYear() + Math.random().toString().slice(2, 8),
      certificationStatements: {
        truthfulAndAccurate: true,
        allRequiredInfo: true,
        noMaterialOmissions: true,
        clinicalInvestigations: workflowData.clinicalData?.hasStudies || false,
        financialDisclosure: true,
        goodManufacturingPractices: true
      },
      signatoryName: workflowData.deviceInfo?.contactPerson || '',
      signatoryTitle: workflowData.deviceInfo?.contactTitle || 'Regulatory Affairs Director',
      signatureDate: new Date().toISOString().split('T')[0]
    };

    const documentId = this.generateDocumentId();
    
    const [document] = await (db!.insert(fda510kDocuments) as any).values({
      documentId: documentId,
      projectId: project.id,
      templateId: 5, // Reference to form-3654 template
      documentType: 'fda-form',
      title: 'FDA Form 3654 - Certification',
      content: JSON.stringify(formData),
      version: 1,
      status: 'draft',
      metadata: {
        formType: '3654',
        formVersion: '2024',
        generatedAt: new Date().toISOString()
      },
      createdBy: userId,
      updatedBy: userId,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    return document;
  }

  /**
   * Lock a document for regulatory compliance
   */
  async lockDocument(
    documentId: string,
    userId: string,
    organizationId: string
  ): Promise<any> {
    // Handle both string and numeric IDs safely
    if (!userId) {
      throw new Error('User context required');
    }
    const userIdStr = userId;
    const userIdNum = parseInt(userIdStr);

    // Get current document
    const [currentDoc] = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.documentId, documentId))
      .limit(1);

    if (!currentDoc) {
      throw new Error('Document not found');
    }

    if (currentDoc.status === 'locked' || currentDoc.status === 'submitted') {
      throw new Error('Document is already locked or submitted');
    }

    // Calculate document hash for integrity
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(currentDoc.content))
      .digest('hex');

    // Update document status
    const [updatedDoc] = await db!
      .update(fda510kDocuments)
      .set({
        status: 'locked',
        lockedBy: userIdNum,
        lockedAt: new Date(),
        updatedAt: new Date()
      } as any)
      .where(eq(fda510kDocuments.documentId, documentId))
      .returning();

    // Create audit log
    await this.createAuditTrail(
      currentDoc.projectId,
      userIdNum,
      parseInt(organizationId),
      'document_locked',
      {
        documentId,
        hash: contentHash,
        previousStatus: currentDoc.status
      }
    );

    return updatedDoc;
  }

  /**
   * Create a new version of a document
   */
  async createDocumentVersion(
    documentId: string,
    userId: string,
    organizationId: string
  ): Promise<any> {
    // Handle both string and numeric IDs safely
    if (!userId) {
      throw new Error('User context required');
    }
    if (!organizationId) {
      throw new Error('Organization context required');
    }
    const userIdStr = userId;
    const orgIdStr = organizationId;
    const userIdNum = parseInt(userIdStr);
    const orgIdNum = parseInt(orgIdStr);

    // Get current document
    const [currentDoc] = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.documentId, documentId))
      .limit(1);

    if (!currentDoc) {
      throw new Error('Document not found');
    }

    // Create new version
    const newDocumentId = this.generateDocumentId();
    const currentDocAny = currentDoc as any;
    const newVersion = (currentDocAny.version ?? 0) + 1;

    const [newDoc] = await (db!.insert(fda510kDocuments) as any).values({
      documentId: newDocumentId,
      projectId: currentDocAny.projectId,
      templateId: currentDocAny.templateId,
      documentType: currentDocAny.documentType,
      title: currentDocAny.title,
      content: currentDocAny.content,
      version: newVersion,
      status: 'draft',
      previousVersionId: currentDocAny.id,
      metadata: currentDocAny.metadata,
      createdBy: userIdNum,
      updatedBy: userIdNum,
      organizationId: currentDocAny.organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    // Create audit log
    await this.createAuditTrail(
      currentDoc.projectId,
      userIdNum,
      orgIdNum,
      'document_versioned',
      {
        originalDocumentId: documentId,
        newDocumentId,
        fromVersion: currentDoc.version,
        toVersion: newVersion,
        userIdStr,  // Include original string ID for audit
        orgIdStr    // Include original string ID for audit
      }
    );

    return newDoc;
  }

  /**
   * Helper: Extract value from nested object path
   */
  private extractValueFromPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Helper: Apply transformation to value
   */
  private applyTransformation(value: any, transformationType: string, rules?: any): string {
    try {
      // Simple transformations
      switch (transformationType) {
        case 'uppercase':
          return String(value).toUpperCase();
        case 'lowercase':
          return String(value).toLowerCase();
        case 'date':
          return new Date(value).toLocaleDateString();
        case 'currency':
          return `$${Number(value).toFixed(2)}`;
        case 'direct':
        default:
          return String(value);
      }
    } catch (error) {
      console.error('Transformation error:', error);
      return String(value);
    }
  }

  /**
   * Helper: Escape special regex characters
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Helper: Generate unique document ID
   */
  private generateDocumentId(): string {
    return `DOC-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Create audit trail entry
   */
  private async createAuditTrail(
    projectId: number,
    userId: number,
    organizationId: number,
    action: string,
    metadata: any
  ): Promise<void> {
    // Use the new document_audit_trail table for 21 CFR Part 11 compliance
    await (db!.insert(documentAuditTrail) as any).values({
      organizationId,
      projectId,
      userId,
      action,
      entityType: '510k-document',
      entityId: String(projectId),
      metadata,
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log(`Audit Trail: ${action} for project ${projectId} by user ${userId}`);
  }
}

export default DocumentOrchestrationService;