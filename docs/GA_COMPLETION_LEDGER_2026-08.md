# GA completion ledger — 2026-08

**One register for every open item across every space.** This file exists because work
has been dispatched, lost to a container restart, and silently forgotten more than once
in this effort. A ledger that lives in a session's memory is not a ledger.

## What this file is — and what it deliberately is not

The doctrine for this codebase is *there is never more than one of anything*. That
applies to tracking documents too, so this file **restates nothing**. It is an index:
one row per open item, each pointing at the document that actually owns the detail.

| Document | Owns |
|---|---|
| `docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md` | Blockers B1–B21 — the licensed assets, credentials and flags. The prose. |
| `scripts/ops/ga-readiness-report.mjs` | The *probe* for those blockers. Observation, not intention. |
| `docs/COMPETITIVE_LANDSCAPE_2026-08.md` | The 2026 market benchmark and the four-silo finding. |
| `docs/COMPETITIVE_POSITION_DELTA_2026-08.md` | Table stakes closed vs. open, per journey. |
| `docs/AUDIT_STORE_INVENTORY_2026-08.md` | All 81 audit-ish tables, per-table verdicts, the delete lists. |
| `docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md` | The approved identity contract (Option C), slices C1/C2. |
| **This file** | Which of all of the above is still open, who owns it, and how it proves itself done. |

Rows are checked mechanically by `node scripts/ops/ledger-check.mjs`, which fails when a
row cites a file that does not exist, claims `done` without evidence, or duplicates an ID.
A ledger that can rot silently is the problem it was written to solve.

## How to read a row

- **Owner** — `eng` work I do; `proc` purchase/credential, no code will conjure it;
  `qual` quality-system sign-off; `prod` a product/pricing decision that is not mine.
- **State** — `open`, `in-flight` (an agent or a person is on it *now*), `done`
  (evidence cited and passing), `blocked` (named on another row).
- **Evidence** — for `done`, the test or command that proves it. For everything else,
  the file where the work lands or the document that specifies it.

---

## 1. In flight

Work with a live owner right now. If a row here has no live agent and no recent commit,
it has been lost — re-dispatch it.

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L1 | ESG transport gap (B16): re-point `mdx-command-handlers.ts` off the not-implemented `ESGSubmissionService.transmitToESG` onto the real AS2 in `server/services/submission-gateways/fda-esg.ts`, through the canonical governed transmit so preconditions travel with it | eng | in-flight | `server/services/submission-gateways/fda-esg.ts` |
| L2 | AnA performance assessment — latency path, context assembly, tool parallelism, model routing, pgvector index + pre-filter tenancy, pool sizing | eng | in-flight | `docs/ANA_PERFORMANCE_ASSESSMENT_2026-08.md` |
| L3 | E2E golden journeys for 510(k), CER, NDA — asserting honest refusals as first-class outcomes, not as failures | eng | in-flight | `tests/golden-journeys/` |

## 2. Engineering backlog — mine

Ranked. Every row here was at some point described as somebody else's problem; it is not.

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L4 | Literature screening state — screening/appraisal decisions now survive the session. `literature_screening_decisions` (`migrations/20260814b`, on the deploy set above the RLS sweep) holds one current decision per (org, entry, program, appraisal stage) with reviewer + timestamp, and a MEDDEV §8 exclusion rationale enforced by CHECK; stages are the CER flow's own `title_abstract`/`full_text`, not new vocabulary. One path only — `literature-screening.service.ts` behind `POST /literature/screen` + `GET /literature/screening`, read back into `LiteratureTab`. Old→new chained through `auditService`. Refuses 422 (never fakes) when the article is not in the corpus or the migration is unapplied | eng | done | `server/services/__tests__/literature-screening.service.test.ts`, `tests/routes/cerv2-literature-screening.test.ts`, `client/src/concept2cure/mdx/hooks/__tests__/useCerLiterature.test.ts` |
| L5 | PMS complaint / PMCF enrolment backends — the generators and documentation status are live; the feeds behind them have no backend | eng | open | `docs/COMPETITIVE_POSITION_DELTA_2026-08.md` §CER |
| L6 | Standards mapping per product code — vendored FDA recognition-list drop-point, whole-file-validating loader, org-scoped `GET /api/510k/device/standards`, and the intake panel rendering "dataset not held" / "list holds nothing for this code" / "here is FDA's list" as three distinct states. Nothing is seeded or inferred; the acquisition itself is procurement (runbook B21) | eng | done | `server/services/fda-recognized-standards/__tests__/recognized-standards.test.ts`, `tests/routes/510k-device-routes.test.ts`, `client/src/concept2cure/mdx/surfaces/__tests__/DeviceProfilePanel.render.test.tsx` |
| L7 | IQ/OQ validation pack — **engineering side delivered**: 11 Part 11 controls mapped to the tests that exercise them, all 11 executed and passing, installation observed, verdict fails closed on any control lacking evidence. What remains is not engineering — a qualification is a protocol executed and signed by a competent person, and no script can be that. The pack is its input | qual | open | `node scripts/ops/generate-iq-oq-pack.mjs`, `docs/validation/IQ_OQ_EVIDENCE_PACK.md` |
| L8 | Outcome-data capture — (submission content → agency response) pairs. The strongest moat in the benchmark and the only one no competitor can buy. Nothing captures it today | eng | open | `docs/COMPETITIVE_LANDSCAPE_2026-08.md` §moat |
| L9 | Template-chase ingestion pipeline — the substrate is right (versioned catalog, fail-closed registry); the ingestion is unbuilt | eng | open | `docs/COMPETITIVE_POSITION_DELTA_2026-08.md` §4 |

## 3. Consolidation debt — the D-items still open

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L10 | **D8 C2** — attribute-free alias map, plus the CI gate that enforces the no-attributes invariant. C1 (the program anchor) shipped | eng | open | `docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md` |
| L11 | **Audit substrate decision** — decided: `audit_events` is the reference, because its chain is enforced by a BEFORE INSERT trigger and cannot be bypassed, while the `audit_logs` chain skips NULL links and so loses rows silently (it already did, in production). Stage 0 shipped: the Part 11 audit surface no longer asserts integrity it never checked. Stage 1 (bridge) is next; Stage 2 (flip the readers) needs approval | eng | in-flight | `docs/AUDIT_SUBSTRATE_DECISION_2026-08.md` §4 |
| L12 | **Chain-linkage of the 23 domain-history tables** — `linkDomainHistory` exists with **zero call sites**; every (b) table is chain-orphaned. Blocked on L11: linking them into `audit_logs` would wire 23 tables into the substrate being retired | eng | blocked | `docs/AUDIT_STORE_INVENTORY_2026-08.md` §1.3 |
| L13 | **43 dead audit tables** — no writer anywhere in the repo. Delete list is written; the deletion is not executed | eng | open | `docs/AUDIT_STORE_INVENTORY_2026-08.md` §5.1 |
| L14 | **11 write-only audit tables** — rows land, nothing reads them. Delete only with owner sign-off | eng + prod | open | `docs/AUDIT_STORE_INVENTORY_2026-08.md` §5.2 |
| L17 | **Signer lookup in the §11.50 path is not org-scoped.** `persistGovernedActionSignature` resolves the printed name with `SELECT … FROM users WHERE id = $1` and no tenant predicate, though every caller already passes `orgId`. Safe as called today — both callers pass the authenticated actor's own id — but safe by convention, not construction. The obvious fix is wrong: `users` carries `default_organization_id`, not `organization_id`, so scoping on it would fail to resolve a signer acting outside their default org and break a legitimate signature. Correct fix goes through the org-membership table | eng | open | `server/services/part11/signature-persistence.ts` |

## 4. Not mine — but must not fall off the edge

These are real and they block a first real filing. They are tracked here so that "not
engineering" never becomes "not tracked".

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L15 | Blockers B1–B21 — eSTAR templates + field maps, eCTD DTDs, LORENZ licence, gateway credentials, MedDRA, the enforcement flags, the FDA recognition list (B21, the procurement half of L6) | proc | open | `node scripts/ops/ga-readiness-report.mjs` |
| L16 | Consultant / CRO channel — multi-client workspaces and per-submission pricing. A product decision, unstarted | prod | open | `docs/COMPETITIVE_LANDSCAPE_2026-08.md` §moat |

## 5. Data lineage — findings from the 2026-08-14 traceability audit

The question asked: *as source documents come in, get processed, and are deployed by AnA
or the editor into an IND filing, can we trace with certainty what changed, when, why, who
approved it, and get back to the source document?*

Answer: **strong from draft to approval, broken at both ends.** The editor cannot save
content without clause-level provenance (`lineage-gate.ts`, enforced in-transaction and
structurally gated in CI), and a user can select text and ask where it came from
(`/api/data-origins/selection`, wired into `EditorCanvas.tsx`). What does not hold is the
ingest end and the filing end. Each row below was verified by reading the code, not from a
report.

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L18 | **Extraction fabricated content when it could not read the file.** FIXED with L19 in one change: `extractText` now reads the one source that exists and throws `ExtractionSourceUnavailableError` when there is nothing to read — a failed job is recoverable, a governed artifact containing invented text is not. The query against the nonexistent `uploads` table is gone. `extractText` returns `` `[Extracted content from …]` `` when no artifact row matches, and `` `[Pending extraction from …]` `` from a bare catch — then the caller hashes that string and stores it as a governed `category:'extracted'` artifact. The catch fires reliably: the second query reads a table named `uploads`, which no migration creates. **Latent, not live** — the pipeline's only entry point 500s (L19), so it cannot run today. Fixing that route without fixing this would begin writing invented content as governed evidence; they must land together | eng | done | `server/services/__tests__/extraction-no-fabrication.test.ts` |
| L19 | **The extraction pipeline's only HTTP entry point returned 500 unconditionally.** FIXED: called positionally, takes `fileId` (the pipeline resolves source text by artifact id and never had a `fileContent` parameter), and refuses without organization context rather than attributing extraction to org 0. `audit-services.ts:388` passes one object to `queueExtraction(fileId, fileName, fileSize, …)`, which is positional, so `fileName` is undefined and `detectFileType` throws. No other caller exists anywhere | eng | done | `server/services/__tests__/extraction-no-fabrication.test.ts` |
| L20 | **Two `content_hash` values could never verify.** FIXED: each artifact now digests the bytes it persists. Truncation is recorded on the row (`contentTruncated`, `sourceCharCount`, `storedCharCount`) rather than being silent. The main artifact stores `content` truncated to 100k but hashes the untruncated text, so any document over 100k chars is permanently reported tampered. The table artifact stores an **MD5 of a different object** in a column the audit report verifies as SHA-256, so it never matches. Both surface as false tamper alarms in `verifyIntegrityChain` | eng | done | `server/services/__tests__/extraction-no-fabrication.test.ts` |
| L21 | **Source documents are not versioned.** `cre_evidence_sources.version` exists and no caller ever passes it; there is no `previous_version_id`, no `is_current`, no update path. A revised protocol becomes a second unlinked row, so a fact cannot be told it rests on superseded content | eng | open | `server/services/clinical-regulatory-evidence/evidence-spine.service.ts` |
| L22 | **The correctly-modelled provenance tables have zero writers.** `evidence_sources` / `evidence_claims` carry exactly what is missing elsewhere — version chain, `is_current`, `page_number`, `section_reference`, `sentence_index` — and nothing inserts into either. Two live services read them, so they query permanently empty tables | eng | open | `shared/schema.ts` |
| L23 | **A filed eCTD leaf did not pin what it shipped.** FIXED: `submission_leaves` now records `document_content_sha256` — SHA-256 of the SOURCE document's content at filing — plus when the pin was taken, distinct from `checksum` (MD5 of RENDERED bytes, an eCTD index value). Taken from the same org-scoped read that proves ownership, so a concurrent edit cannot be pinned. No backfill, deliberately: a pin computed today would manufacture agreement for every existing leaf. Still open on this row — the IND path supplies no document pointer, so its leaves pin nothing (truthfully) | eng | done | `server/services/submission-service/__tests__/leaf-source-pin.test.ts` |
| L24 | **The end-to-end lineage dossier is unreachable.** `lineage-dossier.ts` assembles precisely the answer to the question above — every iteration, the decisions, AnA's reasoning per turn, the data lineage — and has no production caller; only its own tests and one type import | eng | open | `server/services/ana/lineage-dossier.ts` |
| L25 | **No stored hash is ever checked against the source bytes.** The byte reader never loads the checksum, and no job sweeps for it. `verifyIntegrityChain` verifies the extracted-text artifact, not the originating document | eng | open | `server/services/ana/uploaded-file-access.ts` |

### 5.1 The approval half — signatures and post-signing change

The audit's second segment asked whether an approval can be trusted: is a signature bound
to the *content* it approved, and does a later edit invalidate it? The binding is written
well on two paths and **never checked anywhere**. Verified by reading the code.

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L26 | **A live route mints signatures with no content binding and no tenant.** FIXED by deletion, not repair — repairing it would have left a second live signing surface beside `/api/esignature/sign`. The writer is gone, the route answers 410 naming the canonical one, and the verification endpoint survives. One signing entry point per substrate, one INSERT | eng | done | `server/services/__tests__/signature-write-path-single.test.ts` |
| L27 | **The one live signature-verification endpoint cannot see a content change.** FIXED: it now re-derives the §11.70 binding through the same shared evaluator the canonical validator uses, reports `attestsToContent` separately from `valid`, and distinguishes BROKEN from NOT_RECORDED. A rewritten document can no longer report valid | eng | done | `server/services/__tests__/signature-content-verification.test.ts` |
| L28 | **The real tamper check is never asked.** Substantially closed by L27: the live path now performs the same content re-derivation via the shared evaluator and `computeVersionBindingDigest`. Remaining: `validateElectronicSignature` itself still has no production caller, so the two verifiers should be consolidated to one | eng | open | `server/services/part11ComplianceService.ts` |
| L29 | **A stale approval read as a current one.** RE-FRAMED on inspection: version content is immutable (zero UPDATEs to `document_versions`), so an edit mints a new version and the old signature correctly covers the bytes it covered — invalidating it on edit would be wrong. The real defect was that nothing could SAY so: the Artifacts Center derived `is_signed` as EXISTS-any, so an artifact signed at v3 and edited to v7 showed the signed badge for content nobody approved. Now reports the signed version and a staleness verdict, null when unresolvable | eng | done | `server/routes/__tests__/artifacts-center-signature-staleness.test.ts` |
| L30 | **`POST /api/ana/submission-chat/apply-rewrite` could not succeed.** FIXED: the snapshot INSERT now names only columns both DDL lineages create, and a version row is written for the NEW content too — previously the ledger held only superseded states, so the e-signature's `artifact_version_id` pointed at the predecessor while its hash covered the new text. Proven against the real DDL in PGlite, including a regression asserting the old statement still fails | eng | done | `server/services/ana/__tests__/apply-rewrite-version-columns.test.ts` |
| L38 | **`artifactVersionStore` writes `updated_at`, which no migration creates.** The drizzle model declares it, so a drizzle-push (install-fresh) database has it and a migration-provisioned one does not — the same 42703 class as L30, latent on exactly the deployments that matter. Either the column joins the migrations or the writer stops naming it | eng | open | `server/services/ana/artifactVersionStore.ts` |
| L31 | **AnA could destroy section history on the 510(k) surface.** FIXED: `write_kit_section` now snapshots the prior content and writes a `cerv2_section_versions` row through the shared `recordCerv2SectionVersion`, inside a transaction with the content UPDATE and behind a `FOR UPDATE` lock — so content and history commit together, and two writers cannot claim the same version number | eng | done | `server/services/cerv2/__tests__/section-version.test.ts` |
| L39 | **Four writers of `cerv2_section_versions`.** The shared writer plus three inline inserts in `routes/cerv2-sections.ts`. All record history correctly, so nothing is unsafe — but the rule is one writer per table, and those three route paths have no tests, so re-pointing them is its own change rather than a rider on L31 | eng | open | `server/routes/cerv2-sections.ts` |
| L32 | **On the governed c2c store, accepted AnA text is recorded as human-authored.** The section PATCH calls `replaceAuthorSpans` only, so the Data Room sources retrieved for the draft never become source spans; only a coarse `draft_source='ana'` flag carries the AI fact | eng | open | `server/routes/c2c/documents.ts` |
| L33 | **Which model, provider, prompt and prompt version produced a draft is never persisted, on any surface.** All four exist at draft time and are returned to the browser, then dropped at accept | eng | open | `server/routes/authoring.router.ts` |
| L34 | **Reason-for-change is enforced by route convention, not by the database.** The version trigger `COALESCE`s an empty reason to the literal `'content change'`, so any future writer that sets the actor GUC but not the reason silently writes that string into a NOT NULL Part 11 column. Elsewhere the reason is a hardcoded literal or absent, and `doc_revisions` has no reason column at all | eng | open | `migrations/20260528_phase9_document_schema.sql` |
| L35 | **RAG retrieval failure is silent.** Both draft paths catch a retrieval error, warn, and let the model draft ungrounded; nothing in the persisted record distinguishes that from a grounded draft | eng | open | `server/routes/authoring.router.ts` |
| L37 | **Two conforming `electronic_signatures` INSERT sites remain.** `signature-persistence.ts` (used by `/api/esignature/sign` and governed sign) and `part11ComplianceService.ts` (used by `submission-sign-release.ts`). Both bind content and set the org, so neither is unsafe — but the repo's own rule is one INSERT per substrate, and a third substrate (`concept2cure_signatures`) has several writers of its own | eng | open | `server/services/part11ComplianceService.ts` |
| L36 | **`ana_action_id` in the immutable version ledger was never written.** FIXED: the version trigger now reads a transaction-local `app.ana_action_id` GUC — the same mechanism the actor and reason already use — and the c2c section save sets it. The trigger resolves the id against `c2c_ana_actions` before using it and writes NULL otherwise, so a stale or bogus value can never turn a section save into an FK violation. `author_kind` (which already worked) is untouched | eng | done | `tests/schema-contract/c2c-section-ana-backlink.contract.test.ts` |

---

## 6. The rule that keeps this file honest

A row moves to `done` when a command proves it, and the command goes in the Evidence
column. Not when an agent reports success — agents have reported success for work that
wrote nothing at all, and that is exactly how `ana-platform-controller`'s audit call came
to write nothing through nonexistent columns behind an empty catch for as long as it did.

Run before trusting this file:

```bash
node scripts/ops/ledger-check.mjs      # rows parse, paths exist, done rows cite evidence
node scripts/ops/ga-readiness-report.mjs   # the procurement half, observed not assumed
```
