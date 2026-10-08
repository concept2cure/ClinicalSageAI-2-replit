# AnA Summary: Claude-style long work, and a per-turn timeline the client can see

**Date:** 2026-10-08. **Status:** design only. No code was changed. Checked against `concept2cure-v2` at `0e50993c5`.
**Asked by:** the founder, 2026-10-08: *"See attached screenshots of the work Claude does and I must make sure AnA can do all this same kind of work and clients can see a view like this too."*
**Revision:** this is the second draft. The first draft was reviewed by two critiques, a governance review and a product review. Section 7 lists how each of their points was handled.

## Summary

The screenshots show Claude's per-task Summary on a phone. It is a vertical timeline of everything the agent did: its own short narration notes, tool calls labelled by the source they searched, with a preview of the query, work steps, task-list events, and parallel agent work, each with a chevron that opens its details. AnA already does most of the underlying work for a regulatory client: she plans with `update_plan`, searches and reads the Vault and data room, runs deterministic engines, searches connected repositories, and seals a hash-chained record of every turn. Four things stand between that and the screenshots. Three are defects underneath the work. A document read records coverage over text the model never received. The connector search fails on its own advertised Drive id and sends client queries to public APIs. 527 of the 608 in-scope tools have no label, so raw tool names appear on screen in the present tense. The fourth gap is the view itself: there are no note rows, no task history, and no source, and nothing survives a reload. This design fixes the defects first (S1–S3). It then builds the Summary as the body of AnA's existing Progress panel for a chosen turn, and as a bottom sheet on a phone (S4). The Summary is fed by one stream of client-safe timeline events that the server sends live and seals into the turn record as schema `/4`, so the live view and the reloaded view are the same data. S5 adds task ids and step-to-task attribution. A governed Drive listing and import into the Vault (S6) is new capability and waits on two founder decisions. Two things are deferred to their own decisions: keeping a turn running after the page closes, which is the largest remaining gap against the screenshots, and parallel sub-agents. The lane moves no D-row. It runs as the founder's explicit exception to Rule 2, the way ANA-AGENTS does.

---

## 0. Where this sits under Rule 2

- **The lane.** This work is `ANA-SUMMARY`, the founder's ask of 2026-10-08. It moves **no D-row**. The first draft filed it under D5, and that was wrong. What D5 still owes is the KMS keys, a KMS-backed signer and a production verifier run (`docs/LAUNCH_DEFINITION_OF_DONE.md:21`), and none of this work moves any of them. The lane is recorded the way `docs/evidence/ANA-AGENTS/2026-09-27/README.md:3-4` records its lane: a founder-directed exception with its own evidence folder. Decision 1 asks the founder to put it on the work-order board.
- **Workstream.** None of W1–W7 owns AnA's loop, because each W maps to a D-row. The lane's directory set is:
  - `server/services/ana/`
  - `server/routes/ana-ri/`
  - `server/services/connectors/` and `server/services/integrations/connector-search.ts`
  - `client/src/concept2cure/v2/` (AnaActivity, AnaWorkPanel and the new Summary files)
  - `client/src/concept2cure/components/ana/`

  S1 and S2 fix tools in the launch catalog (Vault reads and connector search). Their evidence is cross-referenced from W1's folder, but they do not claim D2: D2's criteria are apps on by default, flags off and fixture gates.
- **Evidence.** One folder per slice: `docs/evidence/ANA-SUMMARY/<date>/S<n>-<name>/`. Each folder holds the red test output, the green test output, and the browser captures named in that slice's acceptance.
- **No new surface.** The Summary is a view inside surfaces that already ship: the conversation (`'conversation-thread'`, `shared/constants/launch-scope.ts:147`) and the hosts that already mount AnA's Progress panel. S1–S5 add no new tool. S6 adds two, and S6 is listed for the founder as new capability (decision 5).
- **Truth (Rule 2):**
  - Every count, status, duration, source and chronology on the Summary comes from events the server wrote.
  - Notes are AnA's words. They are marked as hers, are never counted, and read "not checked" until the turn's answer check exists.
  - "Used a model" comes from the runtime generation capture (`server/services/ai-gateway/generation-capture.ts`), never from a list of tools someone believes call a model.

---

## 1. Gap table

### 1a. Row kinds in the screenshot Summary

| Row kind | What AnA has today | Gap | Change (slice) |
|---|---|---|---|
| **Narration note** (grey dot) | Round prose streams as `text` and is appended to the answer (`stream.ts:2853-2866`). On models that return notes as thinking blocks, `ProgressNotes` reads them as text only while visible reasoning is off (`ai-gateway/progress-updates.ts:38-48, 77-118`). Thinking is on for any message of 240 characters or more, a deep lens, Thorough, or a high risk tier (`ai-gateway/reasoning.ts:83, 100-104, 128-140`), and the notes then land inside the reasoning summary. A round with no prose is staged as `(Ran: tool_a, tool_b.)` (`agentic-loop.ts:822-829`). | No note row and no boundary between notes. On substantive turns there are no notes at all, because they are inside the reasoning. | **S4:** when a model call returns tool calls and its round text is non-empty, the server emits one `note` event. The source of notes on thinking turns is decision 3. The answer body is unchanged (decision 4). |
| **Tool call labelled by source, with query preview** | 88 server labels (`agentic-loop.ts:675-794`). Any other tool falls back to `humanizeToolName` (`:669-672`), and the client has its own second table and fallback (`useAnaChat.ts:340-366`). 527 of the 608 in-scope tools are unlabelled. Labels never change tense. The read label never names the document (`:767-770`). | Raw tool names on screen, no source, no preview on most rows, and two label tables. | **S3:** one presentation entry per tool in `tool-authorization.register.json` (verb, object, source, preview fields), with both tenses taken from a closed verb table. Both `TOOL_LABELS` tables are deleted. A CI gate requires an entry for every in-scope tool. |
| **Work step** (terminal glyph) | No shell. Code execution is never offered (`governed-toolset.ts:160-162`). Deterministic engines (validators, checks, packagers) render like any other tool. | No distinct kind. | **S3:** source `engine`, set explicitly per tool in the register, never by default. The engine glyph is shown only when the step's generation capture recorded no model call. No shell, ever. |
| **Task-list events** | `update_plan` returns the normalised plan (`turn-plan.ts`), and the stream sends `plan` frames. `diffPlan` computes added, started, completed and removed changes on the client (`anaProgress.ts:241-262`), but the transcript leaves starts and completions out on purpose (`AnaActivity.tsx:350-380`). The record keeps every plan snapshot with its time (`turn-record.ts:404-406`). Message metadata keeps only the final plan. | No Started or Completed rows, no task ids, and no history after reload. | **S4:** the server emits `task` events with ids, using `diffPlan` moved to `shared/`. **S5:** step-to-task attribution and the "marked complete, steps failed" fact. |
| **Parallel agent work item** | `run_agent` is built but not hosted (`stream.ts:762` passes no `hostsSubAgents`). It is off in production (`sub-agent-limits.ts:30-35`). Calls within a round run at most 4 at once (`agentic-loop.ts:637-655`). | No agent rows. | **Out of this plan.** ADR-0015 S6 in the ANA-AGENTS lane adds a `parent` handle to step events when it hosts `run_agent`. One row per step; no "together" grouping (§4). |
| **Expandable details** | The chevron shows the duration, the round and raw `JSON.stringify(input)` (`AnaActivity.tsx:279-281`), which puts ids on screen. The result is never shown. After a reload, steps that succeeded have no chevron. | A redaction defect, no result facts, and nothing after reload. | **S3:** details are allow-listed facts plus the server's own status sentence. Raw input and `resultSummary` are never rendered. |
| **Live and after reload** | The live view is built from frames. Reload reads `chat_messages.metadata` and loses inputs, durations, rounds and plan history. Records cannot be joined to messages: the history query selects no id (`chat-thread-helpers.ts:257-265`), and the client builds ids as `t-${threadId}-${idx}` (`useAnaChat.ts:855`). | The reloaded view does not match the live one. | **S4:** the same timeline events are sent live and sealed in record `/4`. Reload joins records to messages by message id. |
| **Per turn** | `AnaActivity` is per turn. `AnaWorkPanel` shows only the latest turn (`AnaWorkPanel.tsx:101-106`). | No full view of an earlier turn. | **S4:** `AnaWorkPanel` takes a `turn`. The folded line of any turn opens the panel at that turn. |
| **Survives a locked phone** | A closed socket stops the run (`stream.ts:719-737`). A phone that locks or changes apps ends the task, and so does a reload. | The screenshots' use case, a long task followed on a phone, cannot run today. | **Decision 2** (detach). Until it is decided, S4 shows an honest closing row: "Stopped: this page lost its connection." with Continue. |
| **Visible to the client** | Turn records are readable by the asker and by admins and owners; a colleague gets 403 (`turn-records.ts:90-94`). Thread transcripts are readable by the whole organisation (`threads.ts:188-210`); only renaming checks the owner (`:318-327`). | The asker can see their own turns. A colleague can read the transcript but not the record. | The Summary keeps the record's rule. The transcript inconsistency and the sponsor/CRO question are decision 6. |

### 1b. Kinds of work, and the defects underneath them

| Work | What AnA has today | Gap or defect | Change (slice) |
|---|---|---|---|
| **Search the client's sources** | Vault (`list_project_documents`, `search_project_documents`, `search_document_passages`), data room (`project_knowledge_search_multi`, `search_large_document`), Authoring (`search_authoring_sections`), submissions (`validate_ectd_package`, `get_submission_ack`), agency lookups, and connected repositories (`search_connected_repositories`). | **Defects:** the schema's example id `google-drive` (`evidence-literature-tool-defs.ts:119`) is refused as "unknown connector" because the registry id is `google_drive` (`connector-registry.ts:77`, `connector-search.ts:82-83`). With `connectors` omitted, the tool searches every catalog entry (`connector-search.ts:114-116`), including credential-free public sources that count as configured (`connector-registry.ts:117`), so a client's query reaches PubMed, openFDA and others whatever `publicSourceEgress` says. Backslashes are not escaped (`google-drive.ts:141`). Shared drives are never searched. | **S2.** |
| **Read many documents** | `read_project_document` reads with receipts and coverage. `catalog_project_document` refuses until coverage is complete. | **Defect:** the default read window is 30,000 characters (`document-catalog-tools.ts:225-231`), and the receipt covers the whole window (`:321-327`). The model receives at most 8,000 characters of a result, as head plus tail with the middle cut (`agentic-loop.ts:543-555`), and less when a round exceeds 24,000 characters in total (`:581-595`). Coverage and the catalog's check pass on text AnA never read, and the next offset skips the cut middle. Authoring reads already hold each result to 5,000 characters for exactly this reason (`authoring-read-tools.ts:28-41`). | **S1, first.** A connector file cannot be read at all today. S6 brings connector files into the Vault, after which they are read like any other Vault document. |
| **Plan with a task list** | `update_plan` is always offered. Its guidance already says to plan any request of three or more steps and to mark a step completed only when it is done (`turn-plan.ts:55-60`). | Ids, history and attribution. | **S4, S5.** No guidance is added. |
| **Parallel reading** | Up to 4 concurrent calls per round. Sub-agents are not hosted and are off in production. | Parallel reads make the read defect worse, because each one is squeezed smaller. | Nothing is added for parallel reading. After S1, parallel reads are safe because a read is delivered whole or not at all. Sub-agents stay in the ANA-AGENTS lane. |
| **Long work** | Round ceilings: Fast 4, Balanced 6 (+2 earned), Thorough 10 (+4) (`agentic-loop.ts:277-302`), Auto 20 (`shared/ana/run-control-limits.ts:49`). A turn the ceiling stops reads "Stopped at the round limit" with Continue (`anaWorkModel.ts:41-50`). | A real "read every report" request stops at the ceiling. | No budget change. The Summary's closing row reuses the existing stop line and Continue. S4's acceptance corpus is sized to fit the budget. |
| **Assemble a result** | The answer plus the turn check (`turn-verification.ts`, run after the turn at `routes/ana-ri/post-processing.ts:470`), and `generate_report`. Storing a governed draft in production needs a PQ-passed model (0 of 4 have one, D4). | No new gap. | A governed-write refusal shows as a row with the server's sentence, never as success. |

---

## 2. Data model: one event stream, sealed with the turn

### 2.1 Shape

There is no new table and no new column in S1–S6. The recorder already holds the whole turn in memory and seals it at the end (`turn-record.ts`), so the timeline is sealed from the recorder, the one writer of a turn's steps. The first draft's `ana_runs.step_events` column is dropped. It existed only for rejoin, and rejoin is only useful once turns survive a closed page (decision 2). The deferred design D1 (§5) records what it would need.

**One producer.** The stream calls `emitTimeline(event)`, which:
1. appends the event to the recorder, and
2. writes it to the client as a `timeline` frame.

The existing `tool_use`, `tool_result` and `plan` frames keep feeding the client parsers that read them today (§6, risks). The Summary reads only `timeline` events. A test feeds one turn through and asserts that the frames received equal the sealed events.

```ts
// shared/ana/turn-timeline.ts — one shape for the wire, the sealed record and the Summary payload
export type TimelineEvent = { seq: number; at: string /* server ISO */; round: number } & (
  | { kind: 'note'; text: string }               // sealed as { kind: 'note', text: TextRef } (§2.4)
  | { kind: 'step';
      phase: 'announced' | 'awaiting_approval' | 'finished';
      step: string;            // opaque per-turn handle "s7"; never the tool_use id
      task: string | null;     // "t2" (S5); null before S5, for update_plan, or unless exactly one task was in progress
      source: SourceKey;
      label: string;           // the doing form while announced or awaiting, the done form when finished
      preview: string | null;
      status?: StepStatus;     // finished only
      heldBack?: boolean;      // finished only: a person's no, no answer, or an action only a person may take
      message?: string;        // finished only: the server's sentence, rendered word for word (§2.6)
      usedModel?: boolean | null; // finished only: the generation capture saw a model generation; null = unknown
      ms?: number;             // finished only: from handler dispatch to result; approval waiting excluded
      facts?: Fact[] }
  | { kind: 'task'; task: string; change: 'added' | 'started' | 'completed' | 'removed'; title: string }
  | { kind: 'end'; outcome: 'answered' | 'stopped' | 'failed'; stoppedReason: string | null }
);
export type SourceKey =
  | 'vault' | 'data_room' | 'authoring' | 'submissions' | 'qms' | 'reports' | 'project'
  | 'agency' | 'literature' | 'knowledge'
  | 'connected'          // one search across several connected systems
  | 'google_drive' | 'box' | 'onedrive' | 'sharepoint' | 'veeva_vault'
  | 'mailbox' | 'web' | 'screen' | 'plan' | 'engine';
export type StepStatus = 'success' | 'error' | 'not_found' | 'cancelled' | 'not_run';
export type Fact = {
  name: 'Searched for' | 'Document' | 'Section' | 'Sequence' | 'Folder' | 'Found' | 'Pages'
      | 'Characters read' | 'Systems searched' | 'Systems not searched' | 'Took' | 'Model';
  value: string;
};
```

**Controls** (pause, resume, steer, stop) are not copied into the timeline. They are already sealed as `controls`, read from `ana_runs.control_events`, which other instances append to (`turn-record.ts:446-452`, `run-control.ts:519, 616`). One shared function, `orderTimeline(events, controls)`, merges them by `at` when rows are built:
- **Live:** the controls come from the run state the client already holds (`runStatus`, `pendingSteers`).
- **Sealed:** they come from `record.controls`.

Ties keep recorder order first. Controls accepted on another instance can sit one row off because of clock skew; this is listed under risks.

### 2.2 The record, `/4`

- `TURN_RECORD_SCHEMA` becomes `'ana-turn-record/4'` (`turn-record.ts:71`).
- **New fields:**
  - `timeline: SealedTimelineEvent[]`, the recorder's events.
  - `stoppedReason`. The run's reason, including `client_disconnected`. The record today has `outcome: 'stopped'` and no reason.
- **`RecordedStep` gains:**
  - `toolUseId`, which `addStep` drops today (`turn-record.ts:408-420`);
  - `handle`, linking the step to its timeline events;
  - `startedAt`, at handler dispatch;
  - `endedAt`;
  - `heldBack`;
  - `message`;
  - `usedModel`.

  The full `steps[]`, with inputs, results and `sentToModel`, stays exactly as it is.
- `/1`–`/3` records stay valid. `turn-record-verify.ts` has no schema gate, so nothing changes there. Only the Summary branches on the version: a record without `timeline` gets the trace-only rows (§2.7).
- `ana_turn_records` stays write-once (`migrations/20260926_ana_turn_records.sql:161-207`). No migration is needed.
- **The cancel case.** Results emitted after a cancel are still recorded. A cancel sets the run to `cancelled` when it is accepted (`run-control.ts:609-617`), but the recorder is in memory and accepts events until it seals. So the rows that say "You stopped this step" are never lost. The first draft guarded writes on a live status and lost exactly these rows.

### 2.3 Who computes what

- **The register holds presentation.** `server/services/ana/tool-authorization.register.json` already has one entry per tool. Each entry gains a `present` block:

  ```json
  "search_project_documents": { "class": "read", "...": "...",
    "present": { "verb": "search", "object": "the Vault", "source": "vault", "preview": ["query"] } }
  ```

  - **Verbs.** `verb` is a key of a closed table in `shared/ana/step-verbs.ts`, for example `search → Searching / Searched` and `read → Reading / Read`. Live rows read "Searching the Vault"; finished rows read "Searched the Vault".
  - **Preview.** `preview` names input fields from a fixed allow-list: `query`, `queries[0]`, `title`, `section`, `sequence`, `folder`. The pseudo-field `@documentTitle` asks for the title resolved below.
  - **Engine.** `source: 'engine'` is a claim that the tool computes deterministically. It is made explicitly for each tool and reviewed.
- **`presentStep(tool, input, titles, result?)`** in `server/services/ana/step-presentation.ts` is the one function that builds a step's `source`, `label`, `preview` and `facts`.
  - **Labels.** The stream frames, the timeline and `describeToolPlan` (`agentic-loop.ts`) all call it. The server `TOOL_LABELS` and `humanizeToolName` are deleted, and so are the client `TOOL_LABELS` and `toolLabel` (`useAnaChat.ts:340-366`). A tool with no entry reads "Ran a step", never its name. For in-scope tools, the CI gate makes that fallback unreachable.
  - **Document titles.** For read tools, the stream resolves the round's document ids to titles before it announces the calls. It runs one query, scoped to the organisation and the open project the way `documentScopeRefusal` scopes the handler. An unknown or out-of-scope id gets no title. So a live row reads "Reading *Stability report 2025*" from the start.
  - **Previews.** A preview is capped at 80 characters. It is dropped when it looks like a uuid or a long hex string. Numbers are kept: "2025" and "510" are real queries, and id fields never reach the preview because they are not on the allow-list.
  - **Facts** come only from allow-listed numeric fields of the result (`resultCount`, `totalMatches`, `results.length`, `documents.length`, `pageCount`, the read window's character span) and from the Vault's document title. `summarizeToolResult` (`tool-trace.ts:68-116`) is not used: it falls back to raw JSON, returns `authoringDocId` and `programId` on purpose, and passes `note` and `error` text through. A tool with no recognised count gets no result fact.
  - **Connected systems.** `search_connected_repositories` uses source `connected` when it searched more than one system, and the single system's key when it searched one. Its facts list "Systems searched" and "Systems not searched", with the reason for each.
- **`usedModel`** comes from the step's generation capture (`stream.ts:2224-2263`): `calls > 0` means true. It is `null` when the handler ran in the governed-action route and the capture is unknown.
  - A step with `usedModel === true` shows the fact "Model: a model wrote part of this result" and never the engine glyph, whatever the register says.
  - This follows the repo's own reasoning in `generation-capture.ts`: "A list of 'model-written' tools would only be a claim about them."
- **Messages.** `stepMessage(status, heldBack, why, label)` moves out of `stream.ts:322-325, 2399-2411` into `step-presentation.ts`. It is the one place where status sentences are written; §2.6 lists them.

### 2.4 Notes

- **Which text becomes a note.** A note is the text a model call returned as AnA's words, from a call that also returned tool calls. That text is either:
  - a `text` block, or
  - a progress-update block that `ProgressNotes` accepted (`progress-updates.ts:77-118`), which happens only while the request asked for no visible reasoning.

  A thinking block under the "summarized" display is reasoning and never becomes a note, whatever its contents. The rule is tied to what `ProgressNotes` returns, not to the block type, because on Opus 5.5 notes do arrive in thinking blocks.
- **Placeholders.** The `(Ran: …)` and `(Continuing.)` staging text is never a note. It is not model output; it is written by `assistantTurnContent`.
- **Storage.** In the sealed form, a note's text is a `TextRef`. Identical text is stored once, by hash, so the note shares the blob of the round's prose in `roundInputs`. The `/summary` route resolves note references only.
- **Display.** A note is shown as "AnA's words". It reads "· not checked" while the turn's answer check is `null`: live, on a failed turn, or on a stopped turn. Notes are never counted.

### 2.5 What the Summary never contains

The guarantee covers the **Summary payload (`GET /turn-records/:id/summary`) and the Summary view**. It does not cover the platform in general. The first draft overstated it:
- `GET /turn-records/:id?texts=1` already gives the asker every text in the record (`turn-records.ts:141-155`).
- The wire already carries raw tool `input`, tool names, raw results, `toolUseId` and thinking (`stream.ts:2164-2167, 2176-2186, 2414-2427, 2845`).

Decision 7 covers the record routes. The wire is handed on (§6).

None of the following ever enter the Summary payload or view:
- the system prompt, `modelInput`, or any `roundInputs` content other than the resolved note texts;
- tool inputs except the allow-listed preview fields, tool results, `sentToModel`, tool names, tool-use ids, blob hashes, and model request ids;
- `organizationId`, `actorUserId`, user ids, table or column names, and internal routes. The route does not spread `metaOf` (`turn-records.ts:97-109`);
- reasoning, meaning summarized thinking blocks.

**Payload:** `{ id, threadId, outcome, startedAt, endedAt, schemaVersion, verdict: { ok, reason? }, recordSha256, events, controls, models }`.
- `models` lists the distinct provider and model of each round, taken from the sealed `model.calls` without `requestId`. A reviewer can see which approved model narrated the turn.
- The existing Reasoning row in `AnaActivity` (`AnaActivity.tsx:607-629`) is not touched, except as decision 3 sets.

### 2.6 How a failed, held or interrupted step reads

Every sentence comes from `stepMessage`, the same one the live transcript shows. The Summary renders it word for word and adds no copy of its own. The wording changes at the source so that it reads correctly after the fact, and the live transcript gets the same words.

| Case | Sentence (`stepMessage`) |
|---|---|
| `error` | "AnA couldn't finish {step} and continued without it." The live sentence today is "…She'll continue with what she has", which is wrong in a finished Summary. |
| `not_found` | "{Step} isn't available here, so AnA continued without it." |
| `cancelled` | "You stopped {step} before it finished." (unchanged) |
| held back, declined | "You declined {step}, so it did not run." (unchanged, `stream.ts:323`) |
| held back, no answer | "{Step} did not run: it needs a person's authorisation (nobody decided in time)." (unchanged). The waiting time is `MAX_PAUSE_MS` (`shared/ana/run-control-limits.ts:26`), and no duration is written into copy. |
| held back, only a person may take it | "{Step} did not run: it needs a person's authorisation ({why})." (unchanged) |
| authorised, then failed | `heldBack: false`, `status: 'error'`: the `error` sentence. A person said yes; the action failed. |
| `not_run` | "{Step} did not run because the turn stopped first." The run policy's `why` stays in the record only. |
| announced, never finished | Derived by the client for a sealed timeline: "Did not finish. No result was recorded." |

These rows are never folded away.

### 2.7 Turn-level cases

- **Stopped.** The closing row uses `stoppedNoteText` and its `STOP_LINES` table (`anaWorkModel.ts:41-50`), plus the existing Continue. That table gains one entry: `client_disconnected` reads "Stopped: this page lost its connection." There is one copy of the stop lines.
- **No record** (the write failed, or the record is still sealing). The rows come from `metadata.toolTrace`, labelled, with no durations claimed.
  - The footer reads "Not recorded".
  - While the record confirm waits are still running (`useAnaChat.ts:170`, 1.5 s and 4 s), it reads "Recording…", so "Not recorded" never flashes at the end of a normal turn.
- **A record from before `/4`.** It gets the same trace rows and the line "This turn was recorded before step timelines." Its footer comes from its verdict.
- **Footer from the verdict.** The footer reads "Recorded", with Download, only when `verifyStoredTurnRecord` passes on the `/summary` read. The hash is in the details, as `AnaActivity.tsx:683-700` shows it today. A record that fails or cannot be checked reads "Record could not be verified".
- **Crash.** The process dies mid-turn, so there is no record and no assistant message. S1–S6 do not change that. Saving the steps as they run is part of deferred design D1 and depends on decision 2.
- **"Marked complete" (S5).** A task AnA marked completed whose attributed steps all failed shows the fact "Marked complete by AnA · none of its {n} steps succeeded", but only when n ≥ 1. A completed task with no attributed steps shows "No steps recorded for this task". The server never completes a task (`turn-plan.ts:13-24`).

---

## 3. The client view

### 3.1 Where it opens

- **One component in two containers.** The Summary is `TurnSummary` (`client/src/concept2cure/v2/TurnSummary.tsx`). It is the body of `AnaWorkPanel` when the panel is given a `turn`, replacing `latestTurns` (`AnaWorkPanel.tsx:101-106`). The panel keeps its plan rail (the plan as it stands now) above the timeline (the history) and "Used in this session" below it.
- **One meaning per control:**
  - The header chip (`ConversationThread.tsx:1418`) keeps its one meaning: it toggles the panel on the latest turn.
  - Each turn's folded line (`AnaActivity.tsx:310-344`) gains a **Summary** button that opens the panel at that turn. While a turn runs, the button sits beside the live phase line (`:706-712`).
- **Desktop (760px and wider)** on the conversation page: the panel in its side column (`ConversationThread.tsx:1693`).
- **Below 760px, and in the narrow Shell rail:** a bottom sheet built on `useDialog` (`client/src/concept2cure/v2/useDialog.ts:50`). It is full height minus 48px, with a grab handle, a close button and the title "Summary", as in the screenshots. On a phone it **replaces** the stacked dock at 38% height (`client/src/concept2cure/v2/styles/authoring-v2.css:1735-1760`) rather than adding a third region.

### 3.2 Hosts

Five hosts render real AnA turns through `activityPropsFor` (`AnaActivity.tsx:116-141`), and all five get the Summary through it:
- ConversationThread;
- the Shell rail (`V2App.tsx:258` → `Shell.tsx:1058`), as a sheet;
- DocumentWorkbench (`editor/DocumentWorkbench.tsx:4604, 4671`);
- EctdCoauthor (`surfaces/EctdCoauthor.tsx:816, 850`);
- Rbm (`surfaces/RbmSurfaces.tsx:322, 400`). Rbm is outside the launch catalog. It gets the button through the shared mapping, and no acceptance is filed for it.

Four hosts have **no Summary**, because they mount `AnaActivity` only as a spinner for work that is not a recorded loop turn, so there is no record to show:
- SubmissionSeqWorkspaces (`:922`, `:1118`);
- AnaCommand (`:872`);
- AuthoringAiDraft (`:563`);
- OnboardingIngest (`:222`).

### 3.3 Rows

**One row builder.** `turnSummaryRows.ts` holds `orderedItems`, moved from `AnaActivity.tsx:359-380`, with `mode: 'record' | 'summary'`. It takes timeline events, or `metadata.toolTrace` for turns without them (§2.7). The inline per-turn record keeps its short form: no notes, and no Started or Completed rows. The Summary shows every kind. There is one ordering function and one `Row` component (`AnaActivity.tsx:197-263`, exported).

**Layout:**
- A 24px glyph column joined by a 1px connector line.
- Line one is a short verb plus the visible source name: "Searched the Vault", "Read *Stability report 2025*", "Validated the eCTD package". Line two is the preview, muted: "shelf life". At 390px the useful part is never the part that gets cut off.
- A chevron appears on step and task rows. A note has a 6px grey dot, regular weight and a two-line clamp, and expands on tap.
- **Glyphs** are neutral monochrome line glyphs, one per source key (`anaSourceGlyphs.tsx`), and the source name is always visible text. No third-party logos.
- **Status** is always in words. A badge on the glyph is extra, so colour is never the only signal.

**Header:** one deterministic line computed by `shared/ana/turn-timeline.ts`, for example "18 steps · 4 sources · 1 did not complete · 6m 12s".
- Sources exclude `plan`, `engine` and `screen`.
- Durations come from the server's `at` values.

**Details** open in place:
- **Step:** the facts ("Searched for: shelf life", "Found: 12 documents", "Took: 2.4 s"), the status sentence, and "Model: a model wrote part of this result" when `usedModel` is true.
- **Task:** the list as it stood at that moment and, from S5, the steps attributed to the task.
- **Turn header:** the models that narrated the turn.

**Closing row:** the end event. For a stopped turn this is the stop line with Continue (§2.7).

### 3.4 Live

`useAnaChat` handles the `timeline` frame in its existing handler chain (`useAnaChat.ts:1235-1812`) and keeps the events on the message.
- The sheet follows the newest row only while the reader is already at the bottom.
- A last row, "Working…", shows a running clock.
- **Lost connection.** When the socket drops (a locked phone), the closing row reads "Stopped: this page lost its connection." with Continue. The record, found by run id through the existing confirm waits, then replaces the client's own reading.

### 3.5 After reload

1. The messages route returns each message's `id` (`chat-thread-helpers.ts:257-265` selects it), and the client keeps it as `serverId` in place of the synthetic `t-${threadId}-${idx}` (`useAnaChat.ts:855`).
2. `loadThread` makes one call, `GET /api/ana-ri/turn-records?thread_id=`. The list now selects `assistant_message_id` (`turn-record-verify.ts:254`). Each record is attached to its message by that id, which also restores the "Recorded" row that reload loses today.
3. Opening a Summary fetches `GET /turn-records/:id/summary`.
4. **A colleague** who opens the thread, which org-wide transcript reads allow, sees the line "This turn's record is visible to the person who asked and to administrators." That is a 403 shown as a statement, never as an empty Summary.

### 3.6 Accessibility and motion

- The sheet is `role="dialog"` with `aria-modal` through `useDialog`, which provides the focus trap and Escape handling and returns focus to the button.
- The rows are an `<ol>`. Each chevron is a button with `aria-expanded` and `aria-controls`. Touch targets are at least 44px.
- Opening takes 200ms ease-out. Nothing animates under `prefers-reduced-motion`.

---

## 4. The work: tools AnA needs, in this product's domain

**Already there, unchanged:**
- **Vault:** `list_project_documents`, `search_project_documents`, `catalog_project_document`, `search_document_passages`. (`read_project_document` is fixed in S1.)
- **Data room:** `project_knowledge_search_multi`, `read_uploaded_document`, `ocr_document_pages`.
- **Authoring:** `read_authoring_section`, `search_authoring_sections`.
- **Governed documents and submissions:** `list_governed_documents`, `read_governed_document`, `validate_ectd_package`.
- **References:** the agency lookups and `search_literature`. **Results:** `generate_report`.
- **Mailbox:** `search_regulatory_correspondence`, for the owner organisation only (P-8).

**Fixed:**
- **`read_project_document` (S1).** A read is delivered whole or not at all, and its receipt covers exactly what was delivered (§5, S1).
- **`search_connected_repositories` (S2):**
  - The schema's `connectors` is a **static** enum: `google_drive, box, onedrive, sharepoint, veeva_vault`. It is the same for every tenant, so the tool schema and prompt caching stay stable. `google-drive` is normalised to `google_drive`.
  - With `connectors` omitted, the tool searches **repository connectors only**. Public sources are refused with "use search_literature or the agency lookups", so a client's query never leaves through this tool.
  - The Drive query escapes `\` before `'`.
  - Drive search sets `supportsAllDrives`, `includeItemsFromAllDrives` and `corpora=allDrives`, so regulatory files in shared drives are found.

**Changed:**
- **`update_plan` (S4, S5).** The model's contract and guidance are unchanged; the guidance already exists (`turn-plan.ts:55-60`). The server assigns task ids:
  - A task gets `t1…` the first time its lower-cased title appears in the turn.
  - Two steps of one plan cannot share a title; the handler already refuses that (`turn-plan.ts:111-113`).
  - A title that disappears and later returns gets a new id, so it reads as Removed and then Added. A renamed task likewise reads as Removed plus Added.

**New, S6 only, founder exception (decision 5).** Each tool gets a register class and a `present` entry, an `inScope` inventory entry, and takes the tenant from server context, never from input.
- **`list_connected_folder` [read].** Lists a folder, or runs a title query, on one connected system.
  - It is built on a new `DataConnector.list()`. Drive comes first: `files.list` with `'<id>' in parents` or `name contains`, plus the shared-drive parameters.
  - Box, OneDrive, SharePoint and Veeva Vault answer `unsupported` honestly (the P-7 pattern) until each is built.
  - It returns per-turn handles (`f1…`) and never raw Drive ids to the client. The server keeps each handle's Drive file id, `md5Checksum` and `modifiedTime`.
  - It is limited to the folders an admin allow-lists for the connector (decision 5).
- **`import_connected_documents` [confirm, reason required, at most 10 handles, one approval].**
  - **Inputs.** It takes handles that `list_connected_folder` or `search_connected_repositories` produced **in this turn**; S6 adds handles to search results. When the approval is created, the stream resolves the handles into the governed action's parameters, so the approver sees file names and the executed parameters are the server's, never the model's.
  - **Download.** A new `DataConnector.download(id) → { bytes, mimeType, md5Checksum, modifiedTime }` throws on any non-2xx response. The existing `fetch()` returns the string `[Binary file — download via …]` for any non-Workspace file, and `''` on a failed export (`google-drive.ts:184-199`), so building on it would file a placeholder or an empty file as a governed document.
  - **Into the Vault.** Each file is captured into the data room through the evidence spine (`evidence-spine.service.ts:246`). The capture records the checksum, `official_url`, and `provenance: { connector: 'google_drive', fileId, md5Checksum, modifiedTime }`. The file is then filed by `vault-data-room-filing.ts` through `fileUploadIntoVault` with `capturedChecksum` and `dataRoomSourceId`, so the origin is in the chain (VR-16b), and ClamAV (P-4), OCR at ingest, hashing and version families (VR-09) all apply.
  - **Per-file results.** Each file has its own transaction and its own answer: `filed`, `already_filed` or `refused`, with `complete: false` whenever any file was refused. A file whose `md5Checksum` changed since it was listed is refused.
  - **Size.** Each file must fit the Vault upload cap (`VAULT_UPLOAD_MAX_BYTES`, `routes/vault-ingest.ts:55`).
  - **Retries and timeouts.** A retry is idempotent on the bytes: `already_filed` by checksum, and an existing capture with the same checksum is reused. The approved action runs inside the approver's request (`routes/ana-ri/utility.ts:720`; P-10, no worker), so a timeout part-way leaves the finished files filed and recorded, and never reads as "nothing filed".
  - **After import,** reading is `read_project_document` with receipts, and the catalog's check applies.
- **Rejected: reading connector files where they live.** Such a read has no hash and no receipt, so the catalog check cannot apply. Binary files would also need a second text-extraction path beside ingest.
- **Read-only by code; the scope is unchanged.** The service account keeps the `drive` scope the Workspace admin authorised (`google-drive.ts:61`). Under domain-wide delegation, asking for `drive.readonly` where only `drive` was granted fails with `unauthorized_client`. The new methods issue GET requests only, and a test intercepts every request to prove it. Narrowing the scope is a setup change for later.

**Dropped from the first draft:**
- the OCR line in `describe_capabilities`, which imitated the screenshot rather than doing client work (OCR runs at ingest);
- the "Ran 4 steps together" grouping. It is not in the screenshots, and the loop runs 4 at a time with approvals settled one at a time first (`stream.ts:2189-2203`), so "together" would overstate;
- the parallel-read guidance;
- S5b, sub-agents, which stay with ANA-AGENTS.

---

## 5. Slices

The slices are ordered by client value: the defects under the work first, then the view, then the new capability. Each slice runs red first and files `docs/evidence/ANA-SUMMARY/<date>/S<n>-<name>/`.

### S1: reads deliver what they record

**Directory set:** `server/services/ana/`, `server/routes/ana-ri/stream.ts`.

**Files:**
- **`server/services/ana/agentic-loop.ts`:**
  - `RESULT_BUDGET = 5000` moves here, beside `capToolResultForModel`. `authoring-read-tools.ts` imports it rather than keeping its own copy.
  - `budgetToolResultsForModel` gains one rule: a result that carries a deferred read receipt is **never head/tail cut**. It is either delivered whole or replaced by `{"delivered":false,"reason":"This round returned more than can be read at once.","readAgainFrom":<offset>}`.
- **`server/services/ana/document-catalog-tools.ts`:**
  - `readWindowBounds` and the handler size the window so that the serialized result is at most `RESULT_BUDGET`, shrinking the window rather than letting the cap cut it.
  - The handler no longer writes the receipt at `:321`. It registers a deferred receipt (document, content hash, span) on its context, keyed by tool-use id.
  - Its coverage message is computed as "after this window", which is true if and only if the result is delivered.
- **New `server/services/ana/read-receipts.ts`:** `settleReadReceipts(original, budgeted, deferred)` writes a receipt only for a result the model received unchanged.
- **Both loop hosts call it after budgeting:** `stream.ts:2661` and `AnaToolExecutor.ts:16068`.

**Tests that must fail first:**
1. A 60,000-character document, read with default arguments, gives a serialized result of at most 5,000 characters, and a receipt span equal to the text window in that result. **Red today:** the span is 0–30,000, while the model receives at most 8,000 characters.
2. A round of six reads of about 5,000 characters each (30,000 in total, over the 24,000 round budget): no read is head/tail cut, and each read beyond the budget comes back as "read again from offset N" with no receipt. **Red today:** each is squeezed to 4,000 characters with a receipt for the whole window.
3. `catalog_project_document` refuses after reads whose text never reached the model whole. **Red today:** it accepts after one 30,000-character read.
4. A sentence planted at characters 6,000–7,000 of a 40,000-character document is inside what the model received whenever a receipt covers that span. **Red today:** it falls in the cut middle (the 8,000 cap keeps a head of 5,600 and a tail of 2,340).

**Accepted when** (browser, desktop):
- Upload a 40-page stability report with a distinctive section heading planted in its middle.
- Ask: "Read this report in full, catalog it, and list every section heading."
- The turn shows several read steps, each continuing where the last left off, before the catalog step succeeds, and the planted heading is in the answer.
- **Before the fix,** captured for the evidence: one read, the catalog step succeeds, and the heading is missing.

### S2: connector search: the Drive id, repository-only by default, escaping, shared drives

**Directory set:** `server/services/ana/`, `server/services/integrations/`, `server/services/connectors/`.

**Files:**
- `evidence-literature-tool-defs.ts:100-128`: the static enum and a corrected description.
- `server/services/integrations/connector-search.ts`: id normalisation, and the repository-only default and refusal.
- `server/services/connectors/google-drive.ts`: escaping, and the shared-drive parameters on search.

**Tests that must fail first:**
1. A search with `['google-drive']` reaches Drive. **Red today:** "unknown connector".
2. With `connectors` omitted and PubMed configured (it needs no credential), PubMed is not called. **Red today:** it is.
3. The query `O'Brien \ x` builds `fullText contains 'O\'Brien \\ x'`. **Red today:** the backslash is not escaped.
4. The Drive search request carries `supportsAllDrives`, `includeItemsFromAllDrives` and `corpora=allDrives`. **Red today:** it carries none of them.
5. The tool schema is byte-identical for two tenants with different connectors configured.

**Accepted when** (browser; needs a Drive service account on a test Workspace, otherwise the slice reports **blocked** on this item):
- With Drive connected, "Search our Drive for the 2025 stability protocol" finds a file that lives in a **shared drive**.
- An organisation without Drive is told "Google Drive is not connected for your organisation."
- No request to a public source appears in the server log for either turn.

### S3: one step-presentation table, both tenses, redacted details

**Directory set:** `server/services/ana/`, `shared/ana/`, `server/routes/ana-ri/stream.ts`, `client/src/concept2cure/`, `scripts/ci/`.

**Files:**
- **Register:** `tool-authorization.register.json` gets a `present` block for every one of the 608 in-scope tools. The type goes in `tool-authorization.ts`.
- **New shared and server modules:**
  - `shared/ana/step-verbs.ts`: the closed verb table.
  - `server/services/ana/step-presentation.ts`: `presentStep` and `stepMessage`.
- **Server changes:**
  - `agentic-loop.ts`: `describeToolPlan` goes through `presentStep`; `TOOL_LABELS` and `humanizeToolName` are deleted.
  - `stream.ts`: `tool_use` and `tool_result` carry `source`, `preview`, `facts` and `usedModel`; the round's document titles are resolved before announcing; `stepMessage` replaces the inline sentences; server-tool steps (`:515`) get source `web`.
- **Client changes:**
  - `useAnaChat.ts`: `TOOL_LABELS` and `toolLabel` are deleted, and the frames' labels are used.
  - `AnaActivity.tsx`: details become facts plus the status sentence. No `JSON.stringify(input)`, no result.
- **Gate:** new `scripts/ci/check-step-presentation.mjs`, with a `ci:step-presentation` script and a selftest, run beside `ci:internals-in-copy`.

**Tests that must fail first:**
1. **Redaction.** A step with input `{document_id:'<uuid>'}` and result `{authoringDocId:'<uuid>'}` shows no uuid anywhere in its opened details. **Red today:** `AnaActivity.tsx:279-281`.
2. **Coverage gate.** Every in-scope tool has a `present` entry with a verb from the closed table and a known source. The selftest shows it red by deleting one entry, and red again by giving `source: 'engine'` to a tool whose test double calls a model.
3. **No tool names.** A tool named `sentinel_tool_xyz` with no entry renders "Ran a step" on the live frame, on the reloaded trace and in the details. **Red today:** "Sentinel tool xyz".
4. **Tense.** A finished step's label uses the done form ("Searched the Vault"), and a live one uses the doing form. **Red today:** every label stays present-progressive.
5. **Title.** The announced label for `read_project_document` names the document. A document id outside the open project yields no title. **Red today:** "Reading the document in full".
6. **Model marker.** A step whose handler made a gateway generation carries `usedModel: true` and no engine glyph.

**Accepted when** (browser, desktop and 390×844), in the inline turn record:
- "Searched the Vault" with "shelf life" beneath it.
- A running read names its document.
- Finished rows read in the past tense.
- A validator row reads "Validated the eCTD package", not "Validate ectd package".
- A chevron opens facts with no JSON and no id.
- A model-backed step shows "Model: a model wrote part of this result".

### S4: the Summary: live notes and timeline, sealed `/4`, reload by message id, panel and sheet

**Directory set:** `server/services/ana/`, `server/routes/ana-ri/`, `server/services/chat-thread-helpers.ts`, `shared/ana/`, `client/src/concept2cure/`.

**Files:**
- **Shared:**
  - `shared/ana/turn-timeline.ts`: the types, `orderTimeline`, and the header line.
  - `shared/ana/plan-diff.ts`: `diffPlan` moved from `anaProgress.ts:241-262`; the client copy is deleted.
- **Server:**
  - `turn-record.ts`: `/4`, `addEvent`, the new `RecordedStep` fields, `stoppedReason`, and notes as `TextRef`.
  - `stream.ts`:
    - `emitTimeline`;
    - a `note` event before a round's steps;
    - `announced`, `awaiting_approval` and `finished` step events, with `startedAt` at handler dispatch;
    - `task` events with ids from each successful `update_plan`;
    - the `end` event.
  - The loop's run policy also gets a closing reason for `client_disconnected` where it does not already carry one.
  - `server/routes/ana-ri/turn-records.ts`: `GET /:id/summary` behind `recordFor`, re-verified, with no `metaOf`.
  - `turn-record-verify.ts`: the list selects `assistant_message_id`.
  - `chat-thread-helpers.ts`: `getThreadMessages` selects `id`.
- **Client:**
  - New: `TurnSummary.tsx`, `turnSummaryRows.ts` (`orderedItems` moved here, with modes; trace rows for turns without events), `anaSourceGlyphs.tsx`.
  - `AnaWorkPanel.tsx`: the `turn` prop.
  - `AnaActivity.tsx`: the Summary button.
  - The hosts in §3.2 pass the selected turn.
  - `useAnaChat.ts`: the `timeline` frame handler, `serverId`, the record join on reload, and the "Recording…" state.
  - `anaWorkModel.ts`: the `client_disconnected` stop line.
  - `authoring-v2.css`: the sheet replaces the stacked dock below 760px.

**Tests that must fail first:**
1. **Same data live and sealed.** One turn with a stand-in model produces `timeline` frames equal to the sealed `record.timeline`, with note references resolved. The rows built from each are identical. **Red today:** no such frames or field exist.
2. **Notes:**
   - A round with prose followed by tool calls yields exactly one note before its steps; a round with no prose yields none.
   - No note contains `(Ran:`.
   - A sentinel in a summarized thinking block appears in no note.
   - A progress-update note accepted by `ProgressNotes` does appear.
3. **Leak.** With sentinels in the system prompt, `modelInput`, a non-note round input, a step input, a result, `sentToModel`, a tool name, a tool-use id, a model `requestId`, `organizationId`, `actorUserId` and a summarized thinking block, none appears in the `/summary` payload. The gate is shown failing first by running it against a route that spreads `metaOf`, as the first draft did.
4. **Reload join.** A reloaded assistant message whose turn has a record carries `turnRecord`, joined by message id. **Red today:** `chat-thread-helpers.ts:257-265` selects no id, and `useAnaChat.ts:855` synthesises ids.
5. **Access** (pglite route test): on `/summary` the asker, an admin and a colleague in the same organisation get 200, and another organisation gets 404. On the full record (`?texts=1`, `/export`) a colleague gets 403 (decision 6, as taken).
6. **Footer states:** a passing verdict reads "Recorded"; a failing verdict reads "Record could not be verified"; no record reads "Not recorded"; while the confirm waits run, it reads "Recording…".
7. **Held and failed rows.** "Declined", "no answer" and "authorised, then failed" each render the `stepMessage` sentence word for word, from `heldBack` and `message`. **Red today:** `heldBack` is not recorded (`turn-record.ts:408-420`).
8. **Stopped after cancel.** A turn cancelled mid-round seals its cancelled step events.

**Accepted when** (browser at 390×844 and at 1280 or wider):
- **The main request.** Use a Balanced turn, with thinking off because the message is under 240 characters: "Find every stability report in this project, read them, and list the shelf-life claims". The corpus is three reports of at most 15,000 characters each, so the work fits 6 + 2 rounds.
  - On desktop, the turn's Summary button opens the side panel at that turn. On the phone it opens the sheet.
  - The rows show:
    - notes marked "AnA's words · not checked", until the check lands;
    - "Searched the Vault" with "shelf life";
    - a read row naming each report;
    - Added, Started and Completed task rows.
  - Chevrons open facts.
- **After a reload,** the rows are identical, and the footer reads "Recorded" with Download, with the hash in the details.
- **A Thorough turn** (thinking on) shows notes if decision 3 picks option A. If it picks option B, it shows no notes and its reasoning in the Reasoning row, and that is filed as the expected result.
- **Phone locked.** Lock the phone for 30 seconds mid-turn. On unlock, the turn has stopped, and the closing row reads "Stopped: this page lost its connection." with Continue.
- **Round limit.** A request larger than the budget ends with "Stopped at the round limit" and Continue in the Summary.
- **A colleague** in the same organisation who opens the thread sees the same Summary; its Download of the full record says "The full record is available to the person who asked and to administrators."

### S5: task attribution

**Directory set:** `server/routes/ana-ri/stream.ts`, `server/services/ana/`, `client/src/concept2cure/v2/`.

**Files:**
- `stream.ts`: a step gets `task` when, at dispatch, exactly one task is `in_progress` and the step is not `update_plan`.
- `turn-record.ts`: `taskId` on `RecordedStep`.
- The task detail in `TurnSummary.tsx`: the list as it stood at that moment, and its steps.
- The "marked complete" and "no steps recorded" facts in `turnSummaryRows.ts`.

**Tests that must fail first:**
1. A step gets the id of the single in-progress task, and `null` when two tasks are in progress. An `update_plan` step always gets `null`.
2. A task completed while all of its two attributed steps failed carries the "none of its 2 steps succeeded" fact. A completed task with no steps carries "No steps recorded for this task" and not the failure fact.
3. Task ids are stable across five `update_plan` calls. A title removed and re-added gets a new id.

**Accepted when** (browser):
- A four-part request shows four "Added task" rows, then Started and Completed rows in order.
- Opening a task lists its steps.
- A task AnA completed despite failed steps shows the fact.

### S6: Drive folder listing and governed import (founder exception; waits on decisions 5 and 6)

**Directory set:** `server/services/connectors/`, `server/services/integrations/`, `server/services/ana/`, `server/services/vault/` (callers only), `client/src/concept2cure/v2/` (the connector settings allow-list field).

**Files:**
- `connector-interface.ts`: `list()` and `download()`.
- `google-drive.ts`: `list`, `download` and the shared-drive parameters.
- `connector-registry.ts`: a scoped getter for the two new tools only. `getAuthenticatedConnector` stays private (`:176`).
- New `server/services/ana/connector-tool-defs.ts` with its handlers. They use the per-turn handle map and capture through the evidence spine, then file through `vault-data-room-filing.ts`.
- Handles on `search_connected_repositories` results.
- The connector settings: an admin's folder allow-list, stored with the organisation's connector credential.
- The register, inventory and `present` entries for both tools.

**Tests that must fail first:**
1. A PDF in Drive is filed byte for byte: the Vault version's SHA-256 equals the Drive file's bytes. **Red today:** `fetch()` returns a placeholder string.
2. An import of three files, one of them changed since it was listed: two are filed and one is refused, with one approval, the reason recorded, and one audit row per file.
3. A retry after a partial import files nothing twice; the earlier files read `already_filed`.
4. A handle not produced in this turn, a raw Drive id, and a folder outside the admin allow-list are each refused.
5. Every request the new methods issue is a GET.
6. Two-tenant contract, run as `app_service` with RLS on: tenant B's credential and handles are never used for tenant A.
7. The register and inventory tests fail for an unclassified new tool.

**Accepted when** (browser; needs a test Workspace, otherwise **blocked**):
- With Drive connected and a folder allow-listed, ask: "Find the 2025 CMC correspondence in our Drive, bring the PDFs into the Vault and summarise the commitments". The Summary shows:
  - a Drive search row (the Drive glyph and name, with the preview);
  - a folder-listing row;
  - one approval with its reason;
  - a filing row per file;
  - a Vault read row per imported file.
- The Vault shows each document with its data-room capture provenance.
- A second organisation is told "Google Drive is not connected for your organisation."

### Deferred, each behind a decision

**D1. A durable live timeline and rejoin.** Built only together with detach (decision 2), because without detach a second device can follow a turn only while the first stays connected. When it is built:
- **Table.** An append-only `public.ana_run_events (organization_id INTEGER NOT NULL, run_id, seq, at, event jsonb, PRIMARY KEY (run_id, seq))`. It is not a jsonb column on `ana_runs`, which would rewrite a TOASTed array about 60 times a turn and leave a permanent second copy.
  - It has an insert-only trigger.
  - It is listed in `PURGE_CHILD_TABLES`.
  - It is covered by the tenant sweep (public + integer), and the migration is inserted before the final sweep pair (Rule 1).
- **Writes.** Rows are written only by the owner instance while no record exists for the run, guarded on that condition and not on a live status, so post-cancel rows are kept. A run holds at most 1,999 events plus a closing "timeline truncated" marker.
- **Reads.** The polling routes follow `applyControl`'s rule (`run-control.ts:448-468`): the organisation is in the SQL, another organisation gets 404, and a run with `user_id IS NULL` is refused to non-admins. They are polled with `after=seq`.
- **Sealing.** The record still takes steps from the recorder and controls from the run row. Rows are deleted once a record with that `run_id` exists.
- **Crash.** The crash row then reads: "AnA stopped here: the server restarted. The steps up to here were saved as they ran; this turn has no sealed record."

**D2. Agent rows.** ADR-0015 S6, in the ANA-AGENTS lane, adds a `parent` handle to step events and an agent event when it hosts `run_agent`. Production stays off until S7 (ADR-0015 §2).

---

## 6. Decisions, risks and out of scope

### Founder decisions

1. **Record ANA-SUMMARY as a Rule 2 exception lane** that moves no D-row, the way ANA-AGENTS is recorded. *Recommendation:* yes for S1–S5. S6 is decided separately (decision 5).
2. **Detach: should a turn keep running when the page closes or the phone locks?** This is the largest gap against the screenshots, whose use case is a long task followed on a phone. Today a closed socket stops the run (`stream.ts:719-737`).
   - **Options:**
     - (a) Keep stop-on-disconnect through launch, with the honest closing row and Continue.
     - (b) Detach inside the API process (P-10, no worker): the run continues under the existing heartbeat and reaper, Manual holds and approval timeouts still apply, D1 is built with it, and any device can rejoin. A deploy or restart still ends a detached run, as orphaned.
   - *Recommendation:* (b), as its own design after S4. It does not block S1–S5.
3. **Where notes come from on thinking turns.** With thinking on, Opus 5.5's notes land in the reasoning summary, and the timeline gets none.
   - **Options:**
     - (A) Rounds that offer tools ask for no visible reasoning, so notes come back as AnA's words. This is the rule demonstrations already use (`stream.ts:1740`). The closing round keeps the reasoning summary. The Reasoning row then shows only the closing round's reasoning, and the model still reasons on tool rounds, hidden.
     - (B) Keep the reasoning summary on every round and have no notes on thinking turns.
   - *Recommendation:* A.
4. **Notes inside the answer.** Round prose is stored as part of the answer (`stream.ts:2853-2866`), so notes appear in both the transcript and the Summary.
   - **Options:**
     - (a) Accept the repetition. The stored, checked text is unchanged, and Claude's own transcript also carries its notes.
     - (b) Show only the closing round as the answer body, with earlier prose folded, which needs round boundaries persisted.
   - *Recommendation:* (a) now; revisit once notes exist.
5. **S6's two new tools, and the Drive identity.** `list_connected_folder` and `import_connected_documents` are new capability with no D-row criterion. The Drive connector is one service account impersonating one configured user (`google-drive.ts:39-70`), so every person searches and imports as that user, and an import could file documents the asker could not open in Drive.
   - *Recommendation:* approve S6 only with admin allow-listed folders, applied to search as well as to listing and import. Per-user OAuth comes after launch.
6. **Who sees a turn's Summary.**
   - Today: the asker, plus admins and owners.
   - "Clients can see" might mean a sponsor seeing work its consultant or CRO did with AnA. That is a cross-organisation sharing model, not a view.
   - Separately, transcripts are readable by the whole organisation while records are not (`threads.ts:188-210`).
   - *Recommendation:* keep the record rule. Align transcript reads with the owner/admin rule as a D3 finding, filed by the session that takes it. A cross-organisation view comes after launch.
7. **The asker's full record.** `GET /turn-records/:id?texts=1` and `/export` give the asker the system prompt, inputs, results and `sentToModel` (`turn-records.ts:141-155`).
   - *Recommendation:* keep it, recorded as deliberate. It is the person's own Part 11 record, and an inspector needs the texts to verify it offline. The Summary's guarantee is stated for the Summary only (§2.5).
8. **Gates restated, unchanged:** P-8 (tenant mailbox after launch) and ADR-0015 §2 (sub-agents off in production until S7). *Recommendation:* keep both.

### Decisions taken, 2026-10-08 (product owner, under the founder's delegation)

The founder delegated these the same day ("you can make these decisions without me"), and asked for this work
directly. Recorded as P-24 in `docs/LAUNCH_DEFINITION_OF_DONE.md`.

1. **The lane is recorded.** `ANA-SUMMARY` is a founder-directed exception to Rule 2 that moves no D-row, run as
   the founder's own ask. S1–S5 proceed in that order; S6 follows S5.
2. **Detach: (b).** A turn keeps running when the page closes or the phone locks, inside the API process, with D1
   built alongside it. It gets its own design after S4. Until then S4's honest closing row and Continue stand.
3. **Notes on thinking turns: A.** Tool rounds ask for no visible reasoning; the closing round keeps the reasoning
   summary.
4. **Notes inside the answer: (a).** The repetition is accepted for now and revisited once notes exist.
5. **S6 is approved, with admin allow-listed folders** applied to search, listing and import alike, after S5.
   Per-user OAuth comes after launch.
6. **Who sees a Summary: anyone who may read the thread's transcript.** This departs from the recommendation. The
   Summary is redacted by construction (§2.5) and S4's leak test proves it. The transcript, which already shows the
   answer and its inline steps, is readable by the whole organisation. Withholding the redacted view of the same turn
   would hide the work from the colleagues the founder means by "clients can see". The **full record** (`?texts=1`,
   `/export`, with the system prompt, raw inputs and results) keeps the stricter rule: the asker plus admins and
   owners. S4's access test changes accordingly. The asker gets 200 on the Summary and on the record. A colleague in
   the same organisation gets 200 on the Summary and 403 on the record. Another organisation gets 404 on both.
   Organisation-wide transcript reads stay as they are: they are within the tenant and are how the project home lists a
   program's conversations. A per-thread privacy setting is a later feature, not a D3 finding.
7. **The asker's full record: kept**, as a deliberate choice.
8. **P-8 and ADR-0015 §2: kept.**

### Product owner, under the delegation (record in the DoD)

- Neutral glyphs with visible source names; no third-party logos.
- The server's status sentences are reworded at the source so that they read correctly after the fact (§2.6). The live transcript gets the same words.
- `RESULT_BUDGET = 5000` is the one read window for every windowed read.
- Round budgets are unchanged. A plan with open items does not earn extra rounds, because the model would then control its own budget by leaving steps pending. Extension stays server-judged (`progressExtension`).

### Risks

- **608 register entries in one change.** Reviewing them is the cost. It is bounded by the closed verb table, the source list and the gate's selftest. Tests and evidence that assert the old label strings will need updating in the same change.
- **Labels change everywhere at once.** The live transcript, `toolTrace`, `humanMessage` and the inspection export of new records all take the new labels. Older records keep the labels they were shown.
- **Raw fields on the wire.** `tool_use` input, raw `tool_result` and thinking frames still reach the browser for the client's own parsers (`stream.ts:2176-2186, 2414-2427, 2845`; `useAnaChat.ts:1572-1655`). This is unchanged here and handed on as its own item.
- **The connector search narrows** (S2). With `connectors` omitted it no longer reaches public sources, so AnA uses `search_literature` and the agency lookups for those, and the tool description says so. It closes a path around the tenant's `publicSourceEgress`; the D6 periodic review should cross-reference it.
- **Drive scope.** The service account keeps the full `drive` scope (`google-drive.ts:61`). Read-only is enforced in code and proven by test.
- **Clock skew.** Controls accepted on another instance are ordered by their own `at` and can sit one row off.
- **No crash durability before D1.** A process death mid-turn still leaves no record and no Summary.

### Out of scope

- shell or terminal steps, and code execution;
- Drive folder creation and any other write to an external system;
- the tenant mailbox, calendar and CRM (P-8);
- Outlook, Teams and Slack;
- AnA as an MCP client;
- sub-agents (ANA-AGENTS lane);
- "together" grouping;
- detach (decision 2) and D1;
- a background worker (P-10);
- cross-organisation views;
- colleagues seeing each other's records;
- deep investigation (a hidden app);
- every engine Rule 2 excludes.

---

## 7. Critique response

Each point was checked against the code at `0e50993c5`. **A** means accepted, **P** partly accepted, **R** rejected.

### Governance critique

| # | Point | Verdict | How it was handled |
|---|---|---|---|
| 1 | "Never receives" is false: `?texts=1`, raw frames and thinking already reach the asker | A | The guarantee is narrowed to the Summary payload and view (§2.5). The record routes are decision 7. The wire is handed on (§6, risks). |
| 2 | `resultSummary` leaks ids, raw JSON and model text | A | `presentStep` never calls `summarizeToolResult`. Facts come from allow-listed counts only (§2.3). S3 test 1 covers results as well as inputs. |
| 3 | Labels fall back to tool names on the server and the client | A | "Ran a step" fallback, the S3 gate over every in-scope tool, and both `TOOL_LABELS` tables deleted (S3). |
| 4 | `/summary` must not spread `metaOf` | A | §2.5. S4 test 3 is shown failing against a route that spreads it. |
| 5 | Notes on Opus 5.5 come from thinking blocks; the rule needs precision | A | The note rule is tied to what `ProgressNotes` returns, and summarized reasoning never becomes a note (§2.4). S4 test 2. |
| 6 | A live-status guard drops the post-cancel rows | A | No database guard in S1–S6: the recorder is in memory and accepts events until it seals (§2.2). D1 guards on owner plus unsealed, not on status. S4 test 8. |
| 7 | `declined` cannot be read from records already written | A | `/4` records `heldBack` and `message`. Older records get trace rows only, with no projection that guesses (§2.7). |
| 8 | A second copy of the status sentences; 10 minutes hard-coded; the authorised-then-failed case missing | A | One `stepMessage`, rendered word for word. No duration in copy. Authorised-then-failed added (§2.6). |
| 9 | The first draft contradicted itself on a failed timeline write | A | Sealed from the recorder's memory only; there is no second store to differ from (§2.1). |
| 10 | The footer must come from the verdict | A | "Recorded" only on a passing verdict; otherwise "Record could not be verified" (§2.7, S4 test 6). |
| 11 | A turn with no record has no defined Summary | A | Trace rows with "Not recorded", and "Recording…" while the confirm waits run (§2.7). |
| 12 | The sealed timeline should not come from `ana_runs` | A | Steps from the recorder, controls from the row, merged when rows are built (§2.1). |
| 13 | A 2,000-event cap conflicts with the truncation marker | A | Moved to D1: 1,999 events plus the marker. |
| 14 | `BEFORE UPDATE OF`; jsonb rewrite cost; consider a table | A | The column is dropped. D1 specifies the append-only `ana_run_events` table. |
| 15 | `step_events` would be a second permanent store; the `ana_runs` header rule | A | No column. D1 deletes rows once the record exists. A new table is not subject to the `ana_runs` header rule, and follows Rule 1's new-table corollary instead. |
| 16 | Notes are stored three times | A | A sealed note is a `TextRef` sharing the round's blob (§2.4). |
| 17 | Defaulting an unknown tool to `engine` is a guess | A | `engine` is set explicitly per tool in the register, an unclassified tool fails CI, and `usedModel` is taken from the runtime generation capture, which overrides the engine glyph (§2.3). |
| 18 | "Ran 4 steps together" overstates; `startedAt` must be dispatch | A | Grouping is dropped (§4). `startedAt` is handler dispatch, and `ms` excludes approval waits (§2.1). |
| 19 | Live notes are shown before the answer is checked | A | "AnA's words · not checked" until the check exists; never counted (§2.4). |
| 20 | Leave `update_plan` out of attribution; zero steps needs a neutral fact | A | S5 rules and tests 1–2; §2.7. |
| 21 | Import cannot import a PDF; `fetch` returns a placeholder | A | A new `download()` that throws on non-2xx; S6 test 1 (§4). |
| 22 | There is no "one path" for connector bytes; the changed-since token must be server-kept | A | Capture through the evidence spine with provenance, then filing through `vault-data-room-filing.ts` with `capturedChecksum` and `dataRoomSourceId`. Handles are kept on the server (§4). |
| 23 | A 20-file import runs inside the approver's request | A | At most 10 files, the Vault size cap, a transaction and a durable answer per file, and idempotency on the bytes (§4). |
| 24 | Connector search sends client queries to public APIs; use a static enum; the id is `veeva_vault` | A | S2: repository-only default, static enum, `veeva_vault`. |
| 25 | One search row can span several sources | A | `SourceKey` `connected`, with per-system facts (§2.3). |
| 26 | `drive.readonly` may break connected organisations | A | The authorised `drive` scope is kept. Read-only is enforced in code and tested (§4; S6 test 5). |
| 27 | New run routes must match `applyControl` | A | Carried into D1. No run routes in S1–S6. |
| 28 | Two label tables already exist; put source in the register | A | The `present` block in the register. Both `TOOL_LABELS` tables are deleted in S3. |
| 29 | The `update_plan` guidance already exists | A | Dropped (§4). |
| 30 | S4's tools are new capability, not D2; name the workstreams | A | S6 is in decision 5. §0 names the lane, its directory set and why no W applies. Each slice lists its directory set. |
| 31 | "All seven hosts" is wrong; spinner hosts have no record; Rbm is not in the catalog | P | Accepted, but its own count missed the Shell rail (`V2App.tsx:258`). §3.2 lists five hosts that get it, four that do not and why, and Rbm without acceptance. |
| 32 | "Clients can see" may mean a sponsor seeing its consultant's work | A | Decision 6. |
| 33 | A backgrounded phone stops the turn | A | S4 acceptance item and decision 2. |
| 34 | Show each round's provider and model | A | The payload's `models` and the turn header details (§2.5, §3.3). |
| 35 | "Verify accepts /1–/4" changes nothing | A | Removed; only the Summary branches on version (§2.2). |
| 36 | Reload needs message ids | A | S4: the history query selects `id`, and the client keeps `serverId` (§3.5). |
| 37 | The id filter drops bare-number queries | A | Only uuid and long-hex shapes are dropped; ids never reach the preview because of the field allow-list (§2.3). |
| 38 | Duplicate task titles collide | P | Within one plan they cannot: the handler already refuses two steps with the same lower-cased title (`turn-plan.ts:111-113`). Accepted for re-added titles, which get a new id (§4, S5 test 3). |

### Product critique

| # | Point | Verdict | How it was handled |
|---|---|---|---|
| 1 | Reads claim coverage the model never saw | A | Confirmed at `document-catalog-tools.ts:225-231, 321-327` against `agentic-loop.ts:543-595`. It is now S1, first, with four red tests. |
| 2 | The round budget rules out long work | P | Accepted: the budgets are stated (§1b), the existing stop line and Continue become the closing row, and the acceptance corpus is sized. Rejected: extra rounds while a plan has open items, because the model would control its own budget (§6). |
| 3 | A dropped connection stops the turn | A | Decision 2 (recommended: detach as its own design); the honest closing row in S4. |
| 4 | Drive assumptions: impersonation, scope, shared drives, several sources | A | Impersonation: decision 5 (allow-listed folders). Scope: kept as authorised. Shared drives: S2. Several sources: `connected`. |
| 5 | Ship the Drive id fix first | A | S2, before any view work. |
| 6 | Notes are missing on thinking turns | A | Confirmed at `progress-updates.ts:38-48` and `reasoning.ts:100-104, 128-140`. Decision 3; S4 acceptance runs a Thorough turn. |
| 7 | Notes repeat the answer | A | Decision 4. |
| 8 | Most rows have no label (527 of 608) | A | Counted and confirmed. One table, both tenses, coverage gate (S3). |
| 9 | Labels never change tense; the read label never names the document | A | The closed verb table and title resolution at announcement (S3 tests 4–5). |
| 10 | The phone layout cuts off the useful part; source names are hidden | A | A short verb plus the visible source name on line one, the preview on line two (§3.3). |
| 11 | The result line repeats the redaction defect | A | Allow-listed result facts; S3 test 1 covers results. |
| 12 | S1's acceptance contradicted itself (no live notes) | A | Live `note` events and the `/4` timeline are sealed from the same events (S4 test 1). |
| 13 | Records cannot be matched to messages on reload | A | Message `id` returned and kept; joined by `assistant_message_id` (§3.5). |
| 14 | "Not recorded" will flash | A | "Recording…" while the confirm waits run (§2.7). |
| 15 | Three views of one turn; the chip would get two meanings; the phone dock | A | The Summary is the body of the Progress panel for a chosen turn. The chip keeps one meaning. On a phone the sheet replaces the dock, built on `useDialog` (§3.1). |
| 16 | "All seven hosts" is wrong; the rail needs the sheet | A | §3.2. |
| 17 | Threads are not private for reading | A | Confirmed at `threads.ts:188-210`. The first draft's claim is corrected (§1a). Decision 6, with a D3 finding to file. |
| 18 | Copy fixes | A | Each applied at the source: §2.6, §2.7 (Recorded with Download, "Recording…", the crash wording in D1), the marked-complete threshold, and the source count excluding plan, engine and screen (§3.3). |
| 19 | D5 is the wrong row | A | Confirmed at `LAUNCH_DEFINITION_OF_DONE.md:21`. Recorded as a founder exception lane (§0, decision 1). |
| 20 | S2 (rejoin) has little client value; seal from memory | A | No migration. Sealed from the recorder. Rejoin deferred with detach (D1). |
| 21 | The planning guidance already exists | A | Dropped (§4). |
| 22 | The OCR line is imitation | A | Dropped (§4). |
| 23 | Grouping is not in the screenshots; parallel reads shrink each read; S5b serves no production client | A | Grouping dropped, one row per step. The parallel-read hazard is closed by S1 rather than avoided. S5b removed and left to ANA-AGENTS (D2). |

### Corrections to the first draft's own claims

- "Every call is a row with a deterministic server label": false; 527 of the 608 in-scope tools have none.
- "Threads are private to the person who started them": true only for renaming.
- "All seven hosts": five hosts get it, and four spinner hosts have none.
- "D5": no D-row moves.
- The Veeva id is `veeva_vault`.
- `run-control-limits.ts` lives at `shared/ana/run-control-limits.ts`.
- `connector-search.ts` lives at `server/services/integrations/connector-search.ts`.
