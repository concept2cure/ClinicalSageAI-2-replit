-- 2026-11-06 (S6, the founder: "a Vault user interface, files, folders … just like Veeva").
--
-- Folders a person makes in a project's Vault are public.document_folders rows. The table
-- already existed (migrations/0000_sweet_joseph.sql, shared/schema.ts documentFolders), with an
-- organization and no project, reached only by the legacy /api/folders route. This file gives
-- it a project and a place in the Vault's tree:
--   program_id  the project (regulatory_programs.id) the folder belongs to;
--   parent_key  the binder or preset folder it sits in ('bn:3.2.S.4', 'corresp'), when its
--               parent is not another person's folder (parent_id).
-- The CREATE is the existing shape, guarded, for a database built only from this set; it
-- creates nothing on one that has the table. Additive and IF NOT EXISTS-guarded throughout:
-- no DROP, no constraint replaced. Public, organization_id INTEGER NOT NULL, so the tenant
-- sweep at the end of the set gives it its policy when it has none.

CREATE TABLE IF NOT EXISTS public.document_folders (
  id serial PRIMARY KEY NOT NULL,
  organization_id integer NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  description text,
  parent_id integer REFERENCES public.document_folders(id),
  path text,
  created_by_id integer REFERENCES public.users(id),
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

ALTER TABLE public.document_folders ADD COLUMN IF NOT EXISTS program_id uuid;
ALTER TABLE public.document_folders ADD COLUMN IF NOT EXISTS parent_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'document_folders_program_id_fkey'
       AND conrelid = 'public.document_folders'::regclass
  ) THEN
    ALTER TABLE public.document_folders
      ADD CONSTRAINT document_folders_program_id_fkey
      FOREIGN KEY (program_id) REFERENCES public.regulatory_programs(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS document_folders_program_idx
  ON public.document_folders (program_id, organization_id)
  WHERE program_id IS NOT NULL;

-- Two folders of one name side by side in one project would be two places a reader cannot
-- tell apart. Siblings are distinct by name, case-insensitively, under one parent.
CREATE UNIQUE INDEX IF NOT EXISTS document_folders_program_sibling_name_uq
  ON public.document_folders (program_id, COALESCE(parent_id, 0), COALESCE(parent_key, ''), lower(name))
  WHERE program_id IS NOT NULL;
