# QOS qualification: source-checksum scanner disposition

Repository: `concept2cure/ClinicalSageAI-2-replit`; only branch:
`concept2cure-v2`. W3 / D4 control-tower qualification follow-through.
Published source: `fdd507a91c6b7c7976c78eae4fa9755f87326782`, tree
`09bdd1233c21b130b533c24c705d00a3855400c8`.

## Actual RED and candidate investigation

The existing full-history secret scan failed on that exact source:
run 37676477898, job 112981179778. Its pinned gitleaks v8.28.0 execution
scanned 9,675 commits, reported one finding and exited 1. The unverbose
redacted log does not identify the finding's fingerprint.

A diagnostic using the pinned upstream rule configuration against the 30
newly published files isolates a generic-api-key candidate at line 15 of
`QOS-LINEAGE-AUDIT-MANIFEST.json`. The candidate value is the SHA-256 digest
recorded for `server/services/ana/uploaded-file-access.ts`. The word `access`
in the JSON property allows the generic key pattern to read that digest as
a credential. The original manifest line, the source bytes at the published
commit and the locally unchanged source were inspected: the recorded digest
equals the computed SHA-256 exactly. No credential material is present in
that field.

That local rule diagnostic is not a complete gitleaks execution or a green
secret gate. Its Python regex engine also reports three rule/allowlist
translation errors; these are retained as diagnostic limitations. The exact
existing remote gate must prove the disposition resolves the actual finding.

## Bounded action and verification

The control tower owns `.gitleaksignore` and these evidence receipts. Add one
`status: not a secret` entry naming the exact original commit, manifest path,
generic-api-key rule and original line 15, with the verified checksum reason.
Do not change `.gitleaks.toml`, the workflow scan command, credential rules,
live-history entries, ordinary working-tree scan, or any compiler, schema,
scientific or lint baseline. Preserve the original audit manifest and all
production/test source bytes. This is a recorded false-positive disposition,
not credential rotation or an exception for an unverified token.

Run the existing secret-history contract and working-tree scanner self-tests,
ordinary pre-commit and complete ordinary pre-push gates. This metadata-only
follow-up must naturally take the hook's no-TypeScript-change path; never run
the full compiler on this 8-GiB host. Publish only to the canonical branch.
The unchanged full-history remote scanner must succeed before reporting the
candidate as the actual resolved finding. Keep a failed or pending verdict
explicit if it does not.

All QOS integrated source hashes must remain identical to the 83-file,
1,511-case tested publication. D4 and the broader release qualification remain
open, including the unresolved native-database failure's actual cause.
