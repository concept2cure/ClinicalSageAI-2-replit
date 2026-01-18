import { db } from './server/db/index.ts';
import { organizations, clientWorkspaces, users, projects, documents } from './shared/schema.ts';
import { and, eq, sql } from 'drizzle-orm';

const demoProjects = [
  {
    name: 'ClearMind TMS',
    code: 'K2024-001',
    status: 'draft',
    priority: 'high',
    type: 'regulatory',
    metadata: {
      manufacturer: 'Concept2Cure',
      deviceClass: 'II',
      intendedUse: 'Non-invasive neurostimulation for depression',
    },
  },
  {
    name: 'JointAlign Pro',
    code: 'K2024-014',
    status: 'in_review',
    priority: 'medium',
    type: 'regulatory',
    metadata: {
      manufacturer: 'Concept2Cure',
      deviceClass: 'II',
      intendedUse: 'Orthopedic alignment system for joint repair',
    },
  },
  {
    name: 'SleepTrack DX',
    code: 'K2023-077',
    status: 'completed',
    priority: 'low',
    type: 'regulatory',
    metadata: {
      manufacturer: 'Concept2Cure',
      deviceClass: 'II',
      intendedUse: 'Sleep diagnostics and monitoring',
    },
  },
  {
    name: 'NeuroPulse Mini',
    code: 'K2024-033',
    status: 'draft',
    priority: 'medium',
    type: 'regulatory',
    metadata: {
      manufacturer: 'Concept2Cure',
      deviceClass: 'II',
      intendedUse: 'Compact neural stimulation for pain therapy',
    },
  },
  {
    name: 'CardioSense Patch',
    code: 'K2024-045',
    status: 'in_review',
    priority: 'high',
    type: 'regulatory',
    metadata: {
      manufacturer: 'Concept2Cure',
      deviceClass: 'II',
      intendedUse: 'Continuous cardiac rhythm monitoring patch',
    },
  },
  {
    name: 'DermalScan AI',
    code: 'K2023-102',
    status: 'completed',
    priority: 'low',
    type: 'regulatory',
    metadata: {
      manufacturer: 'Concept2Cure',
      deviceClass: 'II',
      intendedUse: 'AI-assisted dermal lesion analysis',
    },
  },
];

const docTemplates = [
  { suffix: 'CER', title: 'Clinical Evaluation Report', documentType: 'Report' },
  { suffix: '510K', title: '510(k) Submission Packet', documentType: 'Submission' },
  { suffix: 'TECH', title: 'Technical File Summary', documentType: 'Report' },
];

(async () => {
  const documentsTableCheck = await db.execute(
    sql`SELECT to_regclass('public.documents') AS exists`
  );
  const documentsTableExists = Boolean(documentsTableCheck?.[0]?.exists);
  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.domain, 'concept2cure.pro'))
    .limit(1);
  const org = orgRows[0] || (await db.select().from(organizations).limit(1))[0];

  if (!org) {
    console.log('No organizations found. Seed organizations first.');
    process.exit(0);
  }

  let workspace = (await db
    .select()
    .from(clientWorkspaces)
    .where(eq(clientWorkspaces.organizationId, org.id))
    .limit(1))[0];

  if (!workspace) {
    const [created] = await db.insert(clientWorkspaces).values({
      organizationId: org.id,
      name: `${org.name} Primary Workspace`,
      slug: `${org.slug || org.domain || 'org'}-primary`,
      status: 'active',
      industry: 'Regulatory',
    }).returning();
    workspace = created;
  }

  const owner = (await db
    .select()
    .from(users)
    .where(eq(users.email, 'jm.smith@concept2cure.pro'))
    .limit(1))[0] || (await db.select().from(users).limit(1))[0];

  if (!owner) {
    console.log('No users found. Seed users first.');
    process.exit(0);
  }

  for (const project of demoProjects) {
    const existing = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, org.id),
          eq(projects.clientWorkspaceId, workspace.id),
          eq(projects.name, project.name)
        )
      )
      .limit(1);

    let projectRow = existing[0];
    if (!projectRow) {
      const [created] = await db
        .insert(projects)
        .values({
          organizationId: org.id,
          clientWorkspaceId: workspace.id,
          name: project.name,
          code: project.code,
          status: project.status,
          priority: project.priority,
          type: project.type,
          metadata: project.metadata,
          createdById: owner.id,
          ownerId: owner.id,
        })
        .returning();
      projectRow = created;
    }

    if (!projectRow) continue;

    if (documentsTableExists) {
      for (const template of docTemplates) {
        const documentCode = `C2C-${projectRow.id}-${template.suffix}`;
        const existingDoc = await db
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.organizationId, org.id),
              eq(documents.documentCode, documentCode)
            )
          )
          .limit(1);

        if (existingDoc.length > 0) continue;

        await db.insert(documents).values({
          organizationId: org.id,
          clientWorkspaceId: workspace.id,
          projectId: projectRow.id,
          documentCode,
          title: `${project.name} ${template.title}`,
          documentType: template.documentType,
          category: 'Regulatory',
          status: project.status === 'completed' ? 'approved' : 'draft',
          ownerId: owner.id,
          createdById: owner.id,
          module: 'CERV2',
          regionScope: 'FDA',
          metadata: {
            demo: true,
            deviceName: project.name,
          },
        });
      }
    }
  }

  console.log('✅ CERV2 demo projects and documents seeded.');
  process.exit(0);
})().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
