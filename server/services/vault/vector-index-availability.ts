/** Only absence of this optional vector index qualifies for lexical fallback. */
export function missingVectorIndex(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return code === '42703' || code === '42883' ||
    (code === '42704' && typeof message === 'string' && /^type ["']?vector["']? does not exist$/i.test(message));
}
