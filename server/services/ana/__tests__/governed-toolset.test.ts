/**
 * The tenant tool deny-list, applied in one place.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `organizations.settings.anaToolPolicy.deny` lets a tenant switch an AnA tool
 * off. Honouring it takes two steps — load the policy, filter the assembled
 * toolset — and three call sites did both by hand while a fourth,
 * `POST /api/chat/send-message`, did neither: it passed `getAllEnabledTools()`
 * straight into relevance selection. So a denied tool was denied on the
 * streaming endpoint and still offered on the other one.
 *
 * A capability wired to one of two doors is a gap someone eventually notices. A
 * GOVERNANCE CONTROL wired to one of two doors does not fail visibly — it just
 * quietly does not hold, and the tenant finds out by watching the model use the
 * tool they turned off.
 *
 * chat-path-parity.test.ts pins that every path calls this helper. This file
 * pins what the helper actually does.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getAllEnabledTools = vi.hoisted(() =>
  vi.fn(() => [{ name: 'search_guidance' }, { name: 'delete_everything' }, { name: 'draft_section' }]),
);
const loadAnaToolPolicy = vi.hoisted(() => vi.fn());

vi.mock('../AnaToolDefinitions.js', () => ({ getAllEnabledTools }));
vi.mock('../../ana-ri/mdx-tool-policy.js', async () => {
  // The FILTER is the real one — this suite is about the composition, and a
  // stubbed filter would make it prove nothing about what tenants actually get.
  const actual = await vi.importActual<typeof import('../../ana-ri/mdx-tool-policy.js')>(
    '../../ana-ri/mdx-tool-policy.js',
  );
  return { ...actual, loadAnaToolPolicy };
});

import { governedToolsetFor } from '../governed-toolset';

const pool = { query: vi.fn(async () => ({ rows: [] })) };
const names = (tools: Array<{ name: string }>) => tools.map(t => t.name);

beforeEach(() => {
  loadAnaToolPolicy.mockReset();
  loadAnaToolPolicy.mockResolvedValue({});
});

describe('governedToolsetFor', () => {
  it('removes a denied tool from the surface the model is offered', async () => {
    loadAnaToolPolicy.mockResolvedValue({ deny: ['delete_everything'] });
    expect(names(await governedToolsetFor(pool, 42))).toEqual(['search_guidance', 'draft_section']);
  });

  it('returns everything when the tenant denies nothing', async () => {
    expect(names(await governedToolsetFor(pool, 42))).toHaveLength(3);
  });

  it('does NOT apply the allowlist — that would strip every search tool', async () => {
    // `allow` is scoped to governed mutations and enforced at execution. A
    // tenant that allowlisted one mutation must not thereby lose lookup.
    loadAnaToolPolicy.mockResolvedValue({ allow: ['draft_section'] });
    expect(names(await governedToolsetFor(pool, 42))).toHaveLength(3);
  });

  it('skips the policy lookup entirely when there is no organization', async () => {
    // An org-less turn has no tenant policy to apply. Querying for one would be
    // a round trip that can only return nothing.
    expect(names(await governedToolsetFor(pool, null))).toHaveLength(3);
    expect(names(await governedToolsetFor(pool, undefined))).toHaveLength(3);
    expect(loadAnaToolPolicy).not.toHaveBeenCalled();
  });

  it('ignores a non-numeric organization id rather than passing it to the query', async () => {
    expect(names(await governedToolsetFor(pool, Number.NaN))).toHaveLength(3);
    expect(loadAnaToolPolicy).not.toHaveBeenCalled();
  });

  it('is default-allow when the policy cannot be read', async () => {
    // loadAnaToolPolicy is the fail-soft read variant by design: degrading a
    // tool picker to "show everything" on a settings read error is acceptable,
    // and a governed WRITE resolves the strict variant at execution instead.
    loadAnaToolPolicy.mockResolvedValue({});
    expect(names(await governedToolsetFor(pool, 42))).toHaveLength(3);
  });
});
