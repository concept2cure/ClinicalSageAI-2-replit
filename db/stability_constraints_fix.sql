-- ==============================================================================
-- FIX FOR DATA TYPE MISMATCHES IN FOREIGN KEY CONSTRAINTS
-- ==============================================================================

-- The issue: stab_reminders, stab_assignments, and stab_signoffs have study_id as VARCHAR
-- while stab_studies has study_id as UUID. We need to fix this.

-- ==============================================================================
-- PHASE 1: ALTER COLUMN TYPES TO MATCH UUID
-- ==============================================================================

-- First, we need to drop any existing foreign key constraints
ALTER TABLE stab_reminders DROP CONSTRAINT IF EXISTS fk_stab_reminders_study;
ALTER TABLE stab_assignments DROP CONSTRAINT IF EXISTS fk_stab_assignments_study;
ALTER TABLE stab_signoffs DROP CONSTRAINT IF EXISTS fk_stab_signoffs_study;

-- Fix stab_reminders.study_id type (currently VARCHAR, needs to be UUID)
-- First, we'll try to convert existing data
ALTER TABLE stab_reminders 
  ALTER COLUMN study_id TYPE uuid 
  USING study_id::uuid;

-- Fix stab_assignments.study_id type (currently VARCHAR, needs to be UUID)
ALTER TABLE stab_assignments 
  ALTER COLUMN study_id TYPE uuid 
  USING study_id::uuid;

-- Fix stab_signoffs.study_id type (currently VARCHAR, needs to be UUID)
ALTER TABLE stab_signoffs 
  ALTER COLUMN study_id TYPE uuid 
  USING study_id::uuid;

-- Fix stab_exports.study_id type (currently VARCHAR, needs to be UUID)
ALTER TABLE stab_exports 
  ALTER COLUMN study_id TYPE uuid 
  USING study_id::uuid;

-- ==============================================================================
-- PHASE 2: RE-ADD FOREIGN KEY CONSTRAINTS WITH CASCADE
-- ==============================================================================

-- Now add the foreign key constraints with proper CASCADE rules
ALTER TABLE stab_reminders 
  ADD CONSTRAINT fk_stab_reminders_study 
  FOREIGN KEY (study_id) 
  REFERENCES stab_studies(study_id) 
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE stab_assignments 
  ADD CONSTRAINT fk_stab_assignments_study 
  FOREIGN KEY (study_id) 
  REFERENCES stab_studies(study_id) 
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE stab_signoffs 
  ADD CONSTRAINT fk_stab_signoffs_study 
  FOREIGN KEY (study_id) 
  REFERENCES stab_studies(study_id) 
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE stab_exports 
  ADD CONSTRAINT fk_stab_exports_study 
  FOREIGN KEY (study_id) 
  REFERENCES stab_studies(study_id) 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- PHASE 3: FIX tp_id TYPE IN stab_reminders (should be UUID not INTEGER)
-- ==============================================================================

-- Drop the column and recreate it with proper type
ALTER TABLE stab_reminders DROP COLUMN IF EXISTS tp_id;
ALTER TABLE stab_reminders ADD COLUMN tp_id uuid;

-- Add foreign key for tp_id
ALTER TABLE stab_reminders 
  ADD CONSTRAINT fk_stab_reminders_timepoint 
  FOREIGN KEY (tp_id) 
  REFERENCES stab_timepoints(tp_id) 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- COMPLETION MESSAGE
-- ==============================================================================
-- All data type mismatches have been fixed
-- Foreign key constraints are now properly established with CASCADE rules