-- Support Administration Tables
-- Tickets, knowledge base articles, ticket messages, and org-level support settings
--
-- 2026-11-12 (P-127, package S13; docs/design/HELP_AND_SUPPORT_2026-11-10.md §3.4). Amended in place (RULE 1):
--   * This file joins C2C_MIGRATION_FILES (scripts/db/migration-set.mjs), above the tenant sweeps, so the support
--     tables reach every deployed database. Before, only install-fresh applied it. Every statement here is guarded
--     and replays.
--   * support_ticket_messages carried no tenant column, so no sweep could police it and every tenant's ticket
--     thread was readable by every other. It gains organization_id INTEGER NOT NULL, copied from its ticket on a
--     database that already holds rows, and a same-organisation key to its ticket (ticket_id, organization_id), so a
--     message can never sit in another organisation than its ticket. The integer sweep
--     (db/migrations/20260801_tenant_isolation_sweep.sql) then gives it the tenant policy, as it does the other
--     three tables here. Nothing is dropped.

-- Enums
DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM ('open', 'in_progress', 'waiting_on_customer', 'waiting_on_internal', 'escalated', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_category AS ENUM ('general', 'billing', 'technical', 'feature_request', 'bug_report', 'account', 'compliance', 'integration');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_article_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sequence for atomic ticket number generation (race-free, never reuses values)
CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq;

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  created_by_id INTEGER NOT NULL,
  assigned_to_id INTEGER,
  ticket_number VARCHAR(20) NOT NULL UNIQUE,
  subject VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'open',
  priority support_ticket_priority NOT NULL DEFAULT 'medium',
  category support_ticket_category NOT NULL DEFAULT 'general',
  tags JSON DEFAULT '[]',
  internal_notes TEXT,
  sla_response_due TIMESTAMP,
  sla_resolution_due TIMESTAMP,
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,
  satisfaction_rating INTEGER,
  satisfaction_feedback TEXT,
  metadata JSON DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by ON support_tickets(created_by_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);

-- Support Ticket Messages (thread replies)
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  ticket_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  attachments JSON DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_ticket_messages(ticket_id);

-- A database that applied the earlier shape of this file (install-fresh) has the table without its tenant column:
-- add it, copy each message's organisation from its ticket, and make it NOT NULL once no row lacks it. A message
-- whose ticket is gone has no organisation to inherit and stops the deploy here, rather than being left readable by
-- every tenant or deleted unseen.
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS organization_id INTEGER;
UPDATE support_ticket_messages m SET organization_id = t.organization_id
  FROM support_tickets t WHERE m.ticket_id = t.id AND m.organization_id IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM support_ticket_messages WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'support_ticket_messages: % row(s) have no ticket to take an organisation from',
      (SELECT count(*) FROM support_ticket_messages WHERE organization_id IS NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'support_ticket_messages' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
    ALTER TABLE support_ticket_messages ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_support_messages_org ON support_ticket_messages(organization_id);

-- The same-organisation key: a message belongs to a ticket of its own organisation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_tickets_id_org ON support_tickets(id, organization_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_ticket_messages_ticket_same_org') THEN
    ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_messages_ticket_same_org
      FOREIGN KEY (ticket_id, organization_id) REFERENCES support_tickets(id, organization_id) ON DELETE CASCADE;
  END IF;
END $$;

-- Knowledge Base Articles
CREATE TABLE IF NOT EXISTS support_articles (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  tags JSON DEFAULT '[]',
  status support_article_status NOT NULL DEFAULT 'draft',
  is_global BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  not_helpful_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_support_articles_org ON support_articles(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_articles_status ON support_articles(status);
CREATE INDEX IF NOT EXISTS idx_support_articles_category ON support_articles(category);

-- Support Settings (per organization)
CREATE TABLE IF NOT EXISTS support_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL UNIQUE,
  auto_assign_enabled BOOLEAN NOT NULL DEFAULT false,
  sla_response_hours INTEGER NOT NULL DEFAULT 24,
  sla_resolution_hours INTEGER NOT NULL DEFAULT 72,
  notify_on_new_ticket BOOLEAN NOT NULL DEFAULT true,
  notify_on_ticket_update BOOLEAN NOT NULL DEFAULT true,
  custom_categories JSON DEFAULT '[]',
  business_hours JSON,
  escalation_rules JSON DEFAULT '[]',
  satisfaction_survey_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
