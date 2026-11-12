"""P-92 C3 mutations: each applied alone, its own case run, the file restored by SHA-256 (cmut2.py). Run from the repo root."""
import subprocess, sys, os
SP = os.path.dirname(os.path.abspath(__file__))
F = 'server/services/submission-gateways/fda-esg-receipts.ts'
S = 'server/services/submission-service/submission-service.ts'
RO = 'server/routes/submissions.ts'
T = 'server/services/submission-service/__tests__/held-send-reopen.pglite.test.ts'
RT = 'server/routes/__tests__/submissions-held-send-reopen.test.ts'
W = 'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx'
C = 'client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx'
L = 'client/src/concept2cure/v2/gatewayLabels.ts'
CT = 'client/src/concept2cure/v2/__tests__/dispatchHeldSendReopen.test.tsx'
DT = 'client/src/concept2cure/v2/__tests__/dossierTransmissions.test.tsx'
M = [
 ('C3M01-release-reopened-after-resend', F, T, 'sent again', "  if (where) return null;\n", "  if (where || true) return null;\n"),
 ('C3M02-reopened-twice', F, T, 'nothing to re-open', "  const open = rows.filter((r) => !r.metadata?.heldSendSettlement?.reopenedBy && keptAnswerOf(r.metadata ?? {}));", "  const open = rows.filter((r) => keptAnswerOf(r.metadata ?? {}));"),
 ('C3M03-statement-not-compared', S, T, 'word for word', "  if (signed?.statement !== statement) {\n    throw new SubmissionError('GOVERNED_REQUIRED', `The signature does not re-open this settlement", "  if (false) {\n    throw new SubmissionError('GOVERNED_REQUIRED', `The signature does not re-open this settlement"),
 ('C3M04-any-settlement', S, T, 'another settlement', "    if (payload?.settlementSignatureActionId !== facts.settled?.settlement.signatureActionId) return `it names another settlement of sequence ${n}`;\n", ""),
 ('C3M05-any-answer', S, T, 'another FDA answer', "    if (payload?.receiptSha256 !== facts.settled?.answer.sha256) return \"it names another of FDA's answers\";\n", ""),
 ('C3M06-any-meaning', S, T, 'another meaning', "  [HELD_SEND_REOPEN_INTENT]: (m) => (m === 'responsibility' ? null : 're-opening a settlement is signed with the meaning responsibility'),", "  [HELD_SEND_REOPEN_INTENT]: () => null,"),
 ('C3M07-not-rejudged-under-lock', S, T, 'judged again under the lock', "            reopenableNow(rules, await checkedReopen(rules, q, now, ctx.organizationId), signed);", "            void now;"),
 ('C3M08-signature-not-spent', S, T, 'a release FDA received', "${ECTD_TECHNICAL_REJECTION_RECORDED_ACTION},\n                     ${ECTD_HELD_SEND_REOPENED_ACTION})", "${ECTD_TECHNICAL_REJECTION_RECORDED_ACTION})"),
 ('C3M09-claim-not-restored', S, T, 'a release FDA received', "    ? { text: `UPDATE ectd_sequences SET dispatch_status = 'sent', transmit_signature_action_id = $3, transmit_attempt_id = $4::uuid, updated_at = NOW()", "    ? { text: `UPDATE ectd_sequences SET dispatch_status = 'sent', updated_at = NOW()"),
 ('C3M10-receipt-not-applied', F, T, 'a release FDA received', "            mdn_raw = COALESCE($6::text, mdn_raw),", "            mdn_raw = mdn_raw,"),
 ('C3M11-reopened-not-marked', F, T, 'both records stay', "            metadata = jsonb_set(metadata || jsonb_build_object('as2Receipt', $4::jsonb), '{heldSendSettlement,reopenedBy}', $5::jsonb),", "            metadata = metadata || jsonb_build_object('as2Receipt', $4::jsonb),"),
 ('C3M12-route-precheck-generic', RO, RT, 'own function', "    if (parsed.data.step === 'held-send-reopen') return res.json(await precheckHeldSendReopen(seqId, ctx));", "    if (parsed.data.step === ('never' as string)) return res.json(await precheckHeldSendReopen(seqId, ctx));"),
 ('C3M13-door-after-reopen', L, CT, 'no door', "  if (!s || s.reopenedBy || m?.dispatchBinding?.sequenceId !== sequenceId) return false;", "  if (!s || m?.dispatchBinding?.sequenceId !== sequenceId) return false;"),
 ('C3M14-door-any-sequence', L, CT, 'no door', "  if (!s || s.reopenedBy || m?.dispatchBinding?.sequenceId !== sequenceId) return false;", "  if (!s || s.reopenedBy) return false;"),
 ('C3M15-creator-offered-a-sign', W, CT, 'creator', "      {o && (o.signerRefusal ? <div role=\"note\">{blockerForDisplay(o.signerRefusal)}</div> : (", "      {o && (false ? <div role=\"note\">{blockerForDisplay(o.signerRefusal ?? '')}</div> : ("),
 ('C3M16-statement-not-asked-again', C, CT, 'changed after the dialog opened', "const STATED_KINDS: ReadonlySet<GovernedKind> = new Set<GovernedKind>(['held-send-settlement', 'technical-rejection', 'held-send-reopen']);", "const STATED_KINDS: ReadonlySet<GovernedKind> = new Set<GovernedKind>(['held-send-settlement', 'technical-rejection']);"),
 ('C3M17-any-200-reopened', C, CT, 'not the re-opening', "      if (done.data?.reopened !== true || done.data.sequenceId !== f.seq.id) {", "      if (done.data?.reopened !== true) {"),
 ('C3M18-payload-without-what-it-names', C, CT, 're-opens; no record key', "          ...settlementFields(f), ...rejectionFields(f), ...reopenFields(f),", "          ...settlementFields(f), ...rejectionFields(f),"),
 ('C3M19-reopened-words-dropped', L, DT, 're-opened on FDA', "  s.reopenedBy ? ` · re-opened on FDA's answer, by signature, ${heldSendDay(s.reopenedBy.at ?? null) ?? 'an unrecorded day'}` : '';", "  '';"),
]
M = [m for m in M if m[0][:5] in ('C3M08', 'C3M09', 'C3M10')]
for m in M:
    subprocess.run([sys.executable, os.path.join(SP, 'cmut2.py'), *m], check=False)
