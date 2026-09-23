/**
 * Transmit-time leaf security: re-read the signed bundle and judge every PDF in it.
 *
 * 2026-09-22 (W5/D7). The packager refuses a secured PDF leaf, but a bundle is
 * stored between assembly and transmit, and the packager's gate had holes for
 * as long as those bundles have existed: a secured file of 513-575 KB, an
 * /Encrypt in an earlier incremental section, a #-escaped /Encrypt, secured PDF
 * bytes under a non-.pdf name. A bundle built through any of them is on disk
 * with nothing marking it, and dispatch readiness never opens the bundle.
 *
 * A marker saying "the gate ran" would certify those bundles too: it records
 * that a gate ran, not what the gate could see. So this re-establishes the fact
 * from the bytes being sent — the sha256-verified bundle — with the one rule the
 * packager uses (leaf-pdf-security). It runs for every bundle format and in
 * every environment: 'staging' is the agency's test system, which is still a
 * transmit to an agency, and it is the environment launch row D7 is judged in.
 *
 * Every format, not only eCTD (review fix, 2026-09-22): the format label is
 * chosen at assembly, so an IND package labelled 'estar' skipped the check and
 * reached FDA ESG unexamined. The official eSTAR is itself an FDA form and
 * passes as one when it carries FDA's own security (leaf-pdf-security).
 *
 * @module server/services/submission-gateways/bundle-leaf-security
 */

import JSZip from 'jszip';
import { readVerifiedBundle } from './bundle-integrity';
import { ValidationError, type Region, type SubmissionBundle } from './types';
import { isPdfLeaf } from '../ectd/pdfa-detect';
import { assessLeafPdfSecurity } from '../ectd/leaf-pdf-security';

export interface BundleLeafSecurityReport {
  /** PDF entries judged (by name or by %PDF- header). */
  pdfEntries: number;
  /** Agency forms shipped as issued, by path. */
  agencyFormsAsIssued: string[];
}

/**
 * Refuse a transmit whose signed bundle contains a secured PDF. Returns what
 * was judged. Throws ValidationError when the bundle cannot be read or opened —
 * a package whose leaves cannot be examined is never reported as clear.
 */
export async function assertBundleLeafSecurity(
  bundle: SubmissionBundle,
  region: Region,
): Promise<BundleLeafSecurityReport> {
  const buf = await readVerifiedBundle(bundle);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (err) {
    throw new ValidationError(
      'Refusing to transmit: the signed bundle could not be opened as a ZIP, so the security settings of its PDF leaves ' +
        'cannot be established. Re-assemble the package.',
      [{ check: 'bundle-leaf-security', error: err instanceof Error ? err.message : String(err) }],
    );
  }

  const refused: Array<{ path: string; reason: string }> = [];
  const agencyFormsAsIssued: string[] = [];
  let pdfEntries = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const bytes = await entry.async('nodebuffer');
    // 2026-09-23 (W5/D7, round-2 review): the shared predicate (name .pdf OR
    // %PDF- header), not an inline copy of it — pdfa-detect isPdfLeaf.
    if (!isPdfLeaf(entry.name, bytes)) continue;
    pdfEntries += 1;
    const verdict = await assessLeafPdfSecurity(bytes, region);
    if (verdict.verdict === 'secured') refused.push({ path: entry.name, reason: verdict.reason });
    else if (verdict.verdict === 'fda-form-as-issued') agencyFormsAsIssued.push(entry.name);
  }

  if (refused.length > 0) {
    const shown = refused.slice(0, 3).map((r) => `${r.path} (${r.reason})`).join('; ');
    throw new ValidationError(
      `Refusing to transmit: ${refused.length} PDF leaf/leaves in the signed package are encrypted/secured: ${shown}` +
        `${refused.length > 3 ? '; …' : ''}. Replace them and re-assemble the package.`,
      refused.map((r) => ({ check: 'bundle-leaf-security', ruleId: 'LEAF-ENCRYPTED', path: r.path, reason: r.reason })),
    );
  }
  return { pdfEntries, agencyFormsAsIssued: agencyFormsAsIssued.sort() };
}

export default { assertBundleLeafSecurity };
