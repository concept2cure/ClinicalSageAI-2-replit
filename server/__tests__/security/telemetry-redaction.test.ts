/**
 * Guards the PII/secret scrubbing used by the Sentry beforeSend hook
 * (server/utils/sentry.ts). Error/telemetry events from this regulated,
 * PHI-adjacent platform must not carry credentials or identifiers to a
 * third-party sink.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  redactSecretsAndPiiText,
  redactSecretsAndPiiObject,
} from '../../services/observability/redaction';

describe('telemetry redaction — secrets + PII', () => {
  it('redacts secrets (api keys, bearer tokens, credential fields)', () => {
    const out = redactSecretsAndPiiText(
      'key sk-ABCDEF0123456789XYZ Authorization: Bearer abc.def.ghi "password":"hunter2"'
    );
    expect(out).not.toContain('sk-ABCDEF0123456789XYZ');
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts PII (email, US SSN)', () => {
    const out = redactSecretsAndPiiText('patient jane.doe@hospital.org ssn 123-45-6789');
    expect(out).not.toContain('jane.doe@hospital.org');
    expect(out).not.toContain('123-45-6789');
    expect(out).toContain('[REDACTED]');
  });

  it('scrubs an object backstop while preserving JSON structure', () => {
    const event = {
      message: 'error for user bob@clinic.com',
      extra: { token: 'Bearer secret.jwt.value', note: 'ssn 987-65-4321' },
      level: 'error',
    };
    const scrubbed = redactSecretsAndPiiObject(event);
    expect(scrubbed.level).toBe('error');
    expect(JSON.stringify(scrubbed)).not.toContain('bob@clinic.com');
    expect(JSON.stringify(scrubbed)).not.toContain('987-65-4321');
    expect(JSON.stringify(scrubbed)).not.toContain('secret.jwt.value');
  });

  it('leaves benign content intact', () => {
    const out = redactSecretsAndPiiText('document section m2.5 failed validation at step 3');
    expect(out).toBe('document section m2.5 failed validation at step 3');
  });
});


/** Load the real CommonJS middleware with its persistent audit sink injected. */
function requestAudit() {
  const entries: Array<Record<string, unknown>> = [];
  const module = { exports: {} as any };
  runInNewContext(readFileSync(new URL('../../middleware/auditLogger.js', import.meta.url), 'utf8'), {
    module, console, require: (name: string) => {
      if (name !== '../services/auditService') throw new Error('Unexpected dependency');
      return { auditLog: (entry: Record<string, unknown>) => entries.push(entry) };
    },
  });
  return { middleware: module.exports, entries };
}

describe('credential capture request audit', () => {
  it('honors server-private capture activated after middleware entry and preserves the owner response', () => {
    const { middleware, entries } = requestAudit(); const canary = 'private-derived-answer-never-request-telemetry';
    let finish = () => {};
    const req = { path: '/api/ana-ri/stream', method: 'POST', headers: {}, body: { message: canary } };
    const wire: unknown[][] = [];
    const res = { statusCode: 200, locals: { ownerPrivateCapture: false }, end: (...args: unknown[]) => { wire.push(args); }, on: (_event: string, cb: () => void) => { finish = cb; } };
    middleware({ logRequestBody: true, logResponseData: true })(req, res, () => {});
    res.locals.ownerPrivateCapture = true;
    const response = JSON.stringify({ content: canary }); res.end(response); finish();
    expect(wire).toEqual([[response]]); expect(entries).toHaveLength(1);
    expect(entries[0].bodyCapture).toBe('withheld_owner_private_context'); expect(JSON.stringify(entries)).not.toContain(canary);
  });
  it.each([
    { path: '/api/client-intelligence/ana/user-profile' },
    { path: '/api/mdx/ana/memory/profile' },
    { path: '/ana/memory/profile', baseUrl: '/api/mdx' },
    { path: '/ana/user-profile', baseUrl: '/api/client-intelligence' },
    { path: '/ana/user-profile', originalUrl: '/API/client-intelligence/ana/user-profile/?view=rules' },
    { path: '/ana/%75ser-profile', originalUrl: '/api/client-intelligence/ana/%75ser-profile' },
  ])('withholds actual owner-private profile request and response bodies: %j', path => {
    const { middleware, entries } = requestAudit();
    const canary = 'owner-private-correction-and-rule-never-telemetry';
    let finish = () => {};
    const req = { ...path, method: 'POST', headers: {}, user: { id: 5, tenantId: 7 },
      body: { action: 'create_rule', reason: canary, correction: { text: canary }, rule: { name: canary, instructions: canary } } };
    const chunks: unknown[][] = [];
    const res = { statusCode: 200, end: (...args: unknown[]) => { chunks.push(args); }, on: (_event: string, cb: () => void) => { finish = cb; } };
    middleware({ logRequestBody: true, logResponseData: true })(req, res, () => {});
    const body = JSON.stringify({ privateRules: { rules: [{ instructions: canary }] }, profile: { notes: canary } });
    res.end(body, 'utf8'); finish();
    expect(chunks).toEqual([[body, 'utf8']]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'API_REQUEST', userId: 5, statusCode: 200, bodyCapture: 'withheld_owner_private_profile' });
    expect(entries[0]).not.toHaveProperty('requestBody'); expect(entries[0]).not.toHaveProperty('responseData');
    expect(JSON.stringify(entries)).not.toContain(canary);
  });
  it('redacts vault capture, reauthentication and PEM containers in actual request/response logging', () => {
    const { middleware, entries } = requestAudit();
    const canary = 'client-vault-canary-never-a-live-credential';
    let finish = () => {};
    const req = { path: '/api/deep-research/connectors', method: 'POST', ip: '127.0.0.1', headers: {},
      user: { id: 5, tenantId: 7 }, body: { connectorId: 'llm_openai', action: 'rotate',
        credentials: { api_key: canary }, reauth: { code: canary }, clientKeyPem: canary, clientCertPem: canary,
        rows: [{ passphrase: canary, recovery_code: canary, totp: canary }] } };
    const res = { statusCode: 200, end: () => {}, on: (_event: string, cb: () => void) => { finish = cb; } };
    middleware({ logRequestBody: true, logResponseData: true })(req, res, () => {});
    (res.end as (...args: unknown[]) => void)(JSON.stringify({ credentials: canary, reauth: { code: canary }, status: 'stored' }));
    finish();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain(canary);
    expect(entries[0].requestBody).toMatchObject({ connectorId: 'llm_openai', action: 'rotate', credentials: '[REDACTED]', reauth: '[REDACTED]' });
    expect(String(entries[0].responseData)).toContain('stored');
  });
  it('truncates beyond the depth limit instead of logging unexamined nested secrets', () => {
    const { middleware } = requestAudit();
    const canary = 'deep-client-canary';
    const nested = Array.from({ length: 12 }).reduce<Record<string, unknown>>(value => ({ nested: value }), { password: canary });
    expect(JSON.stringify(middleware.scrubSensitive(nested))).not.toContain(canary);
    expect(JSON.stringify(middleware.scrubSensitive(nested))).toContain('DEPTH_LIMIT');
  });
});


describe('telemetry credential containers', () => {
  it('removes arbitrary client credential values by key without relying on vendor prefixes', () => {
    const canary = 'private-client-value-with-no-provider-prefix';
    const out = redactSecretsAndPiiObject({ extra: { credentials: { arbitrary: canary }, clientKeyPem: canary, reauth: { code: canary } }, status: 'failed' });
    expect(JSON.stringify(out)).not.toContain(canary);
    expect(out.status).toBe('failed');
  });
  it('redacts private key blocks in an unstructured exception string', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nfixture-material-not-a-key\n-----END PRIVATE KEY-----';
    expect(redactSecretsAndPiiText(`Provider error: ${key}`)).not.toContain('fixture-material-not-a-key');
  });
  it('bounds cyclic and deep telemetry without returning raw credential subtrees', () => {
    const payload: Record<string, unknown> = { status: 'failed' };
    payload.cycle = payload;
    payload.deep = Array.from({ length: 12 }).reduce<Record<string, unknown>>(value => ({ nested: value }), { credentials: 'deep-client-canary' });
    const out = JSON.stringify(redactSecretsAndPiiObject(payload));
    expect(out).not.toContain('deep-client-canary');
    expect(out).toContain('CIRCULAR');
    expect(out).toContain('DEPTH_LIMIT');
  });
});


describe('explicit derivative transforms do not certify arbitrary prose', () => {
  it('uses only the explicit template, hides selected secrets and restores them exactly', async () => {
    const { buildExplicitDerivative, reinjectExplicitDerivative } = await import('../../services/observability/redaction');
    const source = 'SecretMolecule-X uses 3.14159 mg. Unselected client commentary must not travel.';
    const transform = buildExplicitDerivative(source, 'Assess {{0}} at dose {{1}}.', [
      { start: 0, end: 16, label: 'MOLECULE' }, { start: 22, end: 29, label: 'VALUE' },
    ]);
    expect(transform.payload).not.toContain('SecretMolecule-X');
    expect(transform.payload).not.toContain('3.14159');
    expect(transform.payload).not.toContain('Unselected');
    expect(transform.payload).toContain('[[C2C_');
    expect(reinjectExplicitDerivative(transform.payload, transform)).toBe('Assess SecretMolecule-X at dose 3.14159.');
    const zero = buildExplicitDerivative('0', 'Dose {{0}}.', [{ start: 0, end: 1, label: 'VALUE' }]);
    expect(reinjectExplicitDerivative(zero.payload, zero)).toBe('Dose 0.');
  });
  it('refuses literal leakage, overlapping ranges, malformed template, and missing/duplicate/unknown output tokens', async () => {
    const { buildExplicitDerivative, reinjectExplicitDerivative } = await import('../../services/observability/redaction');
    const spans = [{ start: 0, end: 6, label: 'ENTITY' as const }];
    expect(() => buildExplicitDerivative('Secret', 'Secret {{0}}', spans)).toThrow();
    expect(() => buildExplicitDerivative('Secret', '{{0}} {{0}}', spans)).toThrow();
    expect(() => buildExplicitDerivative('Secret', '{{0}} {{2}}', spans)).toThrow();
    expect(() => buildExplicitDerivative('Secret', '{{0}} {{1}}', [...spans, { start: 2, end: 5, label: 'VALUE' }])).toThrow();
    const t = buildExplicitDerivative('Secret', 'Assess {{0}}.', spans);
    for (const output of ['No tokens', `${t.payload} ${t.tokens[0].token}`, `${t.payload} [[C2C_FORGED]]`, `${t.payload} [[c2c_bad]]`, `${t.payload} [[ C2C_BAD`, t.payload.replace('C2C_', 'C2C_ALTERED_')]) {
      expect(() => reinjectExplicitDerivative(output, t)).toThrow();
    }
  });
});
