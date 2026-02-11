-- Migration: Phase 6.6.D — defense_packets table
-- First-class compliance artifact: versioned, signed, lifecycle-managed.
-- Links SE Matrix → Evidence Tasks → DOCX render → eCTD → Truth Machine.
-- Depends on: predicate schema (20260207_phase6_6a_fda_clearance_universe.sql)

-- ─────────────────────────────────────────────────────────────────────────────
-- Defense Packets (the "receipt")
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS predicate.defense_packets (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id              UUID NOT NULL,
    subject_hash            TEXT NOT NULL,
    predicate_k_number      TEXT NOT NULL,

    -- Risk code provenance
    risk_code_map_version   TEXT NOT NULL,
    risk_vocab_hash         TEXT NOT NULL,
    generator_version       TEXT NOT NULL DEFAULT '6.6.C2',

    -- Scoring
    defense_readiness_score INT NOT NULL CHECK (defense_readiness_score >= 0 AND defense_readiness_score <= 100),
    top_risks               JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Full-fidelity artifacts (JSONB for future-proof querying)
    tasks                   JSONB NOT NULL DEFAULT '[]'::jsonb,
    se_payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
    subject_device          JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_codes_used         JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Manifest / signature
    manifest_hash           TEXT NOT NULL UNIQUE,
    product_code            TEXT NOT NULL DEFAULT '',

    -- Lifecycle
    status                  VARCHAR(30) NOT NULL DEFAULT 'CREATED'
                            CHECK (status IN ('CREATED', 'RENDERING', 'RENDERED', 'FAILED', 'STALE')),
    staleness_reason        TEXT,

    -- Render linkage
    render_job_id           TEXT,

    -- Error tracking (for FAILED status)
    error_code              TEXT,
    error_detail            TEXT,

    -- Audit
    created_by_user_id      TEXT NOT NULL DEFAULT 'system',
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Diff linkage
    previous_packet_id      UUID REFERENCES predicate.defense_packets(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX idx_defense_packets_program     ON predicate.defense_packets(program_id);
CREATE INDEX idx_defense_packets_subject     ON predicate.defense_packets(subject_hash);
CREATE INDEX idx_defense_packets_manifest    ON predicate.defense_packets(manifest_hash);
CREATE INDEX idx_defense_packets_status      ON predicate.defense_packets(status);
CREATE INDEX idx_defense_packets_created     ON predicate.defense_packets(created_at DESC);
CREATE INDEX idx_defense_packets_program_sub ON predicate.defense_packets(program_id, subject_hash, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE predicate.defense_packets IS
    'Phase 6.6.D — Versioned, signed defense packet artifact. Immutable receipt linking SE Matrix + Evidence Tasks + DOCX render + eCTD. manifest_hash is the canonical join key across all downstream systems.';

COMMENT ON COLUMN predicate.defense_packets.manifest_hash IS
    'SHA-256 of canonicalized manifest JSON (excludes generated_at). Immutable, unique.';

COMMENT ON COLUMN predicate.defense_packets.staleness_reason IS
    'Human-readable reason when status=STALE (e.g. "risk_vocab_hash changed from abc123 to def456").';

COMMENT ON COLUMN predicate.defense_packets.previous_packet_id IS
    'Self-referencing FK for packet lineage. Enables diff between successive packets for the same program+subject.';
