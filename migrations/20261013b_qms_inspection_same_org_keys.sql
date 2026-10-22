-- 2026-10-13 W1/D2: hold QMS, labeling and inspection parent links to their
-- recorded organization. RLS scopes each row, but a bare parent-id FK does
-- not prove the parent belongs to that organization.
--
-- Existing foreign/missing parentage fails this migration with a named record
-- requiring reconciliation. Nothing is deleted, relabeled or hidden; no
-- unvalidated constraint is presented as protecting retained history.
-- User ids remain global forensic actor identities, not current-membership
-- foreign keys that would erase history or block legitimate offboarding.
-- Untyped artifact-id columns are not guessed into a different identity store.
--
-- Replay-safe: validated keys are added only when absent, parent indexes use
-- canonical names, no DROP and no row updates. New composite keys use NO ACTION;
-- they introduce no cascading across organization boundaries.

BEGIN;

DO $parentage_preflight$
DECLARE
  link record;
  broken_id integer;
BEGIN
  FOR link IN SELECT * FROM (VALUES
    ('qms_documents', 'superseded_by_id', 'qms_documents'),
    ('qms_training_records', 'document_id', 'qms_documents'),
    ('qms_suppliers', 'quality_agreement_id', 'qms_documents'),
    ('labeling_documents', 'program_id', 'regulatory_programs'),
    ('labeling_translations', 'labeling_document_id', 'labeling_documents'),
    ('labeling_symbols', 'labeling_document_id', 'labeling_documents'),
    ('inspection_findings', 'inspection_id', 'inspections'),
    ('finding_responses', 'finding_id', 'inspection_findings'),
    ('readiness_assessments', 'inspection_id', 'inspections')
  ) AS links(child_table, parent_column, parent_table)
  LOOP
    IF to_regclass('public.' || link.child_table) IS NULL OR
       to_regclass('public.' || link.parent_table) IS NULL THEN
      RAISE EXCEPTION '[qms-tenant-parentage] required store %.% or parent % is absent; run the canonical creators first.',
        link.child_table, link.parent_column, link.parent_table;
    END IF;
    EXECUTE format(
      'SELECT child.id FROM public.%I child LEFT JOIN public.%I parent ON parent.id = child.%I
       WHERE child.%I IS NOT NULL AND (parent.id IS NULL OR parent.organization_id IS DISTINCT FROM child.organization_id)
       ORDER BY child.id LIMIT 1',
      link.child_table, link.parent_table, link.parent_column, link.parent_column
    ) INTO broken_id;
    IF broken_id IS NOT NULL THEN
      RAISE EXCEPTION 'QMS_TENANT_PARENTAGE_RECONCILIATION_REQUIRED: %.% on record % names a missing or foreign-organization % parent. Retained records must be reconciled before deployment; nothing was rewritten.',
        link.child_table, link.parent_column, broken_id, link.parent_table;
    END IF;
  END LOOP;
END
$parentage_preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS qms_documents_id_org_uq
  ON public.qms_documents (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS regulatory_programs_id_org_uq
  ON public.regulatory_programs (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS labeling_documents_id_org_uq
  ON public.labeling_documents (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS inspections_id_org_uq
  ON public.inspections (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS inspection_findings_id_org_uq
  ON public.inspection_findings (id, organization_id);

DO $parentage_keys$
DECLARE
  link record;
  existing_key record;
BEGIN
  FOR link IN SELECT * FROM (VALUES
    ('qms_documents', 'superseded_by_id', 'qms_documents', 'qms_documents_supersession_same_org_fk'),
    ('qms_training_records', 'document_id', 'qms_documents', 'qms_training_records_document_same_org_fk'),
    ('qms_suppliers', 'quality_agreement_id', 'qms_documents', 'qms_suppliers_quality_agreement_same_org_fk'),
    ('labeling_documents', 'program_id', 'regulatory_programs', 'labeling_documents_program_same_org_fk'),
    ('labeling_translations', 'labeling_document_id', 'labeling_documents', 'labeling_translations_document_same_org_fk'),
    ('labeling_symbols', 'labeling_document_id', 'labeling_documents', 'labeling_symbols_document_same_org_fk'),
    ('inspection_findings', 'inspection_id', 'inspections', 'inspection_findings_inspection_same_org_fk'),
    ('finding_responses', 'finding_id', 'inspection_findings', 'finding_responses_finding_same_org_fk'),
    ('readiness_assessments', 'inspection_id', 'inspections', 'readiness_assessments_inspection_same_org_fk')
  ) AS links(child_table, parent_column, parent_table, constraint_name)
  LOOP
    SELECT * INTO existing_key FROM pg_constraint
      WHERE conrelid = to_regclass('public.' || link.child_table) AND conname = link.constraint_name;
    IF FOUND THEN
      IF existing_key.contype <> 'f'
        OR existing_key.confrelid <> to_regclass('public.' || link.parent_table)
        OR existing_key.conkey <> ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = existing_key.conrelid AND attname = link.parent_column),
          (SELECT attnum FROM pg_attribute WHERE attrelid = existing_key.conrelid AND attname = 'organization_id')
        ]::smallint[]
        OR existing_key.confkey <> ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = existing_key.confrelid AND attname = 'id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = existing_key.confrelid AND attname = 'organization_id')
        ]::smallint[]
        OR existing_key.confdeltype <> 'a' OR existing_key.confupdtype <> 'a'
        OR existing_key.condeferrable
      THEN
        RAISE EXCEPTION 'QMS_TENANT_PARENTAGE_CONSTRAINT_MISMATCH: % on % does not hold the declared same-organization parentage. No key was replaced.',
          link.constraint_name, link.child_table;
      END IF;
      IF NOT existing_key.convalidated THEN
        EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', link.child_table, link.constraint_name);
      END IF;
    ELSE
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, organization_id)
         REFERENCES public.%I (id, organization_id) ON DELETE NO ACTION ON UPDATE NO ACTION',
        link.child_table, link.constraint_name, link.parent_column, link.parent_table
      );
    END IF;
  END LOOP;
END
$parentage_keys$;

COMMIT;
