/**
 * Phase 6.6.D — Defense Packet Contract Parity Tests
 *
 * Ensures the TS shared types, Drizzle schema, and SQL migration
 * all agree on the defense_packets table structure.
 *
 * @phase 6.6.D
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── Path constants ──

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../db/migrations/20260211_phase6_6d_defense_packets.sql'
);

const DRIZZLE_SCHEMA_PATH = path.resolve(__dirname, '../shared/schema/defense-packets.ts');

const TS_TYPES_PATH = path.resolve(__dirname, '../shared/types/predicate-intelligence.ts');

const SQL_QUERIES_PATH = path.resolve(
  __dirname,
  '../shadow_service/shadow_service/sql_defense_packets.py'
);

const MODELS_PATH = path.resolve(
  __dirname,
  '../shadow_service/shadow_service/models_defense_packet.py'
);

// ── Loader helpers ──

function loadFile(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Migration file tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Defense Packet — SQL Migration', () => {
  const sql = loadFile(MIGRATION_PATH);

  it('creates predicate.defense_packets table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS predicate.defense_packets');
  });

  it('has UUID primary key with default', () => {
    expect(sql).toMatch(/id\s+UUID\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/);
  });

  it('has CHECK constraint for status', () => {
    expect(sql).toContain("status IN ('CREATED', 'RENDERING', 'RENDERED', 'FAILED', 'STALE')");
  });

  it('has manifest_hash UNIQUE constraint', () => {
    expect(sql).toMatch(/manifest_hash\s+TEXT\s+NOT NULL\s+UNIQUE/);
  });

  it('has self-referencing FK previous_packet_id', () => {
    expect(sql).toContain('REFERENCES predicate.defense_packets(id)');
  });

  it('has all 5 required JSONB columns', () => {
    const jsonbCols = ['top_risks', 'tasks', 'se_payload', 'subject_device', 'risk_codes_used'];
    for (const col of jsonbCols) {
      expect(sql).toContain(col);
    }
  });

  it('creates at least 5 indexes', () => {
    const indexCount = (sql.match(/CREATE INDEX/g) || []).length;
    expect(indexCount).toBeGreaterThanOrEqual(5);
  });

  it('has COMMENT ON TABLE', () => {
    expect(sql).toContain('COMMENT ON TABLE predicate.defense_packets');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Drizzle schema tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Defense Packet — Drizzle Schema', () => {
  const schema = loadFile(DRIZZLE_SCHEMA_PATH);

  it('exports defensePackets pgTable', () => {
    expect(schema).toContain('export const defensePackets');
    expect(schema).toContain('pgTable');
  });

  it('has DefensePacketStatus type', () => {
    expect(schema).toContain('DefensePacketStatus');
  });

  it('exports DefensePacket inferred type', () => {
    expect(schema).toContain('export type DefensePacket');
  });

  it('exports insertDefensePacketSchema', () => {
    expect(schema).toContain('insertDefensePacketSchema');
  });

  it('references defense_packets table name', () => {
    expect(schema).toContain("'defense_packets'");
  });

  it('has all 5 status values in schema', () => {
    const statuses = ['CREATED', 'RENDERING', 'RENDERED', 'FAILED', 'STALE'];
    for (const s of statuses) {
      expect(schema).toContain(s);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TS shared types tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Defense Packet — TS Shared Types', () => {
  const types = loadFile(TS_TYPES_PATH);

  it('exports DefensePacketStatus type', () => {
    expect(types).toContain('export type DefensePacketStatus');
  });

  it('DefensePacketStatus has all 5 values', () => {
    const statuses = ['CREATED', 'RENDERING', 'RENDERED', 'FAILED', 'STALE'];
    for (const s of statuses) {
      expect(types).toContain(`'${s}'`);
    }
  });

  it('exports CreateDefensePacketRequest interface', () => {
    expect(types).toContain('export interface CreateDefensePacketRequest');
  });

  it('exports CreateDefensePacketResponse interface', () => {
    expect(types).toContain('export interface CreateDefensePacketResponse');
  });

  it('exports DefensePacketDiffSummary interface', () => {
    expect(types).toContain('export interface DefensePacketDiffSummary');
  });

  it('exports DefensePacketStalenessResult interface', () => {
    expect(types).toContain('export interface DefensePacketStalenessResult');
  });

  it('exports DefensePacketRecord interface', () => {
    expect(types).toContain('export interface DefensePacketRecord');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Python SQL queries structural tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Defense Packet — Python SQL Queries', () => {
  const sql = loadFile(SQL_QUERIES_PATH);

  it('has INSERT_DEFENSE_PACKET', () => {
    expect(sql).toContain('INSERT_DEFENSE_PACKET');
  });

  it('has SELECT_PACKET_BY_ID', () => {
    expect(sql).toContain('SELECT_PACKET_BY_ID');
  });

  it('has SELECT_PACKET_BY_MANIFEST_HASH', () => {
    expect(sql).toContain('SELECT_PACKET_BY_MANIFEST_HASH');
  });

  it('has UPDATE_PACKET_STATUS', () => {
    expect(sql).toContain('UPDATE_PACKET_STATUS');
  });

  it('has MARK_PROGRAM_PACKETS_STALE', () => {
    expect(sql).toContain('MARK_PROGRAM_PACKETS_STALE');
  });

  it('all queries reference predicate.defense_packets', () => {
    // Count occurrences
    const matches = sql.match(/predicate\.defense_packets/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Python models structural tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Defense Packet — Python Models', () => {
  const models = loadFile(MODELS_PATH);

  it('has VALID_STATUS_TRANSITIONS', () => {
    expect(models).toContain('VALID_STATUS_TRANSITIONS');
  });

  it('has DefensePacketRecord', () => {
    expect(models).toContain('class DefensePacketRecord');
  });

  it('has CreateDefensePacketRequest', () => {
    expect(models).toContain('class CreateDefensePacketRequest');
  });

  it('has CreateDefensePacketResponse', () => {
    expect(models).toContain('class CreateDefensePacketResponse');
  });

  it('has DefensePacketDiffSummary', () => {
    expect(models).toContain('class DefensePacketDiffSummary');
  });

  it('has StalenessCheckResult', () => {
    expect(models).toContain('class StalenessCheckResult');
  });

  it('has is_valid_transition function', () => {
    expect(models).toContain('def is_valid_transition');
  });

  it('status values match between Python and TS', () => {
    const statuses = ['CREATED', 'RENDERING', 'RENDERED', 'FAILED', 'STALE'];
    const tsTypes = loadFile(TS_TYPES_PATH);

    for (const s of statuses) {
      expect(models).toContain(`"${s}"`);
      expect(tsTypes).toContain(`'${s}'`);
    }
  });
});
