"""P-92 C1 mutations: each is applied alone, its own case is run, the file is restored (cmut2.py). Run from the repo root."""
import subprocess, sys, os
SP = os.path.dirname(os.path.abspath(__file__))
F = 'server/services/submission-gateways/fda-esg-receipts.ts'
S = 'server/services/submission-service/submission-service.ts'
B = 'server/services/submission-service/filed-sequence-baseline.ts'
RO = 'server/routes/submissions.ts'
AT = 'server/services/ana/AnaToolDefinitions.ts'
T = 'server/services/submission-service/__tests__/held-send-settlement.pglite.test.ts'
R = 'server/services/submission-gateways/__tests__/fda-esg-receipts.pglite.test.ts'
RT = 'server/routes/__tests__/submissions-held-send-settlement.test.ts'
SR = 'server/services/submission-service/__tests__/sequence-retirement.pglite.test.ts'
RV = 'server/services/submission-service/__tests__/released-send-resend-hold.pglite.test.ts'
AN = 'server/services/ana/__tests__/ana-cannot-settle-held-send.test.ts'
CHECK4 = "        AND NOT (COALESCE(new_values::jsonb->>'source', '') = 'held-send-settlement' AND COALESCE(new_values::jsonb->>'status', '') = 'not-received')\n"
E6 = "if (Date.parse(String(meta.created_at)) < Date.parse(t.submittedAt) || reused.rows.length) {"
M = [
 ('M01-release-does-not-spend-S', S, T, 'T1 received|T3 released', "        await rules.spendTransmitSignature(asQueryable(client), {", "        if (Date.now() < 0) await rules.spendTransmitSignature(asQueryable(client), {"),
 ('M02-E1-legacy-claim-settled', F, T, 'E1', "  if (!f.sequence.transmitSignatureActionId || !f.sequence.transmitAttemptId) {", "  if (false) {"),
 ('M03-E2-two-bound-rows-read-as-one', F, T, 'E2', "if (bound.length > 1) throw", "if (bound.length > 99) throw"),
 ('M04-E3-test-environment-settled', F, T, 'E3', "if (t.environment === 'staging' || t.as2Environment === 'staging') return", "if (false) return"),
 ('M05-E4-kept-answer-ignored', F, T, 'E4', "if (t.status === 'received' || t.verifiedReceipt || !['pending', 'in_transit', 'rejected'].includes(t.status)) {", "if (false) {"),
 ('M06-E5-send-in-progress-settled', F, T, 'may still be in progress', "  if (!ended(t, f.now)) {", "  if (false) {"),
 ('M07-E5b-received-without-leaving', F, T, 'E5b|received is refused', "  if (t.transport !== 'as2' || !t.as2MessageId || t.status === 'pending') {", "  if (false) {"),
 ('M08-E5b-4xx-refusal-received', F, T, 'E5b', "  if (t.status === 'rejected' && t.httpStatus !== null && t.httpStatus >= 400 && t.httpStatus < 500) {", "  if (false) {"),
 ('M09-E6-other-project-document', S, T, 'another project', "|| meta?.program_id !== program) {", ") {"),
 ('M10-E6-document-older-than-send', S, T, 'before the send was made', E6, "if (reused.rows.length) {"),
 ('M11-E6-document-reused', S, T, 'settled another send', E6, "if (Date.parse(String(meta.created_at)) < Date.parse(t.submittedAt)) {"),
 ('M12-E7-kind-not-fitted', F, T, 'E7', "  return fits ? null : \"An Ack2", "  return true ? null : \"An Ack2"),
 ('M13-E8-creator-not-told', S, T, 'creator is told', "  if (state === 'author') return `You created", "  if (state === ('nobody' as string)) return `You created"),
 ('M14-E8-any-meaning', S, T, 'meaning is responsibility only', "(m === 'responsibility' ? null : 'settling a held send", "(m !== '' ? null : 'settling a held send"),
 ('M15-T5-statement-not-compared', S, T, 'altered by one character', "|| signed?.statement !== judged.statement) {", ") {"),
 ('M16-proof-not-compared-to-transport', S, T, 'never takes', "if (fields.some(([key, value]) => evidence[key] !== value) || signed?.statement", "if (signed?.statement"),
 ('M17-T5-other-attempt', S, T, 'another attempt', "if (String(payload.transmitAttemptId ?? '').toLowerCase() !== String(seq.transmitAttemptId ?? '').toLowerCase()) return", "if (false) return"),
 ('M18-T9-settlement-not-spending', S, T, 'T9', "${ECTD_SEQUENCE_RETIRED_ACTION}, ${ECTD_HELD_SEND_SETTLED_ACTION})", "${ECTD_SEQUENCE_RETIRED_ACTION})"),
 ('M19-2a-check3-keeps-release', B, T, 'can be retired', "        AND COALESCE(t.metadata->'heldSendSettlement'->>'outcome', '') <> 'not-received'\n", ""),
 ('M20-2a-check4-keeps-release', B, T, 'can be retired', CHECK4, ""),
 ('M21-check4-null-unsafe', B, SR, 'before sends carried a binding', CHECK4, "        AND NOT (new_values::jsonb->>'source' = 'held-send-settlement' AND new_values::jsonb->>'status' = 'not-received')\n"),
 ('M22-T7-contradiction-not-kept', F, R, 'late FDA receipt', "      await keepContradictingReceipt(client, args, current, { sha256, status, messageId: binding.messageId, history });\n", ""),
 ('M23-T7-repeat-written-again', F, R, 'late FDA receipt', "if (history.some((entry: { sha256?: string; contradicts?: string }) => entry?.sha256 === sha256 && entry.contradicts)) {", "if (false) {"),
 ('M24-T7-agreeing-refusal-contradicts', F, R, 'agrees with it', "if (outcome === 'not-received' && status === 'received') return 'not-received';", "if (outcome === 'not-received') return 'not-received';"),
 ('M25-resend-hold-never-said', F, R, 'holds the resend', "  if (s?.outcome !== 'not-received') return null;", "  return null;"),
 ('M26-readiness-hold-dropped', S, RV, 'before anyone signs; a release', "  return resendRefusal(seq.dispatchStatus) ?? (await releasedSendHold(asQueryable(pool), organizationId, seq.id, seq.sequenceNumber));", "  return resendRefusal(seq.dispatchStatus);"),
 ('M27-claim-hold-dropped', S, RV, 'refused at the claim', "    if (releasedHold) throw new SubmissionError('DISPATCH_BLOCKED', releasedHold);\n", ""),
 ('M28-route-precheck-not-dispatched', RO, RT, 'never to precheckGovernedStep', "    if (parsed.data.step === 'held-send-settlement') {", "    if (false) {"),
 ('M29-door-any-outcome', RO, RT, 'refuses a body', "outcome: z.enum(HELD_SEND_OUTCOMES) });", "outcome: z.string() });"),
 ('M30-A2-size-sentence-dropped', F, T, 'A.2', "  const over = p.bundleSizeBytes !== null && p.bundleSizeBytes > LAUNCH_SEQUENCE_MAX_BYTES ? launchSequenceSizeRefusal(p.bundleSizeBytes) : null;", "  const over = null as string | null;"),
 ('M31-E9-identity-ignored', F, T, 'formed its message', "  if (t.transport === 'as2') return t.as2MessageId ? null : 'no-as2-message';", "  if (t.transport === 'as2') return 'no-as2-message';"),
 ('M32-E9prime-transmission-id-ignored', F, T, 'gateway message id', "!t.hasReceipt && !t.transmissionId && ", "!t.hasReceipt && "),
 ('M33-T3-release-rolled-back', S, T, 'T3 released', "const toStatus = input.outcome === 'not-received' ? 'rejected' :", "const toStatus = input.outcome === 'not-received' ? 'rolled_back' :"),
 ('M34-T2-ack3-not-acknowledged', S, T, 'T2 received on an Ack3', "choice.evidenceKind === 'ack3' ? 'ack3_received' : 'ack2_received'", "'ack2_received'"),
 ('M35-ana-reaches-the-act', AT, AN, 'no AnA or MCP source', "export const ALL_ANA_TOOLS_RAW: AnaTool[] = [", "// settleHeldSend( would be reached here\nexport const ALL_ANA_TOOLS_RAW: AnaTool[] = ["),
]
if __name__ == '__main__':
    only = set(sys.argv[1:])
    for name, path, test, filt, a, b in M:
        n = open(path).read().count(a)
        if n != 1:
            print(f'ANCHOR {name}: {n} occurrences in {path}'); continue
        if '--check' in only: continue
        if only and name not in only: continue
        subprocess.run([sys.executable, os.path.join(SP, 'cmut2.py'), name, path, test, filt, a, b])
    print('done')
