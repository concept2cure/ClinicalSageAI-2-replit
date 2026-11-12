-- P-92 C4 walk, second case: a production send to FDA recorded as received on FDA's verified MDN, on the walk's throwaway
-- database only (never against FDA). Shaped as the receipt path leaves it (fda-esg-receipts.ts): the sequence 'sent' with
-- its claim (signature S, attempt A) kept, and the one transmittal bound to (S, A) in production, 'received', its
-- verified MDN kept. Created by the project's author (user 16), so the signer (user 17) is independent of them. It is
-- walked after the fix that leaves the gateway's error columns alone (red-error-message.txt).
-- Run as the database owner, once; it refuses to run twice.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM ectd_sequences WHERE transmit_signature_action_id = 'walk-p92-transmit-0003') THEN
    RAISE EXCEPTION 'the P-92 C4 walk seed has already run';
  END IF;
END $$;

WITH s AS (
  INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, dispatch_status,
                              transmit_signature_action_id, transmit_attempt_id, organization_id, created_by)
  VALUES (18, 'fda', '0003', 'amendment', 'dispatched', 'sent', 'walk-p92-transmit-0003',
          'a92a0000-0000-4000-8000-000000000003', 2, 16)
  RETURNING id)
INSERT INTO submission_transmittals (organization_id, program_id, region, gateway, format, transport, bundle_sha256,
  bundle_size_bytes, transmission_id, status, submitted_by, submitted_at, ack_received_at, metadata, created_at, updated_at)
SELECT 2, '95249590-7d36-442f-a317-211d243c52e1', 'fda', 'esg', 'ectd', 'as2', repeat('d', 64), 524288,
  '<walk-p92-0003@sponsor.example>', 'received', 16, now() - interval '1 day', now() - interval '23 hours',
  jsonb_build_object('environment', 'production', 'sequence', '0003',
    'as2', jsonb_build_object('messageId', '<walk-p92-0003@sponsor.example>', 'mic', 'bWljLXdhbGstMw==', 'environment', 'production'),
    'as2Receipt', jsonb_build_object('verified', true, 'status', 'received', 'sha256', repeat('e', 64), 'source', 'agency-signed-upload'),
    'dispatchBinding', jsonb_build_object('organizationId', 2, 'sequenceId', s.id,
      'signatureActionId', 'walk-p92-transmit-0003', 'attemptId', 'a92a0000-0000-4000-8000-000000000003',
      'bundleSha256', repeat('d', 64))),
  now() - interval '1 day', now() - interval '23 hours'
FROM s;

SELECT s.id, s.sequence_number, s.dispatch_status, t.id AS transmittal_id, t.status, t.error_message
  FROM ectd_sequences s JOIN submission_transmittals t ON t.metadata->'dispatchBinding'->>'sequenceId' = s.id::text
 WHERE s.transmit_signature_action_id = 'walk-p92-transmit-0003';
COMMIT;
