# MR-01 — Close the public-repository and leaked-credential exposure

| | |
|---|---|
| Phase | Phase 0 (all three stages) |
| Highest open severity at head | P0 |
| Human testing | Not observable in testing. One caution: a staging or test deployment pointed at the leaked Neon endpoints (`ep-wild-forest-ahbojhu4`, `ep-icy-brook-aha5br78`) puts tester data behind a publicly known owner password (OPS-05, SEC-10). Run human testing against the AWS staging stack or a freshly credentialed database. |
| Owner | founder (Stages 1 and 3); engineering executes Stage 2 |
| Effort | S total — S + S + S (founder console work is minutes; the engineering commit is under a day) |
| Depends on | F-1, F-2; MR-02 (OPS-25, CI-minutes cost) before switching the repository to private |
| Findings | 2 total — open 0 · partially fixed 2 · fixed 0 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

## Goal

The repository is private, or public by a recorded and signed-off founder decision. No credential that ever appeared in git history still works, and each revocation is proved by a refused login filed as dated evidence that contains no secret values. `.gitleaksignore` records every historical credential as `revoked <date>` with an evidence path, and CI fails, rather than warns, if any credential is ever marked live again. A buyer's security questionnaire asking "do you have known unrotated credentials?" gets the answer "no", with evidence.

## Why it matters

- Anyone can read the repository today (`visibility=public` on 2026-10-13). Its history holds two Neon `neondb_owner` passwords and a Hugging Face token, and the repository's own records say all three are still live.
- The leaked Neon project is not a dead sandbox. `.github/c2c-agent.yml:16` and `.devcontainer/devcontainer.json:17` name `ep-wild-forest-ahbojhu4-pooler` as the production branch, and `.github/workflows/neon-provisioning.yml:26-27` and `neon-preview-db.yml` keep cutting branches from it. Those branches inherit the leaked owner password.
- A GxP design partner's security review will ask about known unrotated credentials (SOC 2 CC6.1). Today the honest answer is "three, and they are in a public repository". That ends the evaluation before a pilot starts.
- Any tester or demo environment pointed at that Neon project exposes everything written to it to anyone who has the history.
- The repository cannot record a fix yet. `tests/ci/secret-history-scan.contract.test.ts:120` accepts only `live|public by design|not a secret`, and `:125-128` requires the INF-22 block to read `live`. CI (`.github/workflows/ci.yml:2451-2457`) only prints a warning. Nothing enforces closure.
- Fixing the credentials takes the founder minutes in two consoles. It is the cheapest P0 on the roadmap.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| OPS-05 | PARTIALLY_FIXED | P0 | Not observable (tester data is exposed only if staging uses the leaked Neon project) | Repository public; `.gitleaksignore:15`, `:31` and `:38` read `# status: live — revoke (founder; P0-17)`; `ci.yml:2451-2457` only warns |
| SEC-10 | PARTIALLY_FIXED | P1 | Not observable (same caution) | `.gitleaksignore:15-42` has three live blocks (`grep -c '^# status: live'` = 3); `secret-history-scan.contract.test.ts:120,125-128` cannot express `revoked` |

The two findings describe the same three credentials. OPS-05 adds repository visibility, and SEC-10 adds the production-labelled endpoint references. This order closes them together. Severity is P0 because OPS-05 rates it P0: the owner credentials belong to a project the repository calls production and that CI still branches from weekly. SEC-10 rates it P1 only because pilot data is planned for AWS RDS, which these passwords do not open.

## Already done at head — do not redo

- The fourth `.gitleaksignore` entry, the HS256 token in `VaultMarketingPage.jsx`, is closed as not a credential: `.gitleaksignore:44-57`, commit `8fdfc74bd` (2026-10-05). The code supports this. `server/middleware/auth.ts:162` and `server/middleware/tenantContext.ts:248` call `requireAccessTokenReason` (`server/middleware/tokenType.ts:98-104`), which refuses any token without `type: 'access'`. That token has no type, `userId` or `organizationId`. `sessionLifetimeExceeded` (`server/services/session-inactivity.ts:165`) also ends a token whose `iat` is from 2018. Do not re-open it and do not rotate a JWT secret for it.
- `8fdfc74bd` also added a rotation runbook. Treat it as a claim, not evidence. Nothing in the repository shows that any of the three remaining credentials was rotated.

## Work, in order

### Stage 1 — Revoke the three live credentials and prove each refusal (Phase 0 · S · founder) — closes the credential half of OPS-05 and SEC-10

1. Re-confirm OPS-05 and SEC-10 at the current head (statuses here are from 94b4f9238). Run `grep -n '^# status: live' .gitleaksignore` and expect the three blocks at about `:15`, `:31` and `:38`.
2. Neon console, project `ep-frosty-salad-afl93crk` (named in `.devcontainer/devcontainer.json:16`): reset the `neondb_owner` password for the branches behind endpoints `ep-wild-forest-ahbojhu4` (leaked in commits `8d5bce39c`, `9d1d8d21c`, `e11adb0c9`, `eec001307`) and `ep-icy-brook-aha5br78` (leaked in `f457478c8`).
3. In the same project, reset or delete every branch that inherited the old password. That means the agent and preview branches created by `.github/workflows/neon-provisioning.yml`, `.github/workflows/neon-preview-db.yml` (`preview/pr-<n>`) and `.github/c2c-agent.yml`.
4. Update every consumer of the old URIs from a password manager: the `NEON_*` GitHub repository secrets and variables, and any local `.env`. Never paste a value into the repository, an issue, a commit message or a chat.
5. Hugging Face, Settings → Access Tokens: revoke the token committed in `3e1dcf8f0` (`test-api-key.js:8`, `test-embeddings.js:7`). If a token is still needed, issue a new one into AWS Secrets Manager (`terraform/stack/main.tf`, module `"secrets"`), not into a file.
6. Check that no staging, demo or human-testing environment points at either Neon endpoint. If one does, move it to the AWS staging stack or a freshly credentialed database before any tester uses it.
7. Prove each revocation by making it fail, without printing the secret. From a secure machine, load each old value into a shell variable from history (`git show 8d5bce39c:AUTH_CREDENTIALS_LOCKED.md`, `git show f457478c8:_test_neon.cjs`, `git show 3e1dcf8f0:test-api-key.js`). Then:
   - `psql "$OLD_URI" -c 'select 1'` for each endpoint, expecting `password authentication failed`;
   - `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $OLD_HF" https://huggingface.co/api/whoami-v2`, expecting `401`.
8. File the redacted outputs as founder-attested evidence under `docs/evidence/MR-01/<YYYY-MM-DD>-p0-17-revocation/`, and link it from the D6 row's evidence. Record only the date, the endpoint or token identifier (endpoint name, commit SHA), who revoked it, and the refusal message. Never record a value.

**Acceptance**

- Before rotation, the founder runs step 7 against one credential and sees it succeed (the failing-first case: the credential is live). After rotation, each of the two old Neon passwords is refused with `password authentication failed`, and the old Hugging Face token returns `401`.
- The evidence folder exists, is dated, names who revoked each credential, and contains no secret value. `git grep` for the old values in the evidence folder returns nothing.
- No environment used for human testing connects to `ep-wild-forest-ahbojhu4` or `ep-icy-brook-aha5br78` with a credential that was ever committed.

### Stage 2 — Record the revocations and make the gate fail closed (Phase 0 · S · engineering) — closes OPS-05 and SEC-10 together with Stages 1 and 3

Do not start this stage until the Stage 1 evidence exists. Commit steps 3 to 6 as one change on `concept2cure-v2`, so the canonical branch never carries a red step for a known state.

1. Re-confirm OPS-05 and SEC-10 at the current head (statuses here are from 94b4f9238). Confirm the Stage 1 evidence folder exists, and re-locate the contract test lines (`:120`, `:125-128`) and the CI step (`ci.yml:2451-2457`, named `Name the history credentials not yet revoked`).
2. Failing first: in a scratch copy of `.gitleaksignore`, change one live block to `# status: revoked` with no date and no `# evidence:` line. Then change another to an unknown status. Keep these mutations for step 3.
3. Amend `tests/ci/secret-history-scan.contract.test.ts`:
   - `:120`: widen the status pattern to `^# status: (live|revoked \d{4}-\d{2}-\d{2}|public by design|not a secret)`.
   - `:125-128`: replace the "INF-22 is live" assertion with one that accepts `live`, or `revoked <date>` together with a `# evidence:` line naming a path.
   - Add cases asserting that a `revoked` block with no date fails, and that a `revoked` block with no `# evidence:` line fails.
   - Run the test against the step 2 mutations and show both failing. Then run it against the real file.
4. In `.gitleaksignore:15`, `:31` and `:38`, change `# status: live — revoke (founder; P0-17)` to `# status: revoked <YYYY-MM-DD> (founder; P0-17)`. Under each, add `# evidence: docs/evidence/MR-01/<YYYY-MM-DD>-p0-17-revocation/` and one reason line naming who revoked the credential. Keep every fingerprint line: the full-history gitleaks job (`ci.yml:2446-2449`) needs them to stay green.
5. Make `.github/workflows/ci.yml:2451-2457` fail closed. Replace the `::warning` with `::error` and `exit 1` when `n > 0`. Before the step 4 edit lands, run that script locally against the current `.gitleaksignore` (`n=3`) and show it exits 1. After the edit, show it exits 0.
6. Stop naming the leaked endpoint as production. Run `git grep -n -e NEON_PROD_BRANCH -e production_branch` first. Then update `.devcontainer/devcontainer.json:16-17` and `.github/c2c-agent.yml:15-16`: point them at the branch the founder created in Stage 1, or remove the keys if nothing reads them.
7. Commit directly to `concept2cure-v2`, bringing in upstream with a merge, never a rebase (Rule 0). Do not rewrite history to purge the old values. The values are already public and revocation is the control.

**Acceptance**

- `grep -c '^# status: live' .gitleaksignore` returns 0. Each former live block reads `revoked <date>` with a `# evidence:` path that exists in the repository.
- The contract test fails on a mutated `.gitleaksignore` (an undated `revoked`, a `revoked` with no evidence line, an unknown status), shown red first, and passes on the real file.
- The CI step `Name the history credentials not yet revoked` exits 1 on the pre-change file (`n=3`, shown failing) and passes after the change, printing no warning.
- The full-history gitleaks job (`ci.yml:2446-2449`) stays green.
- `git grep -n ep-wild-forest-ahbojhu4 -- .devcontainer .github` returns no line that labels the endpoint as production.

### Stage 3 — Decide and set repository visibility and licence (Phase 0 · S · founder) — closes the visibility half of OPS-05

This stage can run in parallel with Stage 1, but it does not replace it. Making the repository private does not un-leak credentials that are already in clones and forks.

1. Re-confirm OPS-05 at the current head (statuses here are from 94b4f9238). Run `gh api repos/concept2cure/ClinicalSageAI-2-replit --jq '.visibility, .private'` and expect `public`, `false`.
2. Take decision F-1 and record it, with date and signer, in the decision log of `docs/LAUNCH_DEFINITION_OF_DONE.md`. The options are to make the repository private, or to keep it public with a written acceptance of what is exposed (infrastructure, security gates, internal documentation). The recommendation is private now. In the same entry, record the licence decision (F-1 recommends replacing MIT with a proprietary licence) and the request to the owner of the one existing fork to delete it.
3. Before switching, check the CI-minutes cost that private visibility brings (OPS-25, owned by MR-02, currently UNVERIFIABLE). Confirm that the account's plan or budget covers the current CI load, so the switch does not stall the gate that MR-02 is making mandatory.
4. If the decision is private, run `gh api repos/concept2cure/ClinicalSageAI-2-replit -X PATCH -f visibility=private`.
5. If the licence changes, an engineer replaces the root `LICENSE` file and the `license` field in `package.json` in one commit on `concept2cure-v2`, naming the decision log entry.

**Acceptance**

- Failing first: step 1 shows `.private` is `false` before the change. After the change, `gh api repos/concept2cure/ClinicalSageAI-2-replit --jq .private` returns `true`, or the decision log holds a signed acceptance of public visibility.
- The decision log entry exists with a date, the signer, the licence outcome and the fork request.
- CI runs on `concept2cure-v2` still start and finish after the visibility change. Link one post-change run in the evidence folder.

## Definition of done

- The two old Neon owner passwords and the old Hugging Face token are each proved refused, with dated, value-free evidence under `docs/evidence/MR-01/`.
- `.gitleaksignore` has zero `# status: live` blocks, and every former live block carries a revocation date and an evidence path.
- CI fails, not warns, if a live block reappears. The contract test refuses an undated or evidence-less `revoked` block. Both have been shown failing first.
- No repository config names the leaked Neon endpoint as production, and no human-testing environment uses a committed credential.
- Repository visibility and licence are decided under F-1 and recorded. If private, the API confirms `private: true`.
- `statusAtHead` for OPS-05 and SEC-10 in `docs/work-orders/MR-findings-2026-10-13.json` reads FIXED with the closing commit.

## Founder decisions this order needs

- **F-2**: rotate the credentials `.gitleaksignore` marks live. This blocks Stage 1, and Stage 2 waits for its evidence.
- **F-1**: make the repository private and decide the licence (and the fork request). This blocks Stage 3. Before acting, check the OPS-25 CI-cost question in MR-02.

## Do not

- Do not edit `.gitleaksignore` to say `revoked` before the refusal evidence exists. A status line with no proof is the "claim, not evidence" problem the `8fdfc74bd` runbook already has.
- Do not rewrite git history, force-push or create a cleanup branch to purge the values (Rule 0). The values are public already, and only revocation closes them.
- Do not delete the fingerprint lines from `.gitleaksignore` or loosen the gitleaks job. The full-history scan depends on them to stay green.
- Do not loosen the contract test to accept any status, or a bare `revoked`. The date and the evidence path are the point.
- Do not put a value in evidence, commit messages, issues or a chat transcript, even a "redacted" prefix of it. Record identifiers and outcomes only.
- Do not treat going private as the fix for the credentials, or re-open the HS256 `VaultMarketingPage.jsx` token, which is closed by code at `server/middleware/tokenType.ts:98-104`.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-01/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
