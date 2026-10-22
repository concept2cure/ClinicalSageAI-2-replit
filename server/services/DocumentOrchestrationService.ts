import { db } from '../db';
import { resolveSignerIdentity } from './part11/resolve-signer-identity.js';
import { drizzleSignatureClient } from './part11/signature-persistence.js';
import {
  fda510kProjects,
  fda510kDocuments,
  documentAuditTrail,
  users
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import FDAFormGenerator, {
  loadFormProjectData,
  FDA_510K_FORM_TYPES,
  FORM_NOT_DRAFTED,
  FORM_NOT_SAVED,
  formRunMessage,
} from './FDAFormGenerator';

/** One form the run drafted and saved, as stored in fda510k_documents (plus its completeness). */
interface GeneratedFormRecord {
  documentId: string;
  projectId: number;
  documentType: string;
  documentName: string;
  content: string;
  version: number;
  status: string;
  formData: Record<string, unknown>;
  /**
   * The share of the form's fields filled, 0-100. 2026-10-15: it was also
   * returned as `complianceScore`, which nothing assessed. (The
   * fda510k_documents column it is stored in keeps that name.)
   */
  completeness: number;
  createdBy: number;
  updatedBy: number;
  organizationId: number;
}

/** One form the run did not produce, with a fixed reason (the error is logged). */
interface FormNotProduced {
  formType: string;
  reason: string;
}

/**
 * The 510(k) project named is not one of the caller's organization's (or does
 * not exist). The routes answer 404; they match it by name.
 */
export class OrchestrationProjectNotFoundError extends Error {
  constructor() {
    super('Project not found');
    this.name = 'OrchestrationProjectNotFoundError';
  }
}

class DocumentOrchestrationService {
  /**
   * Main orchestration method - drafts and saves the FDA forms for a project.
   *
   * NOTE (Phase 1 consolidation): this used to also generate a '510k-main'
   * document by filling the eight hardcoded HTML templates in
   * FDA510kTemplateServiceBackend with [placeholder] substitution. That
   * duplicate 510(k) drafting path was deleted — the canonical 510(k)
   * section drafting is AnA write_kit_section + /api/510k/estar/build over
   * cerv2_510k_sections. What remains here is the FDA form generation
   * (3514/3601/3881/3654) consumed by fda-forms.routes.ts generate-all and
   * documentOrchestrationRoutes.ts.
   *
   * `success` is true only when every form was drafted and saved; `failed`
   * names each one that was not.
   */
  async orchestrateDocumentGeneration(
    projectId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ success: boolean; forms: GeneratedFormRecord[]; failed: FormNotProduced[]; message: string }> {
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

      // 1. Fetch project — this organization's
      const project = await this.fetchProject(projectIdNum, orgIdNum);
      if (!project) throw new OrchestrationProjectNotFoundError();

      // 2. Draft and save the FDA forms
      const { forms, failed } = await this.generateFDAForms(project, userIdNum, orgIdNum);

      // 3. Create audit trail - use original string IDs for better tracking
      await this.createAuditTrail(projectIdNum, userIdNum, orgIdNum, 'document_generated', {
        formIds: forms.map(f => f.documentId),
        notProduced: failed.map(f => f.formType),
        userIdStr,  // Include original string ID for audit
        orgIdStr    // Include original string ID for audit
      });

      // 2026-10-15: always success: true, "FDA forms generated successfully".
      return {
        success: failed.length === 0,
        forms,
        failed,
        message: formRunMessage(forms.length, failed.map(f => f.formType))
      };
    } catch (error) {
      console.error('Document orchestration error:', error);
      throw error;
    }
  }

  /**
   * The organization's 510(k) project with this id, or undefined. 2026-10-15:
   * read by id alone, so another organization's 510(k) project was drafted
   * against (and, when it pointed at this organization's base project, had
   * this organization's forms filed under it).
   */
  private async fetchProject(projectId: number, organizationId: number) {
    if (!Number.isSafeInteger(projectId) || !Number.isSafeInteger(organizationId)) return undefined;
    const [project] = await db!
      .select()
      .from(fda510kProjects)
      .where(and(eq(fda510kProjects.id, projectId), eq(fda510kProjects.organizationId, organizationId)))
      .limit(1);

    return project;
  }

  /**
   * Draft and save the four 510(k) forms (3514, 3601, 3881, 3654) with the
   * canonical builders in FDAFormGenerator, from the org-scoped record they read
   * (loadFormProjectData) — the builders and record POST
   * /api/fda-forms/project/:projectId/generate/:formType uses.
   *
   * 2026-10-15: drafted by CrossReferenceMapper, a second implementation of the
   * same four forms (CrossReferenceMapping.ts, deleted), from its own
   * re-keyed workflow aggregate; a form it could not draft or save was logged and
   * dropped. Each form not produced is now returned in `failed` with a fixed
   * reason. Its "smart field links" step went too: it wrote fda_510k_data_mappings
   * with no organization_id (NOT NULL), so no row was ever stored — field links
   * are SmartFieldLinking.ts.
   */
  private async generateFDAForms(
    project: { id: number; projectId: number },
    userId: number,
    organizationId: number
  ): Promise<{ forms: GeneratedFormRecord[]; failed: FormNotProduced[] }> {
    const projectData = await loadFormProjectData(project.projectId, organizationId);
    if (!projectData) throw new OrchestrationProjectNotFoundError();

    const generator = new FDAFormGenerator();
    const forms: GeneratedFormRecord[] = [];
    const failed: FormNotProduced[] = [];

    for (const formType of FDA_510K_FORM_TYPES) {
      let form: Awaited<ReturnType<FDAFormGenerator['generate510kForm']>>;
      try {
        form = await generator.generate510kForm(formType, projectData);
      } catch (error) {
        console.error('Error drafting FDA form:', { formType }, error);
        failed.push({ formType, reason: FORM_NOT_DRAFTED });
        continue;
      }
      if (!form) {
        failed.push({ formType, reason: FORM_NOT_DRAFTED });
        continue;
      }

      const row = {
        documentId: `${formType}_${project.id}_${Date.now()}`,
        projectId: project.id,
        documentType: formType,
        documentName: form.name,
        content: form.htmlContent,
        version: 1,
        status: 'draft',
        formData: { ...form.formData, completeness: form.completeness },
        createdBy: userId,
        updatedBy: userId,
        organizationId
      };
      try {
        await db!.insert(fda510kDocuments).values({ ...row, complianceScore: form.completeness, createdAt: new Date(), updatedAt: new Date() });
      } catch (error) {
        console.error('Error saving FDA form:', { formType }, error);
        failed.push({ formType, reason: FORM_NOT_SAVED });
        continue;
      }
      forms.push({ ...row, completeness: form.completeness });
    }

    return { forms, failed };
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