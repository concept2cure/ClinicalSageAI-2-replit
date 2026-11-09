/**
 * The release verdicts of the leaf sources: whether a document a leaf is built from may be released to an agency,
 * and in which words a refusal names it. Split out of leaf-source-resolver.ts (2026-11-09, P-94, its 500-line limit)
 * with no change to any rule; that module re-exports every name here, so its callers are unchanged. Read by the
 * assembler (materializeLeafSources) and by dispatch readiness (leaf-document-resolver.ts), so the Validation and
 * Dispatch tabs name an unapproved leaf in the words freeze, dispatch and transmit refuse it with.
 */
import { vaultVersionNotTransmittable } from '../vault/vault-lifecycle.js';

/**
 * A source document is submission-FINALIZED only when its lifecycle status is
 * approved or finalized. Every other status (draft, in-progress, review, or an
 * absent status defaulting to draft) is unfinalized — it must not count toward a
 * "complete" package.
 */
const FINALIZED_SOURCE_STATUSES: ReadonlySet<string> = new Set(['approved', 'finalized']);

/**
 * coauthor_documents: `approved` only (DP-35, decided 2026-10-01).
 *
 * A co-author document is `finalized` only as the snapshot of a FROZEN
 * authoring document (coauthor-snapshot.ts snapshotStatusFor), and no request
 * can write the column (coauthor-status-write.ts). Freezing seals the content;
 * it is not an approval. It needs no signing authority and no re-authentication,
 * any document owner may do it, and it writes no signature row. Counting it as
 * finalized let an unsigned lock clear the "only approved documents"
 * completeness check and reach an agency. An approval is the signed act
 * (authoring /sign or /e-sign → APPROVED → `approved`). A frozen document files
 * after it is approved.
 */
const COAUTHOR_TRANSMITTABLE_STATUSES: ReadonlySet<string> = new Set(['approved']);

/**
 * The stores whose status decides whether a leaf built from them may be
 * transmitted, each with its own vocabulary.
 */
export type FinalizedStatusStore =
  | 'coauthor_documents'
  | 'unified_documents'
  | 'c2c_document_sections'
  | 'concept2cure_artifacts';

/**
 * The ONE definition of "finalized" for the document a leaf is built from:
 * a leaf whose source is not finalized is not transmitted to an agency.
 *
 * (2026-09-23, W5/D7, round-2 review.) Exported, and keyed by store, so the
 * package-model spine (POST /api/submission-ops/packages/:id/assemble, which
 * builds its leaves from concept2cure_artifacts) applies the rule the sequence
 * spine applies through materializeLeafSources below, instead of shipping a
 * draft artifact to the agency. The vocabularies genuinely differ, so one set
 * cannot serve every store:
 *   coauthor_documents / unified_documents — `approved | finalized`
 *     (coauthor: draft | in-progress | review | approved | finalized;
 *     unified: draft | in_review | approved | published | archived | rejected —
 *     `published` is set only by ungoverned setters, so it is not finalized).
 *   c2c_document_sections — `approved` ALONE (2026-10-18, P-29). The
 *     vocabulary is todo | drafted | review | approved | locked, and this read
 *     used to borrow the readiness trigger's complete set
 *     (C2C_SECTION_COMPLETE_STATUSES = approved | locked). Readiness is
 *     progress; this is an attestation. `locked` is written by no production
 *     path and carries no signature, so it is refused here and left in
 *     readiness — see C2C_SECTION_TRANSMITTABLE_STATUSES below.
 *   concept2cure_artifacts — `approved | locked`. The vocabulary is draft |
 *     review | approved | locked (PUT /projects/:projectId/artifacts/
 *     :artifactId/status, which requires an attestation for both of the last
 *     two; `locked` is the post-approval publish lock). It has no `finalized`.
 * Anything else, including a missing status (the columns default to a draft
 * state), is unfinalized.
 *
 *   vault_documents — not a status column, so not in this map: a Vault version
 *     is decided by vaultVersionNotTransmittable (server/services/vault/
 *     vault-lifecycle.ts, VR-14) — its VR-13 lifecycle record at a steady stage,
 *     the version current, the approval bound to the staged bytes.
 *
 * `store` defaults to the coauthor / unified document vocabulary this
 * predicate was first written for, which is the one server/routes/coauthor.ts
 * checks. A caller reading another store must name it; the default is the
 * stricter answer for `locked`, so an omission fails closed.
 */
/**
 * A filing section is transmittable on `approved` ALONE — not on
 * `C2C_SECTION_COMPLETE_STATUSES`, which this read reused until 2026-10-18.
 *
 * That set is `{'approved','locked'}` and is right where it belongs: it is the
 * TypeScript mirror of `c2c_document_counted_readiness()` (the trigger's count)
 * and is pinned to the migration by a contract test. But readiness is a PROGRESS metric, and
 * transmittability is an attestation. The two questions have different answers
 * for one word.
 *
 *  - `approved` is written in exactly ONE place —
 *    `approveBoundFilingSections`, inside the signature's own transaction, and
 *    only for a section whose filed text equals the text signed. A signature
 *    stands behind it by construction.
 *  - `locked` is written by no production path. The filing-side route refuses
 *    `status: 'locked'` outright (APPROVAL_REQUIRES_SIGNATURE, "a section
 *    cannot be locked here"); `commitSectionToFiling` only reads it; the
 *    document lock sets `c2c_documents.status`, not a section's.
 *
 * And it was reachable, which made it a fail-open rather than dead vocabulary:
 * `migrations/20260529_phase9_backfill.sql` maps a legacy section's status
 * through `WHEN 'locked' THEN 'locked'`, and that file is on the applier. So a
 * legacy-migrated section could ship as a finalized eCTD leaf with no
 * electronic signature ever having covered its text — §11.70's link to the
 * record absent, on the last gate before transmission.
 *
 * P-29 (docs/EXIT_ATTESTATION_DECISION_2026-10-18.md). Pinned by
 * __tests__/leaf-finalized-status-needs-a-signature.test.ts, which also pins
 * that the readiness set was NOT narrowed to achieve this.
 */
const C2C_SECTION_TRANSMITTABLE_STATUSES: ReadonlySet<string> = new Set(['approved']);

const FINALIZED_STATUSES_BY_STORE: Readonly<Record<FinalizedStatusStore, ReadonlySet<string>>> = {
  coauthor_documents: COAUTHOR_TRANSMITTABLE_STATUSES,
  unified_documents: FINALIZED_SOURCE_STATUSES,
  c2c_document_sections: C2C_SECTION_TRANSMITTABLE_STATUSES,
  concept2cure_artifacts: new Set(['approved', 'locked']),
};
export function isFinalizedStatus(
  status: string | null | undefined,
  store: FinalizedStatusStore = 'coauthor_documents',
): boolean {
  return FINALIZED_STATUSES_BY_STORE[store].has((status ?? '').toLowerCase());
}

/**
 * The status a refusal prints beside a leaf whose source is not finalized, or
 * null when it is finalized. ONE wording, read by the assembler below and by
 * dispatch readiness (leaf-document-resolver.ts), so the Validation and
 * Dispatch tabs name an unapproved leaf in the words freeze, dispatch and
 * transmit refuse it with (QA 2026-10-08, j6: the gate the client sees did not
 * name the leaf at all). A coauthor document's 'finalized' is an unsigned
 * freeze (DP-35), so it is said as such rather than printed as a word that
 * reads as the opposite of the refusal it sits in.
 */
export function notFinalizedStatus(
  status: string | null | undefined,
  store: FinalizedStatusStore,
  whenMissing = 'draft',
): string | null {
  if (isFinalizedStatus(status, store)) return null;
  if (store === 'coauthor_documents' && status === 'finalized') return 'frozen, not approved';
  return status ?? whenMissing;
}

/**
 * Whether a file this server rendered may be released (P-22: only approved
 * documents are released). 2026-10-30, the CSR path sweep: an assembled clinical
 * study report ('csr_assembly', csr-assembly-run.ts) is rendered from the build
 * job's sections, not from an approved, signed document, and nothing binds an
 * assembly to one. The CSR's approval is the Authoring document's. Until a
 * binding exists, its files read as not approved here, in Validation and
 * Dispatch (leaf-document-resolver) and at freeze and transmit (the assembler
 * below). The server's own rendered forms and reports keep their own rules.
 */
export function renderedLeafNotTransmittable(renderedFrom: string | null | undefined): string | null {
  return renderedFrom === 'csr_assembly'
    ? 'an assembled clinical study report, not bound to an approved and signed CSR'
    : null;
}

/** Why an uploaded file is not released: no Vault version of its project holds these bytes approved. No ';' or ':'
 *  in it, because assembledTransmitBlockers joins items with '; ' after 'label: '. */
export const ONBOARDING_UPLOAD_NOT_APPROVED =
  'an uploaded file whose bytes no Vault version of this project has approved, so approve the same file in the Vault';
/** Why an uploaded file is not released when its approval could not be read. Fail closed. */
export const ONBOARDING_UPLOAD_APPROVAL_UNREADABLE =
  'an uploaded file whose approval in the Vault could not be checked, so it is not released';

/**
 * Whether an uploaded file (ctd_onboarding_documents) may be released, or why not. Founder decision P-94
 * (docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-11-02): "An uploaded leaf goes through the same approval as an
 * authored one ... Readiness and transmit both refuse an unapproved upload, as they do an unapproved authored
 * leaf." P-108 3(a) (2026-11-08): "An upload counts as approved when the same bytes, matched by content hash,
 * are already approved by the Vault's existing act in the same project, with no new act." The coordinating
 * session read "placed" in P-94 as "filed" (2026-11-08), so placement is unchanged.
 *
 * The store holds no approval: its status is a processing status, written 'uploaded' and never changed, and the
 * row names no uploader. The upload clears only when a current Vault version in the upload's own project
 * (ctd_onboarding_projects → projects.regulatory_program_id, the join the Builder's reader uses) holds exactly
 * these bytes and passes the Vault's own verdict for them (vaultVersionNotTransmittable). Read by the readiness
 * resolver (leaf-document-resolver) and by the assembler below, so Validation, Dispatch, freeze and transmit
 * say it in one wording.
 */
export async function onboardingUploadNotTransmittable(
  q: Parameters<typeof vaultVersionNotTransmittable>[0],
  organizationId: number,
  uploadId: number,
  uploadSha256: string | null,
): Promise<string | null> {
  if (!uploadSha256) return ONBOARDING_UPLOAD_NOT_APPROVED;
  try {
    const { rows } = await q.query(
      `SELECT v.id::text AS id
         FROM ctd_onboarding_documents d
         JOIN ctd_onboarding_projects c ON c.id = d.ctd_project_id AND c.organization_id = d.organization_id
         JOIN projects p ON p.id = c.project_id AND p.organization_id = d.organization_id AND p.deleted_at IS NULL
         JOIN vault.documents v ON v.organization_id = d.organization_id AND v.program_id = p.regulatory_program_id
                               AND v.content_hash = $3 AND v.deleted_at IS NULL
        WHERE d.id = $1 AND d.organization_id = $2 AND c.status <> 'archived'
        ORDER BY v.id LIMIT 20`,
      [uploadId, organizationId, uploadSha256],
    );
    for (const row of rows as Array<{ id: string }>) {
      if ((await vaultVersionNotTransmittable(q, organizationId, row.id, uploadSha256)) === null) return null;
    }
    return ONBOARDING_UPLOAD_NOT_APPROVED;
  } catch {
    return ONBOARDING_UPLOAD_APPROVAL_UNREADABLE;
  }
}
