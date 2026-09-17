/**
 * The attachment plan — which of a program's documents goes into which eSTAR
 * slot, under what name, and what the form's manifest must then say.
 *
 * Everything under it already existed and none of it was reachable: the writer
 * can express the objects (`forms/incremental-update`), they can be enciphered
 * (`forms/pdf-embedded-files`), they can be joined to the document without
 * destroying the form (`forms/pdf-attach`), and every slot the template
 * declares is enumerable with the chapter token CDRH routes by
 * (`estar-attachment-slots`). What was missing is the step that decides, and
 * REFUSES: an attachment plan is a regulatory act, and most of the ways it can
 * be wrong are silent.
 *
 * ── What this refuses, and why each refusal is not optional ─────────────────
 *
 * | refusal | what shipping it would do |
 * |---|---|
 * | slot not in this template | a token naming a chapter the form has no row for |
 * | chapter unresolved | §4c: a US MDUFA cover sheet filed under Health Canada |
 * | a second file into a single-attachment slot | two tokens for a row the form holds one of |
 * | the template's own acceptance rules | the file is embedded, and DELETED on first save |
 * | content the resolver could not produce | a manifest entry pointing at nothing |
 * | an unsubstantive section | an unreviewed machine draft filed as a submission |
 *
 * The last one is the reason `AuthoredDeviceSection.substantive` exists. The
 * draft package `/build` produces is allowed to contain drafts — that is what
 * it says on the label. A named CDRH attachment slot is not.
 *
 * ── The seed is load-bearing ────────────────────────────────────────────────
 *
 * Both templates ship `root.AttachmentManifest = "***Start***"`, and FDA's
 * `checkRemovedAttachments()` tests `indexOf("<<") > 0` — STRICTLY greater.
 * Drop the eleven-character seed and the first `<<` lands at index 0, `0 > 0`
 * is false, and FDA's own validator silently no-ops on a form that looks
 * filled. So the manifest is built by APPENDING to what the template shipped,
 * and a template that ships something else is refused rather than overwritten.
 *
 * ── Determinism ────────────────────────────────────────────────────────────
 *
 * `at` is passed in, never read from the clock, for the same reason
 * `attachmentDataObjectName` takes it: identical inputs must produce identical
 * bytes, and the name-tree key is `util.printd("yyyy-mm-ddTHH:MM:ss")`.
 *
 * @module server/services/pathway-engines/estar/estar-attachment-plan
 */

import { createHash } from 'node:crypto';

import { pool } from '../../../db';
import { readVerifiedVaultBytes } from '../../../routes/c2c/project-vault';
import { renderStructuredLeafPdf } from '../../ectd/leaf-pdf-renderer';
import { readXfaDatasetsValues } from '../../forms/fill-official-pdf';
import { loadAuthoredDeviceSections, type DeviceContentClient } from './estar-content-leaves';
import {
  ATTACHMENT_PATH_MAX_LENGTH,
  attachmentDataObjectName,
  attachmentManifestToken,
  checkAttachmentAcceptance,
  listEstarAttachmentSlots,
  resolveAttachmentSlot,
  type EstarAttachmentSlot,
} from './estar-attachment-slots';

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The datasets node the manifest lives in — the DATA path, not the SOM path. */
export const ATTACHMENT_MANIFEST_DATA_PATH = 'root.AttachmentManifest';

/**
 * The eleven characters both templates ship in that node, and the only value
 * this planner will append to. See the header: `indexOf("<<") > 0`.
 */
export const ATTACHMENT_MANIFEST_SEED = '***Start***';

/**
 * Every datasets value the plan reads out of the template.
 *
 * `ATRadioButton100` is the jurisdiction radio the User Fee Form's chapter
 * branches on. It is read from the template bytes being filled — not assumed —
 * because reading it is how you get the answer the applicant's Acrobat would
 * compute. Both templates ship `"1"` (FDA); nothing in `ESTAR_FIELD_MAPS`
 * writes it, so the filled form carries the same value.
 */
const PLAN_INPUT_PATHS = [ATTACHMENT_MANIFEST_DATA_PATH, 'root.ApplicationType.ATRadioButton100'];

/** Where an attachment's bytes come from. */
export type EstarAttachmentSource =
  /** A section of the program's governed device document, rendered to PDF. */
  | { kind: 'authored_section'; sectionCode: string }
  /** A document already in the program's vault, served with its hash verified. */
  | { kind: 'vault_document'; documentId: string };

export interface EstarAttachmentRequest {
  /**
   * The slot's SOM path (`EstarAttachmentSlot.somPath`) — e.g.
   * `root.CoverLetter.CLAddAttachment110`.
   *
   * The SOM path and not the control's short name, which is not unique: nIVD
   * declares `AddAttachment` twice and IVD declares five names twice, so a plan
   * keyed on the name can file into a slot it did not choose.
   *
   * WHICH section belongs in WHICH slot is a regulatory judgement. Nothing here
   * derives it, and nothing here should: this module's job is to refuse every
   * mechanical way that judgement can be executed wrongly.
   */
  slot: string;
  source: EstarAttachmentSource;
  /**
   * Override the file name the resolver proposes. This is the string the
   * manifest token carries and the viewer shows — the `/Filespec`'s `/F` and
   * `/UF`, Acrobat's `dataObject.path`. NOT the name-tree key, which must be
   * date-shaped and which this module assigns.
   */
  fileName?: string;
}

export type ResolvedAttachmentContent =
  | { ok: true; bytes: Buffer; fileName: string; mimeType: string }
  | { ok: false; reason: string };

/**
 * Produce the bytes for one source. Injected because the two sources live in
 * layers this module must not reach into — the governed section store and the
 * vault — and because a planner that cannot be tested without a database is a
 * planner whose refusals are never exercised.
 */
export type EstarAttachmentResolver = (
  source: EstarAttachmentSource,
) => Promise<ResolvedAttachmentContent>;

export interface PlannedAttachment {
  /** The slot's SOM path, echoed back. */
  slot: string;
  /** The control's own name, for an operator reading the form. */
  field: string;
  /** The chapter CDRH routes by, resolved (never picked from `chapters`). */
  chapter: string;
  /** `/F`, `/UF`, the manifest token's path — Acrobat's `dataObject.path`. */
  fileName: string;
  /** The `/EmbeddedFiles` name-tree key — Acrobat's `dataObject.name`. */
  dataObjectName: string;
  /** FDA's own description of what belongs in this slot, when it sets one. */
  description: string | null;
  mimeType: string;
  bytes: Buffer;
  byteLength: number;
  /** sha256 of the plaintext bytes — the audit row's handle on this file. */
  sha256: string;
  /** `<<fileName|chapter>>`, byte-for-byte what the template would build. */
  token: string;
  source: EstarAttachmentSource;
}

export interface RefusedAttachment {
  slot: string;
  fileName: string | null;
  source: EstarAttachmentSource;
  /** Every reason, never just the first — they are independent. */
  reasons: string[];
}

export interface EstarAttachmentPlan {
  attachments: PlannedAttachment[];
  refused: RefusedAttachment[];
  /**
   * The finished manifest value — the template's seed followed by one token per
   * planned attachment, no separator and no terminator, exactly as the form
   * builds it. Null when nothing was planned, so a caller writes nothing rather
   * than writing the bare seed back over itself.
   */
  manifest: string | null;
}

export interface PlanEstarAttachmentsInput {
  /** The template being filled — slots, the seed and the branch value all come from it. */
  templateBytes: Uint8Array | Buffer;
  requests: readonly EstarAttachmentRequest[];
  resolve: EstarAttachmentResolver;
  /** The instant the name-tree keys are stamped from. Passed in for determinism. */
  at: Date;
}

/** Thrown for a condition of the TEMPLATE, not of a request — see `manifestSeed`. */
export class EstarAttachmentPlanError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EstarAttachmentPlanError';
    this.code = code;
  }
}

/**
 * The value to append to, or a refusal.
 *
 * A template whose manifest already carries tokens is refused rather than
 * appended to: this planner builds a submission from the pristine vendored
 * template, so tokens already present mean the bytes are not what they were
 * taken to be, and appending would produce a manifest describing files that
 * are not in the document.
 */
export function manifestSeed(current: string | null): string {
  if (current === null) {
    throw new EstarAttachmentPlanError(
      'NO_MANIFEST_NODE',
      `This template has no ${ATTACHMENT_MANIFEST_DATA_PATH} node, so an attachment written into it ` +
        'would have no route to CDRH. Both vendored FDA eSTAR templates have one.',
    );
  }
  if (current !== ATTACHMENT_MANIFEST_SEED) {
    throw new EstarAttachmentPlanError(
      'MANIFEST_NOT_PRISTINE',
      `${ATTACHMENT_MANIFEST_DATA_PATH} reads ${JSON.stringify(current)}, not the ` +
        `${JSON.stringify(ATTACHMENT_MANIFEST_SEED)} both vendored templates ship. Appending to it ` +
        'would describe attachments this build did not make.',
    );
  }
  return current;
}

/** Index the template's slots by SOM path — the identity a request names. */
function slotsByPath(slots: readonly EstarAttachmentSlot[]): Map<string, EstarAttachmentSlot> {
  return new Map(slots.map((s) => [s.somPath, s]));
}

/**
 * Plan a program's attachments against one eSTAR template.
 *
 * Every request produces exactly one outcome — planned or refused, with the
 * reasons — and requests are processed in order because two of the rules are
 * ORDER-DEPENDENT: a duplicate file name and a second file into a
 * single-attachment slot are both "this one, given the ones before it". The
 * first request wins, which makes the plan a function of the request order and
 * nothing else.
 */
export async function planEstarAttachments(
  input: PlanEstarAttachmentsInput,
): Promise<EstarAttachmentPlan> {
  const slots = slotsByPath(await listEstarAttachmentSlots(input.templateBytes));
  const values = await readXfaDatasetsValues(input.templateBytes, PLAN_INPUT_PATHS);
  const seed = manifestSeed(values[ATTACHMENT_MANIFEST_DATA_PATH]);

  const attachments: PlannedAttachment[] = [];
  const refused: RefusedAttachment[] = [];
  const takenPaths: string[] = [];
  const filledSingleSlots = new Set<string>();

  for (let i = 0; i < input.requests.length; i++) {
    const request = input.requests[i];
    const refuse = (fileName: string | null, ...reasons: string[]) =>
      refused.push({ slot: request.slot, fileName, source: request.source, reasons });

    const slot = slots.get(request.slot);
    if (!slot) {
      refuse(
        request.fileName ?? null,
        `This template declares no attachment slot at "${request.slot}". A slot is identified by its ` +
          'full SOM path; the template declares several controls whose short names repeat.',
      );
      continue;
    }

    const resolvedSlot = resolveAttachmentSlot(slot, values);
    if (!resolvedSlot.ok) {
      refuse(request.fileName ?? null, resolvedSlot.message);
      continue;
    }

    if (slot.singleAttachment && filledSingleSlots.has(slot.somPath)) {
      refuse(
        request.fileName ?? null,
        `${slot.somPath} takes one attachment and one is already planned for it. The form's own ` +
          `words: "${slot.singleAttachment}"`,
      );
      continue;
    }

    const content = await input.resolve(request.source);
    if (!content.ok) {
      refuse(request.fileName ?? null, content.reason);
      continue;
    }

    const fileName = (request.fileName ?? content.fileName).trim();
    // The key advances by REQUEST index, not by accepted index, so it is unique
    // whatever is refused ahead of it — and it stays a real date, which is the
    // only part `removeOrphanAttachments` reads.
    const dataObjectName = attachmentDataObjectName(input.at, i);
    const acceptance = checkAttachmentAcceptance({
      path: fileName,
      byteLength: content.bytes.length,
      dataObjectName,
      existingPaths: takenPaths,
    });
    if (!acceptance.accepted) {
      refuse(fileName, ...acceptance.refusals);
      continue;
    }

    takenPaths.push(fileName);
    if (slot.singleAttachment) filledSingleSlots.add(slot.somPath);
    attachments.push({
      slot: slot.somPath,
      field: slot.field,
      chapter: resolvedSlot.chapter,
      fileName,
      dataObjectName,
      description: resolvedSlot.description,
      mimeType: content.mimeType,
      bytes: content.bytes,
      byteLength: content.bytes.length,
      sha256: sha256Of(content.bytes),
      token: attachmentManifestToken(fileName, resolvedSlot.chapter),
      source: request.source,
    });
  }

  return {
    attachments,
    refused,
    manifest: attachments.length === 0 ? null : seed + attachments.map((a) => a.token).join(''),
  };
}

// ── The resolvers ───────────────────────────────────────────────────────────
//
// Two sources, two very different integrity stories, and both belong beside the
// planner rather than in a module of their own: "where an attachment's bytes
// come from" is one idea, and splitting it would put the substantive-section
// rule and the hash-verification rule in different files from the refusals that
// depend on them.

/**
 * A file name the eSTAR will keep.
 *
 * `checkAttachmentAcceptance` refuses non-ASCII, over-124-character and
 * forbidden-extension names, and each refusal is a file the form DELETES on the
 * applicant's first save. Producing a name that passes is better than producing
 * one that fails and reporting it: a section titled with an en dash is not a
 * regulatory problem, it is a character.
 *
 * The extension is appended after truncation so it always survives — a name
 * truncated to exactly 124 characters with the `.pdf` cut off is refused for a
 * reason the operator cannot act on.
 */
export function attachmentFileName(title: string, extension = '.pdf'): string {
  const ext = toAscii(extension ?? '').replace(/\s+/g, '');
  // The stem is truncated to whatever the extension leaves, so the extension
  // always survives — a name cut to exactly 124 characters with `.pdf` lost is
  // refused for a reason the operator cannot act on. An extension that would
  // fill the budget on its own leaves an empty stem, which the fallback catches.
  const stemBudget = Math.max(1, ATTACHMENT_PATH_MAX_LENGTH - ext.length);
  const ascii = toAscii(title ?? '')
    // The characters a file name cannot carry across the platforms an eSTAR is
    // opened on.
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stem = (ascii.length > 0 ? ascii : 'Attachment').slice(0, stemBudget).trim();
  return `${stem.length > 0 ? stem : 'Attachment'}${ext}`.slice(0, ATTACHMENT_PATH_MAX_LENGTH);
}

/**
 * Whatever a title carries, rendered in the printable ASCII the eSTAR requires.
 *
 * Three steps and none is optional. NFKD splits an accented letter into a
 * letter plus a combining mark, so dropping the marks keeps "résumé" as
 * "resume" rather than losing the vowels. The dash and quote families are named
 * because NFKD leaves them alone and they are what a title pasted out of Word
 * has in it. The catch-all is last and is the one that MATTERS: a title in a
 * script that decomposes to nothing ASCII — Japanese, Greek, an emoji in a
 * device nickname — would otherwise reach the form as a non-ASCII path, which
 * `AttachmentValidation` refuses and the form then DELETES.
 */
function toAscii(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[^\x20-\x7e]/g, ' ');
}

export interface DeviceAttachmentResolverInput {
  organizationId: number;
  /** The regulatory program whose governed sections and vault are readable. */
  programUuid: string | null;
  /**
   * The governed document CLASS this export files from — `['k510']`,
   * `['denovo']`, `['pma']`.
   *
   * REQUIRED in spirit, optional only so a caller that has no class (there is
   * none today) degrades to the loader's default rather than reading nothing.
   * Without it the loader takes the most recently created document of ANY
   * device class, CER included, and the rule-pack keys this resolver files by
   * are per-pathway and collide: `D5` is "Shelf life and packaging" in the k510
   * pack and "Cybersecurity" in the denovo pack; `E1` is "Biocompatibility" in
   * one and "Proposed labeling and instructions for use" in the other. So
   * generating a CER, or scaffolding a De Novo beside a 510(k), silently
   * changes which document a named CDRH attachment slot is filled from — with a
   * clean 200 and no blocker.
   *
   * That is tolerable for the draft package `/build` produces and is not
   * tolerable here, which is the same line `substantive` draws.
   */
  docTypes?: ReadonlyArray<string>;
  client?: DeviceContentClient;
}

/**
 * The real resolver: governed sections rendered to PDF, and vault documents
 * served with their recorded hash verified.
 *
 * Sections are loaded ONCE, on first use, rather than per request — a plan with
 * twelve sections in it would otherwise run twelve identical queries — and the
 * load is not cached across calls, so a resolver is single-use by construction
 * and cannot serve a stale document set into a later export.
 */
export function createDeviceAttachmentResolver(
  input: DeviceAttachmentResolverInput,
): EstarAttachmentResolver {
  let sections: Awaited<ReturnType<typeof loadAuthoredDeviceSections>> | null = null;

  return async (source) => {
    if (!input.programUuid) {
      return {
        ok: false,
        reason:
          'This export is anchored to a legacy project row with no regulatory program, so there is ' +
          'no governed document and no program vault to attach from.',
      };
    }

    if (source.kind === 'authored_section') {
      if (sections === null) {
        sections = await loadAuthoredDeviceSections(input.organizationId, {
          programId: input.programUuid,
          docTypes: input.docTypes,
          client: input.client,
        });
      }
      const section = sections.find((s) => s.sectionCode === source.sectionCode);
      if (!section) {
        return {
          ok: false,
          reason:
            `Section "${source.sectionCode}" has no authored content in this program's governed ` +
            'document, so there is nothing to file into the slot.',
        };
      }
      /* THE DIFFERENCE BETWEEN A DRAFT PACKAGE AND A SUBMISSION. `substantive`
         is the readiness path's own rule (estar-content-leaves.isSubstantive):
         an explicit draft/in-review status is never substantive however long the
         body, and a bare placeholder never is at any status. `/build` files
         drafts on purpose — its label says draft. A named CDRH attachment slot
         is where an unreviewed machine draft becomes a filed assertion. */
      if (!section.substantive) {
        return {
          ok: false,
          reason:
            `Section "${source.sectionCode}" (${section.title}) is authored but not finalized — it is ` +
            'still a draft or a stub. A draft belongs in the draft package, not in a named eSTAR ' +
            'attachment slot.',
        };
      }
      const bytes = await renderStructuredLeafPdf(
        [{ heading: section.title, body: section.content, sectionCode: section.sectionCode }],
        { title: section.title, sectionCode: section.sectionCode },
      );
      return {
        ok: true,
        bytes,
        fileName: attachmentFileName(
          section.sectionCode ? `${section.sectionCode} ${section.title}` : section.title,
        ),
        mimeType: 'application/pdf',
      };
    }

    /* The vault branch. The org predicate is repeated on regulatory_programs
       rather than trusted from the caller, and the bytes go through
       readVerifiedVaultBytes — the ONE reader that proves a stored file is the
       file the row recorded. Filing an altered document under a governed
       document's identity is the failure that check exists for. */
    const docRes = await pool.query(
      `SELECT id, file_name, document_title, mime_type, s3_key, content_hash
         FROM vault.documents
        WHERE id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = vault.documents.program_id
               AND rp.organization_id = $3
               AND rp.deleted_at IS NULL
          )
        LIMIT 1`,
      [source.documentId, input.programUuid, input.organizationId],
    );
    const doc = docRes.rows[0] as
      | {
          id: string;
          file_name: string | null;
          document_title: string | null;
          mime_type: string | null;
          s3_key: string | null;
          content_hash: string | null;
        }
      | undefined;
    if (!doc) {
      return {
        ok: false,
        reason: `No vault document ${source.documentId} in this program.`,
      };
    }
    if (!doc.s3_key) {
      return {
        ok: false,
        reason:
          `Vault document ${source.documentId} was catalogued without content — the record exists, ` +
          'the file does not.',
      };
    }
    const read = await readVerifiedVaultBytes(doc.s3_key, doc.content_hash, doc.id);
    if (!read.ok) {
      return { ok: false, reason: `Vault document ${source.documentId}: ${read.message ?? read.error}` };
    }
    const proposed = doc.file_name?.trim() || doc.document_title?.trim() || `document-${doc.id}`;
    const dot = proposed.lastIndexOf('.');
    const extension = dot > 0 ? proposed.slice(dot) : '';
    return {
      ok: true,
      bytes: read.bytes,
      fileName: attachmentFileName(dot > 0 ? proposed.slice(0, dot) : proposed, extension),
      mimeType: doc.mime_type?.trim() || 'application/octet-stream',
    };
  };
}

export default {
  ATTACHMENT_MANIFEST_DATA_PATH,
  ATTACHMENT_MANIFEST_SEED,
  manifestSeed,
  planEstarAttachments,
  attachmentFileName,
  createDeviceAttachmentResolver,
};
