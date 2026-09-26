# Every commit on the trunk is scanned for secrets, and a new one fails CI

**Row:** D1 / D6. **Plan item:** security plan P0-17, the engineering half
(audit INF-22). **Lane:** W2. **Session:** `…01AiwZKG`. **Date:** 2026-09-26.

## Why

`scripts/ci/check-committed-secrets.mjs` (Lint) scans the working tree. A
credential deleted from the tree stays in its history, readable by anyone with
the repository. That is how the `neondb_owner` password survived (INF-22). Until
now nothing scanned history.

## What runs now

A new CI job, **Secret scan (full history)** (`secret-history-scan` in
`.github/workflows/ci.yml`), checks out the whole history (`fetch-depth: 0`) and
runs **gitleaks v8.28.0** over every commit on the branch (`--log-opts
"--full-history --diff-filter=tuxdb HEAD"`, 8,369 commits, about 80 s).
- **Blocking.** No `continue-on-error`, and the scan step has no condition.
- **Installation.** `go install github.com/zricethezav/gitleaks/v8@v8.28.0`.
  The Go module proxy checks the module against the checksum database, so the
  version pin is also a content pin, with no third-party action and no
  hand-copied digest.
- **Scope.** `HEAD` only, not every ref: the stale agent branches on origin
  (INF-28) are not this branch's history.
- **Live credentials are named on every run.** A final step emits a warning with
  the number of history credentials `.gitleaksignore` records as still live.

## The configuration: `.gitleaks.toml`

- **gitleaks' default rules do not find the INF-22 credential.** Run over every
  commit on the trunk, they reported 64 other findings and none of it
  (`red-default-rules-miss-inf22.txt`). The config adds the two rules the
  working-tree gate already had, and applies them the same way:
  - a connection URI with an inline password, and a bare Neon `npg_` password;
  - the same placeholder stand-ins and non-live hosts.
- **One escape hatch for both scanners.** A line carrying
  `ci-secret-scan-ignore` (with a reason) is allowlisted, as it is in the tree
  gate.
- **Identifiers are not keys.** `generic-api-key` reads catalog and citation
  keys (`key: 'substantial-equivalence-bx204'`) as secrets. A value made only
  of lowercase words joined by `-`, `_` or `.` is allowlisted for that rule
  (41 of its 50 findings).
- **A gitleaks bug, worked around.** In gitleaks v8.28.0 the documented
  `[[allowlists]] targetRules = [...]` form is silently dropped by any config
  that extends the default: `extendDepth` is incremented and never reset, so
  the step that attaches targeted allowlists never runs
  (`config/config.go:239`). The allowlist is declared under the default rule's
  ID instead, which `extend` merges. The config says so, so nobody "simplifies"
  it back.

## What history holds: `.gitleaksignore`

History is not rewritten here (CLAUDE.md Rule 0). A secret that reached a
commit is dealt with by revoking it. The 34 findings (fingerprints in
`scan-with-config-before-ignore.txt`) are listed by fingerprint in blocks, each
with a `# status:` and a `# reason:`.

| Status | What | Who acts |
|---|---|---|
| **live** | Neon OWNER password, endpoint `ep-wild-forest-ahbojhu4` (INF-22): `AUTH_CREDENTIALS_LOCKED.md`, `scripts/cortex-enhance.cjs`, `tests/e2e/seed-governed-workflow.cjs`. **9 findings** | founder: revoke |
| **live** | a **second** Neon OWNER password, endpoint `ep-icy-brook-aha5br78`, in `_test_neon.cjs`. The same password is also the e2e seed's fallback. **Not cited by INF-22; found by this scan.** 2 findings | founder: revoke |
| **live** | a **Hugging Face access token** in `test-api-key.js` and `test-embeddings.js` (`3e1dcf8f0`, deleted 2026-01-24). **Not cited anywhere; found by this scan.** 2 findings | founder: revoke on huggingface.co |
| **live until confirmed** | an HS256 session-shaped token (`id`, `role`, `tenantId`, **no `exp`**) hard-coded in `VaultMarketingPage.jsx` (`3e1dcf8f0`, deleted). It verifies against none of the 57 JWT-secret defaults committed then or now, so its signing secret is unknown. 2 findings | founder: confirm no environment's `JWT_SECRET` signed it, or rotate |
| public by design | a Supabase `anon` key (`public-env.ts`); the vendored gstack skill's own `sb_publishable_` key | — |
| not a secret | 15 more: documentation curl examples, the private-key regex source, a July audit's evidence quoting a placeholder, and test fixtures (journey passwords, export tokens, the RFC 6238 TOTP test secret, a test JWT secret) | — |

No secret is reproduced in this folder. Fingerprints, endpoint host names and
file names only.

## Proof

| Stage | File | Result |
|---|---|---|
| Default rules, every commit | `red-default-rules-miss-inf22.txt` | 64 findings, **0** on the INF-22 credential |
| This config, no ignore file | `scan-with-config-before-ignore.txt` | 34 findings; the two repository rules find the credential in all 4 files where it was committed (11 findings, 2 distinct passwords) |
| The command CI runs, with `.gitleaksignore` | `green-full-history.txt` | 8,369 commits, **no leaks found**, exit 0 |
| Mutant: `.gitleaksignore` without the INF-22 block | `red-mutant-inf22-block-removed.txt` | exit 1, exactly those 9 findings |
| New commits in a scratch repository with this config | `new-commit-probes.txt` | a Neon URI → exit 1; a bare `npg_` → exit 1; placeholder / localhost / the marker → exit 0 |
| `tests/ci/secret-history-scan.contract.test.ts` | — | 8/8. The same rules as the tree gate, compared from source; the INF-22 shape found and stand-ins not; one escape hatch; the job has full history, a pinned install, a blocking HEAD scan and the repository config; every ignore entry is a fingerprint with a status and reason; INF-22 is listed as live |
| Contract-test mutants | `red-contract-mutants.txt` | each caught: `fetch-depth: 1`; the Neon rule drifting (`{12,}` → `{20,}`); the INF-22 block relabelled "not a secret"; the scan step made advisory |

## Not done here

- **The rotation.** Revoking the two Neon passwords and the Hugging Face token,
  and confirming or rotating whatever `JWT_SECRET` signed the demo token, is the
  founder half of P0-17. Until then the job warns on every run, and the three
  are recorded as live.
- **Pre-push.** gitleaks is not installed in sessions, and `.husky/pre-push` is
  another lane's window. The working-tree gate already runs on every push; this
  job is what catches a secret added and removed within one push.
