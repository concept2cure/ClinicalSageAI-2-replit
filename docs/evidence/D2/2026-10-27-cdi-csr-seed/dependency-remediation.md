# Compatible dependency remediation — 2026-10-27

## Status and scope

Four compatible package updates were prepared and installed against base commit
`0a07f49d7cf0b3dc179d4dca87b9bf5c767bc56d` on `concept2cure-v2`. Focused
compatibility checks passed. These changes are preserved as an **unapplied,
reviewable patch** in [`activation-repairs.patch`](activation-repairs.patch);
the canonical package manifests retain their original versions. The patch also
contains the two prose corrections documented in `ci-reference-fixes.md`.
This evidence publication is not a dependency release or a full security approval.

The dependency-risk ledger was left byte-for-byte unchanged. Its lockfile seal
does not match the proposed new lock. The documented review and reseal process
must be completed before this dependency patch can be published. Zod also has
an uncovered current High advisory requiring a separate decision. No ledger,
gate, baseline, or exception was changed to permit publication.

This work changed only `package.json`, `package-lock.json`, and this evidence
document. It introduced no production dependency, changed no package placement,
and preserved the existing Undici override mechanism. It did not remove Figma,
migrate Zod to a new major, change application code, commit, push, or deploy.

## What already exists

- `scripts/ci/check-dependency-risk.mjs` verifies the exact lock seal, installed
  versions, and current evidence-backed decisions in
  `docs/security/dependency-risk-ledger.json`. Unknown High/Critical causes and
  invalid or stale review evidence fail closed.
- `scripts/ci/reseal-dependency-risk-ledger.mjs` and the existing WO-07 process
  govern changes to the lock and ledger. A changed finding set is not an
  invitation to hand-edit the seal or invent a review.
- Existing tests exercise the client and server sanitizers, real multipart
  receipt, JSON/raw/form body handling, safe HTTP fetching, and the production
  PPTX export chain. Those tests were reused without changes.
- The ledger already contains two time-limited `unreachable` decisions for
  `image-size`, backed by `ci:pptx-image-reachability` and
  `pptxGenerator.security.test.ts`. Both decisions expire
  `2026-11-25T00:00:00.000Z`; this work did not extend or otherwise alter them.

## Observed starting point

The separately approved, isolated audit of the exact public repository manifests
reported 52 vulnerable package entries: 1 Low, 42 Moderate, 8 High, and 1 Critical.
These are **pre-change package-entry counts**, including dependency wrappers;
they are not counts of unique advisories and are not a post-change scan result.
The audit was read from
`/tmp/c2c-public-lock-audit-jm4oj41t/audit-result.json` during this session.

The relevant starting versions were body-parser 2.3.0, DOMPurify 3.4.13, Multer
2.4.0, and Undici 7.30.0. Current GitHub advisories and official npm registry
metadata corroborated compatible patched releases for all four. The new audit
also contained three High Undici advisories beyond the earlier historical scan;
all three identify the same 7.30.1 patched release.

## Exact dependency changes

| Installed package path | Before | Proposed and actually installed | Reason |
| --- | --- | --- | --- |
| `node_modules/body-parser` | 2.3.0 | 2.4.0 | Compatible patched release; remains transitive |
| `node_modules/dompurify` | 3.4.13 | 3.4.17 | Compatible patched release; direct exact pin retained |
| `node_modules/multer` | 2.4.0 | 2.5.0 | Compatible patched release; direct declaration raised from `^2.2.0` to `^2.5.0` |
| `node_modules/undici` | 7.30.0 | 7.30.1 | Compatible patched release; existing override raised from `^7.29.1` to `^7.30.1` |
| `node_modules/body-parser/node_modules/content-type` | 2.0.0 | 2.1.0 | body-parser 2.4.0 requires `^2.1.0` |
| `node_modules/body-parser/node_modules/iconv-lite` | 0.7.2 | 0.7.3 | body-parser 2.4.0 requires `^0.7.3` |
| `node_modules/qs` | 6.16.0 | 6.17.0 | body-parser 2.4.0 requires `^6.16.1`; previous 6.16.0 does not satisfy it |

The reviewed graph has 2,577 lockfile package records before and after the
change, with **zero added nodes, zero removed nodes, and exactly seven changed
package-node versions**. The three additional updates are dependencies required
by the new body-parser release. No unrelated package version changed. Every
resolved package URL still uses `registry.npmjs.org`.

The package diff is 3 changed declaration lines. The lock diff is 26 changed
lines in each direction, consisting of the two root declarations, the seven
versions and their archive URLs/integrity hashes, and body-parser's three
dependency ranges. The installed package manifests matched all seven new
locked versions after `npm ci`.

| Evidence | SHA-256 |
| --- | --- |
| Original lock, also the current ledger seal | `7153128c3fb8850fa4bb3a8e13af8d3b48e0855014d27fdc61d1e93f938304c3` |
| Proposed and tested lock | `2487ff5e308c81a92a953049b6f910ba746a80acc4b933015a6f33c974bb311b` |
| Unchanged dependency-risk ledger file | `d53259c895a844e89472aad25679df1f4cbb4c82b7a75a3fdbacebb052b82f29` |

## Primary advisory evidence

The following High/Critical advisories in the pre-change audit specify patched
versions reached by this patch. Ranges below are the relevant installed major
line, rather than every older major covered by the advisory.

| Package | Advisory and severity | Relevant affected range | Patched version used |
| --- | --- | --- | --- |
| body-parser | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), High | `>=2.0.0 <2.4.0` | 2.4.0 |
| DOMPurify | [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7), Critical | `>=3.4.4 <=3.4.16` | 3.4.17 |
| DOMPurify | [GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr), High | `<=3.4.16` | 3.4.17 |
| Multer | [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), High | `>=2.0.0 <2.5.0` | 2.5.0 |
| Undici | [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c), High | `>=7.18.0 <7.30.1` | 7.30.1 |
| Undici | [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26), High | `>=7.0.0 <7.30.1` | 7.30.1 |
| Undici | [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx), High | `>=7.0.0 <7.30.1` | 7.30.1 |
| Undici | [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm), High | `>=7.0.0 <7.30.1` | 7.30.1 |

Official release metadata was checked at the npm registry for
[body-parser 2.4.0](https://registry.npmjs.org/body-parser/2.4.0),
[DOMPurify 3.4.17](https://registry.npmjs.org/dompurify/3.4.17),
[Multer 2.5.0](https://registry.npmjs.org/multer/2.5.0), and
[Undici 7.30.1](https://registry.npmjs.org/undici/7.30.1).

### Image-size: existing reviewed boundary preserved

`pptxgenjs@4.0.1 -> image-size@1.2.1` is unchanged. The two High advisories are
[GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
(`>=1.2.0 <=2.0.2`) and
[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
(`>=0.6.3 <=2.0.2`). Both identify 2.0.3 as patched. The
[official registry](https://registry.npmjs.org/image-size) still identifies
1.2.1 as the latest stable 1.x release; no compatible patched 1.x was found.
Forcing 2.x would exceed PptxGenJS's declared `^1.2.1` dependency and this task's
compatible-update scope.

The existing reachability guard and production PPTX security test both passed
after installation. They substantiate the already recorded boundary: the
resolved PptxGenJS Node bundle does not import image-size, and the production
generator remains text/shape only. This is evidence for the existing scoped,
time-limited disposition, not proof that image-size itself is patched or that
all conceivable consumers are safe. PptxGenJS's High npm entry is a wrapper
through image-size, not another independent advisory.

### Zod: uncovered risk remains

Root Zod 3.25.76 and the Figma-nested Zod 3.25.58 were left unchanged and their
installed versions were verified. Current
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
classifies versions `<4.6.6` as High and identifies 4.6.6 as patched. The
[official registry](https://registry.npmjs.org/zod) identifies 3.25.76 as the
latest stable 3.x release. No advisory-identified patched 3.x release was found.

The maintainer [discussion](https://github.com/colinhacks/zod/issues/6653)
disputes the vulnerability characterization and states that v3 is no longer
being published. The actual
[upstream change](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd)
changes v4 collection parsing to reject oversized constrained collections
before traversing them. It does not establish that v3, or a v3 compatibility
entry point inside v4, has the same fix. See also the
[upstream pull request](https://github.com/colinhacks/zod/pull/6652) and
[v4.6.6 release](https://github.com/colinhacks/zod/releases/tag/v4.6.6).

The application and its Figma tooling therefore still need a deliberate
compatibility and risk review. The Zod-related npm wrapper entries are
`@figma/code-connect` and `zod-validation-error`. No major migration, wrapper
removal, advisory suppression, or newly asserted mitigation was performed.

## Installation and focused verification

The tested runtime was **Node 22.23.4**, satisfying the repository's Node 22
engine constraint, with the installed Vitest **4.1.7**. The environment's
default Node 24 was not used for installation or tests.

Lock resolution used `npm update body-parser dompurify multer undici
--package-lock-only`. Both resolution and the subsequent exact-lock `npm ci`
used `--ignore-scripts --no-audit --no-fund`, explicit
`--registry=https://registry.npmjs.org`, and separate empty npm user/global
configuration files. The repository's existing legacy peer-dependency setting
was retained. No `npm audit fix` or lifecycle install script was run.

`npm ci` completed successfully, installing 2,421 packages in approximately two
minutes. It ran before the checks below. Existing dependency deprecation
warnings were not used as a reason to broaden this patch.

| Existing check | Result and meaningful coverage |
| --- | --- |
| `client/src/concept2cure/components/ana/__tests__/renderSafeMarkdown.test.ts` | Passed; actual DOMPurify rendering, safe formatting, active-content rejection, governed image handling, and hook isolation |
| `server/services/authoring/__tests__/authoring-html-sanitizer.test.ts` | Passed; actual server sanitization, figure-reference restrictions, traversal and script/handler rejection, and hook cleanup |
| `server/utils/__tests__/safeFetch.test.ts` | Passed; Undici Agent construction and pinned dispatcher use, URL/DNS/redirect validation, and credential handling with fetch/DNS mocked |
| `server/services/__tests__/pptxGenerator.security.test.ts` | Passed; generates and inspects the production text-only PPTX archive and verifies image-size is not loaded |
| `server/middleware/__tests__/uploadAllowlist-receive.test.ts` | Passed; real Express/Multer multipart handling for size/type/count refusal and successful receipt |
| `server/middleware/__tests__/sanitizeInputOrdering.test.ts` | Passed; real JSON/query parsing and forbidden-key removal, including production parser mounts |
| `server/startup/__tests__/stripe-webhook-raw-body.contract.test.ts` | Passed; byte-identical raw webhook bodies, JSON behavior, and a source guard keeping the test's middleware-order transcription aligned |
| `server/mcp/__tests__/mcp-standing-unreadable.test.ts -t "the consent POST"` | 2 passed, 6 deliberately filtered; real URL-encoded form parsing through the production router with account/grant services mocked |
| `npm run ci:pptx-image-reachability` | Passed; installed bundle and production call sites preserve the reviewed image-size boundary |

The initial seven-file invocation ran 106 tests: 93 passed and 13 were blocked
by the sandbox's `listen EPERM` restriction on Supertest's local HTTP sockets.
Only the three affected files were rerun with permission to listen locally;
all 14 tests in those files passed, including one source guard that had already
passed. The four unaffected files were not needlessly rerun. Across the seven
files, all **106 distinct tests** passed. The two additional consent cases bring
the total to **108 distinct passing cases across eight selected files**. The
six excluded MCP cases were outside the selected dependency-compatibility
scope, not failing tests.

The tests were invoked through the local Vitest binary using the existing
`vitest.config.ts`. No test, timeout, worker policy, or assertion was weakened.
No database integration suite or full compiler run was performed.

### Limits and publication requirement

These checks establish compatibility of the exercised application paths. They
do not directly reproduce every upstream advisory, prove live TLS behavior, or
cover alternate charsets and nested extended-form `qs` parsing. No post-change
npm audit result or full CI security pass is claimed by this evidence.

The unchanged risk gate will reject the proposed lock immediately because its
SHA-256 differs from the ledger seal. Independently, Zod's current advisory is
uncovered by that ledger. Existing image-size coverage must be distinguished
from this uncovered risk. The package patch should remain held for the
documented review until the finding set, version records, evidence and seal can
be handled together. Independently publishable CI-reference changes do not
authorize publishing this dependency patch with a stale seal.
