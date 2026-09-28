/**
 * Promote-to-document recorded a model it had not used.
 *
 * `POST /conversations/:id/promote` turns a Regulatory Intelligence conversation
 * into a governed draft artifact. Until 2026-09-23 it pinned `gpt-4o-mini` — a
 * model the approved-models registry does not approve for regulatory drafting —
 * and then wrote `provider: 'openai', model: 'gpt-4o-mini', generationMode:
 * 'ai_generated'` onto the record whatever had happened. When the model call
 * failed, the fallback exported the conversation text verbatim and still
 * labelled it as that model's output.
 *
 * Now:
 *   - the draft is routed as `document_drafting` with no model pinned, so the
 *     gateway serves it with an approved model or refuses;
 *   - the record's provider/model are what the response says served it;
 *   - the conversation-export fallback is recorded as IMPORTED with no model,
 *     on the contract and on the persisted provenance event.
 *
 * Failure is injected at the dependency — `ai.chat` rejects the way the
 * gateway does when no approved model is available.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const S = vi.hoisted(() => ({
  chat: [] as Array<Record<string, unknown>>,
  chatImpl: null as null | ((req: Record<string, unknown>) => Promise<Record<string, unknown>>),
  evaluationPasses: true,
  contracts: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../auth', () => ({
  authMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireOrganizationContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  concept2cureRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../../lib/unified-ai-client', () => ({
  ai: {
    chat: async (req: Record<string, unknown>) => {
      S.chat.push(req);
      if (!S.chatImpl) throw new Error('no chat behaviour set');
      return S.chatImpl(req);
    },
  },
}));
// The intelligence engine is deterministic and tested on its own; here it is
// held still so the test controls whether the evaluation gate asks for a retry.
vi.mock('../../../services/intelligence-engine/index.js', () => ({
  runIntelligencePipeline: () => ({}),
  buildConstrainedPrompt: () => 'Constrained regulatory drafting prompt.',
  evaluateOutput: () => ({
    passed: S.evaluationPasses,
    rejectionReasons: S.evaluationPasses ? [] : ['Output is too brief for meaningful intelligence'],
  }),
}));
vi.mock('../../../services/concept2cure/governedDocumentContractService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../services/concept2cure/governedDocumentContractService')>();
  return {
    ...actual,
    resolveGovernedContext: (ctx: Parameters<typeof actual.resolveGovernedContext>[0]) => {
      S.contracts.push(ctx as unknown as Record<string, unknown>);
      return actual.resolveGovernedContext(ctx);
    },
  };
});

const CONVERSATION = { id: 41, project_id: 'proj-1', conversation_id: 'conv-41' };
const MESSAGES = [
  { role: 'user', content: 'What CMC data does the pre-IND package need?', created_at: '2026-09-20T10:00:00Z' },
  { role: 'assistant', content: 'Drug substance characterisation, batch analysis and stability.', created_at: '2026-09-20T10:00:05Z' },
];

vi.mock('../../../db', () => ({
  pool: {
    query: async (sql: string) => {
      if (/FROM concept2cure_conversations/.test(sql)) return { rows: [CONVERSATION] };
      if (/FROM concept2cure_messages/.test(sql)) return { rows: MESSAGES };
      throw new Error(`unexpected query: ${sql}`);
    },
  },
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        S.inserted.push(row);
        const done = Promise.resolve();
        return Object.assign(done, { returning: async () => [{ id: 55, ...row }] });
      },
    }),
  },
}));

import router from '../context-intelligence';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as unknown as Record<string, unknown>;
    r.tenantContext = { organizationId: 9 };
    r.userId = 7;
    r.user = { id: 7, organizationId: 9, role: 'author' };
    next();
  });
  a.use('/api/concept2cure', router);
  return a;
}

const DRAFT = `# Pre-IND CMC strategy memo\n\n## Drug substance\n\nCharacterisation, batch analysis and stability are required.`;

function promote() {
  return request(app())
    .post('/api/concept2cure/conversations/41/promote')
    .send({ type: 'strategy_memo', title: 'Pre-IND CMC strategy' });
}

const artifactRow = () => S.inserted.find((r) => 'contentHash' in r);
const provenanceEvent = () => S.inserted.find((r) => r.eventAction === 'promoted_from_conversation');

beforeEach(() => {
  S.chat.length = 0;
  S.chatImpl = null;
  S.evaluationPasses = true;
  S.contracts.length = 0;
  S.inserted.length = 0;
});

describe('promote routes the draft as governed drafting', () => {
  it('asks for document_drafting and pins no model, on the first call and the retry', async () => {
    S.evaluationPasses = false;
    S.chatImpl = async () => ({ content: DRAFT, provider: 'anthropic', model: 'claude-opus-5' });

    const res = await promote();

    expect(res.status).toBe(200);
    expect(S.chat).toHaveLength(2);
    for (const call of S.chat) {
      expect(call.taskType).toBe('document_drafting');
      expect(call).not.toHaveProperty('model');
    }
  });
});

describe('the record names the model that actually served', () => {
  it('provider and model come from the response, and the mode is ai_generated', async () => {
    S.chatImpl = async () => ({ content: DRAFT, provider: 'anthropic', model: 'claude-opus-5' });

    const res = await promote();

    expect(res.status).toBe(200);
    expect(S.contracts).toHaveLength(1);
    expect(S.contracts[0]).toMatchObject({
      generationMode: 'ai_generated',
      provider: 'anthropic',
      model: 'claude-opus-5',
    });
    expect(artifactRow()?.content).toBe(DRAFT);
    expect((provenanceEvent()?.details as Record<string, unknown>).generation).toEqual({
      mode: 'ai_generated',
      provider: 'anthropic',
      model: 'claude-opus-5',
    });
  });

  it('a retry that produced the stored text is the one recorded', async () => {
    S.evaluationPasses = false;
    let n = 0;
    S.chatImpl = async () =>
      ++n === 1
        ? { content: 'thin first draft', provider: 'anthropic', model: 'claude-opus-5' }
        : { content: DRAFT, provider: 'anthropic', model: 'claude-opus-4-8' };

    await promote();

    expect(artifactRow()?.content).toBe(DRAFT);
    expect(S.contracts[0]).toMatchObject({ provider: 'anthropic', model: 'claude-opus-4-8' });
  });

  it('an empty retry keeps the first draft AND the first draft\'s model', async () => {
    S.evaluationPasses = false;
    let n = 0;
    S.chatImpl = async () =>
      ++n === 1
        ? { content: DRAFT, provider: 'anthropic', model: 'claude-opus-5' }
        : { content: '', provider: 'anthropic', model: 'claude-opus-4-8' };

    await promote();

    expect(artifactRow()?.content).toBe(DRAFT);
    expect(S.contracts[0]).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5' });
  });
});

describe('the conversation-export fallback is recorded as imported, with no model', () => {
  it('when the gateway refuses, the stored text is the conversation and no model is named', async () => {
    S.chatImpl = async () => {
      const err = new Error('No model approved for high-risk regulatory drafting is available');
      (err as Error & { code: string }).code = 'MODEL_NOT_APPROVED_FOR_HIGH_RISK';
      throw err;
    };

    const res = await promote();

    expect(res.status).toBe(200);
    const contract = S.contracts[0];
    expect(contract.generationMode).toBe('imported');
    expect(contract.provider).toBeUndefined();
    expect(contract.model).toBeUndefined();
    // It is the conversation, verbatim — not a model's draft.
    expect(artifactRow()?.content).toContain(MESSAGES[0].content);
    expect(artifactRow()?.content).toContain(MESSAGES[1].content);
    expect((provenanceEvent()?.details as Record<string, unknown>).generation).toEqual({
      mode: 'imported',
      provider: null,
      model: null,
    });
  });

  it('no literal model name reaches the record on any path', async () => {
    S.chatImpl = async () => {
      throw new Error('provider unavailable');
    };

    await promote();

    // `req` is on the context and is circular; the record fields are what matter.
    const recordFields = Object.fromEntries(Object.entries(S.contracts[0]).filter(([k]) => k !== 'req'));
    expect(JSON.stringify(recordFields)).not.toMatch(/gpt-4o-mini|openai/);
    expect(JSON.stringify(provenanceEvent())).not.toMatch(/gpt-4o-mini|openai/);
  });
});
