-- ═════════════════════════════════════════════════════════════════════════════
-- Add BUILDING status to ivdr_packs CHECK constraint
--
-- The pack lifecycle is now: BUILDING → SUCCEEDED → REVOKED
--   BUILDING: pack row created, snapshot/hash being written
--   SUCCEEDED: snapshot persisted, all hashes stored
--   REVOKED: pack invalidated by admin action
--
-- This prevents the prior bug where packs were inserted as SUCCEEDED
-- before the snapshot was actually committed.
--
-- Migration: 20260223_ivdr_packs_building_status.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- Drop the existing constraint and re-create with BUILDING added
ALTER TABLE ivdr_packs DROP CONSTRAINT IF EXISTS ivdr_packs_status_check;
ALTER TABLE ivdr_packs ADD CONSTRAINT ivdr_packs_status_check
  CHECK (status IN ('BUILDING', 'SUCCEEDED', 'REVOKED'));
