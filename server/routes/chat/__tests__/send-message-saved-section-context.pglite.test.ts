/**
 * Exact saved-section guidance through the live JSON chat door.
 * The collector, recordLoopTurn, TurnRecorder and author readers are real.
 * Executor, DB/retrieval/context and final durable writer are scripted seams;
 * the final writer seals the real recorder in memory, not in a database.
 */
import express from 'express';
import httpRequest from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SealedTurnRecord, TurnOutcome } from '../../../services/ana/turn-record.js';

const io = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  record: vi.fn(),
  kernel: vi.fn(),
  sealed: null as SealedTurnRecord | null,
  outcome: null as TurnOutcome | null,
}));
vi.mock('../../../db.js', () => ({
  pool: { query: io.query },
  getPool: () => ({ query: io.query }),
  db: {},
}));
vi.mock('../../../db/currentTenant.js', () => ({
  currentTenantOrgUuid: async () => '77777777-2222-4333-8444-555555555555',
}));
vi.mock('../../../services/ana/AnaToolExecutor.js', () => ({ executeAgenticLoop: io.execute }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: async () => 'fixture-thread',
  getThreadMessages: async () => [],
  saveChatMessage: async () => 1,
  ThreadAccessError: class extends Error {},
}));
vi.mock('../../../services/enhancedEmbeddingService.js', () => ({
  getEmbeddingService: () => ({ searchHybrid: async () => [] }),
}));
vi.mock('../shared.js', () => ({
  ensureGateway: () => ({ getEnabledProviders: () => ['fixture'], getModels: () => [] }),
  normalizeBody: () => {},
}));
vi.mock('../../../services/lumen-context-builder.js', () => ({
  getIntelligencePrefix: async () => '',
}));
vi.mock('../../../services/memory-context-assembler.js', () => ({
  buildMemoryContextForChat: async () => ({ memoryBlock: '', atoms: [], diagnostics: null }),
}));
vi.mock('../../../services/ana-session-bootstrap.js', () => ({
  sessionBootstrapBlockFor: async () => '',
}));
vi.mock('../../../services/projects/project-instructions.js', () => ({
  getProjectInstructionsBlock: async () => '',
}));
vi.mock('../../../services/ana/governed-toolset.js', () => ({
  governedToolsetFor: async () => [],
}));
vi.mock('../../../services/ana-ri/orchestrator.js', () => ({
  orchestrate: () => ({
    systemPrompt: 'Fixture context',
    detectedIntent: { lens: 'general', confidence: 1 },
    detectedSubmissionType: null,
    orchestrationMeta: { deficiencyContextInjected: false },
  }),
}));
vi.mock('../../../services/kernel-router.js', () => ({
  planKernelExecution: () => ({
    taskType: 'chat',
    riskTier: 'low',
    strategy: 'quality_optimized',
    maxTokens: 128,
    temperature: 0,
  }),
}));
vi.mock('../../../services/kernel-adaptive-policy.js', () => ({
  getKernelPolicyHint: async () => null,
  recordKernelPolicyOutcome: async () => {},
}));
vi.mock('../../../services/kernel-decision-record.js', () => ({ logKernelDecision: io.kernel }));
vi.mock('../../../services/toolRegistry.js', () => ({ logToolRun: async () => {} }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({
  interceptChatResponse: () => {},
}));
vi.mock('../../../services/working-memory.js', () => ({
  summarizeAndStoreWorkingMemoryForThread: async () => {},
}));
vi.mock('../../../services/ana/turn-record-loop.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/turn-record-loop.js')>();
  return {
    ...real,
    recordLoopTurn: (...args: Parameters<typeof real.recordLoopTurn>) => {
      io.record(...args);
      return real.recordLoopTurn(...args);
    },
  };
});
vi.mock('../../../services/ana/turn-record.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/turn-record.js')>();
  return {
    ...real,
    writeTurnRecordSafely: async (...args: Parameters<typeof real.writeTurnRecordSafely>) => {
      const [, recorder, outcome] = args;
      io.outcome = outcome;
      io.sealed = recorder?.seal(outcome) ?? null;
      if (!io.sealed) return { status: 'not_recorded', reason: 'No recorder was opened.' };
      const { servedModelsOf } = await import('../../../services/ana/turn-record-models.js');
      const { qualifyServedModels } = await import(
        '../../../services/ai-governance/approved-models.js'
      );
      return {
        status: 'recorded',
        id: 'fixture-native-model-record',
        sha256: 'c'.repeat(64),
        servedBy: qualifyServedModels(servedModelsOf(io.sealed.body.model)),
      };
    },
  };
});

import { sendMessageHandler } from '../send-message.js';

import {
  pg,
  PROGRAM,
  DOCUMENT,
  OTHER_DOCUMENT,
  sectionId,
} from '../../../services/ana/__tests__/_saved-document-critique-fixture';
const PARENT = '33333333-2222-4333-8444-000000000011';
const CHILD = '33333333-2222-4333-8444-000000000012';
const GUIDE =
  'Retained CSR appendix guide: preserve original patient CRFs and do not fabricate signatures.';
const source = (id: string, entryId: string, registryId: string | null, sha256: string) => ({
  id,
  entryId,
  version: 1,
  sha256,
  kind: 'narrative',
  aiDraftable: true,
  authoringMode: 'ai_draft',
  originalFormat: 'mixed',
  limitations: [`Retained limit for ${entryId}`],
  filingContext: { registryId, region: 'GLOBAL', agency: 'ICH' },
});
const parent = source(PARENT, 'registry:ICH_IB', 'ICH_IB', 'a'.repeat(64));
const child = source(CHILD, 'component:clinical_study_report', null, 'b'.repeat(64));
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, {
    tenantId: 7,
    user: { id: 7, organizationId: 7 },
    dbClient: { query: io.query },
  });
  next();
});
app.post('/api/chat/send-message', sendMessageHandler);
const send = (extra: Record<string, unknown> = {}) =>
  httpRequest(app)
    .post('/api/chat/send-message')
    .send({
      message: 'Review the current saved section.',
      project_id: PROGRAM,
      authoring_context: {
        projectId: PROGRAM,
        artifactId: DOCUMENT,
        sectionId: sectionId(1),
        sectionCode: '16.3.1',
      },
      ...extra,
    });
function prompt() {
  const call = io.execute.mock.calls[0];
  expect(call).toBeDefined();
  return String(call[0].messages[0].content);
}
function recordedPrompt() {
  expect(io.sealed).not.toBeNull();
  const record = io.sealed!;
  return record.blobs.get(record.body.modelInput[0].text.sha256);
}
beforeEach(async () => {
  io.query.mockReset().mockImplementation(async (sql: string, args?: unknown[]) => {
    if (
      /\b(regulatory_programs|projects|organization_users|users|organizations|project_visibility_settings|project_members|concept2cure_review_assignments|concept2cure_artifacts|authoring_documents|authoring_sections|authoring_audit_trail|doc_permissions|template_guidance|intelligence\.)\b/i.test(
        sql
      )
    )
      return pg.query<Record<string, unknown>>(sql, args);
    return { rows: [{ id: 'fixture-retrieval' }] };
  });
  io.record.mockReset();
  io.kernel.mockReset().mockResolvedValue(undefined);
  io.execute.mockReset();
  io.sealed = null;
  io.outcome = null;
  io.execute.mockImplementation(async (_request, options) => {
    const answer = {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      requestId: 'fixture-saved-section',
      content: 'Read the retained reference before editing.',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      latencyMs: 1,
    };
    options.onModelResponse?.(answer, 0);
    return answer;
  });
  await pg.query('UPDATE authoring_documents SET template_id=$1,provenance=$2 WHERE id=$3', [
    PARENT,
    { source: 'template', templateSource: parent },
    DOCUMENT,
  ]);
  await pg.query(
    `INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,operation_type,actor_email,metadata) VALUES($1,$2,7,'CREATE','owner@example.test',$3)`,
    [
      DOCUMENT,
      sectionId(1),
      {
        templateSource: child,
        templateGuidance: {
          guidance_text: GUIDE,
          drafting_mode: 'manual',
          regulatory_references: [],
          compliance_checklist: [],
          common_pitfalls: [],
          source_reference: 'server/services/ind/ctd/csr-e3-guidance.ts#16.3.1',
        },
        assembly: {
          version: 1,
          docId: DOCUMENT,
          programId: PROGRAM,
          templateId: CHILD,
          templateSnapshot: child.sha256,
          fingerprint: 'c'.repeat(64),
        },
      },
    ]
  );
});
describe('live JSON chat carries the exact admitted saved section reference', () => {
  it('uses the retained CSR child instead of its IB parent and records exactly the sent reference', async () => {
    const response = await send();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(prompt()).toContain(GUIDE);
    expect(prompt()).not.toContain('Retained limit for registry:ICH_IB');
    expect(recordedPrompt()).toBe(prompt());
  });
  it('retains saved section limits beside a custom system prompt', async () => {
    const response = await send({ system_prompt: 'Custom client writing preference.' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(prompt()).toContain('Custom client writing preference.');
    expect(prompt()).toContain(GUIDE);
    expect(recordedPrompt()).toBe(prompt());
  });
});

describe('live JSON chat uses one complete source identity and current view access', () => {
  it('preserves legacy context intake when no authoring channel was supplied', async () => {
    const response = await send({
      authoring_context: undefined,
      context: { artifactId: DOCUMENT, sectionId: sectionId(1), sectionCode: 'wrong-client-code' },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(prompt()).toContain(GUIDE);
    expect(recordedPrompt()).toBe(prompt());
  });
  it('does not splice a missing artifact from the legacy channel into an explicit authoring identity', async () => {
    const response = await send({
      authoring_context: { sectionId: sectionId(1) },
      context: { artifactId: DOCUMENT, sectionId: sectionId(1), documentType: 'US_IND' },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(prompt()).not.toContain(GUIDE);
    expect(prompt()).toContain('could not be read');
  });
  it('withholds metadata for a different recorded project even when that actor can access both projects', async () => {
    const response = await send({
      authoring_context: { artifactId: OTHER_DOCUMENT, sectionId: sectionId(1) },
      document_context: { documentType: 'US_IND' },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(prompt()).not.toContain(GUIDE);
    expect(prompt()).toContain('could not be read');
    expect(
      io.query.mock.calls.some(([sql]) =>
        /SELECT d\.template_id|authoring_audit_trail|FROM template_guidance/.test(sql)
      )
    ).toBe(false);
  });
  it('withholds retained guidance after the exact current document grant is revoked', async () => {
    await pg.query('UPDATE doc_permissions SET revoked_at=now() WHERE doc_id=$1', [DOCUMENT]);
    const response = await send();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(prompt()).not.toContain(GUIDE);
    expect(
      io.query.mock.calls.some(([sql]) =>
        /SELECT d\.template_id|authoring_audit_trail|FROM template_guidance/.test(sql)
      )
    ).toBe(false);
  });
});
