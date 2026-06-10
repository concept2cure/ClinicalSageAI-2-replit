/**
 * Guards the PII/secret scrubbing used by the Sentry beforeSend hook
 * (server/utils/sentry.ts). Error/telemetry events from this regulated,
 * PHI-adjacent platform must not carry credentials or identifiers to a
 * third-party sink.
 */

import { describe, it, expect } from 'vitest';
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
