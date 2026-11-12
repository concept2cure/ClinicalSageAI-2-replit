-- P-92 C3 walk: two settlements FDA's verified answer contradicts, on the walk's throwaway database only (never against
-- FDA). Each answer is kept as keepContradictingReceipt (fda-esg-receipts.ts) writes it, with a body that says it is a
-- walk stand-in, not FDA's.
--   0001 (sequence 31, transmittal 1): released as not received in C2's walk; FDA's positive MDN kept against it.
--   0004: recorded as received on an Ack2 (shaped as C1's settlement leaves it); FDA's negative MDN kept against it.
-- Created by the project's author (user 16), so the signer (user 17) is independent of them. Run once.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM ectd_sequences WHERE transmit_signature_action_id = 'walk-p92-transmit-0004') THEN
    RAISE EXCEPTION 'the P-92 C3 walk seed has already run';
  END IF;
END $$;

UPDATE submission_transmittals
   SET metadata = jsonb_set(metadata, '{as2ReceiptHistory}', COALESCE(metadata->'as2ReceiptHistory', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'sha256', repeat('7', 64), 'bodyBase64', encode(convert_to('Walk stand-in for FDA''s signed MDN for sequence 0001: processed. Not an FDA document.', 'UTF8'), 'base64'),
         'contentType', 'message/disposition-notification', 'receivedAt', to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'verified', true, 'submittedBy', 16, 'source', 'agency-signed-upload', 'status', 'received', 'contradicts', 'not-received')))
 WHERE id = 1 AND metadata->'heldSendSettlement'->>'outcome' = 'not-received';

WITH s AS (
  INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, dispatch_status,
                              transmit_signature_action_id, transmit_attempt_id, organization_id, created_by)
  VALUES (18, 'fda', '0004', 'amendment', 'dispatched', 'sent', 'walk-p92-transmit-0004',
          'a92a0000-0000-4000-8000-000000000004', 2, 16)
  RETURNING id)
INSERT INTO submission_transmittals (organization_id, program_id, region, gateway, format, transport, bundle_sha256,
  bundle_size_bytes, transmission_id, status, submitted_by, submitted_at, metadata, created_at, updated_at)
SELECT 2, '95249590-7d36-442f-a317-211d243c52e1', 'fda', 'esg', 'ectd', 'as2', repeat('f', 64), 524288,
  '<reply-0004@intermediary.example>', 'ack2_received', 16, now() - interval '2 days',
  jsonb_build_object('environment', 'production', 'sequence', '0004',
    'as2', jsonb_build_object('messageId', '<walk-p92-0004@sponsor.example>', 'mic', 'bWljLXdhbGstNA==', 'environment', 'production'),
    'dispatchBinding', jsonb_build_object('organizationId', 2, 'sequenceId', s.id, 'signatureActionId', 'walk-p92-transmit-0004',
      'attemptId', 'a92a0000-0000-4000-8000-000000000004', 'bundleSha256', repeat('f', 64)),
    'heldSendSettlement', jsonb_build_object('outcome', 'received', 'kind', 'ack2', 'verified', false,
      'settledAt', to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'settledBy', 17,
      'signatureActionId', 'walk-p92-settle-0004', 'sequenceNumber', '0004',
      'sentAt', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'as2ReceiptHistory', jsonb_build_array(jsonb_build_object(
      'sha256', repeat('8', 64), 'bodyBase64', encode(convert_to('Walk stand-in for FDA''s signed MDN for sequence 0004: failed. Not an FDA document.', 'UTF8'), 'base64'),
      'contentType', 'message/disposition-notification', 'receivedAt', to_char(now() - interval '3 hours', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'verified', true, 'submittedBy', 16, 'source', 'agency-signed-upload', 'status', 'rejected', 'contradicts', 'received'))),
  now() - interval '2 days', now() - interval '1 day'
FROM s;

SELECT s.id, s.sequence_number, s.dispatch_status, t.id AS transmittal_id, t.status,
       t.metadata->'heldSendSettlement'->>'outcome' AS settled, jsonb_array_length(t.metadata->'as2ReceiptHistory') AS kept
  FROM ectd_sequences s JOIN submission_transmittals t ON t.metadata->'dispatchBinding'->>'sequenceId' = s.id::text
 WHERE s.submission_id = 18 AND s.sequence_number IN ('0001', '0004') ORDER BY s.sequence_number;
COMMIT;
