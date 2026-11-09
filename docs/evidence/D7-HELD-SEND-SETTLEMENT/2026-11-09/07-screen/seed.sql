-- P-92 C2 walk: two held production sends to FDA, on the walk's throwaway database only (never against FDA).
--
-- Shaped as the gateway leaves them (fda-esg.ts) and as held-send-settlement.pglite.test.ts builds them: a sequence
-- 'dispatched' and 'transmitting', claimed by a transmit signature S and attempt A, and the one transmittal bound to
-- (S, A) in production. Created by the project's author (user 16), so the signer (user 17) is independent of them.
--   0001: an AS2 send whose AS2 message was never formed (the platform's own proof that nothing left, E9).
--   0002: an AS2 send that left, with FDA's endpoint answering 502 (FDA may hold it): settled on FDA's documents.
-- Run as the database owner, once; it refuses to run twice.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM ectd_sequences WHERE transmit_signature_action_id LIKE 'walk-p92-%') THEN
    RAISE EXCEPTION 'the P-92 walk seed has already run';
  END IF;
END $$;

WITH s AS (
  INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, dispatch_status,
                              transmit_signature_action_id, transmit_attempt_id, organization_id, created_by)
  VALUES (18, 'fda', '0001', 'amendment', 'dispatched', 'transmitting', 'walk-p92-transmit-0001',
          'a92a0000-0000-4000-8000-000000000001', 2, 16)
  RETURNING id)
INSERT INTO submission_transmittals (organization_id, program_id, region, gateway, format, transport, bundle_sha256,
  bundle_size_bytes, status, error_class, error_message, submitted_by, submitted_at, metadata, created_at, updated_at)
SELECT 2, '95249590-7d36-442f-a317-211d243c52e1', 'fda', 'esg', 'ectd', 'as2', repeat('a', 64), 524288, 'rejected',
  'gateway', 'The AS2 message could not be prepared for this send; nothing was transmitted.', 16,
  now() - interval '2 days',
  jsonb_build_object('environment', 'production', 'sequence', '0001', 'dispatchBinding', jsonb_build_object(
    'organizationId', 2, 'sequenceId', s.id, 'signatureActionId', 'walk-p92-transmit-0001',
    'attemptId', 'a92a0000-0000-4000-8000-000000000001', 'bundleSha256', repeat('a', 64))),
  now() - interval '2 days', now() - interval '2 days'
FROM s;

WITH s AS (
  INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, dispatch_status,
                              transmit_signature_action_id, transmit_attempt_id, organization_id, created_by)
  VALUES (18, 'fda', '0002', 'amendment', 'dispatched', 'transmitting', 'walk-p92-transmit-0002',
          'a92a0000-0000-4000-8000-000000000002', 2, 16)
  RETURNING id)
INSERT INTO submission_transmittals (organization_id, program_id, region, gateway, format, transport, bundle_sha256,
  bundle_size_bytes, transmission_id, http_status, status, error_class, error_message, submitted_by, submitted_at,
  metadata, created_at, updated_at)
SELECT 2, '95249590-7d36-442f-a317-211d243c52e1', 'fda', 'esg', 'ectd', 'as2', repeat('b', 64), 524288,
  '<reply-0002@intermediary.example>', 502, 'in_transit', 'transport',
  'FDA ESG AS2 returned HTTP 502 after the whole bundle was sent; FDA may hold it.', 16, now() - interval '2 days',
  jsonb_build_object('environment', 'production', 'sequence', '0002',
    'as2', jsonb_build_object('messageId', '<walk-p92-0002@sponsor.example>', 'mic', 'bWljLXdhbGs=', 'environment', 'production'),
    'dispatchBinding', jsonb_build_object('organizationId', 2, 'sequenceId', s.id,
      'signatureActionId', 'walk-p92-transmit-0002', 'attemptId', 'a92a0000-0000-4000-8000-000000000002',
      'bundleSha256', repeat('b', 64))),
  now() - interval '2 days', now() - interval '1 day'
FROM s;

SELECT s.id, s.sequence_number, s.dispatch_status, t.id AS transmittal_id, t.status, t.transport
  FROM ectd_sequences s JOIN submission_transmittals t ON t.metadata->'dispatchBinding'->>'sequenceId' = s.id::text
 WHERE s.transmit_signature_action_id LIKE 'walk-p92-%' ORDER BY s.sequence_number;
COMMIT;
