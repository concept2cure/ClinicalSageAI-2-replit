# Exact incoming fixture checksum dispositions

Gitleaks 8.28.0 scanned all history through the human-review feature commit
`404e94efc2b23c691f7adbf1efb792fd2fe796e1`: 10,236 commits, no findings with
the existing reviewed exceptions. The subsequent merge adds editor commit
`4c5546cec14303fcc3b4a5b1338dcd996f3180d4` and its health report.

The initial scan of this new range reported three `generic-api-key` fingerprints
in the editor's `template-oversight/browser-summary.json`, at lines 22, 27 and 32.
All three values are SHA-256 checksums of the exact original committed fixture
bytes. Two refer to `browser-eval-fixture/api-contract.json` (39,567 bytes); one
to `browser-eval-fixture/mock-api.mjs` (3,448 bytes). The producer hashes raw
file buffers and records synthetic browser fixture content pins.

The lead and an independent reviewer recomputed every value directly from
original Git objects and inspected the producer. Their exact-field, source and
fingerprint proof is retained in [lead-checksum-verification.json](lead-checksum-verification.json)
and [independentchecks.json](independentchecks.json). These are content digests,
not authentication credentials.

Only these three exact commit/path/rule/line fingerprints are added to the
existing `.gitleaksignore`. No scanner rule or path is suppressed. The new range
and staged release metadata are scanned again with redacted reports; final
observed results are recorded in [release verification](../release-verification.json).

The completed hosted full-history job for published source `5a7c0ae09` scanned
all 10,240 commits (656,915,605 bytes) and found no leaks. The GitHub App fetched
both its completed success status and decoded summary. Exact source, run, job
and counts are retained in [hosted-scan-result.json](hosted-scan-result.json).
