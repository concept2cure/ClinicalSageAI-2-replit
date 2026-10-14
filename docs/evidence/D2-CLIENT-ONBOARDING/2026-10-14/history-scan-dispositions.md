# Exact history-scan checksum dispositions — 2026-10-14

The pinned full-history scan reproduced the same seven findings seen in the
upstream hosted job before this onboarding change. All seven are independently
verified **source-file SHA-256 checksums**, not credentials or secret fixtures.
Only their original commit/path/rule/line fingerprints were added to
`.gitleaksignore`, with dated source-proof reasons. Existing entries, including
every `status: live` history entry, are preserved unchanged.

## Reproducible provenance check

Two independent agents captured historical file contents privately with
`git show <finding-commit>:<finding-file>`, parsed each JSON digest map, and
located the value at the reported finding line. Each entry contains exactly one
64-character hexadecimal checksum. Each reviewer then captured the referenced
source with `git show <finding-commit>:<source-file>`, computed SHA-256 over those
exact bytes, and compared the result privately. All seven comparisons matched.
No values, `Secret`, or `Match` fields were printed or copied into evidence.

The control-tower agent independently repeated all seven computations as a
third confirmation. Its safe result is recorded in
[history-scan-root-verification.json](history-scan-root-verification.json).

The exact safe fingerprints and per-source classifications are in
`history-scan-safe-metadata.json`. Its fields contain only rule, finding file,
commit, fingerprint, and classification/provenance text.

| Finding commit | Finding file suffix under `docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/` | Line | Referenced source whose bytes reproduce the checksum |
| --- | --- | --- | --- |
| `6095ed7a13a982933348a2f3eab99a00d16b8295` | `integration/browser-final/source-digests.json` | 19 | `client/src/concept2cure/lineage/dataOriginsApi.ts` |
| `83fe486112450a3508dfbf4fbe49e5bb77b9478f` | `project-vault-parent-access/native-probe-source-digests.json` | 12 | `docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/project-vault-parent-access/native-parent-access.probe.ts` |
| `83fe486112450a3508dfbf4fbe49e5bb77b9478f` | `project-vault-parent-access/native-probe-source-digests.json` | 17 | `server/services/c2c/program-access.ts` |
| `83fe486112450a3508dfbf4fbe49e5bb77b9478f` | `project-vault-parent-access/native-probe-source-digests.json` | 19 | `server/services/report-os/project-access.ts` |
| `83fe486112450a3508dfbf4fbe49e5bb77b9478f` | `project-vault-parent-access/native-probe-source-digests.json` | 20 | `server/services/ana/uploaded-file-access.ts` |
| `83fe486112450a3508dfbf4fbe49e5bb77b9478f` | `protocol-finalization/native-source-digests.json` | 26 | `server/auth.ts` |
| `0e4ccf46f437af463a52f580c0775c8f4f02197f` | `integration/ci-followup-38463370149/manifest.json` | 59 | `server/middleware/__tests__/delegated-credential-scope.dbtest.ts` |

The last manifest declares a pending workflow bridge: its referenced source was
changed in the manifest's own commit. The recorded checksum matches that
commit's source, rather than the parent or older `publishedCommit`. This
qualification explains source provenance; it does **not** claim that a prior
hosted test executed against the later revision.

## Scanner and boundary

The scanner is the checksum-verified Go module
`github.com/zricethezav/gitleaks/v8@v8.28.0`, matching the hosted workflow pin.
The scratch compiler is Go 1.24.6, verified against its official published
archive checksum. Neither compiler nor scanner was added to repository or
production dependencies.

The canonical branch's full history was fetched with blob filtering. Missing
canonical-history objects were materialized in one read-only fetch before the
successful scan; no branch or history was rewritten. Captured scan head:
`342ffc8d0d6465a85942518da59a1d01e45c6aa4`; 13,940 commits are reachable.

Exact command (the commit names the captured `HEAD`; scanner/filter/config
semantics are the hosted command):

```sh
/workspace/scratch/gitleaks-audit/bin/gitleaks git \
  --no-banner --redact=100 --config .gitleaks.toml \
  --log-opts='--full-history --diff-filter=tuxdb 342ffc8d' \
  --report-format=json \
  --report-path=/workspace/scratch/gitleaks-audit/full-history-findings.json .
```

Before dispositions: exit **1**, exactly **7** findings, completed in **164.68
seconds**. The isolated onboarding commit-range scan had already returned exit
0 with zero findings. After the seven exact dispositions, the same pinned
full-history scan returned exit **0**, **0** findings, in **217.08 seconds**.
The post-disposition command differs only in its private report destination,
`/workspace/scratch/gitleaks-audit/post-dispositions-findings.json`.
Safe command, counts, timestamps, and preservation checks are recorded in
[history-scan-verification.json](history-scan-verification.json).

This verification covers the captured history and working-tree fingerprint
dispositions. The control-tower session owns the final committed evidence and
disposition verification through a commit-range or hosted scan.

No scanner rule, entropy threshold, file-path allowlist, or live-history status
was changed. New findings remain blocking, including new checksum entries at
different fingerprints. No credential was tested, revoked, or used. These
dispositions do not assert that previously recorded live credentials have been
rotated; their existing ownership and remediation records remain intact.
