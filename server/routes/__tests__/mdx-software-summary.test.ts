/**
 * GET /api/mdx/software-summary/:programId — the software documentation
 * completeness a client sees on the Software surface.
 *
 * The summary used to take the documentation level from the most recently
 * updated lifecycle item, and to report 'basic' when the program had none. A
 * percentage was then computed against a set nobody determined. One item filed
 * as 'basic' among 'enhanced' ones silently shrank the denominator. The Basic
 * set also demanded unit/integration test records (Enhanced-only in FDA's 2023
 * guidance) and keyed SBOM/OTS to the documentation level instead of to
 * cyber-device status (FD&C Act §524B).
 *
 * What is pinned here:
 *   - no items, or more than one recorded level → 'undetermined', completion null;
 *   - the required set comes from FDA_SOFTWARE_DOCUMENTATION_SET
 *     (software-lifecycle.ts), so Basic needs a system_test record and not
 *     unit_test / integration_test;
 *   - SBOM, threat model and pentest are required only for a cyber device, and
 *     an unrecorded cyber-device status yields no percentage.
 *
 * The pool is faked as a tiny in-memory table that answers each SQL shape the
 * route can send, so the test reads the route's contract, not its query order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

interface Item {
  doc_level: 'basic' | 'enhanced';
  item_kind: string;
  status: 'draft' | 'in_review' | 'approved' | 'superseded';
  updated_at: number;
}

const state = vi.hoisted(() => ({
  items: [] as Array<{ doc_level: string; item_kind: string; status: string; updated_at: number }>,
  metadata: undefined as unknown,
  sql: [] as string[],
}));

function answer(sql: string): { rows: unknown[] } {
  state.sql.push(sql);
  if (/FROM\s+regulatory_programs/i.test(sql)) {
    return { rows: state.metadata === undefined ? [] : [{ metadata: state.metadata }] };
  }
  if (/GROUP BY item_kind/i.test(sql)) {
    const by = new Map<string, { item_kind: string; n: number; approved: number }>();
    for (const i of state.items) {
      const r = by.get(i.item_kind) ?? { item_kind: i.item_kind, n: 0, approved: 0 };
      r.n += 1;
      if (i.status === 'approved') r.approved += 1;
      by.set(i.item_kind, r);
    }
    return { rows: [...by.values()] };
  }
  if (/DISTINCT\s+doc_level/i.test(sql)) {
    const excludesSuperseded = /superseded/i.test(sql);
    const levels = new Set(
      state.items.filter((i) => !excludesSuperseded || i.status !== 'superseded').map((i) => i.doc_level),
    );
    return { rows: [...levels].sort().map((doc_level) => ({ doc_level })) };
  }
  if (/SELECT doc_level/i.test(sql) && /ORDER BY updated_at DESC/i.test(sql)) {
    const latest = [...state.items].sort((a, b) => b.updated_at - a.updated_at)[0];
    return { rows: latest ? [{ doc_level: latest.doc_level }] : [] };
  }
  throw new Error(`unexpected SQL in software-summary test: ${sql}`);
}

vi.mock('../../db', () => ({
  pool: { query: async (sql: string) => answer(sql) },
  db: {
    /* The drizzle path, should the route read the program through it. */
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            state.sql.push('drizzle:regulatory_programs');
            return state.metadata === undefined ? [] : [{ metadata: state.metadata }];
          },
        }),
      }),
    }),
  },
}));

import softwareRouter from '../mdx-software';

const PROGRAM_ID = '11111111-2222-3333-4444-000000000301';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 7, organizationId: 42, role: 'admin' };
    next();
  });
  a.use('/api/mdx', softwareRouter);
  return a;
}

async function summary() {
  const res = await request(app()).get(`/api/mdx/software-summary/${PROGRAM_ID}`);
  expect(res.status).toBe(200);
  return res.body.data;
}

let clock = 0;
function item(doc_level: Item['doc_level'], item_kind: string, status: Item['status'] = 'approved'): Item {
  clock += 1;
  return { doc_level, item_kind, status, updated_at: clock };
}

const BASIC_TRACKED = ['srs', 'arch', 'system_test', 'release_note', 'anomaly_log'];
const notCyber = { deviceFlags: [] };
const cyber = { deviceFlags: ['cyberDevice', 'softwareAiMl'] };

beforeEach(() => {
  state.items = [];
  state.metadata = notCyber;
  state.sql = [];
  clock = 0;
});

describe('software-summary: the documentation level is determined, never assumed', () => {
  it('a program with no lifecycle items is undetermined with no percentage, not 0% against Basic', async () => {
    const s = await summary();
    expect(s.docLevel).toBe('undetermined');
    expect(s.completion).toBeNull();
    expect(s.required).toBeNull();
    expect(s.matrix).toEqual([]);
    expect(s.reason).toMatch(/no software lifecycle items/i);
  });

  it('items recorded at both levels are undetermined — one Basic item does not shrink the Enhanced denominator', async () => {
    state.items = [
      item('enhanced', 'srs'),
      item('enhanced', 'sds'),
      item('enhanced', 'unit_test'),
      item('basic', 'arch'), // most recently updated
    ];
    const s = await summary();
    expect(s.docLevel).toBe('undetermined');
    expect(s.completion).toBeNull();
    expect(s.recordedLevels).toEqual(['basic', 'enhanced']);
    expect(s.reason).toMatch(/basic.*enhanced/i);
  });

  it('a superseded item at the old level does not make the level undetermined', async () => {
    state.items = [item('basic', 'srs', 'superseded'), ...BASIC_TRACKED.map((k) => item('enhanced', k))];
    const s = await summary();
    expect(s.docLevel).toBe('enhanced');
  });

  it('carries the Documentation Level basis, with FDA 2023 guidance as regulator text', async () => {
    const s = await summary();
    expect(s.basis.some((b: any) => b.confidence === 'regulator-text' && /fda\.gov\/media\/153781/.test(b.url))).toBe(true);
  });
});

describe('software-summary: the required set is FDA_SOFTWARE_DOCUMENTATION_SET', () => {
  it('Basic requires a system_test record and not unit_test or integration_test records', async () => {
    state.items = BASIC_TRACKED.map((k) => item('basic', k));
    const s = await summary();
    expect(s.docLevel).toBe('basic');
    const kinds = s.matrix.map((m: any) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining(BASIC_TRACKED));
    expect(kinds).not.toContain('unit_test');
    expect(kinds).not.toContain('integration_test');
    expect(kinds).not.toContain('sds');
    expect(s.required).toBe(BASIC_TRACKED.length);
    expect(s.approved).toBe(BASIC_TRACKED.length);
    expect(s.completion).toBe(100);
  });

  it('every matrix row names the FDA documentation item it evidences', async () => {
    state.items = BASIC_TRACKED.map((k) => item('basic', k));
    const s = await summary();
    const row = s.matrix.find((m: any) => m.kind === 'system_test');
    expect(row.documentation).toBe('system_test_protocol_report');
    expect(row.title).toMatch(/system-level test protocol and report/i);
  });

  it('unit/integration records do not count toward Basic completeness', async () => {
    state.items = [item('basic', 'unit_test'), item('basic', 'integration_test'), item('basic', 'srs', 'draft')];
    const s = await summary();
    expect(s.approved).toBe(0);
    expect(s.completion).toBe(0);
  });

  it('Enhanced adds the SDS and the unit and integration test records', async () => {
    state.items = [item('enhanced', 'srs')];
    const s = await summary();
    const kinds = s.matrix.map((m: any) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining([...BASIC_TRACKED, 'sds', 'unit_test', 'integration_test']));
  });

  it('names the required documentation no lifecycle item kind records, instead of dropping it silently', async () => {
    state.items = BASIC_TRACKED.map((k) => item('basic', k));
    const s = await summary();
    const ids = s.untracked.map((u: any) => u.id);
    expect(ids).toEqual(expect.arrayContaining(['software_description', 'risk_management_file', 'testing_summary']));
    expect(s.completionScope).toMatch(/not counted/i);
  });
});

describe('software-summary: cybersecurity follows cyber-device status (§524B), not the level', () => {
  it('a non-cyber device is not asked for SBOM, OTS list, threat model, pentest or cybersecurity label', async () => {
    state.items = [item('enhanced', 'srs')];
    const s = await summary();
    const kinds = s.matrix.map((m: any) => m.kind);
    for (const k of ['sbom', 'ots_list', 'threat_model', 'pentest', 'cybersecurity_label']) expect(kinds).not.toContain(k);
    expect(s.cybersecurity.status).toBe('not_required');
  });

  it('a cyber device at Basic is asked for SBOM, threat model and cybersecurity testing', async () => {
    state.metadata = cyber;
    state.items = [...BASIC_TRACKED.map((k) => item('basic', k)), item('basic', 'sbom')];
    const s = await summary();
    expect(s.docLevel).toBe('basic');
    const kinds = s.matrix.map((m: any) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining(['sbom', 'threat_model', 'pentest']));
    expect(s.cybersecurity.status).toBe('required');
    expect(s.required).toBe(BASIC_TRACKED.length + 3);
    expect(s.approved).toBe(BASIC_TRACKED.length + 1);
    expect(s.completion).toBe(Math.round(((BASIC_TRACKED.length + 1) / (BASIC_TRACKED.length + 3)) * 100));
  });

  it('an unrecorded cyber-device status gives no percentage', async () => {
    state.metadata = {};
    state.items = BASIC_TRACKED.map((k) => item('basic', k));
    const s = await summary();
    expect(s.docLevel).toBe('basic');
    expect(s.cybersecurity.status).toBe('undetermined');
    expect(s.completion).toBeNull();
    expect(s.reason).toMatch(/cyber device/i);
  });
});
