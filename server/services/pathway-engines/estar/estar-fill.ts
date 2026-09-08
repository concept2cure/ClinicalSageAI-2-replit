/**
 * eSTAR fill orchestration (Device eSTAR, B4) — produce the official FDA eSTAR PDF.
 *
 * Composes the three B-track pieces into the capstone:
 *   1. estar-template-registry — locate the official, version-pinned eSTAR template
 *   2. estar-field-map         — the canonical → template field mapping
 *   3. forms/fill-official-pdf — fill the official PDF (AcroForm or dynamic XFA)
 *
 * HONEST-BY-CONSTRUCTION: this returns a filled official eSTAR ONLY when BOTH the
 * official template is vendored AND a verified field map exists for it. Otherwise
 * it reports explicit blockers and `filled: false` — it NEVER fabricates a PDF or
 * claims a submittable eSTAR it cannot produce. CDRH ingests this official eSTAR
 * PDF; a loose ZIP of section PDFs is not a substitute (see 510k-estar-routes).
 *
 * Both the template and the field map are procurement/verification artifacts (the
 * licensed FDA PDF + its real, enumerated field locators), so until they are
 * dropped in this orchestration reports "not yet producible".
 *
 * TEMPLATE KIND: FDA's eSTAR is an Adobe LiveCycle *dynamic XFA* PDF — its
 * AcroForm `/Fields` array is empty and Acrobat renders the `/XFA` packets. So
 * this routes on what the vendored file actually is: dynamic XFA is filled by
 * writing the `datasets` packet through a PDF incremental update (the original
 * bytes are preserved, which is what keeps the output the real FDA form); a
 * static AcroForm is filled by field name. Assuming AcroForm would have silently
 * filled nothing.
 *
 * @module server/services/pathway-engines/estar/estar-fill
 */

import {
  descriptorFor,
  listVendoredTemplates,
  estarTemplateRequiredFromEnv,
  type EstarTemplateVariant,
  type EstarTemplateType,
  type EstarTemplateIntegrity,
} from './estar-template-registry';
import {
  ESTAR_ATTACHMENT_MANIFEST_FIELD,
  ESTAR_ATTACHMENT_MANIFEST_KEY,
  getEstarFieldMap,
  isFieldMapPopulated,
} from './estar-field-map';
import {
  appendIncrementalUpdate,
  fillOfficialPdf,
  fillXfaDatasets,
  isDynamicXfaPdf,
  nextFreeObjectNumber,
  readPdfSecurity,
  type OfficialPdfFieldMap,
  type PdfObjectWrite,
} from '../../forms/fill-official-pdf';
import { attachEmbeddedFiles } from '../../forms/pdf-attach';
import { EMBEDDED_FILE_OBJECT_COUNT, buildEmbeddedFileObjects } from '../../forms/pdf-embedded-files';
import {
  planEstarAttachments,
  type EstarAttachmentPlan,
  type EstarAttachmentRequest,
  type EstarAttachmentResolver,
  type PlannedAttachment,
} from './estar-attachment-plan';

export interface FillEstarInput {
  /** Any eSTAR program submission type (510(k)/De Novo/PMA, or Q-Sub/IDE/513(g)). */
  type: EstarTemplateType;
  variant: EstarTemplateVariant;
  /** Canonical field values to write into the official eSTAR template. */
  data: Record<string, unknown>;
  /** Inject template bytes directly (tests / explicit); else loaded from the drop-point. */
  templateBytes?: Uint8Array | Buffer;
  /** Inject a field map (tests / override); else the registered map for the descriptor. */
  fieldMap?: OfficialPdfFieldMap;
  /** Flatten the filled form to read-only output. Default false. */
  flatten?: boolean;
  /**
   * Documents to file into named eSTAR attachment slots.
   *
   * Planned against the SAME integrity-verified template bytes this fill uses,
   * which is why the requests come in here rather than a plan built outside: a
   * plan made against a different copy of the template would resolve chapters
   * from one file and write them into another.
   */
  attachments?: readonly EstarAttachmentRequest[];
  /** Where an attachment's bytes come from. Required when `attachments` is non-empty. */
  attachmentResolver?: EstarAttachmentResolver;
  /**
   * The instant the `/EmbeddedFiles` name-tree keys are stamped from. Passed in
   * so identical inputs produce identical bytes; defaults to now.
   */
  attachmentClock?: Date;
  /**
   * The largest output the CALLER can deliver. Unset ⇒ no ceiling here.
   *
   * The engine has no opinion about export governance; it takes the number from
   * whoever has to hand the bytes over (`getMaxGovernedExportBytes`). Before
   * attachments the official eSTAR was a fixed ~5.3 MB and could not approach
   * any ceiling, so the delivery layer's limit was unreachable and throwing
   * there was harmless. It is reachable now — a filer maps real documents into
   * real slots — and a limit discovered by throwing AFTER the renders, the
   * vault reads, the encryption and the retention write is a 500 where a
   * sentence belongs.
   */
  maxOutputBytes?: number;
}

export interface FillEstarResult {
  descriptorId: string | null;
  /** The official template is available (vendored or injected). */
  templateAvailable: boolean;
  /** A verified field map exists for the descriptor. */
  fieldMapPopulated: boolean;
  /** True only when a real filled official eSTAR PDF was produced. */
  filled: boolean;
  /** The filled official eSTAR PDF bytes (present only when filled). */
  pdfBytes?: Uint8Array;
  filledFields: string[];
  skippedFields: string[];
  warnings: string[];
  /** Why a submittable eSTAR could not be produced (empty when filled). */
  blockers: string[];
  /**
   * Which layer of the official template was filled. The FDA eSTAR templates are
   * `dynamic-xfa` (their AcroForm layer is empty), so their values are written
   * into the XFA `datasets` packet via a PDF incremental update.
   */
  templateKind?: 'acroform' | 'dynamic-xfa';
  /** What was filed into which slot, and what was refused. Absent when none was requested. */
  attachmentReport?: EstarAttachmentReport;
}

/** One attachment as it reached the form — the bytes are deliberately not here. */
export interface EstarAttachmentRecord {
  slot: string;
  field: string;
  chapter: string;
  fileName: string;
  dataObjectName: string;
  description: string | null;
  mimeType: string;
  byteLength: number;
  sha256: string;
  token: string;
}

export interface EstarAttachmentReport {
  requested: number;
  attached: EstarAttachmentRecord[];
  refused: EstarAttachmentPlan['refused'];
  /** The manifest value written into the form, for a reviewer to read back. */
  manifest: string | null;
}

function toRecord(a: PlannedAttachment): EstarAttachmentRecord {
  return {
    slot: a.slot,
    field: a.field,
    chapter: a.chapter,
    fileName: a.fileName,
    dataObjectName: a.dataObjectName,
    description: a.description,
    mimeType: a.mimeType,
    byteLength: a.byteLength,
    sha256: a.sha256,
    token: a.token,
  };
}

/**
 * Join planned attachments to a filled eSTAR: two objects per file, plus the
 * catalog's `/EmbeddedFiles` name tree, in ONE incremental update.
 *
 * One update and not one per file, because each update's cross-reference stream
 * describes the revision it closes: writing them separately would make every
 * attachment after the first a revision over a revision, for no gain but a
 * larger file and a longer chain for a reader to walk.
 */
export function attachPlannedFiles(
  filledBytes: Uint8Array | Buffer,
  attachments: readonly PlannedAttachment[],
): Uint8Array {
  const buf = Buffer.from(filledBytes);
  if (attachments.length === 0) return buf;

  const sec = readPdfSecurity(buf);
  const objects: PdfObjectWrite[] = [];
  const entries: { nameTreeKey: string; filespecNum: number }[] = [];
  let next = nextFreeObjectNumber(buf);

  for (const attachment of attachments) {
    const built = buildEmbeddedFileObjects(sec, next, {
      name: attachment.fileName,
      bytes: attachment.bytes,
      mimeType: attachment.mimeType,
      // FDA's own text for the slot — what the template writes into
      // `dataObject.description` on every one of the 113/145 controls.
      ...(attachment.description ? { description: attachment.description } : {}),
    });
    objects.push(...built.objects);
    entries.push({ nameTreeKey: attachment.dataObjectName, filespecNum: built.filespecNum });
    next += EMBEDDED_FILE_OBJECT_COUNT;
  }

  objects.push(...attachEmbeddedFiles(buf, sec, entries).objects);
  return appendIncrementalUpdate(buf, objects);
}

async function resolveTemplateBytes(
  input: FillEstarInput,
  expectedFileName: string,
): Promise<{ bytes: Uint8Array | null; integrity: EstarTemplateIntegrity | null }> {
  // Injected bytes are the caller's own (tests, explicit override); the
  // drop-point's pins do not describe them.
  if (input.templateBytes) return { bytes: input.templateBytes, integrity: null };
  const vendored = await listVendoredTemplates();
  const hit = vendored.find((t) => t.fileName.toLowerCase() === expectedFileName.toLowerCase());
  return hit ? { bytes: hit.bytes, integrity: hit.integrity } : { bytes: null, integrity: null };
}

/**
 * Resolve the template and the field map, and record on `base` every reason the
 * descriptor cannot produce. Returns the pair when both are usable, or null when
 * a blocker was recorded — the caller returns `base` on null.
 *
 * Split out of {@link fillEstarSubmission} because these are the PRE-conditions,
 * and reading them together is the only way to see that a missing template, a
 * swapped one and an unpopulated map are three distinct refusals with three
 * distinct remedies, not one generic failure.
 */
async function resolveProducibleInputs(
  input: FillEstarInput,
  descriptor: { id: string; expectedFileName: string },
  base: FillEstarResult,
): Promise<{ templateBytes: Uint8Array | Buffer; fieldMap: OfficialPdfFieldMap } | null> {
  const { bytes: templateBytes, integrity } = await resolveTemplateBytes(
    input,
    descriptor.expectedFileName,
  );
  // A file with the right NAME is not the official template. checksums.txt
  // pins these bytes precisely because the field map was enumerated from them;
  // a swapped or edited file writes our values wherever ITS paths point.
  const integrityFailed = integrity === 'mismatch';
  base.templateAvailable = !!templateBytes && !integrityFailed;
  if (integrityFailed) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: "${descriptor.expectedFileName}" is present but does not match the ` +
        `SHA-256 pinned for it in the drop-point's checksums.txt. The canonical field map was enumerated from the ` +
        `pinned bytes, so filling a different file would write values into the wrong boxes. Restore the pinned ` +
        `template, or re-verify the field map against the new edition and update checksums.txt.`,
    );
  }
  if (integrity === 'unpinned') {
    base.warnings.push(
      `"${descriptor.expectedFileName}" is not pinned in the drop-point's checksums.txt, so its identity as the ` +
        `official FDA edition was not verified.`,
    );
  }

  const fieldMap = input.fieldMap ?? getEstarFieldMap(descriptor.id);
  const mapPopulated = input.fieldMap
    ? Object.keys(input.fieldMap).length > 0
    : isFieldMapPopulated(descriptor.id);
  base.fieldMapPopulated = mapPopulated;

  if (!templateBytes && !integrityFailed) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: the official template "${descriptor.expectedFileName}" is not vendored. ` +
        `Place it in assets/estar-templates/ (or set ESTAR_TEMPLATE_DIR). See assets/estar-templates/README.md.` +
        (estarTemplateRequiredFromEnv() ? ' ESTAR_REQUIRE_TEMPLATE is set — this blocks production dispatch.' : ''),
    );
  }
  if (!fieldMap || !mapPopulated) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: the canonical→template field map for "${descriptor.id}" is not populated/verified ` +
        `against the vendored template. Enumerate the template's fields (listXfaFields for a dynamic XFA form such as ` +
        `the FDA eSTAR, listAcroFields for a static AcroForm) and fill estar-field-map.ts.`,
    );
  }


  if (base.blockers.length > 0) return null;
  return { templateBytes: templateBytes!, fieldMap: fieldMap! };
}

/**
 * Fill the official FDA eSTAR PDF for any eSTAR program submission — 510(k), De
 * Novo, PMA (device or IVD), or a PreSTAR request (Q-Sub / IDE / 513(g)). Honest
 * fail-closed: returns `filled: false` with blockers when the template or a
 * verified field map is missing — never a fabricated artifact.
 */
export async function fillEstarSubmission(input: FillEstarInput): Promise<FillEstarResult> {
  const descriptor = descriptorFor(input.type, input.variant);
  const base: FillEstarResult = {
    descriptorId: descriptor?.id ?? null,
    templateAvailable: false,
    fieldMapPopulated: false,
    filled: false,
    filledFields: [],
    skippedFields: [],
    warnings: [],
    blockers: [],
  };

  if (!descriptor) {
    base.blockers.push(`No eSTAR template descriptor for ${input.type}/${input.variant}.`);
    return base;
  }

  const resolved = await resolveProducibleInputs(input, descriptor, base);
  if (!resolved) return base;
  const { templateBytes, fieldMap } = resolved;

  // Both present → fill the official template. Which layer depends on the file:
  // FDA's eSTAR is a dynamic Adobe LiveCycle XFA form whose AcroForm `/Fields`
  // array is EMPTY, so an AcroForm fill would silently populate nothing. Route on
  // what the template actually is rather than assuming. Neither path throws on a
  // missing field (skip+warn), so the output stays honest about what was and
  // wasn't populated.
  const dynamicXfa = isDynamicXfaPdf(templateBytes);
  base.templateKind = dynamicXfa ? 'dynamic-xfa' : 'acroform';

  /* THE ATTACHMENT PLAN IS MADE BEFORE THE FILL, against these same
     integrity-verified bytes, because the manifest is one of the values the
     fill writes. Planning after would mean a second incremental update to
     carry the manifest, and planning outside would mean resolving chapters
     from a different copy of the template than the one being filled. */
  const plan = await planAttachments(input, templateBytes, dynamicXfa, base);
  if (plan === REFUSED) return base;

  const fillMap = plan?.manifest
    ? { ...fieldMap, [ESTAR_ATTACHMENT_MANIFEST_KEY]: ESTAR_ATTACHMENT_MANIFEST_FIELD }
    : fieldMap;
  const fillData = plan?.manifest
    ? { ...input.data, [ESTAR_ATTACHMENT_MANIFEST_KEY]: plan.manifest }
    : input.data;

  const result = dynamicXfa
    ? await fillXfaDatasets(templateBytes, fillMap, fillData, {
        flatten: input.flatten ?? false,
        missingFieldPolicy: 'skip',
      })
    : await fillOfficialPdf(templateBytes, fillMap, fillData, {
        flatten: input.flatten ?? false,
        missingFieldPolicy: 'skip',
      });

  base.filledFields = result.filled;
  base.skippedFields = result.skipped;
  base.warnings = result.warnings;

  // `filled` is documented as "True only when a real filled official eSTAR PDF
  // was produced", but it was set unconditionally the moment the fill RAN. A
  // caller passing `data: {}` — which POST /official accepts, its schema
  // defaulting `data` to an empty object — got every mapped key skipped, the
  // untouched template bytes back, `filled: true`, no blockers, and a 200
  // carrying `officialEstarPdf: true` with the placement "Module 1 / official
  // FDA eSTAR (submittable)". That is a blank official FDA form registered as a
  // submittable artifact.
  //
  // A fill that wrote nothing produced no filled form. Fail closed and say why,
  // rather than hand back the blank template dressed as a submission.
  /* The manifest is EXCLUDED from this count on purpose. It is not a value the
     platform holds — it is computed from the attachment plan — so counting it
     would let a fill that wrote nothing else clear the very check that exists
     to refuse a blank official form, and deliver one with files stapled to it. */
  const administrativeFields = result.filled.filter((k) => k !== ESTAR_ATTACHMENT_MANIFEST_KEY);
  if (administrativeFields.length === 0) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: the fill wrote no values into "${descriptor.id}". ` +
        `The platform held no value for any of the ${Object.keys(fieldMap!).length} mapped administrative fields, ` +
        `so the output would be the blank official template.`,
    );
    return base;
  }

  /* An attachment reaches CDRH as a manifest token, not as an embedded file
     (estar-attachment-slots' header). A manifest that was planned and then not
     written would embed every file and route none of them — a submission that
     looks complete and carries nothing. */
  if (plan?.manifest && !result.filled.includes(ESTAR_ATTACHMENT_MANIFEST_KEY)) {
    base.blockers.push(
      `Cannot produce a submittable eSTAR: ${plan.attachments.length} attachment(s) were planned but ` +
        `the attachment manifest was not written into "${descriptor.id}", so nothing would be routed ` +
        'to a chapter. The files were not embedded.',
    );
    return base;
  }

  const output = plan ? attachPlannedFiles(result.bytes, plan.attachments) : result.bytes;

  /* Refused HERE, and as a blocker, for two reasons. It is precise — the real
     encrypted output, not the sum of the inputs plus a guess at overhead — and
     it reaches the operator through the same 422-with-reasons channel as every
     other attachment refusal, naming the documents and the numbers, instead of
     as an exception the route can only render as "the problem has been logged".
     Nothing is retained or registered, because nothing is returned. */
  if (input.maxOutputBytes !== undefined && output.length > input.maxOutputBytes) {
    const attached = plan?.attachments ?? [];
    const carried = attached.reduce((n, a) => n + a.byteLength, 0);
    base.blockers.push(
      `Cannot deliver this eSTAR: the finished form is ${mib(output.length)} and the limit is ` +
        `${mib(input.maxOutputBytes)}.` +
        (attached.length > 0
          ? ` ${attached.length} attachment(s) carry ${mib(carried)} of it — ` +
            attached
              .map((a) => `"${a.fileName}" ${mib(a.byteLength)}`)
              .join(', ') +
            '. Remove or reduce one and export again.'
          : ''),
    );
    return base;
  }

  base.filled = true;
  base.pdfBytes = output;
  return base;
}

/** A byte count as a filer would read it. */
function mib(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Sentinel: the plan recorded a blocker on `base` and the fill must not proceed. */
const REFUSED = Symbol('estar-attachment-plan-refused');

/**
 * Build the attachment plan, or record on `base` exactly why there isn't one.
 *
 * Returns `null` when no attachments were requested — the fill then behaves
 * byte-for-byte as it did before this existed.
 *
 * EVERY refusal is a blocker. A submission missing a document the operator
 * asked to file, handed back with a 200 and a note, is the failure mode this
 * codebase refuses everywhere else; the caller sees the reasons and fixes the
 * plan, rather than discovering at CDRH that a section did not travel.
 */
async function planAttachments(
  input: FillEstarInput,
  templateBytes: Uint8Array | Buffer,
  dynamicXfa: boolean,
  base: FillEstarResult,
): Promise<EstarAttachmentPlan | null | typeof REFUSED> {
  const requests = input.attachments ?? [];
  if (requests.length === 0) return null;

  if (!input.attachmentResolver) {
    // Not a blocker: a caller that asks for attachments and supplies no way to
    // read them has a bug, and reporting it as a regulatory refusal would hide it.
    throw new Error(
      'fillEstarSubmission: `attachments` was given without an `attachmentResolver`, so there is ' +
        'no way to produce the bytes for any of them.',
    );
  }

  /* SEEDED BEFORE ANYTHING CAN REFUSE. The report used to be assigned only
     after the plan succeeded, so the two refusals above it — a static AcroForm,
     and a template whose manifest node is missing or already carries tokens —
     produced a 422 with a blocker and NO report at all. The operator was told
     "Cannot attach documents to this eSTAR" and nothing about the thirty
     placements they had asked for. `requested` is a fact from the request, and
     it is true on every path. */
  base.attachmentReport = { requested: requests.length, attached: [], refused: [], manifest: null };

  if (!dynamicXfa) {
    base.blockers.push(
      'Cannot attach documents to this template: it is a static AcroForm, and the eSTAR attachment ' +
        'contract (the AttachmentManifest field, the date-shaped name-tree keys, the chapter tokens) ' +
        'is a property of the dynamic XFA eSTAR. Nothing was attached.',
    );
    return REFUSED;
  }

  let plan: EstarAttachmentPlan;
  try {
    plan = await planEstarAttachments({
      templateBytes,
      requests,
      resolve: input.attachmentResolver,
      at: input.attachmentClock ?? new Date(),
    });
  } catch (err) {
    base.blockers.push(
      `Cannot attach documents to this eSTAR: ${err instanceof Error ? err.message : String(err)}`,
    );
    return REFUSED;
  }

  base.attachmentReport = {
    requested: requests.length,
    attached: plan.attachments.map(toRecord),
    refused: plan.refused,
    manifest: plan.manifest,
  };

  if (plan.refused.length > 0) {
    for (const r of plan.refused) {
      base.blockers.push(
        `Cannot file ${r.fileName ? `"${r.fileName}"` : 'a document'} into ${r.slot}: ` +
          r.reasons.join(' '),
      );
    }
    return REFUSED;
  }

  return plan;
}

export default { fillEstarSubmission, attachPlannedFiles };
