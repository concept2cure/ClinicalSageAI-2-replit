/** One exact-text identity implementation for drafting producers and verifiers. */
import { createHash } from 'node:crypto';
import type { DraftSourceSpan, DraftSourceTextIdentityV2 } from '../../../shared/authoring/draft-source-reference.js';

/** UTF-8 replaces unpaired surrogates; refuse those lossy text identities. */
function wellFormed(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

/** Half-open UTF-16 spans; no coercion, source normalization or text replacement. */
export function draftSourceIdentityForText(text: string, span: DraftSourceSpan): DraftSourceTextIdentityV2 {
  const start = span?.start;
  const end = span?.end;
  const totalChars = span?.totalChars;
  if (typeof text !== 'string' || ![start, end, totalChars].every(Number.isSafeInteger) ||
      start < 0 || end <= start || end - start > 12000 || end > text.length || totalChars !== text.length) {
    throw new Error('Invalid source excerpt identity');
  }
  const excerpt = text.slice(start, end);
  if (!wellFormed(text) || !wellFormed(excerpt)) throw new Error('Invalid source text encoding');
  return { version: 2, extractedTextSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    spanSha256: createHash('sha256').update(excerpt, 'utf8').digest('hex') };
}
