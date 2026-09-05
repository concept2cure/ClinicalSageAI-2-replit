-- The route of administration on the impurity register — what ICH Q3D needs.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- Q3D(R2) sets a DIFFERENT permitted daily exposure per route, and the spread
-- is large: cadmium is 5 µg/day oral against 2 parenteral, vanadium 100 oral
-- against 1 by inhalation. Without the route there is no limit to compare a
-- recorded level to.
--
-- The classifier that existed before this change read `route || 'oral'`, so a
-- record with no route was assessed against the oral PDE — the most permissive
-- of the three for most elements. That default is deleted; the assessment now
-- refuses when the route is unrecorded. This column is what lets a staffer
-- answer instead of being refused.
--
-- Nullable on purpose: an organic impurity or a residual solvent does not need
-- it, and a Q3D assessment refuses honestly when it is absent rather than
-- pretending the column has a default the product knows.
--
-- Additive and idempotent.

ALTER TABLE cmc_impurity_profiles
  ADD COLUMN IF NOT EXISTS route_of_administration text;
