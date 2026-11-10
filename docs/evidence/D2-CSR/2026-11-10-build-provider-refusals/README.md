# D2: the CSR path with a model provider present, walked in a Codespace-style environment (2026-11-10)

Launch row D2, workstream W1, ledger package F1 (repairs). The founder asked for one biotech workflow walked from the
project to a filed CSR, and for the Anthropic key to work in a Codespace. Every earlier walk of this path stopped at
"no model key" (`docs/evidence/DEMO/2026-11-05-csr-lifecycle/README.md`), so drafting, and everything after it, had
never run against a provider.

This walk ran the Codespace's own start script here, with the provider a strict stand-in for the Anthropic API. It
found five defects and fixed them. It also found three stops that are decisions, not defects, and did not change
them. **The CSR is not filed.** "What still stands between this CSR and a filed sequence" says exactly why.

**No CDISC data is in this folder.** The pilot files and the saved provider requests (which carry the study's
aggregate tables) stayed outside the repository. The screenshots show a build's status line only.

## What already exists (RULE 3)

Nothing was added to the product. Each change finishes an existing file.

| Path | What it does today | What it did not do |
|---|---|---|
| `.devcontainer/post-create.sh`, `post-start.sh` | Install PostgreSQL 16 and pgvector, provision the database, start the app, seed the demo, prepare the CSR study to "study data frozen" | Its key check could say "key accepted" for a key that cannot draft; a red `/readyz` for search read as "AnA is down" |
| `scripts/ops/codespaces-doctor.mjs` | `--probe-anthropic`: the free model list. `--probe-openai-usage`: a billable OpenAI request | No request to Anthropic that shows the key can draft |
| `server/services/csr-builder.ts` `draftCSRSectionWithProvenance` | Drafts one ICH E3 heading through the AI gateway and checks the draft's figures | Caught every gateway or provider failure with no reason, and used the template |
| `server/services/csr/csr-job-runner.ts` | Runs a build heading by heading, saves each, states why a build failed (`csrBuildFailureText`) | A heading whose draft was refused left no reason; a provider refusal was not a reason at all |
| `server/services/csr/unsupplied-statistics.ts` `findUnclaimedNumbers` | Refuses any number in a results draft that is not a claimed table cell; exempts "Table 14.3.1", "§12.2.1" | Read a bare part number ("(16.2.8)") as figures |
| `server/services/ai-gateway/gateway-error-map.ts` `classifyGatewayError` | Names a refused key, an account with no credit, a rate limit, an overload | The CSR builder did not call it |
| `server/middleware/redisRateLimiter.ts` `DOCUMENT_METADATA_READS` | Counts the editor's record reads apart from document content (fixed 2026-10-08 and 2026-10-25 for the same symptom) | The review-route reads added on 2026-11-09 were not in it |
| `docs/evidence/W1/2026-09-28-ana-drive/harness/api-contract.mjs` | The Messages API contract a stand-in enforces | Reused as it is by `csr-stand-in.mjs` here |
| `docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk*.cjs` | The CSR walk: project, Vault ceremony, CSR document, freeze, build, review, import, narratives, assembly, sequence, compile | Reused as it is; `build-once.cjs` here uses its sign-in and editor helpers |

Searches run: `csr`, `draft`, `provider`, `rate limit`, `429`, `credit`, `probe`, `review-route` across `server/`,
`scripts/ops/`, `.devcontainer/` and `docs/evidence/`; `git log --all --diff-filter=D` on `csr*`, `*doctor*`.

## The environment

- This container, as a Codespace: `.devcontainer/post-start.sh` run unchanged with the devcontainer's environment
  (`C2C_CODESPACE=1`, `RLS_ENFORCE=on`, `NODE_ENV=development`), the database on port 5433 because this container
  already runs another PostgreSQL on 5432. The app ran as the `app_service` role.
- The start script finished with exit 0: app serving, demo projects seeded, CDISC pilot files fetched and verified,
  CSR study prepared (Vault uploads, three-person approvals, CSR document, frozen study data).
- The provider: `csr-stand-in.mjs`, reached through `ANTHROPIC_BASE_URL`. It refuses any request the Messages API
  is documented to refuse, answers `GET /v1/models`, and plays a careful writer for the CSR builder. It can also
  answer every request with one documented API error (`FAKE_FAIL=auth|credit|rate|model|overloaded`) or enforce a
  requests-per-minute limit (`FAKE_RPM`).
- **It is not a model.** It proves the path and the request surface. It says nothing about the quality of Claude's
  drafts, or about how many of them the builder's figure checks will accept.
- No request the app sent was refused by the contract checker: all 233 Messages requests in the retained logs were
  well formed for the model they named (`claude-opus-5-5` and its two fallbacks for drafting, `claude-sonnet-5` for
  a conversation turn).

## What was found and fixed

| # | What happened | Cause | Fix | Seen after the fix |
|---|---|---|---|---|
| 1 | Build 1 ended "failed at 56%: §11.1, §11.2 … and 18 more have no saved text". The provider had answered every call it received. | The gateway's own per-minute limit refused the 50th call. `csr-builder.ts` caught the refusal with no reason and used the template. The remaining 70 headings were then refused in under a second. | `csr/csr-draft-refusal.ts` (split out of `csr-builder.ts`): a limit or an overload is waited out and the heading drafted again. | Builds 2 and later waited out the limit ("Drafting of section 9.8 was refused (CSR_DRAFTING_RATE_LIMITED); waiting to draft it again") and drafted every heading. |
| 2 | A refused key, an account with no credit and a model the account cannot use all read the same as 1. | The same catch. | A refusal waiting cannot change stops the build on that heading with a typed code, and the build card says which. Three provider calls are made (one per approved drafting model), not 207. | `screens/key-refused.png`, `screens/no-credit.png`; `build-key-refused.json`, `build-no-credit.json`. |
| 3 | Build 2 drafted 68 of 69 headings and ended "failed at 98%: §12.4.1 has no saved text". | The builder tells the model to head a section with its canonical title. ICH E3's title of §12.4.1 is "… by Patient (16.2.8) and Each Abnormal Laboratory Value (14.3.4)". The figure check read those as the figures 16.2, 0.8, 14.3 and 0.4 and refused the draft. Any model that obeys the instruction is refused. | `unsupplied-statistics.ts`: a number with two or more points is a report part, not a figure. A one-point number and a percentage are still refused. | The same draft is accepted (`build-rate-limited-complete.json`). |
| 4 | When a figure check refused a draft of a heading with no template, the build said only "has no saved text". | The reason is on the unsaved row's lineage, and the row is not saved. | `csr-job-runner.ts`: the receipt keeps the typed reason per heading (never the draft or its figures), and the build card states it. | Unit tests; not seen on screen, because after fix 3 the stand-in's drafts are all accepted. |
| 5 | "Send for review" on the CSR was refused: "Too many document requests." | `GET …/review-route` (read on every open of a document since 2026-11-09) and `GET …/route-candidates` were counted as document content, 20 a minute. | `redisRateLimiter.ts`: both are record reads. Reassigning and handing back a route stay writes. | Unit test. Not yet re-walked in the app. |

Also changed, for the Codespace:

- **The key check now includes a real request.** The free model list is answered for an account with no credit,
  so the start script could print "key accepted; drafting models available" while every drafting call was refused.
  `scripts/ops/codespaces-doctor.mjs --probe-anthropic-usage` sends one small billable request (about 60 tokens) to
  the first approved drafting model that answers, and names the refusal: no credit, a refused key, no access to an
  approved model, a rate limit. `post-start.sh` runs it when the model list passes.
  Run here against the real API with a deliberately invalid key, it answered `ANTHROPIC_KEY_INVALID` (HTTP 401).
- **Search being off no longer reads as AnA being down.** With an Anthropic key and no OpenAI key, `/readyz` is red
  for the embedding lane only. A conversation turn was sent through the app in that state and answered. The start
  script now says that AnA answers and drafts, and that search needs `OPENAI_API_KEY`.
- A reply cut off at the token ceiling is not saved as a draft, and the builder asks for 16,000 tokens a heading, not
  4,096. The drafting models reason before they write, and that reasoning counts against the same ceiling. This
  could not be observed with a stand-in; it follows from the API's documented behaviour.

## Tests (each seen failing first)

| Suite | Red | Green |
|---|---|---|
| `server/services/__tests__/csr-builder-provider-refusal.test.ts` (new) | 16 of 16 failed | 16 of 16 |
| `server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts` | 1 new test failed | 26 of 26 |
| `server/services/csr/__tests__/unsupplied-statistics.test.ts` | 2 new tests failed | 64 of 64 |
| `server/middleware/__tests__/redisRateLimiter-vault-reads-and-batch-upload.test.ts` | 1 new test failed ("expected 'documents' to be 'document_metadata'") | 14 of 14 |
| `scripts/ops/codespaces-doctor.test.mjs` | did not load: no export `checkAnthropicDrafting` | 29 of 29 (50 with the start-script suites) |

The CSR builder, runner and route suites pass together (17 files, 274 tests), as do `shared/` and the figure-check
suites (86 files, 1,401 tests). ESLint: no file gained a warning.

## How far the path went

With the fixes, on this database, through the product's own screens and routes:

| Step | Result |
|---|---|
| Project, Vault uploads, three-person approvals (7 files, 14 signatures), CSR document, frozen study data | pass (the start script) |
| Build CSR draft | **complete, 100%** (build 6): every narrative heading drafted and accepted, in 229 s, against a provider limiting at 20 requests a minute. It answered 36 of the 105 requests it received with 429; each was waited out. `build-rate-limited-complete.json`, `screens/rate-limited-complete.png` |
| Section review: the requester sends, the approver reads and approves | pass for 32 headings on build 1. On build 2 the script read 68 headings in under a minute and was rate limited; a person does not read that fast, and the script is not paced. Not a product fault |
| Import approved sections into the CSR document | pass (32 sections written, build 1) |
| Narratives | pass: 95 of 95 |
| Assemble CSR files | assembled. With every heading drafted: bookmarks reach 4 levels, 0 placeholder sections, 235 links checked, 3 body gaps. 18 §16 appendices are named as missing, 12 of which block placement |
| Send the CSR for review | refused by the rate limit (fix 5) |
| Sequence 0000; compile | sequence started; compile refused for the application number, the sponsor and its D-U-N-S, as designed |

## What still stands between this CSR and a filed sequence

These were read in the code and are not changed here. The first three are decisions that belong to the founder.

1. **Machine-drafted text cannot be released.** `assertWorkflowImportRelease`
   (`server/services/authoring/workflow-import-governance.ts`) refuses the approver's signature, the freeze and the
   placement with `WORKFLOW_MODEL_QUALIFICATION_REQUIRED` while any imported, model-written text remains in the
   document. No drafting model has passed performance qualification (`approved-models.ts`: every `pq.status` is
   `pending`), and this refusal has no branch for one that has. So a CSR drafted with a working key can be reviewed,
   but not approved or filed, until a person rewrites each drafted section in the editor. Whether a PQ-passed model's
   text may be released after human review and adoption is a governance decision (RULE 2).
2. **The assembled CSR files are not transmittable.** `renderedLeafNotTransmittable`
   (`server/services/ectd/leaf-release-verdicts.ts`) refuses every file the assembly produces, unconditionally: "an
   assembled clinical study report, not bound to an approved and signed CSR". The binding was handed to the CSR lane
   on 2026-10-30 (`docs/evidence/D5/2026-10-30-assembled-csr-not-released/`) and is not built. Placement and compile
   succeed; dispatch refuses.
3. **Every one of the 119 headings must hold text.** The CSR scientific review covers every section of the document,
   and refuses one that is blank or holds a `[…]` placeholder. The build drafts the 69 narrative headings. §3, §14,
   §15 and §16 are for a person, and nothing marks a heading not applicable in the editor.
4. **The appendices.** 12 blocking §16 appendices must be supplied from the Vault as PDFs or declared not applicable
   with a reason (`CsrAssemblyControl.tsx`). The five 16.2 listings can only be declared: the worker is not given
   the data that produces them.
5. **A CSR is filed to an IND as an amendment.** Sequence 0000 as an original needs the whole IND. An `amendment`
   sequence holding Form 1571, the cover letter and the CSR at 5.3.5.1 satisfies the compile and the structural gate.
6. **Dispatch** needs a Shadow Review (a model call), a freeze and a dispatch each signed by someone other than the
   sequence's creator, and the applicant identity. **Transmission** needs FDA ESG credentials. Without them the
   product records `ECTD_TRANSMIT_SKIPPED` and the sequence stays "dispatched, pending". It does not pretend to file.

## How to rerun

```
# the provider stand-in (FAKE_FAIL=credit|auth|model|rate|overloaded, or FAKE_RPM=20)
API_CONTRACT=$PWD/docs/evidence/W1/2026-09-28-ana-drive/harness/api-contract.mjs FAKE_PORT=8799 \
  node docs/evidence/D2-CSR/2026-11-10-build-provider-refusals/csr-stand-in.mjs
# the app, started as post-start.sh starts it, with ANTHROPIC_API_KEY=<any> ANTHROPIC_BASE_URL=http://127.0.0.1:8799
# one build from the CSR document, and what its card says
DEMO_TAG=codespace node docs/evidence/D2-CSR/2026-11-10-build-provider-refusals/build-once.cjs \
  http://127.0.0.1:5000 ~/.concept2cure-codespace/cdisc-pilot <label>
```

## Not done

- No real Claude request was made: this environment holds no Anthropic key. Whether Claude's drafts pass the figure
  checks, and how long a whole-report build takes, are unmeasured.
- The scientific review, the reviewer's and approver's signatures, Place into filing, the amendment sequence, Shadow
  Review, freeze and dispatch were not walked.
- A failed build cannot be resumed from the screen: "Build CSR draft" starts a new build. The runner can resume one
  (`runCSRBuildJob` accepts a failed job); nothing reaches it.
