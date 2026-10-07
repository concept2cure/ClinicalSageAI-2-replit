/** Existing deployed stores needed by the canonical lineage read predicates.
 * Spine-only fixtures formerly omitted both because their audit writer is a
 * seam. These columns model deployed audit JSON rather than a JSONB substitute.
 * No migration or production store is introduced by this test-only DDL. */
export const RECORDED_LINEAGE_STORES_DDL = `
  CREATE TABLE IF NOT EXISTS public.file_uploads (
    id text PRIMARY KEY, organization_id integer, user_id integer,
    original_name text, mime_type text, file_size bigint, storage_path text,
    checksum_sha256 text, status text, created_at timestamptz DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY, tenant_id integer, user_id integer, action text,
    table_name text, record_id text, actor_id integer, target text,
    target_type text, target_id text, payload_hash text, sha256_chain text,
    occurred_at timestamptz, hmac_seal text, new_values json, old_values json,
    ip_address text, user_agent text, reason text
  );
  CREATE INDEX IF NOT EXISTS test_audit_record_identity ON public.audit_logs(table_name,record_id);
`;
