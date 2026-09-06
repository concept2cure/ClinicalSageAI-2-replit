-- ICH M7(R2) inputs on the impurity register.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- The register's 'mutagenic' class was refused by the Q3A/Q3B assessment as
-- out of scope and rendered as "governed instead by ICH M7" — while the M7
-- engine (services/mutagenic-impurity) that classifies an impurity into its
-- five classes and derives the acceptable intake sat unused beside it, because
-- the register captured none of its inputs.
--
-- The class is decided from the Ames result and the structural-alert status;
-- a Class 1-3 impurity is then limited by the TTC staged for the treatment
-- duration (120 µg/day up to a month … 1.5 µg/day for life), and a
-- cohort-of-concern structure (N-nitroso, aflatoxin-like, alkyl-azoxy) takes
-- a compound-specific limit far below that.
--
-- All nullable and NONE defaulted. An unrecorded Ames result is not a negative
-- one; the assessment refuses when an input it needs is absent.
--
-- Additive and idempotent.

ALTER TABLE cmc_impurity_profiles
  ADD COLUMN IF NOT EXISTS ames_result text,
  ADD COLUMN IF NOT EXISTS structural_alert text,
  ADD COLUMN IF NOT EXISTS carcinogenicity_data text,
  ADD COLUMN IF NOT EXISTS treatment_duration text,
  ADD COLUMN IF NOT EXISTS cohort_of_concern text;
