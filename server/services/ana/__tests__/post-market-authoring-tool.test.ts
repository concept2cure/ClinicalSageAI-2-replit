/**
 * author_post_market_document — registration, tenant guard, and input validation.
 *
 * The tool wraps gspr-postmarket/post-market-authoring, which persists a DRAFT
 * document and validates it. The persistence path needs a database, so only the
 * offline guards are exercised here: registration, the tenant hard-error, the
 * required-field checks, and the document_type allowlist. The content builders
 * and the compliance gate have their own suites under
 * server/services/gspr-postmarket/__tests__/.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { AUTHORABLE_DOCUMENT_TYPES } from '../../gspr-postmarket/post-market-authoring.js';

const TOOL = 'author_post_market_document';
const call = (input: Record<string, unknown>, ctx?: Record<string, unknown>) =>
  getToolHandler(TOOL)!(input, ctx as never).then(JSON.parse);

describe('author_post_market_document — registration', () => {
  it('is defined and wired', () => {
    expect(ALL_ANA_TOOLS.map((t) => t.name)).toContain(TOOL);
    expect(typeof getToolHandler(TOOL)).toBe('function');
  });

  it('advertises exactly the document types the engine can author', () => {
    const tool = ALL_ANA_TOOLS.find((t) => t.name === TOOL)!;
    const schema = tool.input_schema as {
      properties?: Record<string, { enum?: string[] }>;
    };
    // Binds the advertised enum to the engine's own TYPE_SPECS keys, so adding a
    // builder without advertising it (or vice versa) fails here.
    expect(schema.properties?.document_type?.enum?.slice().sort()).toEqual(
      [...AUTHORABLE_DOCUMENT_TYPES].sort(),
    );
  });
});

describe('author_post_market_document — guards (no DB required)', () => {
  it('hard-errors without tenant context rather than defaulting an org', async () => {
    const out = await call({ program_id: 'p-1', document_type: 'sscp' }, {});
    expect(out.error).toMatch(/tenant context/i);
  });

  it('requires program_id', async () => {
    const out = await call({ document_type: 'sscp' }, { organizationId: 1 });
    expect(out.error).toMatch(/program_id/);
  });

  it('requires document_type', async () => {
    const out = await call({ program_id: 'p-1' }, { organizationId: 1 });
    expect(out.error).toMatch(/document_type/);
  });

  it('rejects an unsupported document_type and reports the supported set', async () => {
    const out = await call(
      { program_id: 'p-1', document_type: 'cer' },
      { organizationId: 1 },
    );
    expect(out.error).toMatch(/Unsupported document_type/);
    expect(out.supported).toEqual([...AUTHORABLE_DOCUMENT_TYPES]);
  });

  it('treats a blank program_id as missing, not as a valid id', async () => {
    const out = await call(
      { program_id: '   ', document_type: 'sscp' },
      { organizationId: 1 },
    );
    expect(out.error).toMatch(/program_id/);
  });
});
