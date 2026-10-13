-- 20261012b_regulatory_programs_eu_device_classes.sql
--
-- The European classification of a device or a diagnostic, held on the
-- programme (founder's directive of 2026-10-12; task #15 follow-up).
--
-- `regulatory_programs.device_class` is the US 21 CFR 860 class, and the eSTAR
-- administrative-data projection and the 510(k) surfaces print it on a US
-- form. No column held the MDR or the IVDR class, so a European device
-- programme could be configured in every respect EXCEPT its own
-- classification: AnA's project-setup interview asks it (`eu_mdr_class`,
-- `ivdr_class`), the Annex VIII rule engine derives it, the conformity routes
-- are offered from it — and the record then had nowhere to keep the answer.
-- The projection reported it unprojected, by name, which is what made the gap
-- visible rather than silent
-- (docs/evidence/ANA-QUESTIONS/2026-10-12-project-setup-commits/).
--
-- Two columns, not one. A device is classified under the MDR and a diagnostic
-- under the IVDR; they are different regulations with different class
-- vocabularies (MDR: I, Is, Im, Ir, IIa, IIb, III — the seven a sponsor
-- DECLARES; IVDR: A, B, C, D), and one column holding either would mean every
-- reader asking which regulation the value came from.
--
-- The regulator is in the name, unlike `device_class`. That column stays as it
-- is: it is read by the eSTAR projection, the 510(k) device routes and the
-- standards-applicability service, and renaming it is a change that owes a
-- reachable replacement by path (CLAUDE.md working agreement), not a column
-- addition.
--
-- Nullable on purpose, and NULL carries a real meaning the interview already
-- offers: "Not applicable / No EU filing planned". NULL is "not stated or not
-- applicable", nothing is defaulted, and a reader reports it blank.
--
-- No CHECK constraint. The two vocabularies are
-- shared/regulatory/device-class.ts's (MDR_DECLARED_CLASSES, IVDR_CLASSES) and
-- the write validates against them; a CHECK copied into SQL would be a second
-- list that drifts from the first — and under CLAUDE.md RULE 1 a constraint a
-- later file also defines is the replay hazard that rule exists for.
--
-- Replay-safe (RULE 1): additive and IF NOT EXISTS; re-running is a no-op.
-- regulatory_programs is public with organization_id INTEGER NOT NULL
-- (20260524_program_workbench_schema.sql), so the tenant sweeps already cover
-- it. No data migration: existing programmes simply have stated neither.

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS eu_mdr_class TEXT;

ALTER TABLE regulatory_programs
  ADD COLUMN IF NOT EXISTS eu_ivdr_class TEXT;

COMMENT ON COLUMN regulatory_programs.eu_mdr_class IS
  'MDR (EU) 2017/745 Annex VIII class as the sponsor declares it: I, Is, Im, Ir, IIa, IIb or III. NULL = not stated or no EU filing planned; never defaulted. Distinct from device_class, which is the US 21 CFR 860 class.';

COMMENT ON COLUMN regulatory_programs.eu_ivdr_class IS
  'IVDR (EU) 2017/746 Annex VIII class: A, B, C or D. NULL = not stated or no EU filing planned; never defaulted.';
