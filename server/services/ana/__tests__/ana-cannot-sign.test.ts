/**
 * AnA cannot sign.
 *
 * Nine AnA tools finalized, certified, executed or approved a record and wrote a
 * `command='sign'` ledger row with the user's id on it, from a chat turn: no
 * approval step, no password, no electronic_signatures row, and a canned reason
 * ("DMS plan finalized via AnA") when none was given. Traced 2026-09-23: any
 * organization could reach them, whatever its launch scope, because nothing in
 * AnA's tool path consults the launch catalog or module entitlements. Two of them
 * also skipped a check their HTTP route enforces (the committee approve
 * privilege; the sponsor's prior approval of a no-cost extension, which the model
 * could waive by passing authority 'sponsor').
 *
 * An electronic signature needs the signer to re-enter their password (21 CFR
 * 11.200), and a chat turn cannot collect it. So each of these tools now writes
 * nothing, and says who has to do it and where. The same rule
 * finalize_protocol_document follows.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { connect, recordGovernedAction } = vi.hoisted(() => ({
  connect: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() })),
  recordGovernedAction: vi.fn(),
}));
vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })), connect },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })), connect }),
}));
vi.mock('../../../db.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })), connect },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })), connect }),
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction }));
vi.mock('../../../routes/c2c/actions.js', () => ({ recordGovernedAction }));
// The registry wrapper's editor-role read (part11/editor-role.ts), for the one
// confirm-class tool below that reaches its handler: an editor.
vi.mock('../../part11/editor-role', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../part11/editor-role')>()),
  editorRoleDecision: async () => ({ allowed: true, role: 'admin' }),
}));

import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const CTX = { organizationId: 7, userId: 42 } as never;

/** Each tool with an input that would have passed its old validation. */
const SIGNING_TOOLS: Array<[string, Record<string, unknown>]> = [
  ['finalize_dms_plan', { plan_id: 3, reason: 'Plan is complete' }],
  ['certify_other_support', { document_id: 3, reason: 'Certifying other support' }],
  ['finalize_biosketch', { biosketch_id: 3, reason: 'Biosketch is complete' }],
  ['finalize_export_control_determination', { determination_id: 3, id: 3, reason: 'Determination made' }],
  ['execute_research_agreement', { agreement_id: 3, id: 3, reason: 'Agreement executed' }],
  ['finalize_committee_determination', { agenda_item_id: 3, outcome: 'approved', reason: 'Committee voted' }],
  ['finalize_grant_closeout', { award_id: 3, reason: 'Closeout complete' }],
  ['execute_subaward', { subaward_id: 3, reason: 'Subaward executed' }],
  ['approve_no_cost_extension', { nce_id: 3, authority: 'sponsor', reason: 'Sponsor approved' }],
  // A QMS controlled document made effective from chat: no password, no
  // signing-authority check, no author ≠ approver check, no signature row
  // (new-code audit 2026-09-24, finding 1; the signed route is VSR-001 F-3).
  ['approve_qms_document', { document_id: 3, reason: 'Ready for release' }],
  // 2026-09-28 (Q-0928-1 / SEC-0928-1): retired a controlled document from chat
  // with a reason and nothing else, while POST /api/mdx/qms/documents/:id/retire
  // runs verifyApprovalSigner + retireQmsDocumentSigned.
  ['retire_qms_document', { document_id: 3, reason: 'Superseded by SOP-401.' }],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AnA refuses every act that is an electronic signature', () => {
  it.each(SIGNING_TOOLS)('%s writes nothing and hands the act to the person', async (name, input) => {
    const handler = getToolHandler(name);
    expect(handler, `${name} must stay registered so a request gets an answer`).toBeTypeOf('function');
    const out = JSON.parse(await handler!(input, CTX));
    expect(connect).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
    expect(out.signatureRequired).toBe(true);
    expect(out.message).toMatch(/electronic signature/i);
    expect(out.message).toMatch(/password/i);
    expect(out.message).toMatch(/nothing was (recorded|changed)/i);
  });

  it.each(SIGNING_TOOLS.map(([n]) => n))('%s is described as a hand-off, not an act', (name) => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === name);
    expect(def?.description).toMatch(/AnA cannot sign/);
  });
});

/*
 * P1-34: the tool register (tool-authorization.register.json) marks each of
 * these `refuse`, refused by the handler itself — so the registry wrapper and
 * the tool gate let the handler answer rather than replacing its answer with a
 * generic one. That is only safe while every such handler is pinned to write
 * nothing; this file is the pin, and the last case holds the two lists equal.
 */
const OTHER_HANDLER_REFUSALS: Array<[string, Record<string, unknown>]> = [
  ['approve_rbm_assessment', { assessmentId: 3, reason: 'Assessment reviewed' }],
  ['approve_rbm_plan', { planId: 3, reason: 'Plan reviewed' }],
  ['transmit_submission', { region: 'fda', gateway: 'esg', environment: 'production', bundle_path: '/tmp/x.zip' }],
];
/** Pinned in its own file: finalize-protocol-tool.test.ts. */
const PINNED_ELSEWHERE = ['finalize_protocol_document'];

describe('the register lets a handler refuse only where the handler is pinned', () => {
  it.each(OTHER_HANDLER_REFUSALS)('%s writes nothing, even on a confirmation', async (name, input) => {
    const out = JSON.parse(await getToolHandler(name)!(input, { organizationId: 7, userId: 42, humanConfirmed: true } as never));
    expect(connect).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(out.ok === false || typeof out.error === 'string').toBe(true);
    expect(JSON.stringify(out)).toMatch(/password|second factor|re-authentication/i);
  });

  it('transmit_submission points to the sequence, not the retired package transmit (audit 2026-10-17)', async () => {
    /* Gateway transmittals became a read-only log on 2026-10-17; transmit runs
       on the sequence (Submission Center → Dispatch, POST
       /api/submissions/sequences/:id/transmit). The refusal named the package
       endpoint, which production now refuses. */
    const out = JSON.parse(await getToolHandler('transmit_submission')!(
      { region: 'fda', gateway: 'esg', environment: 'production', bundle_path: '/tmp/x.zip' },
      { organizationId: 7, userId: 42, humanConfirmed: true } as never,
    ));
    expect(out.ok).toBe(false);
    expect(out.next_step.surface).toBe('Submission Center');
    expect(out.next_step.endpoint).toBe('POST /api/submissions/sequences/:id/transmit');
    expect(JSON.stringify(out)).not.toMatch(/\/api\/mdx\/gateways\/[^"]*\/transmit/);
  });

  it('retire_qms_document refuses as a signature and points to the Retire action', async () => {
    const out = JSON.parse(await getToolHandler('retire_qms_document')!(
      { document_id: 3, reason: 'Superseded by SOP-401.' },
      { organizationId: 7, userId: 42, humanConfirmed: true } as never,
    ));
    expect(connect).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
    expect(out.signatureRequired).toBe(true);
    expect(out.message).toMatch(/electronic signature/i);
    expect(out.message).toMatch(/nothing was (recorded|changed)/i);
    expect(out.message).toMatch(/Retire/);
    expect(out.message).toMatch(/second factor/i);
  });

  it('every handler-refused tool in the register is pinned here or named', async () => {
    const { TOOL_REGISTER } = await import('../tool-authorization');
    const refusedByHandler = Object.entries(TOOL_REGISTER).filter(([, e]) => e.refusedBy === 'handler').map(([n]) => n).sort();
    const pinned = [...SIGNING_TOOLS, ...OTHER_HANDLER_REFUSALS].map(([n]) => n).concat(PINNED_ELSEWHERE).sort();
    expect(refusedByHandler).toEqual(pinned);
  });
});

/*
 * P-40 (2026-10-19): recording a PMR, PMC or REMS as fulfilled is a signed act
 * that names the sequence or Vault version that met it. AnA's
 * fulfill_regulatory_commitment cannot sign, so for those three it reads the
 * commitment's type, writes nothing and hands the act to the screen. Its own
 * describe: unlike SIGNING_TOOLS it does connect, because the type is read
 * from the record, never taken from the model.
 */
describe('fulfill_regulatory_commitment refuses a signed fulfilment (P-40)', () => {
  function clientWith(type: string) {
    const sql: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        sql.push(text);
        return { rows: /regulatory_commitments/.test(text) ? [{ id: 3, commitment_type: type, status: 'open', submission_id: null, project_id: null, source_communication_event_id: null, visibility_tier: null, fulfilled_date: '2026-10-01' }] : [] };
      }),
      release: vi.fn(),
    };
    connect.mockResolvedValueOnce(client as never);
    return sql;
  }

  it.each(['pmr', 'pmc', 'rems'])('a %s: writes nothing, says AnA cannot sign, and points to Meetings & commitments', async (type) => {
    const sql = clientWith(type);
    const out = JSON.parse(await getToolHandler('fulfill_regulatory_commitment')!(
      { commitment_id: 3, fulfilled_date: '2026-10-01', reason: 'Final study report filed.' },
      { organizationId: 7, userId: 42, humanConfirmed: true } as never,
    ));
    expect(out.ok).toBe(false);
    expect(out.signatureRequired).toBe(true);
    expect(out.message).toMatch(/AnA cannot sign/);
    expect(out.message).toMatch(/Meetings & commitments/);
    expect(out.message).toMatch(/nothing was recorded/i);
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(sql.some((s) => /UPDATE\s+regulatory_commitments/i.test(s))).toBe(false);
  });

  it('a meeting commitment is still fulfilled from chat, as a governed resolve', async () => {
    const sql = clientWith('meeting_commitment');
    recordGovernedAction.mockResolvedValueOnce({ actionId: 'a', auditId: 'b', sha256Chain: 'c' });
    const out = JSON.parse(await getToolHandler('fulfill_regulatory_commitment')!(
      { commitment_id: 3, fulfilled_date: '2026-10-01', reason: 'Minutes sent as agreed.' },
      { organizationId: 7, userId: 42, humanConfirmed: true } as never,
    ));
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(sql.some((s) => /UPDATE\s+regulatory_commitments/i.test(s))).toBe(true);
    expect(recordGovernedAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ command: 'resolve', target: 'regulatory-commitment:3' }));
  });

  it('is described as handing a PMR, PMC or REMS to the person', () => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'fulfill_regulatory_commitment');
    expect(def?.description).toMatch(/AnA cannot sign/);
    expect(def?.description).toMatch(/PMR/);
    expect(def?.description).toMatch(/fulfilled/);
  });
});
