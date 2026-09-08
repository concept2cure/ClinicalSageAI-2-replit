/**
 * The eSTAR's attachments, as the template itself defines them: the slots a
 * file can go into, and what the form will KEEP once it is open.
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

// ── What the form will KEEP ─────────────────────────────────────────────────
//
// Embedding a file and naming it in the manifest is not enough. The template
// runs two guards of its own, and both of them DELETE.
//
// `removeOrphanAttachments()` runs at BOTH `preSave` and `preSign`, walks every
// attached data object, and removes any whose name is not `yyyy-mm-dd`-shaped in
// its first ten characters — telling the applicant, in FDA's own words: "The
// following attachments were not added with the "Add Attachment" buttons. These
// attachments will be deleted, since they are not associated with any section of
// eSTAR."
//
// `AttachmentValidation()` runs on every add and refuses five things, calling
// `removeDataObject` on each.
//
// That matters more to a machine-built eSTAR than to a hand-built one, because
// the failure is SILENT and DELAYED. The file is embedded, the manifest names
// it, the sponsor downloads it — and the first time anyone saves the form, the
// attachment is gone. The document still opens; the token is still in the
// manifest; the bytes are not there.

/** `path.length > 124` in AttachmentValidation. */
export const ATTACHMENT_PATH_MAX_LENGTH = 124;

/** `size > 1000000000` in AttachmentValidation. */
export const ATTACHMENT_SIZE_MAX_BYTES = 1_000_000_000;

/**
 * The template's `InvalidFileTypes` variable, verbatim and in its order.
 *
 * Transcribed here so the check needs no template read, and asserted AGAINST
 * the template by `readInvalidAttachmentExtensions` in the tests — a copied
 * regulatory constant that nothing compares to its source is exactly the
 * transcription error this stream keeps finding.
 */
export const INVALID_ATTACHMENT_EXTENSIONS = [
  '.exe', '.zip', '.zipx', '.tar', '.gz', '.z', '.cab', '.rar', '.bz2', '.lzh',
  '.7z', '.img', '.iso', '.xz', '.vhd', '.vmdk', '.dmg', '.docm', '.dotm',
  '.xlsm', '.xltm', '.potm', '.ppsm', '.pptm', '.xlsb',
] as const;

/** Read the list out of a template, for the test that keeps the copy honest. */
export async function readInvalidAttachmentExtensions(
  templateBytes: Uint8Array | Buffer,
): Promise<string[]> {
  const packets = await listXfaPackets(templateBytes);
  const template = packets.find((p) => p.name === 'template');
  if (!template) return [];
  const xml = Buffer.from(template.bytes).toString('utf8');
  const m = /<text name="InvalidFileTypes"\s*>([^<]*)</.exec(xml);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((part) => part.trim().replace(/^'|'$/g, ''))
    .filter((part) => part.length > 0);
}

/**
 * The name the template gives an attachment it added itself:
 * `util.printd("yyyy-mm-ddTHH:MM:ss", new Date())`.
 *
 * This is the `/EmbeddedFiles` NAME-TREE KEY, and it is a different string from
 * the file name — the manifest and the visible attachment name are built from
 * the data object's `path`, which is the `/Filespec`'s `/F` and `/UF`. Two
 * strings, two purposes; using the file name for both is what gets the
 * attachment deleted.
 *
 * `at` is passed in rather than read from the clock so a build is reproducible
 * — the same inputs must give the same bytes (see the synthetic-IV note in
 * fill-official-pdf). `ordinal` disambiguates files attached within one second
 * by advancing the SECONDS, which keeps the first ten characters — the only
 * part `isDate` looks at — a real date.
 */
export function attachmentDataObjectName(at: Date, ordinal = 0): string {
  const stamp = new Date(at.getTime() + ordinal * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${stamp.getUTCFullYear()}-${pad(stamp.getUTCMonth() + 1)}-${pad(stamp.getUTCDate())}` +
    `T${pad(stamp.getUTCHours())}:${pad(stamp.getUTCMinutes())}:${pad(stamp.getUTCSeconds())}`
  );
}

/**
 * `isDate(name.substring(0,10))`, reimplemented exactly.
 *
 * The template splits on `. - /`, parses three integers, builds a Date and
 * requires all three to round-trip — so `2026-13-08` and `2026-02-31` fail and
 * `2026/09/08` passes. Anything shorter than a date fails.
 */
export function isTemplateAcceptableDataObjectName(name: string): boolean {
  const head = (name ?? '').substring(0, 10);
  const parts = head.split(/[.\-/]/);
  if (parts.length < 3) return false;
  const yyyy = Number.parseInt(parts[0], 10);
  const mm = Number.parseInt(parts[1], 10);
  const dd = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return false;
  const date = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  return mm === date.getMonth() + 1 && dd === date.getDate() && yyyy === date.getFullYear();
}

export interface AttachmentAcceptanceInput {
  /** The visible file name — the data object's `path`, our `/F` and `/UF`. */
  path: string;
  byteLength: number;
  /** The `/EmbeddedFiles` name-tree key — the data object's `name`. */
  dataObjectName: string;
  /** Paths already attached to this document; a repeat is refused. */
  existingPaths: readonly string[];
}

export interface AttachmentAcceptance {
  accepted: boolean;
  /** Every reason, in the template's own terms. Empty when accepted. */
  refusals: string[];
}

/**
 * Would this eSTAR keep this attachment?
 *
 * Every reason is reported, not just the first: a caller fixing one refusal per
 * round trip is a bad loop, and the refusals are independent.
 *
 * The ASCII rule is applied unconditionally. In the template it is conditional
 * — `isValidName` only tests it when `ApplicationType.ATRadioButton100 == 1`,
 * which is the FDA branch — and every submission this platform builds is an FDA
 * submission. Applying the stricter rule to a form that would have allowed the
 * looser one refuses a file that would have been kept; applying the looser one
 * to an FDA form ships a file that gets deleted. Only one of those is safe.
 */
export function checkAttachmentAcceptance(input: AttachmentAcceptanceInput): AttachmentAcceptance {
  const refusals: string[] = [];
  const path = input.path ?? '';

  if (input.existingPaths.includes(path)) {
    refusals.push(
      `The name "${path}" was already used by another attachment; the template refuses a ` +
        'duplicate path and deletes the second file.',
    );
  }

  const dot = path.lastIndexOf('.');
  const extension = dot >= 0 ? path.slice(dot).toLowerCase() : '';
  if ((INVALID_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extension)) {
    refusals.push(`"${extension}" is not an acceptable attachment type for an eSTAR.`);
  }

  if (!/^[\x20-\x7F]*$/.test(path)) {
    refusals.push(`"${path}" is not plain ASCII, which an FDA eSTAR requires of an attachment name.`);
  }

  if (path.length > ATTACHMENT_PATH_MAX_LENGTH) {
    refusals.push(
      `The attachment name is ${path.length} characters; the eSTAR allows ${ATTACHMENT_PATH_MAX_LENGTH}.`,
    );
  }

  if (input.byteLength > ATTACHMENT_SIZE_MAX_BYTES) {
    refusals.push(
      `The file is ${input.byteLength} bytes; the eSTAR allows ${ATTACHMENT_SIZE_MAX_BYTES}.`,
    );
  }

  if (!isTemplateAcceptableDataObjectName(input.dataObjectName)) {
    refusals.push(
      `The attachment key "${input.dataObjectName}" is not date-shaped, so it would be ` +
        "deleted on the applicant's first save (removeOrphanAttachments).",
    );
  }

  return { accepted: refusals.length === 0, refusals };
}
