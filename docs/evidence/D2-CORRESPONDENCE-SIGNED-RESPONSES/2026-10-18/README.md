# D2, D5: an answer to an agency is approved by signature, and nothing goes back on an unsigned one

**Rows:** D2 (launch catalog: Communication and Respond, Projects app) and D5 (Part 11 record integrity).
**Date:** 2026-10-18. **Decision followed:** P-32 ("agency questions follow when their approval is signed").
**Map of what remains:** `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`.

## The defect, on trunk `c1a6916c`

- **The inbox could not hold an answer.** A letter in the project's agency inbox
  (`concept2cure_agency_communications`, shown by Communication and Project home's Respond) kept its questions as a
  JSON array of strings. A question had no response, owner or approval of its own.
- **Advance closed a letter nobody had answered.** The second Advance on a card set `closure_status = 'closed'`
  whatever had happened to the letter's questions.
- **The one screen with responses approved them with a flag.** `/api/haq-manager` (a JSON store in
  `project_memory_entries`, on whichever project the organisation listed first) approved a response by setting
  `status = 'approved'`: no signature, no reason, no role check. Its response package was assembled from those flags.
  No endpoint could record a letter, so the store could only be empty. P-32 kept the screen locked for this.
- **A viewer could fulfil a postmarketing requirement.** `POST /api/ha-interactions/commitments/:id/fulfill`
  had no role gate. The trunk run below shows a viewer's fulfil answered **201**. A fulfilment date in the future
  was accepted too.
- **A commitment could not name the answer it was made in.**
- **Every open commitment was painted as an error.** The Commitments tab coloured a chip by `on_track` and `due_soon`,
  values the register never returns, so `open` fell through to the error tone.

## The change

| Piece | File |
|---|---|
| The record: one row per question, with the response, its revision and its author. No approval column. | `migrations/20261018b_agency_response_questions.sql` (in `C2C_MIGRATION_FILES`, above the final sweep pair) |
| What a response's state is, the digest a signature binds, separation of duties, the close rule, the package | `server/services/agency-responses/response-logic.ts` (pure) |
| The SQL, every statement naming organisation and project | `server/services/agency-responses/response-service.ts` |
| Routes, on the Communication Center router's chain | `server/routes/c2c/agency-responses.ts` |
| The content binder: the signature binds letter id, question and exact response text | `server/services/part11/governed-target-binders.ts` (`agency-question`), basis `agency-response-content-sha256` |
| The close rule on Advance | `server/routes/c2c/communication-center.ts` |
| Commitments name project, letter and question; editor gate, tenant context on the transaction, no future fulfilment date | `server/routes/ha-interactions.ts`, `server/services/ha-interactions/ha-service.ts` |
| The screen: questions, response editor, approval through the shared Part 11 dialog, commitments, package | `client/.../surfaces/AgencyResponses.tsx`, opened from each inbox card (`AgencyInbox.tsx`) |
| Commitments tab: record, fulfil, honest chip tones | `client/.../surfaces/CommunicationCenter.tsx` |
| The retired store's screen, now a view of the same inbox | `client/.../surfaces/HaqManager.tsx` |

**How approval works.** A response is approved when a live signature (`superseded_by IS NULL`) on
`agency-question:<id>` binds the digest of the response as it stands. The approval is never stored, so it cannot
disagree with the signature table. Editing one character changes the digest. The earlier signature still exists and
still says what it approved, but it no longer approves this text. The screen says "changed after approval" and names
the earlier signer. **Correction (2026-10-18, review round):** as committed in `0308ee25`, the edit overwrote the approved text, so the
earlier signature held a digest of text that existed nowhere. Every text is now kept, append-only, with the
signature that approved it; see `../2026-10-18-review/README.md`, finding 1. The signature goes through the platform's one ceremony (`governed-signed-act.ts`): reason,
meaning (approval or responsibility), password, second factor when enrolled, signing authority from the membership
row. The domain write, the ledger pair and the `electronic_signatures` row commit together.

**Who may sign.** Not the person who wrote the current text. That person is told on the card before any dialog
opens, and the server refuses them anyway (403 `SIGNER_WROTE_RESPONSE`). The signer also sends the revision they
read; a signature over any other revision is refused (409 `RESPONSE_CHANGED`). Saving identical text is refused, so
a person cannot become the author of words they did not change.

**What leaves the system.** The package assembles only when every question is approved as it stands; otherwise the
server names each outstanding question. It is delivered through `sendAuditedDownload`, which records the SHA-256 of
the bytes delivered and delivers nothing if the record does not persist. Each response in it carries its signer,
time, meaning, signature id and response digest.

**What it does not do.** No model is called. AnA drafts in the conversation ("Draft response with AnA" on the card,
the letter pinned); a person saves the words and another person signs them. No AnA tool can sign. Questions are
recorded by hand. The demo seed (`scripts/seed/ga-demo.d/94-haq.mjs`, rewritten onto these tables) seeds no
approval, because a seed cannot sign.

## Proof

All runs are on PostgreSQL 16 with pgvector. The database was provisioned from empty the way CI does it
(`install-fresh` then `deploy-migrate`), and the tests ran as the non-superuser `app_service` role with
`RLS_ENFORCE=on`.

| Run | Result | File |
|---|---|---|
| New suite against trunk code (routes absent) | 5 failed, 15 could not set up, 1 passed | `red.txt` |
| Commitments block against trunk `ha-interactions.ts` | viewer fulfil **201**, future date accepted | `commitments-red.txt` |
| Full suite with the change | **25 / 25 passed** | `green.txt` |
| Mutation 1: the author may approve their own response | 5 fail | `mutation-1.txt` |
| Mutation 2: Advance closes regardless of responses | 4 fail | `mutation-2.txt` |
| Mutation 3: approval read from any live signature (a flag), not the bound digest | 3 fail | `mutation-3.txt` |
| Migration applied by `deploy-migrate` twice (Rule 1 replay) | both runs apply cleanly; new table carries `tenant_isolation_policy`, forced RLS | `migration-replay.txt` |

Also green: `server/services/agency-responses/__tests__/response-logic.test.ts` (19),
`client/.../__tests__/agencyResponsesSignedApproval.test.tsx` (5), the deploy-DDL pglite suite
`server/routes/c2c/__tests__/communication-advance.pglite.test.ts` (with a new case: a letter with an unsigned
response is not closed), and the launch-scope lock tests, rewritten for the retired namespace.
Gates: every gate in `.husky/pre-push`, `ci:launch-scope`, `ci:launch-scope-api`, `check:compliance-claims`,
`check:microcopy`, `check:security-patterns`, the repo-health no-regression scan, and `tsc --noEmit` (0 errors).

**Pre-existing failures in this container, unchanged by this work** (identical on an untouched trunk checkout):
- `domain-sign-ceremony.dbtest.ts`: 10 cases refuse with `determinationDate: Required`.
- `smoke.test.ts`: `/api/cortex/chat` invalid-JWT case times out.
- Five `server/routes/c2c/__tests__` files: ai-editing ×2, export-docx, export-pptx and project-route-access.

## Deletion record (CLAUDE.md working agreement)

`server/routes/haq-manager.ts`, its mount, and its three tests are deleted. Rows it may have written
(`project_memory_entries`, category `haq_question`) are left in place under retention and have no reader; the store
could not record a letter, so none can hold a letter's questions. `git log --all --diff-filter=D` shows no
earlier generation of this screen. The same outcome (questions on an agency letter, a response to each, approval, the
response package) is delivered by `client/src/concept2cure/v2/surfaces/AgencyResponses.tsx` over
`server/routes/c2c/agency-responses.ts`. It is reachable from the `communication-center` and `project-home` launch
surfaces (`ci:launch-scope`, `ci:launch-scope-api`, and `server/middleware/__tests__/launch-scope-api-gate.test.ts`
"answers launch for the agency-response paths").

## Owed

- The six other correspondence and commitment stores listed in the gap analysis. `reg_questions` (CMC / Module 3)
  goes first, because it sits inside a launch app. *2026-10-19:* done as far as P-39 item 1 asks: CMC reads Module 3's
  questions from the letters and writes none, and `reg_questions` is read-only in the route and the database
  (`docs/evidence/D2-CMC-QUESTIONS-ONTO-INBOX/2026-10-19/`). Still owed from it: the governed act that moves a row
  not closed there onto a letter (deferred until a deployed estate shows such rows; the count query is in that
  README), and a purge door for the file (it refuses DELETE and TRUNCATE to every role). A question's owner is set on
  the letter, with a reason, since that slice's review.
- Extracting questions from the letter file; a fulfilment naming the sequence or document that met it.
- URS and OQ coverage for this function (row D4).
