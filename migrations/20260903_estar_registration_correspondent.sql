-- Correspondent and Declaration of Conformity facts live on the eSTAR registration.
--
-- The official FDA eSTAR's Correspondent Information section and its
-- Declaration of Conformity page ask for facts about the ORGANIZATION that
-- files: who FDA corresponds with (company, e-mail, telephone) and the
-- company address the declaration is signed under. The platform held none of
-- them, so the eSTAR administrative-data projection declared those keys
-- user-supplied only and every export left them blank unless the caller
-- typed them into the request.
--
-- An organization registers for eSTAR once and files many submissions, and
-- its correspondent does not change per device — so these belong on the
-- org's single estar_registrations row (unique organization_id), beside the
-- other org-level filing identifiers (ESG account, DUNS, FEI). Real columns,
-- not the notes field: the projection names them as governed sources
-- (estar_registrations.<column>) with per-field provenance, and the
-- registration write is audited like every other change to the row.
--
-- correspondent_* match the VARCHAR widths of the existing contact columns
-- (cdrh_portal_email is VARCHAR(256)); the address is TEXT because it is
-- multi-line. All nullable: a registration that has not recorded a fact
-- reports it blank.
--
-- One ALTER per column, so the model-vs-migration agreement guard
-- (scripts/ci/check-model-migration-agreement.mjs) sees each column it
-- reconciles. Additive + idempotent: safe to re-run, and safe against an
-- existing table with rows (existing registrations simply have NULLs until
-- they are set).

ALTER TABLE estar_registrations
  ADD COLUMN IF NOT EXISTS correspondent_company_name VARCHAR(256);

ALTER TABLE estar_registrations
  ADD COLUMN IF NOT EXISTS correspondent_contact_email VARCHAR(256);

ALTER TABLE estar_registrations
  ADD COLUMN IF NOT EXISTS correspondent_telephone VARCHAR(64);

ALTER TABLE estar_registrations
  ADD COLUMN IF NOT EXISTS declaration_company_address TEXT;
