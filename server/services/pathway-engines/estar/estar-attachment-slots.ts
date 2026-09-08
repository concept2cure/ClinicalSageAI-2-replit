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
  /**
   * The control's FULL SOM path — the slot's identity.
   *
   * Not the short name, which is not unique: nIVD declares `AddAttachment`
   * twice (under `ReprocSterDocs` and under `BiocompatibilityDocs`) and IVD
   * declares five names twice. Keying on the name dropped one real slot per
   * template, and the one it dropped in nIVD was Biocompatibility — the single
   * slot for outline node E1, which is mandatory in the shipped 510(k) pack.
   */
  somPath: string;
  /** The control's own name, e.g. 'CLAddAttachment110'. NOT unique. */
  field: string;
  /**
   * Every LIVE chapter this control writes, in template order.
   *
   * Normally one. Exactly one control per template writes two — the User Fee
   * Form, `/CHAPTER 1/CH1.04/` when `ApplicationType.ATRadioButton100 == 2`
   * (Health Canada) and `/CHAPTER 1/CH1.09/` otherwise (FDA) — and this
   * platform deliberately does not write that radio. Reporting both and
   * refusing at resolve time is the honest answer; taking whichever appears
   * first in the file, which is what this did, files a US MDUFA cover sheet
   * into the Health Canada chapter.
   */
  chapters: string[];
  /** FDA's own description of what belongs here, or null when it sets none. */
  description: string | null;
}

/** `<<path|/CHAPTER n/CHn.nn/>>` — byte-for-byte what the template builds. */
export function attachmentManifestToken(attachmentPath: string, chapter: string): string {
  if (!ESTAR_CHAPTER_PATH.test(chapter)) {
    throw new Error(`Not an eSTAR CHAPTER path: ${JSON.stringify(chapter)}`);
  }
  return `<<${attachmentPath}|${chapter}>>`;
}

export type ResolvedAttachmentSlot =
  | { ok: true; chapter: string; description: string | null }
  | { ok: false; reason: 'no_chapter' | 'ambiguous_chapter' | 'undecided_condition'; message: string };

/**
 * A slot whose chapter the template chooses from a value IN THE DOCUMENT.
 *
 * Exactly one control per template, measured on both: the User Fee Form. Its
 * handler, verbatim (comments stripped, XML escapes as they appear):
 *
 *     d[AttachmentIndex].description = "Administrative Documentation | User Fee Form";
 *     if (ApplicationType.ATRadioButton100.rawValue == 2) {
 *       Verification.AttachmentManifest.rawValue = … + "|/CHAPTER 1/CH1.04/" + "&gt;&gt;";
 *     }
 *     else {
 *       Verification.AttachmentManifest.rawValue = … + "|/CHAPTER 1/CH1.09/" + "&gt;&gt;";
 *     }
 *
 * so `2` is Health Canada and anything else is FDA. Both templates ship
 * `root.ApplicationType.ATRadioButton100 = "1"`, which means the chapter is not
 * a guess at all — it is the same computation FDA's own script performs on the
 * same input, and reading it is how you get the answer the applicant's Acrobat
 * would.
 *
 * TRANSCRIBED, AND ASSERTED against the templates: a test requires that every
 * slot with more than one chapter has an entry here and that the entry's
 * chapters are exactly the slot's. A future template that makes another control
 * conditional therefore fails the test rather than silently resolving to
 * whichever branch happens to appear first — which is precisely the defect this
 * replaces.
 */
export const CONDITIONAL_ATTACHMENT_SLOTS: Record<
  string,
  { decidedBy: string; chapterWhen: Record<string, string>; otherwise: string; note: string }
> = {
  'root.AdministrativeDocumentation.ADAddAttachment910': {
    decidedBy: 'root.ApplicationType.ATRadioButton100',
    chapterWhen: { '2': '/CHAPTER 1/CH1.04/' },
    otherwise: '/CHAPTER 1/CH1.09/',
    note:
      'if (ApplicationType.ATRadioButton100.rawValue == 2) → /CHAPTER 1/CH1.04/ (Health Canada), ' +
      'else → /CHAPTER 1/CH1.09/ (FDA). Both templates ship the value "1".',
  },
};

/**
 * The one chapter a slot routes to, or a refusal that says why there isn't one.
 *
 * A caller must never pick from `chapters` itself. When a slot has more than
 * one, the template decides between them from a value in the document, and
 * `values` is how that value is supplied — read it with `readXfaDatasetsValues`
 * from the same bytes being filled. Without it, the answer is refused rather
 * than assumed: writing the wrong branch files a US MDUFA cover sheet under
 * Health Canada's chapter, which is worse than not filing it.
 */
export function resolveAttachmentSlot(
  slot: EstarAttachmentSlot,
  values?: Record<string, string | null>,
): ResolvedAttachmentSlot {
  if (slot.chapters.length === 1) {
    return { ok: true, chapter: slot.chapters[0], description: slot.description };
  }
  if (slot.chapters.length === 0) {
    return {
      ok: false,
      reason: 'no_chapter',
      message: `${slot.somPath} writes no chapter, so nothing attached there would be routed.`,
    };
  }

  const conditional = CONDITIONAL_ATTACHMENT_SLOTS[slot.somPath];
  if (!conditional) {
    return {
      ok: false,
      reason: 'ambiguous_chapter',
      message:
        `${slot.somPath} writes ${slot.chapters.join(' or ')} and nothing here records what ` +
        'chooses between them. Read the template and add it rather than picking a branch.',
    };
  }

  const decided = values ? values[conditional.decidedBy] : undefined;
  if (decided === undefined || decided === null || decided === '') {
    return {
      ok: false,
      reason: 'undecided_condition',
      message:
        `${slot.somPath} routes by ${conditional.decidedBy}, which was not supplied. ` +
        conditional.note,
    };
  }
  const chapter = conditional.chapterWhen[decided] ?? conditional.otherwise;
  return { ok: true, chapter, description: slot.description };
}

/**
 * The chapter paths the templates actually contain.
 *
 * Not `/CHAPTER \d+/CH\d+\.\d+/`, which is what they look like until you read
 * them: there is a `/CHAPTER 6A/CH6A.03/CH6A.03.01/`, and the deepest run four
 * levels (`/CHAPTER 3/CH3.05/CH3.05.05/CH3.05.05.01/`). Measured, not assumed.
 */
export const ESTAR_CHAPTER_PATH = /^\/CHAPTER \d+[A-Z]?\/(CH[0-9A-Z.]+\/)+$/;

/** Every open/close/self-closing tag, for the nesting scan. */
const XML_TAG = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g;
const TAG_NAME_ATTR = /\bname="([^"]*)"/;
/** The elements that contribute a segment to a SOM path. */
const NAMED_ELEMENTS = new Set(['subform', 'field', 'exclGroup']);

/**
 * The manifest APPEND, which is the add path. The template also has a
 * `.replace(…, "")` form — that is the DELETE path, and it maps only the
 * fifteen indices whose removal needs a chapter, so reading it would find an
 * eighth of the slots and look like an answer.
 */
const MANIFEST_APPEND =
  /AttachmentManifest\.rawValue\s*=\s*Verification\.AttachmentManifest\.rawValue\s*\+\s*"&lt;&lt;"\s*\+\s*[^+]+?\+\s*"\|(\/CHAPTER[^"]*)"/g;

/** `d[…].description = "Administrative Documentation | Cover Letter"` */
const DESCRIPTION = /\.description\s*=\s*"([^"]*)"/g;

/**
 * Remove JavaScript comments before reading a handler.
 *
 * 19 of the 165 nIVD appends are commented out — 6 inside `/* … *\/` blocks and
 * 13 behind `//` — and reading them as live routing is reading FDA's discarded
 * drafts. Measured safe on both templates: every one of the 113/145 slots still
 * resolves a chapter and a description afterwards, and no chapter path contains
 * `//`.
 */
function stripScriptComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

interface FieldRegion {
  somPath: string;
  field: string;
  start: number;
  end: number;
}

/**
 * Every `*AddAttachment*` field element, with its full SOM path and its own
 * byte range.
 *
 * The range is what removes the guesswork. The previous reader attributed an
 * append to the nearest PRECEDING named tag and hunted a description in a
 * 1200-character window behind it — so a description could come from one
 * handler and a chapter from another, and three slots FDA does name reported
 * null. A control's script is inside the control's own element; scanning that
 * element cannot cross into a neighbour's.
 */
function attachmentFieldRegions(xml: string): FieldRegion[] {
  const stack: { tag: string; name: string | null; start: number }[] = [];
  const out: FieldRegion[] = [];
  XML_TAG.lastIndex = 0;
  for (let m = XML_TAG.exec(xml); m !== null; m = XML_TAG.exec(xml)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) {
      // Tolerate a tag the scan never pushed (an unmatched close) by unwinding
      // to the matching open rather than corrupting the whole stack.
      while (stack.length > 0 && stack[stack.length - 1].tag !== tag) stack.pop();
      const open = stack.pop();
      if (open && open.tag === 'field' && open.name && open.name.includes('AddAttachment')) {
        const path = [...stack.map((e) => e.name), open.name].filter(Boolean).join('.');
        out.push({ somPath: path, field: open.name, start: open.start, end: m.index + m[0].length });
      }
    } else if (!selfClosing) {
      const named = NAMED_ELEMENTS.has(tag) ? TAG_NAME_ATTR.exec(attrs) : null;
      stack.push({ tag, name: named ? named[1] : null, start: m.index });
    }
  }
  return out;
}

/**
 * Read every attachment slot the template declares, in template order.
 *
 * One entry per DECLARATION, identified by SOM path. A control that writes the
 * manifest more than once inside its own handler contributes each distinct
 * chapter it writes, which is how the User Fee Form's two branches survive to
 * be refused rather than silently resolved to whichever came first.
 */
export async function listEstarAttachmentSlots(
  templateBytes: Uint8Array | Buffer,
): Promise<EstarAttachmentSlot[]> {
  const packets = await listXfaPackets(templateBytes);
  const template = packets.find((p) => p.name === 'template');
  if (!template) return [];
  const xml = Buffer.from(template.bytes).toString('utf8');

  const slots: EstarAttachmentSlot[] = [];
  for (const region of attachmentFieldRegions(xml)) {
    const body = stripScriptComments(xml.slice(region.start, region.end));

    const chapters: string[] = [];
    MANIFEST_APPEND.lastIndex = 0;
    for (let m = MANIFEST_APPEND.exec(body); m !== null; m = MANIFEST_APPEND.exec(body)) {
      if (!chapters.includes(m[1])) chapters.push(m[1]);
    }
    if (chapters.length === 0) continue;

    let description: string | null = null;
    DESCRIPTION.lastIndex = 0;
    for (let d = DESCRIPTION.exec(body); d !== null; d = DESCRIPTION.exec(body)) {
      description = d[1] || null;
    }

    slots.push({ somPath: region.somPath, field: region.field, chapters, description });
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
