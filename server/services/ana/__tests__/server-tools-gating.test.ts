/**
 * Tests — which Anthropic server tools AnA offers, and the combination she must
 * never offer.
 *
 * ── The conflict ──────────────────────────────────────────────────────────────
 * The current web search and web fetch tools (`_20260209`) run code execution
 * INTERNALLY to filter results. Declaring the standalone `code_execution` tool
 * alongside them hands the model two execution environments and it does not
 * reliably pick the right one.
 *
 * Three independent env flags made that one typo away, and the failure mode is a
 * quiet degradation — the model picks the wrong sandbox and the answer is worse —
 * rather than an error anyone would notice. So the conflict is resolved in code,
 * with the reason logged to whoever set the flags.
 *
 * ── Why web search wins ───────────────────────────────────────────────────────
 * It is the regulatory-currency path: the allowlist is the agency set (fda.gov,
 * ema.europa.eu, ich.org, pmda, mhra …), and its internal execution is not
 * optional. A deployment that genuinely wants the standalone sandbox turns the
 * web tools off.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getEnabledServerTools,
  WEB_SEARCH_TOOL,
  WEB_FETCH_TOOL,
  CODE_EXECUTION_TOOL,
} from '../AnaToolDefinitions.js';

const FLAGS = ['ANA_ENABLE_WEB_SEARCH', 'ANA_ENABLE_WEB_FETCH', 'ANA_ENABLE_CODE_EXECUTION'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(FLAGS.map(f => [f, process.env[f]]));
  for (const f of FLAGS) delete process.env[f];
});
afterEach(() => {
  for (const f of FLAGS) {
    if (saved[f] === undefined) delete process.env[f];
    else process.env[f] = saved[f];
  }
  vi.restoreAllMocks();
});

const names = (tools: { name: string }[]) => tools.map(t => t.name).sort();

describe('server tool gating', () => {
  it('offers nothing by default', () => {
    // These cost money per search and need Console enablement; off is correct
    // until a deployment turns them on deliberately.
    expect(getEnabledServerTools()).toEqual([]);
  });

  it('offers web search on its own', () => {
    process.env.ANA_ENABLE_WEB_SEARCH = 'true';
    expect(names(getEnabledServerTools())).toEqual(['web_search']);
  });

  it('offers the standalone sandbox when no web tool is on', () => {
    process.env.ANA_ENABLE_CODE_EXECUTION = 'true';
    expect(names(getEnabledServerTools())).toEqual(['code_execution']);
  });

  it('refuses the standalone sandbox alongside web search', () => {
    process.env.ANA_ENABLE_WEB_SEARCH = 'true';
    process.env.ANA_ENABLE_CODE_EXECUTION = 'true';
    expect(names(getEnabledServerTools())).toEqual(['web_search']);
  });

  it('refuses it alongside web fetch too', () => {
    // Both web tools carry their own execution, so the conflict is not specific
    // to search.
    process.env.ANA_ENABLE_WEB_FETCH = 'true';
    process.env.ANA_ENABLE_CODE_EXECUTION = 'true';
    expect(names(getEnabledServerTools())).toEqual(['web_fetch']);
  });

  it('says why, rather than silently dropping a flag someone set', () => {
    // A flag that is set and has no effect, with nothing said, is how a
    // deployment ends up believing it has a capability it does not.
    process.env.ANA_ENABLE_WEB_SEARCH = 'true';
    process.env.ANA_ENABLE_CODE_EXECUTION = 'true';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getEnabledServerTools();
    const said = warn.mock.calls.flat().join(' ');
    expect(said).toMatch(/ANA_ENABLE_CODE_EXECUTION/);
  });
});

describe('the tool variants themselves', () => {
  it('uses the current web search variant, not the 2025 one', () => {
    // The registry's models support `_20260209`, which adds dynamic filtering.
    // This was pinned to `web_search_20250305` long after that was true.
    expect(WEB_SEARCH_TOOL.type).toBe('web_search_20260209');
  });

  it('keeps the agency allowlist that makes this the currency path', () => {
    const allowed = WEB_SEARCH_TOOL.allowed_domains as string[];
    for (const host of ['fda.gov', 'ema.europa.eu', 'ich.org', 'ecfr.gov']) {
      expect(allowed, host).toContain(host);
    }
  });

  it('never searches off the allowlist', () => {
    // An unrestricted search on a regulatory question is how a citation to a
    // law-firm blog ends up in a submission.
    expect((WEB_SEARCH_TOOL.allowed_domains as string[]).length).toBeGreaterThan(0);
    expect(WEB_SEARCH_TOOL.blocked_domains).toBeUndefined();
  });

  it('pairs web fetch on the matching variant', () => {
    expect(WEB_FETCH_TOOL.type).toBe('web_fetch_20260209');
  });

  it('still declares a standalone sandbox for the case where it is allowed', () => {
    expect(CODE_EXECUTION_TOOL.name).toBe('code_execution');
  });
});
