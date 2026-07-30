-- DEPRECATED (GA convergence) — DO NOT USE. This seed-only blob is no longer
-- read or written. The v2 NdaCockpit "CTD readiness" panel (GET
-- /api/nda-cockpit/modules) is CONVERGED onto the REAL, org-scoped eCTD
-- submission core (submissions where application_type IN ('nda','bla') +
-- ectd_sequences + submission_leaves + coauthor_documents), assembled by
-- server/services/nda/nda-modules-view-assembler.ts — the same store the IND
-- checklist converged onto. The per-module pct/docs/open/gate roll-up is now
-- DERIVED from real coauthor authoring status, not stored here. The route no
-- longer queries this table, and scripts/seed/ga-demo.d/97-nda-cockpit.mjs now
-- seeds the real submission core instead of this blob. The table is retained
-- (not dropped) only so existing environments do not error on its absence.
--
-- Original purpose (historical):
-- NDA/BLA CTD module-readiness store — the per-module (M1–M5) completeness
-- roll-up backing the v2 NdaCockpit "CTD readiness" panel and its overall
-- % ready. The Module 1 admin worklist, PDUFA clock, and Refuse-to-File log
-- stay the surface's local-first interactive lists. Org-scoped, FK-free,
-- schema-only, idempotent.

CREATE TABLE IF NOT EXISTS c2c_nda_modules (
  organization_id   INTEGER NOT NULL,
  m                 TEXT    NOT NULL,   -- CTD module number, '1'..'5'
  label             TEXT,
  pct               INTEGER NOT NULL DEFAULT 0,
  docs              INTEGER NOT NULL DEFAULT 0,
  open_count        INTEGER NOT NULL DEFAULT 0,
  gate              TEXT,               -- the module's gating item, or NULL when clear
  PRIMARY KEY (organization_id, m)
);
