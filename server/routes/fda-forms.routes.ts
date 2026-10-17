import { Router, Request, Response } from 'express';
import { db } from '../db';
import { fda510kDocuments } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import DocumentOrchestrationService from '../services/DocumentOrchestrationService';
import FDAFormGenerator, {
  loadFormProjectData,
  FORM_NOT_DRAFTED,
  FORM_NOT_SAVED,
  formRunMessage,
} from '../services/FDAFormGenerator';
import {
  FDAFormsRegistryClass,
  FDA_FORMS_RELEASE_READINESS,
  type FdaCenter,
  type ProductDomain,
  type SubmissionProgram,
} from '../config/FDAFormsRegistry';

const router = Router();

function requireOrgId(req: Request, res: Response): number | null {
  const orgId = Number((req as any).user?.organizationId || (req as any).tenantId);
  if (!orgId) {
    res.status(401).json({ error: 'Organization context required' });
    return null;
  }
  return orgId;
}

/**
 * SECURITY (21 CFR Part 11): the actor recorded as document createdBy/updatedBy
 * must come from the verified JWT, never from a client-supplied x-user-id header.
 * Returns the JWT actor id (number) or null after sending a 401.
 */
function requireActorId(req: Request, res: Response): number | null {
  const actorId = (req as any).user?.id ?? (req as any).user?.userId;
  const numericId = Number(actorId);
  if (actorId === undefined || actorId === null || actorId === '' || Number.isNaN(numericId)) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return numericId;
}

/**
 * A run over several forms answers as the audit-trail batch does
 * (audit-trail-routes.ts): 200 only when every form was produced, otherwise 207
 * with success: false and each form not produced named with a fixed reason. The
 * caught error goes to the log, never into the body.
 */
function formRunStatus(notProduced: number): { status: 200 | 207; success: boolean } {
  return notProduced === 0 ? { status: 200, success: true } : { status: 207, success: false };
}

/** One form of an auto-generate run: drafted and saved, or not, with a fixed reason. */
type FormRunResult =
  | { formType: string; success: true; completeness: number }
  | { formType: string; success: false; reason: string };

const formsRegistry = new FDAFormsRegistryClass();

// Get forms registry
router.get('/registry', async (req: Request, res: Response) => {
  try {
    const registry = formsRegistry.getFullRegistry();
    const categories = formsRegistry.getCategories();
    const totalForms = Object.keys(registry).length;
    
    res.json({
      registry,
      categories,
      totalForms,
      releaseReadiness: FDA_FORMS_RELEASE_READINESS,
      version: '2.0.0',
      lastUpdated: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[FDA Forms] Error fetching registry:', error);
    res.status(500).json({ error: 'Failed to fetch forms registry' });
  }
});

// Get the forms APPLICABLE to a client's program / domain / center — the
// program-scoped form list the device-centric category alone couldn't provide.
// Query: ?program=IND|NDA|510k|… &domain=drug|biologic|device &center=CDER|CDRH|…
// Unknown/absent criteria simply don't constrain (unknown program → no matches).
router.get('/applicable', async (req: Request, res: Response) => {
  try {
    const asStr = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    const criteria = {
      program: asStr(req.query.program) as SubmissionProgram | undefined,
      domain: asStr(req.query.domain) as ProductDomain | undefined,
      center: asStr(req.query.center) as FdaCenter | undefined,
    };
    const forms = formsRegistry.getApplicableForms(criteria);
    res.json({
      criteria,
      forms,
      totalForms: forms.length,
      releaseReadiness: FDA_FORMS_RELEASE_READINESS,
    });
  } catch (error: any) {
    console.error('[FDA Forms] Error fetching applicable forms:', error);
    res.status(500).json({ error: 'Failed to fetch applicable forms' });
  }
});

// Get available FDA forms for a project
router.get('/project/:projectId/forms', async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
  if (!organizationId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    // Fetch existing generated forms
    const existingForms = await db
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.projectId, parseInt(projectId)),
          eq(fda510kDocuments.organizationId, organizationId)
        )
      );

    // Define available forms
    const availableForms = [
      {
        id: 'FDA_3514',
        name: 'FDA Form 3514 - CDRH Premarket Notification Cover Sheet',
        description: 'Cover sheet with applicant and device information',
        required: true,
        status: existingForms.find(f => f.documentType === 'FDA_3514') ? 'generated' : 'pending'
      },
      {
        id: 'FDA_3601',
        name: 'FDA Form 3601 - User Fee Cover Sheet',
        description: 'Payment and fee information for submission',
        required: true,
        status: existingForms.find(f => f.documentType === 'FDA_3601') ? 'generated' : 'pending'
      },
      {
        id: 'FDA_3881',
        name: 'FDA Form 3881 - Indications for Use Statement',
        description: 'Clinical indications and patient population',
        required: true,
        status: existingForms.find(f => f.documentType === 'FDA_3881') ? 'generated' : 'pending'
      },
      {
        // 2026-10-15: listed as "FDA Form 3654"; Form FDA 3654 is the Standards
        // Data Report for 510(k)s (config/FDAFormsRegistry.ts). Key kept: rows are stored under it.
        id: 'FDA_3654',
        name: 'Certification/Disclosure Statement (510(k))',
        description: 'Truthful-and-accurate certification and clinical-investigation disclosures. Not Form FDA 3654, which is the Standards Data Report for 510(k)s.',
        required: true,
        status: existingForms.find(f => f.documentType === 'FDA_3654') ? 'generated' : 'pending'
      }
    ];

    res.json({
      projectId,
      forms: availableForms,
      existingForms: existingForms.map(f => ({
        id: f.id,
        documentType: f.documentType,
        version: f.version,
        status: f.status,
        completeness: f.complianceScore,
        updatedAt: f.updatedAt
      }))
    });
  } catch (error: any) {
    console.error('Error fetching FDA forms:', error);
    res.status(500).json({ error: 'Failed to fetch FDA forms' });
  }
});

// Generate a specific FDA form
router.post('/project/:projectId/generate/:formType', async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const formType = String(req.params.formType);
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
  const actorId = requireActorId(req, res);
  if (actorId === null) return;

  try {
    const formGenerator = new FDAFormGenerator();

    // Fetch project and workflow data
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const projectData = await loadFormProjectData(parseInt(projectId), organizationId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate the specific form
    const generatedForm = await formGenerator.generate510kForm(formType, projectData);
    if (!generatedForm) {
      return res.status(400).json({ error: 'Invalid form type' });
    }

    // Save to database
    const documentRecord = {
      documentId: `${formType}_${projectId}_${Date.now()}`,
      projectId: parseInt(projectId),
      documentType: formType,
      documentName: generatedForm.name,
      content: generatedForm.htmlContent,
      formData: { ...(generatedForm.formData as any), completeness: generatedForm.completeness },
      version: 1,
      status: 'draft',
      complianceScore: generatedForm.completeness,
      createdBy: actorId,
      updatedBy: actorId,
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // SECURITY (cross-tenant write): this lookup matched on projectId +
    // documentType with no organizationId filter, and the UPDATE below then
    // keyed on the row id it found. A caller who guessed another tenant's
    // projectId would overwrite that tenant's FDA form — content, formData and
    // compliance score — and bump its version. `organizationId` was already
    // resolved from the verified JWT above and simply not used here.
    const existingForm = await db
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.projectId, parseInt(projectId)),
          eq(fda510kDocuments.documentType, formType),
          eq(fda510kDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existingForm.length > 0) {
      // Update existing form
      await db
        .update(fda510kDocuments)
        .set({
          content: documentRecord.content,
          formData: documentRecord.formData,
          version: (existingForm[0].version ?? 1) + 1,
          complianceScore: documentRecord.complianceScore,
          updatedBy: documentRecord.updatedBy,
          updatedAt: new Date()
        })
        // Org predicate repeated on the write: the SELECT and the UPDATE are
        // separate statements, so scoping only the read is a check-then-act.
        .where(
          and(
            eq(fda510kDocuments.id, existingForm[0].id),
            eq(fda510kDocuments.organizationId, organizationId)
          )
        );
      
      documentRecord.version = (existingForm[0].version ?? 1) + 1;
    } else {
      // Insert new form
      await db.insert(fda510kDocuments).values(documentRecord);
    }

    res.json({
      success: true,
      form: {
        id: documentRecord.documentId,
        type: formType,
        name: generatedForm.name,
        completeness: generatedForm.completeness,
        version: documentRecord.version,
        htmlContent: generatedForm.htmlContent,
        formData: generatedForm.formData
      }
    });

  } catch (error: any) {
    console.error(`Error generating ${formType}:`, error);
    res.status(500).json({ error: `Failed to generate ${formType}` });
  }
});

// Generate all FDA forms for a project
router.post('/project/:projectId/generate-all', async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
  // SECURITY (21 CFR Part 11): actor for document generation must come from the
  // verified JWT, never from a client-supplied x-user-id header.
  const actorIdRaw = (req as any).user?.id ?? (req as any).user?.userId;
  if (actorIdRaw === undefined || actorIdRaw === null || actorIdRaw === '') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const userId = String(actorIdRaw);
  // 2026-10-15: ran without an organization, passing "NaN" or "0" through.
  if (requireOrgId(req, res) === null) return;

  try {
    const orchestrationService = new DocumentOrchestrationService();

    // Orchestrate generation of all documents
    const result = await orchestrationService.orchestrateDocumentGeneration(
      projectId,
      userId,
      organizationId.toString()
    );

    // 2026-10-15: answered "All FDA forms generated successfully" whatever the
    // run produced; it now says which forms were not produced, and why.
    const run = formRunStatus(result.failed.length);
    res.status(run.status).json({
      success: run.success,
      message: result.message,
      forms: result.forms,
      failed: result.failed,
    });

  } catch (error: any) {
    console.error('Error generating all forms:', error);
    res.status(500).json({ error: 'Failed to generate FDA forms' });
  }
});
// Generate any SMART form from registry
router.post('/project/:projectId/generate-smart/:formId', async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const formId = String(req.params.formId);
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
  const actorId = requireActorId(req, res);
  if (actorId === null) return;

  try {
    const formGenerator = new FDAFormGenerator();

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Fetch project and workflow data — scoped to the caller's org
    const projectData = await loadFormProjectData(parseInt(projectId), organizationId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate the smart form
    const generatedForm = await formGenerator.generateSmartForm(formId, projectData);

    if (generatedForm) {
      // Save to database
      const documentRecord = {
        documentId: `${formId}_${projectId}_${Date.now()}`,
        projectId: parseInt(projectId),
        documentType: formId,
        documentName: generatedForm.name,
        content: generatedForm.htmlContent,
        formData: { ...(generatedForm.formData as any), completeness: generatedForm.completeness },
        version: 1,
        status: 'draft',
        complianceScore: generatedForm.completeness,
        createdBy: actorId,
        updatedBy: actorId,
        organizationId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Check if form already exists and update or insert
      const existingForm = await db
        .select()
        .from(fda510kDocuments)
        // SECURITY: same cross-tenant write as the handler above — projectId +
        // documentType with no tenant filter, then an UPDATE keyed on the found
        // row id.
        .where(
          and(
            eq(fda510kDocuments.projectId, parseInt(projectId)),
            eq(fda510kDocuments.documentType, formId),
            eq(fda510kDocuments.organizationId, organizationId)
          )
        )
        .limit(1);

      if (existingForm.length > 0) {
        // Update existing form
        await db
          .update(fda510kDocuments)
          .set({
            content: documentRecord.content,
            formData: documentRecord.formData,
            version: (existingForm[0].version ?? 1) + 1,
            complianceScore: documentRecord.complianceScore,
            updatedBy: documentRecord.updatedBy,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(fda510kDocuments.id, existingForm[0].id),
              eq(fda510kDocuments.organizationId, organizationId)
            )
          );
        
        documentRecord.version = (existingForm[0].version ?? 1) + 1;
      } else {
        // Insert new form
        await db.insert(fda510kDocuments).values(documentRecord);
      }

      res.json({
        success: true,
        form: generatedForm,
        version: documentRecord.version
      });
    } else {
      res.status(400).json({ error: 'Failed to generate form' });
    }

  } catch (error: any) {
    console.error(`Error generating smart form ${formId}:`, error);
    res.status(500).json({ error: 'Failed to generate smart form' });
  }
});

// Auto-generate forms when workflow is updated
router.post('/project/:projectId/auto-generate', async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
  const actorId = requireActorId(req, res);
  if (actorId === null) return;

  try {
    const formGenerator = new FDAFormGenerator();

    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Fetch project and workflow data — scoped to the caller's org
    const projectData = await loadFormProjectData(parseInt(projectId), organizationId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Import the registry to get all form IDs
    const { FDAFormsRegistry, getRequiredForms } = await import('../config/FDAFormsRegistry');
    
    // Determine submission type from project data. fda510kProjects has no
    // dedicated submission-type column, so read it from the project's
    // metadata json bag (narrow cast at the untyped-json boundary), and
    // default to a 510(k) submission.
    const projectMetadata = (projectData.fda510kProject?.metadata ?? {}) as {
      submissionType?: string;
    };
    const submissionType = projectMetadata.submissionType || '510k';
    
    // Get all required forms for this submission type
    const formsToGenerate = getRequiredForms(submissionType as '510k' | 'PMA' | 'DeNovo');
    const results: FormRunResult[] = [];

    // 2026-10-15: a failed form's error.message (the database's own text) went
    // into a 200 body headed success: true, "Forms auto-generated successfully".
    for (const formId of formsToGenerate) {
      let step: 'draft' | 'save' = 'draft';
      try {
        // Use the new smart form generator for all forms
        const generatedForm = await formGenerator.generateSmartForm(formId, projectData);

        if (generatedForm) {
          step = 'save';
          // Save to database
          const documentRecord = {
            documentId: `${formId}_${projectId}_${Date.now()}`,
            projectId: parseInt(projectId),
            documentType: formId,
            documentName: generatedForm.name,
            content: generatedForm.htmlContent,
            formData: { ...(generatedForm.formData as any), completeness: generatedForm.completeness },
            version: 1,
            status: 'draft',
            complianceScore: generatedForm.completeness,
            createdBy: actorId,
            updatedBy: actorId,
            organizationId,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Check if form already exists and update or insert.
          // SECURITY: scope by organizationId on both the read and the write,
          // matching the /generate and /generate-smart siblings. loadFormProjectData
          // already org-gates the project, but the doc-level org predicate is the
          // required backstop against check-then-act cross-tenant overwrite.
          const existingForm = await db
            .select()
            .from(fda510kDocuments)
            .where(
              and(
                eq(fda510kDocuments.projectId, parseInt(projectId)),
                eq(fda510kDocuments.documentType, formId),
                eq(fda510kDocuments.organizationId, organizationId)
              )
            )
            .limit(1);

          if (existingForm.length > 0) {
            // Update existing form
            await db
              .update(fda510kDocuments)
              .set({
                content: documentRecord.content,
                formData: documentRecord.formData,
                version: (existingForm[0].version ?? 1) + 1,
                complianceScore: documentRecord.complianceScore,
                updatedBy: documentRecord.updatedBy,
                updatedAt: new Date()
              })
              .where(
                and(
                  eq(fda510kDocuments.id, existingForm[0].id),
                  eq(fda510kDocuments.organizationId, organizationId)
                )
              );
            
            documentRecord.version = (existingForm[0].version ?? 1) + 1;
          } else {
            // Insert new form
            await db.insert(fda510kDocuments).values(documentRecord);
          }

          results.push({
            formType: formId,
            success: true,
            completeness: generatedForm.completeness
          });
        }
      } catch (error: unknown) {
        console.error(`Error auto-generating ${formId}:`, error);
        results.push({ formType: formId, success: false, reason: step === 'draft' ? FORM_NOT_DRAFTED : FORM_NOT_SAVED });
      }
    }

    const notProduced = results.filter((r) => !r.success).map((r) => r.formType);
    const run = formRunStatus(notProduced.length);
    res.status(run.status).json({
      success: run.success,
      message: formRunMessage(results.length - notProduced.length, notProduced),
      results
    });

  } catch (error: any) {
    console.error('Error in auto-generation:', error);
    res.status(500).json({ error: 'Failed to auto-generate forms' });
  }
});

// Get a specific generated form
router.get('/project/:projectId/form/:formType', async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const formType = String(req.params.formType);
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);

  try {
    const form = await db
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.projectId, parseInt(projectId)),
          eq(fda510kDocuments.documentType, formType),
          eq(fda510kDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (form.length === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }

    res.json({
      form: form[0]
    });

  } catch (error: any) {
    console.error('Error fetching form:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});
router.post('/project/:projectId/generate-stage/:stage', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const stage = String(req.params.stage);
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const formGenerator = new FDAFormGenerator();

    // Map stages to relevant forms
    const stageFormMap: { [key: string]: string[] } = {
      '0': ['form_3514', 'form_3601'],
      '1': ['form_3881', 'form_3654'],
      '2': ['form_3872', 'form_3674'],
      '3': ['form_2891', 'form_3455'],
      '4': ['form_3429', 'form_3500A'],
      '5': ['form_3419', 'form_3417'],
      '6': ['form_3847', 'form_3898']
    };
    
    const formsToGenerate = stageFormMap[stage] || [];
    const results = [];
    
    // Fetch project data once — scoped to the caller's org
    const projectData = await loadFormProjectData(parseInt(projectId), organizationId);
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate each stage form. 2026-10-15: as auto-generate — the caught
    // error's text in a 200 body headed success: true.
    for (const formId of formsToGenerate) {
      try {
        const generatedForm = await formGenerator.generateSmartForm(formId, projectData);
        results.push({
          formId,
          status: 'success',
          form: generatedForm
        });
      } catch (error: unknown) {
        console.error(`[FDA Forms] Error drafting stage form ${formId}:`, error);
        results.push({
          formId,
          status: 'error',
          reason: FORM_NOT_DRAFTED
        });
      }
    }

    const totalFailed = results.filter(r => r.status === 'error').length;
    const run = formRunStatus(totalFailed);
    res.status(run.status).json({
      success: run.success,
      projectId,
      stage,
      results,
      totalGenerated: results.filter(r => r.status === 'success').length,
      totalFailed,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[FDA Forms] Error generating stage forms:', error);
    res.status(500).json({ error: 'Failed to generate stage forms' });
  }
});

// The project record the form builders read is loadFormProjectData in
// services/FDAFormGenerator.ts (moved there 2026-10-15 so the 510(k)
// orchestration drafts from the same record with the same builders).

export default router;
