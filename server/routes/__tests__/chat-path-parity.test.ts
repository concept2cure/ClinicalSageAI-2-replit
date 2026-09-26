/**
 * Every canonical chat entry point does the cross-cutting things — all of them.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The session-start rehydration — the working summary, the top project and
 * client atoms, AnA's own past lessons, and (the point of the whole
 * document-catalog workstream) WHAT FILES THE CLIENT HAS, where each is filed
 * and what it is for — was called from exactly one place:
 * `POST /api/chat/send-message`.
 *
 * The product has two canonical chat endpoints, and it is the OTHER one,
 * `POST /api/ana-ri/stream`, that a chat UI actually uses. There, memory was
 * query-driven only: it answers what the user just typed and never says a
 * document exists. So a streaming session began not knowing the client had
 * uploaded anything — the exact "she doesn't remember the file is there" this
 * workstream was built to end, still true on the path that matters most,
 * because the capability had been wired to one of two equivalent doors.
 *
 * ── Why a source-reading test ────────────────────────────────────────────────
 * Both handlers are thousand-line streaming routes with a dozen external
 * dependencies; standing one up to observe a system turn would test the
 * harness. What has to hold is narrow and structural — each path calls the one
 * gated helper — and that is exactly what reading the source can assert. It is
 * the same shape as the persona tripwire: cheap, and it fails the moment
 * someone adds a third chat path or quietly drops the call from one.
 *
 * The same shape has now bitten twice, so this file covers both and is where the
 * third belongs:
 *
 *   1. SESSION-START REHYDRATION — wired only to send-message. Streaming
 *      sessions began not knowing the client had uploaded anything.
 *   2. THE TENANT TOOL DENY-LIST — wired only to stream. A tool an organization
 *      switched off in `anaToolPolicy.deny` was still offered on send-message.
 *      That one is worse: a capability on one door is a gap, a GOVERNANCE
 *      CONTROL on one door does not fail visibly, it just quietly does not
 *      hold, and the tenant finds out by watching the model use the tool they
 *      turned off.
 *
 * If a third canonical chat entry point appears, add it to CHAT_ENTRY_POINTS. A
 * path missing from this list is a path that silently skips both.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

/** endpoint → the module that handles it. */
const CHAT_ENTRY_POINTS: Array<{ endpoint: string; file: string }> = [
  { endpoint: 'POST /api/chat/send-message', file: 'server/routes/chat/send-message.ts' },
  { endpoint: 'POST /api/ana-ri/stream', file: 'server/routes/ana-ri/stream.ts' },
];

const read = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('the canonical chat paths stay in parity', () => {
  it.each(CHAT_ENTRY_POINTS)('$endpoint calls sessionBootstrapBlockFor', ({ file }) => {
    expect(read(file)).toContain('sessionBootstrapBlockFor');
  });

  it.each(CHAT_ENTRY_POINTS)('$endpoint injects the block it gets back', ({ file }) => {
    // Building the block and dropping it is the same outcome as never building
    // it, and is the easier mistake to make in a refactor.
    const src = read(file);
    expect(src).toMatch(/sessionBootstrapBlockFor\([\s\S]{0,600}?\)/);
    expect(src).toMatch(/BootstrapBlock|bootstrapBlock/);
  });

  it('neither path carries its own copy of the gate', () => {
    // The helper owns shouldAutoBootstrap, the ANA_SESSION_BOOTSTRAP_AUTO
    // kill-switch and the try/catch. A route re-implementing any of them is how
    // the two paths diverged in the first place.
    for (const { file } of CHAT_ENTRY_POINTS) {
      const src = read(file);
      expect(src, `${file} should not re-implement the gate`).not.toContain('shouldAutoBootstrap');
      expect(src, `${file} should not read the kill-switch itself`).not.toContain(
        'ANA_SESSION_BOOTSTRAP_AUTO',
      );
    }
  });

  it.each(CHAT_ENTRY_POINTS)('$endpoint assembles its tools through governedToolsetFor', ({ file }) => {
    expect(read(file)).toContain('governedToolsetFor');
  });

  it.each(CHAT_ENTRY_POINTS)('$endpoint does not assemble the raw tool surface itself', ({ file }) => {
    // `selectToolsForTurn(getAllEnabledTools(), …)` is exactly the call that
    // skipped the deny-list. Relevance selection must never see the unfiltered
    // set: governance comes first, and the helper is what guarantees the order.
    const src = read(file);
    expect(src, `${file} must not call getAllEnabledTools directly`).not.toMatch(
      /selectToolsForTurn\(\s*getAllEnabledTools\(\)/,
    );
  });

  it('every composer of the AnA tool surface goes through the helper', () => {
    // Not only the chat paths: deep-investigation assembles a toolset too, and
    // three hand-rolled copies of "load the policy, then filter" is how one of
    // them came to be missing the first step.
    const composers = [
      'server/routes/chat/send-message.ts',
      'server/routes/ana-ri/stream.ts',
      'server/services/ana/deep-investigation.ts',
      // The /ana realtime socket. Until 2026-09-26 it passed getAllEnabledTools()
      // straight to relevance selection: no deny-list, no catalog gate, and
      // every Anthropic-hosted tool the deployment enabled (D6, WS2).
      'server/services/ana/ana-realtime.ts',
    ];
    for (const file of composers) {
      const src = read(file);
      expect(src, `${file} should compose via governedToolsetFor`).toContain('governedToolsetFor');
      expect(src, `${file} should not re-implement the filter`).not.toContain('filterToolsByPolicy');
    }
  });

  it('the realtime turn runs in the tenant scope its socket was authenticated for', () => {
    // Without it every query the turn makes refuses under RLS_ENFORCE=on, and the
    // fail-soft tool-policy read degrades to "every tool allowed".
    const src = read('server/services/ana/ana-realtime.ts');
    expect(src).toMatch(/runWithTenantScope\(\s*\{\s*tenantId: String\(input\.organizationId\)/);
    expect(src).not.toMatch(/selectToolsForTurn\(\s*getAllEnabledTools\(\)/);
  });

  it('the helper applies the deny-list and says why it does not apply the allowlist', () => {
    const helper = read('server/services/ana/governed-toolset.ts');
    expect(helper).toContain('filterToolsByPolicy');
    expect(helper).toContain('loadAnaToolPolicy');
    // The allowlist is deliberately not applied here; the reason has to survive,
    // because applying it would strip every search tool the moment a tenant
    // allowlisted one mutation.
    expect(helper).toMatch(/allow`? is scoped to governed mutations/);
  });

  it('the helper still owns the gate, the kill-switch and the failure path', () => {
    const helper = read('server/services/ana-session-bootstrap.ts');
    expect(helper).toContain('shouldAutoBootstrap');
    expect(helper).toContain('ANA_SESSION_BOOTSTRAP_AUTO');
    // Never throws: a failed rehydration degrades the turn, it does not end it.
    expect(helper).toMatch(/catch\s*\{\s*return '';\s*\}/);
  });
});
