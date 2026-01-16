import 'dotenv/config';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set. Please configure the database connection.');
  process.exit(1);
}

const sql = postgres(url, {
  ssl: url.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

async function ensureTables() {
  const tables = [
    {
      name: 'source_documents',
      ddl: `
        create table if not exists source_documents (
          id uuid primary key default gen_random_uuid(),
          organization_id integer not null references organizations(id),
          document_uid text not null unique,
          title text,
          description text,
          source_type text not null,
          origin text,
          ingestion_status text not null default 'processed',
          checksum text,
          file_name text,
          file_size integer,
          mime_type text,
          page_count integer,
          metadata jsonb,
          created_by integer,
          processed_at timestamp,
          created_at timestamp not null default now(),
          updated_at timestamp not null default now()
        );
      `,
      indexes: [
        `create index if not exists source_documents_org_idx on source_documents (organization_id);`,
        `create index if not exists source_documents_status_idx on source_documents (ingestion_status);`
      ],
    },
    {
      name: 'source_data_points',
      ddl: `
        create table if not exists source_data_points (
          id uuid primary key default gen_random_uuid(),
          organization_id integer not null references organizations(id),
          document_id uuid references source_documents(id) on delete cascade,
          data_point_uid text not null unique,
          label text,
          content text not null,
          value text,
          data_type text,
          unit text,
          page_number integer,
          section_heading text,
          subsection_heading text,
          table_name text,
          row_index integer,
          column_name text,
          source_location jsonb,
          confidence real,
          hash text,
          metadata jsonb,
          last_seen_at timestamp,
          created_at timestamp not null default now(),
          updated_at timestamp not null default now()
        );
      `,
      indexes: [
        `create index if not exists source_data_points_org_idx on source_data_points (organization_id);`,
        `create index if not exists source_data_points_doc_idx on source_data_points (document_id);`
      ],
    },
  ];

  for (const table of tables) {
    const [exists] = await sql`
      select to_regclass(${`public.${table.name}`}::text) as regclass;
    `;

    if (!exists?.regclass) {
      console.log(`Creating table ${table.name}...`);
      await sql.unsafe(table.ddl);
      for (const indexSql of table.indexes) {
        await sql.unsafe(indexSql);
      }
    }
  }
}

async function ensureOrganization() {
  const slug = 'demo-ingestion-org';
  const [existing] = await sql`
    select id from organizations where slug = ${slug} limit 1;
  `;

  if (existing?.id) {
    return existing.id;
  }

  console.log('Inserting demo organization...');
  const name = 'Demo Ingestion Org';
  const [inserted] = await sql`
    insert into organizations (name, slug, type, created_at)
    values (${name}, ${slug}, 'CLIENT', now())
    returning id;
  `;

  return inserted.id;
}

async function ensureDocument(orgId) {
  const documentUid = 'srcdoc_demo_seed';
  const [existing] = await sql`
    select id from source_documents where document_uid = ${documentUid} limit 1;
  `;

  if (existing?.id) {
    return existing.id;
  }

  console.log('Inserting demo source document...');
  const now = new Date();
  const metadata = {
    storagePath: '/tmp/demo-seed.pdf',
    note: 'Seeded document placeholder for development',
  };

  const [inserted] = await sql`
    insert into source_documents (
      organization_id,
      document_uid,
      title,
      description,
      source_type,
      origin,
      ingestion_status,
      file_name,
      file_size,
      mime_type,
      metadata,
      created_at,
      updated_at
    ) values (
      ${orgId},
      ${documentUid},
      ${'Demo Clinical Study Report'},
      ${'Seeded document providing initial data for the Smart Ingestion panel.'},
      ${'pdf'},
      ${'seed-script'},
      ${'processed'},
      ${'demo_csr.pdf'},
      ${512 * 1024},
      ${'application/pdf'},
      ${metadata},
      ${now},
      ${now}
    )
    returning id;
  `;

  return inserted.id;
}

async function ensureDataPoints(orgId, documentId) {
  const [existing] = await sql`
    select id from source_data_points where document_id = ${documentId} limit 1;
  `;

  if (existing?.id) {
    return;
  }

  console.log('Inserting demo data points...');
  const points = [
    {
      uid: `srcpoint_${randomUUID()}`,
      label: 'p-value',
      content: 'Primary endpoint p-value = 0.045 demonstrating superiority versus placebo.',
      value: 'p=0.045',
      dataType: 'statistic',
    },
    {
      uid: `srcpoint_${randomUUID()}`,
      label: 'sample_size',
      content: 'Sample size reported in study summary (N = 212).',
      value: 'N=212',
      dataType: 'statistic',
    },
    {
      uid: `srcpoint_${randomUUID()}`,
      label: 'confidence_interval',
      content: '95% confidence interval for treatment effect: 1.2 to 3.4.',
      value: 'CI 95% 1.2–3.4',
      dataType: 'statistic',
    },
  ];

  const now = new Date();

  for (const point of points) {
    await sql`
      insert into source_data_points (
        organization_id,
        document_id,
        data_point_uid,
        label,
        content,
        value,
        data_type,
        metadata,
        created_at,
        updated_at
      ) values (
        ${orgId},
        ${documentId},
        ${point.uid},
        ${point.label},
        ${point.content},
        ${point.value},
        ${point.dataType},
        ${ { seeded: true } },
        ${now},
        ${now}
      )
      on conflict (data_point_uid) do nothing;
    `;
  }
}

async function main() {
  try {
    await ensureTables();
    const orgId = await ensureOrganization();
    const docId = await ensureDocument(orgId);
    await ensureDataPoints(orgId, docId);
    console.log('✅ Seed complete. Demo organization and document are ready.');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
