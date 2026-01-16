import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { projects, clientWorkspaces, organizations } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { requireTenant } from '../middleware/tenant.js';

const router = Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

const isDbUnavailable = (error: unknown) => {
  const anyErr: any = error;
  const code = anyErr?.code;
  const message = String(anyErr?.message || '');
  if (code === 'NO_DB' || code === 'ECONNREFUSED') return true;
  if (message.includes('DATABASE_URL') && message.includes('not set')) return true;
  if (message.includes('ECONNREFUSED')) return true;
  const nested = anyErr?.errors;
  if (Array.isArray(nested) && nested.some((e: any) => e?.code === 'ECONNREFUSED')) return true;
  return false;
};

type DemoProject = {
  id: string;
  organizationId: number;
  clientWorkspaceId?: string | null;
  name: string;
  description?: string | null;
  type: 'clinical_trial' | 'regulatory_submission' | 'medical_device' | 'literature_review';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status?: string;
  dueDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // Used by CERV2Page.jsx transform (p.metadata.*)
  metadata?: any;
};

const demoProjectsByOrg: Record<number, DemoProject[]> = {
  1: [
    {
      id: 'demo-c1-101-510k-early-northstar-ivd',
      organizationId: 1,
      clientWorkspaceId: 'demo-c1-101',
      name: 'Northstar POC IVD — 510(k) Evidence Package',
      description: 'Point-of-care IVD submission dossier with performance evidence + labeling readiness.',
      type: 'regulatory_submission',
      priority: 'high',
      status: 'in_progress',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      metadata: {
        clientWorkspaceId: 'demo-c1-101',
        manufacturer: 'Northstar Diagnostics, Inc.',
        deviceClass: 'II',
        intendedUse:
          'Quantitative detection of analytes in human whole blood at point-of-care to aid in clinical assessment; Rx-only.',
        attachedDocuments: [
          { name: 'Device Description v1.2', type: 'pdf' },
          { name: 'Labeling/IFU Draft', type: 'docx' },
        ],
        state: {
          documentType: '510k',
          workflowStep: 2,
          deviceProfile: {
            deviceName: 'Northstar POC IVD Analyzer',
            manufacturer: 'Northstar Diagnostics, Inc.',
            deviceClass: 'II',
            productCode: 'LLZ',
            submissionType: 'Traditional 510(k)',
            intendedUse:
              'Quantitative detection of analytes in whole blood at point-of-care; Rx-only.',
          },
          predicateDevices: [
            {
              kNumber: 'K203412',
              deviceName: 'Reference POC Analyzer',
              manufacturer: 'Example Corp',
              similarities: ['Same intended use', 'Same sample type', 'Comparable analytical method'],
            },
          ],
          literatureResults: [
            {
              title: 'Analytical performance considerations for POC IVD systems',
              year: 2022,
              relevance: 'methodology',
            },
          ],
          complianceScore: { overall: 0.58, gaps: ['Labeling', 'Software documentation'] },
        },
      },
    },
    {
      id: 'demo-c1-101-510k-submitted-northstar-ivd',
      organizationId: 1,
      clientWorkspaceId: 'demo-c1-101',
      name: 'Northstar POC IVD — 510(k) Submitted (eSTAR)',
      description: 'Complete, submitted 510(k) example with eSTAR + RTA check artifacts.',
      type: 'regulatory_submission',
      priority: 'critical',
      status: 'submitted',
      dueDate: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      metadata: {
        clientWorkspaceId: 'demo-c1-101',
        manufacturer: 'Northstar Diagnostics, Inc.',
        deviceClass: 'II',
        intendedUse:
          'Quantitative detection of analytes in whole blood at point-of-care to aid in clinical assessment; Rx-only.',
        attachedDocuments: [
          { name: 'eSTAR Package.zip', type: 'zip' },
          { name: '510(k) Summary/Statement', type: 'pdf' },
          { name: 'RTA Checklist (Completed)', type: 'xlsx' },
        ],
        state: {
          documentType: '510k',
          workflowStep: 7,
          deviceProfile: {
            deviceName: 'Northstar POC IVD Analyzer',
            manufacturer: 'Northstar Diagnostics, Inc.',
            deviceClass: 'II',
            productCode: 'LLZ',
            submissionType: 'Traditional 510(k)',
            submissionId: 'K26-NS-1001',
            intendedUse:
              'Quantitative detection of analytes in whole blood at point-of-care; Rx-only.',
          },
          predicateDevices: [
            {
              kNumber: 'K203412',
              deviceName: 'Reference POC Analyzer',
              manufacturer: 'Example Corp',
              similarities: ['Same intended use', 'Comparable performance characteristics'],
            },
          ],
          literatureResults: [],
          complianceScore: { overall: 0.98, gaps: [] },
        },
      },
    },
    {
      id: 'demo-c1-102-pma-mid-northstar-clinical',
      organizationId: 1,
      clientWorkspaceId: 'demo-c1-102',
      name: 'Northstar IVD — Risk Management (ISO 14971)',
      description: 'Hazard analysis + risk controls traceability aligned to labeling and IFU.',
      type: 'medical_device',
      priority: 'medium',
      status: 'active',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      metadata: {
        clientWorkspaceId: 'demo-c1-102',
        manufacturer: 'Northstar Diagnostics, Inc.',
        deviceClass: 'III',
        intendedUse: 'High-risk IVD program example (PMA track) for clinical performance package exploration.',
        attachedDocuments: [
          { name: 'Risk Management Plan', type: 'docx' },
          { name: 'Hazard Analysis', type: 'xlsx' },
        ],
        state: {
          documentType: 'pma',
          workflowStep: 4,
          deviceProfile: {
            deviceName: 'Northstar High-Risk IVD System',
            manufacturer: 'Northstar Diagnostics, Inc.',
            deviceClass: 'III',
            submissionType: 'PMA',
            intendedUse:
              'Example PMA-track program to explore clinical evidence workflows (demonstration only).',
          },
          predicateDevices: [],
          literatureResults: [],
          complianceScore: { overall: 0.72, gaps: ['Clinical study documentation', 'Labeling finalization'] },
        },
      },
    },
  ],
  2: [
    {
      id: 'demo-c2-202-510k-submitted-apex-ortho',
      organizationId: 2,
      clientWorkspaceId: 'demo-c2-202',
      name: 'Apex Knee System — 510(k) Submission',
      description: 'Implant + instrumentation submission with design controls, bench testing, and sterilization.',
      type: 'regulatory_submission',
      priority: 'critical',
      status: 'submitted',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      metadata: {
        clientWorkspaceId: 'demo-c2-202',
        manufacturer: 'Apex Ortho, LLC',
        deviceClass: 'II',
        intendedUse:
          'Total knee arthroplasty implant system intended for cemented fixation in primary and revision procedures.',
        attachedDocuments: [
          { name: '510(k) Cover Letter', type: 'pdf' },
          { name: 'Sterilization Validation Report', type: 'pdf' },
          { name: 'Biocompatibility Summary', type: 'pdf' },
        ],
        state: {
          documentType: '510k',
          workflowStep: 7,
          deviceProfile: {
            deviceName: 'Apex Knee System',
            manufacturer: 'Apex Ortho, LLC',
            deviceClass: 'II',
            productCode: 'JWH',
            submissionType: 'Traditional 510(k)',
            submissionId: 'K26-APEX-0202',
            intendedUse:
              'Total knee arthroplasty implant system intended for cemented fixation in primary and revision procedures.',
          },
          predicateDevices: [
            {
              kNumber: 'K210555',
              deviceName: 'Comparable Knee System',
              manufacturer: 'Example Ortho',
              similarities: ['Same indication', 'Similar materials', 'Comparable fixation'],
            },
          ],
          literatureResults: [],
          complianceScore: { overall: 0.97, gaps: [] },
        },
      },
    },
    {
      id: 'demo-c2-201-pma-early-apex-quality',
      organizationId: 2,
      clientWorkspaceId: 'demo-c2-201',
      name: 'Apex Ortho — Postmarket Surveillance Plan',
      description: 'Complaint trending, CAPA workflows, and vigilance reporting readiness.',
      type: 'medical_device',
      priority: 'medium',
      status: 'active',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 75).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      metadata: {
        clientWorkspaceId: 'demo-c2-201',
        manufacturer: 'Apex Ortho, LLC',
        deviceClass: 'III',
        intendedUse: 'PMA-track orthopedic device example for quality-system + submission workflows.',
        attachedDocuments: [
          { name: 'PMA QMS Checklist', type: 'xlsx' },
          { name: 'Clinical Plan (Draft)', type: 'docx' },
        ],
        state: {
          documentType: 'pma',
          workflowStep: 2,
          deviceProfile: {
            deviceName: 'Apex NextGen Ortho Implant (PMA Example)',
            manufacturer: 'Apex Ortho, LLC',
            deviceClass: 'III',
            submissionType: 'PMA',
            intendedUse: 'Demonstration PMA-track project for exploring features (not real submission).',
          },
          predicateDevices: [],
          literatureResults: [],
          complianceScore: { overall: 0.42, gaps: ['Nonclinical testing plan', 'Clinical protocol', 'Manufacturing readiness'] },
        },
      },
    },
    {
      id: 'demo-c2-202-510k-mid-apex-ortho',
      organizationId: 2,
      clientWorkspaceId: 'demo-c2-202',
      name: 'Apex Ortho — 510(k) In Progress (Testing & SE)',
      description: 'Mid-stage 510(k) example (predicate + performance testing + SE narrative).',
      type: 'regulatory_submission',
      priority: 'high',
      status: 'in_progress',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 55).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      metadata: {
        clientWorkspaceId: 'demo-c2-202',
        manufacturer: 'Apex Ortho, LLC',
        deviceClass: 'II',
        intendedUse: 'Orthopedic implant accessory example for 510(k) workflow exploration.',
        attachedDocuments: [{ name: 'Comparison Table Draft', type: 'xlsx' }],
        state: {
          documentType: '510k',
          workflowStep: 3,
          deviceProfile: {
            deviceName: 'Apex Instrumentation Accessory',
            manufacturer: 'Apex Ortho, LLC',
            deviceClass: 'II',
            productCode: 'KMI',
            submissionType: 'Traditional 510(k)',
            intendedUse: 'Accessory instrumentation intended to assist surgeons during orthopedic procedures.',
          },
          predicateDevices: [
            {
              kNumber: 'K201234',
              deviceName: 'Comparable Instrument Set',
              manufacturer: 'Example Ortho',
              similarities: ['Same intended use', 'Comparable materials', 'Similar sterilization modality'],
            },
          ],
          literatureResults: [],
          complianceScore: { overall: 0.76, gaps: ['Labeling', 'Software doc (if applicable)'] },
        },
      },
    },
  ],
  3: [
    {
      id: 'demo-c3-301-510k-mid-clearwave-samd',
      organizationId: 3,
      clientWorkspaceId: 'demo-c3-301',
      name: 'ClearWave Cardio SaMD — IEC 62304 V&V',
      description: 'Software V&V evidence, hazard mitigations, and cybersecurity testing traceability.',
      type: 'medical_device',
      priority: 'high',
      status: 'complete',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      metadata: {
        clientWorkspaceId: 'demo-c3-301',
        manufacturer: 'ClearWave Cardio, Inc.',
        deviceClass: 'II',
        intendedUse: 'Software-only device (SaMD) example used to explore CERV2 device profile + evidence workflows.',
        attachedDocuments: [{ name: 'Cybersecurity Test Report', type: 'pdf' }],
        state: {
          documentType: '510k',
          workflowStep: 6,
          deviceProfile: {
            deviceName: 'ClearWave Cardio SaMD',
            manufacturer: 'ClearWave Cardio, Inc.',
            deviceClass: 'II',
            productCode: 'QDD',
            submissionType: 'Traditional 510(k)',
            intendedUse: 'Assist clinicians in arrhythmia screening from ECG signals.',
          },
          predicateDevices: [
            {
              kNumber: 'K223456',
              deviceName: 'Comparable ECG Analysis Software',
              manufacturer: 'Example SaMD',
              similarities: ['Similar intended use', 'Comparable algorithmic approach'],
            },
          ],
          literatureResults: [],
          complianceScore: { overall: 0.9, gaps: ['Clinical evaluation summary'] },
        },
      },
    },
    {
      id: 'demo-c3-301-pma-submitted-clearwave',
      organizationId: 3,
      clientWorkspaceId: 'demo-c3-301',
      name: 'ClearWave — Literature Review (Clinical Claims)',
      description: 'Structured literature review to support clinical claims and intended use narrative.',
      type: 'literature_review',
      priority: 'low',
      status: 'submitted',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 120).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      metadata: {
        clientWorkspaceId: 'demo-c3-301',
        manufacturer: 'ClearWave Cardio, Inc.',
        deviceClass: 'III',
        intendedUse: 'Submitted PMA example (for exploration) with complete sections and submission artifacts.',
        attachedDocuments: [
          { name: 'PMA Module 1 (Admin) - Complete', type: 'pdf' },
          { name: 'Clinical Summary - Complete', type: 'pdf' },
        ],
        state: {
          documentType: 'pma',
          workflowStep: 5,
          deviceProfile: {
            deviceName: 'ClearWave Implantable Monitor (PMA Example)',
            manufacturer: 'ClearWave Cardio, Inc.',
            deviceClass: 'III',
            submissionType: 'PMA',
            submissionId: 'PMA-P260001',
            intendedUse: 'Example PMA submission for advanced cardiac monitoring (demo data).',
          },
          predicateDevices: [],
          literatureResults: [
            { title: 'Arrhythmia monitoring outcomes in high-risk cohorts', year: 2021, relevance: 'clinical' },
          ],
          complianceScore: { overall: 0.95, gaps: [] },
        },
      },
    },
  ],
};

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters'),
  description: z.string().optional(),
  type: z.enum(['clinical_trial', 'regulatory_submission', 'medical_device', 'literature_review']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  dueDate: z.string().optional(),
  // Legacy field: accepted for backward compatibility but must match tenant context.
  organizationId: z
    .union([z.string(), z.number()])
    .optional()
    .transform(val => {
      if (val === undefined) return undefined;
      return typeof val === 'string' ? parseInt(val, 10) : val;
    })
    .pipe(z.number().int().positive().optional()),
});

/**
 * GET /api/projects
 * Get all projects for organization
 */
router.get('/', async (req, res) => {
  try {
    const organizationId = Number((req as any).organizationId);

    if (!db) {
      const workspaceParam =
        (req.query.client_workspace_id as string | undefined) ||
        (req.query.clientWorkspaceId as string | undefined) ||
        (req.headers['x-client-workspace-id'] as string | undefined);

      const all = demoProjectsByOrg[organizationId] || [];
      if (!workspaceParam) return res.json(all);

      const filtered = all.filter(p => {
        const ws = p.clientWorkspaceId || p.metadata?.clientWorkspaceId;
        return String(ws || '') === String(workspaceParam);
      });
      return res.json(filtered);
    }

    const workspaceParam =
      (req.query.client_workspace_id as string | undefined) ||
      (req.query.clientWorkspaceId as string | undefined) ||
      (req.headers['x-client-workspace-id'] as string | undefined);

    let workspaceId: number | undefined;
    if (workspaceParam) {
      const workspaceParamStr = String(workspaceParam);
      const parsed = Number.parseInt(workspaceParamStr, 10);

      if (Number.isFinite(parsed)) {
        workspaceId = parsed;
      } else {
        // Support slug-based IDs used by the demo UI (e.g. "demo-c1-101").
        const [workspace] = await db
          .select({ id: clientWorkspaces.id })
          .from(clientWorkspaces)
          .where(and(eq(clientWorkspaces.organizationId, organizationId), eq(clientWorkspaces.slug, workspaceParamStr)));

        if (!workspace) {
          return res.status(400).json({ error: 'Invalid client workspace ID' });
        }

        workspaceId = workspace.id;
      }
    }

    // Get projects from database
    const whereClause = workspaceId
      ? and(eq(projects.organizationId, organizationId), eq(projects.clientWorkspaceId, workspaceId))
      : eq(projects.organizationId, organizationId);

    const orgProjects = await db.select().from(projects).where(whereClause);

    console.log('🔍 Retrieved projects for org', organizationId, ':', orgProjects.length);
    console.log('🔍 Projects data:', orgProjects);
    res.json(orgProjects);
  } catch (error) {
    if (isDbUnavailable(error)) {
      const orgId = Number((req as any).organizationId);
      const workspaceParam =
        (req.query.client_workspace_id as string | undefined) ||
        (req.query.clientWorkspaceId as string | undefined) ||
        (req.headers['x-client-workspace-id'] as string | undefined);
      const demo = demoProjectsByOrg[orgId] || [];
      if (!workspaceParam) return res.json(demo);
      return res.json(
        demo.filter(p => {
          const ws = p.clientWorkspaceId || p.metadata?.clientWorkspaceId;
          return String(ws || '') === String(workspaceParam);
        })
      );
    }
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    console.log('Create project request received:', req.body);

    if (!db) {
      const organizationId = Number((req as any).organizationId);
      const validatedData = createProjectSchema.parse(req.body);
      const numericIds = (demoProjectsByOrg[organizationId] || [])
        .map(p => String(p.id))
        .map(id => (id.startsWith('demo-proj-') ? Number.parseInt(id.replace('demo-proj-', ''), 10) : NaN))
        .filter(n => Number.isFinite(n));
      const nextId = (numericIds.length ? Math.max(...numericIds) : 0) + 1;
      const now = new Date().toISOString();
      const created: DemoProject = {
        id: `demo-proj-${nextId}`,
        organizationId,
        name: validatedData.name,
        description: validatedData.description || null,
        type: validatedData.type,
        priority: validatedData.priority,
        status: 'active',
        dueDate: validatedData.dueDate || null,
        createdAt: now,
        updatedAt: now,
        metadata: {
          manufacturer: null,
          deviceClass: null,
          intendedUse: null,
          attachedDocuments: [],
          state: {
            documentType: validatedData.type === 'regulatory_submission' ? '510k' : '510k',
            workflowStep: 1,
            deviceProfile: {},
            predicateDevices: [],
            literatureResults: [],
            complianceScore: null,
          },
        },
      };
      demoProjectsByOrg[organizationId] = demoProjectsByOrg[organizationId] || [];
      demoProjectsByOrg[organizationId].unshift(created);
      return res.status(201).json(created);
    }

    const validatedData = createProjectSchema.parse(req.body);

    const organizationId = Number((req as any).organizationId);

    if (
      validatedData.organizationId !== undefined &&
      Number.isFinite(validatedData.organizationId) &&
      validatedData.organizationId !== organizationId
    ) {
      return res.status(403).json({
        error: 'Organization mismatch',
        message: 'organizationId must match authenticated tenant context',
      });
    }
    
    // Find an available client workspace for the organization first
    let availableClients = await db
      .select()
      .from(clientWorkspaces)
      .where(eq(clientWorkspaces.organizationId, organizationId))
      .limit(1);

    let clientWorkspaceId: number;

    if (availableClients.length === 0) {
      // Auto-create a default client workspace for the organization
      console.log(
        `No client workspaces found for organization ${organizationId}. Creating default workspace.`
      );

      // Get organization info for default workspace creation
      const [organization] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!organization) {
        return res.status(400).json({
          error: 'Organization not found',
          code: 'ORGANIZATION_NOT_FOUND',
        });
      }

      const [newClientWorkspace] = await db
        .insert(clientWorkspaces)
        .values({
          organizationId,
          name: `${organization.name} - Default Workspace`,
          slug: `${organization.slug}-default`,
          description: 'Default client workspace created automatically for project management',
          status: 'active',
          industry: organization.industryType || 'pharmaceutical',
          tier: organization.tier || 'standard',
          quotaUsers: organization.maxUsers || 5,
          quotaProjects: organization.maxProjects || 10,
          quotaStorage: organization.maxStorage || 5,
        })
        .returning();

      clientWorkspaceId = newClientWorkspace.id;
      console.log(
        `Created default client workspace ${clientWorkspaceId} (${newClientWorkspace.name}) for organization ${organizationId}`
      );
    } else {
      clientWorkspaceId = availableClients[0].id;
      console.log(
        `Using existing client workspace ${clientWorkspaceId} (${availableClients[0].name}) for project creation`
      );
    }
    
    // Use atomic project creation with quota enforcement
    const { atomicCreateProject } = await import('../services/atomicQuotaService.js');
    const result = await atomicCreateProject(organizationId, {
      name: validatedData.name,
      description: validatedData.description || null,
      type: validatedData.type,
      priority: validatedData.priority,
      dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
      clientWorkspaceId: clientWorkspaceId,
      status: 'active'
    });
    
    if (!result.success) {
      if (result.error === 'QUOTA_EXCEEDED') {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          message: result.message,
          details: result.details
        });
      }
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

    console.log('Created project atomically:', result.data);
    console.log('Quota info:', result.quotaInfo);
    
    res.status(201).json(result.data);
  } catch (error) {
    if (isDbUnavailable(error)) {
      try {
        const organizationId = Number((req as any).organizationId);
        const validatedData = createProjectSchema.parse(req.body);
        const numericIds = (demoProjectsByOrg[organizationId] || [])
          .map(p => String(p.id))
          .map(id => (id.startsWith('demo-proj-') ? Number.parseInt(id.replace('demo-proj-', ''), 10) : NaN))
          .filter(n => Number.isFinite(n));
        const nextId = (numericIds.length ? Math.max(...numericIds) : 0) + 1;
        const now = new Date().toISOString();
        const created: DemoProject = {
          id: `demo-proj-${nextId}`,
          organizationId,
          name: validatedData.name,
          description: validatedData.description || null,
          type: validatedData.type,
          priority: validatedData.priority,
          status: 'active',
          dueDate: validatedData.dueDate || null,
          createdAt: now,
          updatedAt: now,
          metadata: {
            manufacturer: null,
            deviceClass: null,
            intendedUse: null,
            attachedDocuments: [],
            state: {
              documentType: validatedData.type === 'regulatory_submission' ? '510k' : '510k',
              workflowStep: 1,
              deviceProfile: {},
              predicateDevices: [],
              literatureResults: [],
              complianceScore: null,
            },
          },
        };
        demoProjectsByOrg[organizationId] = demoProjectsByOrg[organizationId] || [];
        demoProjectsByOrg[organizationId].unshift(created);
        return res.status(201).json(created);
      } catch (zodOrOther) {
        if (zodOrOther instanceof z.ZodError) {
          return res.status(400).json({ error: 'Invalid project data', details: zodOrOther.errors });
        }
      }
    }

    console.error('Error creating project:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid project data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * DELETE /api/projects/:projectId
 * Delete a specific project
 */
router.delete('/:projectId', async (req, res) => {
  try {
    const projectIdParam = String(req.params.projectId);
    const projectIdNumber = Number.parseInt(projectIdParam, 10);

    if (!db) {
      const organizationId = Number((req as any).organizationId);
      const list = demoProjectsByOrg[organizationId] || [];
      const idx = list.findIndex(p => String(p.id) === projectIdParam);
      if (idx === -1) return res.status(404).json({ error: 'Project not found' });
      list.splice(idx, 1);
      demoProjectsByOrg[organizationId] = list;
      return res.json({ message: 'Project deleted successfully', projectId: projectIdParam });
    }

    if (Number.isNaN(projectIdNumber)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Check if project exists
    const [existingProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectIdNumber));

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete the project
    await db.delete(projects).where(eq(projects.id, projectId));

    console.log(`Deleted project ${projectId} (${existingProject.name})`);
    res.json({ message: 'Project deleted successfully', projectId });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
