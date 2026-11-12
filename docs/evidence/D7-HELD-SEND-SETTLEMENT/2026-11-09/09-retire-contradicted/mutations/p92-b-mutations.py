"""P-92 §10.5 B mutations: each is applied alone, its own case is run, the file is restored (cmut2.py). Run from the repo root."""
import subprocess, sys, os
SP = os.path.dirname(os.path.abspath(__file__))
B = 'server/services/submission-service/filed-sequence-baseline.ts'
SR = 'server/services/submission-service/__tests__/sequence-retirement.pglite.test.ts'
KEPT = 'the act refuses it in those words'
M = [
 ('B1-contradiction-ignored', B, SR, KEPT + '|later sequence is the one', "             OR EXISTS (SELECT 1 FROM jsonb_array_elements(", "             OR false AND EXISTS (SELECT 1 FROM jsonb_array_elements("),
 ('B2-unverified-entry-keeps', B, SR, 'not verified', "WHERE e->>'contradicts' = 'not-received' AND e->>'verified' = 'true'))", "WHERE e->>'contradicts' = 'not-received'))"),
 ('B3-wrong-pair', B, SR, KEPT, "WHERE e->>'contradicts' = 'not-received' AND e->>'verified' = 'true'))", "WHERE e->>'contradicts' = 'received' AND e->>'verified' = 'true'))"),
 ('B4-sentence-dropped', B, SR, KEPT, "  if (f.productionSend?.receivedAfterRelease) {", "  if (f.productionSend?.receivedAfterRelease && false) {"),
 ('B5-flag-not-read', B, SR, KEPT + '|later sequence is the one', "receivedAfterRelease: rows[0].released === true };", "receivedAfterRelease: false };"),
 ('B6-every-release-keeps', B, SR, 'still not a bound production send', "        AND (COALESCE(t.metadata->'heldSendSettlement'->>'outcome', '') <> 'not-received'\n", "        AND (true\n"),
]
for m in M:
    subprocess.run([sys.executable, os.path.join(SP, 'cmut2.py'), *m], check=False)
