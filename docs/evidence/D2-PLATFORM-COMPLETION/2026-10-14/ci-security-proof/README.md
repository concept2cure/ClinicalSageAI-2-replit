# Historical digest findings and current CI triage

The seven new full-history `generic-api-key` findings are proven source-file
SHA-256 checksums. `.gitleaksignore` appends **only their seven original
commit/path/rule/line fingerprints**. No scanner rule, broad exclusion, CI
baseline, source evidence or historical commit was changed.

The proof reads each finding's original manifest with `git show`, selects its
exact recorded line, and recomputes SHA-256 from the named source file's exact
bytes at the same historical commit. All seven match. The two manifests with
explicit `head`/`baseCommit` source pins also match those captured revisions.
The older `publishedCommit` in the CI follow-up manifest identifies the run
being investigated; it is not substituted for that evidence's source capture.

[digest-proof.json](digest-proof.json) records reviewed fingerprints, source
paths, lengths, Git blob identities and equality results. It intentionally
contains no matched values. [prove-digests.py](prove-digests.py) reproduces the
comparison from the repository root without emitting candidate values:

```sh
python3 docs/evidence/D2-PLATFORM-COMPLETION/2026-10-14/ci-security-proof/prove-digests.py
```

| Original manifest | Finding line | Historical source |
| --- | --- | --- |
| `integration/browser-final/source-digests.json` | 19 | `client/src/concept2cure/lineage/dataOriginsApi.ts` |
| `integration/ci-followup-38463370149/manifest.json` | 59 | `server/middleware/__tests__/delegated-credential-scope.dbtest.ts` |
| `protocol-finalization/native-source-digests.json` | 26 | `server/auth.ts` |
| `project-vault-parent-access/native-probe-source-digests.json` | 12 | The native parent-access probe |
| Same native manifest | 17 | `server/services/c2c/program-access.ts` |
| Same native manifest | 19 | `server/services/report-os/project-access.ts` |
| Same native manifest | 20 | `server/services/ana/uploaded-file-access.ts` |

All manifest paths above are under
`docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/`. The recorded values are
deterministic source identity pins, not authentication material; path names
containing Api, credential, auth or access cause the generic rule to read them
as keys.

## Full-history parity

The initial checkout was shallow and produced 28 findings, including 21 at
the artificial `275707c7` history boundary. Those boundary fingerprints were
not dispositioned. An authorized read-only
`git fetch --unshallow origin concept2cure-v2` restored real history without
merging, checking out another branch or changing source. Origin remained
`920b230bd1509a41347fe653605babdabea2ae78`; no new remote commit appeared.

Using the checksum-verified gitleaks **8.28.0** binary and the exact CI scan
options at HEAD `920b230bd1509a41347fe653605babdabea2ae78`:

```sh
gitleaks git --no-banner --redact --config .gitleaks.toml \
  --log-opts="--full-history --diff-filter=tuxdb HEAD" .
```

- [Before](full-history-before.summary.txt): exit 1, exactly the seven
  reviewed findings; 10,195 commits processed, 609.07 MB, 29.5 seconds.
- [After](full-history-after.summary.txt): exit 0, zero new findings; the same
  processed history and byte count, 49.6 seconds.
- [Scanner contract](scanner-contract.txt): 1 file, 8 tests passed, zero failed
  or skipped. Scanner configuration is unchanged and all prior fingerprints
  remain in their original order.

[scan-metadata.json](scan-metadata.json) distinguishes 13,930 HEAD-reachable
commits from the 10,195 commits processed by the unchanged CI filter. Reports
retained here are metadata-only; no raw match/secret field is copied.

This result means there are **no unacknowledged findings under the existing
scanner policy**. It does not establish that old credentials have been
revoked: the three pre-existing `status: live` blocks remain unchanged, with
their existing founder-owned revocation notices. This task performed no
credential rotation, revocation, live authentication probe or history rewrite.

## Remote CI limits

The separate [remote-ci evidence](remote-ci/) records decoded connector log
observations for the published CI run and distinguishes incomplete logs from
final suite counts. Production and test-source repairs are owned by the
integration agents, not by this security disposition. No workflow was rerun,
commit created or push performed by this task.
