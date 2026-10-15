# D6 product decisions, 2026-10-05

Taken as the platform's product owner, on the founder's instruction to decide
on client needs. The client is a regulated sponsor or CRO, so each decision
follows what that customer must be able to rely on: what the platform hands
back, what it certifies, and which credentials stay valid.

## 1. A data return carries the customer's data, not key material. Done: `66b5bb282`

**Need.** An offboarding customer is owed their data (GDPR Art. 20, the MSA
data-return clause). Whoever downloads the file must not receive working, or
replayable, credentials.

**Found.** The full export read every tenant-keyed table with `SELECT *`. It
returned:
- OAuth access and refresh tokens;
- connector and agency-gateway credentials;
- session tokens and keys;
- one-time verification tokens;
- the hashes SCIM and MCP refresh tokens are checked against;
- a secret-store reference.

Only `api_keys` had ever been kept out.

**Decided.**
- Withhold those values, visibly: `[withheld: <what it was>]` in place of a
  value, null kept as null, and each table lists what it withheld.
- The customer still sees that a credential existed and which account held
  it; the rest of every row and table is returned.
- Every secret-shaped name that is not a secret (the audit HMAC seal, the
  password policy, an investigator's professional credentials and others) is
  recorded with its reason.
- A guard over the fully migrated schema fails on any new secret-shaped
  column nobody has classified.

**Evidence.**
- `tenant-full-export.withheld.pglite.integration.test.ts`: the export at
  HEAD fails 3 of its 5 cases, one per leaked credential; after, 5 of 5.
- `tests/db/tenant-export-withheld-columns.dbtest.ts`: with one entry
  removed, it fails naming both of that table's columns.

## 2. QMS validation never passes a section it did not assess. Already done: `2b52ec8d6`

**Need.** A QMS customer acts on "valid". A clearance chosen by an empty rule
set is a fabricated verdict.

**Found.** This was already fixed, by the D5/QMS lane on 2026-09-28. With no
gating rule, the route answers `valid: null, assessed: false` and "not
assessed". `quality-gating-not-assessed.pglite.integration.test.ts` pins it
(28 of 28 today). My 2026-10-05 report listed it as open from a 2026-09-23
reading, which was stale. Nothing further is needed.

## 3. Credentials in git history (P0-17)

The history scan lists the credentials it found. I checked each live one by
hash, never printing a value. None of the four appears anywhere in the
current tree, Terraform, workflows or docs.

### The HS256 token from VaultMarketingPage.jsx. Closed: no `JWT_SECRET` rotation

Its signing secret is still unknown, but the token opens nothing, whatever
signed it:
- `server/auth.ts` and `middleware/auth.ts` both demand `type: 'access'`
  (`requireAccessTokenReason`). The token has no type, and no
  `userId`/`organizationId`.
- The optional authenticator runs `verifyLiveToken`, and its absolute session
  lifetime (`sessionLifetimeExceeded`, from `iat`) ends the token. Its `iat`
  is 1516239022, 2018-01-18: jwt.io's sample timestamp.

Rotating `JWT_SECRET` would sign every user out and close nothing, so it is
not done. The entry is now `not a secret`, with this reasoning
(`.gitleaksignore`).

### Still live: revoke now. This needs console access this environment does not have

| Credential | Where it was committed | What to do |
|---|---|---|
| Neon owner password, endpoint `ep-wild-forest-ahbojhu4` (INF-22) | `AUTH_CREDENTIALS_LOCKED.md`, `scripts/cortex-enhance.cjs`, `tests/e2e/seed-governed-workflow.cjs` | Neon console → project → Roles → `neondb_owner` → reset password. |
| Neon owner password, endpoint `ep-icy-brook-aha5br78` | `_test_neon.cjs` (and the e2e seed's fallback) | The same, in that project. If the project is unused, delete it instead. |
| Hugging Face access token | `test-api-key.js`, `test-embeddings.js` | huggingface.co → Settings → Access Tokens → revoke it. Issue a new one only if something still needs it; nothing in the tree uses one. |

**Neon branches.** These copy the leak. `.github/workflows/c2c-agent.yml` and
`neon-provisioning.yml` create Neon branches with the `NEON_PROD_BRANCH`
secret as parent, and `.github/c2c-agent.yml` and
`.devcontainer/devcontainer.json` name `ep-wild-forest-ahbojhu4-pooler` as
that parent. A Neon branch inherits its parent's roles and their passwords,
so every agent or preview branch created since the leak opens with the
leaked password. After resetting the parent:
1. List the project's branches.
2. Delete those that are no longer needed.
3. Reset `neondb_owner` on the rest.

Production runs on AWS RDS (`terraform/modules/rds`), so this Neon project
holds agent and preview copies. What they hold is whatever the parent held
when each was branched.

Once each is revoked, record it in the same change in two places, or CI
goes red:
- in `.gitleaksignore`, change the block's status line to
  `# status: revoked <date> (P0-17)`;
- in `tests/ci/secret-history-scan.contract.test.ts`, add `revoked` to the
  statuses a block may carry (`/^# status: (live|public by design|not a secret)/`),
  and change the INF-22 assertion from `live` to `revoked` (it requires `live`
  today).

CI's "Name the history credentials not yet revoked" step counts
`# status: live` lines, so it stops warning once all three are recorded.
