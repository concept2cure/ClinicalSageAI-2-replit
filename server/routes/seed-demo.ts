import express, { Request, Response } from 'express';
import { db } from '../db/index.js';
import { and, eq, inArray } from 'drizzle-orm';
import { 
  projects, 
  organizations,
  clientWorkspaces,
  fda510kProjects,
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

type CERV2SeedSpec = {
  code: string;
  name: string;
  description: string;
  type: string;
  status: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  riskLevel: 'low' | 'medium' | 'high';
  stageNumber: number;
  stageProgress: number;
  overallProgress: number;
  metadata: any;
  settings?: any;
};

const buildCerv2SeedSpecsForWorkspace = (
  orgId: number,
  workspaceSlug: string,
  workspaceName: string
): CERV2SeedSpec[] => {
  // Keep codes deterministic and stable for idempotent reseeding.
  const base = `CERV2-DEMO-O${orgId}-${workspaceSlug}`;

  // Per-org flavor
  const orgLabel =
    orgId === 1 ? 'Northstar' :
    orgId === 2 ? 'Apex' :
    orgId === 3 ? 'ClearWave' :
    'Demo';

  const commonDeviceProfile = {
    manufacturer:
      orgId === 1 ? 'Northstar Diagnostics, Inc.' :
      orgId === 2 ? 'Apex Ortho, LLC' :
      orgId === 3 ? 'ClearWave Cardio, Inc.' :
      'Demo Manufacturer',
  };

  return [
    // 510(k) in progress
    {
      code: `${base}-510K-INPROG`,
      name: `${orgLabel} — 510(k) In Progress (${workspaceName})`,
      description: 'Demo 510(k) project with partially completed device profile + predicate analysis + evidence.',
      type: 'medical_device',
      status: 'active',
      priority: 'high',
      riskLevel: 'medium',
      stageNumber: 3,
      stageProgress: 65,
      overallProgress: 55,
      settings: {
        currentStage: 3,
        eSTARStatus: 'not_started',
        rtaStatus: 'not_started',
      },
      metadata: {
        clientWorkspaceId: workspaceSlug,
        manufacturer: commonDeviceProfile.manufacturer,
        deviceClass: 'II',
        intendedUse:
          'Demonstration intended use statement for exploring CERV2 device intake, predicates, and evidence workflows.',
        attachedDocuments: [
          { name: 'Device Description v1.0', type: 'pdf' },
          { name: 'Comparison Table Draft', type: 'xlsx' },
        ],
        state: {
          documentType: '510k',
          workflowStep: 3,
          deviceProfile: {
            deviceName: `${orgLabel} Device System`,
            manufacturer: commonDeviceProfile.manufacturer,
            deviceClass: 'II',
            productCode: orgId === 2 ? 'JWH' : orgId === 3 ? 'QDD' : 'LLZ',
            submissionType: 'Traditional 510(k)',
            intendedUse:
              'Demonstration intended use statement for exploring CERV2 device intake, predicates, and evidence workflows.',
          },
          predicateDevices: [
            {
              kNumber: orgId === 2 ? 'K210555' : orgId === 3 ? 'K223456' : 'K203412',
              deviceName: 'Comparable Predicate Device',
              manufacturer: 'Example Corp',
              similarities: ['Same intended use', 'Comparable performance characteristics'],
            },
          ],
          literatureResults: [],
          complianceScore: { overall: 0.72, gaps: ['Labeling', 'Software documentation (if applicable)'] },
        },
      },
    },

    // 510(k) submitted
    {
      code: `${base}-510K-SUBMITTED`,
      name: `${orgLabel} — 510(k) Submitted (eSTAR)`,
      description: 'Demo 510(k) submission marked submitted with near-complete compliance score.',
      type: 'medical_device',
      status: 'submitted',
      priority: 'critical',
      riskLevel: 'low',
      stageNumber: 7,
      stageProgress: 100,
      overallProgress: 98,
      settings: {
        currentStage: 7,
        eSTARStatus: 'complete',
        rtaStatus: 'complete',
      },
      metadata: {
        clientWorkspaceId: workspaceSlug,
        manufacturer: commonDeviceProfile.manufacturer,
        deviceClass: 'II',
        intendedUse: 'Demonstration submitted 510(k) project for workflow walkthroughs.',
        attachedDocuments: [
          { name: 'eSTAR Package.zip', type: 'zip' },
          { name: 'RTA Checklist (Completed)', type: 'xlsx' },
        ],
        state: {
          documentType: '510k',
          workflowStep: 7,
          deviceProfile: {
            deviceName: `${orgLabel} Device System`,
            manufacturer: commonDeviceProfile.manufacturer,
            deviceClass: 'II',
            productCode: orgId === 2 ? 'JWH' : orgId === 3 ? 'QDD' : 'LLZ',
            submissionType: 'Traditional 510(k)',
            submissionId: `${base}-K26-DEMO`,
            intendedUse: 'Demonstration submitted 510(k) project for workflow walkthroughs.',
          },
          predicateDevices: [],
          literatureResults: [],
          complianceScore: { overall: 0.98, gaps: [] },
        },
      },
    },

    // PMA example (complete)
    {
      code: `${base}-PMA-COMPLETE`,
      name: `${orgLabel} — PMA Complete (Demo)`,
      description: 'Demo PMA-track project marked completed/submitted for exploring portfolio management.',
      type: 'medical_device',
      status: 'completed',
      priority: 'medium',
      riskLevel: 'high',
      stageNumber: 5,
      stageProgress: 90,
      overallProgress: 90,
      settings: {
        currentStage: 5,
        eSTARStatus: 'n/a',
        rtaStatus: 'n/a',
      },
      metadata: {
        clientWorkspaceId: workspaceSlug,
        manufacturer: commonDeviceProfile.manufacturer,
        deviceClass: 'III',
        intendedUse: 'Demonstration PMA-track program (for UX exploration only).',
        attachedDocuments: [
          { name: 'PMA Module 1 (Admin) - Complete', type: 'pdf' },
          { name: 'Clinical Summary - Complete', type: 'pdf' },
        ],
        state: {
          documentType: 'pma',
          workflowStep: 5,
          deviceProfile: {
            deviceName: `${orgLabel} High-Risk Device (PMA Example)`,
            manufacturer: commonDeviceProfile.manufacturer,
            deviceClass: 'III',
            submissionType: 'PMA',
            submissionId: `${base}-PMA-DEMO`,
            intendedUse: 'Demonstration PMA-track program (for UX exploration only).',
          },
          predicateDevices: [],
          literatureResults: [],
          complianceScore: { overall: 0.95, gaps: [] },
        },
      },
    },
  ];
};

const upsertProjectWith510kStage = async (args: {
  organizationId: number;
  clientWorkspaceId: number;
  createdById: number;
  spec: CERV2SeedSpec;
}) => {
  const { organizationId, clientWorkspaceId, createdById, spec } = args;

  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.clientWorkspaceId, clientWorkspaceId),
        eq(projects.code, spec.code)
      )
    )
    .limit(1);

  let projectId: number;

  if (existing.length) {
    projectId = existing[0].id;
    await db
      .update(projects)
      .set({
        name: spec.name,
        description: spec.description,
        type: spec.type,
        status: spec.status,
        priority: spec.priority,
        progress: spec.overallProgress,
        riskLevel: spec.riskLevel,
        settings: spec.settings ?? null,
        metadata: spec.metadata ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  } else {
    const inserted = await db
      .insert(projects)
      .values({
        organizationId,
        clientWorkspaceId,
        name: spec.name,
        code: spec.code,
        description: spec.description,
        type: spec.type,
        status: spec.status,
        priority: spec.priority,
        progress: spec.overallProgress,
        riskLevel: spec.riskLevel,
        startDate: new Date(),
        targetEndDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
        createdById,
        ownerId: createdById,
        tags: ['cerv2', 'demo', spec.metadata?.state?.documentType || '510k'],
        settings: spec.settings ?? null,
        metadata: spec.metadata ?? null,
      })
      .returning({ id: projects.id });

    projectId = inserted[0].id;
  }

  // Ensure fda_510k_projects reflects the desired stage so CERV2 switches tabs correctly.
  const existing510k = await db
    .select({ id: fda510kProjects.id })
    .from(fda510kProjects)
    .where(and(eq(fda510kProjects.organizationId, organizationId), eq(fda510kProjects.projectId, projectId)))
    .limit(1);

  const deviceName =
    spec?.metadata?.state?.deviceProfile?.deviceName ||
    spec?.metadata?.state?.deviceProfile?.device_name ||
    spec.name;

  const deviceClass = spec?.metadata?.deviceClass || spec?.metadata?.state?.deviceProfile?.deviceClass || null;
  const productCode = spec?.metadata?.state?.deviceProfile?.productCode || null;

  const fdaValues = {
    organizationId,
    projectId,
    deviceName,
    deviceClassification: deviceClass,
    productCode,
    currentStage: String(spec.stageNumber),
    currentStageProgress: spec.stageProgress,
    overallProgress: spec.overallProgress,
    status: spec.status === 'submitted' ? 'completed' : 'active',
    metadata: {
      seeded: true,
      seedCode: spec.code,
      documentType: spec?.metadata?.state?.documentType || '510k',
    },
    updatedAt: new Date(),
  } as any;

  if (existing510k.length) {
    await db.update(fda510kProjects).set(fdaValues).where(eq(fda510kProjects.id, existing510k[0].id));
  } else {
    await db.insert(fda510kProjects).values({
      ...fdaValues,
      createdAt: new Date(),
    } as any);
  }

  return { projectId };
};

/**
 * POST /api/demo/seed-cerv2-portfolio
 *
 * Creates a multi-org, multi-client demo portfolio aligned to the built-in demo orgs/clients.
 * Requires DATABASE_URL (DB-enabled mode). Idempotent (safe to re-run).
 */
router.post('/seed-cerv2-portfolio', async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString();
    const createdById = 1;

    // Default to seeding the 3 built-in demo orgs.
    const defaultOrgIds = [1, 2, 3];
    const orgIdsParam = (req.query.organizationIds as string | undefined) || undefined;
    const orgIds = orgIdsParam
      ? orgIdsParam
          .split(',')
          .map(s => Number.parseInt(s.trim(), 10))
          .filter(n => Number.isFinite(n))
      : defaultOrgIds;

    const orgRows = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(inArray(organizations.id, orgIds));

    if (!orgRows.length) {
      return res.status(400).json({ success: false, message: 'No matching organizations found to seed.' });
    }

    const seeded: Array<{ organizationId: number; clientWorkspaceId: number; slug: string; projects: any[] }> = [];

    for (const org of orgRows) {
      const workspaces = await db
        .select({ id: clientWorkspaces.id, slug: clientWorkspaces.slug, name: clientWorkspaces.name })
        .from(clientWorkspaces)
        .where(eq(clientWorkspaces.organizationId, org.id));

      // Prefer demo workspaces if present, otherwise seed all workspaces for the org.
      const demoWorkspaces = workspaces.filter(w => String(w.slug || '').startsWith('demo-'));
      const targets = demoWorkspaces.length ? demoWorkspaces : workspaces;

      for (const ws of targets) {
        const specs = buildCerv2SeedSpecsForWorkspace(org.id, ws.slug, ws.name);
        const createdForWorkspace: any[] = [];

        for (const spec of specs) {
          const { projectId } = await upsertProjectWith510kStage({
            organizationId: org.id,
            clientWorkspaceId: ws.id,
            createdById,
            spec,
          });

          createdForWorkspace.push({
            id: projectId,
            code: spec.code,
            name: spec.name,
            status: spec.status,
            stage: spec.stageNumber,
            overallProgress: spec.overallProgress,
          });
        }

        seeded.push({
          organizationId: org.id,
          clientWorkspaceId: ws.id,
          slug: ws.slug,
          projects: createdForWorkspace,
        });
      }
    }

    return res.json({
      success: true,
      message: 'CERV2 demo portfolio seeded successfully',
      timestamp,
      seeded,
    });
  } catch (error: any) {
    console.error('Error seeding CERV2 demo portfolio:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to seed CERV2 demo portfolio (is DATABASE_URL configured and reachable?)',
      error: error?.message || String(error),
    });
  }
});

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