
# Honest-state lens: launch catalog, 2026-09-28 (weekly periodic review)

**Head reviewed:** `aff7eae16` (`concept2cure-v2`), read-only — no file edited, no gate run with `write-baseline`, local Postgres not touched (not needed for this pass).

**Charge, per the harness:** re-verify every finding this lens left open in `docs/evidence/reviews/2026-09-24/` and `2026-09-26/`; sweep Authoring, Submission Center and Submission Readiness first (named as owed); then the server routes behind all six launch apps.

## Method

Read `2026-09-24/honest-state.md` (the dedicated honest-state auditor's own report) and `2026-09-24/lenses.md` (the second-pass session, which filed one honest-state-flavored finding, HS-1, under a different report) first, since those are this lens's actual open items. `2026-09-26/` has no `honest-state.md` — only the security lens ran that week — so there is nothing of mine to reconcile there beyond noting it.

Verified, rather than assumed, the brief's framing before using it: the "72 `useLive` callers / 4 `SampleTag` renderers" ratio describes a mechanism (`dataConnect.tsx`'s `live ?? fixture` API) that the 2026-09-24 report already recorded as **deleted** (ledger L72). Grepped the current tree and confirmed zero live call sites remain — see reverified list. Distinction 1's legacy vector is closed; I did not report it as open.

Read every surface end to end, both branches of every fetch, for the three named apps:

- **Authoring:** `DocumentAuthoring.tsx` (+ `editor/DocumentWorkbench.tsx`'s `docsState` branch), `Review.tsx`, `TemplateLibrary.tsx`, `ProtocolDev.tsx` (+ `pdev-view-assembler.ts` server-side), `BiopharmaProject.tsx`'s `RegulatoryWorkspace`.
- **Submission Center:** `SubmissionCenter.tsx` (1560 lines, full read), `DossierMap.tsx`, `EctdCompile.tsx` (findings/report views, release-signature panel), `EctdCoauthor.tsx` (full read), `PublishingCenter.tsx` (full read), `GatewayTransmittals.tsx` (assemble/preflight/transmit flow).
- **Submission Readiness:** `DispatchReadiness.tsx` (full read, both the discovery walk and the render).

Then server routes behind all six apps, sampled for the anti-patterns named in the brief (catch blocks that answer fabricated success, defaulted/invented figures, no-op writes answered as success): `server/routes/authoring.router.ts` (`GET /docs`, 62 catch blocks — all route to `serverError`/500, none fabricate success), `server/routes/submissions.ts`, `server/routes/qms.ts` (all catch blocks checked for success-masking — none found; the QMS duplicate-router audit-row gaps are DP-34, already registered by the security lens, not re-filed here), `server/routes/c2c/projects.ts`, `server/routes/region-profiles.ts`, `server/services/ectd/assess-dispatch-readiness.ts` and `server/services/cmc/submission-spine.ts` (the new PF-05/PF-06 program-anchoring logic, landed this week — fail-closed on ambiguity, verified), `server/routes/c2c/project-vault.ts` (the `pendingStore`/42P01 honesty mechanism — a deliberate, well-documented pattern, not a violation), and — where a client surface's own comments named a specific server contract it depends on — `server/routes/coauthor.ts`, which is where this pass's one new finding came from.

Ran the automated checks named in the brief:

| Check | Result |
|---|---|
| `ci:internals-in-copy` | clean, 0 baselined |
| `check:microcopy` | clean, 387 files |
| `ci:launch-scope` | 6 apps · 39 surfaces · 19 modules · 34 files fixture-free |
| `hostilePayloadProbe.test.tsx`, `PROBE_ONLY` = the 12 Authoring/Submission Center/Readiness surface ids | 13/13 pass (no surface renders nothing under an unexpected response shape) |

## Findings (new)

One new finding, **HS-0928-1** (high) — see the findings list for the full file:line evidence and the false sentence a user would read. Short version: `GET /api/coauthor/documents` answers `total: documents.length` instead of a real organisation-wide count, so `EctdCoauthor.tsx`'s own truncation guard (`partialRead`) can never fire, and an org with more co-author documents than the 200-row page cap can see "All documents approved" / a plain readiness percentage over a backbone that was only partially read — the nothing-assessed-vs-assessed-and-clear defect the brief names as the sharpest instance in this codebase's history, reproduced here by a mismatched server contract rather than by the client (which was deliberately built to prevent exactly this).

No other new findings. The remaining ground covered — `SubmissionCenter.tsx`'s `subsState`/`seqState` discriminators, `DossierMap.tsx`'s unanchored/empty/error ladder, `DispatchReadiness.tsx`'s server-composed gate (never recomputed locally) and its program→submission discovery walk (rewritten this week by PF-05/PF-06, fail-closed on ambiguity per `submission-spine.ts`'s own catch), `GatewayTransmittals.tsx`'s `assessmentState`-gated findings narration, `PublishingCenter.tsx`'s shape-guarded reference reads — is clean on all four distinctions. Several of these files carry inline comments citing the exact prior defect and why the current code no longer has it; I verified a sample of those claims against the code rather than trusting the comment.

## Reverified from 2026-09-24

See the `reverified` list for full evidence. Summary: HS1 (TemplateLibrary null-confidence) still fixed; HS-1 (QMS SopRegister/ChangeControl failed-read-as-clean-register) still fixed; H1 (device-vault) still out of `LAUNCH_APPS`, unchanged, not re-verified again this week for the same reason as every prior week. No regression found in anything previously closed.

## Clean, read end to end this week (both branches)

DocumentAuthoring (+ DocumentWorkbench's `docsState`), Review, TemplateLibrary, ProtocolDev (+ `pdev-view-assembler.ts`), RegulatoryWorkspace, SubmissionCenter, DossierMap, EctdCompile (findings/report views + release-signature panel), PublishingCenter, GatewayTransmittals (assemble/preflight/transmit), DispatchReadiness (discovery walk + full render). EctdCoauthor's client-side honesty logic is itself clean — the defect is server-side (HS-0928-1).

## What I did NOT get to (no silent caps)

- **Projects, Vault, QMS beyond spot checks.** These were fully re-swept by the honest-state auditor on 2026-09-24/25 and reported clean; this week I did not re-read `Projects.tsx`, `TaskBoard.tsx`, `Vault.tsx`, `AdminSurfaces.tsx` line-by-line. I checked `git log f14f5510..aff7eae16` for those files, found real changes landed this week (`e24a56dff` Vault edit-details/re-upload, `ae7b52486` Vault download audit chain, three QMS electronic-signature commits touching `client/src/concept2cure/quality/`), and spot-checked one of them (QMS's HS-1 gating logic, confirmed unchanged/still correct) rather than reading all of them fresh. `e24a56dff`'s own commit message states "Success is claimed only on the server's answer; a refusal is an alert and the values stay as recorded" — consistent with this lens's standard, but I did not independently re-derive that from the diff the way I did for the twelve prioritized surfaces.
- **Server routes behind Projects/Vault beyond the ones this pass's client reading led to** (`project-vault.ts`'s honest-empty/pendingStore path, region-profiles.ts). `project-rollup-service.ts`, `vault-ingest.service.ts`, `vault-filing.service.ts`, `c2c/project-intake.ts` and the QMS service layer (`qms.service.ts`) were not read line-by-line this week.
- **CSR Workflow (`csr-workflow` / `CsrWorkflow` in `BiopharmaProject.tsx`) and IND Lifecycle / IND checklist** (`ind-checklist-view-assembler.ts`, `leaf-source-resolver.ts`, DP-35's residual "freeze counts as approved with no signature" founder-decision item) were read for context but are outside `LAUNCH_APPS` (RULE 2) and are not re-litigated here.
- **`resolveSubmissionSpine`'s fallback behaviour under a genuine (as opposed to ambiguity-driven) database error** — its `catch` collapses any lookup failure into "no spine," and its three callers (`ectd-compile.ts`, `module3-compile.ts`, `ind-forms.routes.ts`) then fall through to a real, separately-sourced "draft backbone" completeness computation rather than a fabricated one. I read this carefully because it looked like a candidate distinction-2 defect, but could not construct a concrete false sentence a user would read (the fallback path is itself honest, just a different real data source) — dropped per the "style note, not a finding" rule rather than filed speculatively.
- Did not run the full test suite or `ci:migration-drop-safety`/other unrelated gates; ran only the checks the brief named plus a scoped `hostilePayloadProbe` invocation.
- Did not touch the local reference Postgres; nothing in this pass required a live-data shape check that the client/server code reading couldn't answer.

## Rows informed

D2 (launch catalog honest states), D5 (Part 11 evidence — adjacent, not directly). No row turns green as a result of this pass; HS-0928-1 is a new open item for the register.

---

## Independent verification (2026-09-28)

Each high, medium or blocker finding above went to a separate agent told to refute it (read the code at head, trace the real call path, reproduce where possible; default to refuted). Low findings were not independently verified.

### HS-0928-1 — **confirmed**

I could not refute this finding. I confirmed it at head aff7eae16.

Server: `server/routes/coauthor.ts:90-116` (GET /documents) sets `limit = Math.min(Number(req.query.limit) || 50, 200)`, selects coauthor_documents where organization_id matches, ordered by `updatedAt desc` with `.limit(limit)`, and returns `total: documents.length` (line 108). The handler never runs a `count(*)`. The route is mounted at `/api/coauthor` in `server/bootstrap/register-document-routes.ts:103`, and no other router serves GET /api/coauthor/documents.

Client: `EctdCoauthor.tsx:270` fetches `/api/coauthor/documents?limit=200`. Line 279 is the only place `serverTotal` is set, and it takes the value from `res.data.total`. Line 536 computes `partialRead = serverTotal != null && serverTotal > total`, where `total = docs.length`. Because the server's `total` always equals the returned array length, `partialRead` is always false.

That flag controls three things:
- The footer (lines 736-739): 'Documents N', 'Status roll-up N%', and the `mayReassure` 'All documents approved' row, which is shown only when `!partialRead`.
- The headline (lines 916-918): '<readiness>% of the N documents are approved or in review'.
- The AnA facts payload.

Reachability: the surface is registered as 'ectd-coauthor' in `surfaceViews.ts:468`. It is in the authoring/submission group in `registryModel.ts:619` and in NAV_HIDDEN (`registryModel.ts:128`), so it opens from Cmd-K or a deep link. It is also linked from `ShadowReview.tsx:379` and `BiopharmaJourney.tsx:169`.

Reproduction on c2c_full, inside BEGIN ... ROLLBACK with row_security off: I inserted 350 coauthor_documents for one org. The 200 newest are approved and the other 150 are draft with older updated_at. Running the route's exact query (org filter, order by updated_at desc, limit 200) gave a route `total` of 200 with 200 approved in the page, while the real org count was 350. With that response the client would show 'Documents 200', 'Status roll-up 100%' and 'All documents approved'. None of the 150 unread drafts would be mentioned.

Test gap: `ectdCoauthorHonesty.test.tsx:203` mocks the response as `{ documents: MIXED_DOCS.documents, total: 120 }`. The real route never returns that shape, so the client guard passes its test while being dead in production.

Severity: high is justified. The page shows an assessed-and-clear verdict for a backbone that was only partly read.

