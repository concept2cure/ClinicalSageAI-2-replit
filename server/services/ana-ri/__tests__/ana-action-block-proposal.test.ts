/**
 * An `ana-action` block in AnA's reply is a proposal a person confirms, never
 * a write (security audit 2026-09-24 DP-08; plan P0-12 residual, 2026-10-01).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * Both chat paths — the live stream's post-processing and POST /api/chat —
 * hand the model's reply to processResponseActions
 * (server/services/ana-guidance-executor.ts). A fenced ```ana-action block at
 * "strong" or "moderate" confidence, which the persona tells the model to emit,
 * created a governed artifact in the project at once, and a `review_thread`
 * block opened a review thread with a comment in the PERSON'S name. No one was
 * asked. The command partition (command-rbac.ts) and the tool register
 * (tool-authorization.ts) that make every other write a proposal never saw it:
 * this was a third door beside them, with its own writes.
 *
 * ── What is pinned here ─────────────────────────────────────────────────────
 * The block is translated into the canonical `create_artifact` command and put
 * through executeCommands — the same partition, RBAC and propose-only gate as
 * a ```command block — with no person's confirmation on the context, so what
 * comes back is the HUMAN_CONFIRMATION_REQUIRED proposal the client already
 * renders as a sign-off prompt. Confirming it (POST /api/ana-ri/governed-action
 * stamps humanConfirmed) runs the canonical handler. Nothing is written before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rbac = vi.hoisted(() => ({ hasRole: vi.fn(async () => true) }));
vi.mock('../../roleBasedAccess', () => ({
  default: { hasRole: (...a: unknown[]) => (rbac.hasRole as any)(...a), getUserRoles: async () => [] },
}));

// Every artifact write in either path goes through executeGovernedAnaOperation;
// the review thread went through the drizzle client's transaction.
const writes = vi.hoisted(() => ({
  governed: vi.fn(async () => ({
    persistenceStatus: 'persisted',
    artifactMutation: { artifactId: 501, isNew: true, sectionCode: '3.2.S.7' },
  })),
  transaction: vi.fn(async () => 9001),
  query: vi.fn(async () => ({ rows: [] as any[], rowCount: 0 })),
}));
vi.mock('../../governed-ana-execution.js', () => ({ executeGovernedAnaOperation: writes.governed }));
const poolStub = vi.hoisted(() => ({
  query: (...a: unknown[]) => (writes.query as any)(...a),
  connect: async () => {
    throw new Error('no transaction expected');
  },
}));
vi.mock('../../../db', () => ({
  db: { transaction: writes.transaction, insert: () => { throw new Error('no insert expected'); } },
  pool: poolStub,
  getPool: () => poolStub,
  getDb: () => ({}),
}));

import { processResponseActions } from '../../ana-guidance-executor';
import { executeCommands } from '../command-executor';

const CONTENT = [
  '## Summary',
  'The drug substance stability package lacks the six-month accelerated data that ICH Q1A(R2) expects for the proposed retest period, so the shelf-life claim in 3.2.S.7 is not yet supported.',
  '## Evidence',
  '[KNOWN] Long-term data at 25C/60%RH cover 12 months for three primary batches. [MISSING] Accelerated 40C/75%RH data beyond 3 months.',
  '## Recommendation',
  'Complete the accelerated study on the three primary batches and revise the retest period justification before the pre-IND package is assembled.',
].join('\n');

const block = (over: Record<string, unknown>) =>
  '```ana-action\n' + JSON.stringify({ type: 'memo', confidence: 'strong', title: 'Risk Memo: Accelerated Stability', content: CONTENT, sectionCode: '3.2.S.7', ...over }) + '\n```';

const reply = (b: string) => `Here is the gap and what to do about it.\n\n${b}\n\nI can draft the protocol amendment next.`;

const turn = { projectId: 5, organizationId: 61, userId: 7, userName: 'Rita Ortiz', threadId: 'th_9' };

beforeEach(() => {
  rbac.hasRole.mockReset();
  rbac.hasRole.mockResolvedValue(true);
  writes.governed.mockClear();
  writes.transaction.mockClear();
  writes.query.mockReset();
  writes.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

function proposalsOf(out: unknown): any[] {
  return ((out as { proposals?: unknown[] }).proposals ?? []) as any[];
}

describe('an ana-action block from the model writes nothing', () => {
  it('a strong memo becomes a confirm-tier create_artifact proposal; no artifact is created', async () => {
    const out = await processResponseActions(reply(block({})), turn);

    expect(writes.governed, 'an artifact was created on the model’s word').not.toHaveBeenCalled();
    const [p, ...rest] = proposalsOf(out);
    expect(rest).toEqual([]);
    expect(p).toMatchObject({
      success: false,
      error: 'HUMAN_CONFIRMATION_REQUIRED',
      action: 'create_artifact',
      data: { tier: 'confirm', proposedByAgent: true, retry: { command: 'create_artifact' } },
    });
    expect(p.data.retry.params).toMatchObject({
      projectId: 5,
      title: 'Risk Memo: Accelerated Stability',
      content: CONTENT,
      type: 'memo',
      ctdSection: '3.2.S.7',
    });
    // The block is the platform's, not the person's: it is taken out of the text.
    expect(out.cleanedText).not.toContain('ana-action');
    expect(out.cleanedText).toContain('I can draft the protocol amendment next.');
    // ...and the text says what became of it: proposed, nothing saved yet.
    expect(out.cleanedText).toMatch(/Risk Memo: Accelerated Stability.*proposed for saving.*Nothing is saved until you confirm it/i);
  });

  it('a reply of nothing but a strong block shows the draft the person is asked to confirm', async () => {
    // The sign-off card shows 77 characters of each parameter; the draft must be readable before a yes.
    const out = await processResponseActions(block({}), turn);
    expect(proposalsOf(out)).toHaveLength(1);
    expect(out.cleanedText).toContain(CONTENT);
    expect(out.cleanedText).toMatch(/Nothing is saved until you confirm it/);
    expect(out.cleanedText).not.toMatch(/executed successfully/i);
  });

  it('a review_thread block opens no thread and writes no comment in the person’s name', async () => {
    const out = await processResponseActions(
      reply(block({ type: 'review_thread', confidence: 'moderate', title: 'Review: stability gap' })),
      turn,
    );

    expect(writes.transaction, 'a review thread was opened unasked').not.toHaveBeenCalled();
    expect(writes.governed).not.toHaveBeenCalled();
    const [p] = proposalsOf(out);
    expect(p).toMatchObject({ error: 'HUMAN_CONFIRMATION_REQUIRED', data: { retry: { command: 'create_artifact' } } });
    expect(p.data.retry.params.title).toBe('[Review Context] Review: stability gap');
  });

  it('provisional and uncertain blocks propose nothing and write nothing', async () => {
    const out = await processResponseActions(
      reply(block({ confidence: 'provisional' }) + '\n\n' + block({ confidence: 'uncertain', title: 'Other' })),
      turn,
    );
    expect(proposalsOf(out)).toEqual([]);
    expect(writes.governed).not.toHaveBeenCalled();
    expect(writes.transaction).not.toHaveBeenCalled();
    expect(out.cleanedText).toMatch(/Risk Memo: Accelerated Stability.*Not saved\. AnA marked it provisional/);
    expect(out.cleanedText).toMatch(/Other.*Not saved\. AnA marked it uncertain/);
  });

  it('someone who may not create the artifact is told so, and is not asked to confirm it', async () => {
    rbac.hasRole.mockResolvedValue(false);
    const out = await processResponseActions(reply(block({})), turn);
    const [p] = proposalsOf(out);
    expect(p).toMatchObject({ success: false, error: 'RBAC_DENIED' });
    expect(writes.governed).not.toHaveBeenCalled();
    // The answer says it was not saved, with the refusal — never that it ran.
    expect(out.cleanedText).toContain(`Not saved. ${p.message}`);
  });

  it('a refused block in a reply of nothing but blocks keeps the draft on screen', async () => {
    rbac.hasRole.mockResolvedValue(false);
    const out = await processResponseActions(block({}), turn);
    expect(out.cleanedText).toContain(CONTENT);
    expect(out.cleanedText).toMatch(/Not saved\./);
  });

  it('without an integer project the block is not proposed against a guessed one', async () => {
    // parseInt('7abb1c22-…') is 7: a valid, wrong project (ADR-0011).
    const out = await processResponseActions(reply(block({})), { ...turn, projectId: '7abb1c22-1111-4222-8333-944445555666' as any });
    expect(proposalsOf(out)).toEqual([]);
    expect(writes.governed).not.toHaveBeenCalled();
    expect(out.cleanedText).toMatch(/Not saved\. This conversation is not scoped to a project/);
  });
});

describe('the proposal is the canonical command, so a person’s yes runs the canonical handler', () => {
  it('confirmed through the governed route’s context, create_artifact writes the proposed content', async () => {
    const [p] = proposalsOf(await processResponseActions(reply(block({})), turn));
    expect(writes.governed).not.toHaveBeenCalled();

    // What POST /api/ana-ri/governed-action does with { command, params, confirm: true }.
    const [ran] = await executeCommands([{ command: p.data.retry.command, params: p.data.retry.params } as any], {
      userId: 7,
      organizationId: 61,
      humanConfirmed: true,
    });
    expect(ran).toMatchObject({ success: true, action: 'create_artifact' });
    expect(writes.governed).toHaveBeenCalledTimes(1);
    const arg = (writes.governed.mock.calls[0] as unknown as [any])[0];
    expect(arg.artifactMutation).toMatchObject({ projectId: 5, organizationId: 61, title: 'Risk Memo: Accelerated Stability', content: CONTENT });
  });
});

describe('there is one write path for an AnA artifact', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../ana-guidance-executor.ts'), 'utf8');

  it('the action-block module writes nothing itself', () => {
    // Booleans, so a failure names the rule rather than printing the file.
    expect(/executeGovernedAnaOperation/.test(src), 'writes an artifact itself').toBe(false);
    expect(/concept2cureReviewThreads|concept2cureThreadComments|\.insert\(/.test(src), 'writes a thread or comment itself').toBe(false);
    expect(/humanConfirmed\s*:/.test(src), 'asserts a confirmation').toBe(false);
  });

  it('both chat paths hand the proposals to the response the sign-off prompt reads', () => {
    const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../../routes', rel), 'utf8');
    for (const file of ['ana-ri/post-processing.ts', 'chat/send-message.ts']) {
      const s = read(file);
      // One answer for both paths: settleActionBlocks decides what the person reads.
      expect(s.includes('settleActionBlocks('), `${file} calls settleActionBlocks`).toBe(true);
      expect(s.includes('processResponseActions('), `${file} settles the blocks itself`).toBe(false);
      expect(/\.proposals\b/.test(s), `${file} must return the proposals as executedCommands`).toBe(true);
      expect(/executedCommands/.test(s), file).toBe(true);
    }
  });
});
