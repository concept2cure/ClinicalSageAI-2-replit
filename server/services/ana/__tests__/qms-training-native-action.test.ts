/** The native trainee action stays non-delegable even if a caller lets the
 * tool's own refusal handler answer. No provider or real database is used. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ handlerAnswers: false, sql: [] as string[] }));
vi.mock('../tool-authorization.js', async original => {
  const actual = await original<typeof import('../tool-authorization')>();
  return { ...actual, toolAuthorizationOf: (name: string, input: Record<string, unknown>) => {
    const result = actual.toolAuthorizationOf(name, input);
    return (name === 'ack_training' || name === 'create_qms_document') && h.handlerAnswers ? { ...result, refusedBy: 'handler' as const, needsHumanConfirmation: false } : result;
  } };
});
vi.mock('../tool-record-scope.js', () => ({ foreignProgramRefusal: async () => null, foreignRecordRefusal: async () => null }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: vi.fn(async () => 'member') }));
vi.mock('../../../db', async original => {
  const actual = await original<typeof import('../../../db')>();
  const query = async (sql: string) => {
    h.sql.push(sql);
    if (/SELECT version FROM qms_documents/.test(sql)) return { rows: [{ version: '1.0' }], rowCount: 1 };
    return { rows: [{ id: 41, document_version: '1.0', expires_at: '2027-10-14T00:00:00.000Z' }], rowCount: 1 };
  };
  return { ...actual, pool: { ...actual.pool, query }, getPool: () => ({ query }) };
});

import { getToolHandler } from '../AnaToolExecutor';
import { approvedToolHandler } from './support/approved-tool-handler';

beforeEach(() => { h.handlerAnswers = false; h.sql.length = 0; });
const input = { document_id: 41, method: 'trainer_verified', quiz_score: 100, user_id: 99 };
const context = { organizationId: 7, userId: 42 };

describe('Quality training is the trainee’s native personal action', () => {
  it.each([false, true])('does not delegate an acknowledgement to AnA with humanConfirmed=%s', async humanConfirmed => {
    const result = JSON.parse(await getToolHandler('ack_training')!(input, { ...context, humanConfirmed }));
    expect(result).toMatchObject({ error: 'NOT_AN_ANA_ACTION', tool: 'ack_training' });
    expect(h.sql).toEqual([]);
  });

  it('its own handler refuses without reading or writing when permitted to answer', async () => {
    h.handlerAnswers = true;
    const result = JSON.parse(await getToolHandler('ack_training')!(input, { ...context, humanConfirmed: true }));
    expect(result).toMatchObject({ error: 'NOT_AN_ANA_ACTION', tool: 'ack_training' });
    expect(result.message).toContain('Quality');
    expect(result.message).toContain('Acknowledge this revision');
    expect(h.sql).toEqual([]);
  });

  it('does not accept fictional controlled-text authorship on document creation', async () => {
    h.handlerAnswers = true;
    const result = JSON.parse(await approvedToolHandler('create_qms_document')!({
      doc_number: 'SOP-QA-014', title: 'Document control', doc_type: 'sop',
      metadata: { controlledTextAuthorship: { authorUserIds: [99] } },
    }, { ...context, humanConfirmed: true }));
    expect(result.error).toContain('cannot be supplied on creation');
    expect(h.sql).toEqual([]);
  });
});
