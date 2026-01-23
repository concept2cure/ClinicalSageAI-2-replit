-- =============================================================================
-- Migration 019: Idempotency Keys for API Write Operations
-- =============================================================================
-- Purpose: Implement replay protection for write endpoints
--
-- This migration provides:
--   1. Idempotency key storage with TTL
--   2. Response caching for replay
--   3. Automatic cleanup of expired keys
--
-- Enterprise pattern: Prevents duplicate operations from retries
-- =============================================================================

BEGIN;

-- =============================================================================
-- A) Idempotency Keys Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Key identification
  idempotency_key TEXT NOT NULL,              -- Client-provided key
  program_id UUID REFERENCES core.programs(id),
  route TEXT NOT NULL,                        -- API route (e.g., POST /fragments)
  
  -- Request fingerprint
  request_hash TEXT,                          -- Hash of request body for verification
  
  -- Response caching
  response_status INT NOT NULL,               -- HTTP status code
  response_body JSONB,                        -- Cached response
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,            -- TTL for cleanup
  
  -- Attribution
  actor TEXT,
  request_id TEXT,
  
  -- Unique per program + key + route
  UNIQUE (program_id, idempotency_key, route)
);

COMMENT ON TABLE audit.idempotency_keys IS 
  'Idempotency key storage for replay protection on write operations';

COMMENT ON COLUMN audit.idempotency_keys.idempotency_key IS 
  'Client-provided key (typically UUID or timestamp-based)';

COMMENT ON COLUMN audit.idempotency_keys.expires_at IS 
  'Keys are automatically cleaned up after expiration (default 24h)';

-- Indexes
CREATE INDEX IF NOT EXISTS idempotency_keys_lookup_idx 
  ON audit.idempotency_keys (program_id, idempotency_key, route);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx 
  ON audit.idempotency_keys (expires_at);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx 
  ON audit.idempotency_keys (created_at DESC);

-- =============================================================================
-- B) Helper Functions
-- =============================================================================

-- Check if idempotency key exists and return cached response
CREATE OR REPLACE FUNCTION audit.check_idempotency_key(
  p_key TEXT,
  p_program_id UUID,
  p_route TEXT,
  p_request_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
  found BOOLEAN,
  response_status INT,
  response_body JSONB,
  original_request_id TEXT,
  hash_matches BOOLEAN
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    TRUE AS found,
    ik.response_status,
    ik.response_body,
    ik.request_id AS original_request_id,
    CASE 
      WHEN p_request_hash IS NULL THEN TRUE
      WHEN ik.request_hash IS NULL THEN TRUE
      ELSE ik.request_hash = p_request_hash
    END AS hash_matches
  FROM audit.idempotency_keys ik
  WHERE ik.idempotency_key = p_key
    AND ik.program_id IS NOT DISTINCT FROM p_program_id
    AND ik.route = p_route
    AND ik.expires_at > NOW()
  LIMIT 1;
$$;

-- Store idempotency key with response
CREATE OR REPLACE FUNCTION audit.store_idempotency_key(
  p_key TEXT,
  p_program_id UUID,
  p_route TEXT,
  p_response_status INT,
  p_response_body JSONB,
  p_request_hash TEXT DEFAULT NULL,
  p_ttl_hours INT DEFAULT 24
)
RETURNS UUID
LANGUAGE SQL
AS $$
  INSERT INTO audit.idempotency_keys (
    idempotency_key, program_id, route,
    request_hash, response_status, response_body,
    expires_at, actor, request_id
  )
  VALUES (
    p_key, p_program_id, p_route,
    p_request_hash, p_response_status, p_response_body,
    NOW() + (p_ttl_hours || ' hours')::INTERVAL,
    COALESCE(current_setting('app.user', true), 'unknown'),
    current_setting('app.request_id', true)
  )
  ON CONFLICT (program_id, idempotency_key, route) DO UPDATE SET
    -- Don't update - return existing
    idempotency_key = audit.idempotency_keys.idempotency_key
  RETURNING id;
$$;

-- Cleanup expired keys (called by background job)
CREATE OR REPLACE FUNCTION audit.cleanup_expired_idempotency_keys()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM audit.idempotency_keys
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- =============================================================================
-- C) Request Correlation Table (for distributed tracing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.request_correlations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Correlation chain
  request_id TEXT NOT NULL UNIQUE,            -- X-Request-ID header
  parent_request_id TEXT,                     -- Parent request (for nested calls)
  trace_id TEXT,                              -- Distributed trace ID (OpenTelemetry)
  span_id TEXT,                               -- Span ID
  
  -- Request metadata
  actor TEXT NOT NULL,
  program_id UUID REFERENCES core.programs(id),
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  
  -- Result
  status_code INT,
  error_type TEXT,
  error_message TEXT,
  
  -- Context (for debugging)
  context JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE audit.request_correlations IS 
  'Request correlation for distributed tracing and debugging';

CREATE INDEX IF NOT EXISTS request_correlations_request_id_idx 
  ON audit.request_correlations (request_id);

CREATE INDEX IF NOT EXISTS request_correlations_trace_idx 
  ON audit.request_correlations (trace_id);

CREATE INDEX IF NOT EXISTS request_correlations_actor_idx 
  ON audit.request_correlations (actor, started_at DESC);

CREATE INDEX IF NOT EXISTS request_correlations_started_idx 
  ON audit.request_correlations (started_at DESC);

-- =============================================================================
-- D) Rate Limiting Table (token bucket)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Bucket identification
  bucket_key TEXT NOT NULL,                   -- e.g., "actor:user@example.com"
  bucket_type TEXT NOT NULL,                  -- 'actor', 'program', 'ip', 'global'
  
  -- Token bucket state
  tokens FLOAT NOT NULL,
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Configuration
  max_tokens FLOAT NOT NULL DEFAULT 100,
  refill_rate FLOAT NOT NULL DEFAULT 10,     -- tokens per second
  
  UNIQUE (bucket_key, bucket_type)
);

COMMENT ON TABLE audit.rate_limit_buckets IS 
  'Token bucket state for rate limiting';

CREATE INDEX IF NOT EXISTS rate_limit_buckets_key_idx 
  ON audit.rate_limit_buckets (bucket_key, bucket_type);

-- Check and consume token
CREATE OR REPLACE FUNCTION audit.check_rate_limit(
  p_bucket_key TEXT,
  p_bucket_type TEXT,
  p_tokens_requested FLOAT DEFAULT 1,
  p_max_tokens FLOAT DEFAULT 100,
  p_refill_rate FLOAT DEFAULT 10
)
RETURNS TABLE (
  allowed BOOLEAN,
  tokens_remaining FLOAT,
  retry_after_seconds FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_bucket audit.rate_limit_buckets%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_elapsed_seconds FLOAT;
  v_new_tokens FLOAT;
BEGIN
  -- Get or create bucket
  SELECT * INTO v_bucket
  FROM audit.rate_limit_buckets
  WHERE bucket_key = p_bucket_key AND bucket_type = p_bucket_type
  FOR UPDATE;
  
  IF v_bucket IS NULL THEN
    -- Create new bucket with full tokens
    INSERT INTO audit.rate_limit_buckets (bucket_key, bucket_type, tokens, max_tokens, refill_rate)
    VALUES (p_bucket_key, p_bucket_type, p_max_tokens - p_tokens_requested, p_max_tokens, p_refill_rate)
    RETURNING * INTO v_bucket;
    
    RETURN QUERY SELECT TRUE, v_bucket.tokens, 0::FLOAT;
    RETURN;
  END IF;
  
  -- Calculate refilled tokens
  v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_bucket.last_refill_at));
  v_new_tokens := LEAST(v_bucket.max_tokens, v_bucket.tokens + (v_elapsed_seconds * v_bucket.refill_rate));
  
  -- Check if enough tokens
  IF v_new_tokens >= p_tokens_requested THEN
    -- Consume tokens
    UPDATE audit.rate_limit_buckets
    SET tokens = v_new_tokens - p_tokens_requested,
        last_refill_at = v_now
    WHERE id = v_bucket.id;
    
    RETURN QUERY SELECT TRUE, v_new_tokens - p_tokens_requested, 0::FLOAT;
  ELSE
    -- Not enough tokens
    UPDATE audit.rate_limit_buckets
    SET tokens = v_new_tokens,
        last_refill_at = v_now
    WHERE id = v_bucket.id;
    
    RETURN QUERY SELECT 
      FALSE, 
      v_new_tokens, 
      (p_tokens_requested - v_new_tokens) / v_bucket.refill_rate;
  END IF;
END;
$$;

COMMIT;
