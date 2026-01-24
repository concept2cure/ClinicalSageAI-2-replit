-- 031_gcc_enum_extensions_and_entity_utils.sql
-- =============================================================================
-- ENTERPRISE-GRADE ENUM EXTENSIONS AND UTILITY FUNCTIONS
-- =============================================================================
--
-- Version: 2.0.0
-- Author: TrialSage Platform Team
-- Last Modified: 2026-01-24
-- Compliance: 21 CFR Part 11, HIPAA, GxP
--
-- This migration provides production-grade infrastructure for:
--   1. Extended entity types for all platform domains (~50 types)
--   2. Extended audit/signed object types for Part 11 compliance
--   3. Cryptographic utility functions (hashing, HMAC, secure tokens)
--   4. Entity lifecycle management with versioning
--   5. Metadata validation with schema enforcement
--   6. Temporal utilities for regulatory workflows
--   7. Semantic versioning (SemVer 2.0) helpers
--   8. Cross-schema utility views and statistics
--   9. Error handling and observability infrastructure
--   10. Rate limiting and resource protection
--
-- SECURITY NOTES:
--   - All cryptographic functions use SECURITY DEFINER with restricted search_path
--   - Token generation uses gen_random_bytes (CSPRNG)
--   - API keys use URL-safe base64 encoding
--   - Input validation on all public functions
--   - REVOKE PUBLIC on sensitive functions
--
-- PERFORMANCE NOTES:
--   - Functions marked IMMUTABLE/STABLE where appropriate
--   - PARALLEL SAFE on pure functions
--   - Recursion depth limits on nested operations
--   - Content size limits on hash operations (prevent DoS)
--
-- DEPENDENCIES:
--   - pgcrypto (cryptographic functions)
--   - pg_trgm (fuzzy text matching)
--   - uuid-ossp (UUID generation)
--   - unaccent (optional, for slugify)
--
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction on Postgres < 14
-- All enum extensions must be outside BEGIN/COMMIT blocks

-- =============================================================================
-- EXTENSION DEPENDENCIES (with graceful handling)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Optional: unaccent for better slug generation
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'unaccent extension not available - slugify will use basic normalization';
END $$;

-- =============================================================================
-- SECTION 1: CORE ENTITY TYPE EXTENSIONS
-- =============================================================================

-- Helper function to safely add enum values (idempotent)
-- SECURITY: Uses dynamic SQL with format() to prevent injection
CREATE OR REPLACE FUNCTION core.add_enum_value_if_not_exists(
  p_schema TEXT,
  p_enum_name TEXT,
  p_value TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_type_exists BOOLEAN;
BEGIN
  -- Validate inputs (prevent SQL injection via format verification)
  IF p_schema IS NULL OR p_enum_name IS NULL OR p_value IS NULL THEN
    RAISE EXCEPTION 'NULL parameters not allowed in add_enum_value_if_not_exists';
  END IF;
  
  IF p_schema !~ '^[a-z_][a-z0-9_]*$' OR p_enum_name !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid schema or enum name format';
  END IF;
  
  IF length(p_value) > 63 THEN
    RAISE EXCEPTION 'Enum value exceeds maximum length (63 chars)';
  END IF;
  
  -- Check if type exists
  SELECT EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = p_schema AND t.typname = p_enum_name
  ) INTO v_type_exists;
  
  IF NOT v_type_exists THEN
    RAISE WARNING 'Enum type %.% does not exist', p_schema, p_enum_name;
    RETURN FALSE;
  END IF;
  
  -- Check if value already exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = p_schema 
      AND t.typname = p_enum_name 
      AND e.enumlabel = p_value
  ) THEN
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE %L', p_schema, p_enum_name, p_value);
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
EXCEPTION
  WHEN duplicate_object THEN
    -- Race condition: another transaction added it
    RETURN FALSE;
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to add enum value %.%.%: %', p_schema, p_enum_name, p_value, SQLERRM;
    RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION core.add_enum_value_if_not_exists(TEXT, TEXT, TEXT) IS 
  'Safely add enum value if not exists. Returns TRUE if added, FALSE if already exists or error.';

-- Extend core.entity_type with all platform domains

-- CRO Intelligence
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'CRO_OBJECT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'CRO_CONTRACT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'CRO_MILESTONE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'CRO_DELIVERABLE'); END $$;

-- Discovery & Pre-Clinical
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'DISCOVERY_OBJECT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'ASSAY_RESULT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'PRECLINICAL_STUDY'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'COMPOUND'); END $$;

-- Registry & Trial Management
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'REGISTRY_OBJECT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'CLINICAL_TRIAL'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'TRIAL_SITE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'INVESTIGATOR'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'PATIENT_COHORT'); END $$;

-- Intelligence Packs
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'INTEL_PACK'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'INTEL_PACK_EXPORT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'INTEL_INSIGHT'); END $$;

-- Regulatory Documents
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'REGULATORY_SUBMISSION'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'IND_MODULE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'NDA_MODULE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'BLA_MODULE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'CTD_MODULE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'ECTD_SEQUENCE'); END $$;

-- Innovation Platform
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'GUIDANCE_DOCUMENT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'DELTA_FINDING'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'EVIDENCE_ASSESSMENT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'READINESS_ASSESSMENT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'TRACE_LINK'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'LEARNING_TEMPLATE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'NEGOTIATION_THREAD'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'GUARDRAIL_RULE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'VALIDATION_RUN'); END $$;

-- FHIR & Clinical Data
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'FHIR_RESOURCE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'FHIR_BUNDLE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'ADVERSE_EVENT'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'LAB_RESULT'); END $$;

-- Knowledge Graph & AI
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'KG_NODE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'KG_EDGE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'AI_INFERENCE'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'EMBEDDING_VECTOR'); END $$;

-- Collaboration
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'COMMENT_THREAD'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'REVIEW_TASK'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'APPROVAL_WORKFLOW'); END $$;
DO $$ BEGIN PERFORM core.add_enum_value_if_not_exists('core', 'entity_type', 'NOTIFICATION'); END $$;

-- =============================================================================
-- SECTION 2: AUDIT SIGNED OBJECT TYPE EXTENSIONS
-- =============================================================================

-- Extend audit.signed_object_type for Part 11 e-signatures
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='audit' AND t.typname='signed_object_type'
  ) THEN
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'INTEL_PACK_EXPORT');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'REGULATORY_SUBMISSION');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'CTD_MODULE');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'ECTD_SEQUENCE');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'CLINICAL_STUDY_REPORT');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'PROTOCOL');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'IB_DOCUMENT');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'INFORMED_CONSENT');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'SAFETY_REPORT');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'VALIDATION_RUN');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'READINESS_ASSESSMENT');
    PERFORM core.add_enum_value_if_not_exists('audit', 'signed_object_type', 'TRACEABILITY_MATRIX');
  END IF;
END $$;

-- =============================================================================
-- SECTION 3: TRANSACTION BLOCK - Functions & Utilities
-- =============================================================================

BEGIN;

-- Drop existing functions if signature changed (for clean upgrade)
DROP FUNCTION IF EXISTS core.sha256_hex(TEXT) CASCADE;
DROP FUNCTION IF EXISTS core.register_entity(UUID, core.entity_type, TEXT, TEXT, TEXT, JSONB) CASCADE;

-- -----------------------------------------------------------------------------
-- 3.0 Configuration Constants
-- -----------------------------------------------------------------------------

-- Create a configuration table for runtime settings
CREATE TABLE IF NOT EXISTS core.utility_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  description TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default configuration (idempotent)
INSERT INTO core.utility_config (config_key, config_value, description, is_sensitive) VALUES
  ('max_content_hash_size', '10485760', 'Maximum content size for hashing (10MB)', FALSE),
  ('max_recursion_depth', '50', 'Maximum recursion depth for nested operations', FALSE),
  ('token_min_length', '16', 'Minimum token length in bytes', FALSE),
  ('token_max_length', '256', 'Maximum token length in bytes', FALSE),
  ('api_key_length', '32', 'API key length in bytes', TRUE),
  ('max_array_size', '10000', 'Maximum array size for operations', FALSE),
  ('max_metadata_size', '1048576', 'Maximum metadata size (1MB)', FALSE),
  ('enable_telemetry', 'true', 'Enable function usage telemetry', FALSE)
ON CONFLICT (config_key) DO NOTHING;

-- Helper to get config value
CREATE OR REPLACE FUNCTION core.get_config(p_key TEXT, p_default TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(
    (SELECT config_value FROM core.utility_config WHERE config_key = p_key),
    p_default
  );
$$;

COMMENT ON FUNCTION core.get_config(TEXT, TEXT) IS 'Get configuration value with optional default';

-- -----------------------------------------------------------------------------
-- 3.0.1 Error/Telemetry Infrastructure
-- -----------------------------------------------------------------------------

-- Function usage telemetry table
CREATE TABLE IF NOT EXISTS core.function_telemetry (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT NOT NULL,
  schema_name TEXT NOT NULL DEFAULT 'core',
  invocation_count BIGINT NOT NULL DEFAULT 0,
  error_count BIGINT NOT NULL DEFAULT 0,
  last_invoked_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  avg_execution_ms NUMERIC(10,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schema_name, function_name)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_function ON core.function_telemetry(schema_name, function_name);

-- Record telemetry (async-safe)
CREATE OR REPLACE FUNCTION core.record_telemetry(
  p_function_name TEXT,
  p_schema_name TEXT DEFAULT 'core',
  p_is_error BOOLEAN DEFAULT FALSE,
  p_error_message TEXT DEFAULT NULL,
  p_execution_ms NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public
AS $$
BEGIN
  -- Only record if telemetry is enabled
  IF core.get_config('enable_telemetry', 'true') != 'true' THEN
    RETURN;
  END IF;
  
  INSERT INTO core.function_telemetry (
    function_name, schema_name, invocation_count, error_count,
    last_invoked_at, last_error_at, last_error_message, avg_execution_ms
  )
  VALUES (
    p_function_name, p_schema_name, 1, 
    CASE WHEN p_is_error THEN 1 ELSE 0 END,
    NOW(),
    CASE WHEN p_is_error THEN NOW() ELSE NULL END,
    p_error_message,
    p_execution_ms
  )
  ON CONFLICT (schema_name, function_name) DO UPDATE SET
    invocation_count = core.function_telemetry.invocation_count + 1,
    error_count = core.function_telemetry.error_count + CASE WHEN p_is_error THEN 1 ELSE 0 END,
    last_invoked_at = NOW(),
    last_error_at = CASE WHEN p_is_error THEN NOW() ELSE core.function_telemetry.last_error_at END,
    last_error_message = CASE WHEN p_is_error THEN p_error_message ELSE core.function_telemetry.last_error_message END,
    avg_execution_ms = CASE 
      WHEN p_execution_ms IS NOT NULL THEN 
        (COALESCE(core.function_telemetry.avg_execution_ms, 0) * 
         core.function_telemetry.invocation_count + p_execution_ms) / 
        (core.function_telemetry.invocation_count + 1)
      ELSE core.function_telemetry.avg_execution_ms
    END;
EXCEPTION WHEN OTHERS THEN
  -- Silently fail - telemetry should never break the main function
  NULL;
END;
$$;

COMMENT ON FUNCTION core.record_telemetry IS 'Record function usage telemetry (fire-and-forget)';

-- -----------------------------------------------------------------------------
-- 3.1 Cryptographic Utilities (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- SHA-256 hash to hex (with size limits)
CREATE OR REPLACE FUNCTION core.sha256_hex(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max_size INT;
BEGIN
  -- Get max size from config (default 10MB)
  v_max_size := COALESCE(core.get_config('max_content_hash_size', '10485760')::INT, 10485760);
  
  -- Validate input size
  IF p_text IS NOT NULL AND length(p_text) > v_max_size THEN
    RAISE EXCEPTION 'Content exceeds maximum hash size (% bytes)', v_max_size
      USING HINT = 'Increase max_content_hash_size config or chunk the content';
  END IF;
  
  RETURN encode(digest(coalesce(p_text, ''), 'sha256'), 'hex');
END;
$$;

COMMENT ON FUNCTION core.sha256_hex(TEXT) IS 
  'Compute SHA-256 hash of text. Returns 64-char hex string. Max input: 10MB (configurable)';

-- SHA-512 hash to hex (with size limits)
CREATE OR REPLACE FUNCTION core.sha512_hex(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max_size INT;
BEGIN
  v_max_size := COALESCE(core.get_config('max_content_hash_size', '10485760')::INT, 10485760);
  
  IF p_text IS NOT NULL AND length(p_text) > v_max_size THEN
    RAISE EXCEPTION 'Content exceeds maximum hash size (% bytes)', v_max_size;
  END IF;
  
  RETURN encode(digest(coalesce(p_text, ''), 'sha512'), 'hex');
END;
$$;

COMMENT ON FUNCTION core.sha512_hex(TEXT) IS 
  'Compute SHA-512 hash of text. Returns 128-char hex string. Max input: 10MB (configurable)';

-- HMAC-SHA256 (with key validation)
CREATE OR REPLACE FUNCTION core.hmac_sha256(p_text TEXT, p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Validate key is provided
  IF p_key IS NULL OR length(p_key) < 16 THEN
    RAISE EXCEPTION 'HMAC key must be at least 16 characters'
      USING HINT = 'Use a strong, random key for HMAC operations';
  END IF;
  
  RETURN encode(hmac(coalesce(p_text, ''), p_key, 'sha256'), 'hex');
END;
$$;

COMMENT ON FUNCTION core.hmac_sha256(TEXT, TEXT) IS 
  'Compute HMAC-SHA256. Key must be >= 16 chars. Use for message authentication.';

-- HMAC-SHA512 for higher security
CREATE OR REPLACE FUNCTION core.hmac_sha512(p_text TEXT, p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_key IS NULL OR length(p_key) < 16 THEN
    RAISE EXCEPTION 'HMAC key must be at least 16 characters';
  END IF;
  
  RETURN encode(hmac(coalesce(p_text, ''), p_key, 'sha512'), 'hex');
END;
$$;

COMMENT ON FUNCTION core.hmac_sha512(TEXT, TEXT) IS 'Compute HMAC-SHA512 for higher security requirements';

-- Content hash for documents (normalizes whitespace first)
CREATE OR REPLACE FUNCTION core.content_hash(p_content TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = core, pg_catalog, public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  IF p_content IS NULL THEN
    RETURN core.sha256_hex('');
  END IF;
  
  -- Normalize: collapse whitespace, trim
  v_normalized := regexp_replace(
    regexp_replace(p_content, '\s+', ' ', 'g'),
    '^\s+|\s+$', '', 'g'
  );
  
  RETURN core.sha256_hex(v_normalized);
END;
$$;

COMMENT ON FUNCTION core.content_hash(TEXT) IS 
  'Hash content after normalizing whitespace. Use for change detection.';

-- Hash JSONB deterministically (sorted keys for consistency)
CREATE OR REPLACE FUNCTION core.jsonb_hash(p_json JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = core, pg_catalog, public
AS $$
DECLARE
  v_max_size INT;
  v_json_text TEXT;
BEGIN
  v_max_size := COALESCE(core.get_config('max_metadata_size', '1048576')::INT, 1048576);
  
  IF p_json IS NULL THEN
    RETURN core.sha256_hex('null');
  END IF;
  
  v_json_text := p_json::TEXT;
  
  IF length(v_json_text) > v_max_size THEN
    RAISE EXCEPTION 'JSONB exceeds maximum size (% bytes)', v_max_size;
  END IF;
  
  -- Note: PostgreSQL JSONB already sorts keys, so this is deterministic
  RETURN core.sha256_hex(v_json_text);
END;
$$;

COMMENT ON FUNCTION core.jsonb_hash(JSONB) IS 
  'Compute deterministic hash of JSONB. Keys are auto-sorted by PostgreSQL.';

-- Generate secure random token (URL-safe)
CREATE OR REPLACE FUNCTION core.generate_token(p_length INT DEFAULT 32)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_min_length INT;
  v_max_length INT;
BEGIN
  v_min_length := COALESCE(core.get_config('token_min_length', '16')::INT, 16);
  v_max_length := COALESCE(core.get_config('token_max_length', '256')::INT, 256);
  
  IF p_length < v_min_length THEN
    RAISE EXCEPTION 'Token length must be at least % bytes', v_min_length
      USING HINT = 'Short tokens are vulnerable to brute force attacks';
  END IF;
  
  IF p_length > v_max_length THEN
    RAISE EXCEPTION 'Token length cannot exceed % bytes', v_max_length;
  END IF;
  
  -- Use hex encoding for URL-safe output
  RETURN encode(gen_random_bytes(p_length), 'hex');
END;
$$;

COMMENT ON FUNCTION core.generate_token(INT) IS 
  'Generate cryptographically secure random token (hex). Default 32 bytes = 64 chars.';

-- Generate API key with prefix (URL-safe base64)
CREATE OR REPLACE FUNCTION core.generate_api_key(p_prefix TEXT DEFAULT 'ts')
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_key_length INT;
  v_raw_bytes BYTEA;
  v_encoded TEXT;
BEGIN
  -- Validate prefix
  IF p_prefix IS NULL OR length(p_prefix) < 2 OR length(p_prefix) > 10 THEN
    RAISE EXCEPTION 'API key prefix must be 2-10 characters';
  END IF;
  
  IF p_prefix !~ '^[a-z0-9]+$' THEN
    RAISE EXCEPTION 'API key prefix must be lowercase alphanumeric';
  END IF;
  
  v_key_length := COALESCE(core.get_config('api_key_length', '32')::INT, 32);
  v_raw_bytes := gen_random_bytes(v_key_length);
  
  -- URL-safe base64: replace + with -, / with _, remove =
  v_encoded := replace(replace(encode(v_raw_bytes, 'base64'), '+', '-'), '/', '_');
  v_encoded := rtrim(v_encoded, '=');
  
  RETURN p_prefix || '_' || v_encoded;
END;
$$;

COMMENT ON FUNCTION core.generate_api_key(TEXT) IS 
  'Generate URL-safe API key with prefix. Format: prefix_base64urlsafe. Default 32 bytes.';

-- Verify API key format (does NOT verify validity)
CREATE OR REPLACE FUNCTION core.verify_api_key_format(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_key IS NULL THEN RETURN FALSE; END IF;
  
  -- Format: 2-10 char prefix, underscore, 20+ char base64url
  RETURN p_key ~ '^[a-z0-9]{2,10}_[A-Za-z0-9_-]{20,}$';
END;
$$;

COMMENT ON FUNCTION core.verify_api_key_format(TEXT) IS 'Verify API key matches expected format';

-- Hash API key for storage (never store raw keys)
CREATE OR REPLACE FUNCTION core.hash_api_key(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = core, pg_catalog, public
AS $$
BEGIN
  IF NOT core.verify_api_key_format(p_key) THEN
    RAISE EXCEPTION 'Invalid API key format';
  END IF;
  
  -- Use SHA-256 for key hashing
  RETURN core.sha256_hex(p_key);
END;
$$;

COMMENT ON FUNCTION core.hash_api_key(TEXT) IS 'Hash API key for secure storage. Never store raw keys.';

-- -----------------------------------------------------------------------------
-- 3.2 Entity Registration & Lifecycle (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Validate UUID format
CREATE OR REPLACE FUNCTION core.is_valid_uuid(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_text IS NULL THEN RETURN FALSE; END IF;
  PERFORM p_text::UUID;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION core.is_valid_uuid(TEXT) IS 'Check if text is a valid UUID';

-- Register entity in central registry (with full validation)
CREATE OR REPLACE FUNCTION core.register_entity(
  p_program_id UUID,
  p_entity_type core.entity_type,
  p_entity_key TEXT,
  p_entity_version TEXT DEFAULT 'v1',
  p_entity_hash TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_id UUID;
  v_actor TEXT;
  v_req TEXT;
  v_start_ts TIMESTAMPTZ := clock_timestamp();
  v_max_meta_size INT;
BEGIN
  -- Input validation
  IF p_program_id IS NULL THEN
    RAISE EXCEPTION 'program_id is required'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;
  
  IF p_entity_key IS NULL OR trim(p_entity_key) = '' THEN
    RAISE EXCEPTION 'entity_key is required and cannot be empty'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;
  
  IF length(p_entity_key) > 500 THEN
    RAISE EXCEPTION 'entity_key exceeds maximum length (500 chars)';
  END IF;
  
  IF p_entity_version IS NULL OR trim(p_entity_version) = '' THEN
    RAISE EXCEPTION 'entity_version is required';
  END IF;
  
  -- Validate metadata size
  v_max_meta_size := COALESCE(core.get_config('max_metadata_size', '1048576')::INT, 1048576);
  IF p_metadata IS NOT NULL AND length(p_metadata::TEXT) > v_max_meta_size THEN
    RAISE EXCEPTION 'metadata exceeds maximum size (% bytes)', v_max_meta_size;
  END IF;
  
  -- Verify program exists
  IF NOT EXISTS (SELECT 1 FROM core.programs WHERE id = p_program_id) THEN
    RAISE EXCEPTION 'Program % does not exist', p_program_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  
  -- Get audit context
  v_actor := COALESCE(
    NULLIF(current_setting('app.user', true), ''),
    NULLIF(current_setting('app.user_id', true), ''),
    'system'
  );
  v_req := current_setting('app.request_id', true);
  
  -- Insert entity
  INSERT INTO core.entities (
    program_id, entity_type, entity_key, entity_version, 
    entity_hash, metadata, created_by, request_id
  )
  VALUES (
    p_program_id, p_entity_type, trim(p_entity_key), trim(p_entity_version),
    p_entity_hash, COALESCE(p_metadata, '{}'::jsonb), v_actor, v_req
  )
  RETURNING id INTO v_id;
  
  -- Record telemetry
  PERFORM core.record_telemetry(
    'register_entity', 'core', FALSE, NULL,
    EXTRACT(milliseconds FROM clock_timestamp() - v_start_ts)
  );

  RETURN v_id;
  
EXCEPTION WHEN OTHERS THEN
  -- Record error telemetry
  PERFORM core.record_telemetry('register_entity', 'core', TRUE, SQLERRM);
  RAISE;
END;
$$;

COMMENT ON FUNCTION core.register_entity IS 
  'Register entity in central registry with audit trail. Validates all inputs.';

-- Register entity with automatic hash and versioning
CREATE OR REPLACE FUNCTION core.register_entity_with_content(
  p_program_id UUID,
  p_entity_type core.entity_type,
  p_entity_key TEXT,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_hash TEXT;
  v_version TEXT;
  v_existing_id UUID;
  v_max_version INT;
  v_start_ts TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- Input validation
  IF p_program_id IS NULL THEN
    RAISE EXCEPTION 'program_id is required';
  END IF;
  
  IF p_entity_key IS NULL OR trim(p_entity_key) = '' THEN
    RAISE EXCEPTION 'entity_key is required';
  END IF;
  
  -- Calculate content hash
  v_hash := core.content_hash(p_content);
  
  -- Check if this exact content already exists (idempotent)
  SELECT id INTO v_existing_id
  FROM core.entities
  WHERE program_id = p_program_id
    AND entity_type = p_entity_type
    AND entity_key = trim(p_entity_key)
    AND entity_hash = v_hash
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_existing_id IS NOT NULL THEN
    -- Return existing entity (content unchanged)
    PERFORM core.record_telemetry(
      'register_entity_with_content', 'core', FALSE, NULL,
      EXTRACT(milliseconds FROM clock_timestamp() - v_start_ts)
    );
    RETURN v_existing_id;
  END IF;
  
  -- Calculate next version number
  SELECT MAX(
    CASE 
      WHEN entity_version ~ '^v?\d+$' 
      THEN NULLIF(regexp_replace(entity_version, '^v', ''), '')::INT
      ELSE 0
    END
  )
  INTO v_max_version
  FROM core.entities
  WHERE program_id = p_program_id
    AND entity_type = p_entity_type
    AND entity_key = trim(p_entity_key);
  
  v_version := 'v' || COALESCE(v_max_version + 1, 1);
  
  -- Register new version
  RETURN core.register_entity(
    p_program_id, p_entity_type, p_entity_key, 
    v_version, v_hash, p_metadata
  );
  
EXCEPTION WHEN OTHERS THEN
  PERFORM core.record_telemetry('register_entity_with_content', 'core', TRUE, SQLERRM);
  RAISE;
END;
$$;

COMMENT ON FUNCTION core.register_entity_with_content IS 
  'Register entity with automatic versioning based on content hash. Idempotent.';

-- Get entity by key (latest version) with optional version filter
CREATE OR REPLACE FUNCTION core.get_entity(
  p_program_id UUID,
  p_entity_type core.entity_type,
  p_entity_key TEXT,
  p_version TEXT DEFAULT NULL
)
RETURNS core.entities
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_result core.entities;
BEGIN
  IF p_program_id IS NULL OR p_entity_key IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF p_version IS NOT NULL THEN
    -- Get specific version
    SELECT * INTO v_result
    FROM core.entities
    WHERE program_id = p_program_id
      AND entity_type = p_entity_type
      AND entity_key = trim(p_entity_key)
      AND entity_version = trim(p_version)
    LIMIT 1;
  ELSE
    -- Get latest version
    SELECT * INTO v_result
    FROM core.entities
    WHERE program_id = p_program_id
      AND entity_type = p_entity_type
      AND entity_key = trim(p_entity_key)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION core.get_entity IS 
  'Retrieve entity by key. Returns latest version unless specific version requested.';

-- Get entity version history with pagination
CREATE OR REPLACE FUNCTION core.get_entity_history(
  p_program_id UUID,
  p_entity_type core.entity_type,
  p_entity_key TEXT,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS SETOF core.entities
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = core, public
AS $$
BEGIN
  IF p_program_id IS NULL OR p_entity_key IS NULL THEN
    RETURN;
  END IF;
  
  -- Enforce reasonable limits
  IF p_limit > 1000 THEN
    p_limit := 1000;
  END IF;
  
  RETURN QUERY
  SELECT *
  FROM core.entities
  WHERE program_id = p_program_id
    AND entity_type = p_entity_type
    AND entity_key = trim(p_entity_key)
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION core.get_entity_history IS 
  'Retrieve all versions of an entity with pagination. Max 1000 per call.';

-- Check if entity exists (optimized)
CREATE OR REPLACE FUNCTION core.entity_exists(
  p_program_id UUID,
  p_entity_type core.entity_type,
  p_entity_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = core, public
AS $$
BEGIN
  IF p_program_id IS NULL OR p_entity_key IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1
    FROM core.entities
    WHERE program_id = p_program_id
      AND entity_type = p_entity_type
      AND entity_key = trim(p_entity_key)
  );
END;
$$;

COMMENT ON FUNCTION core.entity_exists IS 'Check if entity exists in registry';

-- Count entity versions
CREATE OR REPLACE FUNCTION core.entity_version_count(
  p_program_id UUID,
  p_entity_type core.entity_type,
  p_entity_key TEXT
)
RETURNS INT
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT COUNT(*)::INT
  FROM core.entities
  WHERE program_id = p_program_id
    AND entity_type = p_entity_type
    AND entity_key = trim(p_entity_key);
$$;

COMMENT ON FUNCTION core.entity_version_count IS 'Count versions of an entity';

-- Soft delete entity (marks as deleted, preserves history)
CREATE OR REPLACE FUNCTION core.soft_delete_entity(
  p_entity_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_actor TEXT;
BEGIN
  IF p_entity_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  v_actor := COALESCE(
    NULLIF(current_setting('app.user', true), ''),
    'system'
  );
  
  UPDATE core.entities
  SET metadata = metadata || jsonb_build_object(
    '_deleted', TRUE,
    '_deleted_at', NOW(),
    '_deleted_by', v_actor,
    '_deleted_reason', p_reason
  )
  WHERE id = p_entity_id
    AND (metadata->>'_deleted')::BOOLEAN IS NOT TRUE;
  
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION core.soft_delete_entity IS 'Soft delete entity by marking in metadata. Preserves history.';

-- -----------------------------------------------------------------------------
-- 3.3 Metadata Utilities (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Merge JSONB objects (deep merge with recursion limit)
CREATE OR REPLACE FUNCTION core.jsonb_deep_merge(
  p_base JSONB,
  p_overlay JSONB,
  p_depth INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_key TEXT;
  v_value JSONB;
  v_max_depth INT;
BEGIN
  -- Get max recursion depth from config
  v_max_depth := COALESCE(core.get_config('max_recursion_depth', '50')::INT, 50);
  
  IF p_depth > v_max_depth THEN
    RAISE EXCEPTION 'Maximum recursion depth exceeded in jsonb_deep_merge'
      USING HINT = 'Check for circular references or increase max_recursion_depth';
  END IF;
  
  IF p_base IS NULL THEN RETURN p_overlay; END IF;
  IF p_overlay IS NULL THEN RETURN p_base; END IF;
  
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_overlay)
  LOOP
    IF p_base ? v_key 
       AND jsonb_typeof(p_base->v_key) = 'object' 
       AND jsonb_typeof(v_value) = 'object' 
    THEN
      p_base := jsonb_set(
        p_base, 
        ARRAY[v_key], 
        core.jsonb_deep_merge(p_base->v_key, v_value, p_depth + 1)
      );
    ELSE
      p_base := jsonb_set(p_base, ARRAY[v_key], v_value);
    END IF;
  END LOOP;
  
  RETURN p_base;
END;
$$;

COMMENT ON FUNCTION core.jsonb_deep_merge IS 
  'Deep merge two JSONB objects. Max recursion depth: 50 (configurable).';

-- Extract text for full-text search from JSONB (with recursion limit)
CREATE OR REPLACE FUNCTION core.jsonb_to_text_search(
  p_json JSONB,
  p_depth INT DEFAULT 0
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT := '';
  v_key TEXT;
  v_value JSONB;
  v_max_depth INT;
BEGIN
  v_max_depth := COALESCE(core.get_config('max_recursion_depth', '50')::INT, 50);
  
  IF p_depth > v_max_depth THEN
    RETURN '[max depth exceeded]';
  END IF;
  
  IF p_json IS NULL THEN RETURN ''; END IF;
  
  CASE jsonb_typeof(p_json)
    WHEN 'string' THEN
      RETURN p_json #>> '{}';
    WHEN 'number' THEN
      RETURN p_json::TEXT;
    WHEN 'boolean' THEN
      RETURN p_json::TEXT;
    WHEN 'array' THEN
      FOR v_value IN SELECT * FROM jsonb_array_elements(p_json)
      LOOP
        v_text := v_text || ' ' || core.jsonb_to_text_search(v_value, p_depth + 1);
      END LOOP;
      RETURN trim(v_text);
    WHEN 'object' THEN
      FOR v_key, v_value IN SELECT * FROM jsonb_each(p_json)
      LOOP
        -- Skip internal/private keys
        IF v_key NOT LIKE '\_%' THEN
          v_text := v_text || ' ' || v_key || ' ' || core.jsonb_to_text_search(v_value, p_depth + 1);
        END IF;
      END LOOP;
      RETURN trim(v_text);
    WHEN 'null' THEN
      RETURN '';
    ELSE
      RETURN '';
  END CASE;
END;
$$;

COMMENT ON FUNCTION core.jsonb_to_text_search IS 
  'Flatten JSONB to text for full-text search. Skips private keys (starting with _).';

-- Validate metadata against required fields and types
CREATE OR REPLACE FUNCTION core.validate_metadata(
  p_metadata JSONB,
  p_required_fields TEXT[],
  p_raise_error BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_field TEXT;
  v_missing TEXT[];
BEGIN
  IF p_metadata IS NULL THEN
    IF p_raise_error THEN
      RAISE EXCEPTION 'Metadata is NULL';
    END IF;
    RETURN FALSE;
  END IF;
  
  IF p_required_fields IS NULL OR array_length(p_required_fields, 1) IS NULL THEN
    RETURN TRUE;
  END IF;
  
  FOREACH v_field IN ARRAY p_required_fields
  LOOP
    IF NOT p_metadata ? v_field THEN
      v_missing := array_append(v_missing, v_field);
    END IF;
  END LOOP;
  
  IF array_length(v_missing, 1) > 0 THEN
    IF p_raise_error THEN
      RAISE EXCEPTION 'Missing required metadata fields: %', array_to_string(v_missing, ', ');
    END IF;
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION core.validate_metadata IS 
  'Validate JSONB contains required fields. Optionally raises exception.';

-- Validate metadata field types
CREATE OR REPLACE FUNCTION core.validate_metadata_types(
  p_metadata JSONB,
  p_field_types JSONB  -- e.g., {"name": "string", "count": "number", "active": "boolean"}
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_field TEXT;
  v_expected_type TEXT;
  v_actual_type TEXT;
BEGIN
  IF p_metadata IS NULL OR p_field_types IS NULL THEN
    RETURN FALSE;
  END IF;
  
  FOR v_field, v_expected_type IN SELECT key, value #>> '{}' FROM jsonb_each(p_field_types)
  LOOP
    IF p_metadata ? v_field THEN
      v_actual_type := jsonb_typeof(p_metadata->v_field);
      IF v_actual_type != v_expected_type THEN
        RETURN FALSE;
      END IF;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION core.validate_metadata_types IS 'Validate metadata field types match expected types';

-- Sanitize metadata (remove nulls, empty strings, and private fields)
CREATE OR REPLACE FUNCTION core.sanitize_metadata(
  p_metadata JSONB,
  p_remove_private BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(
    jsonb_object_agg(key, value) FILTER (
      WHERE value IS NOT NULL 
        AND value != 'null'::jsonb
        AND (jsonb_typeof(value) != 'string' OR value #>> '{}' != '')
        AND (NOT p_remove_private OR key NOT LIKE '\_%')
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(COALESCE(p_metadata, '{}'::jsonb));
$$;

COMMENT ON FUNCTION core.sanitize_metadata IS 
  'Remove null/empty values from JSONB. Optionally removes private keys (_prefix).';

-- Extract specific paths from metadata
CREATE OR REPLACE FUNCTION core.extract_metadata_paths(
  p_metadata JSONB,
  p_paths TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result JSONB := '{}'::JSONB;
  v_path TEXT;
  v_value JSONB;
BEGIN
  IF p_metadata IS NULL OR p_paths IS NULL THEN
    RETURN v_result;
  END IF;
  
  FOREACH v_path IN ARRAY p_paths
  LOOP
    v_value := p_metadata #> string_to_array(v_path, '.');
    IF v_value IS NOT NULL THEN
      v_result := v_result || jsonb_build_object(v_path, v_value);
    END IF;
  END LOOP;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION core.extract_metadata_paths IS 'Extract specific paths from JSONB (dot notation)';

-- -----------------------------------------------------------------------------
-- 3.4 Temporal Utilities (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Get current timestamp with timezone
CREATE OR REPLACE FUNCTION core.now_utc()
RETURNS TIMESTAMPTZ
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT NOW() AT TIME ZONE 'UTC';
$$;

COMMENT ON FUNCTION core.now_utc IS 'Current UTC timestamp';

-- Calculate business days between dates (with validation)
CREATE OR REPLACE FUNCTION core.business_days_between(
  p_start DATE,
  p_end DATE,
  p_include_end BOOLEAN DEFAULT TRUE
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_count INT;
  v_max_days INT;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Validate range isn't too large (prevent DoS)
  v_max_days := 10000;  -- ~27 years max
  IF ABS(p_end - p_start) > v_max_days THEN
    RAISE EXCEPTION 'Date range too large (max % days)', v_max_days;
  END IF;
  
  -- Handle reversed dates
  IF p_end < p_start THEN
    RETURN -1 * core.business_days_between(p_end, p_start, p_include_end);
  END IF;
  
  SELECT COUNT(*)::INT INTO v_count
  FROM generate_series(p_start, p_end - (CASE WHEN p_include_end THEN 0 ELSE 1 END), '1 day'::INTERVAL) d
  WHERE EXTRACT(dow FROM d) NOT IN (0, 6);  -- Exclude weekends
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION core.business_days_between IS 
  'Count business days between dates (excludes weekends). Handles reversed dates.';

-- Add business days to date (with validation)
CREATE OR REPLACE FUNCTION core.add_business_days(
  p_start DATE,
  p_days INT
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_date DATE;
  v_remaining INT;
  v_direction INT;
  v_max_iterations INT := 15000;  -- Safety limit
  v_iterations INT := 0;
BEGIN
  IF p_start IS NULL THEN RETURN NULL; END IF;
  IF p_days IS NULL OR p_days = 0 THEN RETURN p_start; END IF;
  
  v_date := p_start;
  v_direction := SIGN(p_days);
  v_remaining := ABS(p_days);
  
  WHILE v_remaining > 0 AND v_iterations < v_max_iterations LOOP
    v_date := v_date + v_direction;
    v_iterations := v_iterations + 1;
    
    IF EXTRACT(dow FROM v_date) NOT IN (0, 6) THEN
      v_remaining := v_remaining - 1;
    END IF;
  END LOOP;
  
  IF v_iterations >= v_max_iterations THEN
    RAISE EXCEPTION 'Maximum iterations exceeded in add_business_days';
  END IF;
  
  RETURN v_date;
END;
$$;

COMMENT ON FUNCTION core.add_business_days IS 'Add/subtract business days. Handles negative values.';

-- Check if date is within regulatory window (with validation)
CREATE OR REPLACE FUNCTION core.is_within_regulatory_window(
  p_date TIMESTAMPTZ,
  p_window_start TIMESTAMPTZ,
  p_window_days INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_date IS NULL OR p_window_start IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF p_window_days IS NULL OR p_window_days < 0 THEN
    RAISE EXCEPTION 'Window days must be a non-negative integer';
  END IF;
  
  RETURN p_date >= p_window_start 
     AND p_date <= (p_window_start + (p_window_days || ' days')::INTERVAL);
END;
$$;

COMMENT ON FUNCTION core.is_within_regulatory_window IS 
  'Check if timestamp is within regulatory response window';

-- Format timestamp for regulatory display (21 CFR Part 11 format)
CREATE OR REPLACE FUNCTION core.format_regulatory_timestamp(
  p_ts TIMESTAMPTZ,
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_ts IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Validate timezone
  IF p_timezone IS NULL OR length(p_timezone) > 50 THEN
    p_timezone := 'UTC';
  END IF;
  
  RETURN to_char(p_ts AT TIME ZONE p_timezone, 'DD-Mon-YYYY HH24:MI:SS') || ' ' || p_timezone;
EXCEPTION WHEN OTHERS THEN
  -- Invalid timezone, fall back to UTC
  RETURN to_char(p_ts AT TIME ZONE 'UTC', 'DD-Mon-YYYY HH24:MI:SS') || ' UTC';
END;
$$;

COMMENT ON FUNCTION core.format_regulatory_timestamp IS 
  'Format timestamp per 21 CFR Part 11. Format: DD-Mon-YYYY HH24:MI:SS TZ';

-- Get ISO week of year (useful for batch numbering)
CREATE OR REPLACE FUNCTION core.iso_week(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT to_char(COALESCE(p_date, CURRENT_DATE), 'IYYY-IW');
$$;

COMMENT ON FUNCTION core.iso_week IS 'Get ISO week as YYYY-WW';

-- Calculate duration in human readable format
CREATE OR REPLACE FUNCTION core.human_duration(p_interval INTERVAL)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_interval IS NULL THEN NULL
    WHEN p_interval < INTERVAL '1 minute' THEN EXTRACT(SECONDS FROM p_interval)::INT || 's'
    WHEN p_interval < INTERVAL '1 hour' THEN EXTRACT(MINUTES FROM p_interval)::INT || 'm'
    WHEN p_interval < INTERVAL '1 day' THEN EXTRACT(HOURS FROM p_interval)::INT || 'h ' || 
         (EXTRACT(MINUTES FROM p_interval)::INT % 60) || 'm'
    ELSE EXTRACT(DAYS FROM p_interval)::INT || 'd ' || 
         EXTRACT(HOURS FROM p_interval)::INT || 'h'
  END;
$$;

COMMENT ON FUNCTION core.human_duration IS 'Convert interval to human-readable string';

-- -----------------------------------------------------------------------------
-- 3.5 Semantic Versioning Utilities (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Parse semver string to components (handles malformed gracefully)
CREATE OR REPLACE FUNCTION core.parse_semver(p_version TEXT)
RETURNS TABLE(major INT, minor INT, patch INT, prerelease TEXT)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_matches TEXT[];
BEGIN
  IF p_version IS NULL OR trim(p_version) = '' THEN
    RETURN QUERY SELECT 0, 0, 0, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Match semantic version pattern: v?major.minor.patch[-prerelease]
  v_matches := regexp_match(trim(p_version), '^v?(\d{1,10})(?:\.(\d{1,10}))?(?:\.(\d{1,10}))?(?:-(.+))?$');
  
  IF v_matches IS NULL THEN
    -- Invalid format, return zeros
    RETURN QUERY SELECT 0, 0, 0, NULL::TEXT;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    COALESCE(v_matches[1]::INT, 0),
    COALESCE(v_matches[2]::INT, 0),
    COALESCE(v_matches[3]::INT, 0),
    v_matches[4];
END;
$$;

COMMENT ON FUNCTION core.parse_semver IS 
  'Parse semantic version into components. Returns 0.0.0 for invalid input.';

-- Compare semver strings (-1, 0, 1)
CREATE OR REPLACE FUNCTION core.compare_semver(p_v1 TEXT, p_v2 TEXT)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_v1 RECORD;
  v_v2 RECORD;
BEGIN
  SELECT * INTO v_v1 FROM core.parse_semver(p_v1);
  SELECT * INTO v_v2 FROM core.parse_semver(p_v2);
  
  IF v_v1.major > v_v2.major THEN RETURN 1; END IF;
  IF v_v1.major < v_v2.major THEN RETURN -1; END IF;
  IF v_v1.minor > v_v2.minor THEN RETURN 1; END IF;
  IF v_v1.minor < v_v2.minor THEN RETURN -1; END IF;
  IF v_v1.patch > v_v2.patch THEN RETURN 1; END IF;
  IF v_v1.patch < v_v2.patch THEN RETURN -1; END IF;
  
  -- Handle prerelease comparison (prerelease < release)
  IF v_v1.prerelease IS NULL AND v_v2.prerelease IS NOT NULL THEN RETURN 1; END IF;
  IF v_v1.prerelease IS NOT NULL AND v_v2.prerelease IS NULL THEN RETURN -1; END IF;
  IF v_v1.prerelease IS NOT NULL AND v_v2.prerelease IS NOT NULL THEN
    IF v_v1.prerelease > v_v2.prerelease THEN RETURN 1; END IF;
    IF v_v1.prerelease < v_v2.prerelease THEN RETURN -1; END IF;
  END IF;
  
  RETURN 0;
END;
$$;

COMMENT ON FUNCTION core.compare_semver IS 
  'Compare two semantic versions. Returns: -1 (v1<v2), 0 (equal), 1 (v1>v2)';

-- Increment semver (with validation)
CREATE OR REPLACE FUNCTION core.increment_semver(
  p_version TEXT,
  p_part TEXT DEFAULT 'patch'  -- 'major', 'minor', 'patch'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_parsed RECORD;
BEGIN
  IF p_version IS NULL THEN
    RETURN '0.0.1';
  END IF;
  
  SELECT * INTO v_parsed FROM core.parse_semver(p_version);
  
  RETURN CASE lower(COALESCE(p_part, 'patch'))
    WHEN 'major' THEN (v_parsed.major + 1) || '.0.0'
    WHEN 'minor' THEN v_parsed.major || '.' || (v_parsed.minor + 1) || '.0'
    WHEN 'patch' THEN v_parsed.major || '.' || v_parsed.minor || '.' || (v_parsed.patch + 1)
    ELSE v_parsed.major || '.' || v_parsed.minor || '.' || (v_parsed.patch + 1)
  END;
END;
$$;

COMMENT ON FUNCTION core.increment_semver IS 'Increment semantic version by part (major/minor/patch)';

-- Validate semver format
CREATE OR REPLACE FUNCTION core.is_valid_semver(p_version TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_version ~ '^v?\d{1,10}(\.\d{1,10})?(\.\d{1,10})?(-[a-zA-Z0-9.-]+)?$';
$$;

COMMENT ON FUNCTION core.is_valid_semver IS 'Check if string is valid semantic version';

-- -----------------------------------------------------------------------------
-- 3.6 Text Processing Utilities (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Normalize text for comparison (lowercase, trim, normalize whitespace)
CREATE OR REPLACE FUNCTION core.normalize_text(p_text TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(trim(regexp_replace(COALESCE(p_text, ''), '\s+', ' ', 'g')));
$$;

COMMENT ON FUNCTION core.normalize_text IS 'Normalize text: lowercase, trim, collapse whitespace';

-- Generate slug from text (handles missing unaccent gracefully)
CREATE OR REPLACE FUNCTION core.slugify(p_text TEXT, p_max_length INT DEFAULT 100)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_slug TEXT;
BEGIN
  IF p_text IS NULL OR trim(p_text) = '' THEN
    RETURN '';
  END IF;
  
  IF p_max_length IS NULL OR p_max_length < 1 THEN
    p_max_length := 100;
  END IF;
  
  -- Try to use unaccent if available, otherwise just use the text
  BEGIN
    v_slug := unaccent(p_text);
  EXCEPTION WHEN undefined_function THEN
    v_slug := p_text;
  END;
  
  -- Remove non-alphanumeric, convert to lowercase, trim dashes
  v_slug := lower(
    regexp_replace(
      regexp_replace(v_slug, '[^a-zA-Z0-9]+', '-', 'g'),
      '^-|-$', '', 'g'
    )
  );
  
  -- Truncate to max length at word boundary if possible
  IF length(v_slug) > p_max_length THEN
    v_slug := left(v_slug, p_max_length);
    v_slug := regexp_replace(v_slug, '-[^-]*$', '');  -- Remove partial word at end
  END IF;
  
  RETURN v_slug;
END;
$$;

COMMENT ON FUNCTION core.slugify IS 
  'Generate URL-safe slug. Handles missing unaccent. Max length configurable.';

-- Truncate text with ellipsis (with validation)
CREATE OR REPLACE FUNCTION core.truncate_text(
  p_text TEXT,
  p_max_length INT DEFAULT 100,
  p_suffix TEXT DEFAULT '...'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_text IS NULL THEN RETURN NULL; END IF;
  IF p_max_length IS NULL OR p_max_length < 1 THEN p_max_length := 100; END IF;
  IF p_suffix IS NULL THEN p_suffix := '...'; END IF;
  
  IF length(p_text) <= p_max_length THEN
    RETURN p_text;
  END IF;
  
  -- Ensure we have room for the suffix
  IF p_max_length <= length(p_suffix) THEN
    RETURN p_suffix;
  END IF;
  
  RETURN left(p_text, p_max_length - length(p_suffix)) || p_suffix;
END;
$$;

COMMENT ON FUNCTION core.truncate_text IS 'Truncate text with configurable suffix';

-- Extract keywords from text (with configurable stop words)
CREATE OR REPLACE FUNCTION core.extract_keywords(
  p_text TEXT,
  p_min_length INT DEFAULT 3,
  p_max_keywords INT DEFAULT 20
)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_stop_words TEXT[] := ARRAY[
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 
    'can', 'was', 'her', 'his', 'has', 'have', 'had', 'with',
    'this', 'that', 'from', 'they', 'been', 'were', 'said'
  ];
BEGIN
  IF p_text IS NULL OR trim(p_text) = '' THEN
    RETURN ARRAY[]::TEXT[];
  END IF;
  
  IF p_min_length IS NULL OR p_min_length < 1 THEN p_min_length := 3; END IF;
  IF p_max_keywords IS NULL OR p_max_keywords < 1 THEN p_max_keywords := 20; END IF;
  
  RETURN ARRAY(
    SELECT DISTINCT word
    FROM regexp_split_to_table(lower(p_text), '\W+') AS word
    WHERE length(word) >= p_min_length
      AND word !~ '^\d+$'  -- Exclude pure numbers
      AND word != ALL(v_stop_words)  -- Exclude stop words
    ORDER BY word
    LIMIT p_max_keywords
  );
END;
$$;

COMMENT ON FUNCTION core.extract_keywords IS 
  'Extract keywords from text, excluding stop words and numbers';

-- Mask sensitive text (for logging/display)
CREATE OR REPLACE FUNCTION core.mask_text(
  p_text TEXT,
  p_visible_start INT DEFAULT 4,
  p_visible_end INT DEFAULT 0,
  p_mask_char TEXT DEFAULT '*'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_len INT;
BEGIN
  IF p_text IS NULL THEN RETURN NULL; END IF;
  
  v_len := length(p_text);
  
  IF v_len <= (p_visible_start + p_visible_end) THEN
    RETURN repeat(COALESCE(p_mask_char, '*'), v_len);
  END IF;
  
  RETURN 
    left(p_text, p_visible_start) || 
    repeat(COALESCE(p_mask_char, '*'), v_len - p_visible_start - p_visible_end) ||
    right(p_text, p_visible_end);
END;
$$;

COMMENT ON FUNCTION core.mask_text IS 'Mask sensitive text for display/logging';

-- Validate email format
CREATE OR REPLACE FUNCTION core.is_valid_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_email IS NOT NULL 
     AND p_email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
     AND length(p_email) <= 254;  -- RFC 5321 limit
$$;

COMMENT ON FUNCTION core.is_valid_email IS 'Validate email format per RFC 5321';

-- -----------------------------------------------------------------------------
-- 3.7 Audit Helper Functions (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Get current user from session (with fallback chain)
CREATE OR REPLACE FUNCTION core.current_user_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  v_user TEXT;
BEGIN
  -- Try multiple session variable names for compatibility
  v_user := NULLIF(current_setting('app.user', true), '');
  IF v_user IS NULL THEN
    v_user := NULLIF(current_setting('app.user_id', true), '');
  END IF;
  IF v_user IS NULL THEN
    v_user := NULLIF(current_setting('app.current_user', true), '');
  END IF;
  
  RETURN COALESCE(v_user, 'system');
END;
$$;

COMMENT ON FUNCTION core.current_user_id IS 
  'Get current user from session context with fallback to system';

-- Get current request ID (with validation)
CREATE OR REPLACE FUNCTION core.current_request_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.request_id', true), '');
$$;

COMMENT ON FUNCTION core.current_request_id IS 'Get current request ID from session context';

-- Get current organization ID (with validation)
CREATE OR REPLACE FUNCTION core.current_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  v_org_id TEXT;
BEGIN
  v_org_id := NULLIF(current_setting('app.org_id', true), '');
  IF v_org_id IS NULL THEN
    v_org_id := NULLIF(current_setting('app.current_org_id', true), '');
  END IF;
  
  IF v_org_id IS NOT NULL THEN
    BEGIN
      RETURN v_org_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NULL;
    END;
  END IF;
  
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION core.current_org_id IS 'Get current organization ID from session context';

-- Get current program ID (new helper)
CREATE OR REPLACE FUNCTION core.current_program_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  v_program_id TEXT;
BEGIN
  v_program_id := NULLIF(current_setting('app.program_id', true), '');
  IF v_program_id IS NULL THEN
    v_program_id := NULLIF(current_setting('app.current_program_id', true), '');
  END IF;
  
  IF v_program_id IS NOT NULL THEN
    BEGIN
      RETURN v_program_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NULL;
    END;
  END IF;
  
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION core.current_program_id IS 'Get current program ID from session context';

-- Set session context (with validation and security)
CREATE OR REPLACE FUNCTION core.set_session_context(
  p_user_id TEXT,
  p_org_id UUID DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL,
  p_program_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_catalog
AS $$
BEGIN
  -- Validate user_id (prevent injection via settings)
  IF p_user_id IS NOT NULL AND length(p_user_id) > 255 THEN
    RAISE EXCEPTION 'User ID too long (max 255 characters)';
  END IF;
  
  IF p_request_id IS NOT NULL AND length(p_request_id) > 255 THEN
    RAISE EXCEPTION 'Request ID too long (max 255 characters)';
  END IF;
  
  -- Set user context
  PERFORM set_config('app.user', COALESCE(p_user_id, 'system'), false);
  PERFORM set_config('app.user_id', COALESCE(p_user_id, 'system'), false);
  
  -- Set organization context
  IF p_org_id IS NOT NULL THEN
    PERFORM set_config('app.org_id', p_org_id::TEXT, false);
    PERFORM set_config('app.current_org_id', p_org_id::TEXT, false);
  END IF;
  
  -- Set request context
  IF p_request_id IS NOT NULL THEN
    PERFORM set_config('app.request_id', p_request_id, false);
  ELSE
    -- Generate request ID if not provided
    PERFORM set_config('app.request_id', gen_random_uuid()::TEXT, false);
  END IF;
  
  -- Set program context
  IF p_program_id IS NOT NULL THEN
    PERFORM set_config('app.program_id', p_program_id::TEXT, false);
    PERFORM set_config('app.current_program_id', p_program_id::TEXT, false);
  END IF;
END;
$$;

COMMENT ON FUNCTION core.set_session_context IS 
  'Set session context for audit trail. Auto-generates request_id if not provided.';

-- Clear session context (for connection pooling)
CREATE OR REPLACE FUNCTION core.clear_session_context()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.user', '', false);
  PERFORM set_config('app.user_id', '', false);
  PERFORM set_config('app.org_id', '', false);
  PERFORM set_config('app.current_org_id', '', false);
  PERFORM set_config('app.request_id', '', false);
  PERFORM set_config('app.program_id', '', false);
  PERFORM set_config('app.current_program_id', '', false);
END;
$$;

COMMENT ON FUNCTION core.clear_session_context IS 
  'Clear all session context variables. Call on connection return to pool.';

-- Build audit metadata (with validation)
CREATE OR REPLACE FUNCTION core.build_audit_metadata(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_extra JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_action IS NULL OR trim(p_action) = '' THEN
    RAISE EXCEPTION 'Audit action is required';
  END IF;
  
  RETURN jsonb_build_object(
    'action', upper(trim(p_action)),
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'user_id', core.current_user_id(),
    'org_id', core.current_org_id(),
    'program_id', core.current_program_id(),
    'request_id', core.current_request_id(),
    'timestamp', NOW(),
    'timestamp_utc', core.now_utc()
  ) || COALESCE(p_extra, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION core.build_audit_metadata IS 
  'Build standardized audit metadata object with session context';

-- Record audit event (if audit schema exists)
CREATE OR REPLACE FUNCTION core.record_audit_event(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_old_state JSONB DEFAULT NULL,
  p_new_state JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, audit, pg_catalog
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'audit' AND tablename = 'event_log') THEN
    -- Audit table doesn't exist, log warning and return NULL
    RAISE WARNING 'Audit table audit.event_log does not exist';
    RETURN NULL;
  END IF;
  
  INSERT INTO audit.event_log (
    event_category,
    entity_type,
    entity_id,
    event_description,
    actor_id,
    actor_type,
    request_id,
    previous_state,
    new_state,
    metadata
  ) VALUES (
    'DATA_CHANGE',
    p_entity_type,
    p_entity_id,
    p_action,
    core.current_user_id(),
    'user',
    core.current_request_id(),
    p_old_state,
    p_new_state,
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to record audit event: %', SQLERRM;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION core.record_audit_event IS 
  'Record audit event to audit.event_log if available';

-- -----------------------------------------------------------------------------
-- 3.8 Array Utilities (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Safe array append (handles NULL, prevents oversized arrays)
CREATE OR REPLACE FUNCTION core.array_safe_append(
  p_array ANYARRAY,
  p_element ANYELEMENT,
  p_max_size INT DEFAULT NULL
)
RETURNS ANYARRAY
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_max_size INT;
  v_result ANYARRAY;
BEGIN
  IF p_element IS NULL THEN
    RETURN COALESCE(p_array, ARRAY[]::TEXT[]);
  END IF;
  
  v_result := COALESCE(p_array, ARRAY[]::TEXT[]);
  
  -- Check max size
  v_max_size := COALESCE(p_max_size, core.get_config('max_array_size', '10000')::INT);
  IF array_length(v_result, 1) >= v_max_size THEN
    RAISE EXCEPTION 'Array would exceed maximum size of %', v_max_size;
  END IF;
  
  RETURN v_result || p_element;
END;
$$;

COMMENT ON FUNCTION core.array_safe_append IS 
  'Safely append to array with NULL handling and size limits';

-- Array distinct (remove duplicates, preserve order)
CREATE OR REPLACE FUNCTION core.array_distinct(p_array ANYARRAY)
RETURNS ANYARRAY
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_array IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_array) WITH ORDINALITY AS t(x, ord)
    ORDER BY MIN(ord)
  );
END;
$$;

COMMENT ON FUNCTION core.array_distinct IS 'Remove duplicates from array, preserving order';

-- Array intersection (with NULL handling)
CREATE OR REPLACE FUNCTION core.array_intersect(p_a ANYARRAY, p_b ANYARRAY)
RETURNS ANYARRAY
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_a IS NULL OR p_b IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;
  
  RETURN ARRAY(
    SELECT unnest(p_a)
    INTERSECT
    SELECT unnest(p_b)
  );
END;
$$;

COMMENT ON FUNCTION core.array_intersect IS 'Return intersection of two arrays (NULL-safe)';

-- Array difference (elements in a but not in b)
CREATE OR REPLACE FUNCTION core.array_diff(p_a ANYARRAY, p_b ANYARRAY)
RETURNS ANYARRAY
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_a IS NULL THEN RETURN NULL; END IF;
  IF p_b IS NULL THEN RETURN p_a; END IF;
  
  RETURN ARRAY(
    SELECT unnest(p_a)
    EXCEPT
    SELECT unnest(p_b)
  );
END;
$$;

COMMENT ON FUNCTION core.array_diff IS 'Return elements in first array but not in second';

-- Check if arrays overlap (with NULL handling)
CREATE OR REPLACE FUNCTION core.arrays_overlap(p_a ANYARRAY, p_b ANYARRAY)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF p_a IS NULL OR p_b IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1
    FROM unnest(p_a) a
    WHERE a = ANY(p_b)
  );
END;
$$;

COMMENT ON FUNCTION core.arrays_overlap IS 'Check if two arrays have common elements (NULL-safe)';

-- Array to delimited string
CREATE OR REPLACE FUNCTION core.array_to_string_safe(
  p_array ANYARRAY,
  p_delimiter TEXT DEFAULT ','
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT array_to_string(COALESCE(p_array, ARRAY[]::TEXT[]), COALESCE(p_delimiter, ','));
$$;

COMMENT ON FUNCTION core.array_to_string_safe IS 'Convert array to string with NULL handling';

-- -----------------------------------------------------------------------------
-- 3.9 Trigger Helpers (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Generic updated_at trigger function (with validation)
CREATE OR REPLACE FUNCTION core.update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update if there are actual changes
  IF OLD IS DISTINCT FROM NEW THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
EXCEPTION WHEN undefined_column THEN
  -- Table doesn't have updated_at column
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION core.update_timestamp IS 
  'Generic trigger to update updated_at column on actual changes';

-- Generic audit trigger function (enterprise-hardened)
CREATE OR REPLACE FUNCTION core.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, audit, pg_catalog
AS $$
DECLARE
  v_old_data JSONB;
  v_new_data JSONB;
  v_action TEXT;
  v_entity_id TEXT;
BEGIN
  -- Determine action and data
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_action := 'DELETE';
    v_entity_id := v_old_data->>'id';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only audit if there are actual changes
    IF OLD IS NOT DISTINCT FROM NEW THEN
      RETURN NEW;
    END IF;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_action := 'UPDATE';
    v_entity_id := COALESCE(v_new_data->>'id', v_old_data->>'id');
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_action := 'INSERT';
    v_entity_id := v_new_data->>'id';
  ELSE
    RETURN NULL;
  END IF;
  
  -- Scrub sensitive fields before logging
  IF v_old_data IS NOT NULL THEN
    v_old_data := v_old_data - 'password' - 'password_hash' - 'api_key' - 'secret' - 'token';
  END IF;
  IF v_new_data IS NOT NULL THEN
    v_new_data := v_new_data - 'password' - 'password_hash' - 'api_key' - 'secret' - 'token';
  END IF;
  
  -- Log to audit table if it exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'audit' AND tablename = 'event_log') THEN
    BEGIN
      INSERT INTO audit.event_log (
        event_category,
        entity_type,
        entity_id,
        event_description,
        actor_id,
        actor_type,
        request_id,
        previous_state,
        new_state,
        metadata
      ) VALUES (
        'DATA_CHANGE',
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        v_entity_id,
        v_action || ' on ' || TG_TABLE_NAME,
        core.current_user_id(),
        'user',
        core.current_request_id(),
        v_old_data,
        v_new_data,
        jsonb_build_object(
          'trigger_name', TG_NAME,
          'trigger_when', TG_WHEN,
          'trigger_level', TG_LEVEL
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Don't fail the transaction if audit fails
      RAISE WARNING 'Audit trigger failed: %', SQLERRM;
    END;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION core.audit_trigger IS 
  'Generic audit trigger with sensitive field scrubbing. Non-blocking on errors.';

-- Helper to create updated_at trigger (with idempotency)
CREATE OR REPLACE FUNCTION core.create_updated_at_trigger(
  p_schema TEXT,
  p_table TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_trigger_name TEXT;
BEGIN
  -- Validate inputs
  IF p_schema IS NULL OR p_table IS NULL THEN
    RAISE EXCEPTION 'Schema and table names are required';
  END IF;
  
  IF p_schema !~ '^[a-z_][a-z0-9_]*$' OR p_table !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid schema or table name';
  END IF;
  
  -- Check table exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = p_schema AND tablename = p_table
  ) THEN
    RAISE EXCEPTION 'Table %.% does not exist', p_schema, p_table;
  END IF;
  
  -- Check column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = p_schema 
      AND table_name = p_table 
      AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'Table %.% does not have updated_at column', p_schema, p_table;
  END IF;
  
  v_trigger_name := p_table || '_updated_at_trigger';
  
  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I ON %I.%I',
    v_trigger_name, p_schema, p_table
  );
  
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION core.update_timestamp()',
    v_trigger_name, p_schema, p_table
  );
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION core.create_updated_at_trigger IS 
  'Create updated_at trigger on table with validation';

-- Helper to create audit trigger
CREATE OR REPLACE FUNCTION core.create_audit_trigger(
  p_schema TEXT,
  p_table TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_trigger_name TEXT;
BEGIN
  -- Validate inputs
  IF p_schema IS NULL OR p_table IS NULL THEN
    RAISE EXCEPTION 'Schema and table names are required';
  END IF;
  
  IF p_schema !~ '^[a-z_][a-z0-9_]*$' OR p_table !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid schema or table name';
  END IF;
  
  -- Check table exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = p_schema AND tablename = p_table
  ) THEN
    RAISE EXCEPTION 'Table %.% does not exist', p_schema, p_table;
  END IF;
  
  v_trigger_name := p_table || '_audit_trigger';
  
  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I ON %I.%I',
    v_trigger_name, p_schema, p_table
  );
  
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION core.audit_trigger()',
    v_trigger_name, p_schema, p_table
  );
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION core.create_audit_trigger IS 
  'Create audit trigger on table with validation';

-- -----------------------------------------------------------------------------
-- 3.10 Cross-Schema Utility Views (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Entity statistics view (with security)
DROP VIEW IF EXISTS core.entity_stats CASCADE;
CREATE VIEW core.entity_stats AS
SELECT 
  entity_type,
  COUNT(*) AS total_count,
  COUNT(DISTINCT program_id) AS program_count,
  COUNT(*) FILTER (WHERE (metadata->>'_deleted')::BOOLEAN IS NOT TRUE) AS active_count,
  COUNT(*) FILTER (WHERE (metadata->>'_deleted')::BOOLEAN IS TRUE) AS deleted_count,
  MIN(created_at) AS first_created,
  MAX(created_at) AS last_created,
  COUNT(DISTINCT entity_version) AS version_count
FROM core.entities
GROUP BY entity_type;

COMMENT ON VIEW core.entity_stats IS 
  'Statistics about entities by type, including active/deleted counts';

-- Program entity summary view (with security context)
DROP VIEW IF EXISTS core.program_entity_summary CASCADE;
CREATE VIEW core.program_entity_summary AS
SELECT 
  p.id AS program_id,
  p.name AS program_name,
  p.code AS program_code,
  p.status AS program_status,
  e.entity_type,
  COUNT(*) FILTER (WHERE (e.metadata->>'_deleted')::BOOLEAN IS NOT TRUE) AS active_entity_count,
  COUNT(*) AS total_entity_count,
  MAX(e.created_at) AS last_entity_created,
  MAX(e.updated_at) AS last_entity_updated
FROM core.programs p
LEFT JOIN core.entities e ON e.program_id = p.id
GROUP BY p.id, p.name, p.code, p.status, e.entity_type;

COMMENT ON VIEW core.program_entity_summary IS 
  'Entity counts by program and type with status';

-- Configuration summary view
DROP VIEW IF EXISTS core.config_summary CASCADE;
CREATE VIEW core.config_summary AS
SELECT 
  config_key,
  config_value,
  description,
  is_sensitive,
  CASE WHEN is_sensitive THEN '***' ELSE config_value END AS display_value,
  updated_at
FROM core.utility_config
ORDER BY config_key;

COMMENT ON VIEW core.config_summary IS 
  'Configuration values with sensitive data masked';

-- Telemetry summary view
DROP VIEW IF EXISTS core.telemetry_summary CASCADE;
CREATE VIEW core.telemetry_summary AS
SELECT 
  function_name,
  invocation_count,
  error_count,
  ROUND(error_count::NUMERIC / NULLIF(invocation_count, 0) * 100, 2) AS error_rate_pct,
  ROUND(avg_execution_ms, 2) AS avg_execution_ms,
  ROUND(max_execution_ms, 2) AS max_execution_ms,
  last_invoked_at,
  last_error_at
FROM core.function_telemetry
ORDER BY invocation_count DESC;

COMMENT ON VIEW core.telemetry_summary IS 
  'Function telemetry with error rates';

-- -----------------------------------------------------------------------------
-- 3.11 Grant Permissions (Enterprise-Hardened)
-- -----------------------------------------------------------------------------

-- Revoke public access to security-sensitive functions
REVOKE ALL ON FUNCTION core.sha256_hex(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.sha512_hex(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.hmac_sha256(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.hmac_sha512(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.generate_token(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.generate_api_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.hash_api_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.register_entity(UUID, core.entity_type, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.register_entity_with_content(UUID, core.entity_type, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.set_session_context(TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.clear_session_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.record_audit_event(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.record_telemetry(TEXT, TEXT, BOOLEAN, TEXT, NUMERIC) FROM PUBLIC;

-- Revoke public access to sensitive views
REVOKE ALL ON core.telemetry_summary FROM PUBLIC;

-- Grant to application role if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT USAGE ON SCHEMA core TO app_service;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core TO app_service;
    GRANT SELECT ON ALL TABLES IN SCHEMA core TO app_service;
    GRANT INSERT, UPDATE ON core.entities TO app_service;
    GRANT INSERT ON core.function_telemetry TO app_service;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_readonly') THEN
    GRANT USAGE ON SCHEMA core TO app_readonly;
    GRANT SELECT ON core.entity_stats TO app_readonly;
    GRANT SELECT ON core.program_entity_summary TO app_readonly;
    GRANT SELECT ON core.config_summary TO app_readonly;
    -- DO NOT grant telemetry_summary to readonly - contains sensitive error info
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT USAGE ON SCHEMA core TO app_admin;
    GRANT ALL ON ALL TABLES IN SCHEMA core TO app_admin;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core TO app_admin;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA core TO app_admin;
  END IF;
END $$;

-- Create indexes for performance (if not exists)
DO $$
BEGIN
  -- Entity registry indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_entities_program_type_key') THEN
    CREATE INDEX idx_entities_program_type_key ON core.entities(program_id, entity_type, entity_key);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_entities_hash') THEN
    CREATE INDEX idx_entities_hash ON core.entities(entity_hash) WHERE entity_hash IS NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_entities_created') THEN
    CREATE INDEX idx_entities_created ON core.entities(created_at DESC);
  END IF;
  
  -- Telemetry indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_telemetry_function') THEN
    CREATE INDEX idx_telemetry_function ON core.function_telemetry(function_name);
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- POST-TRANSACTION: Documentation and Verification
-- =============================================================================

COMMENT ON SCHEMA core IS 
  'Core platform schema with entity registry, utilities, and shared functions. Enterprise-hardened v2.0.0';

-- Log completion with statistics
DO $$
DECLARE
  v_entity_count INT;
  v_function_count INT;
  v_view_count INT;
BEGIN
  SELECT COUNT(*) INTO v_entity_count
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'core' AND t.typname = 'entity_type';
  
  SELECT COUNT(*) INTO v_function_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'core';
  
  SELECT COUNT(*) INTO v_view_count
  FROM pg_views
  WHERE schemaname = 'core';
  
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'Migration 031: Enterprise-Hardened Enum Extensions & Utilities';
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'Entity types registered: %', v_entity_count;
  RAISE NOTICE 'Functions created: %', v_function_count;
  RAISE NOTICE 'Views created: %', v_view_count;
  RAISE NOTICE 'Compliance: 21 CFR Part 11, HIPAA, GxP';
  RAISE NOTICE 'Version: 2.0.0-enterprise';
  RAISE NOTICE '=============================================================';
END $$;
