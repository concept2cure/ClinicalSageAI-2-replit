/**
 * AnA protocol ⇄ study-design tools — the loop `docs/design/PROTOCOL_INTELLIGENCE.md`
 * §"AnA's part" binds: bind a protocol to a design, read the derivation diff, apply
 * only the paths a human accepted, and read the two deterministic verdict engines.
 *
 * What this suite exists to hold, beyond registration:
 *
 *  - **A governed tool refuses without tenant + user context**, and when the
 *    underlying Tx throws it ROLLS BACK and returns an `error` — never a partial
 *    success string. A handler that COMMITs after a throw writes half a change and
 *    reports it as a whole one.
 *  - **A `review_*` tool records NO governed action.** Looking at a diff is not a
 *    governed action, and an audit row that says otherwise is a false record.
 *  - **`apply_protocol_design_derivation` passes `accepted_paths` through unchanged
 *    and never sends a value.** The engine recomputes the value from the live rows;
 *    a tool that supplied one would let the model invent a governed number.
 *  - **`DerivationError` code `INVALID_STATE` (no design bound) comes back as an
 *    explanatory error, not as an empty derivation.** This is the one that matters:
 *    "the diff is empty" and "nothing is bound" are different facts, and collapsing
 *    them tells a user their protocol agrees with a design it was never joined to.
 *  - **Every definition's description names the engine as the source of its
 *    numbers** — asserted over the whole array, so a sixth tool cannot be added
 *    without it.
 *
 * RED-FIRST EVIDENCE: written before `protocol-design-tool-defs.ts` existed and
 * before any handler was registered, and observed failing — first on the
 * unresolved `../protocol-design-tool-defs` import, then, once the definitions
 * file was stubbed empty, on `bind_protocol_to_study_design must be registered`,
 * on the empty `PROTOCOL_DESIGN_TOOLS` array, and on the INVALID_STATE case.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Test doubles ────────────────────────────────────────────────────────────
// The handlers reach the database through `getPool().connect()` and their domain
// service through a dynamic import, exactly as the neighbouring protocol tools
// do. Both are replaced here so the suite asserts the CEREMONY (BEGIN, tenant
// context, the Tx call, the audit row, COMMIT/ROLLBACK, release) rather than SQL.

const queries: string[] = [];
const released: number[] = [];

const fakeClient = {
  query: vi.fn(async (sql: string) => {
    queries.push(String(sql).trim().split('\n')[0]);
    return { rows: [], rowCount: 0 };
  }),
  release: vi.fn(() => { released.push(1); }),
};

vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
  getPool: () => ({
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    connect: async () => fakeClient,
  }),
}));

const recordGovernedAction = vi.fn(async (_client: unknown, _entry: Record<string, unknown>) => ({ actionId: 'act_test', auditId: 'aud_test', sha256Chain: '' }));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction }));

const bindStudyDesignTx = vi.fn(async () => ({ studyDesignId: 'SD-1', title: 'A Phase 2 study' }));
vi.mock('../../protocol-development/protocol-development-service', () => ({ bindStudyDesignTx }));

const readDerivation = vi.fn();
const applyDerivationTx = vi.fn();
vi.mock('../../protocol-development/design-derivation-service', () => ({ readDerivation, applyDerivationTx }));

/* The two review tools read ONE protocol through assembleOnePdevDocFacets,
   which calls the same ruleFindingsFor and loadBoundDesigns the page assembly
   calls. They previously reached through assembleOrgPdevDocs and filtered,
   which read the whole tenant to answer about one document. `null` means the
   protocol does not exist for this organization — distinct from a protocol
   that exists and has nothing bound. */
const assembleOnePdevDocFacets = vi.fn();
vi.mock('../../protocol-development/pdev-view-assembler', () => ({ assembleOnePdevDocFacets }));

import { getToolHandler } from '../AnaToolExecutor';
import { PROTOCOL_DESIGN_TOOLS } from '../protocol-design-tool-defs';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const CTX = { organizationId: 7, userId: 42 } as never;

const GOVERNED = ['bind_protocol_to_study_design', 'apply_protocol_design_derivation'];
const READ_ONLY = [
  'review_protocol_design_derivation',
  'review_protocol_regulatory_rules',
  'review_protocol_design_gates',
];
const ALL = [...GOVERNED, ...READ_ONLY];

/** An empty derivation — every bucket present, nothing in any of them. */
const EMPTY_DERIVATION = { proposed: [], conflicts: [], unchanged: [], unevidenced: [], incomplete: [] };

function derivationError(code: string, message: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.name = 'DerivationError';
  err.code = code;
  return err;
}

async function call(name: string, input: Record<string, unknown>, ctx: unknown = CTX) {
  const handler = getToolHandler(name);
  expect(handler, `${name} must be registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, ctx as never));
}

beforeEach(() => {
  queries.length = 0;
  released.length = 0;
  vi.clearAllMocks();
  fakeClient.query.mockImplementation(async (sql: string) => {
    queries.push(String(sql).trim().split('\n')[0]);
    return { rows: [], rowCount: 0 };
  });
  bindStudyDesignTx.mockResolvedValue({ studyDesignId: 'SD-1', title: 'A Phase 2 study' });
  readDerivation.mockResolvedValue({ documentId: 5, studyDesignId: 'SD-1', derivation: EMPTY_DERIVATION });
  applyDerivationTx.mockResolvedValue({ studyDesignId: 'SD-1', applied: [], rejected: [], derivation: EMPTY_DERIVATION });
  assembleOnePdevDocFacets.mockResolvedValue(null);
});

// ─── Registration ────────────────────────────────────────────────────────────

describe('protocol ⇄ design AnA tools — registration', () => {
  it.each(ALL)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });

  it('exports exactly the five loop tools', () => {
    expect(PROTOCOL_DESIGN_TOOLS.map((t) => t.name).sort()).toEqual([...ALL].sort());
  });
});

// ─── The description contract (CLAUDE.md Rule 2) ──────────────────────────────

describe('protocol ⇄ design tool descriptions', () => {
  it('every description names the engine as the source of its numbers', () => {
    // Asserted over the array so a sixth tool cannot be added without it — and
    // the length check first, so an empty array cannot pass this vacuously.
    expect(PROTOCOL_DESIGN_TOOLS).toHaveLength(5);
    for (const tool of PROTOCOL_DESIGN_TOOLS) {
      expect(tool.description, `${tool.name} must name the engine`).toMatch(/engine/i);
      expect(tool.description, `${tool.name} must forbid estimating`).toMatch(/verbatim/i);
    }
  });

  it('no description claims a submission or transmission to an authority', () => {
    expect(PROTOCOL_DESIGN_TOOLS).toHaveLength(5);
    for (const tool of PROTOCOL_DESIGN_TOOLS) {
      expect(tool.description, `${tool.name} must not claim a transmission`).not.toMatch(/\b(submits?|transmits?) (it |this )?to (the )?(FDA|EMA|authority|agency)/i);
    }
  });

  it('apply_protocol_design_derivation explains conflicts and refuses incomplete paths', () => {
    const apply = PROTOCOL_DESIGN_TOOLS.find((t) => t.name === 'apply_protocol_design_derivation');
    expect(apply?.description).toMatch(/conflict/i);
    expect(apply?.description).toMatch(/incomplete/i);
    // It accepts PATHS, never values: the schema must not offer a value field.
    const props = Object.keys((apply?.input_schema as { properties?: Record<string, unknown> })?.properties ?? {});
    expect(props).toContain('accepted_paths');
    expect(props.some((p) => /value/i.test(p))).toBe(false);
  });

  it('the review tools tell the model to report not-assessed rather than a pass', () => {
    for (const name of ['review_protocol_regulatory_rules', 'review_protocol_design_gates']) {
      const tool = PROTOCOL_DESIGN_TOOLS.find((t) => t.name === name);
      expect(tool?.description, `${name} must carry the absent-is-not-zero rule`).toMatch(/not.?assessed|not a pass|absent/i);
    }
  });
});

// ─── Context guards ──────────────────────────────────────────────────────────

describe('protocol ⇄ design tools — context guards', () => {
  it.each(GOVERNED)('%s refuses without tenant + user context', async (name) => {
    const out = await call(name, { document_id: 5, study_design_id: 'SD-1', accepted_paths: ['title'] }, {});
    expect(out.error).toMatch(/tenant \+ user context/);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it.each(READ_ONLY)('%s refuses without tenant context', async (name) => {
    const out = await call(name, { document_id: 5 }, {});
    expect(out.error).toMatch(/tenant context/);
  });
});

// ─── bind_protocol_to_study_design ───────────────────────────────────────────

describe('bind_protocol_to_study_design', () => {
  it('binds on one transaction and records the governed action', async () => {
    const out = await call('bind_protocol_to_study_design', {
      document_id: 5, study_design_id: 'SD-1', reason: 'Design agreed at the kickoff.',
    });
    expect(out.ok).toBe(true);
    expect(out.studyDesignId).toBe('SD-1');
    expect(bindStudyDesignTx).toHaveBeenCalledWith(fakeClient, 7, 5, 'SD-1', 42);
    expect(queries).toContain('BEGIN');
    expect(queries).toContain('COMMIT');
    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
    const audit = recordGovernedAction.mock.calls[0]![1];
    expect(audit.domain).toBe('protocol_development');
    expect(audit.surface).toBe('ana');
    expect(audit.reason).toBe('Design agreed at the kickoff.');
    expect(released).toHaveLength(1);
  });

  it('rolls back and returns an error when the bind throws', async () => {
    bindStudyDesignTx.mockRejectedValueOnce(
      Object.assign(new Error('Study design not found for this organization.'), { code: 'NOT_FOUND' }),
    );
    const out = await call('bind_protocol_to_study_design', { document_id: 5, study_design_id: 'SD-X' });
    expect(out.ok).toBeUndefined();
    expect(out.error).toMatch(/Study design not found/);
    expect(out.code).toBe('NOT_FOUND');
    expect(queries).toContain('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
    expect(released).toHaveLength(1);
  });

  it('requires document_id and study_design_id', async () => {
    const out = await call('bind_protocol_to_study_design', { document_id: 5 });
    expect(out.error).toMatch(/required/i);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });
});

// ─── review_protocol_design_derivation ───────────────────────────────────────

describe('review_protocol_design_derivation', () => {
  it('returns the five buckets and records NO governed action', async () => {
    readDerivation.mockResolvedValueOnce({
      documentId: 5,
      studyDesignId: 'SD-1',
      derivation: {
        proposed: [{ path: 'title', value: 'A Phase 2 study', provenance: { table: 'protocol_documents', rowIds: [5], confidence: 'structured', note: 'protocol_documents.title' } }],
        conflicts: [{ path: 'phase', designValue: '3', protocolValue: '2', why: 'disagree', provenance: { table: 'protocol_documents', rowIds: [5], confidence: 'structured', note: 'phase' } }],
        unchanged: ['endpoints'],
        unevidenced: [{ path: 'statistics.alpha', reason: 'no register records it' }],
        incomplete: [{ path: 'objectives', partial: [], missing: ['endpointId'], reason: 'x', provenance: { table: 'protocol_objectives', rowIds: [1], confidence: 'structured', note: 'n' } }],
      },
    });
    const out = await call('review_protocol_design_derivation', { document_id: 5 });
    expect(out.ok).toBe(true);
    expect(out.studyDesignId).toBe('SD-1');
    expect(out.counts).toEqual({ proposed: 1, conflicts: 1, unchanged: 1, unevidenced: 1, incomplete: 1 });
    expect(out.derivation.conflicts[0].path).toBe('phase');
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('returns an explanatory error — not an empty derivation — when no design is bound', async () => {
    readDerivation.mockRejectedValueOnce(
      derivationError('INVALID_STATE', 'No study design is bound to this protocol, so there is nothing to derive into. Bind a design first.'),
    );
    const out = await call('review_protocol_design_derivation', { document_id: 5 });
    expect(out.ok).toBeUndefined();
    expect(out.derivation).toBeUndefined();
    expect(out.counts).toBeUndefined();
    expect(out.code).toBe('INVALID_STATE');
    expect(out.error).toMatch(/No study design is bound/);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });
});

// ─── apply_protocol_design_derivation ────────────────────────────────────────

describe('apply_protocol_design_derivation', () => {
  it('passes accepted_paths through unchanged and sends no value', async () => {
    applyDerivationTx.mockResolvedValueOnce({
      studyDesignId: 'SD-1',
      applied: ['title', 'phase'],
      rejected: [{ path: 'objectives', reason: 'The proposal is incomplete.' }],
      derivation: EMPTY_DERIVATION,
    });
    const out = await call('apply_protocol_design_derivation', {
      document_id: 5,
      accepted_paths: ['title', 'phase', 'objectives'],
      reason: 'Reviewed the diff with the study team.',
    });
    expect(out.ok).toBe(true);
    expect(out.applied).toEqual(['title', 'phase']);
    expect(out.rejected).toHaveLength(1);

    const args = applyDerivationTx.mock.calls[0]!;
    expect(args[0]).toBe(fakeClient);
    expect(args[1]).toBe(7);
    expect(args[2]).toBe(5);
    expect(args[3]).toEqual(['title', 'phase', 'objectives']);
    expect(args[4]).toBe(42);
    expect(args).toHaveLength(5);
    // Nothing in the call carries a VALUE: the engine recomputes it from the rows.
    expect(JSON.stringify(args).toLowerCase()).not.toContain('"value"');
  });

  it('records one governed action on the same transaction', async () => {
    await call('apply_protocol_design_derivation', {
      document_id: 5, accepted_paths: ['title'], reason: 'Reviewed with the study team.',
    });
    expect(queries).toContain('BEGIN');
    expect(queries).toContain('COMMIT');
    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
    const audit = recordGovernedAction.mock.calls[0]![1];
    expect(audit.domain).toBe('protocol_development');
    expect(audit.surface).toBe('ana');
  });

  it('rolls back and returns an error when the apply throws', async () => {
    applyDerivationTx.mockRejectedValueOnce(derivationError('BAD_INPUT', 'Name at least one path to accept.'));
    const out = await call('apply_protocol_design_derivation', { document_id: 5, accepted_paths: ['title'] });
    expect(out.ok).toBeUndefined();
    expect(out.error).toMatch(/Name at least one path/);
    expect(out.code).toBe('BAD_INPUT');
    expect(queries).toContain('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
    expect(released).toHaveLength(1);
  });

  it('refuses an empty or non-array accepted_paths before opening a transaction', async () => {
    const out = await call('apply_protocol_design_derivation', { document_id: 5, accepted_paths: [] });
    expect(out.error).toMatch(/accepted_paths/i);
    expect(queries).not.toContain('BEGIN');
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('reports "nothing applied" honestly rather than as a success', async () => {
    applyDerivationTx.mockResolvedValueOnce({
      studyDesignId: 'SD-1', applied: [],
      rejected: [{ path: 'objectives', reason: 'The proposal is incomplete.' }],
      derivation: EMPTY_DERIVATION,
    });
    const out = await call('apply_protocol_design_derivation', {
      document_id: 5, accepted_paths: ['objectives'], reason: 'Reviewed with the study team.',
    });
    expect(out.applied).toEqual([]);
    expect(out.message).toMatch(/no path|nothing/i);
  });
});

// ─── review_protocol_regulatory_rules ────────────────────────────────────────

describe('review_protocol_regulatory_rules', () => {
  it('returns the rule pack findings and the three counts verbatim', async () => {
    assembleOnePdevDocFacets.mockResolvedValueOnce(
      { kind: 'clinical', ruleFindings: { findings: [{ ruleId: 'M11-1', status: 'unmet' }, { ruleId: 'E9-2', status: 'not-assessed' }], assessed: 1, unmet: 1, notAssessed: 1 }, studyDesign: null },
    );
    const out = await call('review_protocol_regulatory_rules', { document_id: 5 });
    expect(out.ok).toBe(true);
    expect(out.assessed).toBe(1);
    expect(out.unmet).toBe(1);
    expect(out.notAssessed).toBe(1);
    expect(out.findings).toHaveLength(2);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('says the protocol was not found rather than returning zero findings', async () => {
    // The narrow reader returns null for a protocol this org does not have.
    assembleOnePdevDocFacets.mockResolvedValueOnce(null);
    const out = await call('review_protocol_regulatory_rules', { document_id: 5 });
    expect(out.ok).toBeUndefined();
    expect(out.error).toMatch(/not found/i);
    expect(out.findings).toBeUndefined();
  });
});

// ─── review_protocol_design_gates ────────────────────────────────────────────

describe('review_protocol_design_gates', () => {
  it('returns the design gate findings and counts from the validation engine', async () => {
    assembleOnePdevDocFacets.mockResolvedValueOnce(
      {
        kind: 'clinical',
        studyDesign: {
          studyId: 'SD-1', resolved: true, title: 'A Phase 2 study', riskLevel: 'medium',
          canAdvance: false, blocksApproval: true,
          counts: { critical: 1, major: 2, minor: 0, info: 3 },
          summary: 'One critical finding.', standardsChecked: ['ICH E9'],
          findings: [{ code: 'E9-1', sev: 'critical', title: 'No primary endpoint', text: 'x' }],
        },
      },
    );
    const out = await call('review_protocol_design_gates', { document_id: 5 });
    expect(out.ok).toBe(true);
    expect(out.studyDesignId).toBe('SD-1');
    expect(out.counts).toEqual({ critical: 1, major: 2, minor: 0, info: 3 });
    expect(out.blocksApproval).toBe(true);
    expect(out.findings).toHaveLength(1);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('says no design is bound rather than reporting a clean gate run', async () => {
    assembleOnePdevDocFacets.mockResolvedValueOnce({ kind: 'clinical', studyDesign: null });
    const out = await call('review_protocol_design_gates', { document_id: 5 });
    expect(out.ok).toBeUndefined();
    expect(out.findings).toBeUndefined();
    expect(out.counts).toBeUndefined();
    expect(out.error).toMatch(/no study design is bound/i);
  });

  it('says the link is unresolved rather than reporting a clean gate run', async () => {
    assembleOnePdevDocFacets.mockResolvedValueOnce(
      { kind: 'clinical', studyDesign: { studyId: 'SD-GONE', resolved: false, counts: { critical: 0, major: 0, minor: 0, info: 0 }, findings: [] } },
    );
    const out = await call('review_protocol_design_gates', { document_id: 5 });
    expect(out.ok).toBeUndefined();
    expect(out.findings).toBeUndefined();
    expect(out.error).toMatch(/could not be read|unresolved/i);
  });
});
