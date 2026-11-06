import { createHash, randomBytes } from 'node:crypto';

/** Explicit spans and a minimized template are proposed locally. This is NOT
 * automatic de-identification: the exact residual needs human attestation. */
export interface DerivativeSpan { start: number; end: number; label: 'ENTITY' | 'MOLECULE' | 'VALUE' | 'IDENTIFIER' | 'NAME' }
export interface DerivativeTransform {
  payload: string;
  payloadSha256: string;
  tokens: Array<{ token: string; value: string }>;
}
const DERIVATIVE_TOKEN = /\[\[C2C_[A-Z0-9_]+\]\]/g;
const DERIVATIVE_TOKEN_EXACT = /^\[\[C2C_[A-F0-9]{24}_(?:ENTITY|MOLECULE|VALUE|IDENTIFIER|NAME)_\d{1,2}\]\]$/;
const DERIVATIVE_LABELS = new Set(['ENTITY', 'MOLECULE', 'VALUE', 'IDENTIFIER', 'NAME']);
export const derivativePayloadSha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/** {{0}}, {{1}}, ... each selects one exact source span. No source prose is
 * copied implicitly; any template prose is part of the reviewed residual. */
export function buildExplicitDerivative(source: string, template: string, spans: readonly DerivativeSpan[]): DerivativeTransform {
  if (typeof source !== 'string' || typeof template !== 'string' || template.length < 1 || template.length > 100_000 ||
      /\[\[\s*c2c|\{\{[^}]*\}\}/i.test(template.replace(/\{\{\d+\}\}/g, '')) ||
      !Array.isArray(spans) || spans.length < 1 || spans.length > 100) throw new Error('Choose an explicit bounded derivative template and source spans.');
  const namespace = randomBytes(12).toString('hex').toUpperCase();
  const tokens = spans.map((span, index) => {
    if (!Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start ||
        span.end > source.length || !DERIVATIVE_LABELS.has(span.label) || (index > 0 && span.start < spans[index - 1].end)) {
      throw new Error('Derivative source spans must be ordered, valid and non-overlapping.');
    }
    const marker = `{{${index}}}`;
    if (template.split(marker).length !== 2) throw new Error('Each selected source span must appear exactly once in the template.');
    const value = source.slice(span.start, span.end);
    if (/\[\[\s*c2c/i.test(value)) throw new Error('A selected source value contains reserved derivative syntax.');
    return { token: `[[C2C_${namespace}_${span.label}_${index}]]`, value };
  });
  const payload = template.replace(/\{\{(\d+)\}\}/g, (_, index: string) => {
    const entry = tokens[Number(index)];
    if (!entry || String(Number(index)) !== index) throw new Error('Unknown derivative template span.');
    return entry.token;
  });
  // This bounded literal check is a necessary seeded-secret guard, never a
  // certification that unrelated residual prose is public.
  const residual = payload.replace(DERIVATIVE_TOKEN, '');
  if (tokens.some(entry => residual.includes(entry.value))) throw new Error('A selected source value remains in the derivative template.');
  return { payload, payloadSha256: derivativePayloadSha256(payload), tokens };
}

/** Every selected value appears exactly once. Unrecognized, missing or
 * duplicated placeholders fail before a single restricted value is returned. */
export function reinjectExplicitDerivative(output: string, transform: DerivativeTransform): string {
  if (typeof output !== 'string' || output.length > 200_000 || derivativePayloadSha256(transform.payload) !== transform.payloadSha256) {
    throw new Error('The derivative output or recorded payload identity is invalid.');
  }
  const inventory = output.match(DERIVATIVE_TOKEN) ?? [];
  const residual = output.replace(DERIVATIVE_TOKEN, '');
  if (!Array.isArray(transform.tokens) || transform.tokens.length < 1 || transform.tokens.length > 100 ||
      transform.tokens.some(entry => !entry || !DERIVATIVE_TOKEN_EXACT.test(entry.token) || typeof entry.value !== 'string' || !entry.value || residual.includes(entry.value))) {
    throw new Error('Restricted values must be injected locally from their issued tokens.');
  }
  const expected = new Map(transform.tokens.map(entry => [entry.token, entry.value]));
  if (expected.size !== transform.tokens.length || inventory.length !== expected.size ||
      inventory.some(token => !expected.has(token)) || new Set(inventory).size !== expected.size ||
      transform.tokens.some(entry => output.split(entry.token).length !== 2) ||
      /\[\[\s*c2c/i.test(residual)) throw new Error('Derivative token verification failed. No restricted values were returned.');
  return output.replace(DERIVATIVE_TOKEN, token => expected.get(token)!);
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g,
  /"?(password|secret|token|api[_-]?key)"?\s*:\s*"[^"]+"/gi,
];

export function redactSensitiveText(input: string): string {
  let redacted = input;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

export function redactUnknownObject<T>(payload: T): T {
  const serialized = JSON.stringify(payload);
  if (!serialized) return payload;
  const redacted = redactSensitiveText(serialized);
  return JSON.parse(redacted) as T;
}

// High-precision PII patterns layered on top of the secret patterns above.
// Kept conservative to avoid over-redacting legitimate telemetry: email
// addresses and US SSNs are the highest-risk identifiers to keep out of
// third-party error/telemetry pipelines for a regulated (PHI-adjacent) app.
const PII_PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // email address
  /\b\d{3}-\d{2}-\d{4}\b/g, // US SSN
];

/** Redact secrets AND common PII (email, SSN) from a string. */
export function redactSecretsAndPiiText(input: string): string {
  let redacted = redactSensitiveText(input);
  for (const pattern of PII_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * Redact secrets + PII across an arbitrary object by recursively walking it and
 * scrubbing credential containers by key and PII in strings. Nesting and arrays
 * are preserved within bounded depth; cycles and excessive depth are redacted,
 * and non-plain objects (Date, Buffer, etc.) are left intact. Used as the
 * backstop scrubber for outbound telemetry events.
 */
export function redactSecretsAndPiiObject<T>(payload: T): T {
  return deepRedact(payload, new WeakSet<object>(), 0) as T;
}

const SECRET_FIELD = /password|secret|token|credential|reauth|authorization|cookie|api[_-]?key|private[_-]?key|(?:key|cert)[_-]?pem|passphrase|recovery[_-]?code|otp|^pin$/i;

function deepRedact(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 8) return '[REDACTED:DEPTH_LIMIT]';
  if (typeof value === 'string') return redactSecretsAndPiiText(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[REDACTED:CIRCULAR]';
    seen.add(value);
    return value.map(item => deepRedact(item, seen, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    // Only descend into plain objects; preserve Dates/Buffers/class instances.
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      if (seen.has(value)) return '[REDACTED:CIRCULAR]';
      seen.add(value);
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        out[key] = SECRET_FIELD.test(key) ? '[REDACTED]' : deepRedact(v, seen, depth + 1);
      }
      return out;
    }
  }
  return value;
}
