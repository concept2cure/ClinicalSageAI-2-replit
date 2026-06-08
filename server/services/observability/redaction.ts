const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
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
 * scrubbing only string VALUES — structure (keys, nesting, arrays) is preserved,
 * and non-plain objects (Date, Buffer, etc.) are left intact. Used as the
 * backstop scrubber for outbound telemetry events.
 */
export function redactSecretsAndPiiObject<T>(payload: T): T {
  return deepRedact(payload) as T;
}

function deepRedact(value: unknown): unknown {
  if (typeof value === 'string') return redactSecretsAndPiiText(value);
  if (Array.isArray(value)) return value.map(deepRedact);
  if (value !== null && typeof value === 'object') {
    // Only descend into plain objects; preserve Dates/Buffers/class instances.
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        out[key] = deepRedact(v);
      }
      return out;
    }
  }
  return value;
}
