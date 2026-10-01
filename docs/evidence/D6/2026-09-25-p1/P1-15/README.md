# P1-15 — third-party penetration test: the GA scope for the launch catalog

**Row:** D6 ("third-party pen test with findings closed"). **Plan item:** P1-15
(`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §2; owner founder + vendor; acceptance "report and retest
letter filed"). **Lane:** `session_0194UQPxy9Er2ibRAjog8Ven`. **Date:** 2026-09-26, trunk `6eeee017`.
**Deliverable:** `docs/security/PEN_TEST_SCOPE_2026-09-26.md` (Draft for the founder's vendor RFP).

This item writes the scope, not the test. P1-15 stays open until the vendor's report and retest letter are filed
(scope §7); this folder records that the scope is true of the tree at `6eeee017`.

## What was wrong

- The only penetration-test scope in the repository, `docs/beta/security/PEN_TEST_SCOPE_2026-05-01.md`, scoped a
  limited BETA test of the medical-device 510(k) surface (`/api/q-sub`, `/api/predicate-intelligence`, the 510(k)
  transmit). None of that is in the launch catalog (`shared/constants/launch-scope.ts:43-121`); the six launch apps, the
  connector, SCIM, SAML and the signed audit export were not in it, and it carried no retest list.
- The 2026-09-24 audit closed or partly closed 48 register ids since (`docs/security/SECURITY_AUDIT_2026-09-24.md` §4,
  Status cells; the plan's Item cells), and nothing told a vendor which doors those closures sit on, or which 43 ids
  are known open and must not be re-reported.
- The disclosure surface still says none has been performed (`docs/security/SECURITY_QUESTIONNAIRE_SIG_LITE.md:18`,
  `docs/security/TRUST_STATEMENT.md:59`, `docs/commercial/PILOT_AGREEMENT.md:214`); that stays true until §7 of the
  scope holds, and the scope names those lines as the acceptance's last step.

## What is true now

- `docs/security/PEN_TEST_SCOPE_2026-09-26.md`: engagement summary (15 + 5 days; black-box for the app surface,
  white-box with read-only repository and database access for tenant/IDOR and retest work; a staging tenant pair,
  never production), in-scope surfaces by path with a mount citation per route (§2), out of scope (§3: the non-catalog
  modules of `CLAUDE.md` Rule 2, the AWS account, denial of service, production, third parties), the retest list (§4.1,
  48 ids), the known-open list (§4.2, 43 ids in 65 rows), the plan rows marked Closed by id (§4.3), rules of engagement
  (§5), deliverables and evidence retention (§6), acceptance (§7), a pre-engagement checklist (§8).
- The in-scope API prefixes are not hand-written: they are `UI_SURFACES[].apiPrefixes` for the `LAUNCH_APPS` surfaces,
  computed by `launch-api-prefixes.ts` here (output `launch-api-prefixes.txt`), the same attribution
  `ci:launch-scope-api` enforces. Two registry prefixes have no mount at HEAD (`/api/atoms`, `/api/document-authoring`)
  and the scope says so.
- Every route or mount the scope names is checked by `verify-scope-citations.sh` against the working tree: 43 distinct
  `file:line` citations resolve to an existing file and line, and 100 mount rows (`routes-to-verify.txt`) carry the
  route text at the cited line. The check was shown failing first (below).
- The RFP brief named the enterprise door `/api/enterprise/auth`; the mount is `/api/auth/enterprise`
  (`server/bootstrap/register-platform-routes.ts:157`). The scope uses the real path and notes the correction.
- A fact the brief did not anticipate: CloudFront does not route `/socket.io/*` at HEAD
  (`terraform/modules/cloudfront/main.tf:8-23`; `green/cloudfront-no-socket-io.txt`), so the socket namespaces are
  testable only if staging exposes the path or a direct origin. The scope makes that a pre-engagement decision (§2.1, §8).
- `docs/beta/security/PEN_TEST_SCOPE_2026-05-01.md` gained one line at its top pointing at the new scope; nothing else
  in it changed (24-hour rule: last commit 09-23 09:53 by `session_015w92gcVoDmJqAmsQB72W2i`, outside the window).

## Sources read

| Source | Used for |
|---|---|
| `docs/security/SECURITY_AUDIT_2026-09-24.md` §3.1, §4.1–§4.5, §9 | every id's Status cell → §4.1 / §4.2 of the scope; the 91-id count |
| `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §1–§2, §6 | every Item cell marked Closed → §4.3; P1-15's own row and acceptance |
| `docs/LAUNCH_DEFINITION_OF_DONE.md` rows D1, D2, D6, D8; "Not in scope for launch" | the D6 acceptance, staging (B8), the gateway/connector scope, the out-of-scope modules |
| `CLAUDE.md` Rule 2 | the non-catalog modules |
| `shared/constants/launch-scope.ts`, `shared/constants/ui-surface-registry.ts`, `server/services/entitlements/launch-scope-api.ts`, `api-prefix-map.ts`, `server/middleware/public-api-allowlist.ts` | the canonical API attribution; the never-gated and public paths |
| `server/bootstrap/register-*.ts`, `server/startup/middleware.ts`, `inline-endpoints.ts`, `server/index.ts`, `server/mcp/index.ts`, `server/mcp/config.ts`, `server/socketServer.ts`, `server/services/ana/ana-realtime.ts`, `server/services/hocuspocus-server.ts`, `server/startup/services.ts` | every mount and namespace cited in §2 |
| `server/routes/{auth,authEnterprise,sso,scim,well-known,audit-trail-routes,mdx-qms,qms,submissions,submission-sign-release,mdx-submission-gateway,vault-ingest,vault-legal-holds,tenants-simple,api-keys,document-understanding,misc-inline-routes}.ts`, `server/routes/c2c/{exports,project-vault,actions}.ts`, `server/routes/ana-ri/{stream,utility}.ts`, `server/src/routes/stability.router.ts`, `server/mcp/index.ts` | the route paths inside each mount |
| `terraform/modules/cloudfront/main.tf` | what reaches the API from outside |
| `scripts/ci/upload-guards-baseline.json`; `node scripts/ci/check-upload-guards.mjs` (read-only run: "4 unguarded multer site(s) across 3 file(s)") | the upload surface and IAM-14's residual |
| `docs/beta/security/PEN_TEST_SCOPE_2026-05-01.md` | the BETA scope superseded; its threat scenarios carried into §4.4 |
| `docs/evidence/reviews/2026-09-26/security.md`, `docs/evidence/D6/2026-09-25-p1/README.md`, `docs/evidence/D2-API-SCOPE/2026-09-25/README.md` | the 2026-09-26 lens ids; the tranche's closures; the launch-scope refusal |
| `docs/security/policies/POLICY-DR-007-data-retention-and-residency.md:33`, `SECURITY_QUESTIONNAIRE_SIG_LITE.md:18`, `TRUST_STATEMENT.md:59`, `docs/commercial/{PILOT_AGREEMENT.md:214,MASTER_SUBSCRIPTION_AGREEMENT.md:204,PRICING.md:74}` | the no-PHI posture; the disclosure lines the acceptance corrects |

## Counts

| What | Count | Where |
|---|---|---|
| Register ids marked closed or partly closed, listed with a retest door | **48** (IAM 18: IAM-01…18; DP 22; INF 8) — 41 with a door, 7 CI / Terraform / document closures listed so the register reconciles | scope §4.1 |
| Register ids known open, listed "not to be re-reported" | **43** wholly open ids (IAM 1, DP 17, INF 25) plus 22 residual rows of ids also in §4.1 — 65 rows | scope §4.2 |
| Register total reconciled | 48 + 43 = **91**, the audit's count with the 2026-09-26 lens | audit §4.5 |
| Plan rows marked Closed (wholly or partly), mapped to ids | **40** (P0 15, P1 25); 16 open rows named | scope §4.3 |
| Mount rows verified (route text present at the cited line) | **100** | `routes-to-verify.txt`, `green/verify-scope-citations.txt` |
| Distinct `file:line` citations in the scope resolved (file exists, line exists) | **43** | same |
| Launch API prefixes computed from the registry | 6 apps + the shell set (`launch-api-prefixes.txt`); 2 registry prefixes with no mount, named as non-targets | scope §2.2 |

## Evidence

| Step | File | Result |
|---|---|---|
| Red 1 — the check against the scope as first written | `red/01-first-run-wrong-citations.txt` | **4 failures**: three citations in the document were wrong (`/api/qms` at `register-document-routes.ts:270` → it is `:271`; the MCP `/register` and `/oauth/consent` line numbers were offsets into a `sed` window, not file lines), and one row asserting `/socket.io/*` in the CloudFront patterns, which the file does not carry. `exit=1` |
| Red 2 — fabricated rows | `red/02-fabricated-rows.txt` (input `red/routes-with-fabricated-rows.txt`) | **6 failures**: the four above plus the brief's `/api/enterprise/auth` at the real enterprise mount line, and a citation to a file that does not exist. `exit=1` |
| Fix | the three citations corrected in the scope; the socket row removed from the positive list (the claim is negative) | — |
| Green — the check against the scope as filed | `green/verify-scope-citations.txt` | citations 43, mounts 100, **failures 0**, `exit=0` (99 before the DP-37 row was added) |
| Green — the negative claim | `green/cloudfront-no-socket-io.txt` | `grep -c socket.io terraform/modules/cloudfront/main.tf` → `0`; the pattern list printed |
| Registry computation | `launch-api-prefixes.txt` (script `launch-api-prefixes.ts`) | six apps and the shell set at `6eeee017` |
| Lint | `npx eslint docs/security/PEN_TEST_SCOPE_2026-09-26.md`, `… PEN_TEST_SCOPE_2026-05-01.md` (working tree and `git show HEAD:… \| npx eslint --stdin`) | Markdown is outside the ESLint configuration: 1 "File ignored because no matching configuration was supplied" each, identical at HEAD (count did not rise). `launch-api-prefixes.ts`: 0 errors, 0 warnings after replacing three `console.log` calls with `process.stdout.write` (the first lint showed 3 `no-console` warnings). The shell script is not an ESLint target |

## Re-run

```
# citations and mounts (exit 0 = every route the scope names is at its cited line)
docs/evidence/D6/2026-09-25-p1/P1-15/verify-scope-citations.sh
# the red case: a fabricated route and a missing file must fail
docs/evidence/D6/2026-09-25-p1/P1-15/verify-scope-citations.sh docs/evidence/D6/2026-09-25-p1/P1-15/red/routes-with-fabricated-rows.txt
# the in-scope API prefixes from the registry (regenerate before kick-off; diff against launch-api-prefixes.txt)
npx tsx docs/evidence/D6/2026-09-25-p1/P1-15/launch-api-prefixes.ts
# the negative claim
grep -c 'socket.io' terraform/modules/cloudfront/main.tf   # expect 0 until W2 adds the pattern for staging
# the upload surface the scope §2.7 describes
node scripts/ci/check-upload-guards.mjs
```

## What is left

- **The engagement** (founder + vendor): vendor selection, NDA, budget, the staging tenant pair with the configuration
  in scope §1 and §8, the accounts of §5, the snapshot, the pinned commit. P1-15's acceptance — report and retest letter
  under `docs/evidence/D6/<date>-pen-test/` — is theirs.
- **`/socket.io/*` reachability on staging** (founder + W2): add the pattern to `alb_path_patterns` or provide a direct
  origin; otherwise the IAM-01 / IAM-12 / IAM-19 retests cannot run (scope §2.1).
- **Refresh before kick-off** (this lane): regenerate `launch-api-prefixes.txt` at the pinned commit and re-read the
  register and plan Status cells; any id that moved changes §4.1/§4.2. The verify script is the gate for §2.
- **After the report** (this lane, docs): the disclosure lines named in scope §7; findings as plan rows; regressions
  re-open their register id.
- **Shared documents not edited here** (proposed text returned in the structured result): the plan's P1-15 Item cell,
  the register (the audit has no finding row for P1-15; the SIG-Lite A.5 cell is the register entry that changes), the
  board's D6 row, this tranche's evidence index, and an index line in `docs/security/SECURITY_README.md`.

## Correction after the adversarial check (2026-09-30)

The `security-auditor` verifier of this item returned **does not hold** on one row: the first draft listed DP-37 in §4.2
as known open, with the register's original finding text, although the register and the plan had marked it closed by
lane `…01DiJJAk` in `6ce7c30b` before the pinned commit (`git merge-base --is-ancestor 6ce7c30b 6eeee017` succeeds; the
leaf-program read for `vault_documents` joins `regulatory_programs` on the organisation). DP-37 moved to §4.1 with its
door (`PUT /api/submissions/sequences/:seqId/leaves`, `server/routes/submissions.ts:934`, added to
`routes-to-verify.txt`; the check was first shown refusing the row at a wrong line, `red/03-dp37-row-wrong-line.txt`), P1-35 moved from the open rows of §4.3 to the closed ones, and every derived count moved with
it: §4.1 47 → 48 ids (41 with a door), §4.2 44 → 43 wholly open ids (65 rows), §4.3 39 → 40 closed rows (16 open).
The verifier spot-checked a dozen other open ids against the register and found none closed. Ids that closed on trunk
after the pinned commit (for example IAM-19 by the P1-33 commits of 2026-09-28) move when §2.2 and §4 are regenerated at
the engagement's pinned commit, as §8 requires.

