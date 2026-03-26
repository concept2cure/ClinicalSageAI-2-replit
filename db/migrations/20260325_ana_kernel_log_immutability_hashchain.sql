-- AnA 1.0 RI: tamper-evident hash chain + append-only enforcement

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE ana_kernel_decision_log
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS entry_hash TEXT;

CREATE OR REPLACE FUNCTION ana_kernel_log_compute_hash()
RETURNS TRIGGER AS $$
DECLARE
  prev TEXT;
BEGIN
  SELECT entry_hash
    INTO prev
  FROM ana_kernel_decision_log
  ORDER BY id DESC
  LIMIT 1;

  NEW.prev_hash := prev;
  NEW.entry_hash := encode(
    digest(
      coalesce(prev, '') || '|' ||
      coalesce(NEW.request_id, '') || '|' ||
      coalesce(NEW.method, '') || '|' ||
      coalesce(NEW.path, '') || '|' ||
      coalesce(NEW.final_decision, '') || '|' ||
      coalesce(NEW.enforced_decision, '') || '|' ||
      coalesce(NEW.policy_bundle_id, '') || '|' ||
      coalesce(NEW.policy_bundle_version, '') || '|' ||
      coalesce(NEW.recorded_at::text, ''),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ana_kernel_log_compute_hash ON ana_kernel_decision_log;
CREATE TRIGGER trg_ana_kernel_log_compute_hash
BEFORE INSERT ON ana_kernel_decision_log
FOR EACH ROW EXECUTE FUNCTION ana_kernel_log_compute_hash();

CREATE OR REPLACE FUNCTION ana_kernel_log_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ana_kernel_decision_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ana_kernel_log_block_update ON ana_kernel_decision_log;
CREATE TRIGGER trg_ana_kernel_log_block_update
BEFORE UPDATE ON ana_kernel_decision_log
FOR EACH ROW EXECUTE FUNCTION ana_kernel_log_prevent_mutation();

DROP TRIGGER IF EXISTS trg_ana_kernel_log_block_delete ON ana_kernel_decision_log;
CREATE TRIGGER trg_ana_kernel_log_block_delete
BEFORE DELETE ON ana_kernel_decision_log
FOR EACH ROW EXECUTE FUNCTION ana_kernel_log_prevent_mutation();
