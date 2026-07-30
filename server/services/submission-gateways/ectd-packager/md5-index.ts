/**
 * eCTD packager — index-md5.txt manifest builder.
 *
 * The eCTD integrity contract: one `<md5>  <relPath>` line per package file,
 * sorted so the manifest is byte-identical across environments. Split out so
 * both the regional packager and the v4 RPS packager share one implementation.
 *
 * @module server/services/submission-gateways/ectd-packager/md5-index
 */

import type { ChecksumEntry } from './types';

/** Build the sorted `util/index-md5.txt` body (one MD5 per file). */
export function buildMd5Index(entries: ChecksumEntry[]): string {
  return entries
    .slice()
    // Codepoint order, not localeCompare: the manifest must be byte-identical
    // across environments (the checksum contract), and locale collation is
    // locale/ICU-dependent.
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
    .map((e) => `${e.md5}  ${e.relPath}`)
    .join('\n');
}
