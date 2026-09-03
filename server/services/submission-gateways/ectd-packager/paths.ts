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

/**
 * Characters XML 1.0 forbids anywhere in a document (§2.2 Char): C0 controls
 * other than TAB / LF / CR, DEL and the C1 controls, and the non-characters
 * U+FFFE / U+FFFF. Entity escaping cannot represent them — a backbone that
 * contains one is not well-formed and a regional validator rejects the whole
 * submission. Written as escape sequences; the source carries no raw bytes.
 */
const XML_ILLEGAL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]/g;

/** Escape the five XML predefined entities in attribute/text content, after
 *  stripping characters XML cannot carry at all (XML_ILLEGAL_CHARS). */
export function escapeXml(s: string): string {
  return s.replace(XML_ILLEGAL_CHARS, '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
