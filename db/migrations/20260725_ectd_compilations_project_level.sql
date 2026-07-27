-- Allow PROJECT-level eCTD compilations to be recorded (ledger C-16).
--
-- POST /api/ectd-compile/:projectId/compile compiles a whole project — every
-- module at once — and then records the run in ectd_compilations. It never
-- could: the table declares
--
--     module_id   integer NOT NULL   (FK -> ectd_modules)
--     compiled_by integer NOT NULL
--
-- and a project-level compilation has no single module to point at. The insert
-- is wrapped in a catch whose comment blames a missing table, so every
-- compilation was silently unrecorded and GET /:projectId/history was
-- permanently empty.
--
-- Both columns become nullable. This is a widening change: every existing row
-- stays valid, and the per-module writer (server/services/ectdExportService.ts)
-- keeps supplying both. compiled_by is relaxed for the same reason —
-- service-initiated compilations have no interactive user, and the one writer
-- that populated it used a hardcoded `1`, which is not attribution.
--
-- Mirrored in shared/schema.ts (the drizzle push surface) so the two paths agree.
--
-- Rollback (only safe while no project-level rows exist):
--   ALTER TABLE ectd_compilations ALTER COLUMN module_id SET NOT NULL;
--   ALTER TABLE ectd_compilations ALTER COLUMN compiled_by SET NOT NULL;

ALTER TABLE IF EXISTS ectd_compilations ALTER COLUMN module_id DROP NOT NULL;
ALTER TABLE IF EXISTS ectd_compilations ALTER COLUMN compiled_by DROP NOT NULL;
