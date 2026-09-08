-- 20260908_drug_substance_biologic_origin.sql
--
-- §3.2.A.2 (Adventitious Agents Safety Evaluation) had no inputs.
--
-- The section's generator reads `modality`, `biologicalOrigin`, `sourceOrganism`,
-- `cellLine`, `viralSafetyEvaluation` and `tseStatus`. No table held any of
-- them, so for a biologic the section was composed from a name: it asserted a
-- three-part control strategy, in-process adventitious-agent testing, viral
-- clearance steps and cell-bank characterisation, read from nothing, and scored
-- 100% because it carried no fail-closed marker.
--
-- The generator is now honest — it states what is recorded and marks the rest
-- NOT ESTABLISHED — which leaves a biologics programme unable to complete
-- §3.2.A.2 at all until the register can hold the answer. These six columns are
-- that answer. All nullable and additive: a small-molecule programme records
-- none of them and its §3.2.A.2 takes the chemical branch as before.
ALTER TABLE drug_substances ADD COLUMN IF NOT EXISTS modality TEXT;
ALTER TABLE drug_substances ADD COLUMN IF NOT EXISTS biological_origin TEXT;
ALTER TABLE drug_substances ADD COLUMN IF NOT EXISTS source_organism TEXT;
ALTER TABLE drug_substances ADD COLUMN IF NOT EXISTS cell_line TEXT;
ALTER TABLE drug_substances ADD COLUMN IF NOT EXISTS viral_safety_evaluation TEXT;
ALTER TABLE drug_substances ADD COLUMN IF NOT EXISTS tse_status TEXT;
