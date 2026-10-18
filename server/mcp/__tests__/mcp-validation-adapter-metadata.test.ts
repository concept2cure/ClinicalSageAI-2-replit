import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ExternalValidatorKind } from '../../services/ectd/external-validator/types';
import type { ToolSpec } from '../tools/runtime';

const { resolveExternalValidator, executeValidator } = vi.hoisted(() => ({
  resolveExternalValidator: vi.fn(),
  executeValidator: vi.fn(),
}));
vi.mock('../../services/ectd/external-validator', () => ({ resolveExternalValidator }));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
}));

import { validateEctdStructure } from '../tools/validation';
import { registerTool } from '../tools/runtime';
import { validatePackage } from '../../services/ectd/ectd4-validator';

type Handler = (input: Record<string, unknown>, extra: { authInfo?: unknown }) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}>;

function capture() {
  let handler: Handler | undefined;
  const server = { registerTool: (_name: string, _meta: unknown, fn: Handler) => { handler = fn; } };
  registerTool(server as Parameters<typeof registerTool>[0], validateEctdStructure as ToolSpec<z.ZodRawShape>, {} as Parameters<typeof registerTool>[2]);
  return handler!;
}

const principal = {
  userId: 42, organizationId: 7, organizationUuid: null, role: 'viewer',
  email: 'reviewer@tenant.example', clientId: 'first-party', scopes: ['c2c:read'], tokenUse: 'platform',
};
const authInfo = { token: 'fixture', clientId: 'first-party', scopes: principal.scopes, extra: { principal } };
const input = z.object(validateEctdStructure.inputSchema).parse({
  leaves: [{ section_code: 'm1.1', title: 'Cover letter', file_path: 'm1/us/cover-letter.pdf', file_size: 128 }],
  region: 'US',
});

function selected(name: string, kind: ExternalValidatorKind, available: boolean) {
  return { name, kind, isConfigured: vi.fn(async () => available), validate: executeValidator };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveExternalValidator.mockResolvedValue(selected('noop', 'unavailable', false));
});

describe('MCP structural validation reports adapter discovery without implying execution', () => {
  it.each([
    { name: 'fda-criteria-subset', kind: 'internal_subset' as const, available: true, configuredExternal: false, wording: 'internal subset; not an external validator' },
    { name: 'lorenz-evalidator', kind: 'external_engine' as const, available: true, configuredExternal: true, wording: 'external adapter path/endpoint configured' },
    { name: 'noop', kind: 'unavailable' as const, available: false, configuredExternal: false, wording: 'no validation adapter available' },
  ])('$kind retains its classification and explicitly has not run', async ({ name, kind, available, configuredExternal, wording }) => {
    resolveExternalValidator.mockResolvedValue(selected(name, kind, available));
    const out = await capture()(input, { authInfo });
    expect(out.isError).not.toBe(true);
    expect(out.structuredContent?.externalValidator).toMatchObject({
      name, kind, adapterAvailable: available,
      configuredExternal, configured: configuredExternal,
      execution: 'not_run', ran: false, qualification: 'not_assessed',
    });
    const summary = out.content[0]?.text ?? '';
    expect(summary).toContain('Validation adapter:');
    expect(summary).toContain(wording);
    expect(summary).toContain('validation has not run for this package');
    expect(summary).not.toContain('External validator:');
    if (kind === 'external_engine') expect(summary).toContain('licence and qualification not verified');
    expect(executeValidator).not.toHaveBeenCalled();
  });

  it('uses the selected kind rather than inferring authority from the adapter name', async () => {
    resolveExternalValidator.mockResolvedValue(selected('lorenz-evalidator', 'internal_subset', true));
    const out = await capture()(input, { authInfo });
    expect(out.structuredContent?.externalValidator).toMatchObject({ kind: 'internal_subset', adapterAvailable: true, configured: false, configuredExternal: false, ran: false });
    expect(out.content[0]?.text).toContain('internal subset; not an external validator');
    expect(executeValidator).not.toHaveBeenCalled();
  });

  it('does not label an unavailable external adapter as configured', async () => {
    resolveExternalValidator.mockResolvedValue(selected('lorenz-evalidator', 'external_engine', false));
    const out = await capture()(input, { authInfo });
    expect(out.structuredContent?.externalValidator).toMatchObject({ kind: 'external_engine', adapterAvailable: false, configuredExternal: false, configured: false, ran: false });
    expect(out.content[0]?.text).toContain('external adapter path/endpoint not configured');
  });

  it.each(['resolver', 'configuration'])('%s discovery failure is unknown, never a claim of no engine', async (stage) => {
    const failure = new Error(`${stage} discovery unavailable`);
    if (stage === 'resolver') resolveExternalValidator.mockRejectedValue(failure);
    else resolveExternalValidator.mockResolvedValue({ ...selected('lorenz-evalidator', 'external_engine', true), isConfigured: vi.fn(async () => { throw failure; }) });
    const out = await capture()(input, { authInfo });
    expect(out.isError).not.toBe(true); // the existing structural result remains available
    expect(out.structuredContent?.externalValidator).toMatchObject({
      kind: 'unknown', adapterAvailable: null, configured: false, configuredExternal: false,
      execution: 'not_run', ran: false, qualification: 'not_assessed',
    });
    expect(out.content[0]?.text).toContain(`${stage} discovery unavailable`);
    expect(out.content[0]?.text).toContain('adapter discovery unresolved');
    expect(out.content[0]?.text).not.toContain('no validation adapter available');
    expect(executeValidator).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'vendor_pass', available: true, expectedAvailability: true },
    { kind: 'internal_subset', available: 'false', expectedAvailability: null },
  ])('unexpected discovery values remain unknown: $kind / $available', async ({ kind, available, expectedAvailability }) => {
    resolveExternalValidator.mockResolvedValue({
      name: 'fda-criteria-subset', kind, isConfigured: vi.fn(async () => available), validate: executeValidator,
    });
    const out = await capture()(input, { authInfo });
    expect(out.structuredContent?.externalValidator).toMatchObject({
      kind: 'unknown', adapterAvailable: expectedAvailability, configured: false, configuredExternal: false,
      execution: 'not_run', ran: false, qualification: 'not_assessed',
    });
    expect(out.content[0]?.text).toContain('adapter discovery unresolved');
    expect(out.content[0]?.text).not.toContain('subset available');
    expect(executeValidator).not.toHaveBeenCalled();
  });

  it('preserves the actual structural validation result and read-only access contract', async () => {
    const out = await capture()(input, { authInfo });
    const expected = validatePackage([{
      sectionCode: 'm1.1', title: 'Cover letter', filePath: 'm1/us/cover-letter.pdf',
      checksum: '', checksumType: 'md5', operation: 'new', mimeType: 'application/pdf', fileSize: 128,
    }], 'IND', { region: 'US' });
    expect(out.structuredContent).toMatchObject({ source: '1 supplied leaves', submissionType: 'IND', region: 'US' });
    expect(out.structuredContent?.result).toMatchObject({ valid: expected.valid, score: expected.score, findings: expected.findings, summary: expected.summary });
    expect(validateEctdStructure.scope).toBe('c2c:read');
    expect(validateEctdStructure.governed).toBe(false);
    expect(validateEctdStructure.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  });

  it('retains scope denial before discovery or validation executes', async () => {
    const noReadScope = { ...authInfo, scopes: [], extra: { principal: { ...principal, scopes: [] } } };
    const out = await capture()(input, { authInfo: noReadScope });
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toContain('requires c2c:read');
    expect(resolveExternalValidator).not.toHaveBeenCalled();
    expect(executeValidator).not.toHaveBeenCalled();
  });
});
