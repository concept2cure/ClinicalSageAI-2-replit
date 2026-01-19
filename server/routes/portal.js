import express from 'express';
import jwt from 'jsonwebtoken';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  activityFeed,
  availableModules,
  clientAccess,
  clientWorkspaces,
  documents,
  licenseEntitlements,
  notifications,
  moduleSubscriptions,
  organizationLicenses,
  organizationUsers,
  organizations,
  projects,
  unifiedTasks,
  validationIssues,
  users,
} from '../../shared/schema.ts';
import { authenticateJWT } from '../middleware/auth.js';
import { getModuleAccessList } from '../services/licenseService.js';

const router = express.Router();

const DEFAULT_MODULES = [
  {
    moduleId: 'submission-center',
    name: 'Submission Center™',
    description: 'Unified submission command center for IND, eCTD, CMC, and QA workflows.',
    category: 'submissions',
    path: '/submission-center',
    icon: 'send',
    isNew: false,
    isHighlight: true,
    sortOrder: 10,
    metadata: { defaultEnabled: true },
  },
  {
    moduleId: 'medical-device',
    name: 'Medical Device & Diagnostics RA™',
    description: 'End-to-end regulatory automation for 510(k), CER, MDR/IVDR evidence, and diagnostics workflows.',
    category: 'submissions',
    path: '/cerv2',
    icon: 'shield-check',
    isNew: false,
    isHighlight: true,
    sortOrder: 20,
    metadata: { defaultEnabled: false },
  },
  {
    moduleId: 'coauthor',
    name: 'eCTD Co-Author',
    description: 'AI-assisted eCTD authoring and compilation.',
    category: 'authoring',
    path: '/coauthor',
    icon: 'file-text',
    isNew: false,
    isHighlight: false,
    sortOrder: 30,
    metadata: { defaultEnabled: true },
  },
  {
    moduleId: 'cmc',
    name: 'CMC Wizard™',
    description: 'Chemistry, Manufacturing, and Controls documentation workflows.',
    category: 'submissions',
    path: '/cmc-blueprint',
    icon: 'flask-conical',
    isNew: false,
    isHighlight: false,
    sortOrder: 40,
    metadata: { defaultEnabled: true },
  },
  {
    moduleId: 'vault',
    name: 'Document Vault',
    description: 'Secure document vault and evidence room.',
    category: 'authoring',
    path: '/vault',
    icon: 'folder',
    isNew: false,
    isHighlight: false,
    sortOrder: 50,
    metadata: { defaultEnabled: true },
  },
  {
    moduleId: 'document-authoring',
    name: 'Enhanced Document Editor',
    description: 'Structured authoring with validation-aware editing.',
    category: 'authoring',
    path: '/enhanced-editor',
    icon: 'edit',
    isNew: false,
    isHighlight: false,
    sortOrder: 60,
    metadata: { defaultEnabled: true },
  },
  {
    moduleId: 'module-editor',
    name: 'Module Section Editor',
    description: 'CTD module section editor with collaboration features.',
    category: 'authoring',
    path: '/module-editor',
    icon: 'layout-grid',
    isNew: false,
    isHighlight: false,
    sortOrder: 70,
    metadata: { defaultEnabled: true },
  },
  {
    moduleId: 'study-regulatory-suite',
    name: 'Study & Regulatory Intelligence Suite',
    description: 'Unified clinical study, risk, and regulatory intelligence suite.',
    category: 'analytics',
    path: '/unified-suite',
    icon: 'bar-chart-3',
    isNew: false,
    isHighlight: false,
    sortOrder: 80,
    metadata: { defaultEnabled: true },
  },
  {
    moduleId: 'risk',
    name: 'Risk Heatmap',
    description: 'Risk intelligence dashboards and heatmaps.',
    category: 'analytics',
    path: '/risk-heatmap',
    icon: 'activity',
    isNew: false,
    isHighlight: false,
    sortOrder: 85,
    metadata: { defaultEnabled: true },
  },
  {
    moduleId: 'analytics',
    name: 'Analytics',
    description: 'Operational and content analytics dashboards.',
    category: 'analytics',
    path: '/analytics',
    icon: 'bar-chart',
    isNew: false,
    isHighlight: false,
    sortOrder: 90,
    metadata: { defaultEnabled: true },
  },
];

const ensureModulesSeeded = async () => {
  const values = DEFAULT_MODULES.map(mod => ({
    moduleId: mod.moduleId,
    name: mod.name,
    description: mod.description,
    category: mod.category,
    path: mod.path,
    icon: mod.icon,
    isNew: Boolean(mod.isNew),
    isHighlight: Boolean(mod.isHighlight),
    sortOrder: Number(mod.sortOrder ?? 0),
    metadata: mod.metadata ?? {},
  }));

  await db.insert(availableModules).values(values).onConflictDoNothing({ target: availableModules.moduleId });
};

const getDefaultEnabledFromMetadata = metadata => {
  if (!metadata) return false;
  if (typeof metadata.defaultEnabled === 'boolean') return metadata.defaultEnabled;
  return false;
};

const ensureEntitlementsForOrg = async organizationId => {
  await ensureModulesSeeded();
  const existing = await db
    .select()
    .from(licenseEntitlements)
    .where(eq(licenseEntitlements.organizationId, organizationId));

  let license = await db
    .select()
    .from(organizationLicenses)
    .where(and(eq(organizationLicenses.organizationId, organizationId), eq(organizationLicenses.status, 'active')))
    .limit(1);

  let licenseRecord = license[0];
  if (!licenseRecord) {
    const [created] = await db
      .insert(organizationLicenses)
      .values({
        organizationId,
        status: 'active',
        plan: 'standard',
        startsAt: new Date(),
        billingCycle: 'monthly',
      })
      .returning();
    licenseRecord = created;
  }

  const modulesRows = await db
    .select()
    .from(availableModules)
    .orderBy(asc(availableModules.sortOrder), asc(availableModules.name));

  const subsRows = await db
    .select()
    .from(moduleSubscriptions)
    .where(eq(moduleSubscriptions.organizationId, organizationId));

  const subsByModuleId = new Map();
  for (const sub of subsRows || []) {
    subsByModuleId.set(sub.moduleId, sub);
  }

  const existingByModule = new Set(existing.map(ent => ent.moduleId));
  const toInsert = [];
  for (const mod of modulesRows || []) {
    const subscription = subsByModuleId.get(mod.moduleId) || null;
    const defaultEnabled = getDefaultEnabledFromMetadata(mod.metadata);
    const enabled = subscription ? Boolean(subscription.enabled) : Boolean(defaultEnabled);
    if (!enabled) continue;
    if (existingByModule.has(mod.moduleId)) continue;

    toInsert.push({
      licenseId: licenseRecord.id,
      organizationId,
      moduleId: mod.moduleId,
      scope: 'organization',
      status: 'active',
      startsAt: licenseRecord.startsAt || new Date(),
    });
  }

  if (toInsert.length > 0) {
    await db.insert(licenseEntitlements).values(toInsert);
  }
};

const buildToken = ({ user, memberships, organizationId }) => {
  const primaryOrg = memberships.find(m => m.organizationId === organizationId) || memberships[0];
  if (!primaryOrg) {
    throw new Error('User not associated with any organization');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: primaryOrg.organizationId,
      role: primaryOrg.role,
      permissions: primaryOrg.permissions || {},
      organizations: memberships.map(m => ({
        id: m.organizationId,
        name: m.orgName,
        slug: m.orgSlug,
        role: m.role,
      })),
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

router.get('/bootstrap', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userResult.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const memberships = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
        permissions: organizationUsers.permissions,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        orgTier: organizations.tier,
        orgStatus: organizations.status,
      })
      .from(organizationUsers)
      .leftJoin(organizations, eq(organizationUsers.organizationId, organizations.id))
      .where(eq(organizationUsers.userId, userId));

    if (memberships.length === 0) {
      return res.status(403).json({ success: false, message: 'No organization access' });
    }

    const currentOrganization = memberships.find(m => m.organizationId === organizationId) || memberships[0];

    const workspaceAccess = await db
      .select({
        clientWorkspaceId: clientAccess.clientWorkspaceId,
        role: clientAccess.role,
        permissions: clientAccess.permissions,
      })
      .from(clientAccess)
      .where(
        and(
          eq(clientAccess.organizationId, currentOrganization.organizationId),
          eq(clientAccess.userId, userId)
        )
      );

    const workspaceIds = workspaceAccess.map(item => item.clientWorkspaceId);

    const workspacesQuery = db
      .select()
      .from(clientWorkspaces)
      .where(eq(clientWorkspaces.organizationId, currentOrganization.organizationId));

    const workspaces = workspaceIds.length
      ? await workspacesQuery.where(inArray(clientWorkspaces.id, workspaceIds))
      : await workspacesQuery;

    const projectsQuery = db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, currentOrganization.organizationId));

    const projectList = workspaceIds.length
      ? await projectsQuery.where(inArray(projects.clientWorkspaceId, workspaceIds))
      : await projectsQuery;

    await ensureEntitlementsForOrg(currentOrganization.organizationId);
    const moduleAccess = await getModuleAccessList(currentOrganization.organizationId);

    return res.json({
      success: true,
      user: userResult[0],
      organizations: memberships.map(m => ({
        id: m.organizationId,
        name: m.orgName,
        slug: m.orgSlug,
        tier: m.orgTier,
        status: m.orgStatus,
        role: m.role,
        permissions: m.permissions,
      })),
      currentOrganization: {
        id: currentOrganization.organizationId,
        name: currentOrganization.orgName,
        slug: currentOrganization.orgSlug,
        tier: currentOrganization.orgTier,
        role: currentOrganization.role,
        permissions: currentOrganization.permissions,
      },
      clientWorkspaces: workspaces,
      workspaceAccess,
      projects: projectList,
      modules: moduleAccess,
    });
  } catch (error) {
    console.error('Portal bootstrap error:', error);
    res.status(500).json({ success: false, message: 'Failed to load portal data' });
  }
});

router.post('/switch-organization', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { organizationId } = req.body || {};

    if (!userId || !organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userResult.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const memberships = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
        permissions: organizationUsers.permissions,
        orgName: organizations.name,
        orgSlug: organizations.slug,
      })
      .from(organizationUsers)
      .leftJoin(organizations, eq(organizationUsers.organizationId, organizations.id))
      .where(eq(organizationUsers.userId, userId));

    const hasAccess = memberships.some(m => m.organizationId === Number(organizationId));
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'No access to organization' });
    }

    const token = buildToken({
      user: userResult[0],
      memberships,
      organizationId: Number(organizationId),
    });

    res.json({ success: true, token });
  } catch (error) {
    console.error('Switch organization error:', error);
    res.status(500).json({ success: false, message: 'Failed to switch organization' });
  }
});

router.get('/projects', authenticateJWT, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const workspaceAccess = await db
      .select({ clientWorkspaceId: clientAccess.clientWorkspaceId })
      .from(clientAccess)
      .where(
        and(
          eq(clientAccess.organizationId, organizationId),
          eq(clientAccess.userId, userId)
        )
      );

    const workspaceIds = workspaceAccess.map(item => item.clientWorkspaceId);

    const projectsQuery = db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, organizationId));

    const projectList = workspaceIds.length
      ? await projectsQuery.where(inArray(projects.clientWorkspaceId, workspaceIds))
      : await projectsQuery;

    res.json({ success: true, projects: projectList });
  } catch (error) {
    console.error('Projects fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch projects' });
  }
});

router.get('/documents', authenticateJWT, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const docs = await db
      .select({
        id: documents.id,
        title: documents.title,
        documentType: documents.documentType,
        status: documents.status,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.organizationId, organizationId))
      .limit(10);

    res.json({ success: true, documents: docs });
  } catch (error) {
    console.error('Documents fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch documents' });
  }
});

router.get('/dashboard', authenticateJWT, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const workspaceAccess = await db
      .select({ clientWorkspaceId: clientAccess.clientWorkspaceId })
      .from(clientAccess)
      .where(
        and(
          eq(clientAccess.organizationId, organizationId),
          eq(clientAccess.userId, userId)
        )
      );

    const workspaceIds = workspaceAccess.map(item => item.clientWorkspaceId);

    const projectsQuery = db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, organizationId));

    const projectList = workspaceIds.length
      ? await projectsQuery.where(inArray(projects.clientWorkspaceId, workspaceIds))
      : await projectsQuery;

    const documentsQuery = db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, organizationId));

    const documentsList = workspaceIds.length
      ? await documentsQuery.where(inArray(documents.clientWorkspaceId, workspaceIds))
      : await documentsQuery;

    const tasksQuery = db
      .select()
      .from(unifiedTasks)
      .where(eq(unifiedTasks.organizationId, organizationId));

    const tasksList = workspaceIds.length
      ? await tasksQuery.where(inArray(unifiedTasks.clientWorkspaceId, workspaceIds))
      : await tasksQuery;

    const issues = await db
      .select()
      .from(validationIssues)
      .where(eq(validationIssues.organizationId, organizationId));

    const completedDocumentStatuses = new Set(['approved', 'effective', 'published', 'completed']);
    const completedTaskStatuses = new Set(['completed', 'done']);

    const documentsComplete = documentsList.filter(doc => completedDocumentStatuses.has(doc.status)).length;
    const tasksComplete = tasksList.filter(task => completedTaskStatuses.has(task.status)).length;
    const milestones = tasksList.filter(task => task.taskType === 'milestone');
    const milestonesComplete = milestones.filter(task => completedTaskStatuses.has(task.status)).length;

    const openIssues = issues.filter(issue => issue.status !== 'resolved' && issue.status !== 'closed');
    const resolvedIssues = issues.length - openIssues.length;

    const now = new Date();
    const upcomingDeadlines = projectList
      .filter(project => project.targetEndDate)
      .map(project => ({
        id: project.id,
        title: project.name,
        date: project.targetEndDate,
        type: project.type || 'project',
        project: project.name,
      }))
      .filter(item => new Date(item.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 6);

    const recentDocuments = documentsList
      .slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 6)
      .map(doc => ({
        id: doc.id,
        name: doc.title,
        type: doc.documentType,
        updatedAt: doc.updatedAt,
        module: doc.module,
      }));

    res.json({
      success: true,
      metrics: {
        documents: { total: documentsList.length, complete: documentsComplete },
        tasks: { total: tasksList.length, complete: tasksComplete },
        milestones: { total: milestones.length, complete: milestonesComplete },
        issues: { total: issues.length, resolved: resolvedIssues },
      },
      deadlines: upcomingDeadlines,
      recentDocuments,
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
});

router.get('/notifications', authenticateJWT, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const items = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.recipientId, userId)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(10);

    res.json({ success: true, notifications: items });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load notifications' });
  }
});

router.get('/assistant/:projectId', authenticateJWT, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { projectId } = req.params;

    if (!organizationId || !projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    const projectResult = await db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), eq(projects.id, Number(projectId))))
      .limit(1);

    if (!projectResult.length) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const project = projectResult[0];
    const suggestions = [];

    if (project.progress !== null && project.progress < 70) {
      suggestions.push({
        id: `progress-${project.id}`,
        title: 'Accelerate project completion',
        description: `Project progress is at ${project.progress}%. Review critical path tasks to stay on track.`,
        priority: 'high',
      });
    }

    if (project.targetEndDate) {
      const daysRemaining = Math.ceil((new Date(project.targetEndDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysRemaining <= 30) {
        suggestions.push({
          id: `deadline-${project.id}`,
          title: 'Upcoming deadline review',
          description: `Target end date is in ${daysRemaining} days. Validate deliverables and approvals.`,
          priority: daysRemaining <= 14 ? 'high' : 'medium',
        });
      }
    }

    if (suggestions.length === 0) {
      suggestions.push({
        id: `status-${project.id}`,
        title: 'Project health check',
        description: 'Project is on track. Review upcoming milestones to maintain momentum.',
        priority: 'low',
      });
    }

    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('Assistant fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to load assistant insights' });
  }
});

router.get('/activities', authenticateJWT, async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const activities = await db
      .select()
      .from(activityFeed)
      .where(eq(activityFeed.organizationId, organizationId))
      .orderBy(desc(activityFeed.createdAt))
      .limit(25);

    res.json({ success: true, activities });
  } catch (error) {
    console.error('Activities fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activities' });
  }
});

export default router;
