-- P-99 C2 walk: a send the platform kept the bytes of and nothing on record of what it carried, on the walk's throwaway
-- database only (never against an agency). The package is a real one from the canonical packager, kept in the app's own
-- store by keep-package.ts (as the transmit guard keeps a sent package); its documents are labelled walk stand-ins.
-- A preview compile carries a document the send did not ('phantom-draft.pdf'), so the sequence reads from its compiles.
-- Created by the project's author (user 16). Run once.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM submissions WHERE title = 'P-99 C2 walk: a send with its bytes kept') THEN RAISE EXCEPTION 'the P-99 C2 walk seed has already run'; END IF;
END $$;
WITH sub AS (
  INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, program_id)
  VALUES ('P-99 C2 walk: a send with its bytes kept', 'ind', 'biotech', 'fda', 2, 16, '95249590-7d36-442f-a317-211d243c52e1') RETURNING id
), seq AS (
  INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, dispatch_status, transmit_signature_action_id, transmit_attempt_id, organization_id, created_by)
  SELECT id, 'fda', '0000', 'original', 'dispatched', 'sent', 'walk-p99-transmit-0000', 'a99c2000-0000-4000-8000-000000000000', 2, 16 FROM sub RETURNING id, submission_id
), tx AS (
  INSERT INTO submission_transmittals (organization_id, program_id, region, gateway, format, transport, bundle_sha256, bundle_size_bytes, transmission_id, status, submitted_by, submitted_at, metadata)
  SELECT 2, '95249590-7d36-442f-a317-211d243c52e1', 'fda', 'esg', 'ectd', 'as2', 'bd6b633f503a8edcff5ff85cbbdf3848d6006a66e8d4d74aa0bff1a6ef9fdf94', (('{"storageVersionId":"47b7a5c4-bf67-41cd-aa12-2a4fcc85c324","provider":"local","sha256":"bd6b633f503a8edcff5ff85cbbdf3848d6006a66e8d4d74aa0bff1a6ef9fdf94","sizeBytes":5256,"filename":"fda-esg-bd6b633f503a8edcff5ff85cbbdf3848d6006a66e8d4d74aa0bff1a6ef9fdf94.zip"}')::jsonb->>'sizeBytes')::bigint,
    '<reply-p99-0000@intermediary.example>', 'received', 16, now() - interval '20 days',
    jsonb_build_object('environment', 'production', 'sequence', '0000', 'applicationId', 'IND000512',
      'dispatchBinding', jsonb_build_object('organizationId', 2, 'sequenceId', seq.id, 'signatureActionId', 'walk-p99-transmit-0000', 'attemptId', 'a99c2000-0000-4000-8000-000000000000', 'bundleSha256', 'bd6b633f503a8edcff5ff85cbbdf3848d6006a66e8d4d74aa0bff1a6ef9fdf94'),
      'sentPackage', '{"storageVersionId":"47b7a5c4-bf67-41cd-aa12-2a4fcc85c324","provider":"local","sha256":"bd6b633f503a8edcff5ff85cbbdf3848d6006a66e8d4d74aa0bff1a6ef9fdf94","sizeBytes":5256,"filename":"fda-esg-bd6b633f503a8edcff5ff85cbbdf3848d6006a66e8d4d74aa0bff1a6ef9fdf94.zip"}'::jsonb)
  FROM seq RETURNING id
)
INSERT INTO ectd_compilations (organization_id, compilation_name, compilation_type, status, application_number, sequence_number, leaf_manifest, submission_id, compiled_at)
SELECT 2, 'P-99 C2 walk preview of 0000', 'module', 'completed', 'IND 000512', '0000',
  '[{"ctdSection":"2.5","fileName":"phantom-draft.pdf","href":"m2/2-5/phantom-draft.pdf","md5":"99999999999999999999999999999999","operation":"new","title":"A draft the send did not carry (walk stand-in)"}]'::json,
  seq.submission_id, now() - interval '25 days' FROM seq;
SELECT s.id AS submission_id, q.id AS sequence_id, q.sequence_number, q.dispatch_status FROM submissions s JOIN ectd_sequences q ON q.submission_id = s.id
 WHERE s.title = 'P-99 C2 walk: a send with its bytes kept';
COMMIT;
