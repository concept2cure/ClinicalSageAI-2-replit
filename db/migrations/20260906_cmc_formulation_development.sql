-- Formulation development on the formulation register — what §3.2.P.2.2 reads.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- §3.2.P.2 requires `formulationDevelopment`, and no register captured it:
-- the section could never complete, and the composed text carried a blank
-- "Formulation Development" row over a formulation whose rationale the
-- staffer had nowhere to record. The formulation record is where that
-- narrative belongs (ICH Q8: the development of the formulation, the choice of
-- components and the overages, with reference to the QTPP).
--
-- Nullable and not defaulted: a formulation with no recorded development
-- rationale leaves §3.2.P.2 honestly incomplete.
--
-- Additive and idempotent.

ALTER TABLE cmc_formulation_records
  ADD COLUMN IF NOT EXISTS formulation_development text;
