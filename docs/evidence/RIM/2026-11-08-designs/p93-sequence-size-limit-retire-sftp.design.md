# P-93: an FDA sequence over 1 GiB is refused before anyone signs; FDA ESG's SFTP branch is retired

- **Package and row.** F1, launch row D7. Every commit is `Plan: F1` (the coordinator's assignment).
- **Designer.** RIM (`session_011e42DEAR2U6W51Mjvgfgbt`), read-only, 2026-11-02.
- **Trees read.**
  - `origin/concept2cure-v2` at `e194d3114`, fetched for this design. The map was written at `4ea4b534e`.
    `git diff --stat 4ea4b534e origin/concept2cure-v2 -- server scripts package.json package-lock.json 'Dockerfile*' .github`
    shows only four AnA dose-optimization files, so every server line the map cites still holds. Every line below was
    re-read at `e194d3114`.
  - The working tree held F1 slice 1's uncommitted edits when this was first written. Those were designed against, never
    cited as trunk: `submission-gateways/index.ts`, `types.ts`, `transmit-guard-refusal-releases-claim.test.ts` and
    `_freeze-gate-fixture.ts`.
  - **Revised 2026-11-02 against `origin/concept2cure-v2` at `bda1d5aed`** (§10.1, review round 2). Since `e194d3114`:
    - the founder's record `1c48581ae` has landed (§0 now quotes it);
    - F1 slice 1 has landed (`090f62af1`). It shifted line numbers in `submission-gateways/index.ts` and `types.ts`, which
      are cited below at `bda1d5aed`;
    - `git diff --stat e194d3114 origin/concept2cure-v2 -- server/services/submission-service/submission-service.ts
      server/services/submission-gateways/fda-esg.ts` is empty, so every line cited in those two files still holds;
    - P-86 has not landed (`server/services/submission-service/sequence-retirement.ts` is absent on origin).

    The working tree now holds F1 slice 2's uncommitted edits (`submission-service.ts`, `filed-dispatch.ts`,
    `fda-esg-receipts.ts` and their tests). Those are designed against, never cited as trunk.
- **Inputs.**
  - The map, `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/decided2/p93-one-gib.map.md`.
    It was verified here, and §10 lists where this design departs from it.
  - The D7-record session's README on origin, `docs/evidence/W5/2026-11-01/README.md`: row `:40`, item 4 (`:94-98`)
    and founder question 2 (`:122-123`).
  - The designs that land first: `f1-filed-is-what-was-sent`, `f1-test-send-is-not-a-filing` and
    `f1-small-repairs-4-8-24`. Also `p86-retire-unfiled-sequence`.
  - The P-92 and P-94 maps beside the P-93 map.
- **Scope.** Exactly what P-93 needs:
  - the refusal before signing;
  - the re-checks that keep a signed sequence from becoming unsendable;
  - the deletion, and its record.

  Nothing else. §8 names what is owed elsewhere.

---

## 0. The founder's decision

The record has landed: commit `1c48581ae` is an ancestor of `origin/concept2cure-v2`
(`git merge-base --is-ancestor 1c48581ae origin/concept2cure-v2` succeeds). It reads, verbatim
(`docs/LAUNCH_DEFINITION_OF_DONE.md:1845-1855` at `bda1d5aed`):

> ### P-93 — FDA sequences over 1 GiB are out of scope for launch
>
> The founder, 2026-11-02, answering "FDA sequences larger than 1 GiB: the only code path is an SFTP transmit, and
> nothing in the repository documents FDA accepting SFTP. Are they in scope for launch?": **"Out of scope."** Raised by
> the D7-record session (`docs/evidence/W5/2026-11-01/README.md`, "For the founder" 2).
>
> - **What is decided.** A sequence over the size the documented channel takes is refused **before signing**, with a
>   plain message, from `sequenceTransmitReadiness`. The undocumented SFTP transmit (`transmitViaSftp`,
>   `ssh2-sftp-client`) is retired: removed, its reachable replacement being that refusal, named by path in the
>   removing commit (working agreement).
> - **Owner.** RIM, under F1.

The record wins over the coordinator's summary this design was first written from ("sequences over 1 GiB are out of
scope for launch. They are refused before signing …"). Two choices depend on its exact words, not one:

1. **FDA only, or every region.** The heading and the question say "FDA sequences", so this design is FDA only. The
   operative sentence is keyed to "the documented channel", which could carry the before-signing refusal to every route
   whose limit is sourced. That is asked in §9 question 1(a).
2. **The threshold.** The heading says 1 GiB. The operative sentence says "the size the documented channel takes". By
   this design's own evidence (§1.3), the only documented FDA limit on file is 10 GB (Form 5640 v2.0). The 1 GiB figure
   comes only from unsourced code comments (`fda-esg.ts:42-43`, `:747-749`), which is the premise the record's wording
   rests on.

**This design builds FDA at 1 GiB**, the heading's figure. Refusing more fails closed, and it is the old switch's
threshold exactly. Its code and copy never state 1 GiB as FDA's limit. The coordinator is asked to confirm that the
heading's 1 GiB is intended, given the 10 GB on file (§9 question 1(b)).

The question the decision answers is the D7 session's founder question 2: *"FDA sequences over 1 GiB. Are they in scope
for launch? If so, by which channel? SFTP has no FDA source in the repository."*

| Clause (recorded words) | What it requires here |
|---|---|
| "FDA sequences over 1 GiB" (heading) | `bundle.sizeBytes > 2^30`, measured on the package that would be sent, for a sequence whose canonical region is US. This is the old switch exactly (`fda-esg.ts:749`), so every package that went over AS2 before still does. |
| "out of scope for launch" (heading) | It is Concept2Cure's launch scope. It is never worded as FDA's rule (§1.3, §9 question 1(b)). |
| "a sequence over the size the documented channel takes is refused before signing … from `sequenceTransmitReadiness`" | The transmit precheck's `refusal` names it, and the e-signature never opens. For FDA, the binding figure is the heading's 1 GiB. Whether non-FDA routes with a sourced limit come under this sentence is §9 question 1(a). |
| "with a plain message" | One sentence with the size and the ceiling, and what the person can do. No ids, enums or snake_case. |
| "the undocumented SFTP transmit (`transmitViaSftp`, `ssh2-sftp-client`) is retired: removed" | The function, its branch, its credentials, its probe and its gate exception are deleted. There is nothing to uninstall (§1.5). |
| "its reachable replacement being that refusal, named by path in the removing commit (working agreement)" | Commit 2's deletion record (§5). |

**The founder's neighbouring records** (same commit, `:1828-1843` and `:1857-1865`), quoted where this design composes
with them:
- P-92: "**released as not received**, only on FDA's written confirmation of non-receipt" and "No settlement without
  the agency document; no settlement by an unsigned action; the removed rollback route stays removed." (§6.1, §7.)
- P-94: "An uploaded leaf goes through the same approval as an authored one before it can be placed in a sequence.
  Readiness and transmit both refuse an unapproved upload, as they do an unapproved authored leaf." (§7.)

---

## 1. What already exists (by path, at `e194d3114`)

### 1.1 `sequenceTransmitReadiness` and its callers

- **The function:** `server/services/submission-service/submission-service.ts:2575-2662`. Its interface is at
  `:2503-2525`.
  - It reads the sequence, the route (`transmitRouteFor`), per-environment `isConfigured` and `gatewayTransportReadiness`,
    the dispatch verdict as `gate`, the package identity and the typed number.
  - Its `refusal` is `status ?? resendRefusal ?? gate ?? typedNumber ?? gatewayRefusal()` (`:2634-2640`).
  - **It does not assemble, so it cannot know a size.** Its doc comment (`:2565-2574`) says "Same functions, same order,
    minus Gate 1". That is untrue today: transmit runs the package re-check (`:2878-2886`) and readiness does not.
- **Its one caller:** `precheckGovernedStep` (`:1712-1739`; transmit branch `:1718-1721`). Its route is
  `POST /api/submissions/sequences/:seqId/governed-precheck` (`server/routes/submissions.ts:2050-2085`). The route
  answers 200 either way.
- **Who reaches that route.**
  - `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`:
    - `precheckRefusal` (`:788-809`) sends `environment` and `applicationId` for a transmit;
    - it is called by `requestGoverned` on the click (`:811-826`), and again by `runGoverned` after re-authentication,
      before `POST /api/c2c/actions/sign` (`:844-846`);
    - a refusal reads "`<Step>` of sequence NNNN not started — `<refusal>`. Nothing was signed.", and the e-signature
      never opens.
  - `SubmissionSeqWorkspaces.tsx` `TransmitPanel` (`:1946-2010`):
    - it calls the route **on mount with no environment** (`:1952`);
    - its `transmitBlockedBy` (`:1762-1774`) hides any refusal matching `/credentials configured|is configured for/`.
- **Who does not call it.**
  - The dispatch verdict, `GET /sequences/:seqId/dispatch-readiness` → `assessSequenceDispatchReadiness`, is
    readiness's **callee**.
  - AnA's `transmit_submission` refuses by design; `dispatch_qc_check` and `assess_dispatch_readiness` read the dispatch
    verdict.
  - MCP's `c2c_assess_sequence_readiness` (`server/mcp/tools/readiness.ts`) reads the dispatch verdict. MCP cannot sign
    or transmit.

### 1.2 How the package size is known before signing

| Source | Before the transmit signature? | Size kept? |
|---|---|---|
| `assembleSequence` (`server/services/ectd/assemble-from-core.ts:242`) → `bundle.sizeBytes = buffer.length` (`submission-gateways/regional-packager.ts:1537`) | Yes, whenever someone assembles | No: `cleanup()` discards it |
| The package gate, `assertSequencePackageable` (`submission-service.ts:1546-1601`). It runs `assembleSequence` with the binding's captured identity, then `assembledTransmitBlockers` (`assemble-from-core.ts:135-165`). It is reached by `governedContentGates` (`:1634-1654`) at freeze, dispatch, renewal and both their prechecks | Yes, before the freeze and dispatch signatures | No |
| The `ECTD_ASSEMBLED` audit row and the `ectd_compilations` row | — | No size column or detail |
| `sentPackage.sizeBytes` (`sent-package-archive.ts`), written by the guard at `index.ts:328` (at `bda1d5aed`) | **No**: it is written after the signature | Yes, but too late |
| Transmit's own assembly (`:2807-2886`) | No: it runs after Gate 1 and the claim | No |

The leaves are locked once the sequence is frozen (`isSequenceLocked`, `:229-232`). So the assemblies at the dispatch
gate, at readiness and at transmit carry the same content. Only zip and PDF/A bytes can differ (§10, C6).

### 1.3 Where the 1 GiB figure comes from

- **The code's own words** (`server/services/submission-gateways/fda-esg.ts`):
  - `:14-16`: "SFTP (used for very large submissions + by orgs without AS2)";
  - `:24-25`: "Large-bundle SFTP still requires the optional ssh2-sftp-client dependency";
  - `:42-43`: "bundles > 1 GB fall to SFTP on the AS2 path";
  - `:747-749`: "The FDA ESG AS2 path has a documented 1 GB message limit", then
    `const useSftp = normalizedReq.bundle.sizeBytes > 1_073_741_824;`.

  None of these cites a source. The runbook repeats the claim (`docs/runbooks/fda-esg-production-uat.md:369`).
- **FDA sources on file say nothing of a 1 GB limit or of SFTP.** The AS2 guide on file is
  `docs/evidence/AUDIT-REMEDIATION/2026-10-14/agency-assets/fda-as2-guide.txt`, v2.2, July 2026.
- **FDA's own limit on file is 10 GB.**
  - Form 5640 v2.0, recorded in `docs/ectd/SPEC_DIGEST.md:113-115`.
  - In code: `FDA_GATEWAY_LIMIT_BYTES = 10 * 1000 ** 3` and `FDA_OVERSIZE_REMEDY`
    (`server/services/ectd/ectd-regional-rules.ts:381-387`).
  - Enforced by `checkGatewaySize` (`submission-gateways/pre-transmit-check.ts:199-229`, called at `:293`).
- **Conclusion.** From P-93 on, 1 GiB is **Concept2Cure's launch scope, not FDA's rule**. Between 1 GiB and 10 GB, FDA
  still requires the ESG, so no message may point the person to physical media or to "another channel".
  - The record's operative sentence calls the threshold "the size the documented channel takes". That wording rests on
    the unsourced comments above, not on an FDA source. The heading's 1 GiB is built; the coordinator confirms it
    (§0, §9 question 1(b)).
- **No existing launch ceiling.** Searched:
  - `1_073_741_824|1073741824|1024 \*\* 3|2 \*\* 30|MAX_(SEQUENCE|PACKAGE|BUNDLE)` across `server`, `shared`,
    `client/src` and `scripts`;
  - `shared/constants/launch-scope.ts`, which holds surfaces and apps only and is parsed structurally by
    `ci:launch-scope`.

  The only hits are the switch itself and `PMDA_LIMIT_BYTES` (`ectd-regional-rules.ts:389`). That one is an unsourced
  PMDA figure that only warns, and it is unrelated.

### 1.4 How the gateway chooses between AS2 and SFTP (`fda-esg.ts`, 1241 lines)

- **Credentials.** `FdaEsgCredentials.sftpHost/sftpUser/sftpKeyPem` (`:111-113`) are read only in platform mode
  (`loadFdaCredentials` `:227-231`). Client mode (`loadFdaClientCredentials` `:148-177`) has no SFTP fields.
- **The probe.** `fdaEsgTransportImplementation` (`:239-249`) resolves `ssh2-sftp-client` with
  `createRequire(…).resolve` (`:243`). It reports `sftpAvailable`, and it adds a `missingDependencies` entry (`:246`).
  - The probe is read by `gatewayTransportReadiness` (`index.ts:383-399` at `bda1d5aed`).
  - No client reads `sftpAvailable`. `missingDependencies` is displayed nowhere; `GatewayAccountsSetting.tsx:174`
    shows `reason`.
- **The rest of the SFTP path.**
  - `sftpApplicationId` (`:346-356`) is the identifier rule of the SFTP path.
  - `createTransmittalRow(req, transport: 'as2' | 'sftp')` (`:360-385`).
  - `transmitViaSftp` (`:623-683`): a `CredentialError` (`:635`), then a dynamic `import('ssh2-sftp-client')` that fails
    with `TransportError(…, NOTHING_TRANSMITTED)`, then `connect` and `put` to `/incoming/<app>/<seq>/`.
- **`transmit`** (`:733-869`), in order:
  - `transmitViaNextGenRest` refuses REST (`:745`);
  - the size switch (`:749`) and `sftpTarget` (`:751-758`);
  - `createTransmittalRow` (`:759`);
  - the SFTP branch (`:775-808`). On success it returns `in_transit`, which `toDispatchStatus` makes `'sent'`: a
    sequence filed on deposit (P-92 map, H6);
  - the AS2 branch (`:810-860`).
- **Comments that describe SFTP as live:** the header (`:1-73`), the class comment (`:703-706`), `checkStatus` and
  `downloadAcknowledgment` (`:871-904`).
- **Only one caller each.** `transmitViaSftp` and `sftpApplicationId` are each called once, from `transmit`.
  Nothing else calls them.

### 1.5 Every reference to `transmitViaSftp` and `ssh2-sftp-client`

| Kind | Where | Fate |
|---|---|---|
| Code | `fda-esg.ts` (above) | Deleted (commit 2) |
| `package.json`, `package-lock.json`, `node_modules` | **Absent.** `git show origin/…:package.json \| grep ssh2` gives nothing; the lockfile has 0 `node_modules/ssh2*` entries; `ls node_modules/ssh2-sftp-client` fails | Nothing installed or uninstalled. The lockfile is **not** regenerated, because there is nothing to regenerate. Evidence: `git diff --exit-code package.json package-lock.json`, plus `npm ls ssh2-sftp-client` printing an empty tree |
| Dockerfiles, `.github/**`, `terraform/**` | No SFTP variable, secret or package. `Dockerfile.optimized:37` and `ci.yml:2170` run the bundle gate | Unchanged |
| Gate | `scripts/ci/check-server-bundle-prod-imports.mjs:68-72` `RUNTIME_EXCEPTIONS['ssh2-sftp-client']`. The stale-entry failure is at `:172-175` (it runs only without `--bundle`, which is how the Dockerfile and CI run it) | The entry is removed in the deleting commit, or the image build fails |
| Gate self-test | `check-server-bundle-prod-imports.selftest.mjs` uses `citation-js`, not this package | Unchanged |
| Tests | `submission-gateways/__tests__/fda-esg-sftp-ack.test.ts` (whole file); `fda-esg-hardening.test.ts:361-393`; `refused-before-wire.test.ts:22-28, 243, 259-267` (`AUDITED` `fda-esg.ts: 5`); `submission-service/__tests__/transmit-guard-refusal-releases-claim.test.ts:22-43, 130-172, 327-376` | §4 |
| Script | `scripts/fda-esg-uat-smoke.ts:185-187, 203-205, 291-293, 385, 448-452` (staging only, unguarded `new FdaEsgGateway()` at `:404`) | Its SFTP rows, the warning and the branch are removed (commit 2) |
| Copy that reaches a person | `server/services/market-specs/market-submission-specs.ts:190` ("FDA ESG (AS2 over HTTPS or SFTP)"); `scripts/ops/ga-readiness-report.mjs:168` ("FDA ESG (AS2/SFTP)"); `server/services/ana/AnaToolDefinitions.ts:1403` ("fetches the AS2 MDN / SFTP ack chain") | AS2 only (commit 2) |
| Docs | `docs/runbooks/fda-esg-production-uat.md` (`:4, 29, 58, 79-84, 168, 328, 367-392, 422-430, 448-449, 470-476, 491`); `docs/runbooks/esg-production-setup.md:14, 24, 44`; `docs/design/FEATURE_AND_SERVICE_INVENTORY.md:73` | Corrected (commit 2) |
| Dated history comments | `index.ts:198-200` (at `bda1d5aed`); `types.ts:437, 475` (at `bda1d5aed`); `governed-transmit-checks.ts:87`; `submission-service.ts:2351, 2423`; `shared/schema.ts:19562`; two migration comments; `transmit-refusals.test.ts:7, 78`; `tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:938` | **Left.** They record past defects. A migration comment is never edited, because that is RULE 1 drift for nothing |
| Present-tense comments | `index.ts:183` (at `bda1d5aed`): `refusedBeforeWire`'s doc lists "the FDA SFTP client-module refusal" among the current `NOTHING_TRANSMITTED` throw sites; `types.ts:50`: "(AS2 + SFTP)"; `ana-ri/mdx-command-handlers.ts:677`: "SFTP fallback". No session holds any of the three: slice 1 landed and released its holds (`3879fc7e0`), and the MDX journey holds none (`COORDINATION.md:26`) | **Corrected (commit 2).** Comment-only, under `Plan: F1` with a `Completes:` trailer each. In `index.ts`, the SFTP item leaves the present-tense list, and the dated 2026-09-23 note at `:198-200` stays (§10.1, R9) |
| Unrelated | `Transport = 'as2' \| 'sftp' \| …` (`types.ts:70`), kept because stored rows carry `'sftp'`; PMDA's `gateway_protocol` SFTP (`db/migrations/050, 082`; `market-submission-specs.ts:310`); `ICSR_GATEWAY_PROTOCOL='sftp'` in `icsr-gateway-transport.test.ts:604`; demo seeds | Untouched |

### 1.6 The size gates that exist today

- **The guard**, `evaluatePreTransmit` (`pre-transmit-check.ts:285`). It runs inside `getGateway`'s pre-wire try
  (`index.ts:269-295` at `bda1d5aed`), **before** `archiveSentPackage` (`:328`) and `impl.transmit` (`:338`).
  - Its refusal is `PreTransmitBlockedError` (`code: PRE_TRANSMIT_BLOCKED`).
  - The limits it holds: FDA 10 GB (blocks), EU 600 MiB (blocks), PMDA 1 GiB (warns only). Regions with no limit on file
    get no size check and a warning.
  - Its header defines its size check as "a fact about the channel, not a policy toggle … where the figure has a
    source" (`pre-transmit-check.ts:9-15`). The launch ceiling is neither, so it does not go into the guard (§10, C1 and
    C18 as revised).
- **The regional validator**, FDA-ESG-003 (`ectd-regional-rules.ts:115-122`), is an agency-rule validator. The launch
  ceiling is not an agency rule, so it is not added there. `ectd-regional-rules.test.ts:518` ("takes a 5 GiB FDA
  sequence … without a size finding") stays true.
- **Every non-FDA route already refuses more than 1 GiB before the wire:**
  - EMA and EUDAMED, by 600 MiB;
  - PMDA and Health Canada, by `UnverifiedTransportError`;
  - eight more, by `UNSOURCED_GATEWAYS` (`index.ts:69` at `bda1d5aed`).

  **Only FDA ESG sends more than 1 GiB through the branch being retired.**
- **"Before the wire" is not "before signing" for EMA and EUDAMED.** `gatewayTransportReadiness` reports a gateway
  outside `UNSOURCED_GATEWAYS` as `'unverified'` (`index.ts:402`). `sequenceTransmitReadiness`'s `gatewayRefusal` refuses
  only `'unavailable'` (`submission-service.ts:2624`). The regional rule EMA-CESP-004 is a warning, so the dispatch
  verdict does not block on it. An EU sequence over 600 MiB, on a configured route, is therefore refused by the guard's
  `checkGatewaySize`, after the transmit signature (the signature is voided, and nothing is sent). Whether the
  recorded words carry a before-signing refusal to that route is §9 question 1(a); this design does not widen to it.

### 1.7 SFTP account settings and credentials screens

- **None exist.** SFTP was three platform environment variables per environment: `FDA_ESG[_STAGING]_SFTP_HOST`,
  `_SFTP_USER` and `_SFTP_KEY_PATH` (`fda-esg.ts:58, 227-231`). No Terraform, workflow or readiness report provisions
  them.
- **`GatewayAccountsSetting.tsx`** (Admin and access → Settings, and the onboarding wizard) edits `GATEWAY_ACCOUNT_SPECS`
  (`server/services/submission-gateways/gateway-accounts.ts:56-81`). For `fda:esg` it holds the AS2 identifier, the
  certificate and the key, with **no SFTP field**. It serves AS2 and every other gateway, and **it stays as it is**.
- **`submission_gateway_credentials.credential_kind`'s comment** lists `'sftp_key'`
  (`migrations/20260509_submission_gateways.sql:93`). No code writes that kind. It stays (RULE 1).
- **A deployment that set the variables** (none is known) is left with three variables nothing reads. The runbook says to
  remove them from the secrets store.

### 1.8 History searches (RULE 3 step 2)

- This clone is **shallow**: `git rev-parse --is-shallow-repository` answers `true`, and its oldest commit is about
  2026-10-05.
- `git log --all --diff-filter=D --name-only -- '*sftp*' '*Sftp*' '*SFTP*' '*ESGSubmission*' '*esg-submission*'` finds
  nothing.
- `git log --all -S'transmitViaSftp'`: `1f8fd9839`, `cc4171c45`, `a811b0d83`, `fb80c5d10`, `bba77ef21`, `f304c87d9`,
  `8e2d0bd98`, `7f3b84ca5`, `62ff3edc3`, `e5cf44624`.
- `git log --all -S'ssh2-sftp-client'`: `1f8fd9839`, `c60cdcac2`, `8d5bbef3b`, `7696a007b`, `008fef640`, `cc4171c45`,
  `748ef32df`, `e1f3fd425`, `a811b0d83`, … (records, evidence and the 2026-10-17 integration).
- **The build re-runs all three on full history**, in a separate full clone (never `--unshallow` in this repository),
  and pastes their output into the deletion record.

### 1.9 The D7 session's proposals, checked

| Proposal (`docs/evidence/W5/2026-11-01/README.md`) | Verdict |
|---|---|
| "No FDA source in the repository documents an SFTP channel" (`:40`) | **Holds** (§1.3) |
| "The refusal comes only after signing, as a 500" (`:40`, `:94`) | **Holds.** The path is Gate 1, then the claim, then assembly, then the guard (it passes at 10 GB and archives the bytes), then `createTransmittalRow('sftp')`, then `CredentialError` or `TransportError`. The sequence route has no code mapping for either, so it answers `500 INTERNAL`, and it leaves an archived copy of a package that never left plus a 'rejected' transmittal row |
| "A `gateway-transport-limit` check in `pre-transmit-check.ts`" (`:95-96`) | **Not adopted** (revised, §10.1 R7). The guard's size check holds sourced channel facts only (its header, `:9-15`), and no transport limit is sourced. The sequence spine refuses at (b) and (c), and every other FDA caller at (e) in `fda-esg.ts`, before any transmittal row (§3.2) |
| "That needs `PRE_TRANSMIT_BLOCKED: 422` in `routes/submissions.ts`" (`:96`) | **Not needed for P-93.** The sequence spine refuses with `DISPATCH_BLOCKED` (422, `submission-service.ts:167`) before the guard. The 500 for every other guard refusal on the sequence route is real, and is owed separately, to RIM (§8) |
| "Refusing before signing needs the package size in `sequenceTransmitReadiness`" (`:97`) | **Holds** (§1.1, §1.2) |
| "`transmitViaSftp` stays until the founder decides" (`:98`) | **Superseded by P-93** |

---

## 2. The rules, as they apply here

- **RULE 0.** Push to `concept2cure-v2` only.
- **RULE 1.** No migration and no schema change. Stored `transport = 'sftp'` rows stay, and so does the `Transport`
  union. No migration comment is edited.
- **RULE 3.** §1 is the "What already exists" section. The work is "complete `sequenceTransmitReadiness`", "reach the
  launch ceiling into the existing package gate and the guard" and "retire `transmitViaSftp`". Nothing is rebuilt.
- **RULE 4.** No card, panel or screen. The refusal reads where these refusals already read:
  - Submission Center's notice;
  - the e-signature dialog's inline error;
  - the Dispatch tab.

  Commits 1 and 2 change no client file except one test.
- **RULE 5/6.**
  - Every commit carries `Plan: F1` and `Completes:` an existing path.
  - No new route file, file directly under `server/services/`, table, mount or AnA tool.
  - The constant and its sentence go into an existing file. The one new file is a test.
  - The deletion names its replacement by path, the history search, and the tests proving the replacement reachable (§5).
- **Part 11.**
  - A refusal before signing takes no signature.
  - A refusal at the act after a signature voids that signature through the existing P-23 path (`voidingSignatureOnRefusal`,
    `submission-service.ts:2686-2694`). That writes `GOVERNED_SIGNATURE_VOIDED`, and no `ECTD_TRANSMITTED` row.
  - No new governed act, so there is no new ceremony.
- **Fail closed, never fabricate.**
  - The ceiling is stated as Concept2Cure's launch scope, never as FDA's.
  - No agency channel is invented for the person.
  - A size is shown only when it was measured on the assembled package.

---

## 3. Design

### 3.1 One named constant, one sentence (`server/services/ectd/ectd-regional-rules.ts`, beside `FDA_GATEWAY_LIMIT_BYTES`)

This file already holds the package-size facts, and `pre-transmit-check.ts` already imports `FDA_OVERSIZE_REMEDY` from
it. The file is unheld, and no new file is needed.

```ts
/**
 * The largest package Concept2Cure sends to FDA at launch: 1 GiB (2^30 bytes). Founder decision P-93, 2026-11-02
 * (docs/LAUNCH_DEFINITION_OF_DONE.md, "P-93 — FDA sequences over 1 GiB are out of scope for launch"): "A sequence
 * over the size the documented channel takes is refused before signing … from sequenceTransmitReadiness."
 * The figure is the decision's heading. It is NOT an agency limit: the only FDA limit on file is 10 GB (FDA-ESG-003
 * above, Form 5640 v2.0), and no FDA source on file states a smaller AS2 limit. So no message states it as FDA's.
 * It is the threshold at which the retired SFTP branch took over (`> 1_073_741_824`), so every package that went
 * over AS2 before still does.
 */
export const LAUNCH_SEQUENCE_MAX_BYTES = 1024 ** 3;

/** The clause for a package over the launch ceiling, or null. Lower-case; each caller frames it. */
export function launchSequenceSizeRefusal(sizeBytes: number): string | null;
```

- **The comparison** is `sizeBytes > LAUNCH_SEQUENCE_MAX_BYTES`. A package of exactly 1 GiB is sent.
- **The clause** reads: `the package is 1.27 GiB, and at launch Concept2Cure sends packages of up to 1 GiB to FDA`.
  - The size is `(n / 2 ** 30).toFixed(2)` in GiB. When that rounds to "1.00", it says
    `just over 1 GiB (1,073,741,825 bytes)`, so the size never reads as equal to the limit.
  - Binary GiB only. The FDA 10 GB messages stay decimal (sweep VP-6), and the two are never mixed in one figure.
  - Pinned by tests: it contains neither `credentials configured` nor `is configured for` (the `transmitBlockedBy` regex,
    `SubmissionSeqWorkspaces.tsx:1763`), nor `gateway limit`, nor `GB` (existing tests filter blockers on those).
  - It does not say "Nothing was signed"; the client adds that.

### 3.2 Where the rule runs

| # | Site | When | Outcome |
|---|---|---|---|
| a | `assertSequencePackageable` (`submission-service.ts:1546-1601`), FDA only (`fda`, `:1555`) | Freeze, dispatch, renewal, and their prechecks | `DISPATCH_BLOCKED` before the freeze or dispatch signature, while the leaves can still change. **Beyond the record's letter** (it names readiness only); kept for the reason in §10 C1 and put to the coordinator in §9 question 4 |
| b | `sequenceTransmitReadiness`, FDA only and only when an `environment` is named, through (a)'s assembly with step `'transmit'`, judging the size clause only | The transmit precheck, on the click and in the dialog | `refusal` before the transmit signature. **This is the site the decision names** |
| c | `transmitDispatchedSequence`'s re-check (`:2878-2886`), FDA only (`fda`, `:2726`) | After assembly, before the gateway | `DISPATCH_BLOCKED` (422). The claim is released and the signature voided. This is the authority on the exact bytes |
| e | `FdaEsgGateway.transmit`, **in place of the deleted switch** (`fda-esg.ts:747-758`), commit 2 | Every caller that reaches FDA ESG's gateway: the package spine (`POST /api/mdx/gateways/:region/:gateway/transmit`, `mdx-submission-gateway.ts:343`), AnA's 510(k) transmit, and unguarded callers (`scripts/fda-esg-uat-smoke.ts`, tests). `REGISTRY['fda:esg']` is `new FdaEsgGateway()` (`index.ts:53`), so the guard reaches it too | `ValidationError(…, [], NOTHING_TRANSMITTED)` before `createTransmittalRow`: no transmittal row, and `refusedBeforeWire` releases a claim. AS2 is never handed more than 1 GiB, however the class is reached. The package spine's route answers 422 with its sentence (`mdx-submission-gateway.ts:470-474`) |

The guard check the first version put at site (d), `launch-sequence-size` in `evaluatePreTransmit`, is **dropped**
(§10.1, R7). The guard's size check holds sourced channel facts only (`pre-transmit-check.ts:9-15`). Site (e) already
refuses every FDA caller before any transmittal row. On the sequence spine, (c) refuses on the same bytes before the
guard is reached. What (d) alone added was refusing before `archiveSentPackage` (`index.ts:328`), which stores a blob and
writes no row. Every refusal raised inside a gateway already comes after that archive (a `CredentialError`, for one), so
that ordering is owed as its own F1 item for every in-gateway refusal (§8), not patched for one case.

- **One composition, two callers.** Sites (a) and (c) add the clause through one local helper in
  `submission-service.ts`, `packageBlockers(assembled, fda)`, which returns `assembledTransmitBlockers(assembled)` plus
  the clause when `fda`. Site (b) reads only the clause (§3.3).
  - `assembledTransmitBlockers` itself is not changed. It is region-blind, and six test files call it with partial
    objects.
- **No P-93 refusal leaves a claim or a transmittal row behind.**
  - Sites (a) and (b) run before any claim.
  - Site (c) releases its claim.
  - Site (e) runs before `createTransmittalRow`, and its proof releases a claim.

  So P-93 adds nothing to P-86's checks 2b or 3, and it creates no new 'transmitting' state.

### 3.3 `sequenceTransmitReadiness`: the change

Revised (§10.1, R6): readiness measures **only for an FDA sequence**, and judges **only the launch ceiling**. Running the
whole package gate at readiness for every region is a separate F1 repair, owed with its own red test (§8). It is not
carried inside P-93's commit.

- **What runs.** After every existing check clears, **only when the caller named an `environment`, and only when
  `canonicalRegionOf(seq.region) === 'US'`** (the condition readiness already computes at `:2618`), it calls
  `assertSequencePackageable(sequenceId, ctx, 'transmit', { judge: 'size' })`.
  - `judge: 'size'` is a new option of the existing function, passed by readiness only. The function assembles exactly
    as it does for freeze and dispatch (the binding's captured identity, `assembleSequence`). It then judges only
    `launchSequenceSizeRefusal(assembled.bundle.sizeBytes)`, never `assembledTransmitBlockers`, and cleans up.
  - An assembly that fails refuses. The size cannot be measured, so readiness cannot say the package is within the
    ceiling (fail closed). The sentence is §3.4's step-`transmit` one.
  - A `DISPATCH_BLOCKED` becomes `refusal`, the same catch `precheckGovernedStep` already uses for freeze (`:1731-1738`).
  - `isConversionCapacityError` and any other error pass through. The route answers 503 with Retry-After, and the client
    says the check "could not be checked … Nothing was signed".
  - The code shape is `const before = <the existing chain>; const refusal = before ?? (environment && fda ? await
    sizeRefusal() : null);`.
- **Why it is gated on `environment`.**
  - The TransmitPanel's mount read sends none (`SubmissionSeqWorkspaces.tsx:1952`). It stays a cheap read of where the
    sequence would go, with no assembly and no `ECTD_ASSEMBLED` row each time the tab opens.
  - The click and dialog prechecks send it (`SubmissionCenter.tsx:801-805`, `:845`), and they are the ones before a
    signature.
- **Why FDA only, and size only.**
  - The record decides a size refusal for FDA sequences, from readiness. A non-FDA precheck keeps answering without
    assembling, and without the converter, exactly as today. Its routes are reported `'unverified'`, not
    `'unavailable'`, so an organization with EMA, PMDA or Health Canada credentials would otherwise assemble on every
    click.
  - Today the package gate's other blockers surface only at the act, for every region. At the act, (c) refuses them
    and voids the signature. Moving them before the signature changes readiness for every region and step, which P-93
    does not ask for. It also has a narrow benefit for a dispatched sequence, whose package gate already ran at dispatch
    over leaves that have been locked since freeze. That is owed as its own F1 repair, with the red case named in §8.
  - P-94 does not depend on this. Readiness refuses an unapproved authored leaf through the dispatch verdict (`gate`,
    `evaluateReleaseApprovalGate`), and P-94's design extends that same path to onboarding uploads (§7).
- **The doc comment** (`:2565-2574`) gains: "and, for an FDA sequence when an environment is named, the launch ceiling
  transmit applies after assembly (assertSequencePackageable with judge 'size'; P-93). The rest of transmit's package
  re-check is judged at the act." That last clause is true, unlike today's "same functions, same order".
- **The cost.**
  - One assembly per FDA transmit precheck, as freeze and dispatch already pay: the click, the dialog, then the act. Each
    writes `ECTD_ASSEMBLED`, as `:1700-1704` documents.
  - The assembly is skipped whenever an earlier check refuses, for example missing credentials, and for every non-FDA
    sequence.

### 3.4 The size clause's tails (`assertSequencePackageable`)

Revised (§10.1, R6). The tails that exist today are **unchanged**, and they are still worded by `step`. The dispatch
tail "Fix it while the leaves can still be changed." is false today, because dispatch needs a frozen sequence. That
predates P-93, and it is owed as its own F1 repair with its own red test (§8). P-93 words only what it adds: the size
clause's tail, and the tails of the new step `'transmit'` (readiness is its only caller). Those depend on
`isSequenceLocked(sequence.status)` (`:229-232`, the existing pure rule):

| Where | Leaves changeable (draft or validated: freeze) | Leaves locked (frozen or dispatched: dispatch, renewal, and readiness's `'transmit'`) |
|---|---|---|
| The size clause is among the blockers (`:1589-1596`) | The existing tail ("Transmit would refuse this package, and once the sequence is frozen its leaves can no longer be changed."), preceded by: "Remove some of its leaves and place them in a later sequence, so that each package is 1 GiB or less." | "The sequence is `<frozen\|dispatched>`, so its leaves can no longer be changed, and it cannot be sent as it is." It replaces the existing tail only when the size clause is present. Without it, the message is unchanged |
| Step `'transmit'`: identity missing (`:1576`) | — | "Nothing can be sent." |
| Step `'transmit'`: assembly failed (`:1584`) | — | "Refusing to transmit: the sequence does not assemble into a package (`<reason>`), so its size cannot be measured, and nothing can be sent." |

**The retire sentence, only where P-86's own rule allows it** (revised, §10.1 R2). Once P-86 has landed, the locked
size tail continues with one of three sentences, chosen by P-86's own rules, imported from
`sequence-retirement.ts` and never copied:
- `retirementRefusal(await readRetirementFacts(pool, sequence, ctx.organizationId))` is null: "Retire it to free its
  number, and place its content in sequences of 1 GiB or less."
- It is not null: P-86's refusal sentence, verbatim. For example, check 3 gives "A send of sequence 0003 to the agency's
  production environment is recorded on 2026-10-20 UTC, so it cannot be retired. …". The person reads why, and is never
  told to retire a sequence that cannot be retired (P-86's own rule, p86 design `:409`).
- The read fails (`INVALID_STATE`): "Whether it can be retired could not be checked." The size refusal stands either
  way.

Until P-86 lands, no retire sentence is written: no sentence describes an act that does not exist, and repair A's design
applies the same rule. Whichever of P-86 and P-93 lands second adds this composition, with the test in §4 (test 1, case
(f)).

### 3.5 What a person sees, by state (FDA sequence, package 1.27 GiB)

| State | Where | What they read |
|---|---|---|
| Draft or validated; they click Freeze | Submission Center notice; no e-signature opens | "Freeze of sequence 0003 not started — Refusing to freeze: the package is 1.27 GiB, and at launch Concept2Cure sends packages of up to 1 GiB to FDA. Remove some of its leaves and place them in a later sequence, so that each package is 1 GiB or less. Transmit would refuse this package, and once the sequence is frozen its leaves can no longer be changed. Nothing was signed." |
| Frozen before P-93; they click Dispatch | The same notice | "Dispatch of sequence 0003 not started — Refusing to dispatch: the package is 1.27 GiB, and at launch Concept2Cure sends packages of up to 1 GiB to FDA. The sequence is frozen, so its leaves can no longer be changed, and it cannot be sent as it is. Nothing was signed." |
| Dispatched, 'pending' or 'rejected'; they open Dispatch | The TransmitPanel | As today: the destination facts and an enabled Transmit button. The mount read does not measure |
| The same; they click Transmit | The notice; no e-signature opens | "Transmit of sequence 0003 not started — Refusing to transmit: the package is 1.27 GiB, … The sequence is dispatched, so its leaves can no longer be changed, and it cannot be sent as it is. Nothing was signed." |
| They passed the click; the dialog's precheck refuses (only if something moved) | The dialog, inline | The same sentence. No signature |
| The act's assembly is over 1 GiB though the precheck's was not (bytes at the boundary) | Transmit's error, with the existing voided-signature copy | "Transmit blocked — the package is just over 1 GiB (1,073,741,9xx bytes), and at launch Concept2Cure sends packages of up to 1 GiB to FDA. Nothing was sent." The signature is void, and the sequence is still 'pending' |
| Dispatched, over 1 GiB, carrying a bound production transmittal (for example a 'rejected' SFTP-branch row, §6.1); P-86 has landed | The notice | The transmit sentence above, then P-86's own refusal sentence (§3.4). It never says "Retire it" |
| 'transmitting' (a held send) | Readiness | `resendRefusal` first, as today ("already in flight … confirm at the agency"). The size is never measured on a held send. Whether P-92 can settle it depends on how it is held (§6.1, §7) |
| Package of 1 GiB or less | Everywhere | Nothing changes. An FDA transmit precheck takes as long as one assembly |
| Package spine or AnA 510(k) transmit to FDA, over 1 GiB, **after commit 2** | The route's 422 (`mdx-submission-gateway.ts:470-474`) or the AnA handler's refusal | Site (e): "Refusing to transmit to FDA: the package is 1.27 GiB, and at launch Concept2Cure sends packages of up to 1 GiB to FDA. Nothing was sent." No transmittal row is written. The guard has archived the bytes first, as it does for every refusal raised inside a gateway (owed, §8) |
| The same, between commit 1 and commit 2 | As today | Today's behaviour, unchanged: the SFTP branch refuses before any connection (`CredentialError` 412 or `TransportError` 502), and nothing is sent. Both commits go in one push, so no deployed build carries commit 1 alone (§4) |
| Any non-FDA region | — | Unchanged. Readiness does not assemble |

**What the person can do.**
- Before freeze, they remove leaves and place them in a later sequence, using the Builder's existing leaf remove and
  place in `SubmissionSeqWorkspaces.tsx`.
- After freeze, the leaves are locked. Concept2Cure offers nothing until P-86 lands, and the sentence says so plainly.
  After P-86 lands, they retire the sequence (signed) and re-place its content, **but only when P-86's own rule clears
  it**. A sequence with a bound production transmittal is refused by P-86 check 3, and the sentence says so (§3.4).
  Such a sequence has no way on until §9 question 2 is answered (§7).
- No physical media and no "file it another way". FDA keeps physical media for sequences over 10 GB, and the second is
  a product call that P-86's filed-elsewhere rules govern.

---

## 4. The commits, in order

Both commits come after F1 slice 1, slice 2 and repair A, which share `submission-service.ts`. They come in this order
so that no commit ever hands AS2 a body over 1 GiB:
- From commit 1 on, the **sequence spine** never reaches the SFTP branch: (b) refuses before signing, and (c) refuses
  at the act before the gateway.
- Between commit 1 and commit 2, the **package spine** and AnA's 510(k) transmit keep today's behaviour over 1 GiB
  (revised, §10.1 R7). The guard passes the package (10 GB), and the SFTP branch refuses it before any connection
  (`CredentialError` or `TransportError(NOTHING_TRANSMITTED)`), so nothing is sent. That is not a regression, and AS2 is
  still never handed more than 1 GiB.
- Commit 2 puts (e) in place of the switch, so from then on every FDA caller is refused before any transmittal row.
- **Both commits go in one push.** No deployed build carries commit 1 without commit 2. The pre-push gates run on the
  push, and the evidence README records both commit ids.

### Commit 1: "D7: an FDA package over 1 GiB is refused before anyone signs (P-93)"

- **Trailers:**
  - `Plan: F1`;
  - `Completes: server/services/submission-service/submission-service.ts`;
  - `Completes: server/services/ectd/ectd-regional-rules.ts`.

  The body quotes P-93's recorded heading and operative sentence (§0), and cites row D7.
- **Files:**
  - `ectd-regional-rules.ts` (§3.1);
  - `submission-service.ts` (§3.2 a–c, §3.3, §3.4, and the doc comment);
  - the tests below;
  - evidence `docs/evidence/D7-ONE-GIB-LAUNCH-CEILING/<date>/README.md`. It quotes the recorded P-93 text, and it carries
    the coordinator note of §9 question 1(b): the 1 GiB is the record's heading, not FDA's documented limit.
- **Not touched:** `pre-transmit-check.ts` (the guard check of the first version is dropped, §3.2).
- **Migration:** none.
- **Tests, red first, each run saved under the evidence folder:**
  1. **New** `server/services/submission-service/__tests__/launch-sequence-size.pglite.test.ts`, on `_freeze-gate-fixture.ts`
     (slice 1's version). The real assembler is wrapped so that a holder overrides `bundle.sizeBytes`, the pattern of
     `dispatch-reauthorization.pglite.test.ts:17-22`.
     - **(b) readiness.** `precheckGovernedStep(…, 'transmit', …, { environment: 'staging' })` on a dispatched FDA
       sequence of 2^30 + 1 bytes answers `cleared: false` with the sentence. It leaves `dispatch_status` unchanged,
       writes no signature row and no `submission_transmittals` row, and the sentence fails the
       `transmitBlockedBy` regex.
     - At 2^30 the same call answers `cleared: true`.
     - With no `environment`, `assembleSequence` is not called.
     - **(c') FDA only.** A dispatched non-US sequence (an EU national filing on `ema:cesp`) with an environment named,
       and with its route configured so every earlier check clears (the test sets the route's variables or stubs
       `isConfigured` to true), answers `cleared: true`, and `assembleSequence` is not called.
     - **(d') size only (a scope pin).** A dispatched FDA sequence of 2^30 bytes whose assembly reports a non-size
       blocker (`assembledTransmitBlockers` wrapped to return one) answers `cleared: true` at readiness. The act still
       refuses it at (c), as today. The owed F1 repair "readiness runs the whole package gate" (§8) turns this exact case
       into its red test.
     - **(e') unmeasurable.** A dispatched FDA sequence whose assembly throws answers `cleared: false` with "so its size
       cannot be measured, and nothing can be sent".
     - **(a) freeze precheck and freeze.** A validated FDA sequence of 2^30 + 1 bytes is refused before the signature,
       with "Remove some of its leaves". **Dispatch** of a frozen one, and **dispatch renewal** of a dispatched one, are
       refused with "The sequence is `<frozen|dispatched>`, so its leaves can no longer be changed". Neither contains
       "Retire".
     - A non-US sequence of 2^30 + 1 bytes is not refused on size at the freeze precheck. The freeze precheck is used
       because it does not depend on the gateway.
     - **(f) the retire sentence, added by whichever of P-86 and P-93 lands second.** A dispatched FDA sequence of
       2^30 + 1 bytes:
       - with a bound production 'rejected' transmittal (`transport 'sftp'`, `metadata.environment 'production'`,
         `dispatchBinding.sequenceId` = its id): readiness refuses, the refusal contains P-86's check-3 sentence, and it
         does not contain "Retire";
       - with none (and nothing else P-86 refuses): the refusal contains "Retire it to free its number".
  2. `server/services/submission-service/__tests__/transmit-guard-refusal-releases-claim.test.ts`. The describe block
     "the FDA SFTP branch refusing before connect" (`:327-376`) is **replaced in place** by one case on the same input:
     - the input is a 2^30 + 1 byte FDA sequence, with AS2 credentials set;
     - it is refused with `DISPATCH_BLOCKED` and `/Transmit blocked — the package is/`;
     - the claim is released (`'pending'`, `resendRefusal` null);
     - `FdaEsgGateway.prototype.transmit` is never called, and storage `put` is never called.

     Also in this file:
     - `integrity.ignoreSize` (`:156-172`, reset at `:241`) and the storage size override (`:130-146`) go, because only
       the SFTP cases used them;
     - the header (`:22-28`, `:40-43`) is updated;
     - build on slice 1's version (`LEAF_MANIFEST`).
     - Note for the build: the guard is **not** what refuses here. The helper reads `bundle.sizeBytes` itself, and only
       `assembledTransmitBlockers` is mocked (`:179`).
  3. `client/src/concept2cure/v2/__tests__/submissionCenterLifecycleQa.test.tsx`, modelled on `:254`:
     - the mount precheck clears;
     - the click precheck, with an environment, refuses with the size sentence;
     - the notice ends "Nothing was signed.";
     - `/api/c2c/actions/sign` is never called.
  - **The first version's tests 3 and 4** (`pre-transmit-check.test.ts`, `sent-package-kept.test.ts`) are dropped with
    site (d). Those files are not touched.
  - **Existing tests that now assemble at readiness.** `refused-step-voids-signature.pglite.test.ts:231` (`matching`
    clears) is a US sequence on the real assembler, and must stay green. Every other transmit-precheck test refuses
    earlier, or is not US.
- **Mutations** (each must turn a named test red):

  | Mutation | Red |
  |---|---|
  | Readiness without the size check | Test 1 (b) |
  | `>` → `>=` | The 2^30 cases in test 1 (and, in commit 2, `fda-esg-hardening`'s) |
  | Drop the clause at (a) | Test 1 (a) |
  | Drop it at (c) | Test 2 (the guard passes the package at 10 GB, and storage `put` and the gateway's `transmit` are called) |
  | Readiness assembles without an environment | Test 1, no-environment case |
  | Readiness assembles for a non-US sequence | Test 1 (c') |
  | Readiness judges the whole package gate | Test 1 (d') |
  | Readiness clears an assembly that fails | Test 1 (e') |
  | The locked size tail gives the unlocked advice | Test 1 (a), dispatch and renewal cases |
  | The clause applied to every region | Test 1, non-US freeze case |
  | The retire sentence without P-86's rule (whichever lands second) | Test 1 (f), bound-production case |

- **Running app (RULE 4).** Revised (§10.1, R3): the recipe makes an agency send impossible, and it measures the
  package rather than its inputs.
  - **No byte can reach FDA.** The dev organization's staging FDA ESG account is configured with locally generated
    certificate and key pairs, including the FDA encryption certificate, and with `FDA_ESG_STAGING_URL` at
    `https://esg.example.invalid`, as `transmit-guard-refusal-releases-claim.test.ts:218` does. `isConfigured`
    (`fda-esg.ts:708-731`) only checks that these load, so readiness reaches the package gate. No real FDA test-ESG
    credential is used, so even a refusal that failed could send nothing.
  - **The package is measured, not its inputs.** The leaves are synthetic PDFs of incompressible content (random bytes
    in a stream), about 1.2 GiB in total. PDF/A normalisation and DEFLATE cannot bring that under the ceiling.
    - Before any click, the assembled size is read from the existing dry-run assembly,
      `POST /api/submissions/sequences/:seqId/assemble` (`server/routes/submissions.ts`, which answers `sizeBytes`).
    - The size must be over 2^30 with a margin of at least 64 MiB, because the dry run's placeholder identity differs
      from the record's by a few bytes.
    - The README records the measured byte count beside the screenshots. If the margin is not met, the content is
      enlarged before any click.
  - (i) On commit 1's build: a validated sequence, then click Freeze. The refusal is shown, and nothing is signed.
  - (ii) Dispatch a sequence on the build before commit 1, then switch to commit 1's build, open Dispatch, and click
    Transmit. The refusal is shown, and the e-signature never opens. If it opens, the tester cancels it, never signs,
    and records a failure.
  - If (ii) cannot be produced, report it as **blocked** on that evidence, not done. There is no setting that lowers the
    ceiling for a test (§10, C9).

### Commit 2: "D7: FDA ESG's SFTP branch is retired; the 1 GiB refusal replaces it (P-93)"

- **Trailers:**
  - `Plan: F1`;
  - `Completes: server/services/submission-gateways/fda-esg.ts`;
  - `Completes: scripts/ci/check-server-bundle-prod-imports.mjs`;
  - `Completes: scripts/fda-esg-uat-smoke.ts`;
  - `Completes: docs/runbooks/fda-esg-production-uat.md`;
  - `Completes: server/services/market-specs/market-submission-specs.ts`;
  - `Completes: scripts/ops/ga-readiness-report.mjs`;
  - `Completes: server/services/ana/AnaToolDefinitions.ts`;
  - `Completes: server/services/submission-gateways/index.ts`;
  - `Completes: server/services/submission-gateways/types.ts`;
  - `Completes: server/services/ana-ri/mdx-command-handlers.ts`.

  The body carries §5.
- **`fda-esg.ts`.**
  - **Delete:**
    - `FdaEsgCredentials.sftp*` (`:111-113`) and their reads (`:227-231`);
    - in `fdaEsgTransportImplementation`, the probe, `sftpAvailable` and the `ssh2-sftp-client` entry (`:242-246`),
      and `sftpAvailable` from its return type;
    - `sftpApplicationId` (`:337-356`);
    - `transmitViaSftp` and its section (`:621-683`);
    - `useSftp`, `transport` and `sftpTarget` (`:747-758`);
    - the SFTP branch (`:775-808`);
    - the imports `createRequire`, `usableIdentifier` and `requiredAgencyMetadata`, whose only uses were in the deleted
      code (`:347`, `:757`).
  - **Narrow:** `createTransmittalRow(req)` writes `'as2'`.
  - **Replace, in place of the switch, before the row:** site (e). When
    `launchSequenceSizeRefusal(normalizedReq.bundle.sizeBytes)` returns a clause, it throws
    `new ValidationError('Refusing to transmit to FDA: ' + clause + '. Nothing was sent.', [], NOTHING_TRANSMITTED)`.
    The clause is imported from `ectd-regional-rules.ts`, never copied.
  - **Rewrite as AS2 only:**
    - the header (`:1-73`), dropping item 2, the SFTP variable row and the "> 1 GB fall to SFTP" text;
    - the class comment (`:703-706`);
    - the `checkStatus` and `downloadAcknowledgment` comments.
- **Present-tense comments elsewhere, corrected** (revised, §10.1 R9; comment-only, no behaviour):
  - `submission-gateways/index.ts:183` (at `bda1d5aed`): `refusedBeforeWire`'s doc drops "the FDA SFTP client-module
    refusal" from its list of current `NOTHING_TRANSMITTED` throw sites. The dated 2026-09-23 note at `:198-200` stays,
    because it records a past defect;
  - `submission-gateways/types.ts:50`: "FDA Electronic Submissions Gateway (AS2)". `Transport`'s `'sftp'` (`:70`)
    stays, because stored rows carry it (§10, C10);
  - `ana-ri/mdx-command-handlers.ts:677`: "SFTP fallback" is dropped from the list of what lives in `fda-esg.ts`.
- **The gate.** Delete `RUNTIME_EXCEPTIONS['ssh2-sftp-client']`
  (`scripts/ci/check-server-bundle-prod-imports.mjs:68-72`).
- **Tests.**
  - **Delete** `submission-gateways/__tests__/fda-esg-sftp-ack.test.ts`. Its property (an SFTP deposit is in transit,
    never an acknowledgement) has no subject left. AS2's "no fabricated acknowledgement" stays pinned by
    `fda-esg-hardening.test.ts`'s MDN cases and `fda-esg-receipts.pglite.test.ts`.
  - `fda-esg-hardening.test.ts:361-393` is **replaced in place**:
    - 2^30 + 1 is refused with `errorClass: 'validation'`, `transmitted: false`, the sentence, and no
      `INSERT INTO submission_transmittals`;
    - exactly 2^30 reaches the AS2 path: one `INSERT` with `'as2'` as the transport parameter;
    - the identifier-traversal cases go. Their path (`/incoming/<app>/`) no longer exists, and the sequence spine still
      applies the identifier rule through `transmitApplicationNumberRefusal`.
  - `refused-before-wire.test.ts`:
    - `AUDITED['…/fda-esg.ts']` goes from 5 to 4 (the sites remaining are `:166, 199, 266, 289`), and its comment;
    - the header (`:22-28`) and the comment at `:266`;
    - the literal at `:243` becomes a variable that still exists (`FDA_ESG_STAGING_URL`).
- **The script.** `scripts/fda-esg-uat-smoke.ts` loses its SFTP fields, rows and warning (`:185-187, 203-205, 291-293,
  385`) and its `transport === 'sftp'` branch (`:448-452`).
- **Copy, AS2 only.**
  - `market-submission-specs.ts:190` reads "FDA ESG (AS2 over HTTPS)".
  - `ga-readiness-report.mjs:168` reads "FDA ESG (AS2)".
  - `AnaToolDefinitions.ts:1403` reads "For FDA ESG, returns the transmittal's stored status and its verified AS2
    receipt" (`fda-esg.ts:871-893`, `source: 'stored'`).
  - Run `npm run manifest:ana` and keep its diff **only** if it is that one description. If the generated manifest
    carries other drift, leave the manifest alone and name it in the README (it has no drift gate).
- **Docs.**
  - `fda-esg-production-uat.md`:
    - remove the SFTP prerequisites and variables (`:29, 58, 79-84`);
    - replace §8 (`:367-392`) and its checklist (`:422-430`) with "A sequence over 1 GiB is refused before signing
      (P-93)", quoting the refusal verbatim and the operator queries (§6);
    - remove the troubleshooting rows (`:448-449`) and the known gaps (`:470-476`);
    - fix `:4, 168, 328, 491`;
    - add "remove any `FDA_ESG*_SFTP_*` secret".
  - `esg-production-setup.md`: drop `:14`, the `:24` row and the "(or SFTP)" at `:44`.
  - `FEATURE_AND_SERVICE_INVENTORY.md:73`: AS2 only, with the 1 GiB launch ceiling.
- **Migration:** none. `package.json` and `package-lock.json` are unchanged, and no `npm install` or `npm uninstall`
  runs.
- **Red first.** Delete the code before touching the tests and the gate. Save these runs:
  - `refused-before-wire` fails (5 ≠ 4);
  - `fda-esg-sftp-ack` fails (no SFTP branch);
  - `fda-esg-hardening`'s old SFTP cases fail;
  - `npm run build && npm run ci:server-bundle-prod-imports` fails with "RUNTIME_EXCEPTIONS lists ssh2-sftp-client, which
    the bundle no longer imports. Remove the entry." This is the gate's own failing case. Save it.

  Then make the changes and save the green runs.
- **Mutations:**
  - drop site (e): the `fda-esg-hardening` replacement goes red (AS2 is reached and a row is inserted);
  - `>` → `>=` at (e): its 2^30 case goes red.
- **What a person sees.** On the sequence spine, nothing new: the refusal from commit 1 is unchanged. On the package
  spine and AnA's 510(k) transmit, an FDA package over 1 GiB is now refused with (e)'s sentence as a 422, where it used to
  be a 412 naming SFTP variables or a 502 (§3.5). The market spec's gateway label reads AS2 only.

### Gates

- **Must shrink in commit 2:**
  - `RUNTIME_EXCEPTIONS`, by 1 entry;
  - `AUDITED` in `refused-before-wire.test.ts`, `fda-esg.ts` from 5 to 4.
- **Must stay green, re-run in both commits:**
  - `ci:sql-interpolation` (`sql-interpolation-baseline.json` `fda-esg.ts: 4`; the deleted code has no SQL);
  - `ci:pushed-lint-errors` (the unused imports go);
  - `ci:pushed-lint-warnings` (the helper keeps `transmitDispatchedSequence`'s complexity flat);
  - `ci:pushed-typecheck`;
  - `ci:one-design-plan` and `ci:one-product`;
  - `ci:untracked-imports`;
  - `audit:repo-health:ceiling`;
  - `ci:server-error-leaks`;
  - `ci:server-bundle-prod-imports:selftest`;
  - `ci:validation-traceability` (no URS cites the deleted test; only dated evidence logs name it).

---

## 5. The deletion record (commit 2's message)

- **Deleted**, all in `server/services/submission-gateways/fda-esg.ts`:
  - `transmitViaSftp` and `sftpApplicationId`;
  - FDA ESG's size switch and its SFTP branch;
  - the SFTP credential fields;
  - the `ssh2-sftp-client` probe and its `missingDependencies` entry.

  Also deleted: `RUNTIME_EXCEPTIONS['ssh2-sftp-client']` (`scripts/ci/check-server-bundle-prod-imports.mjs`),
  `server/services/submission-gateways/__tests__/fda-esg-sftp-ack.test.ts`, and the SFTP rows of
  `scripts/fda-esg-uat-smoke.ts`.
- **The user outcome it delivered.** An FDA package over 1 GiB was routed to SFTP. No image ever shipped the module,
  so every attempt was refused after the signature: it answered 500, left a stored copy of a package that never left,
  and left a 'rejected' transmittal row.
- **The decision.** P-93, quoted from `docs/LAUNCH_DEFINITION_OF_DONE.md` (§0): "The undocumented SFTP transmit
  (`transmitViaSftp`, `ssh2-sftp-client`) is retired: removed, its reachable replacement being that refusal, named by
  path in the removing commit (working agreement)."
- **The reachable replacement, by path.** An FDA sequence over 1 GiB is refused by name before anyone signs:
  - `sequenceTransmitReadiness`, `assertSequencePackageable` and `transmitDispatchedSequence` in
    `server/services/submission-service/submission-service.ts`;
  - reached by `POST /api/submissions/sequences/:seqId/governed-precheck` (`server/routes/submissions.ts`), from
    `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` (`precheckRefusal`) and the Dispatch tab
    (`SubmissionSeqWorkspaces.tsx`);
  - every other FDA caller (the package spine, AnA's 510(k) transmit, unguarded callers) is refused before any
    transmittal row by `FdaEsgGateway.transmit` in `server/services/submission-gateways/fda-esg.ts`;
  - the ceiling is `LAUNCH_SEQUENCE_MAX_BYTES` (`server/services/ectd/ectd-regional-rules.ts`).
- **Proven reachable by:**
  - `launch-sequence-size.pglite.test.ts` (readiness, freeze, dispatch and renewal);
  - `transmit-guard-refusal-releases-claim.test.ts` (the act, on the same input the deleted cases used);
  - `fda-esg-hardening.test.ts` (the gateway, for every caller);
  - `submissionCenterLifecycleQa.test.tsx` (the screen);
  - the running-app record in `docs/evidence/D7-ONE-GIB-LAUNCH-CEILING/<date>/README.md`;
  - the gate `ci:server-bundle-prod-imports`, shown red with the stale entry.
- **History searches.** The three commands in §1.8, re-run on full history, with their output.
- **The dependency.** "`ssh2-sftp-client` was never declared in `package.json` or `package-lock.json`. Nothing was
  installed or uninstalled, and the lockfile is unchanged (`git diff --exit-code package.json package-lock.json`;
  `npm ls ssh2-sftp-client` is empty)."

---

## 6. Deployed tenants

### 6.1 A sequence 'transmitting' through the SFTP branch

Revised (§10.1, R1 and R8). The first version said P-92's act settles every SFTP-branch hold. It cannot settle the ones
this section named, because none of them is bound.

- **No byte ever left over SFTP from an image built from this repository.** The production stage runs
  `npm ci --omit=dev` from a lockfile without the module, the gate records "the image cannot send over SFTP", and no
  deployment provisions the variables. So every SFTP-branch attempt ended before `connect()`. Its row was written with
  `transport = 'sftp'`, set `'in_transit'` before the SFTP call (`fda-esg.ts:773`), and then normally `'rejected'` by
  `recordTransmitFailure` (`:595-619`).
- **Every hold the branch could leave, by when it was claimed.** Since the 2026-09-23 repairs, the module and credential
  refusals release the claim (`refusedBeforeWire`, `index.ts:175-209` at `bda1d5aed`). Before them, they did not.

  | Claimed | How it could be held | Its binding | Who can settle it |
  |---|---|---|---|
  | Before 2026-09-23 | `CredentialError` or `TransportError(NOTHING_TRANSMITTED)` were not counted as "refused before the wire", so "every such sequence was stranded" (`index.ts:198-200`) | **None** | Nobody (below) |
  | 2026-09-23 to 2026-10-17 | Those refusals release the claim. Only an error that is not "refused before the wire" holds it: the gateway's own integrity read refusing at `:782` (a `ValidationError` without the proof; the row is 'rejected', `gateway`), or a database failure after the row was created | **None** | Nobody (below) |
  | After 2026-10-17 | The same rare errors | **Bound**: S and A on the sequence, `metadata.dispatchBinding` on the row (`fda-esg.ts:378`) | P-92's release, on FDA's written confirmation (below) |

  - **Why the first two are unbound.** The per-attempt binding arrived with
    `migrations/20261014_ectd_transmit_attempt_binding.sql` and its code, in `e1f3fd425` (2026-10-17).
    `git log -S'transmit_attempt_id'` on `submission-service.ts` and that migration, and `git log -S'dispatchBinding'` on
    `fda-esg.ts`, each give only `e1f3fd425`.
  - At the shallow root `0c2943f1b` (2026-10-05), `claimTransmitSlot` writes `SET dispatch_status = $3, updated_at =
    NOW()` and nothing else. The migration's own rule is "Nullable for legacy rows; never infer a binding."
  - No later path can bind such a hold, because the claim's compare-and-set admits only NULL, 'pending' or 'rejected',
    never 'transmitting' (`submission-service.ts:2468-2473`).
  - The boundary is the columns, not a date. The migration file is dated 2026-10-14 (P-92's design says "after
    2026-10-14"), and it reached trunk on 2026-10-17. Query 2 below classifies each hold by its own columns.

- **A legacy (unbound) hold has no exit.** Such a sequence:
  - cannot be sent again: `resendRefusal` refuses 'transmitting' (`submission-service.ts:2321-2324`);
  - cannot be settled by P-92: E1 refuses a claim with S or A null (row L; `p92-settle-held-fda-send.design.md`, E1 at
    `:398` and row L at `:107`, as read at 04:15 on 2026-11-02), and its A13 rejects inferring a binding (`:996`);
  - cannot be settled by a receipt: `ingestFdaAs2Receipt` selects `transport = 'as2'` (`fda-esg-receipts.ts:29, 70`);
  - cannot be retired: P-86 check 2b refuses 'transmitting' (`p86-retire-unfiled-sequence.design.md:405`);
  - holds its number against a replacement that shares a lifecycle key with it (`filingOrderRefusal`,
    `submission-service.ts:1460-1533`).

  **What may settle a legacy unbound hold is a founder question.** P-92's revised design already asks it as its Q11
  (`:971-976`), so this design asks it once, jointly with that Q11, and not as a second question (§9 question 5). Until it is answered, the runbook says: **the hold stays as it is, and is escalated to the
  coordinator. It is never patched by hand**: no `UPDATE` of `dispatch_status`, and no binding inferred.
  - A legacy hold needed AS2 credentials configured and a package over 1 GiB. It is probably zero (D7 records no real
    FDA send, and `ga-readiness-unconfigured.json` shows FDA ESG unconfigured), but it is not provably zero. The second
    query below finds it.
  - **P-92's design agrees, as revised.** Its first version called these settleable (H5, and its §6 row for P-93). Its
    revision (§9.1 finding 7 there) now says "Every one is a legacy claim (L)" (H5, `:102`), names the bound kind H5′
    (`:103`), and tells this lane that "P-93's removing commit must not name P-92 as the remedy for those rows". This
    design's §5 does not name P-92 at all.
- **A bound SFTP-branch hold (claimed after 2026-10-17) is P-92's.** E2 has no `transport` filter, so P-92 can release
  it as not received. The recorded decision allows that "only on FDA's written confirmation of non-receipt", with "No
  settlement without the agency document".
  - Whether a narrower path is wanted for a send the platform's own record proves never left is **P-92's open Q3**
    (`p92-settle-held-fda-send.design.md:932-935`, which names H5′, its name for these rows). Its answer applies to them. This design defers to it and
    does not ask it again (§10 C8, revised).
  - After a release, the sequence is 'pending' and over 1 GiB. Readiness refuses it on size, and P-86 check 3 refuses
    its retirement, because a bound production row stays, whatever its status. It has no way on until §9 question 2 is
    answered (§7).
- **What P-93 does to them: nothing.** There is no migration and no rewrite of `dispatch_status`. Readiness answers
  them through `resendRefusal` before any size check.
- **Operator queries.** These are read-only, run on each deployed database, and carried in the README and the runbook:

```sql
-- 1. every attempt the SFTP branch recorded
SELECT t.id, t.organization_id, t.status, t.error_class, left(t.error_message, 160) AS error,
       t.transmission_id, t.bundle_size_bytes, t.created_at, t.metadata->>'environment' AS environment,
       t.metadata->>'sequence' AS sequence_number, t.metadata->'dispatchBinding'->>'sequenceId' AS bound_sequence_id
  FROM submission_transmittals t
 WHERE t.region = 'fda' AND t.gateway = 'esg' AND t.transport = 'sftp'
 ORDER BY t.created_at;

-- 2. sequences still held, classified as P-92's E1 reads them (S or A null is row L)
SELECT s.id, s.organization_id, s.sequence_number, s.dispatch_status,
       s.transmit_signature_action_id, s.transmit_attempt_id, s.updated_at,
       CASE WHEN s.transmit_attempt_id IS NULL OR s.transmit_signature_action_id IS NULL
            THEN 'legacy hold, not settleable by P-92'
            ELSE 'bound hold' END AS hold_kind,
       b.transports AS bound_transports
  FROM ectd_sequences s
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT t.transport, ',') AS transports
      FROM submission_transmittals t
     WHERE t.organization_id = s.organization_id
       AND t.metadata->'dispatchBinding'->>'sequenceId' = s.id::text
       AND t.metadata->'dispatchBinding'->>'attemptId' = s.transmit_attempt_id::text
  ) b ON true
 WHERE s.dispatch_status = 'transmitting' AND s.deleted_at IS NULL
 ORDER BY hold_kind, s.updated_at;

-- 3. live sequences whose retirement P-86 check 3 refuses because of a production SFTP-branch row (§9 question 2)
SELECT s.id, s.organization_id, s.sequence_number, s.status, s.dispatch_status,
       t.id AS transmittal_id, t.status AS transmittal_status, t.error_class, t.created_at
  FROM ectd_sequences s
  JOIN submission_transmittals t
    ON t.organization_id = s.organization_id
   AND t.metadata->'dispatchBinding'->>'sequenceId' = s.id::text
 WHERE s.deleted_at IS NULL
   AND t.region = 'fda' AND t.gateway = 'esg' AND t.transport = 'sftp'
   AND COALESCE(t.metadata->>'environment', '') <> 'staging'
 ORDER BY t.created_at;
```

How to read them:
- **Query 1.** A row is normally 'rejected' with `auth` or `transport` (the credential or module refusal). Two rarer
  shapes are consistent with this analysis:
  - 'rejected' with `gateway` (the integrity read at `:782`, or another error `recordTransmitFailure` classes so);
  - 'in_transit' with no `transmission_id`, where recording the failure itself failed after the `:773` write.

  Neither is a deposit, because no SFTP client module ever loaded. A row with a `transmission_id` (written only after a
  completed `put`, `:796-799`), or a row that is 'received', contradicts this analysis. Stop and escalate: it would be a
  sequence filed on deposit (§1.4).
- **Query 2.** A `legacy hold` row is reported separately, as **"legacy hold, not settleable by P-92"**, and escalated
  as above. A `bound hold` row is settled through P-92 once it lands (a `bound_transports` of `sftp` is a §6.1 bound
  hold; `as2` is P-92's ordinary case).
- **Query 3.** These are the sequences §9 question 2 is about.

### 6.2 SFTP settings and credentials screens

There are none (§1.7). `GatewayAccountsSetting.tsx` and `GATEWAY_ACCOUNT_SPECS` are kept unchanged for AS2 and every
other gateway. The three variables per environment become unread, and the runbook says to remove them.

---

## 7. How P-93 composes with the work that lands first, and with P-92, P-86 and P-94

- **F1 slice 1** (landed, `090f62af1`).
  - Slice 1 stamps `leafManifest` and `dispatchBinding` in the guard (`index.ts`), and it refuses a bound transmit with
    no manifest. P-93 adds nothing to the guard. Its refusals at (b) and (c) come before the guard, and (e) comes after
    it, inside the gateway, before any transmittal row.
  - P-93 edits slice 1's `index.ts` and `types.ts` only in comments (commit 2, §1.5). It edits two of slice 1's tests,
    each built on slice 1's version: `transmit-guard-refusal-releases-claim`, and `_freeze-gate-fixture`, which the new
    test reuses.
- **F1 slice 2.**
  - Under slice 2, a staging post-wire failure releases the claim, and a production one stays 'transmitting' until a
    receipt arrives. That is the held send P-92 settles.
  - P-93 adds no post-wire path. Its refusals all come before the wire.
  - After commit 2, slice 2's "SFTP has no such path" case no longer exists.
- **Repairs A–C.**
  - A shares `submission-service.ts`, so P-93 is serialized after it. A and P-93 follow the same rule for wording that
    names P-86's act only once that act exists.
  - B (`assess-dispatch-readiness.ts`) is untouched.
  - After C, the IND routes answer `DISPATCH_BLOCKED` as 422, so P-93's refusal is answered correctly there too.
- **P-92** (a held send, settled by a signed act). Revised (§10.1, R1 and R8).
  - P-93 never measures a held send, because `resendRefusal` comes first.
  - P-92's precheck sits in the same file, so the two are serialized.
  - After P-92 releases a held sequence of 1 GiB or less, readiness passes on size, and the sequence can be sent
    again.
  - A held sequence over 1 GiB can only be an SFTP-branch hold, because the switch sent everything over 1 GiB to SFTP
    (`fda-esg.ts:749`). Then:
    - **legacy holds** (claimed before 2026-10-17): P-92's E1 refuses them as row L, so P-92 releases none of them
      (§6.1). Their way out is §9 question 5;
    - **bound holds** (claimed after 2026-10-17, rare): P-92 can release them on FDA's letter. After that, readiness
      refuses on size, and P-86 check 3 refuses the retirement. They have no way on unless §9 question 2 is answered so
      that check 3 admits them.
  - **P-92's design, as revised, agrees** (read at 04:15 on 2026-11-02). It classes pre-2026-09-23 SFTP holds as row L
    (H5, `:102`), names bound SFTP holds H5′ (`:103`), refuses L at E1, and asks the founder its Q11 (`:971-976`). Its Q3
    (`:932-935`) governs H5′, and this design defers to it (§6.1, §10 C8).
  - **One wording flag for P-92's lane** (not this design's file). P-92's release statement for an over-size send reads
    "sequence NNNN is larger than FDA's documented channel takes" (`:512-514`). That states the launch figure as FDA's
    limit, which P-93 never does (§0, §9 question 1(b)). It should read P-93's clause, `launchSequenceSizeRefusal`, by
    import, as P-92 already plans for the constant.
  - **The runbook is shared.** Both designs edit `docs/runbooks/fda-esg-production-uat.md` (P-92 design `:860`):
    - P-93's commit 2 removes the SFTP prerequisites and variables, drops the SFTP sentence at §7's `:328`, and rewrites
      §8 (`:367-392`) and §9's SFTP checklist (`:422-430`);
    - P-92 retires §5.4 and §7.

    **Order: P-93's commit 2 first, then P-92's runbook edits rebase onto it**, in RIM's one session, as P-92 also asks.
    P-93 does not depend on P-92, and its edits touch §5.4 not at all. If the coordinator orders P-92 first inside
    `submission-service.ts` (§9 question 3), P-92 retires §7 first, P-93's `:328` edit drops with it, and the README
    records which order ran.
- **P-86** (retire a sequence that was never filed, while "no production send is bound to it"). Revised (§10.1, R2 and
  R8).
  - Check 2b refuses 'transmitting', so a held sequence is never retirable while held.
  - **The chain "P-92 settles, then P-86 retires" exists only for a sequence with no bound production transmittal, and
    only if §9 question 2 and P-92's Q4 are answered so that check 3 admits a released or SFTP-refused production
    row.** Today it exists for neither kind of sequence over 1 GiB:
    - Check 3 (`p86-retire-unfiled-sequence.design.md:406`) refuses any bound transmittal whose environment is not
      staging, **whatever its status**. Two kinds of row record that nothing reached FDA, yet are refused:
      - a production SFTP-branch row (`transport = 'sftp'`, 'rejected', refused before any connection). Every
        production attempt since 2026-10-17 wrote one, bound, through `createTransmittalRow(normalizedReq, 'sftp')`
        (`fda-esg.ts:759`, `dispatchBinding` at `:378`), before its `CredentialError` or `TransportError`, and then had
        its claim released;
      - a production attempt that P-92 released as not received, on FDA's written confirmation.
    - P-92's own design says "a released sequence of 1 GiB or less is sent again, never retired", and that one over
      1 GiB "is stranded" (`:859`). It asks this as its Q4 (`:936-941`), "with P-93 §9 question 2".

    A sequence over 1 GiB that carries either kind of row can be neither sent (P-93) nor retired (check 3). Its number
    then blocks any replacement that shares a lifecycle key, through `filingOrderRefusal` (`submission-service.ts:1460-1533`).
    That is §9 question 2. Until it is answered, the size refusal's tail says why P-86 refuses, in P-86's own words, and
    never says "Retire it" (§3.4).
  - P-93's own refusals write no transmittal row and leave no claim, so they add nothing to checks 2b or 3.
- **P-94** (an unapproved onboarding upload cannot be filed). Revised (§10.1, R6).
  - **No shared rule.** P-94's refusal comes through `gate`, the dispatch verdict. That is the path readiness already
    uses for an unapproved authored leaf (`evaluateReleaseApprovalGate`, `assess-dispatch-readiness.ts:903`), and the
    recorded P-94 asks for exactly that: "as they do an unapproved authored leaf". P-94's design says the same
    (`p94-onboarding-upload-approved.design.md:394`).
  - In the precheck's `refusal` chain, `gate` comes before the size check. A sequence with both an unapproved upload and
    a package over 1 GiB is told about the upload first.
  - P-94 does not depend on readiness assembling. This design's first version said it might; that was wrong once
    readiness judges only the size.

---

## 8. What is owed, and named

Revised (§10.1, R6, R7, R9 and R10).

| Owed | To | What it needs | Why it is not done here |
|---|---|---|---|
| **The dispatch verdict can say "cleared" of an FDA sequence over 1 GiB.** Submit's one verdict, MCP `c2c_assess_sequence_readiness`, and AnA's `assess_dispatch_readiness` and `dispatch_qc_check` all read `assessSequenceDispatchReadiness`, which does not assemble. After commit 1, they can say "cleared" of a sequence whose freeze, dispatch and transmit all refuse | **Its own F1 item, owned by RIM**, which holds `server/services/ectd/assess-dispatch-readiness.ts` for repair B (`COORDINATION.md:33`). Recorded in the build README and in `COORDINATION.md`. **It is not D7 item A4**: A4 is `dispatchStatus` on the client's `LatestSequence`, so that "Cleared to dispatch" is not said of a sequence held in transit. A4 never assembles or reads a size | The verdict reads the package size, or says plainly that the size was not measured. The rule is imported from `ectd-regional-rules.ts` (`launchSequenceSizeRefusal`), never copied. Its own red test is an FDA sequence over 1 GiB that the verdict clears | The decision names readiness, not the verdict |
| `PRE_TRANSMIT_BLOCKED` answers 500 on `POST /sequences/:id/transmit` for every guard refusal (10 GB, region identity, PDF/A, DTD) | **RIM**, under F1, in a turn on `server/routes/submissions.ts` that the coordinator grants (no session holds it now; the MDX journey's M3 server half landed and released it). RIM already owes D7 item A1 on the same file | `CODE_STATUS` (`server/routes/submissions.ts:102-114`) gains the guard's code, read from `PreTransmitBlockedError` (`submission-gateways/index.ts:232`, `code = 'PRE_TRANSMIT_BLOCKED'`) by import, never as a copied literal. Its own red test is a guard refusal on the sequence route answered as 422 | P-93's refusal comes first, at (c), as 422 |
| **Readiness runs the whole package gate**, not only the size, for every region | **RIM**, as its own F1 repair | Readiness calls the package gate with `judge: 'all'` when an environment is named. Its red test is test 1 (d') flipped, plus a non-FDA dispatched sequence whose source changed after dispatch, refused at readiness. It must say how it bounds the assembly cost for non-FDA routes | Not decided by P-93. It changes readiness for every region (§3.3) |
| **The package gate's existing tails are worded by step**, so the dispatch tail "Fix it while the leaves can still be changed." is false | **RIM**, as its own F1 repair | The tails are worded by `isSequenceLocked(status)`. Its red test is a dispatch of a frozen sequence whose assembly fails, refused without "can still be changed" | It predates P-93 and is not about size (§3.4) |
| **Every refusal raised inside a gateway comes after `archiveSentPackage`** (`index.ts:328`), so a blob is stored for a package that never left: a `CredentialError`, the integrity read, and (e) | An F1 item for the guard's owner (RIM, which landed slice 1 there), through the coordinator | Either the archive is deleted when the gateway refuses with the proof that nothing was sent, or the record of the archive says the package was not sent. One rule for every in-gateway refusal | Not one case's to patch (§3.2, R7) |
| The package spine and AnA's 510(k) transmit refuse after their signature, as for every guard and gateway refusal | The package spine's owner | A pre-signature readiness for the package spine | The package spine has no pre-signature readiness; P-93 names the sequence spine |
| The locked tail's retire sentence, chosen by P-86's own rule (§3.4) | Whichever of P-86 and P-93 lands second | Test 1 (f) | It names an act that does not exist yet |
| **What may settle a legacy unbound hold** (§6.1) | The founder, through the coordinator (§9 question 5, the same as P-92's Q11) | A decision; until then the hold stays and is escalated, never patched by hand | P-92's E1 refuses it, and no decision covers it |
| The full-history deletion search | The build session (a separate full clone) | — | This clone is shallow |
| The running-app evidence (§4, commit 1) | The build session | The revised recipe: incompressible content, a measured package, and an endpoint at `example.invalid` | A component test is not evidence (RULE 4) |
| The operator queries on each deployed database | The operator, through the runbook | — | Read-only. A person decides |

The first version's row "Present-tense SFTP comments … to their holders" is gone. No session holds those files, so the
correction is commit 2's (§1.5, R9).

Not owed: showing the size on the compile screen and on the test package. The freeze precheck is the first governed
point. Showing it earlier is a possible later completion, not a requirement.

---

## 9. Questions back to the coordinator or founder (only where the decision does not settle it)

1. **For the coordinator: the recorded words** (revised, §10.1 R4 and R5). The record's heading, "FDA sequences over
   1 GiB", settles the first version's question ("FDA sequences" or "sequences"): this design is FDA only. Its operative
   sentence, "A sequence over the size the documented channel takes is refused before signing", raises two others:
   - **(a) Does it reach every route whose limit is sourced?** Today that is EU 600 MiB, through
     `getGatewaySizeLimitOnFile`. An EU sequence over 600 MiB is refused today by the guard's `checkGatewaySize`, before
     the wire but after the transmit signature (§1.6).
     - If yes, readiness (b) also applies the route's sourced limit, `checkGatewaySize`'s figure, imported, never copied.
       Readiness then assembles for those routes too.
     - If no, nothing changes.
   - **(b) Is the heading's 1 GiB intended for FDA, given that FDA documents 10 GB?** The operative wording rests on the
     unsourced code comments (`fda-esg.ts:42-43`, `:747-749`). FDA's only limit on file is 10 GB (Form 5640 v2.0,
     `SPEC_DIGEST.md:113-115`, `FDA_GATEWAY_LIMIT_BYTES`). The build proceeds at 1 GiB, because refusing more fails
     closed. The refusal never states 1 GiB as FDA's limit, and the build README carries this note.
2. **For P-86's lane (the founder if P-86's record does not settle it).** P-86's record allows retirement only while "no
   production send is bound to it". Is a bound production transmittal that records nothing reached FDA such a send?
   That covers:
   - an SFTP-branch row refused before any connection;
   - an attempt P-92 released as not received, on FDA's written confirmation (P-92's Q4).

   If it is, a sequence over 1 GiB that carries one has no door (§7). Query 3 in §6.1 finds the first kind.
3. **Holds** for the files no session holds:
   - `fda-esg.ts`, `ectd-regional-rules.ts`, `check-server-bundle-prod-imports.mjs`, `scripts/fda-esg-uat-smoke.ts`;
   - `market-submission-specs.ts`, `ga-readiness-report.mjs`, `AnaToolDefinitions.ts`;
   - the comment-only `submission-gateways/index.ts`, `types.ts` and `ana-ri/mdx-command-handlers.ts`;
   - the two runbooks, the inventory, and the tests in §4.

   Also the order relative to P-86, P-92 and P-94 inside `submission-service.ts`. The runbook order this design
   proposes (P-93's commit 2 before P-92's runbook edits) is in §7. `pre-transmit-check.ts` is no longer needed.
4. **For the coordinator: site (a) goes beyond the record's letter.** The record names readiness only. This design also
   refuses at freeze, dispatch and dispatch renewal, through the package gate those acts already run. Without it, a
   sequence over 1 GiB is frozen and dispatched and can then never be sent (§10 C1). Confirm the widening, or say to
   drop (a). If (a) is dropped, test 1 (a) and its mutation row go with it.
5. **For the founder: what may settle a legacy unbound hold?** This is the same question as P-92's Q11
   (`p92-settle-held-fda-send.design.md:971-976`), raised with its row L, its A13 and its §7 item 15. It is asked
   **once, jointly**, through the coordinator, not twice.
   - A legacy unbound hold is a sequence 'transmitting' whose claim predates the per-attempt binding: S or A null,
     which covers every SFTP-branch hold from before the binding (§6.1).
   - Today it cannot be sent, settled, receipted or retired. P-92's recorded words require the agency's document and a
     signed act. Its design refuses such a hold because "which transmission it was cannot be read".
   - Until this is answered, the runbook says the hold stays as it is and is escalated, never patched by hand.

---

## 10. Critique and resolution

| # | Alternative or objection | Resolution | Why |
|---|---|---|---|
| C1 | Refuse only in `sequenceTransmitReadiness`, the decision's letter | **Rejected; (a), (c) and (e) are kept. (d) is dropped** (revised, §10.1 R7) | Readiness is advice, never authority (`:1708-1710`): the act must re-check (c). Without (a), a sequence over 1 GiB is frozen and dispatched and then can never be sent. That is exactly the defect the package gate exists to prevent (`:1617-1623`, "a signed sequence that could never be sent"). (a) goes beyond the record's letter, and is put to the coordinator (§9 question 4). (e) is the in-place replacement of the deleted switch. `REGISTRY['fda:esg']` is `new FdaEsgGateway()`, so (e) refuses every FDA caller, guarded or not, before any transmittal row. The first version's reason for (d) ("the package spine … would hand AS2 more than 1 GiB once SFTP is gone") was false for that reason |
| C2 | Measure on the TransmitPanel's mount read too | **Rejected** (the map's question 2, decided here) | One assembly (and one `ECTD_ASSEMBLED` row) every time the tab opens. The click precheck comes before any signature, so the decision is met |
| C3 | Store the size at dispatch (a column, or a detail on `ECTD_ASSEMBLED`) and read it at readiness | **Rejected** | A column is schema (RULES 1 and 6). An audit detail read as a verdict is fragile. Readiness must use the function transmit uses ("same functions, same order"), and the bytes can differ |
| C4 | Assemble at readiness for FDA only | **Adopted** (reversed, §10.1 R6). Readiness also judges only the size | The record decides a size refusal for FDA sequences. Running the whole package gate at readiness for every region changes readiness for every region and step, assembles on every non-FDA click, and adds a 503 path where none exists. The benefit for a dispatched sequence is narrow. That is its own F1 repair with its own red test (§8), not P-93's |
| C5 | Estimate the size from the leaves' file sizes | **Rejected** | It is not the package (PDF/A and zip change it). A figure not measured on the package is fabricated |
| C6 | The boundary: the bytes at the precheck and at the act can differ | **Accepted and named** | A package within a few bytes of 1 GiB can pass the precheck and be refused at (c), after the signature. That signature is voided and nothing is sent. Freeze has the same window |
| C7 | Make `assembledTransmitBlockers` take a region | **Rejected** | It is region-blind, and six test files call it with partial objects. A local helper in `submission-service.ts` composes it with the clause |
| C8 | Ask the founder whether an SFTP-branch hold may be released without FDA's written confirmation (the map's question 5) | **Revised** (§10.1 R1, R8). For a **bound** hold: not asked here, but deferred to P-92's open Q3, whose answer applies. For a **legacy unbound** hold: **asked** (§9 question 5) | The first version said P-92 "makes no exception" and so settles every SFTP-branch hold. It cannot settle any hold this design named: each predates the attempt binding, and P-92's E1 refuses it (row L). The question of whether the platform's own record may stand in for FDA's letter is already P-92's Q3, so this design does not ask it twice |
| C9 | A setting that lowers the ceiling for tests or the running-app check | **Rejected** | It would be a new knob on a founder's figure. Tests override the measured size. The running app uses real, incompressible synthetic PDFs whose assembled size is measured first, and an endpoint at `example.invalid` (§4, §10.1 R3) |
| C10 | Delete `'sftp'` from `Transport`, or migrate the legacy rows | **Rejected** | Stored rows carry it, and seeds use it. RULE 1 forbids it, and slice 2's critique says "no automatic correction" |
| C11 | Install `ssh2-sftp-client` so the branch works | **Rejected** | The decision retires it, and no FDA source documents an SFTP channel. The repo's own sweep also said SFTP is undeclared (D7 `:40`) |
| C12 | Suggest physical media, or "file it another way" | **Rejected** | FDA keeps physical media for sequences over 10 GB. Another channel is a product call under P-86's filed-elsewhere rules |
| C13 | One commit instead of two | **Rejected** | Two commits prove the replacement the record names (the refusal from readiness, with (a) and (c)) reachable before anything is deleted, and leave no commit that hands AS2 more than 1 GiB. The decision asks that the removing commit name a replacement that already exists. (e) lands in commit 2 because it replaces the switch in place; the two commits go in one push (§4, R7) |
| C14 | Keep the tails worded by `step` (the map) | **Narrowed** (revised, §10.1 R6) | Only P-93's own copy depends on `isSequenceLocked(status)`: the size clause's tail and the new step `'transmit'`. The existing tails stay worded by step. The false dispatch tail ("Fix it while the leaves can still be changed") predates P-93, and is owed as its own F1 repair with its own red test (§8) |
| C15 | The map said the guard is what refuses in the replaced `transmit-guard-refusal-releases-claim` case | **Corrected** | The helper reads `bundle.sizeBytes` itself, and only `assembledTransmitBlockers` is mocked, so (c) refuses first. The test asserts `DISPATCH_BLOCKED`. The guard is not involved: (d) is dropped (R7), and (e) is proven by `fda-esg-hardening.test.ts` |
| C16 | The map's client test of `transmitBlockedBy` | **Dropped** | The mount read never measures, so that panel never receives the size refusal. The server test pins that the sentence avoids the panel's regex phrases instead, for the day it does |
| C17 | The map's composition note on P-86 named only SFTP-branch rows | **Widened** | A production attempt P-92 released as not received is also bound and production. Check 3 refuses it as well (§7, §9 question 2). The retire sentence is conditioned on P-86's own rule accordingly (§3.4, R2) |
| C18 | The D7 session's check name `gateway-transport-limit` | **Not adopted** (revised, §10.1 R7). There is no guard check | No transport limit is sourced, and the guard's size check holds sourced channel facts only. (e) in `fda-esg.ts` refuses every other FDA caller |

### 10.1 Review round 2 (2026-11-02, against `origin/concept2cure-v2` at `bda1d5aed`)

Ten findings survived verification. **Every one is applied.** None is rejected, because the code shows each of them is
right. Where a finding's supporting detail was out of date, the row says so, and the change follows the code.

| # | Finding | Resolution | What changed |
|---|---|---|---|
| R1 | Every SFTP-branch hold §6.1 named predates the attempt binding. P-92 refuses such a hold (E1, row L), yet §6.1, §7 and C8 said P-92 settles it | **Applied** | Confirmed: `transmit_attempt_id` and the `dispatchBinding` stamp arrive only in `e1f3fd425` (2026-10-17). At `0c2943f1b`, `claimTransmitSlot` writes only `dispatch_status`, and the CAS never re-claims 'transmitting'. §6.1 now classifies holds by claim date: legacy unbound holds have no exit (resend, P-92 E1, receipt, P-86 2b all refuse), and bound holds (after 2026-10-17, rare: the integrity read's `ValidationError` without the proof, or a database failure) are P-92's. Query 2 classifies `transmit_attempt_id IS NULL OR transmit_signature_action_id IS NULL` (E1 refuses either null, so `OR`, not the finding's `AND`) and reports "legacy hold, not settleable by P-92" separately. C8 "Not asked" became §9 question 5, to the founder. P-92's design was revised meanwhile (read at 04:15): it now classes these holds as L, names the bound kind H5′, and asks the same question as its Q11, so §9 question 5 is that Q11, asked once and jointly. Until it is answered, the hold stays and is escalated, never patched by hand. §5 names no P-92 remedy, as P-92's Q11 asks. The finding's own caveat ("every" is too broad: rare bound holds exist after 2026-10-17) is folded in as the third row of §6.1's table |
| R2 | The retire sentence contradicts P-86 check 3 for an FDA sequence over 1 GiB with a bound production SFTP-branch row | **Applied** | Confirmed: since 2026-10-17 every production SFTP-branch attempt wrote a bound production row (`fda-esg.ts:759`, `:378`) before its `CredentialError`/`TransportError`, and had its claim released, so the sequence is 'pending'. Check 3 has no status filter. §3.4: the retire sentence is written only when `retirementRefusal(await readRetirementFacts(pool, sequence, org))` is null, imported from P-86's `sequence-retirement.ts`, never copied; otherwise P-86's own refusal sentence is appended verbatim, and a read failure says it could not be checked. §3.5 and §7 say the chain exists only for a sequence with no bound production transmittal. Test 1 (f) and a mutation row pin it. The finding's line cite `:376` is `:378` on origin |
| R3 | The running-app evidence (ii) could send a real package to FDA's test ESG if the assembled zip came out at 1 GiB or less | **Applied** | Confirmed: `sizeBytes = buffer.length` after DEFLATE level 6 and PDF/A normalisation; `isConfigured` only loads credentials; no simulation exists. §4's recipe now uses incompressible leaf content, measures the assembled size first through the existing dry-run `POST /api/submissions/sequences/:seqId/assemble` (which answers `sizeBytes`) with a 64 MiB margin over 2^30, configures locally generated certificates with `FDA_ESG_STAGING_URL=https://esg.example.invalid`, records the measured size in the README, and tells the tester never to sign if the dialog opens. The finding's `assemble-from-core.ts:345-360` cite is `:363-370` |
| R4 | The record has landed and differs from the summary; §0 and §9 Q1 were stale; the threshold's basis was unflagged | **Applied** | §0 quotes `LAUNCH_DEFINITION_OF_DONE.md:1845-1855` verbatim, names two word-dependent choices (region and threshold), and builds FDA at the heading's 1 GiB. §3.1's constant comment quotes the record and says the figure is the heading's, not an agency limit. §1.3 notes that "the size the documented channel takes" rests on the unsourced comments. §9 question 1(b) asks the coordinator to confirm 1 GiB against the 10 GB on file. The README carries the note. §0's first-version sentence ("not on origin") was right at `e194d3114` and is replaced |
| R5 | The record's operative sentence is per channel; non-FDA routes over their sourced limit are refused only after signing | **Applied** | Confirmed: `gatewayRefusal` refuses only `'unavailable'` (`submission-service.ts:2624`); EMA CESP is `'unverified'` (`index.ts:402`). §1.6 states it. §9 question 1 is now (a) "does it reach every sourced route" (if yes, readiness applies `checkGatewaySize`'s figure too, imported) and (b) "confirm 1 GiB for FDA". The build proceeds FDA at 1 GiB, failing closed. The finding cited `index.ts:369-371`; the line is `:402` |
| R6 | Commit 1 changed readiness and refusal copy for every region and step, untested, beyond P-93 | **Applied** | §3.3: readiness assembles only for an FDA sequence with an environment named, and judges only the size (`judge: 'size'`); an assembly that fails refuses, because the size cannot be measured. §3.4: existing tails are unchanged; only the size tail and the new step `'transmit'` depend on `isSequenceLocked`. "Readiness runs the whole package gate" and "tails worded by `isSequenceLocked`" are owed F1 repairs, each with its red test named (§8). Tests 1 (c'), (d') and (e') and three mutation rows pin the scope. C4 is reversed and C14 narrowed. Site (a)'s widening beyond the record's letter is §9 question 4. P-94's composition in §7 is corrected: it goes through `gate`, not through readiness's assembly. The finding's `:2614` anchor is `:2618` |
| R7 | Site (d) put a launch-scope figure into the guard, whose size check holds sourced channel facts; (e) already refuses those callers | **Applied** | Confirmed: `REGISTRY['fda:esg']` is `new FdaEsgGateway()` (`index.ts:53`), and (e) runs before `createTransmittalRow`, so it refuses every FDA caller. (d) is dropped, with its two test files and its mutation row; `pre-transmit-check.ts` is untouched; commit 1 loses that `Completes:` trailer. The archive-before-refusal ordering is named as its own owed F1 item for every in-gateway refusal (§8). Per the finding's caveat, §4 no longer claims commit 1 makes SFTP unreachable from every guarded caller: between the commits the package spine keeps today's behaviour (refused before any connection, nothing sent), and both commits go in one push. (e) stays in commit 2, in place of the switch, so the SFTP tests are deleted in the commit that deletes their subject |
| R8 | §7's remedy chain contradicted itself and P-92's open questions; C8 called settled what P-92 asks; the shared runbook was not named | **Applied** | §7 makes "P-92 settles, then P-86 retires" conditional on §9 question 2 and P-92's Q4, and says that until then such a sequence has no remedy. §6.1 and C8 defer to P-92 Q3 for bound holds (with R1 for legacy ones). §7's P-92 entry names the shared `docs/runbooks/fda-esg-production-uat.md` and states the order: P-93's commit 2 first, P-92's runbook edits rebase onto it, unless the coordinator orders otherwise (§9 question 3) |
| R9 | The removing commit left three present-tense SFTP comments, with a false reason ("held files") | **Applied** | Confirmed: no session holds `index.ts`, `types.ts` or `mdx-command-handlers.ts` (slice 1 released its holds, `3879fc7e0`; the MDX journey holds none). Commit 2 corrects all three, comment-only, with a `Completes:` trailer each. In `index.ts`, the SFTP item leaves the present-tense list at `:183`, and the dated note at `:198-200` stays. §1.5's row now says "Corrected (commit 2)", and the §8 row is removed |
| R10 | Owed items had the wrong owner or none: the verdict gap was filed under D7 A4, which is a client field | **Applied** | Confirmed: A4 is `dispatchStatus` on `LatestSequence` (`programSequence.ts:216`), and it never assembles. §8 records the verdict gap as its own F1 item owned by RIM (which holds `assess-dispatch-readiness.ts` for repair B, `COORDINATION.md:33`), to go into the build README and `COORDINATION.md`, needing the verdict to read the size or say it was not measured, by import. The `PRE_TRANSMIT_BLOCKED` mapping is owned by RIM, in a coordinator-granted turn on `server/routes/submissions.ts`, reading the code from `PreTransmitBlockedError` by import. The finding's first option (the MDX lane's M3 change) is no longer available: M3's server half landed and released the file |

**Consequential changes in this round (not findings).**
- P-94's composition (§7) is corrected. With readiness judging only the size, P-94 goes through `gate`, as the recorded
  P-94 and its design say. It does not go through readiness's assembly.
- P-92's design was revised while this one was (read at 04:15 on 2026-11-02). Its H5 is now row L, its H5′ is the bound
  SFTP hold, and its Q11 asks the legacy question. §6.1, §7 and §9 cite those, and drop the first draft of this round's
  claim that P-92 still called H5 settleable.
- One wording flag is passed to P-92's lane (§7). Its over-size release statement calls the figure "FDA's documented
  channel". It should read P-93's clause by import.
