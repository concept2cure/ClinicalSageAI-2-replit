-- Source messages (IR letters, agency emails)
create table if not exists reg_messages (
  msg_id uuid primary key default gen_random_uuid(),
  sub_id uuid,                               -- optional link to a submission
  subject text,
  from_addr text,
  to_addrs text,
  date_received timestamptz default now(),
  raw_text text,                              -- normalized text body
  html_snippet text,
  headers_json jsonb not null default '{}'::jsonb
);
create index if not exists idx_reg_messages_sub on reg_messages(sub_id, date_received desc);

-- Attachments (metadata; file storage delegated to Drive/S3/etc.)
create table if not exists reg_attachments (
  att_id uuid primary key default gen_random_uuid(),
  msg_id uuid references reg_messages(msg_id) on delete cascade,
  filename text,
  mime text,
  size_bytes int,
  href text,                                  -- where the file lives (drive link, signed url, etc.)
  text_preview text                            -- optional extracted text
);

-- Extend reg_questions for IR-specific fields
alter table reg_questions
  add column if not exists source_msg_id uuid references reg_messages(msg_id) on delete set null,
  add column if not exists region text,                 -- 'FDA','EMA','PMDA',...
  add column if not exists priority text default 'High',-- High by default for IRs
  add column if not exists section_suggest text,        -- AI/heuristic mapping to 3.2.P.x
  add column if not exists extracted_due_src text,      -- raw string where due was found
  add column if not exists created_by text;

-- Extend reg_responses with approval + style
alter table reg_responses
  add column if not exists approver text,
  add column if not exists approved_at timestamptz,
  add column if not exists sign_hash text,
  add column if not exists style text,                  -- 'FDA','EMA' tone presets
  add column if not exists region text;

-- Lightweight sign-off table (Part 11-lite)
create table if not exists reg_signoffs (
  sign_id uuid primary key default gen_random_uuid(),
  entity text not null,                -- 'RESPONSE'
  entity_id uuid not null,             -- reg_responses.resp_id
  signer text not null,
  role text not null,                  -- 'Reg Lead','QA','CMC Head'
  hash text not null,
  created_at timestamptz default now()
);
create index if not exists idx_reg_signoffs_entity on reg_signoffs(entity, entity_id);

-- Optional: link a response leaf directly to M3 for traceability
alter table reg_m3_leaves
  add column if not exists related_q_id uuid;           -- reg_questions.q_id