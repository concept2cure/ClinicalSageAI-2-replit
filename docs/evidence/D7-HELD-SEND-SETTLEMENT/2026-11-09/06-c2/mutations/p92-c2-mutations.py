"""P-92 C2 mutations: each applied alone, its own case run, the file restored (cmut2.py). Run from the repo root."""
import subprocess, sys, os
SP = os.path.dirname(os.path.abspath(__file__))
W = 'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx'
C = 'client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx'
F = 'client/src/concept2cure/v2/surfaces/FiledElsewhereBaseline.tsx'
G = 'client/src/concept2cure/v2/gatewayLabels.ts'
T = 'client/src/concept2cure/v2/__tests__/dispatchHeldSend.test.tsx'
GT = 'client/src/concept2cure/v2/__tests__/gatewayTransmittalsReadOnly.test.tsx'
DT = 'client/src/concept2cure/v2/__tests__/dossierTransmissions.test.tsx'
FT = 'client/src/concept2cure/v2/__tests__/filedElsewhereBaseline.test.tsx'
M = [
 ('C2M1-client-copy-of-statement', C, T, "signs the server", "    evidence: f.heldSend.evidence, statement: f.statement,", "    evidence: f.heldSend.evidence, statement: 'Released by signature.',"),
 ('C2M2-approval-offered', C, T, "signs the server", "    meanings: ['responsibility'],\n    renderMeaningDetails: () => (\n      <div className=\"sc-mb\" data-testid=\"held-send-statement\">", "    meanings: ['responsibility', 'approval'],\n    renderMeaningDetails: () => (\n      <div className=\"sc-mb\" data-testid=\"held-send-statement\">"),
 ('C2M3-record-key-in-target-line', C, T, "signs the server", "; nothing is sent to FDA`,", "; nothing is sent to FDA · ectd-sequence:${flow.seq.id}`,"),
 ('C2M4-any-200-settled', C, T, "is not a success", "if (done.data?.settled !== true || done.data.sequenceId !== f.seq.id || done.data.outcome !== outcome) {", "if (false) {"),
 ('C2M5-statement-not-asked-again', C, T, "changed after the dialog opened", "    if (f.kind === 'held-send-settlement' && again.statement !== f.statement) throw new Error(STATEMENT_CHANGED);\n", ""),
 ('C2M6-door-for-any-status', W, T, "there is no door while", "{t.dispatchStatus === 'transmitting' && <HeldSendSettlement", "{t.dispatchStatus !== 'never' && <HeldSendSettlement"),
 ('C2M7-record-key-in-refusal-line', W, T, "never shows a record key", "Transmit is not available: {clause(blockerForDisplay(blockedBy))}.", "Transmit is not available: {clause(blockedBy)}."),
 ('C2M8-declare-reads-as-text', F, FT, "hairline secondary", "className=\"btn ghost\" onClick={() => setOpen(true)}", "className=\"sc-btn\" onClick={() => setOpen(true)}"),
 ('C2M9-contradiction-not-said', G, GT, "held send settled by signature", "  const kept = (m?.as2ReceiptHistory ?? []).find((e) => e?.verified === true && e.contradicts === s.outcome);", "  const kept = undefined as KeptReceipt | undefined;"),
 ('C2M10-proof-asks-for-a-document', W, T, "platform's own proof", "outcome === 'received' ? null : proof ? 'platform-proof' : 'fda-non-receipt-confirmation');", "outcome === 'received' ? null : 'fda-non-receipt-confirmation');"),
 ('C2M11-creator-offered-a-way', W, T, "creator is told", "      {h.signerRefusal ? <p role=\"note\">{blockerForDisplay(h.signerRefusal)}</p> : (", "      {false ? <p role=\"note\">{blockerForDisplay(h.signerRefusal ?? '')}</p> : ("),
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
