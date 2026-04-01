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
