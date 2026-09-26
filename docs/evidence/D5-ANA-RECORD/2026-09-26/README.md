# Every AnA turn is an immutable, chained, exportable record

**Row:** D5, Part 11 evidence. §11.10(b) (accurate and complete copies, for inspection),
§11.10(c) (records protected for their retention period), §11.10(e) (secure,
time-stamped trails that do not obscure what they record). EU Annex 11 §9. ALCOA+.

## What was missing

For an AI-assisted regulatory record, an inspector asks four questions:
- What did the person ask?
- What was the model given?
- What did AnA do?
- What did she answer?

On 2026-09-26 at `33e16e7a9` none of the four could be answered from anything
retained:

- `chat_messages` held the question and the final answer only. It recorded no
  model, no files, no tool inputs, and no author on the message row. The runtime
  role could UPDATE and DELETE it, and no trigger stopped that.
- `DELETE /api/chat/thread/:id` and `DELETE /api/cortex/threads/:id` removed a
  conversation with no audit row. The chat route also did not check the owner:
  any member of an organization could delete a colleague's conversation by id.
- The only turn-level facts on the tenant audit chain were:
  - a prompt-injection detection;
  - Live Drive screen actions;
  - governed-action signatures.
- `ai_threads` / `ai_generation_runs` is a different capability. It is a
  retrieval → claim provenance overlay for a different route. It stores an
  answer *hash*, not the answer, and it cascades away with its thread.
- Three other doors ran AnA's governed tool loop and kept nothing at all:
  - `POST /api/chat/send-message`
  - `POST /api/claude/agent`
  - the `/ana` socket

## The design

One record per turn, written once and never changed.

- **The record is content-addressed.** Each text is stored once per tenant,
  under its own SHA-256, in `ana_record_blobs`. The texts are:
  - the question, as typed and as sent;
  - every model message;
  - every tool input and result;
  - what the model was actually given of each result, when the budget or the
    drive rewrite changed it;
  - the reasoning;
  - the answer as streamed and as stored;
  - each draft.

  The record in `ana_turn_records` is canonical JSON (sorted keys) that names
  those hashes. It is stored byte for byte as it was hashed. It is TEXT, not
  JSONB, because JSONB re-serialises. Turn 40 of a conversation references the
  history by hash; it does not copy it (live run §2: 8 new texts for a
  follow-up).
- **The record is chained.** It is written in one transaction with a
  `writeChainedAuditRow` row whose details carry `recordSha256`. The chain
  proves the record existed, when it was written, and that it has not changed
  since. Record, texts and chain row commit together or not at all.
- **The engine enforces immutability, for every role.** UPDATE, DELETE and
  TRUNCATE are refused on both tables by row and statement triggers. A CHECK
  constraint refuses a record or a text stored under a hash that is not its
  own. The four triggers are on `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`, so:
  - a production boot refuses without them;
  - securityHealth reports them;
  - the daily sweep alarms (live run §8 shows the check naming a disabled
    trigger).
- **Tenancy follows the house rule.** Both tables are `public`, with
  `organization_id INTEGER NOT NULL`. The tenant sweep gives each a forced RLS
  policy (`db-apply.txt`). The migration is additive, `IF NOT EXISTS`-guarded,
  and has no DROP; it was applied twice on a fresh Postgres 16 (RULE 1).
- **Records outlive the conversation.** `thread_id` is a reference, not a
  foreign key. Deleting a conversation removes the working transcript only. The
  delete is now the owner's act, runs in one transaction, and writes a chained
  `chat.thread.deleted` row that says how many turn records were kept.
- **Every outcome is recorded.**
  - `answered`
  - `stopped`: with the person's cancel, who pressed it and when.
  - `failed`: with the part of the answer the person saw, and the error.
  - A turn refused for naming a colleague's conversation is `failed`, and says
    why.
  - The no-model intelligence-answer path is recorded too.

  The client is told the result on `post_done` or `error`: *Recorded ·
  <hash>*, with a download of the inspection package, or *Not recorded —
  <reason>*. If the connection ended before the server said, the client shows
  *Record not confirmed*. A missing status is never shown as recorded.
- **Every door writes the record.** The four doors are:
  - the stream (`/api/ana-ri/stream`, also `/api/chat/stream`);
  - `POST /api/chat/send-message`;
  - `POST /api/claude/agent`;
  - the `/ana` socket.

  The last three report their tool calls and answer but not their rounds, and
  their records say so in `warnings`.
- **Inspectors can read, verify and export.**
  - `GET /api/ana-ri/turn-records` lists records.
  - `GET /api/ana-ri/turn-records/:id` returns one record, re-verified from the
    stored bytes on every read.
  - `GET /api/ana-ri/turn-records/:id/export` returns a self-contained package:
    the record text, every text, the chain row, the verdict, the server's walk
    of the tenant chain, and the steps to check it. The export is written to
    the chain *before* anything leaves, and is refused when it cannot be.
  - Access: the person whose turn it was, and the organization's admins. A
    colleague gets 403. Another organization gets 404.
  - The document lineage dossier (JSON and XML) lists the retained records of
    its conversation. When those cannot be read, it says `unavailable`, not
    none.

## Shown on the running system

A real server (`npx tsx server/index.ts`) ran on a fresh Postgres 16
(`install-fresh` then `deploy-migrate`, twice). The model was the W1 harness's
local fake (`docs/evidence/W1/2026-09-24-ana-progress/live/harness/fake-anthropic.mjs`).
Everything else was real: auth, upload, tools and storage. Script: `live/run_live.py`.
Output: `live/live-run.txt`, with model identifiers replaced by `<model>`.

| § | Case | Result |
|---|---|---|
| 1 | Answered turn with an uploaded file | recorded. The record names the exact upload bytes (`uploadSha256` = SHA-256 of the file sent). It holds 6 plan updates, 6 tool steps (the refused draft as `error` in the server's words) and 6 numbered model calls. Verdict ok. |
| 2 | Follow-up in the same conversation | recorded. Turn 1's question appears in turn 2's model input by hash. 8 new texts were stored. |
| 3 | The person pressed Stop | `stopped`, with `controls: [{action: cancel, byUserId, at, round}]` |
| 4 | The model endpoint was gone | `failed`, with the gateway's error in `warnings` |
| 5 | The intelligence-answer path (no model) | `failed`. The only step errored and the person was given the error. |
| 6 | Export | Five checks PASS in `live/verify-turn-export.mjs`, which uses Node's crypto and the file, and no product code. The export was audited on the chain. |
| 7 | UPDATE / DELETE / TRUNCATE on both tables, as the database **owner** | all six refused with `IMMUTABILITY_VIOLATION` |
| 8 | Owner disables a trigger and rewrites a record self-consistently | The boot/sweep check reports `11/12 … disabled: …ana_turn_records…`. The API verdict turns `ok: false` (`chainCarriesHash: false`). |
| 9 | Delete the conversation | 200. A chained `chat.thread.deleted` row with `turnRecordsRetained: 2`. The transcript is gone, and both records are still listed and verify. |
| 10 | `send-message`, `claude/agent`, `/ana` socket | each recorded and verified, with its limits stated in `warnings` |
| 11 | A turn naming a colleague's conversation | refused, recorded `failed`, reason stated |
| 12 | `npm run ops:verify-audit-chain` | `verdict: OK`, every `audit_logs` row chained |

## Shown failing on the cases it exists to catch

- **The offline verifier, on tampered packages** (`live/verifier-fails-on-tamper.txt`).
  The untouched package exits 0. Each of three tamperings exits 1 on the right
  check:
  - an edited text;
  - a record rewritten and re-hashed;
  - a removed text.
- **Mutations** (each guard broken in turn, then restored). Each one turns its
  test red:
  - `mutations-routes.txt`: 8 of 8 — the owner check, list scoping, the export
    audit, the unknown chain walk, the payload-hash check, the delete owner
    check, the delete audit atomicity, and the retained count.
  - `mutations-post-processing.txt`: 7 of 7 — filing, stopped, the answer's
    message id, the controls, no double filing, filing on failure, and the
    status on `post_done`.
  - `mutations-loop-doors.txt`: 6 of 6.

  Earlier in this change, on the store itself: the TRUNCATE guard, the blob
  trigger, the blob CHECK, ROLLBACK→COMMIT, and `chainCarriesHash`.
- **The engine, on real Postgres** (`live-run.txt` §7–8), as above.
- **The tenant fix on `/api/claude/agent`.** The live run first showed that
  door filing *not recorded — no organization*. It read `req.organizationId`,
  which that mount never sets, so it also ran its tools with no tenant. The
  door now uses the canonical resolver. The new test fails on the old
  resolution (`mutations-loop-doors.txt` covers the rest).

`tests.txt`: the new tests by name, and every suite the change touches — 306 files, 3,966 tests, none failing. The same 24 gates that
pre-push and CI run are green, and `ci:pushed-lint-warnings` shows net −1.

## Reviewed

- **Security auditor.** It confirmed that tenancy comes from server context,
  that the blob query is scoped, that document bytes are hashed and never
  stored, that the migration is replay-safe, and that the delete fix is
  correct. It found the three unrecorded doors and the refused-thread exit;
  both are fixed above.
- **Part 11 UX auditor.** It found that an interrupted turn showed no status,
  and that nothing in the UI reached the export. Both are fixed: *Record not
  confirmed*, and *Download the record for inspection*.

## Not done here — named, not hidden

- **Privilege backstop.** The runtime role holds full DML on `public` (DP-04 /
  DP-05 baseline), so immutability rests on the triggers, which the owner can
  disable. The boot check and the sweep catch a disabled trigger, and the chain
  catches a rewrite, but a REVOKE would stop it first. That belongs in P0-8's
  `APPEND_ONLY_TABLES` (`provision-app-role.mjs`): add `public.ana_turn_records`
  and `public.ana_record_blobs` beside `audit_logs`.
- **Retention and erasure.** The tenant purge does not list these tables. Their
  retention is indefinite until a governed purge or erasure path exists (VR-07,
  plan P2-9). That path amends the migration in place (RULE 1). Records hold
  conversation text and tool I/O, which may include personal data (DP-10 /
  DP-19).
- **Slice 2: comments and quotes.**
  - Authoring comments and quoted anchors on the chain with body and anchor.
  - Accept or reject of an AI suggestion, linked to the turn record id.
  - The verbatim draft preserved.
  - `authoring_comments` / `authoring_audit_trail` made append-only.
- ~~**Other routes in `ana-intelligence.ts`.**~~ Done in `f5122fe99`: every
  route took no tenant, and `/batch` preferred an organization named in the
  request body. Evidence: `docs/evidence/D6/2026-09-26-claude-identity/`.
- **Deep investigation.** A background deep investigation's own model calls are
  not turn records. The turn whose tool started it is.
- ~~**A stopped turn and the client.**~~ Done: after Stop, a timeout or a
  dropped connection, the client asks `GET /api/ana-ri/turn-records?run_id=`
  (1.5 s, then 4 s) and shows the record the server filed. A turn the server
  cannot confirm stays *Record not confirmed*. Pinned by
  `useAnaChat-turn-record.test.ts` and the `run_id` case in
  `turn-records.pglite.test.ts`; each fails when its guard is removed.
