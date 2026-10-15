/**
 * ind_generate_section and ind_get_status are retired (D2, 2026-10-05,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-retire-ind-generate-tools-*).
 *
 * Both handlers called back into this server's own /api/ind-generation routes
 * over localhost with no Authorization header. That router is mounted behind
 * authenticateToken (server/routes/register-ai-routes.ts), which answers a
 * request without a Bearer token with 401 AUTH_001 — so every call AnA made
 * came back as that 401, and the generator's own save step was a second
 * uncredentialed loopback that never saved anything either.
 *
 * The replacements, by path:
 *   - what a section must contain: get_document_section_requirements
 *     (server/services/ana/regulatory-knowledge-tools.ts);
 *   - drafting it as a real document: draft_authoring_document
 *     (server/services/ana/document-surface-tool-defs.ts), or
 *     batch_draft_sections for several sections.
 * There is no project-level IND progress replacement for ind_get_status.
 *
 * The first test stubs fetch with a server that enforces Bearer auth exactly
 * as authenticateToken does, so on the code that still has the handlers the
 * failure message carries the AUTH_001 body the person would have got.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../AnaToolExecutor';
import { buildSuggestedActions } from '../intelligence-questions/engine.js';
import { getFlowDefinition } from '../intelligence-questions/flows/index.js';

const RETIRED = ['ind_generate_section', 'ind_get_status'] as const;

/** A loopback server that enforces auth the way authenticateToken does. */
function bearerEnforcingFetch() {
  return vi.fn(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
    const auth = init?.headers?.Authorization ?? init?.headers?.authorization;
    if (!auth || !String(auth).startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required', code: 'AUTH_001' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the IND loopback tools are retired', () => {
  it('have no handler — the one they had could only ever get 401 AUTH_001', async () => {
    vi.stubGlobal('fetch', bearerEnforcingFetch());
    // humanConfirmed: the person has already said yes, so a confirm-class tool
    // reaches its body and the answer below is what the body itself returns.
    const ctx = { organizationId: 1, userId: 1, projectId: '1', humanConfirmed: true };
    const answers: Record<string, string> = {};
    for (const name of RETIRED) {
      const handler = getToolHandler(name);
      answers[name] = handler
        ? String(await handler({ section_code: '2.5', project_id: '1' }, ctx as never))
        : 'no handler';
    }
    expect(answers).toEqual({ ind_generate_section: 'no handler', ind_get_status: 'no handler' });
  });

  it('are not offered to the model', () => {
    const offered = new Set(ALL_ANA_TOOLS.map((t) => t.name));
    for (const name of RETIRED) expect(offered.has(name), name).toBe(false);
  });

  it('are absent from the authorization register', () => {
    const register = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'tool-authorization.register.json'), 'utf8'),
    ) as { tools: Record<string, unknown> };
    expect(Object.keys(register.tools).length).toBeGreaterThan(100);
    for (const name of RETIRED) expect(Object.keys(register.tools), name).not.toContain(name);
  });

  it('are absent from the launch-scope inventory', () => {
    const inv = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'ana-launch-scope.inventory.json'), 'utf8'),
    ) as { tools: { inScope: string[]; hiddenApp: unknown } };
    expect(inv.tools.inScope.length).toBeGreaterThan(100);
    const hidden = JSON.stringify(inv.tools.hiddenApp);
    for (const name of RETIRED) {
      expect(inv.tools.inScope, name).not.toContain(name);
      expect(hidden, name).not.toContain(`"${name}"`);
    }
  });

  it('the IND flow offers drafting through draft_authoring_document, a registered tool', () => {
    const def = getFlowDefinition('ind_submission', {
      organizationId: 1,
      userId: 1,
      projectId: null,
      clientType: 'pharma',
    });
    expect(def).toBeTruthy();
    const actions = buildSuggestedActions(def!);
    const types = actions.map((a) => a.actionType);
    expect(types).toContain('draft_authoring_document');
    for (const name of RETIRED) {
      expect(types, name).not.toContain(name);
      for (const a of actions) expect(a.description, name).not.toContain(name);
    }
    for (const t of types) expect(typeof getToolHandler(t), t).toBe('function');
  });
});
