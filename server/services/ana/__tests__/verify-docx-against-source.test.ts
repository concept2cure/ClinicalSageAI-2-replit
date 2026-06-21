/**
 * Smoke tests for verify_docx_against_source — the content-fidelity verification
 * tool (the audited "verify it against your text" step that complements
 * validate_docx's structural check).
 *
 * These verify wiring (registration, schema exposure, tenant guard, and
 * structured JSON errors on bad input) without a real .docx on disk — the
 * handler validates inputs before any file read.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOL = 'verify_docx_against_source';

describe('verify_docx_against_source — registration & schema', () => {
  it('registers a handler', () => {
    const handler = getToolHandler(TOOL);
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('is exposed to AnA in ALL_ANA_TOOLS with input_docx_path required', () => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === TOOL);
    expect(def).toBeDefined();
    expect(def!.description.length).toBeGreaterThan(50);
    expect(def!.input_schema.required).toContain('input_docx_path');
    const props = def!.input_schema.properties as Record<string, unknown>;
    expect(props.expected_text).toBeDefined();
    expect(props.required_strings).toBeDefined();
  });
});

describe('verify_docx_against_source — input guards', () => {
  it('errors without input_docx_path', async () => {
    const handler = getToolHandler(TOOL)!;
    const out = JSON.parse(await handler({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/input_docx_path/);
  });

  it('errors without tenant context', async () => {
    const handler = getToolHandler(TOOL)!;
    const out = JSON.parse(await handler({ input_docx_path: '/tmp/x.docx', expected_text: 'hi' }, {} as any));
    expect(out.error).toMatch(/tenant context|organizationId/);
  });

  it('errors when neither expected_text nor required_strings is supplied', async () => {
    const handler = getToolHandler(TOOL)!;
    const out = JSON.parse(
      await handler({ input_docx_path: '/tmp/x.docx' }, { organizationId: 1 } as any),
    );
    expect(out.error).toMatch(/expected_text|required_strings/);
  });
});
