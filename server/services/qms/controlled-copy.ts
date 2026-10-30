/**
 * A controlled copy of a QMS controlled document (MR-12 Stage 8 step 3,
 * CAT2-24; 21 CFR 820.40, ISO 13485 §4.2.4, 21 CFR 11.50).
 *
 * It is the version IN FORCE — the row while effective, its signed predecessor
 * while a revision is open (in-force-release.ts), nothing once retired — only
 * when that version's approval still stands and its immutable signed content
 * still matches it (readQmsTrainingReleaseContext, the check training admission
 * makes). The content is that signed version's own sections
 * (qms_document_versions), never today's editing copy.
 *
 * It is rendered by the one Authoring renderer (renderAuthoringExport): every
 * page carries the CONTROLLED COPY banner — number, version, effective date,
 * who it was issued to and when, "uncontrolled when printed" — and the
 * signature section prints the QMS approval's manifestation (printed name, UTC
 * time, meaning, the bound content digest), the signature that put the version
 * in force. The caller delivers it through the audited download, so a copy
 * whose record did not persist is never delivered.
 *
 * @module server/services/qms/controlled-copy
 */
import { computeQmsDocumentContentDigest, type QmsDocumentRow } from './document-approval-signature';
import { resolveInForceRelease } from './in-force-release';
import { readQmsTrainingReleaseContext } from './current-release-approval';
import type { TrainingSqlClient } from './training';
import { renderAuthoringExport, type ExportDocRow, type ExportSectionRow } from '../authoring/authoring-export';

export type ControlledCopyFormat = 'pdf' | 'docx';

export class QmsControlledCopyRefused extends Error {
  constructor(readonly status: 404 | 409, readonly code: string, message: string) { super(message); this.name = 'QmsControlledCopyRefused'; }
}

export interface QmsControlledCopy {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** The version the copy is of, and the approval signature it carries. */
  version: string;
  signatureId: number;
  authoringDocumentId: string;
}

const MIME: Record<ControlledCopyFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const utc = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const day = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

/** The page banner every page of the copy carries. */
export function controlledCopyBanner(release: QmsDocumentRow, issuedTo: string, issuedAt: Date): string {
  const effective = day(release.effective_date) ?? day(release.approved_at) ?? 'date not recorded';
  return `CONTROLLED COPY · ${release.doc_number} v${release.version} · effective ${effective} · ` +
    `issued ${utc(issuedAt.toISOString())} to ${issuedTo} · uncontrolled when printed`;
}

/** The release in force, its standing approval and its signed sections; refused, with the reason, otherwise. */
async function readCopyableRelease(client: TrainingSqlClient, live: QmsDocumentRow) {
  const inForce = await resolveInForceRelease(client, live);
  if (!inForce) {
    throw new QmsControlledCopyRefused(409, 'QMS_NOTHING_IN_FORCE', live.status === 'retired'
      ? `${live.doc_number} is retired, so no controlled copy is issued.`
      : `No version of ${live.doc_number} is in force yet; a controlled copy is issued once one is approved.`);
  }
  const release = inForce.release;
  if (!release.authoring_document_id) {
    throw new QmsControlledCopyRefused(409, 'QMS_COPY_NOT_AUTHORED',
      `${release.doc_number} v${release.version} predates authored content, so it has no rendered text. Open a controlled revision to author it.`);
  }
  const { context, approval } = await readQmsTrainingReleaseContext(client, release);
  if (!approval || approval.state !== 'valid' || !context.eligible || !approval.signer || approval.signatureId == null) {
    throw new QmsControlledCopyRefused(409, 'QMS_RELEASE_NOT_VERIFIED',
      `${approval?.reason ?? context.unavailableReason ?? 'The approval of this version could not be verified.'} No controlled copy was issued.`);
  }
  const versions = await client.query(
    `SELECT sections FROM qms_document_versions
      WHERE organization_id = $1 AND document_id = $2 AND version = $3 AND record_kind = 'signed'`,
    [release.organization_id, release.id, release.version]);
  const sections = Array.isArray(versions.rows[0]?.sections) ? (versions.rows[0].sections as Array<Record<string, unknown>>) : [];
  if (!sections.length) {
    throw new QmsControlledCopyRefused(409, 'QMS_RELEASE_NOT_VERIFIED', 'The signed content of this version could not be read. No controlled copy was issued.');
  }
  return { release, approval: { ...approval, signer: approval.signer, signatureId: approval.signatureId }, sections };
}

/**
 * Render the controlled copy of document `live`'s version in force. The caller
 * has admitted the reader to the version's authored content and delivers the
 * result through the audited download.
 */
export async function renderQmsControlledCopy(client: TrainingSqlClient, live: QmsDocumentRow, input: {
  format: ControlledCopyFormat; issuedTo: string; actor: { id: string; email: string | null }; now?: Date;
  /** Whether the reader may read the version's authored content; refused (as not found) when not. */
  admit: (authoringDocumentId: string) => Promise<boolean>;
}): Promise<QmsControlledCopy> {
  const { release, approval, sections } = await readCopyableRelease(client, live);
  if (!(await input.admit(String(release.authoring_document_id)))) {
    throw new QmsControlledCopyRefused(404, 'QMS_DOCUMENT_VIEW_DENIED', 'You do not have permission to read this controlled document. No copy was issued.');
  }
  const docs = await client.query(
    `SELECT id, title, module, status, created_at, provenance, client_program_id, created_by
       FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
    [release.authoring_document_id, release.organization_id]);
  if (!docs.rows[0]) throw new QmsControlledCopyRefused(404, 'QMS_COPY_SOURCE_MISSING', 'The authored source of this version is missing. No controlled copy was issued.');
  const doc = { ...(docs.rows[0] as unknown as ExportDocRow), title: `${release.doc_number} ${release.title} v${release.version}` };
  const rows: ExportSectionRow[] = [...sections]
    .sort((a, b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0))
    .map((s) => ({ id: String(s.id), code: String(s.code ?? ''), title: String(s.title ?? ''), content: typeof s.content === 'string' ? s.content : null }));
  const manifest = [[
    `Approved by: ${approval.signer.signerName ?? 'a signer with no printed name on record'}`,
    `Meaning: Approval`,
    `Executed: ${utc(approval.signer.signedAt)}`,
    `Covers: ${release.doc_number} version ${release.version}; content digest ${computeQmsDocumentContentDigest(release)}`,
    `Signature record: ${approval.signatureId}`,
  ]];
  const rendered = await renderAuthoringExport({
    executor: client as never, tenantId: release.organization_id, doc, sections: rows, format: input.format,
    actor: input.actor as never,
    controlledCopy: { banner: controlledCopyBanner(release, input.issuedTo, input.now ?? new Date()), manifest },
  });
  return {
    buffer: rendered.fileContent,
    filename: `${release.doc_number}_v${release.version}_controlled_copy.${input.format}`.replace(/[^A-Za-z0-9._-]+/g, '_'),
    mimeType: MIME[input.format],
    version: String(release.version),
    signatureId: approval.signatureId,
    authoringDocumentId: String(release.authoring_document_id),
  };
}
