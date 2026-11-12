"""P-92 C4 mutations: each applied alone, its own case run, the file restored by SHA-256 (cmut2.py). Run from the repo root."""
import subprocess, sys, os
SP = os.path.dirname(os.path.abspath(__file__))
R = 'server/services/ectd/filed-sequence-rejection.ts'
S = 'server/services/submission-service/submission-service.ts'
B = 'server/services/submission-service/filed-sequence-baseline.ts'
RO = 'server/routes/submissions.ts'
T = 'server/services/submission-service/__tests__/technical-rejection.pglite.test.ts'
RT = 'server/routes/__tests__/submissions-technical-rejection.test.ts'
SR = 'server/services/submission-service/__tests__/sequence-retirement.pglite.test.ts'
W = 'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx'
C = 'client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx'
G = 'client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx'
L = 'client/src/concept2cure/v2/gatewayLabels.ts'
CT = 'client/src/concept2cure/v2/__tests__/dispatchTechnicalRejection.test.tsx'
GT = 'client/src/concept2cure/v2/__tests__/gatewayTransmittalsReadOnly.test.tsx'
DT = 'client/src/concept2cure/v2/__tests__/dossierTransmissions.test.tsx'
M = [
 ('C4M01-R1-any-status', R, T, 'R1-R3', "  if (status === 'sent') return null;\n", "  if (status !== null || true) return null;\n"),
 ('C4M02-R2-unbound-claim-recorded', R, T, 'no claim', "  if (!f.sequence.transmitSignatureActionId || !f.sequence.transmitAttemptId) {\n    return `Sequence ${n}'s send was recorded before", "  if (false) {\n    return `Sequence ${n}'s send was recorded before"),
 ('C4M03-R3-acceptance-ignored', R, T, "center accepted", "  if (ACCEPTANCE_STATUSES.has(t.status)) {\n    return `FDA's center is recorded as accepting", "  if (false) {\n    return `FDA's center is recorded as accepting"),
 ('C4M04-R4-later-ignored', R, T, 'R4', "  if (f.laterInUse) {", "  if (false) {"),
 ('C4M05-R7-refusal-pending-ignored', R, T, 'R7', "  if (f.refusalPending) {", "  if (false) {"),
 ('C4M06-R5-other-project', S, T, "another project", "  if (!doc || !/^[0-9a-f]{64}$/i.test(doc.contentHash) || meta?.program_id !== program) return { refusal: absent };", "  if (!doc || !/^[0-9a-f]{64}$/i.test(doc.contentHash)) return { refusal: absent };"),
 ('C4M07-R5-older-than-send', S, T, 'older than the send', "  if (Date.parse(String(meta.created_at)) < Date.parse(sentAt)) {\n    return { refusal: `This document was in the Vault before this send was made, so it cannot be FDA's Ack3", "  if (false) {\n    return { refusal: `This document was in the Vault before this send was made, so it cannot be FDA's Ack3"),
 ('C4M08-R5-reused', S, T, 'already settled the send', "  if (reused.rows.length) return { refusal: `This document already settled or rejected", "  if (false) return { refusal: `This document already settled or rejected"),
 ('C4M09-bytes-changed-not-said', S, T, 'bytes changed', "  if (evidence.vaultDocumentId === judged.evidence.vaultDocumentId && evidence.sha256 !== judged.evidence.sha256) {", "  if (false) {"),
 ('C4M10-statement-not-compared', S, T, 'word for word', "  if (fields.some(([key, value]) => evidence[key] !== value) || signed?.statement !== judged.statement) {\n    return `The signature does not record this technical rejection", "  if (fields.some(([key, value]) => evidence[key] !== value)) {\n    return `The signature does not record this technical rejection"),
 ('C4M11-kind-not-checked', S, T, 'another kind of evidence', "    if ((payload?.evidence as Record<string, unknown> | undefined)?.kind !== 'ack3') return \"its evidence is not FDA's Ack3\";\n", ""),
 ('C4M12-any-meaning', S, T, 'another meaning', "  [TECHNICAL_REJECTION_INTENT]: (m) => (m === 'responsibility' ? null : 'recording a technical rejection is signed with the meaning responsibility'),", "  [TECHNICAL_REJECTION_INTENT]: () => null,"),
 ('C4M13-not-rejudged-under-lock', S, T, 'judged again under the lock', "            await recordableRejection({ rules, q, seq: now, organizationId: ctx.organizationId, lock: true }, fresh, documentId, signed);", "            void fresh;"),
 ('C4M14-signature-not-spent', S, T, 'T1', "${ECTD_HELD_SEND_SETTLED_ACTION}, ${ECTD_TECHNICAL_REJECTION_RECORDED_ACTION})", "${ECTD_HELD_SEND_SETTLED_ACTION})"),
 ('C4M15-route-precheck-generic', RO, RT, 'own function', "    if (parsed.data.step === 'technical-rejection') {", "    if (parsed.data.step === ('never' as string)) {"),
 ('C4M16-p86-rejected-sentence-dropped', B, SR, 'a sequence FDA rejected', "  if (f.dispatchStatus === 'rejected') {", "  if (f.dispatchStatus === ('never' as string)) {"),
 ('C4M17-door-any-region', W, CT, 'no door', "t.dispatchStatus === 'sent' && t.route.ok && t.route.region === 'fda' && <TechnicalRejection", "t.dispatchStatus === 'sent' && t.route.ok && <TechnicalRejection"),
 ('C4M18-creator-offered-a-document', W, CT, 'creator', "          {o.signerRefusal\n", "          {false\n"),
 ('C4M19-statement-not-asked-again', C, CT, 'changed after the dialog opened', "    if ((f.kind === 'held-send-settlement' || f.kind === 'technical-rejection') && again.statement !== f.statement) throw new Error(STATEMENT_CHANGED);", "    if (f.kind === 'held-send-settlement' && again.statement !== f.statement) throw new Error(STATEMENT_CHANGED);"),
 ('C4M20-any-200-recorded', C, CT, 'not the record', "      if (done.data?.recorded !== true || done.data.sequenceId !== f.seq.id) {", "      if (done.data?.recorded !== true) {"),
 ('C4M21-payload-without-ack3', C, CT, 'records; no record key', "          ...settlementFields(f), ...rejectionFields(f),", "          ...settlementFields(f),"),
 ('C4M22-note-unreadable', G, GT, 'readably', "  return <div data-testid=\"technical-rejection-note\" style={{ fontSize: 11, color: 'var(--text-300)' }}>{words}</div>;", "  return <div data-testid=\"technical-rejection-note\" style={{ fontSize: 11, color: 'var(--muted, inherit)' }}>{words}</div>;"),
 ('C4M23-package-form-unscoped', G, GT, 'package form', "  sub: 'Only for a package transmittal written before 2026-10-17. Every send since is a sequence\\'s: record its technical '\n     + 'rejection from that sequence\\'s Dispatch tab. For a package: only for", "  sub: 'Only for"),
 ('C4M25-error-message-written-again', R, T, 'T1', "        SET status = $3::text,\n            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('technicalRejection', $4::jsonb),", "        SET status = $3::text, error_message = 'Technical rejection recorded.',\n            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('technicalRejection', $4::jsonb),"),
 ('C4M24-row-words-dropped', L, DT, 'technical rejection recorded by signature', "  if (r.evidence?.kind === 'ack3') return style === 'row'", "  if (r.evidence?.kind === ('never' as string)) return style === 'row'"),
]
for m in M:
    subprocess.run([sys.executable, os.path.join(SP, 'cmut2.py'), *m], check=False)
