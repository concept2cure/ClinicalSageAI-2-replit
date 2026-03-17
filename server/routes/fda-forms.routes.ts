import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  fda510kProjects,
  fda510kStageProgress,
  fda510kDocuments,
  projects,
  organizations
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import DocumentOrchestrationService from '../services/DocumentOrchestrationService';
import FDAFormGenerator from '../services/FDAFormGenerator';
import { FDAFormsRegistryClass } from '../config/FDAFormsRegistry';

const router = Router();
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
      version: '2.0.0',
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[FDA Forms] Error fetching registry:', error);
    res.status(500).json({ error: 'Failed to fetch forms registry' });
  }
});

// Get available FDA forms for a project
router.get('/project/:projectId/forms', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const organizationId = parseInt(req.headers['x-organization-id'] as string || '1');

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
        id: 'FDA_3654',
        name: 'FDA Form 3654 - Certification/Disclosure Statement',
        description: 'Certification of compliance and disclosures',
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
        completeness: f.completeness,
        updatedAt: f.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching FDA forms:', error);
    res.status(500).json({ error: 'Failed to fetch FDA forms' });
  }
});

// Generate a specific FDA form
router.post('/project/:projectId/generate/:formType', async (req: Request, res: Response) => {
  const { projectId, formType } = req.params;
  const organizationId = parseInt(req.headers['x-organization-id'] as string || '1');
  const userId = req.headers['x-user-id'] as string || '1';

  try {
    const formGenerator = new FDAFormGenerator();
    
    // Fetch project and workflow data
    const projectData = await fetchProjectData(parseInt(projectId));
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate the specific form
    let generatedForm;
    switch (formType) {
      case 'FDA_3514':
        generatedForm = await formGenerator.generateForm3514(projectData);
        break;
      case 'FDA_3601':
        generatedForm = await formGenerator.generateForm3601(projectData);
        break;
      case 'FDA_3881':
        generatedForm = await formGenerator.generateForm3881(projectData);
        break;
      case 'FDA_3654':
        generatedForm = await formGenerator.generateForm3654(projectData);
        break;
      default:
        return res.status(400).json({ error: 'Invalid form type' });
    }

    // Save to database
    const documentRecord = {
      documentId: `${formType}_${projectId}_${Date.now()}`,
      projectId: parseInt(projectId),
      documentType: formType,
      documentName: generatedForm.name,
      content: generatedForm.htmlContent,
      formData: generatedForm.formData,
      version: 1,
      status: 'draft',
      completeness: generatedForm.completeness,
      createdBy: parseInt(userId),
      updatedBy: parseInt(userId),
      organizationId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Check if form already exists and update or insert
    const existingForm = await db
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.projectId, parseInt(projectId)),
          eq(fda510kDocuments.documentType, formType)
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
          version: existingForm[0].version + 1,
          completeness: documentRecord.completeness,
          updatedBy: documentRecord.updatedBy,
          updatedAt: new Date()
        })
        .where(eq(fda510kDocuments.id, existingForm[0].id));
      
      documentRecord.version = existingForm[0].version + 1;
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

  } catch (error) {
    console.error(`Error generating ${formType}:`, error);
    res.status(500).json({ error: `Failed to generate ${formType}` });
  }
});

// Generate all FDA forms for a project
router.post('/project/:projectId/generate-all', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const organizationId = parseInt(req.headers['x-organization-id'] as string || '1');
  const userId = req.headers['x-user-id'] as string || '1';

  try {
    const orchestrationService = new DocumentOrchestrationService();
    
    // Orchestrate generation of all documents
    const result = await orchestrationService.orchestrateDocumentGeneration(
      projectId,
      userId,
      organizationId.toString()
    );

    res.json({
      success: true,
      message: 'All FDA forms generated successfully',
      forms: result.forms,
      mainDocument: result.mainDocument
    });

  } catch (error) {
    console.error('Error generating all forms:', error);
    res.status(500).json({ error: 'Failed to generate FDA forms' });
  }
});

// Get all available form definitions from registry
router.get('/registry', async (req: Request, res: Response) => {
  try {
    const { FDAFormsRegistry, getFormsByCategory } = await import('../config/FDAFormsRegistry');
    
    const formCategories = {
      '510k': getFormsByCategory('510k'),
      'PMA': getFormsByCategory('PMA'),
      'Clinical': getFormsByCategory('Clinical'),
      'Special': getFormsByCategory('Special'),
      'Common': getFormsByCategory('Common')
    };
    
    res.json({
      success: true,
      registry: FDAFormsRegistry,
      categories: formCategories,
      totalForms: Object.keys(FDAFormsRegistry).length
    });
  } catch (error) {
    console.error('Error fetching forms registry:', error);
    res.status(500).json({ error: 'Failed to fetch forms registry' });
  }
});

// Generate any SMART form from registry
router.post('/project/:projectId/generate-smart/:formId', async (req: Request, res: Response) => {
  const { projectId, formId } = req.params;
  const organizationId = parseInt(req.headers['x-organization-id'] as string || '1');
  const userId = req.headers['x-user-id'] as string || '1';

  try {
    const formGenerator = new FDAFormGenerator();
    
    // Fetch project and workflow data
    const projectData = await fetchProjectData(parseInt(projectId));
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
        formData: generatedForm.formData,
        version: 1,
        status: 'draft',
        completeness: generatedForm.completeness,
        createdBy: parseInt(userId),
        updatedBy: parseInt(userId),
        organizationId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Check if form already exists and update or insert
      const existingForm = await db
        .select()
        .from(fda510kDocuments)
        .where(
          and(
            eq(fda510kDocuments.projectId, parseInt(projectId)),
            eq(fda510kDocuments.documentType, formId)
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
            version: existingForm[0].version + 1,
            completeness: documentRecord.completeness,
            updatedBy: documentRecord.updatedBy,
            updatedAt: new Date()
          })
          .where(eq(fda510kDocuments.id, existingForm[0].id));
        
        documentRecord.version = existingForm[0].version + 1;
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

  } catch (error) {
    console.error(`Error generating smart form ${formId}:`, error);
    res.status(500).json({ error: 'Failed to generate smart form' });
  }
});

// Auto-generate forms when workflow is updated
router.post('/project/:projectId/auto-generate', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const organizationId = parseInt(req.headers['x-organization-id'] as string || '1');
  const userId = req.headers['x-user-id'] as string || '1';

  try {
    const formGenerator = new FDAFormGenerator();
    
    // Fetch project and workflow data
    const projectData = await fetchProjectData(parseInt(projectId));
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Import the registry to get all form IDs
    const { FDAFormsRegistry, getRequiredForms } = await import('../config/FDAFormsRegistry');
    
    // Determine submission type from project data
    const submissionType = projectData.fda510kProject?.submissionType || '510k';
    
    // Get all required forms for this submission type
    const formsToGenerate = getRequiredForms(submissionType as '510k' | 'PMA' | 'DeNovo');
    const results = [];

    for (const formId of formsToGenerate) {
      try {
        // Use the new smart form generator for all forms
        const generatedForm = await formGenerator.generateSmartForm(formId, projectData);

        if (generatedForm) {
          // Save to database
          const documentRecord = {
            documentId: `${formId}_${projectId}_${Date.now()}`,
            projectId: parseInt(projectId),
            documentType: formId,
            documentName: generatedForm.name,
            content: generatedForm.htmlContent,
            formData: generatedForm.formData,
            version: 1,
            status: 'draft',
            completeness: generatedForm.completeness,
            createdBy: parseInt(userId),
            updatedBy: parseInt(userId),
            organizationId,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Check if form already exists and update or insert
          const existingForm = await db
            .select()
            .from(fda510kDocuments)
            .where(
              and(
                eq(fda510kDocuments.projectId, parseInt(projectId)),
                eq(fda510kDocuments.documentType, formType)
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
                version: existingForm[0].version + 1,
                completeness: documentRecord.completeness,
                updatedBy: documentRecord.updatedBy,
                updatedAt: new Date()
              })
              .where(eq(fda510kDocuments.id, existingForm[0].id));
            
            documentRecord.version = existingForm[0].version + 1;
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
      } catch (error) {
        console.error(`Error auto-generating ${formId}:`, error);
        results.push({
          formType: formId,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Forms auto-generated successfully',
      results
    });

  } catch (error) {
    console.error('Error in auto-generation:', error);
    res.status(500).json({ error: 'Failed to auto-generate forms' });
  }
});

// Get a specific generated form
router.get('/project/:projectId/form/:formType', async (req: Request, res: Response) => {
  const { projectId, formType } = req.params;
  const organizationId = parseInt(req.headers['x-organization-id'] as string || '1');

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

  } catch (error) {
    console.error('Error fetching form:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

// Generate a smart form for a specific form ID
router.post('/project/:projectId/generate-smart/:formId', async (req: Request, res: Response) => {
  try {
    const { projectId, formId } = req.params;
    const formGenerator = new FDAFormGenerator();
    
    // Get form definition from registry
    const formDef = formsRegistry.getForm(formId);
    if (!formDef) {
      return res.status(404).json({ error: `Form ${formId} not found in registry` });
    }
    
    // Fetch project data
    const projectData = await fetchProjectData(parseInt(projectId));
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Generate the form using the universal smart form generator
    const generatedForm = await formGenerator.generateUniversalSmartForm(formId, projectId);
    
    res.json({
      success: true,
      formId,
      projectId,
      form: generatedForm,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[FDA Forms] Error generating smart form:', error);
    res.status(500).json({ error: 'Failed to generate smart form' });
  }
});

// Auto-generate all required forms for a project
router.post('/project/:projectId/auto-generate', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const formGenerator = new FDAFormGenerator();
    
    // Get required forms based on project type (510k for now)
    const requiredForms = formsRegistry.getFormsByCategory('510k');
    const results = [];
    
    // Fetch project data once for all forms
    const projectData = await fetchProjectData(parseInt(projectId));
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Generate each required form
    for (const formId of requiredForms) {
      try {
        const generatedForm = await formGenerator.generateUniversalSmartForm(formId, projectId);
        results.push({
          formId,
          status: 'success',
          form: generatedForm
        });
      } catch (error: any) {
        results.push({
          formId,
          status: 'error',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      projectId,
      results,
      totalGenerated: results.filter(r => r.status === 'success').length,
      totalFailed: results.filter(r => r.status === 'error').length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[FDA Forms] Error auto-generating forms:', error);
    res.status(500).json({ error: 'Failed to auto-generate forms' });
  }
});

// Generate forms for a specific workflow stage
router.post('/project/:projectId/generate-stage/:stage', async (req: Request, res: Response) => {
  try {
    const { projectId, stage } = req.params;
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
    
    // Fetch project data once
    const projectData = await fetchProjectData(parseInt(projectId));
    if (!projectData) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Generate each stage form
    for (const formId of formsToGenerate) {
      try {
        const generatedForm = await formGenerator.generateUniversalSmartForm(formId, projectId);
        results.push({
          formId,
          status: 'success',
          form: generatedForm
        });
      } catch (error: any) {
        results.push({
          formId,
          status: 'error',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      projectId,
      stage,
      results,
      totalGenerated: results.filter(r => r.status === 'success').length,
      totalFailed: results.filter(r => r.status === 'error').length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[FDA Forms] Error generating stage forms:', error);
    res.status(500).json({ error: 'Failed to generate stage forms' });
  }
});

// Helper function to fetch all project data
async function fetchProjectData(projectId: number) {
  try {
    // Fetch FDA 510k project
    const [fda510kProject] = await db
      .select()
      .from(fda510kProjects)
      .where(eq(fda510kProjects.projectId, projectId))
      .limit(1);

    if (!fda510kProject) {
      return null;
    }

    // Fetch base project info
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    // Fetch organization info
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, fda510kProject.organizationId))
      .limit(1);

    // Fetch all workflow stage data
    const stageProgress = await db
      .select()
      .from(fda510kStageProgress)
      .where(eq(fda510kStageProgress.projectId, projectId));

    // Fetch initial data forms using SQL
    const initialForms = await db.execute(sql`
      SELECT id, project_id, form_type, form_data
      FROM fda_510k_initial_data_forms
      WHERE project_id = ${projectId}
    `);

    // Aggregate workflow data
    const workflowData: any = {};
    stageProgress.forEach(stage => {
      if (stage.collectedData) {
        const data = typeof stage.collectedData === 'string' 
          ? JSON.parse(stage.collectedData) 
          : stage.collectedData;
        workflowData[stage.stageName] = data;
      }
    });

    // Aggregate initial form data
    const formData: any = {};
    if (initialForms.rows) {
      initialForms.rows.forEach((form: any) => {
        if (form.form_data) {
          const data = typeof form.form_data === 'string'
            ? JSON.parse(form.form_data)
            : form.form_data;
          formData[form.form_type] = data;
        }
      });
    }

    return {
      project: project,
      fda510kProject: fda510kProject,
      organization: organization,
      workflowData: workflowData,
      formData: formData,
      metadata: fda510kProject.metadata || {}
    };
  } catch (error) {
    console.error('Error fetching project data:', error);
    return null;
  }
}

export default router;