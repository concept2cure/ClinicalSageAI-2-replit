import 'dotenv/config';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import {
  organizations,
  sourceDocuments,
  sourceDataPoints,
  Organization,
  SourceDocument,
} from '@shared/schema';

async function ensureOrganization(): Promise<Organization> {
  if (!db) {
    throw new Error('Database connection unavailable. Ensure DATABASE_URL is set.');
  }

  const existing = await db.select().from(organizations).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  const slugBase = 'demo-org';
  const orgName = 'Demo Organization';

  const [created] = await db
    .insert(organizations)
    .values({
      name: orgName,
      slug: `${slugBase}-${Date.now()}`,
      tier: 'standard',
      status: 'active',
    })
    .returning();

  if (!created) {
    throw new Error('Failed to insert demo organization');
  }

  return created;
}

async function ensureSourceDocument(org: Organization): Promise<SourceDocument> {
  if (!db) {
    throw new Error('Database connection unavailable.');
  }

  const existing = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.organizationId, org.id))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const documentUid = `srcdoc_${randomUUID()}`;

  const [document] = await db
    .insert(sourceDocuments)
    .values({
      organizationId: org.id,
      documentUid,
      title: 'Demo Clinical Study Report',
      description: 'Seeded document providing initial data for the Smart Ingestion panel.',
      sourceType: 'pdf',
      origin: 'seed-script',
      ingestionStatus: 'processed',
      fileName: 'demo_csr.pdf',
      fileSize: 1024 * 512,
      mimeType: 'application/pdf',
      metadata: {
        storagePath: '/tmp/demo_csr.pdf',
        note: 'Seeded document stub for local development',
      },
    })
    .returning();

  if (!document) {
    throw new Error('Failed to insert demo source document');
  }

  return document;
}

async function ensureSourceDataPoints(org: Organization, document: SourceDocument) {
  if (!db) {
    throw new Error('Database connection unavailable.');
  }

  const existing = await db
    .select({ id: sourceDataPoints.id })
    .from(sourceDataPoints)
    .where(eq(sourceDataPoints.documentId, document.id))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(sourceDataPoints).values([
    {
      organizationId: org.id,
      documentId: document.id,
      dataPointUid: `srcpoint_${randomUUID()}`,
      label: 'p-value',
      content: 'Primary endpoint statistical result (p = 0.045) demonstrating superiority versus placebo.',
      value: 'p=0.045',
      dataType: 'statistic',
      metadata: {
        seeded: true,
        context: 'Results section, paragraph 3',
      },
    },
    {
      organizationId: org.id,
      documentId: document.id,
      dataPointUid: `srcpoint_${randomUUID()}`,
      label: 'sample_size',
      content: 'Sample size reported in study summary (N = 212).',
      value: 'N=212',
      dataType: 'statistic',
      metadata: {
        seeded: true,
        context: 'Study summary table 1',
      },
    },
    {
      organizationId: org.id,
      documentId: document.id,
      dataPointUid: `srcpoint_${randomUUID()}`,
      label: 'confidence_interval',
      content: '95% CI for treatment effect: 1.2 to 3.4.',
      value: 'CI 95% 1.2–3.4',
      dataType: 'statistic',
      metadata: {
        seeded: true,
        context: 'Efficacy analysis section',
      },
    },
  ]);
}

async function main() {
  try {
    const org = await ensureOrganization();
    const doc = await ensureSourceDocument(org);
    await ensureSourceDataPoints(org, doc);
    console.log('✅ Seed complete. Demo organization and source data ready.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

main();
