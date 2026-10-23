-- W5 / D7, MR-10 CAT2-02 identity integration, 2026-10-21.
-- Connect a program to the EXISTING ind_sponsors registry. DUNS/contact facts
-- remain there; copying them onto programs would create competing authorities.
--
-- RULE 1 replay safety: additive column/index and absent-constraint guard. The
-- deployment set runs this after 20260609_ind_master_data.sql and before the
-- final tenant sweeps. Existing programs remain unbound; no applicant is guessed.
-- Public integer organization_id is already tenant-swept on both existing tables.
-- Same-tenant FK prevents every writer, including direct SQL, from selecting a
-- different tenant's sponsor. Deleting a registry row clears only its nullable
-- binding, never organization_id; FDA readiness then refuses the missing facts.

DO $migration$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('public.ind_sponsors') IS NULL THEN
    RAISE EXCEPTION 'Applicant binding requires the existing ind_sponsors registry';
  END IF;

  ALTER TABLE public.regulatory_programs
    ADD COLUMN IF NOT EXISTS applicant_sponsor_id UUID;

  CREATE UNIQUE INDEX IF NOT EXISTS ind_sponsors_id_org_uq
    ON public.ind_sponsors (id, organization_id);
  CREATE INDEX IF NOT EXISTS regulatory_programs_applicant_sponsor_org_idx
    ON public.regulatory_programs (applicant_sponsor_id, organization_id)
    WHERE applicant_sponsor_id IS NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.regulatory_programs'::regclass
        AND conname = 'regulatory_programs_applicant_sponsor_same_org_fk'
  ) THEN
    ALTER TABLE public.regulatory_programs
      ADD CONSTRAINT regulatory_programs_applicant_sponsor_same_org_fk
      FOREIGN KEY (applicant_sponsor_id, organization_id)
      REFERENCES public.ind_sponsors (id, organization_id)
      ON DELETE SET NULL (applicant_sponsor_id);
  END IF;
END
$migration$;
