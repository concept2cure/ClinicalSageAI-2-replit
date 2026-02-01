-- Part 11 §11.10(e): Audit trail immutability
CREATE ROLE app_role NOLOGIN;
CREATE ROLE app_user LOGIN PASSWORD 'app_secret';

-- State transitions table (append-only)
CREATE TABLE state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id VARCHAR(255) NOT NULL,
    from_state VARCHAR(100),
    to_state VARCHAR(100) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    signature_ref VARCHAR(500),
    content_hash VARCHAR(64) NOT NULL,  -- SHA-256
    merkle_root VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    fhir_audit_event JSONB
);

-- Part 11 compliance: Revoke UPDATE/DELETE from app user
REVOKE ALL ON state_transitions FROM app_user;
GRANT INSERT, SELECT ON state_transitions TO app_user;

-- Create trigger to reject updates/deletes (defense in depth)
CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Part 11 Compliance Error: State transitions are immutable. Attempted modification on %', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_state_transitions
BEFORE UPDATE OR DELETE ON state_transitions
FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Regulatory objects table (WORM storage reference)
CREATE TABLE regulatory_objects (
    id UUID PRIMARY KEY,
    s3_key VARCHAR(500) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    kms_key_id VARCHAR(255),
    object_lock_mode VARCHAR(10),
    retention_until TIMESTAMPTZ,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON regulatory_objects TO app_user;
