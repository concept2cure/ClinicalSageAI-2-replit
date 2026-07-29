/**
 * Tests — background deep investigations: pure status helpers, tool
 * definitions + steering, handler validation branches (no DB), transparency
 * labels, and the provisioning migration's idempotency guard.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, it, expect, afterEach } from 'vitest';
import { C2C_MIGRATION_FILES } from '../../../../scripts/db/migration-set.mjs';

import {
  isInvestigationStale,
  describeInvestigationStatus,
  DEEP_INVESTIGATION_TOOL_NAMES,
  MAX_CONCURRENT_INVESTIGATIONS,
  STALE_AFTER_MS,
} from '../deep-investigation.js';
import { getAllEnabledTools } from '../AnaToolDefinitions.js';
import { getToolHandler } from '../AnaToolExecutor.js';
import { describeToolPlan } from '../agentic-loop.js';

const NOW = new Date('2026-07-24T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe('isInvestigationStale', () => {
  it('marks a running row with an old heartbeat as stalled', () => {
    expect(
      isInvestigationStale(
        { status: 'running', created_at: minutesAgo(30), started_at: minutesAgo(29), heartbeat_at: minutesAgo(10) },
        NOW,
      ),
    ).toBe(true);
  });

  it('a recent heartbeat means alive', () => {
    expect(
      isInvestigationStale(
        { status: 'running', created_at: minutesAgo(30), started_at: minutesAgo(29), heartbeat_at: minutesAgo(1) },
        NOW,
      ),
    ).toBe(false);
  });

  it('a queued row nothing ever picked up goes stale too', () => {
    expect(
      isInvestigationStale(
        { status: 'queued', created_at: minutesAgo(20), started_at: null, heartbeat_at: null },
        NOW,
      ),
    ).toBe(true);
  });

  it('terminal states are never stale', () => {
    for (const status of ['completed', 'failed']) {
      expect(
        isInvestigationStale(
          { status, created_at: minutesAgo(600), started_at: minutesAgo(599), heartbeat_at: minutesAgo(598) },
          NOW,
        ),
      ).toBe(false);
    }
  });

  it('stale window is minutes, not seconds', () => {
    expect(STALE_AFTER_MS).toBeGreaterThanOrEqual(2 * 60_000);
  });
});

describe('describeInvestigationStatus', () => {
  it('reports a stalled run honestly instead of eternally running', () => {
    const label = describeInvestigationStatus(
      { status: 'running', created_at: minutesAgo(60), started_at: minutesAgo(59), heartbeat_at: minutesAgo(30) },
      NOW,
    );
    expect(label).toContain('stalled');
    expect(label).toContain('server restarted');
  });

  it('passes live statuses through', () => {
    expect(
      describeInvestigationStatus(
        { status: 'completed', created_at: minutesAgo(60), started_at: minutesAgo(59), heartbeat_at: minutesAgo(30) },
        NOW,
      ),
    ).toBe('completed');
  });
});

describe('tool definitions', () => {
  const tools = getAllEnabledTools();

  it('registers both investigation tools', () => {
    for (const name of DEEP_INVESTIGATION_TOOL_NAMES) {
      expect(tools.find(t => t.name === name)).toBeDefined();
    }
  });

  it('start requires a question and steers away from in-turn answers', () => {
    const start = tools.find(t => t.name === 'start_deep_investigation') as any;
    expect(start.input_schema.required).toEqual(['question']);
    expect(start.description).toContain('BACKGROUND');
    expect(start.description).toMatch(/Do NOT use it for anything answerable in the current turn/);
  });

  it('check works with or without an id and promises honest stalled reporting', () => {
    const check = tools.find(t => t.name === 'check_deep_investigation') as any;
    expect(check.input_schema.required).toEqual([]);
    expect(check.description).toContain('stalled');
  });

  it('caps concurrency at a small per-tenant number', () => {
    expect(MAX_CONCURRENT_INVESTIGATIONS).toBeLessThanOrEqual(3);
  });
});

describe('start handler validation (no DB touched)', () => {
  const originalFlag = process.env.ANA_ENABLE_DEEP_INVESTIGATIONS;
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ANA_ENABLE_DEEP_INVESTIGATIONS;
    else process.env.ANA_ENABLE_DEEP_INVESTIGATIONS = originalFlag;
  });

  it('rejects a missing/too-short question', async () => {
    const handler = getToolHandler('start_deep_investigation')!;
    const result = JSON.parse(await handler({ question: 'why?' }, {}));
    expect(result.error).toContain('self-contained research question');
  });

  it('honors the kill-switch', async () => {
    process.env.ANA_ENABLE_DEEP_INVESTIGATIONS = 'false';
    const handler = getToolHandler('start_deep_investigation')!;
    const result = JSON.parse(
      await handler({ question: 'a perfectly reasonable long research question' }, {}),
    );
    expect(result.status).toBe('disabled');
  });
});

describe('transparency labels', () => {
  it('labels both tools calmly', () => {
    const [start, check] = describeToolPlan([
      { id: '1', name: 'start_deep_investigation', input: { question: 'predicate landscape for X' } },
      { id: '2', name: 'check_deep_investigation', input: {} },
    ]);
    expect(start.label).toBe('Starting a background deep investigation — "predicate landscape for X"');
    expect(check.label).toBe('Checking on the background investigation');
  });
});

describe('provisioning migration — idempotency guard', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../../migrations/20260724_ana_deep_investigations.sql'),
    'utf8',
  );

  it('creates the table and indexes idempotently', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ana_deep_investigations');
    expect(sql.match(/CREATE INDEX IF NOT EXISTS/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('models the full lifecycle the runner writes', () => {
    for (const col of ['status', 'progress', 'result_text', 'heartbeat_at', 'tool_call_count', 'completed_at']) {
      expect(sql).toContain(col);
    }
  });

  it('is wired into the standard apply set', () => {
    // The ordered set both appliers consume — the manual one and the deploy-time
    // one (scripts/db/deploy-migrate.mjs). Asserting membership here means the
    // migration is on the PRODUCTION path, not merely on one a human might run.
    expect(C2C_MIGRATION_FILES).toContain('migrations/20260724_ana_deep_investigations.sql');
  });
});
