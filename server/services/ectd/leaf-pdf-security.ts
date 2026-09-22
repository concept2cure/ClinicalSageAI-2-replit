/**
 * Whether a PDF leaf's security settings let it ship in an eCTD sequence.
 *
 * One rule, used everywhere a leaf's bytes are judged: the v3.2.2 packager, the
 * v4.0 RPS packager, and the transmit guard that re-reads the signed bundle.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * The eCTD PDF specifications prohibit security settings. FDA makes one
 * exception, for its own forms: forms "available from the FDA website may
 * contain security settings that prevent changing the essential elements of
 * the form … these forms should be submitted with their existing security
 * settings" (FDA, Electronic Submission File Formats and Specifications —
 * PDF security; see docs/evidence/W5/2026-09-22/README.md for how that text was
 * sourced).
 *
 * The packager refused every PDF with an /Encrypt entry. The official Form FDA
 * 1571 and 3674 are FDA-secured (AESV2, empty user password), and the platform
 * fills them by incremental update so every byte FDA issued is preserved. So the
 * m1.1 transmittal form of every IND sequence was refused with LEAF-ENCRYPTED:
 * the sequence the launch row D7 needs could not be packaged at all.
 *
 * ── How "an FDA form as issued" is established ──────────────────────────────
 * Deterministically, from bytes, never from a name, a section code or a flag:
 *   1. region is FDA;
 *   2. the leaf BEGINS WITH the exact bytes of a vendored FDA form template
 *      whose sha256 matches its manifest (an incremental update appends; it
 *      never rewrites what came before);
 *   3. everything appended after the template keeps the template's own
 *      encryption: every /Encrypt it carries points at the template's
 *      encryption dictionary, and it does not redefine that object.
 * Anything else with an /Encrypt entry is refused, with the reason.
 *
 * A sponsor-completed form qualifies when the tool that completed it saved
 * incrementally (Acrobat does for a rights-enabled FDA form). A re-saved,
 * rewritten or different edition does not, and the refusal says so.
 *
 * @module server/services/ectd/leaf-pdf-security
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { pdfNameOffsets } from './pdfa-detect';
import { indFormTemplatesDir } from '../ind-forms/template-locations';

export type LeafPdfSecurity =
  /** No /Encrypt entry anywhere in the file. */
  | { verdict: 'unsecured' }
  /** An FDA form carrying the security settings FDA issued it with. */
  | { verdict: 'fda-form-as-issued'; formId: string; edition: string | null }
  /** Secured, and not an exception. The packager and transmit refuse it. */
  | { verdict: 'secured'; reason: string };

interface SecuredFormTemplate {
  formId: string;
  edition: string | null;
  length: number;
  sha256: string;
  head: Buffer;
  /** `N G` of every /Encrypt reference in the template. */
  encryptRefs: Set<string>;
}

const REF_AFTER_NAME = /^(?:[\x00\t\n\f\r ]|%[^\r\n]*[\r\n])*(\d+)[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+R(?![A-Za-z0-9])/;

/** The indirect reference an /Encrypt name at `offset` points at, or null. */
function encryptRefAt(bytes: Uint8Array, offset: number): string | null {
  // Skip the name token itself (it may be #-escaped, so find its end).
  let j = offset + 1;
  while (j < bytes.length && !/[\x00\t\n\f\r ()<>[\]{}/%]/.test(String.fromCharCode(bytes[j]))) j++;
  const tail = Buffer.from(bytes.buffer, bytes.byteOffset + j, Math.min(64, bytes.length - j)).toString('latin1');
  const m = REF_AFTER_NAME.exec(tail);
  return m ? `${Number(m[1])} ${Number(m[2])}` : null;
}

const templateCache = new Map<string, Promise<SecuredFormTemplate[]>>();

/**
 * The vendored FDA form templates that are themselves secured, each verified
 * against its manifest's sha256. A template whose bytes do not match its
 * manifest grants nothing: the exemption rests on knowing exactly what FDA
 * issued.
 */
async function loadSecuredFdaFormTemplates(): Promise<SecuredFormTemplate[]> {
  const dir = indFormTemplatesDir();
  let cached = templateCache.get(dir);
  if (!cached) {
    cached = (async () => {
      let names: string[];
      try {
        names = await fs.readdir(dir);
      } catch {
        return [];
      }
      const out: SecuredFormTemplate[] = [];
      for (const name of names.filter((n) => /^FDA_.+\.pdf$/i.test(n)).sort()) {
        try {
          const manifest = JSON.parse(await fs.readFile(path.join(dir, `${name}.manifest.json`), 'utf8'));
          const bytes = await fs.readFile(path.join(dir, name));
          const sha256 = createHash('sha256').update(bytes).digest('hex');
          if (typeof manifest?.sha256 !== 'string' || manifest.sha256.toLowerCase() !== sha256) continue;
          const refs = pdfNameOffsets(bytes, 'Encrypt').map((o) => encryptRefAt(bytes, o));
          if (refs.length === 0 || refs.some((r) => r === null)) continue;
          out.push({
            formId: typeof manifest.formId === 'string' ? manifest.formId : name.replace(/\.pdf$/i, ''),
            edition: typeof manifest.edition === 'string' ? manifest.edition : null,
            length: bytes.length,
            sha256,
            head: bytes.subarray(0, 1024),
            encryptRefs: new Set(refs as string[]),
          });
        } catch {
          // No manifest, unreadable, or not JSON: not a verified FDA form.
        }
      }
      return out;
    })();
    templateCache.set(dir, cached);
  }
  return cached;
}

/** Test seam: forget loaded templates (tests install a synthetic edition). */
export function clearLeafSecurityTemplateCache(): void {
  templateCache.clear();
}

const SPEC_REASON = 'the eCTD PDF specification prohibits security settings';

/**
 * Judge a PDF leaf's security settings for an eCTD sequence to `region`.
 * `region` is the packager/gateway region key ('fda', 'ema', 'pmda', …); pass
 * null when the destination is not known, which grants no exception.
 */
export async function assessLeafPdfSecurity(
  bytes: Uint8Array,
  region: string | null,
): Promise<LeafPdfSecurity> {
  const offsets = pdfNameOffsets(bytes, 'Encrypt');
  if (offsets.length === 0) return { verdict: 'unsecured' };

  if (region !== 'fda') {
    return { verdict: 'secured', reason: `it carries an /Encrypt entry; ${SPEC_REASON}` };
  }

  for (const t of await loadSecuredFdaFormTemplates()) {
    if (bytes.length < t.length) continue;
    if (!Buffer.from(bytes.buffer, bytes.byteOffset, t.head.length).equals(t.head)) continue;
    const prefix = Buffer.from(bytes.buffer, bytes.byteOffset, t.length);
    if (createHash('sha256').update(prefix).digest('hex') !== t.sha256) continue;

    // The FDA-issued bytes are intact. Everything after them must keep FDA's
    // own encryption: a new or re-pointed /Encrypt, or a redefinition of the
    // encryption dictionary, is security the sponsor side added.
    const suffix = Buffer.from(bytes.buffer, bytes.byteOffset + t.length, bytes.length - t.length);
    for (const o of pdfNameOffsets(suffix, 'Encrypt')) {
      const ref = encryptRefAt(suffix, o);
      if (ref === null || !t.encryptRefs.has(ref)) {
        return {
          verdict: 'secured',
          reason:
            `it is Form ${t.formId} but its security was changed after FDA issued it ` +
            `(an appended /Encrypt ${ref ?? 'that is not an indirect reference'}); submit the form with FDA's own security settings`,
        };
      }
    }
    const suffixText = suffix.toString('latin1');
    for (const ref of t.encryptRefs) {
      const [num, gen] = ref.split(' ');
      if (new RegExp(`(?:^|[^0-9])${num}[\\x00\\t\\n\\f\\r ]+${gen}[\\x00\\t\\n\\f\\r ]+obj(?![A-Za-z0-9])`).test(suffixText)) {
        return {
          verdict: 'secured',
          reason: `it is Form ${t.formId} but its encryption dictionary (object ${ref}) was redefined after FDA issued it; submit the form with FDA's own security settings`,
        };
      }
    }
    return { verdict: 'fda-form-as-issued', formId: t.formId, edition: t.edition };
  }

  return {
    verdict: 'secured',
    reason:
      `it carries an /Encrypt entry and is not an FDA form as FDA issued it; ${SPEC_REASON}. ` +
      'FDA forms are the only exception, and only when the file begins with the exact FDA-issued form ' +
      '(completed by incremental save) — a re-saved, printed-to-PDF or different-edition form does not qualify',
  };
}

export default { assessLeafPdfSecurity, clearLeafSecurityTemplateCache };
