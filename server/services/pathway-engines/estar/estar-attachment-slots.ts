/**
 * The eSTAR's attachment slots, read from the template's own scripts.
 *
 * An attachment does not reach CDRH by being embedded in the PDF. It reaches
 * CDRH as a routing token in the form's `Verification.AttachmentManifest`
 * field, and FDA's own code writes it:
 *
 *     d[AttachmentIndex].description = "Administrative Documentation | Cover Letter";
 *     Verification.AttachmentManifest.rawValue =
 *       Verification.AttachmentManifest.rawValue + "&lt;&lt;" + d[AttachmentIndex].path
 *       + "|/CHAPTER 1/CH1.01/" + "&gt;&gt;";
 *
 * A slot is therefore three facts — the `AddAttachment` control the applicant
 * would press, the chapter token it writes, and FDA's own description of what
 * belongs there — and all three are already in the template. This module reads
 * them rather than transcribing them into a table, for the same reason
 * `estar-field-map.ts` reads what it can: a hand-copied regulatory constant is
 * a transcription error waiting for a deploy, and the template ships in the
 * image anyway, so a vendored copy could only ever drift from it.
 *
 * Measured 2026-09-07 on the vendored templates: 112 slots over 65 distinct
 * chapters (nIVD) and 140 over 77 (IVD) — the same counts
 * `docs/reports/device-market-readiness-2026-09-07.md` reached by counting the
 * `*AddAttachment*` controls, arrived at from the opposite direction. Fewer
 * chapters than slots because several controls file into one chapter: five
 * `ADAddAttachment0xx` all route to `/CHAPTER 1/CH1.04/`. The counts are pinned
 * in the tests so a template swap has to be noticed rather than absorbed.
 *
 * @module server/services/pathway-engines/estar/estar-attachment-slots
 */

import { listXfaPackets } from '../../forms/fill-official-pdf';

export interface EstarAttachmentSlot {
  /** The `AddAttachment` control, e.g. 'CLAddAttachment110'. */
  field: string;
  /** The manifest chapter token it writes, e.g. '/CHAPTER 1/CH1.01/'. */
  chapter: string;
  /** FDA's own description of what belongs here, or null when it sets none. */
  description: string | null;
}

/**
 * The chapter paths the templates actually contain.
 *
 * Not `/CHAPTER \d+/CH\d+\.\d+/`, which is what they look like until you read
 * them: there is a `/CHAPTER 6A/CH6A.03/CH6A.03.01/`, and the deepest run four
 * levels (`/CHAPTER 3/CH3.05/CH3.05.05/CH3.05.05.01/`). Measured, not assumed.
 */
export const ESTAR_CHAPTER_PATH = /^\/CHAPTER \d+[A-Z]?\/(CH[0-9A-Z.]+\/)+$/;

/** `<<path|/CHAPTER n/CHn.nn/>>` — byte-for-byte what the template builds. */
export function attachmentManifestToken(attachmentPath: string, chapter: string): string {
  if (!ESTAR_CHAPTER_PATH.test(chapter)) {
    throw new Error(`Not an eSTAR CHAPTER path: ${JSON.stringify(chapter)}`);
  }
  return `<<${attachmentPath}|${chapter}>>`;
}

/** Every `<field|subform|exclGroup name="…">` open tag, by position. */
const NAMED_TAG = /<(?:field|subform|exclGroup)\b[^>]*\bname="([^"]+)"/g;

/**
 * The manifest APPEND, which is the add path. The template also has a
 * `.replace(…, "")` form — that is the DELETE path, and it maps only the
 * fifteen indices whose removal needs a chapter, so reading it would find an
 * eighth of the slots and look like an answer.
 */
const MANIFEST_APPEND =
  /AttachmentManifest\.rawValue\s*=\s*Verification\.AttachmentManifest\.rawValue\s*\+\s*"&lt;&lt;"\s*\+\s*[^+]+?\+\s*"\|(\/CHAPTER[^"]*)"/g;

/** The nearest `description = "…"` set before the append, within one handler. */
const DESCRIPTION = /\.description\s*=\s*"([^"]*)"/g;
const DESCRIPTION_WINDOW = 1200;

/**
 * Read every attachment slot the template declares, in template order.
 *
 * A control that writes the manifest more than once (a branch per submission
 * type) appears ONCE, at its first token — the field is the slot, and a slot
 * with two identities would be an invitation to route an attachment twice.
 */
export async function listEstarAttachmentSlots(
  templateBytes: Uint8Array | Buffer,
): Promise<EstarAttachmentSlot[]> {
  const packets = await listXfaPackets(templateBytes);
  const template = packets.find((p) => p.name === 'template');
  if (!template) return [];
  const xml = Buffer.from(template.bytes).toString('utf8');

  // Positions of every named tag, so the control enclosing an append can be
  // found by binary search rather than by re-scanning 10 MB per match.
  const tagAt: number[] = [];
  const tagName: string[] = [];
  NAMED_TAG.lastIndex = 0;
  for (let m = NAMED_TAG.exec(xml); m !== null; m = NAMED_TAG.exec(xml)) {
    tagAt.push(m.index);
    tagName.push(m[1]);
  }

  const enclosing = (position: number): string | null => {
    let lo = 0;
    let hi = tagAt.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tagAt[mid] <= position) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found >= 0 ? tagName[found] : null;
  };

  const slots: EstarAttachmentSlot[] = [];
  const seen = new Set<string>();
  MANIFEST_APPEND.lastIndex = 0;
  for (let m = MANIFEST_APPEND.exec(xml); m !== null; m = MANIFEST_APPEND.exec(xml)) {
    const field = enclosing(m.index);
    /* The control has to be an AddAttachment. One append site per template is
       enclosed by a field called `Type` — the labeling-type dropdown inside
       `LBAttachment360`, which RE-ROUTES an already-attached file between
       /CHAPTER 5/CH5.04, CH5.08, CH5.09 and CH5.10 as the applicant changes
       the labeling kind. It is not a slot anyone can attach to, and its real
       slot (`LBAddAttachment360`) is already in this list from its own append.
       Counting it would offer an attachment target that does not exist. */
    if (!field || !field.includes('AddAttachment') || seen.has(field)) continue;
    seen.add(field);

    const window = xml.slice(Math.max(0, m.index - DESCRIPTION_WINDOW), m.index);
    let description: string | null = null;
    DESCRIPTION.lastIndex = 0;
    for (let d = DESCRIPTION.exec(window); d !== null; d = DESCRIPTION.exec(window)) {
      description = d[1] || null;
    }

    slots.push({ field, chapter: m[1], description });
  }
  return slots;
}
