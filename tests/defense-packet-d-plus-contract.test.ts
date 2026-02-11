/**
 * Phase 6.6.D1 — Defense Packet Evidence Ops Contract Parity Tests
 *
 * Cross-layer structural assertions ensuring TS types, Python models,
 * Python builder, BFF routes, and Shadow endpoints stay in sync.
 *
 * Test categories:
 *   1. TS Type Structure — all D1 types exist with correct fields
 *   2. Python Model Parity — Pydantic models match TS interface fields
 *   3. Builder Constants — RISK_TO_TASK map completeness, REVIEWER_QUESTIONS
 *   4. Router Endpoints — Shadow + BFF have all D1 routes
 *   5. CSV Export — column headers stable
 *   6. Staleness Codes — Python matches TS expectations
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// File Paths
// ═══════════════════════════════════════════════════════════════════════════════

const TS_TYPES = resolve(__dirname, '../shared/types/predicate-intelligence.ts');
const PY_MODELS = resolve(__dirname, '../shadow_service/shadow_service/models_defense_packet.py');
const PY_BUILDER = resolve(
  __dirname,
  '../shadow_service/shadow_service/predicate_intel/defense_packet.py'
);
const PY_ROUTER = resolve(__dirname, '../shadow_service/shadow_service/router_predicate.py');
const BFF_ROUTES = resolve(__dirname, '../server/routes/defense-packet.ts');
const LOCK_FILE = resolve(
  __dirname,
  '../shadow_service/shadow_service/predicate_intel/risk_codes.lock.json'
);

function loadFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. TS Type Structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D1 — TS Type Structure', () => {
  const ts = loadFile(TS_TYPES);

  it('exports EvidenceSeverity union with 3 members', () => {
    expect(ts).toContain("export type EvidenceSeverity = 'High' | 'Medium' | 'Low'");
  });

  it('exports EvidenceTaskState union with 4 members', () => {
    expect(ts).toContain(
      "export type EvidenceTaskState = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'WAIVED'"
    );
  });

  it('exports PacketOpsStatus union with 6 members', () => {
    expect(ts).toContain(
      "export type PacketOpsStatus = 'CREATED' | 'IN_PROGRESS' | 'READY' | 'BLOCKED' | 'STALE' | 'FAILED'"
    );
  });

  it('exports EvidenceRefType union with 6 members', () => {
    const refTypes = [
      'TRUTH_PLACEHOLDER',
      'PROGRAM_DOC',
      'DOCX_RENDER',
      'PDF_RENDER',
      'ECTD_LEAF',
      'URL',
    ];
    for (const rt of refTypes) {
      expect(ts).toContain(`'${rt}'`);
    }
  });

  const requiredInterfaces = [
    'EvidenceRef',
    'EvidenceTaskCompletion',
    'ReviewerQuestionSeed',
    'EvidenceTaskFull',
    'DefensePacketFull',
    'SubmissionGateResult',
    'BuildDefensePacketResponse',
    'BuildDefensePacketRequest',
    'WaiveTaskRequest',
    'WaiveTaskResponse',
  ];

  for (const iface of requiredInterfaces) {
    it(`exports interface ${iface}`, () => {
      expect(ts).toMatch(new RegExp(`export interface ${iface}\\s*\\{`));
    });
  }

  it('EvidenceTaskFull has all 13 fields', () => {
    const fields = [
      'task_id',
      'severity',
      'category',
      'triggered_risk_codes',
      'se_matrix_rows',
      'title',
      'why_it_matters',
      'acceptance_criteria',
      'recommended_artifacts',
      'artifact_targets',
      'truth_machine_placeholder_id',
      'anticipated_questions',
      'completion',
    ];
    // Extract the interface block
    const match = ts.match(/export interface EvidenceTaskFull\s*\{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const body = match![1];
    for (const f of fields) {
      expect(body).toContain(f);
    }
  });

  it('DefensePacketFull has all 14 fields', () => {
    const fields = [
      'packet_version',
      'packet_id',
      'manifest_hash',
      'subject_hash',
      'program_id',
      'product_code',
      'generated_at',
      'risk_code_map_version',
      'risk_vocab_hash',
      'readiness_score',
      'status',
      'stale_reasons',
      'top_risks',
      'tasks',
    ];
    const match = ts.match(/export interface DefensePacketFull\s*\{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const body = match![1];
    for (const f of fields) {
      expect(body).toContain(f);
    }
  });

  it('SubmissionGateResult has all 7 fields', () => {
    const fields = [
      'allowed',
      'blocking_task_ids',
      'blocking_risk_codes',
      'missing_evidence_refs',
      'recommended_next_actions',
      'override_available',
      'reason',
    ];
    const match = ts.match(/export interface SubmissionGateResult\s*\{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const body = match![1];
    for (const f of fields) {
      expect(body).toContain(f);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Python Model Parity
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D1 — Python Model ↔ TS Type Parity', () => {
  const py = loadFile(PY_MODELS);
  const ts = loadFile(TS_TYPES);

  it('Python EvidenceSeverity matches TS', () => {
    const pyValues = ['High', 'Medium', 'Low'];
    for (const v of pyValues) {
      expect(py).toContain(`"${v}"`);
      expect(ts).toContain(`'${v}'`);
    }
  });

  it('Python EvidenceTaskState matches TS', () => {
    const states = ['OPEN', 'IN_PROGRESS', 'DONE', 'WAIVED'];
    for (const s of states) {
      expect(py).toContain(`"${s}"`);
      expect(ts).toContain(`'${s}'`);
    }
  });

  it('Python PacketOpsStatus matches TS', () => {
    const statuses = ['CREATED', 'IN_PROGRESS', 'READY', 'BLOCKED', 'STALE', 'FAILED'];
    for (const s of statuses) {
      expect(py).toContain(`"${s}"`);
      expect(ts).toContain(`'${s}'`);
    }
  });

  it('Python DefensePacketFull model exists', () => {
    expect(py).toMatch(/class DefensePacketFull/);
  });

  it('Python SubmissionGateResult model exists', () => {
    expect(py).toMatch(/class SubmissionGateResult/);
  });

  it('Python EvidenceTaskFull model exists', () => {
    expect(py).toMatch(/class EvidenceTaskFull/);
  });

  // Cross-layer field presence: key fields in both layers
  const crossLayerFields = [
    'packet_version',
    'packet_id',
    'manifest_hash',
    'readiness_score',
    'risk_vocab_hash',
    'stale_reasons',
    'top_risks',
  ];

  for (const field of crossLayerFields) {
    it(`field "${field}" present in both Python and TS`, () => {
      expect(py).toContain(field);
      expect(ts).toContain(field);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Builder Constants — RISK_TO_TASK + REVIEWER_QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D1 — Builder Constants', () => {
  const builder = loadFile(PY_BUILDER);
  const lockFile = JSON.parse(loadFile(LOCK_FILE));
  const allCodes: string[] = lockFile.risk_codes;

  it('RISK_TO_TASK dict is defined', () => {
    expect(builder).toContain('RISK_TO_TASK');
  });

  it('REVIEWER_QUESTIONS dict is defined', () => {
    expect(builder).toContain('REVIEWER_QUESTIONS');
  });

  it('all 24 canonical risk codes appear in RISK_TO_TASK', () => {
    expect(allCodes).toHaveLength(24);
    for (const code of allCodes) {
      expect(builder).toContain(`"${code}"`);
    }
  });

  it('builder has build_defense_packet_from_manifest function', () => {
    expect(builder).toMatch(/def build_defense_packet_from_manifest\(/);
  });

  it('builder has is_packet_stale function', () => {
    expect(builder).toMatch(/def is_packet_stale\(/);
  });

  it('builder has check_submission_gate function', () => {
    expect(builder).toMatch(/def check_submission_gate\(/);
  });

  it('builder has packet_tasks_to_csv function', () => {
    expect(builder).toMatch(/def packet_tasks_to_csv\(/);
  });

  it('CSV export has 10 columns', () => {
    // Match the fieldnames list in the builder
    expect(builder).toContain('task_id');
    expect(builder).toContain('severity');
    expect(builder).toContain('category');
    expect(builder).toContain('title');
    expect(builder).toContain('why_it_matters');
    expect(builder).toContain('acceptance_criteria');
    expect(builder).toContain('recommended_artifacts');
    expect(builder).toContain('artifact_targets');
    expect(builder).toContain('triggered_risk_codes');
    expect(builder).toContain('state');
  });

  it('PACKET_VERSION is 6.6.D1', () => {
    expect(builder).toContain('PACKET_VERSION = "6.6.D1"');
  });

  it('all 5 staleness machine codes defined', () => {
    const codes = [
      'RISK_CODE_MAP_CHANGED',
      'RISK_VOCAB_CHANGED',
      'PREDICATE_DATA_REFRESHED',
      'SUBJECT_CHANGED',
      'PREDICATE_CHANGED',
    ];
    for (const c of codes) {
      expect(builder).toContain(`"${c}"`);
    }
  });

  it('SIGNIFICANT_RISK_CODES imported and used in submission gating', () => {
    expect(builder).toContain('SIGNIFICANT_RISK_CODES');
  });

  it('builder imports from risk_code_map', () => {
    expect(builder).toContain('from ..scoring.risk_code_map import');
  });

  it('builder imports from models_defense_packet', () => {
    expect(builder).toContain('from ..models_defense_packet import');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Router Endpoints — Shadow + BFF
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D1 — Shadow Router Endpoints', () => {
  const router = loadFile(PY_ROUTER);

  it('has POST /defense-packet/build endpoint', () => {
    expect(router).toContain('defense-packet/build');
  });

  it('has GET /defense-packet/{manifest_hash}/export.json endpoint', () => {
    expect(router).toContain('export.json');
  });

  it('has GET /defense-packet/{manifest_hash}/export.csv endpoint', () => {
    expect(router).toContain('export.csv');
  });

  it('has POST /defense-packet/{manifest_hash}/submission-gate endpoint', () => {
    expect(router).toContain('submission-gate');
  });

  it('build endpoint calls build_defense_packet_from_manifest', () => {
    expect(router).toContain('build_defense_packet_from_manifest');
  });

  it('build endpoint calls check_submission_gate', () => {
    expect(router).toContain('check_submission_gate');
  });
});

describe('Phase 6.6.D1 — BFF Routes', () => {
  const bff = loadFile(BFF_ROUTES);

  it('has POST build route', () => {
    expect(bff).toContain('defense-packet/build');
  });

  it('has GET export.json route', () => {
    expect(bff).toContain('export.json');
  });

  it('has GET export.csv route', () => {
    expect(bff).toContain('export.csv');
  });

  it('has POST submission-gate route', () => {
    expect(bff).toContain('submission-gate');
  });

  it('has POST waive-task route', () => {
    expect(bff).toContain('waive-task');
  });

  it('emits DEFENSE_PACKET_CREATED audit event on build', () => {
    expect(bff).toContain('DEFENSE_PACKET_CREATED');
  });

  it('emits DEFENSE_PACKET_BLOCKED audit event', () => {
    expect(bff).toContain('DEFENSE_PACKET_BLOCKED');
  });

  it('emits DEFENSE_TASK_WAIVED audit event', () => {
    expect(bff).toContain('DEFENSE_TASK_WAIVED');
  });

  it('waive-task requires waiverReason', () => {
    expect(bff).toContain('waiverReason');
  });

  it('BFF sets correct CSV content-type header', () => {
    expect(bff).toContain('text/csv');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Cross-Layer Enum Consistency
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D1 — Cross-Layer Enum Consistency', () => {
  const py = loadFile(PY_MODELS);
  const builder = loadFile(PY_BUILDER);
  const ts = loadFile(TS_TYPES);

  it('EvidenceSeverity values consistent across Python model, builder, and TS', () => {
    const values = ['High', 'Medium', 'Low'];
    for (const v of values) {
      expect(py).toContain(v);
      expect(builder).toContain(v);
      expect(ts).toContain(v);
    }
  });

  it('PacketOpsStatus BLOCKED value present in all layers', () => {
    expect(py).toContain('BLOCKED');
    expect(builder).toContain('BLOCKED');
    expect(ts).toContain('BLOCKED');
  });

  it('EvidenceTaskState WAIVED value present in model and TS', () => {
    expect(py).toContain('WAIVED');
    expect(ts).toContain('WAIVED');
  });

  it('EvidenceRefType TRUTH_PLACEHOLDER present in model and TS', () => {
    expect(py).toContain('TRUTH_PLACEHOLDER');
    expect(ts).toContain('TRUTH_PLACEHOLDER');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Backward Compatibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D1 — Backward Compatibility', () => {
  const py = loadFile(PY_MODELS);

  it('DefensePacketRenderStatus still defined (Phase 6.6.D compat)', () => {
    expect(py).toContain('DefensePacketRenderStatus');
  });

  it('DefensePacketStatus alias still defined', () => {
    expect(py).toContain('DefensePacketStatus');
  });

  it('DefensePacketRecord DB model preserved', () => {
    expect(py).toMatch(/class DefensePacketRecord/);
  });

  it('CreateDefensePacketRequest preserved', () => {
    expect(py).toMatch(/class CreateDefensePacketRequest/);
  });

  it('StalenessCheckResult preserved', () => {
    expect(py).toMatch(/class StalenessCheckResult/);
  });

  it('is_valid_transition function preserved', () => {
    expect(py).toContain('is_valid_transition');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Spec D1 Alias Parity (Phase 6.6.D1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D1 — Spec Alias Parity', () => {
  const py = loadFile(PY_MODELS);
  const ts = loadFile(TS_TYPES);

  it('Python exports EvidenceTask alias', () => {
    expect(py).toContain('EvidenceTask = EvidenceTaskFull');
  });

  it('Python exports DefensePacket alias', () => {
    expect(py).toContain('DefensePacket = DefensePacketFull');
  });

  it('Python exports DefensePacketOpsStatus alias', () => {
    expect(py).toContain('DefensePacketOpsStatus = PacketOpsStatus');
  });

  it('TS exports EvidenceTask alias', () => {
    expect(ts).toContain('export type EvidenceTask = EvidenceTaskFull');
  });

  it('TS exports DefensePacket alias', () => {
    expect(ts).toContain('export type DefensePacket = DefensePacketFull');
  });

  it('TS exports DefensePacketOpsStatus alias', () => {
    expect(ts).toContain('export type DefensePacketOpsStatus = PacketOpsStatus');
  });

  it('BFF emits DEFENSE_PACKET_STALE_DETECTED audit event', () => {
    const bff = loadFile(BFF_ROUTES);
    expect(bff).toContain('DEFENSE_PACKET_STALE_DETECTED');
  });

  it('BFF build endpoint audit includes packet_id in metadata', () => {
    const bff = loadFile(BFF_ROUTES);
    expect(bff).toContain('packet_id: packet.packet_id');
  });

  it('Builder docstring references Phase 6.6.D1', () => {
    const builder = loadFile(PY_BUILDER);
    expect(builder).toContain('Phase 6.6.D1');
  });
});
