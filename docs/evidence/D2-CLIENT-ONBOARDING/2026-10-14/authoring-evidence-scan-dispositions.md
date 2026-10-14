# Exact authoring-evidence scan dispositions — 2026-10-14

The additional upstream range introduced 12 `generic-api-key` detections at
commit `49dba3d214da2f50872d2c7b889a7abb8fc82678`. Two independent reviewers
verified all 12 as four artifact SHA-256 checksums and eight static regulatory
prose spans. They occupy nine exact commit/path/rule/line fingerprints; four
catalogue occurrences share one line-1 fingerprint. Exactly those nine
fingerprints were appended to `.gitleaksignore` with dated source-proof reasons.

The existing ignore content, including the previous seven checksum dispositions
and every live-history entry, is preserved byte for byte. `.gitleaks.toml` is
unchanged. There are no file-path or scanner-rule exceptions.

## Historical proof

All proof uses source bytes from the original finding commit, rather than
later revisions of the evidence. Private captures were independently checked
against that commit's Git blob identities. No finding values, `Secret`, or
`Match` fields appear in the published metadata.

The four `apiContractSha256` properties match SHA-256 of the exact historical
`docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/ind-templates/browser-eval-fixture/api-contract.json`
blob. Both reviewers recomputed all four; the control-tower session independently
confirmed them again in
[authoring-evidence-root-checksums.json](authoring-evidence-root-checksums.json).

| Finding file suffix under `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/ind-templates/` | Finding line | Classification and provenance |
| --- | --- | --- |
| `browser-before-canonical-sync/browser-final-checks.json` | 3 | Verified `apiContractSha256` artifact checksum |
| `browser-before-canonical-sync/browser-summary.json` | 5 | Verified `apiContractSha256` artifact checksum |
| `browser-final-checks.json` | 3 | Verified `apiContractSha256` artifact checksum |
| `browser-summary.json` | 5 | Verified `apiContractSha256` artifact checksum |
| `browser-eval-fixture/api-contract.json` | 10167 | Static `guidance_text` span in canonical authoring guidance |
| `browser-eval-fixture/api-contract.json` | 28292 | Static `guidance_text` span in canonical authoring guidance |
| `browser-eval-fixture/api-contract.json` | 29293 | Static `guidance_text` span in canonical authoring guidance |
| `browser-eval-fixture/api-contract.json` | 51945 | Static `guidance_text` span in canonical authoring guidance |
| `browser-fixture/catalogue.json` | 1 | Four static regulatory reference, checklist, and guidance prose occurrences |

Seven of the eight prose detections match static text in the same commit's
`server/services/ind/ctd/authoring-guidance.ts`. The remaining catalogue span
crosses adjacent JSON scalar values. After excluding JSON property keys, its
two decoded regulatory-reference values independently match
`services/regulatory/ind-ectd-sections.ts:878` and
`server/services/ind/ctd/authoring-guidance.ts:3359`. This proves their static
regulatory provenance without treating a joined JSON span as one credential.

[authoring-evidence-scan-safe-metadata.json](authoring-evidence-scan-safe-metadata.json)
records the nine exact fingerprints and each of the 12 occurrence proofs using
only rule, file, commit, fingerprint, and classification fields.

## Pinned additional-range scan

The scanner module remains `github.com/zricethezav/gitleaks/v8@v8.28.0`.
The frozen range contains five upstream-only commits: four nonmerge commits
and one merge. The range is a Git reachable-set difference; its start is not an
ancestor of its end.

```sh
/workspace/scratch/gitleaks-audit/bin/gitleaks git \
  --no-banner --redact=100 --config .gitleaks.toml \
  --log-opts='--full-history --diff-filter=tuxdb e33e0ef9f7500524686c66735a14fb1c2ecaa889..fe25455371c13759531f81cbdd8be21b6d1c6869' \
  --report-format=json \
  --report-path=/workspace/scratch/gitleaks-audit/upstream-fe2545537-range-findings.json .
```

Before dispositions: exit **1**, **12** detections, **9** unique fingerprints,
in **10.64 seconds**. After the exact nine working-tree dispositions, the same
frozen range returned exit **0**, **0** findings, in **11.34 seconds**. Both
scans processed four nonmerge commits. The post-disposition command differs
only in its private report destination,
`/workspace/scratch/gitleaks-audit/upstream-fe2545537-post-dispositions-findings.json`.
Safe final results and preservation checks are recorded in
[authoring-evidence-scan-verification.json](authoring-evidence-scan-verification.json).

The prior full-history verification remains unchanged. This additional-range
verification covers the newly reachable upstream commits with the preserved
configuration and dispositions. The control-tower session owns final committed
merge-range and hosted verification. No credential was used or tested, and no
history was rewritten.
