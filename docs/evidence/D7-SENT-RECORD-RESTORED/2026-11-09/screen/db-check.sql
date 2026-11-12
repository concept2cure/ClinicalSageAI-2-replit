-- P-99 C2 walk: what is on record for sequence 36 (submission 20), read-only, on the walk's throwaway database.
\pset footer off
SELECT q.id, q.sequence_number, q.dispatch_status, q.updated_at FROM ectd_sequences q WHERE q.id = 36;
SELECT t.id AS transmittal, t.metadata ? 'leafManifest' AS has_leaf_manifest,
       jsonb_array_length(COALESCE(t.metadata->'leafManifest', '[]'::jsonb)) AS leaves,
       t.metadata->'leafManifestDerivation'->>'method' AS method,
       t.metadata->'leafManifestDerivation'->>'version' AS version,
       t.metadata->'leafManifestDerivation'->>'manifestSha256' AS manifest_sha256,
       t.metadata->'leafManifestDerivation'->>'derivedBy' AS derived_by,
       t.metadata->'leafManifestDerivation'->'notRecoverable' AS not_recoverable,
       t.metadata ? 'restoredBinding' AS has_restored_binding
  FROM submission_transmittals t WHERE t.metadata->'dispatchBinding'->>'sequenceId' = '36';
SELECT jsonb_agg(l->>'ctdSection' || ' · ' || (l->>'fileName') || ' · ' || (l->>'operation') ORDER BY l->>'ctdSection') AS recorded
  FROM submission_transmittals t, jsonb_array_elements(COALESCE(t.metadata->'leafManifest', '[]'::jsonb)) l
 WHERE t.metadata->'dispatchBinding'->>'sequenceId' = '36';
SELECT a.action, a.user_id, a.record_id, a.reason, a.new_values::jsonb->>'manifestSha256' AS manifest_sha256,
       a.new_values::jsonb->>'leafCount' AS leaf_count, a.new_values::jsonb->>'method' AS method, a.new_values::jsonb->>'methodVersion' AS method_version,
       a.sha256_chain IS NOT NULL AS chained, a.hmac_seal IS NOT NULL AS sealed, a.created_at
  FROM audit_logs a WHERE a.action = 'ECTD_SENT_RECORD_REDERIVED' ORDER BY a.created_at;
