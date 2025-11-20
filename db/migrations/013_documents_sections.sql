-- CMC Documents and Sections tables for CMC document management
-- This supports the P.3 document generation and authoring workflow

create table if not exists cmc_documents (
  doc_id uuid primary key default gen_random_uuid(),
  title text not null,
  product_id text not null,
  type text default 'P3_MANUFACTURING',
  status text default 'DRAFT',
  version int default 1,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists cmc_sections (
  section_id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references cmc_documents(doc_id) on delete cascade,
  title text not null,
  path text not null,
  content_md text not null default '',
  section_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);