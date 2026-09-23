/**
 * AnA cannot sign. `finalize_protocol_document` used to finalize the protocol
 * and write a `command='sign'` ledger row with the user's id on it, from a chat
 * turn in which nobody re-authenticated. Finalizing is an electronic signature
 * (21 CFR 11.50/11.200): the person enters their password in the protocol
 * workspace. The tool now reports whether the protocol can be finalized and
 * says who has to do it. It writes nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const connect = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })), connect }),
}));
const recordGovernedAction = vi.fn();
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction }));

const finalizeProtocolTx = vi.fn();
const getCompleteness = vi.fn();
vi.mock('../../protocol-development/protocol-development-service', () => ({ finalizeProtocolTx, getCompleteness }));

import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const CTX = { organizationId: 7, userId: 42 } as never;

async function call(input: Record<string, unknown>) {
  const handler = getToolHandler('finalize_protocol_document');
  expect(handler).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('finalize_protocol_document never signs', () => {
  it('a complete protocol is not finalized by AnA: nothing is written, and the user is told to sign it', async () => {
    getCompleteness.mockResolvedValue({ readyToFinalize: true, requiredCompletionPct: 100, findings: [] });
    const r = await call({ document_id: 5, reason: 'Finalize it please' });
    expect(finalizeProtocolTx).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.signatureRequired).toBe(true);
    expect(r.readyToFinalize).toBe(true);
    expect(r.message).toMatch(/password/i);
    expect(r.message).toMatch(/not finalized/i);
  });

  it('an incomplete protocol reports what is missing', async () => {
    getCompleteness.mockResolvedValue({
      readyToFinalize: false,
      requiredCompletionPct: 60,
      findings: [{ severity: 'critical', message: 'Eligibility is empty.' }],
    });
    const r = await call({ document_id: 5 });
    expect(finalizeProtocolTx).not.toHaveBeenCalled();
    expect(r.readyToFinalize).toBe(false);
    expect(r.findings).toEqual([{ severity: 'critical', message: 'Eligibility is empty.' }]);
  });

  it('the tool description does not promise a finalization it cannot perform', () => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'finalize_protocol_document');
    expect(def?.description).toMatch(/cannot sign|does not finalize|signature/i);
    expect(def?.description).not.toMatch(/On success it snapshots/);
  });
});
