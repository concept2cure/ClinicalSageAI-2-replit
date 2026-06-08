-- Durable backing store for the general-purpose application audit logger
-- (server/services/audit/auditLogger.ts), which previously wrote only to an
-- in-memory array (lost on restart, not queryable — PRODUCT_QC_REVIEW Part 11 #4).
--
-- The hash-chained `audit_events` table remains the canonical, tamper-evident
-- regulated-RECORD trail; this table holds general application/security/access
-- events (logins, data access, exports, security events) durably and queryably.
-- Identifiers are text to match the logger's API faithfully (no lossy FK coercion).

CREATE TABLE IF NOT EXISTS application_audit_log (
  id              text PRIMARY KEY,
  organization_id text NOT NULL,
  user_id         text NOT NULL,
  category        text NOT NULL,
  severity        text NOT NULL,
  action          text NOT NULL,
  resource_type   text,
  resource_id     text,
  previous_value  json,
  new_value       json,
  metadata        json,
  ip_address      text,
  user_agent      text,
  success         boolean NOT NULL,
  error_message   text,
  event_timestamp timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_audit_org_idx ON application_audit_log (organization_id);
CREATE INDEX IF NOT EXISTS application_audit_resource_idx ON application_audit_log (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS application_audit_category_idx ON application_audit_log (category);
CREATE INDEX IF NOT EXISTS application_audit_timestamp_idx ON application_audit_log (event_timestamp);
