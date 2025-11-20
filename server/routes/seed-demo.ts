import express, { Request, Response } from 'express';
import { db } from '../db.js';
import { 
  projects, 
  projectWorkflowStages, 
  projectTasks,
  medicalDevices,
  sharepoint_files
} from '../../shared/schema.js';

const router = express.Router();

// Helper functions
function getStageRequirements(stage: number): string[] {
  const requirements: { [key: number]: string[] } = {
    1: ['Device classification', 'Product code determination', 'Regulatory pathway selection'],
    2: ['Predicate device identification', 'Substantial equivalence analysis', 'Comparison tables'],
    3: ['Bench testing', 'Biocompatibility', 'Electrical safety', 'Software validation'],
    4: ['Clinical protocol', 'IRB approval', 'Clinical data collection', 'Statistical analysis'],
    5: ['Pre-submission meeting', 'Regulatory strategy document', 'FDA feedback incorporation'],
    6: ['510(k) summary', 'FDA forms', 'Truthful and accurate statement', 'Financial disclosure'],
    7: ['eCopy preparation', 'FDA submission', 'Acknowledgment letter', 'Interactive review']
  };
  return requirements[stage] || [];
}

function mapToFDARequirement(category: string): string {
  const mapping: { [key: string]: string } = {
    'design_controls': 'device_desc',
    'test_report': 'performance',
    'clinical': 'clinical_data',
    'regulatory': 'substantial_equiv',
    'risk_management': 'software_val',
    'quality': 'device_desc',
    'fda_forms': 'administrative',
    'submission': 'administrative'
  };
  return mapping[category] || 'device_desc';
}

// Seed demo projects endpoint
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const organizationId = 6; // Using existing organization
    const clientWorkspaceId = 26; // Using existing workspace
    const userId = 1; // Default user
    const timestamp = new Date().toISOString();
    const tenantId = '7'; // For sharepoint files

    console.log('🌱 Starting demo project seeding...');

    // ===== PROJECT 1: Early-Stage (Stage 3) - NeuroFlex TENS Patch =====
    const project1 = await db.insert(projects).values({
      organizationId: organizationId,
      clientWorkspaceId: clientWorkspaceId,
      name: 'NeuroFlex TENS Patch - 510(k) Submission',
      code: 'NF-510K-2024',
      description: 'FDA 510(k) submission for NeuroFlex Transcutaneous Electrical Nerve Stimulator - temporary relief of pain associated with sore and aching muscles',
      type: 'regulatory',
      status: 'active',
      priority: 'high',
      progress: 45,
      riskLevel: 'low',
      startDate: new Date(),
      targetEndDate: new Date('2024-07-15'),
      createdById: userId,
      ownerId: userId,
      tags: ['510k', 'TENS', 'Class II', 'Neurological'],
      settings: {
        deviceClass: 'II',
        productCode: 'IPF',
        regulatoryPathway: '510(k)',
        currentStage: 3,
        deviceName: 'NeuroFlex Transcutaneous Electrical Nerve Stimulator',
        manufacturer: 'NeuroTech Medical Innovations Inc.',
        predicateDevices: ['K182234', 'K191435'],
        submissionType: 'Traditional 510(k)'
      }
    }).returning();

    // Add workflow stages for Project 1
    const stages1 = [
      { stage: 1, status: 'completed', name: 'Device Intake & Classification', completion: 100 },
      { stage: 2, status: 'completed', name: 'Predicate Analysis', completion: 100 },
      { stage: 3, status: 'in_progress', name: 'Performance Testing', completion: 65 },
      { stage: 4, status: 'pending', name: 'Clinical Evaluation', completion: 0 },
      { stage: 5, status: 'pending', name: 'Regulatory Strategy', completion: 0 },
      { stage: 6, status: 'pending', name: 'FDA Forms & Documentation', completion: 0 },
      { stage: 7, status: 'pending', name: 'Submission & Tracking', completion: 0 }
    ];

    for (const stage of stages1) {
      await db.insert(projectWorkflowStages).values({
        organizationId: organizationId,
        projectId: project1[0].id,
        name: stage.name,
        description: `Stage ${stage.stage} - ${stage.name}`,
        order: stage.stage,
        status: stage.status,
        startDate: stage.status !== 'pending' ? new Date() : null,
        endDate: stage.status === 'completed' ? new Date() : null,
        settings: {
          stageNumber: stage.stage,
          completionPercentage: stage.completion,
          requirements: getStageRequirements(stage.stage),
          evidenceCollected: stage.status === 'completed'
        }
      });
    }

    // Add tasks for Project 1
    await db.insert(projectTasks).values([
      {
        organizationId: organizationId,
        projectId: project1[0].id,
        name: 'Complete electrical safety testing',
        description: 'IEC 60601-1 testing for electrical safety',
        status: 'done',
        priority: 'high',
        moduleType: 'Medical Device',
        assigneeId: userId,
        dueDate: new Date(),
        startDate: new Date(),
        completedAt: new Date()
      },
      {
        organizationId: organizationId,
        projectId: project1[0].id,
        name: 'Submit biocompatibility samples',
        description: 'Send samples for ISO 10993 testing',
        status: 'in-progress',
        priority: 'high',
        moduleType: 'Medical Device',
        assigneeId: userId,
        dueDate: new Date(),
        startDate: new Date()
      }
    ]);

    // ===== PROJECT 2: Mid-Stage (Stage 5) - AeroSpire Smart Spirometer =====
    const project2 = await db.insert(projects).values({
      organizationId: organizationId,
      clientWorkspaceId: clientWorkspaceId,
      name: 'AeroSpire Smart Spirometer - 510(k) Submission',
      code: 'AS-510K-2024',
      description: 'FDA 510(k) submission for AeroSpire Digital Spirometry System - measurement of lung function parameters for diagnostic spirometry',
      type: 'regulatory',
      status: 'active',
      priority: 'high',
      progress: 72,
      riskLevel: 'medium',
      startDate: new Date('2023-10-01'),
      targetEndDate: new Date('2024-05-20'),
      createdById: userId,
      ownerId: userId,
      tags: ['510k', 'Spirometer', 'Class II', 'Respiratory', 'AI-powered'],
      settings: {
        deviceClass: 'II',
        productCode: 'BZG',
        regulatoryPathway: '510(k)',
        currentStage: 5,
        deviceName: 'AeroSpire Digital Spirometry System',
        manufacturer: 'Respiratory Innovations LLC',
        predicateDevices: ['K201876', 'K193421'],
        submissionType: 'Traditional 510(k)',
        indicationsChange: 'Added home-use indication'
      }
    }).returning();

    // Add workflow stages for Project 2
    const stages2 = [
      { stage: 1, status: 'completed', name: 'Device Intake & Classification', completion: 100 },
      { stage: 2, status: 'completed', name: 'Predicate Analysis', completion: 100 },
      { stage: 3, status: 'completed', name: 'Performance Testing', completion: 100 },
      { stage: 4, status: 'completed', name: 'Clinical Evaluation', completion: 100 },
      { stage: 5, status: 'in_progress', name: 'Regulatory Strategy', completion: 85 },
      { stage: 6, status: 'pending', name: 'FDA Forms & Documentation', completion: 30 },
      { stage: 7, status: 'pending', name: 'Submission & Tracking', completion: 0 }
    ];

    for (const stage of stages2) {
      await db.insert(projectWorkflowStages).values({
        organizationId: organizationId,
        projectId: project2[0].id,
        name: stage.name,
        description: `Stage ${stage.stage} - ${stage.name}`,
        order: stage.stage,
        status: stage.status,
        startDate: stage.status !== 'pending' ? new Date() : null,
        endDate: stage.status === 'completed' ? new Date() : null,
        settings: {
          stageNumber: stage.stage,
          completionPercentage: stage.completion,
          requirements: getStageRequirements(stage.stage),
          evidenceCollected: stage.status === 'completed'
        }
      });
    }

    // ===== PROJECT 3: Late-Stage (Stage 7) - CardioGuardian ILR =====
    const project3 = await db.insert(projects).values({
      organizationId: organizationId,
      clientWorkspaceId: clientWorkspaceId,
      name: 'CardioGuardian ILR - 510(k) Submission',
      code: 'CG-510K-2024',
      description: 'FDA 510(k) submission for CardioGuardian Implantable Loop Recorder - continuous cardiac monitoring and arrhythmia detection',
      type: 'regulatory',
      status: 'active',
      priority: 'critical',
      progress: 95,
      riskLevel: 'medium',
      startDate: new Date('2023-06-01'),
      targetEndDate: new Date('2024-03-01'),
      createdById: userId,
      ownerId: userId,
      tags: ['510k', 'ILR', 'Class II', 'Cardiac', 'Implantable', 'AI-detection'],
      settings: {
        deviceClass: 'II',
        productCode: 'DSI',
        regulatoryPathway: '510(k)',
        currentStage: 7,
        deviceName: 'CardioGuardian Implantable Loop Recorder',
        manufacturer: 'Cardiac Monitoring Systems Inc.',
        predicateDevices: ['K203159', 'K211847'],
        submissionType: 'Traditional 510(k)',
        fdaInteraction: 'Pre-submission meeting completed'
      }
    }).returning();

    // Add workflow stages for Project 3
    const stages3 = [
      { stage: 1, status: 'completed', name: 'Device Intake & Classification', completion: 100 },
      { stage: 2, status: 'completed', name: 'Predicate Analysis', completion: 100 },
      { stage: 3, status: 'completed', name: 'Performance Testing', completion: 100 },
      { stage: 4, status: 'completed', name: 'Clinical Evaluation', completion: 100 },
      { stage: 5, status: 'completed', name: 'Regulatory Strategy', completion: 100 },
      { stage: 6, status: 'completed', name: 'FDA Forms & Documentation', completion: 100 },
      { stage: 7, status: 'in_progress', name: 'Submission & Tracking', completion: 75 }
    ];

    for (const stage of stages3) {
      await db.insert(projectWorkflowStages).values({
        organizationId: organizationId,
        projectId: project3[0].id,
        name: stage.name,
        description: `Stage ${stage.stage} - ${stage.name}`,
        order: stage.stage,
        status: stage.status,
        startDate: new Date(),
        endDate: stage.status === 'completed' ? new Date() : null,
        settings: {
          stageNumber: stage.stage,
          completionPercentage: stage.completion,
          requirements: getStageRequirements(stage.stage),
          evidenceCollected: true,
          fdaInteraction: stage.stage === 7 ? 'Pre-submission meeting completed' : null
        }
      });
    }

    // Add sample evidence files for all projects
    const evidenceFiles = [
      // Project 1 files
      { project: project1[0].id, filename: 'NF_Design_Control_Matrix.pdf', category: 'design_controls', stage: 1, status: 'pending' },
      { project: project1[0].id, filename: 'NF_Predicate_Comparison_Table.xlsx', category: 'regulatory', stage: 2, status: 'under_review' },
      { project: project1[0].id, filename: 'NF_IEC_60601_Test_Report.pdf', category: 'test_report', stage: 3, status: 'under_review' },
      { project: project1[0].id, filename: 'NF_Biocompatibility_ISO10993.pdf', category: 'test_report', stage: 3, status: 'pending' },
      { project: project1[0].id, filename: 'NF_Risk_Management_ISO14971.pdf', category: 'risk_management', stage: 3, status: 'pending' },
      
      // Project 2 files  
      { project: project2[0].id, filename: 'AS_Device_Master_Record.pdf', category: 'quality', stage: 1, status: 'approved' },
      { project: project2[0].id, filename: 'AS_Clinical_Protocol.pdf', category: 'clinical', stage: 4, status: 'approved' },
      { project: project2[0].id, filename: 'AS_Clinical_Study_Report.pdf', category: 'clinical', stage: 4, status: 'approved' },
      { project: project2[0].id, filename: 'AS_Software_V&V_Report.pdf', category: 'test_report', stage: 3, status: 'approved' },
      { project: project2[0].id, filename: 'AS_Human_Factors_Report.pdf', category: 'test_report', stage: 4, status: 'under_review' },
      { project: project2[0].id, filename: 'AS_FDA_PreSub_Response.pdf', category: 'regulatory', stage: 5, status: 'under_review' },
      
      // Project 3 files (comprehensive for late stage)
      { project: project3[0].id, filename: 'CG_510k_Summary.pdf', category: 'regulatory', stage: 6, status: 'approved' },
      { project: project3[0].id, filename: 'CG_Substantial_Equivalence.pdf', category: 'regulatory', stage: 6, status: 'approved' },
      { project: project3[0].id, filename: 'CG_Clinical_Study_Full.pdf', category: 'clinical', stage: 4, status: 'approved' },
      { project: project3[0].id, filename: 'CG_Biocompatibility_Complete.pdf', category: 'test_report', stage: 3, status: 'approved' },
      { project: project3[0].id, filename: 'CG_MRI_Safety_Report.pdf', category: 'test_report', stage: 3, status: 'approved' },
      { project: project3[0].id, filename: 'CG_Sterilization_Validation.pdf', category: 'test_report', stage: 3, status: 'approved' },
      { project: project3[0].id, filename: 'CG_FDA_Form_3514.pdf', category: 'fda_forms', stage: 6, status: 'approved' },
      { project: project3[0].id, filename: 'CG_FDA_Form_3601.pdf', category: 'fda_forms', stage: 6, status: 'approved' },
      { project: project3[0].id, filename: 'CG_eCopy_DVD.zip', category: 'submission', stage: 7, status: 'under_review' }
    ];

    for (const file of evidenceFiles) {
      await db.insert(sharepoint_files).values({
        tenant_id: tenantId,
        filename: file.filename,
        category: file.category,
        device_name: file.project === project1[0].id ? 'NeuroFlex TENS' : 
                     file.project === project2[0].id ? 'AeroSpire Spirometer' : 
                     'CardioGuardian ILR',
        test_date: timestamp,
        test_standard: file.category === 'test_report' ? 'ISO/IEC Standards' : null,
        device_component: file.category,
        uploaded_by: userId.toString(),
        file_size: Math.floor(Math.random() * 5000000) + 500000,
        content_type: file.filename.endsWith('.pdf') ? 'application/pdf' : 
                      file.filename.endsWith('.xlsx') ? 'application/vnd.ms-excel' : 
                      'application/zip',
        version: 1,
        is_current: true,
        fda_requirement: mapToFDARequirement(file.category),
        workflow_stage: file.stage,
        project_id: file.project.toString(),
        regulatory_status: file.status,
        created_at: timestamp,
        updated_at: timestamp
      });
    }

    // Add medical device records
    await db.insert(medicalDevices).values([
      {
        tenant_id: tenantId,
        device_name: 'NeuroFlex TENS Patch',
        device_type: 'Transcutaneous Electrical Nerve Stimulator',
        device_class: 'II',
        product_code: 'IPF',
        regulation_number: '882.5890',
        manufacturer: 'NeuroTech Medical Innovations Inc.',
        intended_use: 'Temporary relief of pain',
        project_id: project1[0].id.toString(),
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        tenant_id: tenantId,
        device_name: 'AeroSpire Smart Spirometer',
        device_type: 'Diagnostic Spirometer',
        device_class: 'II',
        product_code: 'BZG',
        regulation_number: '868.1840',
        manufacturer: 'Respiratory Innovations LLC',
        intended_use: 'Lung function measurement',
        project_id: project2[0].id.toString(),
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        tenant_id: tenantId,
        device_name: 'CardioGuardian ILR',
        device_type: 'Implantable Loop Recorder',
        device_class: 'II',
        product_code: 'DSI',
        regulation_number: '870.2920',
        manufacturer: 'Cardiac Monitoring Systems Inc.',
        intended_use: 'Continuous cardiac monitoring',
        project_id: project3[0].id.toString(),
        created_at: timestamp,
        updated_at: timestamp
      }
    ]);

    res.json({
      success: true,
      message: 'Demo projects created successfully',
      projects: [
        {
          id: project1[0].id,
          name: project1[0].name,
          code: project1[0].code,
          stage: 3,
          completion: 45,
          description: 'Early-stage with active testing'
        },
        {
          id: project2[0].id,
          name: project2[0].name,
          code: project2[0].code,
          stage: 5,
          completion: 72,
          description: 'Mid-stage with clinical data'
        },
        {
          id: project3[0].id,
          name: project3[0].name,
          code: project3[0].code,
          stage: 7,
          completion: 95,
          description: 'Late-stage ready for submission'
        }
      ]
    });

  } catch (error: any) {
    console.error('Error seeding demo projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seed demo projects',
      error: error.message
    });
  }
});

export default router;