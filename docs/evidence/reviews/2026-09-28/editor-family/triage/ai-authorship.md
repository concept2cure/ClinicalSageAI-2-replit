# Triage group: ai-authorship
Returned by the read-only re-check of 2026-09-28 (as returned; scratch paths redacted).

## SEC-A-7 / SEC-B-7 — OPEN — high

### evidence

The defect is unchanged at HEAD. `git log -L` on describeProposer and on the PATCH's machineContributors block shows the last change at e128a656 (2026-09-22), before the review. At 7087f46e2 the same lines were at 1879 and 5911.

- PATCH /sections/:sectionId, `server/routes/authoring.router.ts`:
  - `:1831` `machineContributors(req.body?.acceptedAuthors)` and `:1837` `acceptedMachineText(req.body?.acceptedMachineText)`. Both check vocabulary only (`revision-ledger.ts:188-200`, `:228-240`; MACHINE_AUTHOR_IDS `:170-172` is the single public key 'ana').
  - Origin: `:2078` `contributors.length ? 'ai-draft-accept' : 'human-edit'`. This goes into chain_sha256 (`revision-ledger.ts:12-15`).
  - Lineage: `:2097` accepted_machine_draft spans from the client text.
  - Filing: `:2117` sets draftSource 'ana'.
- Decision routes: `:6276-6277` `if (... MACHINE_AUTHOR_IDS[authorId]) return { proposedBy: ..., proposedByVerified: true }`, used at `:6372` (single) and `:6455` (bulk).
- The from-draft accept is still the only verified door: `consumeDraftCandidate` at `:3526-3553`.
- Commit b43ec3af (P11-B-4, this lane) settles accepted entries against the client document (`suggestions.ts:648-667`). That drops stale entries only. It does not verify anything.
- A forged claim, once recorded, is carried forward on later saves (`machine-attribution.ts:26-33`).

A server record now exists: D5's `ana_turn_records` / `ana_record_blobs` (`migrations/20260926_ana_turn_records.sql:84-126`).
- The engine enforces it: append-only triggers (`:146-190`), and CHECKs that record_sha256 is the hash of record_text and each blob's sha256 is the hash of its text.
- Tenant columns are integer, so the RLS sweep covers them.
- The writer (`turn-record.ts:491-561`) stores `answer.streamed` (`stream.ts:2884`), `answer.stored` (`post-processing.ts:549`) and `outputs.drafts` (`post-processing.ts:552`), each by SHA-256.
- The record id already reaches the workbench's AnA message as `m.turnRecord = {status:'recorded', id, sha256}`:
  - from post_done and error events (`useAnaChat.ts:1207-1233`, `:1608-1611`; `anaProgress.ts:305-315`);
  - from the run_id confirm (`useAnaChat.ts:519-541`).
- Reusable reader: `loadTurnRecord` and `verifyStoredTurnRecord` (`turn-record-verify.ts:147-222`).

Other stores, rejected:
- Draft-candidate store (`draft-candidate-store.ts:89-160`): written only by POST /sections/:id/ai/draft, single-use (DELETE…RETURNING) with a 2-hour TTL. A pending suggestion would lose its proof.
- `ai_retrieval_runs` / `ai_generation_runs`: retrieval rows plus an answer hash only, and the stream does not write them (20260926 header, `:41-47`).

How AnA text reaches the rich editor today:
- Only through `DocumentWorkbench.tsx:4296-4315`, which calls `editorRef.current?.insertSuggestion(m.text, { id:'ana', name:'AnA (AI draft)' })`. No id is carried, although `m.turnRecord.id` is in scope.
- Then `RichSectionEditor.tsx:1497-1503` calls `insertSuggestedContent(text, author)` (`suggestions.ts:891-935`). The mark gets authorId, authorName and a minute bucket only (`:79-97`).
- On accept, `rememberAcceptedAuthor` (`:625-642`) records `{authorId, text}`. The save sends that (`DocumentWorkbench.tsx:2138-2161`), and decisions send `{authorId, authorName, text}` (`:2825-2860`).
- `collectSuggestions` (`suggestions.ts:150-180`) merges adjacent ranges of the same author. Inserts from two turns would therefore become one range.
- `m.text` is the stored answer after post_done (`useAnaChat.ts:1218-1221`), so it is in the record.
- Scratch check (`triage/norm.mjs`) with the proposed normalization (tags stripped, `\|`→`|`, `*` removed, whitespace collapsed, lowercase), against the markdown subset `suggestions.ts:280-470` converts:
  - heading, bold line, table cell with escaped pipe and list item are all contained in the recorded markdown answer;
  - a claim with one word edited is not.

### proposedFix

STORE: ana_turn_records + ana_record_blobs. No migration.

KEY: organization_id = getTenantId(req) (`authoring.router.ts:477`, a number), plus the turnRecordId UUID the server issued, carried on the mark.
- Not the user: the person who inserts is often not the one who accepts (writer and reviewer). What is certified is "these words are an AnA output of this tenant". Store the turn's actor_user_id beside the verified contributor.
- Not the section or document: the record holds only projectId and surface, and where the words go is the human's choice.
- No time window: records are immutable, and a window would un-verify suggestions left pending a long time.

MATCH RULE: verified when `verifyStoredTurnRecord(rec).ok` holds and comparable(claim) is a substring of comparable(answer.streamed | answer.stored | any outputs.drafts[].content).
- comparable = normalizeForMatch after stripping tags, turning `\|` into `|`, and removing `*`. Reuse the normalizer from machine-attribution.ts, so lineage and verification cannot drift.
- Only insertions can verify: AnA never proposes a deletion.
- Only entries of at least MIN_MACHINE_CLAUSE_CHARS (8) count toward the revision origin.

UNVERIFIABLE CLAIM: not refused, not dropped silently.
- The save records origin 'human-edit'. Those clauses stay author_assertion by the saver.
- The claim is disclosed on the revision inputs and on the chained audit row, with a reason: no_turn_record_id | malformed_turn_record_id | turn_record_not_found | record_not_intact | text_not_in_record | too_many_turns.
- Why not refuse: refusal would block honest saves. These cover turns before 2026-09-26, restored threads (`loadThread`, `useAnaChat.ts:601-690`, carries no turnRecord), turns not recorded or unconfirmed, suggestions stored before the fix, and a deletion inside a pending AnA insert. Refusal also cannot close the omission direction: pasted AnA text is always possible. State that limit rather than claim it is closed.

STEPS
1. `suggestions.ts`:
   - add a turnRecordId attribute (`data-ana-turn`) to suggestionAttrs `:79-97`. The sanitizer keeps data-* (`authoring-html-sanitizer.ts:23`);
   - add optional turnRecordId to SuggestionAuthor `:62-67`, SuggestionRange `:139-147`, AcceptedInsertion `:590-594` and SuggestionDecision `:742-752`;
   - carry it in collectSuggestions (do not merge when it differs), rememberAcceptedAuthor, decisionOf and insertSuggestedContent `:895-900`;
   - leave changeIdOf `:734-738` unchanged, so existing change ids stay stable;
   - RichSectionEditor.tsx needs no edit: `insertSuggestion` and `takeAcceptedInsertions` (`:1497-1517`) pass the fields through.
2. `DocumentWorkbench.tsx`:
   - `:4300`: `turnRecordId: m.turnRecord?.status==='recorded' ? m.turnRecord.id : undefined`;
   - flushDecisions context `:2829-2836`: add turnRecordId.
3. New file `server/services/authoring/machine-claim-verify.ts`:
   - `verifyMachineText(q, orgId, entries)` returns `{verified, unverified}`;
   - `verifyProposer(q, orgId, {authorId, changeType, text, turnRecordId})`;
   - UUID regex before any query (the id column is UUID, so a bad id would raise 22P02 and turn every save into a 500);
   - at most 8 distinct ids per request, cached per request;
   - import `loadTurnRecord` and `verifyStoredTurnRecord`; do not edit D5's file.
4. `revision-ledger.ts`:
   - `acceptedMachineText` `:228-240` keeps turnRecordId (string, ≤64 characters);
   - add `contributorsOf(verified)` returning `{id, name, verified:true, turnRecordIds, turnActorUserIds}`;
   - acceptedAuthors becomes redundant (the zero-duplication rule): ignore it now, remove the client send later.
5. `authoring.router.ts` PATCH:
   - verify before BEGIN, on `pool`. The rows read are immutable, and poolInstrumentation.ts:143-200 applies the tenant scope under RLS_ENFORCE;
   - origin `:2078` from verified entries;
   - lineage `:2097` gets verified entries only;
   - draftSource `:2117` from verified contributors;
   - createAuditTrail metadata `:2124-2134` gains `machineText{verified:[{authorId,turnRecordId,chars}], unverified:[{authorId,turnRecordId,reason,textSha256,chars}]}`;
   - revision inputs (`authoring-evidence.ts:309-312`) gain `unverifiedMachineClaims`;
   - the response returns the counts;
   - the from-draft accept (`:3526-3702`) is untouched.
6. `describeProposer` `:6272-6282` becomes async and runs through verifyProposer:
   - proposedBy is always the canonical name for 'ana';
   - proposedByVerified is true only when verified;
   - add proposedByTurnRecordId or proposedByUnverifiedReason;
   - call sites `:6372` and `:6455`.

WHAT THE LEDGER AND UI SAY
- Audit rail (`DocumentWorkbench.tsx:252-268`):
  - verified: "(proposed by AnA (AI draft); text matches recorded AnA turn 1a2b3c4d)";
  - unverified: "(marked as AnA's by the editing client; no recorded AnA turn contains this text)".
- History (`:168-175`, `:4484`):
  - 'ai-draft-accept': "AI draft accepted (matched to AnA's record)";
  - human-edit with unverified claims: "edited — includes text marked as AnA's that no AnA record contains; recorded as the author's".
- Save toast: "Saved. N passage(s) marked as AnA's were not found in a recorded AnA turn, so they are recorded as your text. The audit trail notes the mark."
- Insert toast when the turn is not recorded: "Draft inserted as tracked suggestions. This turn's record is not confirmed, so accepted text will be recorded as yours, noted as marked AnA's."

TEST THAT FAILS FIRST
`server/routes/__tests__/authoringTrackedChangeDecisions.test.ts:305-319` pins the defect today with `expect(md.proposedByVerified).toBe(true)` for a bare authorId 'ana'.
- Invert it: expect 'AnA (AI draft)', false, reason 'no_turn_record_id'. It goes red at `:6276-6277`.
- The pool mock must answer the ana_turn_records read with no rows.

Next: `tests/schema-contract/authoring-section-commits-to-filing.contract.test.ts` (real router, real migrations; add 20260926 and the audit_logs chain to its list).
- A PATCH with acceptedAuthors 'ana' plus acceptedMachineText and no id expects:
  - doc_revisions.origin 'human-edit';
  - c2c_document_sections.draft_source NULL;
  - `audit machineText.unverified[0].reason`.
  At HEAD it is red: origin 'ai-draft-accept' and draft_source 'ana'.
- Green path: seed a record with writeTurnRecord, answer `**Dose:** No dose adjustment is needed in renal impairment.`
  - expect 'ai-draft-accept' and an accepted_machine_draft span;
  - an id from another tenant gives 'turn_record_not_found';
  - 'not-a-uuid' gives 200, not 500.
- Plus a unit test for the matcher, and a client suggestions test: data-ana-turn round-trips, takeAcceptedInsertions carries the id, inserts from two turns do not merge.

Mutants, each must turn a test red:
- drop the containment check;
- drop the organization_id predicate;
- drop the UUID guard;
- drop the verdict.ok check;
- merge ranges while ignoring turnRecordId.

ORDER (HOLDS)
- No hold, can start now: the new verify module and its tests, `revision-ledger.ts`, `suggestions.ts` and its client test.
- The router half waits for 2026-09-29T16:48Z; the workbench half for 11:44Z.
- Claim the D5 slice on the board first (see risk).

### risk

- Behaviour change for customers: AnA text without a verifiable record is recorded as the saver's own text and disclosed as an unverified claim. That covers pending suggestions from before the fix, turns before D5, restored threads, and turns not recorded. AI-transparency counts will fall.
  - Follow-on: loadThread should return the turn record id by joining ana_turn_records.assistant_message_id. That touches useAnaChat.ts, held by …019ZvHmh and …01KZK3jg.
- No backfill: attribution recorded before the fix keeps carrying forward (`machine-attribution.ts:26-33`). The review record should say it was checked against the vocabulary only.
- `loadTurnRecord` loads every text of a record, including model inputs and tool results. Hence the cap of 8 ids. A narrower `loadTurnOutputs` would belong in D5's file.
- Oracle risk is low: probing another member's answer needs its unguessable UUID, and the reply is only verified or not.
- Coordination (the zero-duplication rule): D5 lane …01T2wooC (board row 61) planned slice 2, "Accept or reject of an AI suggestion, linked to the turn record id" (`docs/evidence/D5-ANA-RECORD/2026-09-26/README.md:187-191`). That lane has been idle since 927efe47 (2026-09-26T12:20Z). Claim or hand on through the board before building a second link.

### files

- `server/routes/authoring.router.ts` — held: True — d4176395 2026-09-28T16:48:56Z — session_01KiDof7JE6LiaZhRvh2hJrb (held until 2026-09-29T16:48Z; also e1ce5501/59b0d8f9 same session in window). Board: row 49 (…01Wcyqbq, stale windows) names it
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr89hq8E7ZHUcAH96HK (until 2026-09-29T11:44Z); also 01KiDof7 8a74ed55 11:22Z; board hand-on item 6 gives its editor-family findings to …01KZK3jg until 2026-09-29T01:58Z; board row 77 (this lane)
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — held: True — e1ce5501 2026-09-28T05:17:26Z — session_01KiDof7JE6LiaZhRvh2hJrb (until 2026-09-29T05:17Z). NOT needed by this design: types flow through
- `client/src/concept2cure/v2/editor/suggestions.ts` — held: False — b43ec3af 2026-09-28T04:34:10Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (this lane; board row 77)
- `server/services/authoring/revision-ledger.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2; no board claim
- `server/services/authoring/machine-claim-verify.ts (new)` — held: False —  — 
- `server/services/ana/turn-record-verify.ts (import only, no edit)` — held: False — 927efe47 2026-09-26T12:20:43Z — session_01T2wooCZu46W7msw4TJuuzr; board row 61 (D5) claims it
- `server/routes/__tests__/authoringTrackedChangeDecisions.test.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2
- `tests/schema-contract/authoring-section-commits-to-filing.contract.test.ts` — held: False — 7abcb566 2026-09-26T03:01:52Z — session_01W5zW66wy5szuFwRQYUKmkE
- `client/src/concept2cure/v2/__tests__/trackedChangeDecisions.test.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2

## SEC-A-7 (second half): a decision's sectionId, changeType and text are not checked against :id — OPEN — medium (part of the high finding)

### evidence

`authoring.router.ts`: the single decision route resolves only the document lock (`:6327`). It then records the body's `changeType` (`:6359`), `text` (`:6360-6362`) and `sectionId` (`:6363`) as given. The bulk route records `sectionId` the same way (`:6474`) and each change's text and changeType (`:6456-6462`). Nothing checks that the section belongs to `:id`.

The rail qualifies only the proposer. It prints the quoted text as the record (`DocumentWorkbench.tsx:258-268`). No commit since 7087f46e2 touches these lines.

### proposedFix

1. In both decision routes, when sectionId is a string, run `SELECT 1 FROM authoring_sections WHERE id=$1 AND doc_id=$2 AND tenant_id=$3`. If no row comes back, refuse with 400 SECTION_NOT_IN_DOCUMENT, before the INSERT and the audit event. A decision about another document's section is not a decision on this one.
2. Keep changeType only when it is 'insertion' or 'deletion'; otherwise record null.
3. The rail labels quoted text as the editing client's ("text as recorded by the editing client"), except for AnA text that verifyProposer matched (see above).

Test that fails first: a new case in `authoringTrackedChangeDecisions.test.ts`. The pool mock returns no row for the section of another document; expect 400 and no audit event. At HEAD the route answers 200 and records the foreign sectionId.

### risk

Low. The workbench always sends `activeSectionIdRef.current` (`DocumentWorkbench.tsx:2827`), a section of the open document. The only callers that could be refused are forged or stale ones. One extra indexed read per decision.

### files

- `server/routes/authoring.router.ts` — held: True — d4176395 2026-09-28T16:48:56Z — session_01KiDof7JE6LiaZhRvh2hJrb (until 2026-09-29T16:48Z)
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr89hq8E7ZHUcAH96HK (until 2026-09-29T11:44Z); board item 6 → …01KZK3jg
- `server/routes/__tests__/authoringTrackedChangeDecisions.test.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2

## NEW: a second door with the same defect, the eCTD batch-draft accept — NEW — high (same class as SEC-B-7)

### evidence

- `server/routes/batch-draft-routes.ts:517-525` passes `acceptedMachineText(body.acceptedMachineText)` into enforceAuthorLineage for coauthor_documents. The only check is the vocabulary.
- The client sends the whole card as AnA's: `BatchDraft.tsx:473-475` `{ acceptedMachineText: [{ authorId: 'ana', text: card.machineHtml }] }`.
- The route also records the client's `model` (`:416`) as `lastDraftModel` and in the audit metadata. That is a second client claim: which model wrote the text.
- The generator, POST /api/claude/batch (`ana-intelligence.ts:416+`), keeps no server record. Only `/agent` (`:536-627`) calls recordLoopTurn. So there is nothing to verify this accept against today.
- Result: any member who can accept can record arbitrary text as accepted_machine_draft on a co-author document.

### proposedFix

1. Make /api/claude/batch record what it produced. Use one turn record per batch: openTurnRecorder, then setOutputs({drafts:[{title, content}]}) for each result, then writeTurnRecordSafely. Return turnRecord {id, sha256}, and the model the gateway reported, per result.
2. BatchDraft.tsx sends turnRecordId, not the model.
3. The accept verifies each entry with the same `verifyMachineText` (it checks outputs.drafts). Unverified text is recorded as the accepter's own, with the claim disclosed. The model is taken from the record, never from the body.
4. Until step 1 lands, the accept treats every machine claim as unverified.

Test that fails first: `server/routes/__tests__/batch-draft-accept-lineage.pglite.integration.test.ts`. A forged acceptedMachineText with no record must yield no accepted_machine_draft span. At HEAD it yields one.

### risk

Batch drafts accepted before the fix keep their spans. Until /batch records its outputs, every batch accept loses machine attribution, and that is disclosed. `ana-intelligence.ts` is named by the D5 lane's claim (row 61, for `/agent`), so coordinate through the board.

### files

- `server/routes/batch-draft-routes.ts` — held: False — e854953f 2026-09-24T00:49:49Z — session_01AiwZKGaEFjD9AfVvkYExci
- `server/routes/ana-intelligence.ts` — held: False — 9ef1514e 2026-09-26T13:09:43Z — session_01DiJJAkasGVrccrxjhYyjxG; board row 61 (D5, …01T2wooC) names it for /agent
- `client/src/concept2cure/v2/surfaces/BatchDraft.tsx` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2
- `server/routes/__tests__/batch-draft-accept-lineage.pglite.integration.test.ts` — held: False — e854953f 2026-09-24T00:49:49Z — session_01AiwZKGaEFjD9AfVvkYExci

## Notes

Read-only check; no repository file was changed. Scratch files: board0.md and norm.mjs under <scratch>/triage/.\n\nVerdict: OPEN.\n- No commit since 7087f46e2 changes describeProposer or the PATCH's contributor and origin logic (`git log -L` shows e128a656 only).\n- The server record the review said was missing now exists: D5's ana_turn_records / ana_record_blobs. They are immutable, tenant-scoped and hash-checked, and hold the exact answer and draft text.\n- Its id already reaches the workbench's AnA message as `m.turnRecord.id`. It is dropped at the one place AnA text enters the rich editor (`DocumentWorkbench.tsx:4300`).\n\nHolds:\n- The server half is in `authoring.router.ts`, held by …01KiDof7 until 2026-09-29T16:48Z.\n- The host half is in `DocumentWorkbench.tsx`, held by …01PwLFr8 until 11:44Z, with board item 6 routing its findings to …01KZK3jg until 01:58Z.\n- `RichSectionEditor.tsx` is held (…01KiDof7, until 05:17Z) but needs no edit: the extended SuggestionAuthor type passes through.\n- Unheld parts can start now: `suggestions.ts` (this lane), `revision-ledger.ts`, the new verify module, and the tests.\n\nClaim first: the D5 lane's unstarted slice 2 is \"accept or reject of an AI suggestion, linked to the turn record id\". Claim it on the board or hand it on, so there are not two links.\n\nNew finding: the batch-draft accept is a second client-claimed door, and its generator records nothing to verify against.\n\nLimit to state in the record: verification closes forged claims of AnA text. It cannot close omission, because pasting AnA text without the mark is always possible. So 'human-edit' means \"saved and asserted by this person\", not \"no AI involvement\".
