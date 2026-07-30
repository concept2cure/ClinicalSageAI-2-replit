/**
 * eCTD packager — path/slug helpers + XML escaping.
 *
 * Small, dependency-free string utilities shared by the packager core and the
 * STF cross-linking logic (study-folder slugs, the longest-common-directory of
 * a study's leaves) plus the XML attribute/text escaper used by every backbone
 * builder.
 *
 * @module server/services/submission-gateways/ectd-packager/paths
 */

/** Escape the five XML predefined entities in attribute/text content. */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** A folder-safe slug for a study id (lowercase, non-alnum → '-'). */
export function studyFolderSlug(studyId: string): string {
  return studyId.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'study';
}

/** Longest common directory prefix of package-relative POSIX paths (no filename). */
export function commonDir(paths: string[]): string {
  if (paths.length === 0) return '';
  const split = paths.map((p) => p.split('/').slice(0, -1)); // drop the filename
  const first = split[0];
  let n = first.length;
  for (const seg of split) {
    let i = 0;
    while (i < n && i < seg.length && seg[i] === first[i]) i += 1;
    n = i;
  }
  return first.slice(0, n).join('/');
}
