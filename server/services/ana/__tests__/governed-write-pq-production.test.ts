/**
 * ADR-0015 §3 at the point where content becomes a record (track GW review
 * [1]/[9]/[19], blocker).
 *
 * AnA's governed drafting never reaches the gateway as `document_drafting`: the
 * kernel keeps a governed-draft turn at `regulatory_review` (or `chat` on
 * /api/chat) and raises only its risk tier (kernel-router.ts). So the gateway's
 * PQ rule, keyed on the drafting label, never saw it. The control that does
 * see it is the governed-write gate on every tool that stores model-authored
 * text (governed-write-tools.ts), which read `approvedForHighRisk` alone.
 *
 * In production a governed write now needs the model that produced it to be
 * qualified for high-risk drafting as RULE 2 defines it: approved for high
 * risk AND PQ-passed. Outside production nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: async () => ({ content: 'done' }) }) }));
const { resolveSignerOrgRole } = vi.hoisted(() => ({ resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member') }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { getToolHandler, registerToolHandler } from '../AnaToolExecutor';
import { GOVERNED_CONTENT_WRITE_TOOLS } from '../governed-write-tools';
import {
  APPROVED_MODELS,
  isQualifiedForHighRiskDrafting,
  isServedModelApprovedForHighRisk,
} from '../../ai-governance/approved-models';

/** AnA's flagship: approved for high risk, PQ pending. */
const FLAGSHIP = { provider: 'anthropic', model: 'claude-opus-5-5' };
const saved = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = saved;
});

describe('the governed-write gate, in production', () => {
  const inner = vi.fn(async () => JSON.stringify({ status: 'saved' }));
  beforeEach(() => {
    inner.mockClear();
    registerToolHandler('update_protocol_section', inner);
  });

  const confirmedWrite = () =>
    getToolHandler('update_protocol_section')!({ section_id: 1, content: 'model-written' }, {
      organizationId: 1,
      userId: 2,
      servingModel: FLAGSHIP,
      humanConfirmed: true,
    } as never);

  it('refuses a write produced by an approved but PQ-pending model; nothing is stored', async () => {
    process.env.NODE_ENV = 'production';
    const r = JSON.parse(await confirmedWrite());
    expect(r.error).toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
    expect(inner).not.toHaveBeenCalled();
  });

  it('refuses every governed-write tool the same way', async () => {
    process.env.NODE_ENV = 'production';
    // A tool outside the launch catalog is refused even earlier, by launch
    // scope (trunk, after this test was written); either way nothing is stored.
    const refusals = new Map<string, string>();
    for (const tool of Object.keys(GOVERNED_CONTENT_WRITE_TOOLS)) {
      const r = JSON.parse(
        await getToolHandler(tool)!({ title: 't', content: 'c', reason: 'reason for change' }, {
          servingModel: FLAGSHIP,
          organizationId: 1,
        } as never),
      );
      expect(['MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE', 'LAUNCH_SCOPE'], tool).toContain(r.error ?? r.code);
      refusals.set(tool, r.error ?? r.code);
    }
    expect([...refusals.values()]).toContain('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
    expect(inner).not.toHaveBeenCalled();
  });

  it('control: outside production the same confirmed write reaches its handler', async () => {
    process.env.NODE_ENV = 'test';
    await confirmedWrite();
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('one predicate: qualified for high-risk drafting', () => {
  const flagshipEntry = APPROVED_MODELS.find((e) => e.id === 'claude-opus-4')!;

  it('in production it needs approvedForHighRisk AND a passed PQ', () => {
    expect(isQualifiedForHighRiskDrafting(flagshipEntry, true)).toBe(false);
    expect(isQualifiedForHighRiskDrafting({ ...flagshipEntry, pq: { status: 'passed' } } as never, true)).toBe(true);
    expect(
      isQualifiedForHighRiskDrafting({ ...flagshipEntry, approvedForHighRisk: false, pq: { status: 'passed' } } as never, true),
    ).toBe(false);
  });

  it('outside production approvedForHighRisk is enough, as before', () => {
    expect(isQualifiedForHighRiskDrafting(flagshipEntry, false)).toBe(true);
  });

  it('the served-model check the gate calls reads it: false in production today, true outside', () => {
    expect(isServedModelApprovedForHighRisk(FLAGSHIP, { NODE_ENV: 'production' })).toBe(false);
    expect(isServedModelApprovedForHighRisk(FLAGSHIP, { NODE_ENV: 'test' })).toBe(true);
    expect(isServedModelApprovedForHighRisk({ provider: 'openai', model: 'gpt-4o' }, { NODE_ENV: 'test' })).toBe(false);
  });
});
