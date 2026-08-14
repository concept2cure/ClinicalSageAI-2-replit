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
| L18 | **Extraction fabricates content when it cannot read the file.** `extractText` returns `` `[Extracted content from …]` `` when no artifact row matches, and `` `[Pending extraction from …]` `` from a bare catch — then the caller hashes that string and stores it as a governed `category:'extracted'` artifact. The catch fires reliably: the second query reads a table named `uploads`, which no migration creates. **Latent, not live** — the pipeline's only entry point 500s (L19), so it cannot run today. Fixing that route without fixing this would begin writing invented content as governed evidence; they must land together | eng | open | `server/services/autoExtractionPipeline.ts` |
| L19 | **The extraction pipeline's only HTTP entry point returns 500 unconditionally.** `audit-services.ts:388` passes one object to `queueExtraction(fileId, fileName, fileSize, …)`, which is positional, so `fileName` is undefined and `detectFileType` throws. No other caller exists anywhere | eng | open | `server/routes/audit-services.ts` |
| L20 | **Two `content_hash` values can never verify.** The main artifact stores `content` truncated to 100k but hashes the untruncated text, so any document over 100k chars is permanently reported tampered. The table artifact stores an **MD5 of a different object** in a column the audit report verifies as SHA-256, so it never matches. Both surface as false tamper alarms in `verifyIntegrityChain` | eng | open | `server/services/autoExtractionPipeline.ts` |
| L21 | **Source documents are not versioned.** `cre_evidence_sources.version` exists and no caller ever passes it; there is no `previous_version_id`, no `is_current`, no update path. A revised protocol becomes a second unlinked row, so a fact cannot be told it rests on superseded content | eng | open | `server/services/clinical-regulatory-evidence/evidence-spine.service.ts` |
| L22 | **The correctly-modelled provenance tables have zero writers.** `evidence_sources` / `evidence_claims` carry exactly what is missing elsewhere — version chain, `is_current`, `page_number`, `section_reference`, `sentence_index` — and nothing inserts into either. Two live services read them, so they query permanently empty tables | eng | open | `shared/schema.ts` |
| L23 | **A filed eCTD leaf does not pin what it shipped.** `submission_leaves` has `document_table` / `document_id` / `checksum` but no version column, the document pointer is optional and client-supplied, and the IND path passes none at all — only a checksum when available. So from a filed IND leaf you cannot traverse back to the document, let alone the source | eng | open | `server/services/ind-lifecycle/ind-lifecycle-persistence.ts` |
| L24 | **The end-to-end lineage dossier is unreachable.** `lineage-dossier.ts` assembles precisely the answer to the question above — every iteration, the decisions, AnA's reasoning per turn, the data lineage — and has no production caller; only its own tests and one type import | eng | open | `server/services/ana/lineage-dossier.ts` |
| L25 | **No stored hash is ever checked against the source bytes.** The byte reader never loads the checksum, and no job sweeps for it. `verifyIntegrityChain` verifies the extracted-text artifact, not the originating document | eng | open | `server/services/ana/uploaded-file-access.ts` |

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
