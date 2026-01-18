import { db } from './server/db/index.ts';
import { organizations, clientWorkspaces } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

(async () => {
  const orgRows = await db.select().from(organizations);
  if (!orgRows.length) {
    console.log('No organizations found to seed client workspaces.');
    process.exit(0);
  }

  const workspaceTemplates = [
    { name: 'Primary Workspace', slug: 'primary', industry: 'Regulatory' },
    { name: 'R&D Programs', slug: 'rnd', industry: 'Clinical' },
  ];

  for (const org of orgRows) {
    for (const template of workspaceTemplates) {
      const slug = `${org.domain || org.slug || org.name}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') + `-${template.slug}`;

      const existing = await db
        .select()
        .from(clientWorkspaces)
        .where(eq(clientWorkspaces.slug, slug))
        .limit(1);

      if (existing.length > 0) continue;

      await db.insert(clientWorkspaces).values({
        organizationId: org.id,
        name: `${org.name} ${template.name}`,
        slug,
        status: 'active',
        industry: template.industry,
      });
    }
  }

  console.log('✅ Client workspaces seeded for all organizations.');
  process.exit(0);
})().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
