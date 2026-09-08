import { db } from '../db';
import { resolveSignerIdentity } from './part11/resolve-signer-identity.js';
import { drizzleSignatureClient } from './part11/signature-persistence.js';
import {
  fda510kProjects,
  fda510kDocuments,
  fda510kStageProgress,
  documentAuditTrail,
  users
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import CrossReferenceMapper from './CrossReferenceMapping.js';

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

class DocumentOrchestrationService {
  /**
   * Main orchestration method - takes workflow data and generates FDA forms.
   *
   * NOTE (Phase 1 consolidation): this used to also generate a '510k-main'
   * document by filling the eight hardcoded HTML templates in
   * FDA510kTemplateServiceBackend with [placeholder] substitution. That
   * duplicate 510(k) drafting path was deleted — the canonical 510(k)
   * section drafting is AnA write_kit_section + /api/510k/estar/build over
   * cerv2_510k_sections. What remains here is the FDA form generation
   * (3514/3601/3881/3654) consumed by fda-forms.routes.ts generate-all and
   * documentOrchestrationRoutes.ts.
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

      // 2. Generate FDA forms
      const forms = await this.generateFDAForms(
        project,
        workflowData,
        userIdNum,
        orgIdNum
      );

      // 3. Create audit trail - use original string IDs for better tracking
      await this.createAuditTrail(projectIdNum, userIdNum, orgIdNum, 'document_generated', {
        formIds: forms.map(f => f.documentId),
        userIdStr,  // Include original string ID for audit
        orgIdStr    // Include original string ID for audit
      });

      return {
        success: true,
        forms,
        message: 'FDA forms generated successfully'
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
        await db!.insert(fda510kDocuments).values({
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
    // SECURITY (cross-tenant write): both statements below matched on
    // documentId alone. `organizationId` was accepted as a parameter and used
    // only to stamp the audit row, never to scope the read or the update — so a
    // caller in org A could lock org B's 510(k) document by naming its id, and
    // the audit trail would record the action under org A. Every READ path in
    // documentOrchestrationRoutes.ts already filters on organizationId with an
    // explicit security comment; the mutations did not.
    if (!organizationId) {
      throw new Error('Organization context required');
    }
    const userIdStr = userId;
    const userIdNum = parseInt(userIdStr);
    const orgIdNum = parseInt(organizationId);
    if (!Number.isFinite(orgIdNum)) {
      throw new Error('Organization context required');
    }

    // Get current document — scoped, so a foreign-tenant id is indistinguishable
    // from a nonexistent one.
    const [currentDoc] = await db!
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.documentId, documentId),
          eq(fda510kDocuments.organizationId, orgIdNum)
        )
      )
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
      })
      // Org predicate repeated on the write, not just the read: the SELECT above
      // and this UPDATE are separate statements, so scoping only the read is a
      // check-then-act. Cheap to make the write independently correct.
      .where(
        and(
          eq(fda510kDocuments.documentId, documentId),
          eq(fda510kDocuments.organizationId, orgIdNum)
        )
      )
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

    // SECURITY (cross-tenant write): this read matched on documentId alone,
    // despite the organizationId check three lines above. The INSERT below then
    // copies `organizationId: currentDoc.organizationId` — so a caller in org A
    // could name org B's documentId and create a brand-new row INSIDE org B,
    // carrying org B's content forward under org A's user id.
    const [currentDoc] = await db!
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.documentId, documentId),
          eq(fda510kDocuments.organizationId, orgIdNum)
        )
      )
      .limit(1);

    if (!currentDoc) {
      throw new Error('Document not found');
    }

    // Create new version
    const newDocumentId = this.generateDocumentId();
    const newVersion = (currentDoc.version ?? 1) + 1;

    const [newDoc] = await db!.insert(fda510kDocuments).values({
      documentId: newDocumentId,
      projectId: currentDoc.projectId,
      templateId: currentDoc.templateId,
      documentType: currentDoc.documentType,
      documentName: currentDoc.documentName,
      content: currentDoc.content,
      version: newVersion,
      status: 'draft',
      previousVersionId: currentDoc.id,
      formData: currentDoc.formData,
      createdBy: userIdNum,
      updatedBy: userIdNum,
      organizationId: currentDoc.organizationId,
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
    // Use the new document_audit_trail table for 21 CFR Part 11 compliance.
    // userName/userEmail are denormalized on the audit row for compliance, so
    // resolve them from the acting user record.
    // The actor named on a governed audit row, resolved through the shared
    // Part 11 lookup. This used to be a bare primary-key read of `users` —
    // unscoped, so a user id from another tenant would have resolved a name and
    // written it onto this org's audit trail — and it then defaulted the name to
    // `user-${userId}` and the email to `''` when the read found nothing. An
    // audit row whose actor is a synthesised string attributes an action to
    // nobody while looking like it attributes it to someone.
    const actingUser = await resolveSignerIdentity(
      drizzleSignatureClient(db!),
      userId,
      organizationId,
      `document ${action}`,
    );

    await db!.insert(documentAuditTrail).values({
      organizationId,
      userId,
      userName: actingUser.name,
      userEmail: actingUser.email,
      actionType: action,
      actionCategory: 'document',
      actionDescription: `${action} for project ${projectId}`,
      actionResult: 'success',
      newValue: metadata,
      timestamp: new Date(),
    });
    
    console.log(`Audit Trail: ${action} for project ${projectId} by user ${userId}`);
  }
}

export default DocumentOrchestrationService;