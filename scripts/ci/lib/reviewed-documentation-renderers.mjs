import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// These are operator-run exports of a repository study, never application or
// regulated-artifact rendering entry points. The historical copy must retain
// its original bytes. Approval covers these exact files AND these exact bytes;
// a changed renderer or another file under docs must undergo a new review.
export const REVIEWED_DOCUMENTATION_RENDERERS = new Map([
  ['docs/publications/data-room-2026-10-14/render_study.py',
    '9ef18242bc7b07534a169fb94b0caff680d9b8093d03df77c640df5693664449'],
  ['docs/publications/data-room-2026-10-14/authored-history/render_data_room_study.py',
    'f988de183bee2310d575bb64ccae2abfeb562bf1ab863baa67fa5883bb9c6293'],
]);

export function isReviewedDocumentationRenderer(repoRoot, relativePath) {
  const expected = REVIEWED_DOCUMENTATION_RENDERERS.get(relativePath);
  if (!expected) return false;
  try {
    return createHash('sha256').update(readFileSync(path.join(repoRoot, relativePath))).digest('hex') === expected;
  } catch {
    return false;
  }
}
