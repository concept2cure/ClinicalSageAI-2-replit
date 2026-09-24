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
const isDocumentCatalogEnabled = vi.hoisted(() => vi.fn(async () => true));

vi.mock('../AnaToolDefinitions.js', () => ({ getAllEnabledTools }));
vi.mock('../../vault/document-catalog.service.js', () => ({ isDocumentCatalogEnabled }));
vi.mock('../../ana-ri/mdx-tool-policy.js', async () => {
  // The FILTER is the real one — this suite is about the composition, and a
  // stubbed filter would make it prove nothing about what tenants actually get.
  const actual = await vi.importActual<typeof import('../../ana-ri/mdx-tool-policy.js')>(
    '../../ana-ri/mdx-tool-policy.js',
  );
  return { ...actual, loadAnaToolPolicy };
});

import { governedToolsetFor } from '../governed-toolset';
import { CATALOG_GATED_TOOLS } from '../document-tools-shared';

const pool = { query: vi.fn(async () => ({ rows: [] })) };
const names = (tools: Array<{ name: string }>) => tools.map(t => t.name);

beforeEach(() => {
  loadAnaToolPolicy.mockReset();
  loadAnaToolPolicy.mockResolvedValue({});
  isDocumentCatalogEnabled.mockReset();
  isDocumentCatalogEnabled.mockResolvedValue(true);
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

/* ── A tool that can only refuse is not offered ─────────────────────────────
   'ana.document_catalog' is off for every new organisation — the launch
   default, and not this module's decision to change. With it off, the seven
   catalog tools were still offered on every turn, and the persona's
   client-files rule told AnA to call list_project_documents the moment a user
   mentioned their material. Every call refused with a message naming the
   internal feature key, which AnA was told to relay: a regulatory user who
   uploaded a file to the Vault (a launch app, on) and asked about it was told
   about a setting they cannot see or change.

   The toolset is the one place every chat door already composes through
   (chat-path-parity.test.ts), so dropping the gated tools here holds on all of
   them at once, and makes the startup line's "no document tools" true. */
describe('governedToolsetFor — the catalog gate', () => {
  const withGated = () =>
    getAllEnabledTools.mockReturnValue([
      { name: 'search_guidance' },
      ...CATALOG_GATED_TOOLS.map(name => ({ name })),
    ] as any);

  it('does not offer the catalog tools to an organization whose catalog is off', async () => {
    withGated();
    isDocumentCatalogEnabled.mockResolvedValue(false);
    const offered = names(await governedToolsetFor(pool, 42));
    for (const gated of CATALOG_GATED_TOOLS) expect(offered).not.toContain(gated);
    expect(offered).toContain('search_guidance');
    expect(isDocumentCatalogEnabled).toHaveBeenCalledWith(42);
  });

  it('offers them when the catalog is on', async () => {
    withGated();
    isDocumentCatalogEnabled.mockResolvedValue(true);
    const offered = names(await governedToolsetFor(pool, 42));
    for (const gated of CATALOG_GATED_TOOLS) expect(offered).toContain(gated);
  });

  it('fails closed when the toggle cannot be read — a tool that would refuse is not offered', async () => {
    withGated();
    isDocumentCatalogEnabled.mockImplementation(async () => {
      throw new Error('toggle store unreachable');
    });
    const offered = names(await governedToolsetFor(pool, 42));
    for (const gated of CATALOG_GATED_TOOLS) expect(offered).not.toContain(gated);
  });

  it('does not offer them to an org-less turn, which they refuse outright', async () => {
    withGated();
    const offered = names(await governedToolsetFor(pool, null));
    for (const gated of CATALOG_GATED_TOOLS) expect(offered).not.toContain(gated);
    expect(isDocumentCatalogEnabled).not.toHaveBeenCalled();
  });
});

