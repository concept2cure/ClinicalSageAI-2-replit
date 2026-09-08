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
  assessEstarTemplateRebuild,
  isEstarSubstitution,
  estarCellText,
  type EstarRebuildFinding,
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
  /**
   * Written keys the TEMPLATE'S OWN scripts erase once the applicant works the
   * form: it clears each of these cells and rebuilds it from a source this map
   * does not write, so the filed form shows them blank. They stay in
   * `filledFields` — we did write them — and they are named here because a
   * caller told only "5 fields filled" will believe five values are on the form.
   * Measured, not guessed: see ESTAR_TEMPLATE_RECOMPUTED_FIELDS.
   *
   * Always a subset of `filledFields`, and always present (an empty array means
   * "assessed, none", never "not assessed"). When it is the WHOLE of
   * `filledFields` there is no filled form at all and `filled` is false — see
   * the blocker below.
   */
  erasedFields: string[];
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
 * The refusal text for one substituted cell. Names BOTH entities and both
 * canonical keys: an operator reading "the Declaration of Conformity is wrong"
 * cannot act on it, and one reading which two governed values disagree can.
 *
 * Two shapes, because there are two ways to lose the cell and the remedy differs
 * by one word. `'substituted'`: the applicant company is already on the filing
 * and differs, so the rebuild has a second entity to put there NOW.
 * `'substituted-on-entry'`: the applicant company is not on the filing yet, so
 * the delivered form still shows the declaring entity — and the applicant's own
 * first entry into that field, which a 510(k) requires, replaces it. Saying
 * "rebuilds it as undefined" for the second case, or omitting it entirely (which
 * is what happened until 2026-09-08), is how a filer ends up trusting a cell the
 * form is about to take.
 */
function describeSubstitutionRefusal(descriptorId: string, finding: EstarRebuildFinding): string {
  const head =
    `Cannot produce a submittable eSTAR: the official template would file "${finding.caption}" under the ` +
    `wrong legal entity. This filing's ${finding.key} is "${finding.writtenValue}", but the FDA form ` +
    `derives that cell from ${finding.substitutedByKey} ("${finding.substitutedByCaption}") and clears it ` +
    `unconditionally the first time the applicant leaves any field in that block`;
  const middle =
    finding.effect === 'substituted'
      ? `, rebuilding it as "${finding.survivingValue}" — so the Declaration of Conformity in the ` +
        `submitted "${descriptorId}" would attest in the name of "${finding.survivingValue}", not ` +
        `"${finding.writtenValue}".`
      : `. This filing carries no ${finding.substitutedByKey}, so the delivered "${descriptorId}" still ` +
        `shows "${finding.writtenValue}" — and the applicant's own first entry of their company name, ` +
        `which the form requires, rebuilds the cell in THEIR name instead. The Declaration of Conformity ` +
        `is then attested by whoever fills the form in, not by "${finding.writtenValue}".`;
  return (
    `${head}${middle} The form has no field that can hold a declaring entity different from the ` +
    `applicant, so this cannot be corrected on the form: either file this submission with ` +
    `"${finding.writtenValue}" as the applicant, or clear the declaring entity so the declaration ` +
    `follows the applicant of record.`
  );
}

/**
 * The refusal for a fill that leaves the official form blank in practice, or
 * null when at least one written value will stand on the delivered form.
 *
 * Three ways to reach the same artifact — a blank official FDA template
 * registered as "Module 1 / official FDA eSTAR (submittable)":
 *
 *  1. NOTHING WAS WRITTEN. `data: {}`, which POST /official accepts (its schema
 *     defaults `data` to an empty object). The only case the original check saw.
 *  2. EVERYTHING WRITTEN IS ERASED BY THE FORM. `{ deviceCommonName: 'CGM' }`
 *     wrote one cell, and that cell is one the template clears and rebuilds from
 *     a source this map does not write. It returned `filled: true`,
 *     `filledFields: ['deviceCommonName']`, `blockers: []`.
 *  3. EVERYTHING WRITTEN RENDERS TO NOTHING. The writer's `hasData` counts `[]`
 *     as data — not undefined, not null, not a blank string — and `toText`
 *     renders it `String([]) === ''`, so the key is reported as filled and the
 *     cell goes out empty.
 *
 * `erasedKeys ⊆ filledKeys` and the blank set is measured with the writer's own
 * rendering, so this can only ever refuse more than the original "wrote no
 * values" test, never less. The message names WHICH keys went and WHY: a refusal
 * that says only "nothing survives" cannot be acted on.
 */
function describeBlankFormRefusal(input: {
  descriptorId: string;
  fieldMap: OfficialPdfFieldMap;
  values: Record<string, unknown>;
  filledKeys: ReadonlyArray<string>;
  erasedKeys: ReadonlyArray<string>;
}): string | null {
  const blankCells = input.filledKeys.filter(
    (k) => estarCellText(input.fieldMap[k], input.values[k]) === null,
  );
  const surviving = input.filledKeys.filter(
    (k) => !input.erasedKeys.includes(k) && !blankCells.includes(k),
  );
  if (surviving.length > 0) return null;

  const mapped = Object.keys(input.fieldMap).length;
  const reasons: string[] = [];
  if (input.erasedKeys.length > 0) {
    reasons.push(
      `${input.erasedKeys.join(', ')} — cleared and rebuilt by the template's own scripts from a ` +
        `field this map does not write`,
    );
  }
  if (blankCells.length > 0) {
    reasons.push(`${blankCells.join(', ')} — supplied as a value that renders to no text at all`);
  }
  if (reasons.length === 0) {
    return (
      `Cannot produce a submittable eSTAR: the fill wrote no values into "${input.descriptorId}". ` +
      `The platform held no value for any of the ${mapped} mapped administrative fields, ` +
      `so the output would be the blank official template.`
    );
  }
  return (
    `Cannot produce a submittable eSTAR: no value written into "${input.descriptorId}" would stand on ` +
    `the delivered form (${reasons.join('; ')}). The applicant would open the blank official ` +
    `template, and none of the ${mapped} mapped administrative fields holds anything else. ` +
    `Supply at least one value the form keeps.`
  );
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
    erasedFields: [],
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

  /* A CELL THE FORM WILL FILL WITH A DIFFERENT ENTITY'S NAME IS NOT A FILLED
     CELL — IT IS A FALSE ATTESTATION, AND THIS REFUSES TO PRODUCE ONE.

     `declarationCompanyName` was written into `DoC.DCTextField120` and reported
     as filled. Read out of the vendored template itself, the applicant block's
     `Functions.Validation()` — called from fourteen field `exit` handlers —
     runs `AdministrativeDocumentation.DoC.DCTextField120.rawValue = "";` and
     then, `if (... ApplicantInformation.ADTextField210.rawValue != null)`,
     copies the APPLICANT company name into it. `ADTextField210` is
     `applicantCompanyName`. So on a filing whose governed
     `estar_registrations.declaration_company_name` names a different legal
     entity — the whole reason that column exists, for an organization filing on
     behalf of several clients — the Declaration of Conformity in the submitted
     eSTAR attests in the name of an entity that did not make it.

     There is no remedy inside the form: the clear is unconditional and the
     rebuild reads the applicant block by design, so no source exists that would
     hold a second entity. The conflict is between two governed facts and the
     structure of FDA's form, which is why it is assessed on the VALUES this
     fill carries rather than on whether our write happens to land.

     It is NOT refused when the two names agree — which is the ordinary case,
     since `declarationCompanyName` falls back to `client_workspaces.name` then
     `organizations.name`, exactly what `applicantCompanyName` resolves to. The
     rebuild then rewrites the cell with an identical string and nothing is
     lost. Refusing on divergence only is what keeps this a real blocker rather
     than a banner every filer learns to click past.

     IT IS ALSO REFUSED WHEN THE APPLICANT COMPANY IS NOT ON THE FILING AT ALL
     (`'substituted-on-entry'`). That case used to fall through as a plain
     erasure and produce no blocker, and the reasoning was wrong: FDA's clear is
     unconditional, so the delivered form still shows the declaring entity, and
     the applicant's own first entry of their company name — which the form
     requires — rebuilds the cell in THEIR name. The false attestation is the
     same one, reached one keystroke later, so it is refused the same way.
     Divergence is still what the gate is about: a filing that writes no
     declaring entity at all is untouched, and so is one whose declaring entity
     equals the applicant. */
  for (const finding of assessEstarTemplateRebuild(fieldMap, input.data)) {
    if (!isEstarSubstitution(finding)) continue;
    base.blockers.push(describeSubstitutionRefusal(descriptor.id, finding));
  }
  if (base.blockers.length > 0) return base;

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

  /* THE OTHER HALF OF THE SAME HONESTY PROBLEM. Six of the mapped cells are
     summaries the form clears and rebuilds from a source this map does not
     write, so a value we wrote into them is gone the moment the applicant works
     the section. They were counted in `filledFields` and mentioned nowhere
     else, so every caller that does not go through the governed field report —
     the whole `data`-verbatim path — was told a value was on the form when the
     form is about to erase it. Named on the result, so no caller has to know
     about ESTAR_TEMPLATE_RECOMPUTED_FIELDS to be told the truth. Assessed
     against `result.filled`, not the input, because a value the template
     skipped never reached a cell.

     `POST /api/510k/estar/official` reads this: it puts `erasedFields` in the
     200 body on BOTH paths and in the metadata of the registered artifact. The
     claim above ("no caller has to know") was written before that wiring existed
     and was false for a day — nothing outside this module and its tests read the
     field, so the verbatim path's 200 said nothing about erasure at all. */
  const erased = assessEstarTemplateRebuild(fieldMap, input.data, result.filled).filter(
    (f) => f.effect === 'erased',
  );
  base.erasedFields = erased.map((f) => f.key);
  if (erased.length > 0) {
    base.warnings = [
      ...base.warnings,
      `${erased.length} of the values written into "${descriptor.id}" will not survive the form's own ` +
        `scripts: ${erased.map((f) => `${f.key} ("${f.caption}")`).join(', ')}. The template clears each ` +
        `of these cells and rebuilds it from a field this map does not write, so the applicant sees them ` +
        `blank and must enter them on the form.`,
    ];
  }

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
  //
  // AND A FILL WHOSE EVERY WRITTEN VALUE THE FORM ERASES PRODUCED NO FILLED FORM
  // EITHER. `{ deviceCommonName: 'CGM' }` wrote one cell, and that cell is one
  // the template clears and rebuilds from a source this map does not write — so
  // the applicant opens a blank official form. It returned `filled: true`,
  // `filledFields: ['deviceCommonName']`, `blockers: []`, and was retained and
  // registered as submittable. Counting the erased keys OUT of the surviving set
  // is the same test as before, applied to what is left on the form rather than
  // to what the writer touched; `erasedFields ⊆ filledFields`, so this can only
  // ever block more than the old test, never less.
  //
  // A CELL THE WRITER FILLED WITH NOTHING IS NOT A SURVIVOR EITHER. The writer's
  // `hasData` treats anything that is not undefined, null or a blank string as
  // data, and `toText` renders `[]` to `''` — so `data: { deviceTradeName: [] }`,
  // which the route's `z.record(z.unknown())` accepts from a JSON body, was
  // recorded in `filled`, counted as a survivor, and delivered the blank
  // official template as a submittable artifact. Same defect as `data: {}`,
  // reached through a shape the "no values written" test could not see.
  // `estarCellText` is the writer's own rendering, so this asks the only
  // question that matters: is there text in that cell.
  //
  // THE ATTACHMENT MANIFEST IS EXCLUDED FROM THE SURVIVOR SET ON PURPOSE. It is
  // not a value the platform holds — it is computed from the attachment plan —
  // so counting it would let a fill that wrote nothing else clear the very check
  // that exists to refuse a blank official form, and deliver one with files
  // stapled to it. It is filtered out of `filledKeys` rather than handled inside
  // the refusal, because `fieldMap` (which sets the "of N mapped administrative
  // fields" denominator and backs the blank-cell rendering) never carries it.
  const administrativeFilled = result.filled.filter((k) => k !== ESTAR_ATTACHMENT_MANIFEST_KEY);
  const blankFormRefusal = describeBlankFormRefusal({
    descriptorId: descriptor.id,
    fieldMap,
    values: input.data,
    filledKeys: administrativeFilled,
    erasedKeys: base.erasedFields,
  });
  if (blankFormRefusal) {
    base.blockers.push(blankFormRefusal);
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

  base.filled = true;
  base.pdfBytes = plan ? attachPlannedFiles(result.bytes, plan.attachments) : result.bytes;
  return base;
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
