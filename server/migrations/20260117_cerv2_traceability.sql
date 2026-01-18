-- CERv2 Sprint 2: Traceability Spine
-- Claims table + needs_review impact flags for standards/outcomes

create extension if not exists "pgcrypto";

create table if not exists cerv2_claims (
  id serial primary key,
  organization_id integer not null,
  program_id text not null,
  claim_id text not null,
  claim_type text not null default 'other',
  claim_text text not null,
  rationale text,
  status text not null default 'draft',
  needs_review boolean not null default false,
  last_impacted_at timestamptz,
  owner text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cerv2_claims_unique
  on cerv2_claims (organization_id, program_id, claim_id);
create index if not exists cerv2_claims_org_program_idx
  on cerv2_claims (organization_id, program_id);
create index if not exists cerv2_claims_needs_review_idx
  on cerv2_claims (program_id, needs_review);

alter table cerv2_standards
  add column if not exists needs_review boolean not null default false,
  add column if not exists last_impacted_at timestamptz;

create index if not exists cerv2_standards_needs_review_idx
  on cerv2_standards (program_id, needs_review);

alter table cerv2_outcomes
  add column if not exists needs_review boolean not null default false,
  add column if not exists last_impacted_at timestamptz;

create index if not exists cerv2_outcomes_needs_review_idx
  on cerv2_outcomes (program_id, needs_review);