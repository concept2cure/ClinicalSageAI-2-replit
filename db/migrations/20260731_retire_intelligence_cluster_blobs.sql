-- Retire the seed-only c2c_* blobs of the removed, unmounted Phase-11
-- "intelligence cluster".
--
-- The client cluster (client/src/concept2cure/intelligence/) was unmounted dead code
-- (nothing imported it; main.tsx → App never routed to it), and its only backend
-- (server/routes/intelligence-cluster.ts, the flat /api/intelligence protocol/cmc/
-- biostat/reports route) served nothing else — both are deleted in the same change.
-- These tables had NO live reader and NO real writer (seed-only; the ga-demo seeds that
-- touched them are to_regclass/tableExists-guarded and skip cleanly once the tables are
-- gone), so dropping them loses no real tenant data. The LIVE v2 biostat surfaces read
-- their own real stores (/api/ana-biostats/governed-documents → concept2cure_artifacts;
-- /api/statistical-defensibility; /api/biostat/assurance) and are unaffected.
--
-- See docs/architecture/C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md (Biostat = false-positive
-- Class-A). IF EXISTS so the migration is safe on any environment. FK-free by convention.

DROP TABLE IF EXISTS c2c_biostat_saps;
DROP TABLE IF EXISTS c2c_biostat_sample_sizes;
DROP TABLE IF EXISTS c2c_biostat_interims;
DROP TABLE IF EXISTS c2c_tlf_builds;
DROP TABLE IF EXISTS c2c_forecast_snapshots;
