/** Provider wire projection only. Canonical schemas and executor validation stay intact. */
export function openAIToolSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const wire = { ...schema };
  // OpenAI rejects these at the function-parameters root, even in non-strict mode.
  // Nested constraints are supported and must not be stripped.
  for (const key of ['oneOf', 'anyOf', 'allOf', 'enum', 'const', 'not']) delete wire[key];
  return wire;
}
