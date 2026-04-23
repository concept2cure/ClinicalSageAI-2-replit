/**
 * Provenance helpers for chat routes.
 * Pure functions — no side effects, no external deps.
 *
 * @module server/routes/chat/provenance
 */

import { createHash } from 'crypto';

/** SHA-256 hex digest of a UTF-8 string */
export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Deterministic JSON.stringify — sorted keys, undefined omitted */
export function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .filter(k => obj[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  );
}
