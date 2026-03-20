-- Support Administration Tables
-- Tickets, knowledge base articles, ticket messages, and org-level support settings

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
  ticket_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  attachments JSON DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_ticket_messages(ticket_id);

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
