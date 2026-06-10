-- Migration: 20260604_shadow_review
-- Purpose:  Shadow Review (the moat, spec §6.5/§8.1). Stores a simulated-reviewer
--           run over an assembled (pre-dispatch) sequence and its severity-scored
--           RTF/CRL/format/NB findings, each with a regulatory basis + a fix.
--
-- Conventions: SERIAL int PKs, the 6 mandatory columns, every FK indexed.
-- snake_case here matches camelCase in shared/schema/shadow-review.ts.

-- Up:

-- ── shadow_review_runs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shadow_review_runs (
  id               SERIAL PRIMARY KEY,
  sequence_id      INTEGER NOT NULL REFERENCES public.ectd_sequences(id),
  region           TEXT NOT NULL,                       -- fda|eu|jp
  lens             TEXT NOT NULL DEFAULT 'fda_filing',  -- fda_filing|ema_d120|pmda|nb_mdr|nb_ivdr
  model            TEXT,
  prompt_version   TEXT,
  status           TEXT NOT NULL DEFAULT 'running',     -- running|complete|failed
  rtf_risk_score   REAL,                                -- 0..1 refuse-to-file risk
  crl_risk_score   REAL,                                -- 0..1 complete-response risk
  summary          TEXT,
  organization_id  INTEGER NOT NULL REFERENCES public.organizations(id),
  created_by       INTEGER NOT NULL REFERENCES public.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shadow_runs_sequence_id     ON public.shadow_review_runs(sequence_id);
CREATE INDEX IF NOT EXISTS idx_shadow_runs_organization_id ON public.shadow_review_runs(organization_id);

-- ── shadow_review_findings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shadow_review_findings (
  id               SERIAL PRIMARY KEY,
  run_id           INTEGER NOT NULL REFERENCES public.shadow_review_runs(id),
  dimension        TEXT NOT NULL,                       -- rtf|crl|format|nb
  severity         TEXT NOT NULL,                       -- critical|major|minor|info
  title            TEXT NOT NULL,
  detail           TEXT,
  basis            TEXT,                                -- CFR/ICH/guidance citation
  recommendation   TEXT,                                -- concrete fix
  leaf_ref         TEXT,                                -- section code / leaf the finding targets
  status           TEXT NOT NULL DEFAULT 'open',        -- open|accepted|fixed|waived
  organization_id  INTEGER NOT NULL REFERENCES public.organizations(id),
  created_by       INTEGER NOT NULL REFERENCES public.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shadow_findings_run_id          ON public.shadow_review_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_shadow_findings_organization_id ON public.shadow_review_findings(organization_id);

-- Down:
-- DROP TABLE IF EXISTS public.shadow_review_findings;
-- DROP TABLE IF EXISTS public.shadow_review_runs;
