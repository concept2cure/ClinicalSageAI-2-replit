-- BP-W1-5: "MAA / non-US Module 1" was one catalog entry pretending Module 1
-- is one thing. Module 1 is regional by definition — FDA, EMA, Health Canada,
-- PMDA, TGA, MHRA, Swissmedic and NMPA each mandate their own forms,
-- administrative structure and envelope metadata — and the surface behind this
-- row is already a per-agency checklist over the regional-module1-requirements
-- engine (which now also models Swissmedic). The name and description say so.
--
-- Name + description only. No module is added, removed, re-priced or
-- re-categorised, so no entitlement changes. Idempotent.

UPDATE available_modules
SET name = 'MAA Module 1 (Regional)',
    description = 'Regional marketing-application administrative module (eCTD Module 1) — per-agency required-component checklist for EMA, PMDA, MHRA, TGA, Health Canada, Swissmedic and NMPA over the regional Module 1 requirements engine.'
WHERE module_id = 'maa-cockpit';

-- ROLLBACK
-- UPDATE available_modules
-- SET name = 'MAA / non-US Module 1',
--     description = 'Non-US marketing-application administrative module (eCTD Module 1) — region-accurate required-component checklist for EMA/PMDA/MHRA/TGA/HC/NMPA over the global-RI regional-module1-requirements engine.'
-- WHERE module_id = 'maa-cockpit';
