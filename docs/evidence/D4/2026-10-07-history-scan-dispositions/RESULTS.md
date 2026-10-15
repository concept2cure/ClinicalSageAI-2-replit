# W3 / D4 — qualification checksum history dispositions

Five exact original-commit fingerprints are appended to `.gitleaksignore` with
`status: not a secret` and an independently verified source-identity reason.
All prior disposition bytes, including live credentials, are preserved. Scanner
rules, configuration, pinned version, command, workflow, production, tests,
schema and policy baselines are unchanged. Original manifests remain untouched.

## Cause and bounded correction

The existing generic API-key pattern reads `module-access-requests` in manifest
property names and treats the adjacent 40-character source identifiers as keys.
The route appears in three historical manifests; its native fixture appears in
two. Each identifier equals SHA-1 over Git's `blob <byte-length>\0` header and
the exact source bytes at the manifest's original commit. `CHECKSUM-PROOF.json`
records all five comparisons and five changed-identifier refusals. No candidate
credential value is printed. New preservation pins separate `path` from
`gitBlob`, avoiding the same adjacent-property ambiguity without a rule change.

## Verification and limits

- Actual base CI `37697288645`, secret job `113052022121`, scans 9,681 commits
  and about 531.44 MB, reports five findings and exits 1: `REMOTE-RED.txt`.
  The nonverbose log does not expose finding metadata.
- Source tracing is diagnostic only. The pinned gitleaks binary and Go are not
  installed locally; local matches and hash proofs do not qualify full history.
- Ten source-identity proof controls pass. Existing secret-history contracts
  pass 8 cases; unchanged working-tree scanner self-tests pass 16. The ordinary
  working-tree scanner passes. Full native scanner verification remains remote.
- `SCOPE.json` freezes production, tests, native guard, workflow, scientific and
  security controls. Normal commit and full unmodified pre-push checks run before
  publication. Metadata-only relevance must naturally skip the full local
  compiler; no compiler gate or baseline is changed.

The unchanged exact-source remote full-history gate must pass before claiming
these dispositions resolve the native failure. Pending or failed remote results
remain open. Product native database, compiler and broader launch qualification
are independent; this delivery does not claim the platform is fully qualified.
