# The person stays in control of AnA's CSR drafting: options, choice by paragraph, revision, checked figures

W1 / D2 (Authoring). Founder direction, 2026-10-29: AnA and the platform draft a CSR in the canvas and editor; the drafting has to be fluid and intelligent, offer options, and let the person accept, deny or edit what it proposes, so the person stays in control. Decisions 1–7 below are the lead's, under the founder's delegation. Evidence: `docs/evidence/D2-CSR-DRAFT-CONTROL/`.

This design completes and reaches what already exists. It adds no surface, editor, store, model or route. The CSR engine path (job runner, evidence gates, claim receipts, narratives, assembly, workflow-source-import) belongs to the CSR lane (`docs/design/CSR_END_TO_END_2026-10-29.md`); this work builds on what that lane ships and does not take over its slices.

## Decisions this design works to (lead, 2026-10-29)

1. AI text never enters the governed document without the person's act. A draft or suggestion arrives as a proposal: a parked candidate, or tracked changes in the one editor. Accepting is never approving. Review, the scientific-review attestation and the Part 11 signature do not change.
2. Options. For a section, or a selected passage, AnA can offer up to three alternatives. Each is its own single-use candidate, with its own checks, labelled by what it does differently. The person compares alternatives with each other and with the current text, as a diff.
3. Accept, deny or edit, at the grain the person chooses: the whole alternative, chosen paragraphs (landing as tracked changes the person accepts or rejects one by one), or nothing. Editing before accepting is always possible. Lineage stays honest at span level.
4. Revise by instruction. Each revision is a new candidate derived from the one shown, never an in-place overwrite, and its checks re-run.
5. Deterministic where it counts. In CSR results sections (§2, §10–13), an alternative carrying a figure the engine did not produce cannot be accepted until the person removes or corrects it, and the reason is named. The model may describe how alternatives differ; it never supplies a number.
6. Fluidity. Drafts arrive progressively where the person is working, focus stays put, next/previous change and accept/reject are reachable by keyboard, the review shows the rendered section, calm motion, WCAG 2.2 AA, reviewer-grade wording.
7. Fail closed. No provider is a refusal. A failed check is not "passed". A candidate from another session or document is refused. No auto-save, no auto-accept.

## What already exists

Searches run (2026-10-29, `concept2cure-v2` at `aa861b9a2`): `alternative`, `variant`, `option`, `regenerate`, `redraft`, `revise`, `rewrite`, `refine`, `compare`, `diff`, `redline`, `tracked`, `suggestion`, `accept`, `reject`, `candidate`, `stream`, `derivedFrom`, `parentDraft` across `client/src/concept2cure/**`, `server/routes`, `server/services/{authoring,ana,csr,clinical-regulatory-evidence}`, `shared/authoring`, `migrations/` and `db/migrations/`. The working clone is shallow (history from 2026-10-22), so the deletion search ran on a separate blob-less clone of the full `concept2cure-v2` history (16,464 commits): `git log --diff-filter=D --name-only -- client server shared`, filtered on the same names.

**The draft door (server)**

- `server/routes/authoring.router.ts:3375` `POST /api/authoring/sections/:sectionId/ai/draft`. It is the one gateway call (`taskType: document_drafting`, temperature 0.3). It does project-scoped Data Room retrieval, or the exact selected-source manifest, and reports `retrievalStatus` (`ok`, `empty` or `failed`). It applies saved template guidance (`server/services/authoring/authoring-draft-template.ts` `buildSectionDraftPrompt`) and opens one turn record per call (`server/services/ana/turn-record-draft.ts`). The record holds the draft in `outputs.drafts` and the engine's check of the draft against what the model was shown (`verifyTurnAnswer`). The draft is parked as a single-use candidate (`server/services/clinical-regulatory-evidence/draft-candidate-store.ts` `createDraftCandidate`, two-hour TTL, `savedSectionBase`, generator, assertions). Without a provider it answers 503 `GATEWAY_UNAVAILABLE` with no body. A truncated draft is 422 `DRAFT_TRUNCATED`. **It does not** produce more than one draft per call, take an instruction to revise an earlier candidate, stream, or check figures against CSR engine tables. For an imported CSR results section it drafts from Data Room excerpts, not from the retained run's evidence pack.
- `authoring.router.ts:3765` `POST …/ai/draft/accept` consumes the candidate in the section transaction (`consumeDraftCandidate`, with the saved-base lock, so `SECTION_BASE_CHANGED` is 409). It replaces the **whole section** and records source spans against the parked chunks (`enforceSourceAndAuthorLineage`). It credits the machine only for clauses verbatim in the draft as generated (`acceptedMachineText`, :3886). It commits to the filing, writes revision `ai-draft-accept`, and writes the Part 11 audit row with `draft_modified_on_accept`, `generated_draft_sha256` and, when edited, the draft as generated. **It does not** accept part of a candidate, and it does not check figures against CSR claim receipts.
- `draft-candidate-store.ts` has no uniqueness per section, so several live candidates for one section are already possible. Nothing links candidates to each other, for example as alternatives of one request or as a revision of another.
- Deleted history: `server/routes/__tests__/authoringAiDraftFallback.test.ts` (2026-09-21, `ad69500f0`), removed with the template fallback. Nothing like alternatives or revision was ever on this route.

**The one review panel (client)**

- `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx` (578 lines) is mounted only by `editor/DocumentWorkbench.tsx:5331`, above the editor, in section view, keyed by section. The toolbar opens it with "Draft from sources" (:4762). It takes tone (`professional`, `concise` or `detailed`), region, context and requirements, and generates **one** candidate. It shows grounding (`describeGrounding`), the model, the check (`AnswerCheckRows`) and the record status. The candidate's raw text can be edited in a **monospace textarea**. "Accept and record citations" replaces the whole section, with an optional reason. "Draft again" **replaces** the shown candidate and its edits, and "Discard" drops it. It refuses a sealed document, unsaved editor changes, an unknown accept outcome, a changed base and a candidate from another section. **It does not** offer alternatives, compare with the current text, render the draft (headings, lists, tables), accept part of a draft, or revise by instruction.
- `editor/useAuthoringDraftReview.ts` (148 lines) is the panel's state and request lane: one attempt at a time, scope and session guards (`captureEditorDraftGuard`), a candidate-currency guard (a candidate from another document, project or signed-in session is refused), unknown-accept hold and saved-section check. `editor/authoringDraftTransport.ts` holds `AiDraftReviewState` (draft, body, reason, refusal, generationInputs, acceptUnknown, baseChanged, checkedContent) and the one transport for generation and accept. `editor/assemblyDraftQueue.ts` and `useAuthoringAssemblyBuild.ts` drive the same transport for source-first assembly and hand the panel a `reviewSession`.

**Tracked changes and the proposal door (client)**

- `editor/suggestions.ts` (2,046 lines): insertion and deletion marks carry author, minute, `sourceRecord` (the AnA turn record) and `applicationId`. It holds `insertSuggestedContent` (markdown subset at the caret) and `proposeReplacement` (`replace`, `insert-before`, `insert-after`, `insert-empty`; exact quote resolution via `proposalAnchor.ts`). Accept and reject are recorded decisions, with an undo floor. The accepted insertions travel with the next save (`AcceptedInsertion.turnRecordId`). **Limit:** a one-paragraph `insert-after` lands inline inside the anchor paragraph, so a new paragraph cannot be added after an existing one through the remedy contract.
- `editor/DocumentWorkbench.tsx:1014` `EditorBridge`, implemented at :1961. `propose` applies the governed-write gate first (`anaInsertGate.ts` `anaInsertRefusal`: a finished answer, a recorded turn, and every serving model qualified). It then checks the section, editability and saved base (`baseUpdatedAt` or `baseSha256`). It applies through the editor handle and returns a scoped receipt (`editorProposalReceipt.ts`). `getProposalState` and `subscribeProposalChanges` observe pending, settled or absent (`proposalLifecycle.ts`). The bridge is handed out only to an embedding host (`embedded.onEditorBridge`). **The workbench's own draft panel has no access to it.**
- `editor/AuthoringRemedies.tsx`, `authoringRemedies.ts` and `shared/authoring/remedies.ts` (`docs/design/EDITOR_ANA_AMENDMENTS_2026-10-26.md`) are AnA's amendment cards from the conversation: at most six versioned proposals, each applied through `bridge.propose` and observed through its receipt. There is one proposal per fix, with no alternatives.
- `editor/RichSectionEditor.tsx` (3,001 lines) has the review strip (:2402): per change, Show in text, Accept and Reject, plus Accept all and Reject all. All of these are buttons, so they are reachable with Tab. **There is no** next-change or previous-change command and no accept or reject key. Selection affordances are "Cite selection" (asks AnA for a source, :1522), comments and find/replace. **There is no** "offer alternatives for this passage".
- Saving goes through `PATCH /sections/:id`. The accepted AnA insertions are verified against the named turn record (`server/services/authoring/machine-claim-verify.ts`: the record exists, verifies whole, and the words are inside an answer or a draft it holds). Verified words are credited as accepted machine text with the serving model; unverified words are recorded as the saver's own, with the reason. A verified claim from an unadmitted model refuses the save (403). Earlier machine spans carry forward by text (`lineage-gate.ts` `previousContent`).
- Deleted history: `client/src/concept2cure/v2/surfaces/EditorCanvas.tsx` (2026-08-17, `90760ae00`, merged into the one TipTap canvas with track changes and revision diff). `client/src/concept2cure/components/editor/extensions/TrackChangesExtension.ts`, `client/src/concept2cure/components/provenance/DocumentVersionCompare.tsx` and `components/ui/ValidationRefineTrigger.tsx` (2026-06-02, `e5a74a4df`). `client/src/components/claude/ClaudeStreamingDraft.tsx`, `client/src/components/DocumentDiffViewer.tsx` and `client/src/components/extensions/TrackChangesExtension.js` (2026-05-01, `7a144fd1e`). `client/src/concept2cure/components/chat/anaStreamingClient.ts` (2026-05-26). Each has a canonical successor today: `suggestions.ts`, `textDiff.ts` with `RedlineText.tsx`, and the AnA stream. None offered alternatives or per-paragraph acceptance. Nothing here is restored. `client/src/concept2cure/mdx/components/AnaDrafter.tsx` (deleted today, `e3a2d0475`) was a correspondence drafter and is unrelated.

**Diff and rendering**

- `editor/textDiff.ts` (`diffStoredContent`, a word-level diff over visible text) and `v2/RedlineText.tsx` (`<ins>`/`<del>` rendering) are used by `surfaces/AuthoringRevisionDiff.tsx` (history) and `LabelingPi.tsx`. **They are not used** by the draft panel.
- `editor/AuthoredHtml.tsx` and `components/ana/renderSafeMarkdown.ts` render sanitized authored HTML and markdown. **They are not used** by the draft panel.

**Checks**

- `editor/DraftFigureLine.tsx` and `editor/DraftClaimsLine.tsx` show, under a saved drafted document's provenance line, the save's figure check and claims check against cited sources. They are about saved documents, not candidates.
- Shipped by the CSR lane: `server/services/csr/csr-claim-receipts.ts` (`importedCsrSectionEvidence`) carries each imported CSR section's claim receipts and study-information numbers into the Authoring provenance (`importSource.sectionOrigins[].csrEvidence`, written by `server/services/authoring/workflow-source-import.ts`). `server/services/ana/csr-saved-evidence.ts` (`assessSavedCsrEvidence`) re-checks a saved CSR. It uses `findUnclaimedNumbers` (`server/services/csr/unsupplied-statistics.ts`), with figures blocking in results sections (`RESULTS = /^(?:2|1[0-3])(?:\.\d+)*$/`), and finds edited claims (`csr-edited-section.ts`) and cross-section conflicts. **It runs on the saved document** (critique and release). It does not run on a candidate before accept.
- `server/services/csr/cortex-authoring-context.ts` (`buildCsrAuthoringEvidence`, `reconcileCsrTableClaims`) is the section evidence pack, used by the job drafter and AnA's `get_csr_section_evidence`. The authoring draft route does not use it.

**Canvas and conversation**

- `editor/DocumentCanvas.tsx` expands into the same `DocumentWorkbench`, so the panel is the same in the conversation's canvas (`docs/design/ONE_ANA_ONE_CANVAS.md`, `docs/design/ANA_DOCUMENT_CANVAS.md`, gate `ci:canvas-path`). `editor/askAnaToDraft.ts` hands a prompt to the one conversation, and `editor/draftToDocument.ts` turns a chat draft into an authoring document. `surfaces/BatchDraft.tsx` (eCTD batch draft) has its own accept door and is out of scope.

## The person's loop today

**(a) An empty CSR section** (for example §11.4.1 of a document started from the E3 outline)

1. Open the document in Authoring and select the section. The editor's empty state offers "Draft this section from the linked section evidence." This goes to the conversation.
2. Choose one of two drafting doors in the toolbar:
   - "Draft with AnA" opens the conversation. AnA drafts in chat, and the person inserts the draft as a tracked suggestion (`bridge.insert`) or applies an `insert-empty` remedy card.
   - "Draft from sources" opens the review panel above the editor.
3. In the panel, set tone, region, context and requirements, then press "Draft section". A live wait shows the phase and a clock.
4. One candidate appears: grounding, model, the check against the Data Room excerpts shown, record status, and the raw text in a textarea.
5. The person may edit the raw text, and is told the edits are unchecked and that the audit will note it.
6. "Accept and record citations" replaces the section with source spans, machine and author lineage, the revision, the audit and the filing. Alternatively, "Draft again" replaces the candidate, or "Discard" drops it.

Not possible today: comparing two drafts, keeping one paragraph of a draft, seeing the draft rendered, or narrowing a draft by instruction. The figures are checked only against the Data Room excerpts, not the engine tables.

**(b) A section already holding imported CSR text**

1. Submission Center run, then CSR build: the job drafts over engine tables, with reconciliation.
2. Board triage, then import into Authoring. The sections carry claim receipts bound to the stored copy's hash.
3. The editor opens §11.4.1 with that text. The import notice shows its origin and the machine passages.
4. To improve it, the person has three routes:
   - "Draft from sources" produces one Data Room draft, and its accept replaces the whole imported section. The engine-bound figures are lost. The saved-CSR verdict then finds the edited section, and blocks unclaimed figures, at critique or release time, not at accept.
   - "Review with AnA → Prepare targeted fixes" makes AnA re-read the saved section and return up to six remedy cards. Each one goes in through "Apply as tracked suggestion". The person reviews it in the strip (Accept, Reject, all) and saves with a reason. AnA's words are verified against the turn record on save.
   - Edit by hand, tracked as the person's own changes.

**(c) A selected passage**

1. Select text. The editor offers "Cite selection", comment or find.
2. To rewrite it, the person asks AnA in the conversation in their own words.
3. AnA returns one remedy per fix (a `replace` with the exact quote). The person applies it, reviews it in the editor and saves.

There are no alternatives for a passage, and no instruction-based revision of a proposal already shown.

## Gaps against the decisions

| Decision | Holds today | Gap |
|---|---|---|
| 1 proposal only | Yes. Both doors need the person's act; accept is not approval. | None. Keep it that way. |
| 2 options and diff | No. There is one candidate, and "Draft again" overwrites it. | Up to three alternatives, each labelled. A diff with the saved section and between alternatives (`textDiff` and `RedlineText` exist and are unused here). |
| 3 grain | Whole section (accept route), or one remedy per passage from the conversation. | Chosen paragraphs from a candidate, landed as tracked changes through `bridge.propose`. The panel cannot reach the bridge today. |
| 3 lineage | Whole: span-level, with `draft_modified_on_accept`. Tracked: verified per turn record on save. | The paragraph path records machine and person words exactly, but no verified source citations (see slice 7). |
| 4 revise by instruction | No. | A new candidate derived from the one shown (`derivedFrom` in the parked generator), with its checks re-run. |
| 5 engine figures | Only on the saved CSR (critique and release) and in the job drafter. | A per-candidate figure gate in §2 and §10–13 for sections with CSR receipts, which refuses accept and paragraph proposals carrying unclaimed figures and names them. The draft route should draw on the retained evidence pack for those sections. |
| 6 fluidity | Wait indicator. Panel in place. | Progressive arrival, rendered review, next/previous change and accept/reject keys in the editor, streaming. |
| 7 fail closed | Yes (503, 410, base, scope, currency guard, no autosave). | Each alternative inherits all of it. A partial set of alternatives says how many arrived. |

## Slices, in order

Each slice is red first against the existing surface. It then goes green, its mutations are shown failing, and the gates are run on its files. Evidence goes under `docs/evidence/D2-CSR-DRAFT-CONTROL/<date>/`.

### Slice 1. Complete the review panel with alternatives and paragraph-grain accept, through the existing doors (this session)

**Status (2026-10-29):** implemented, not yet committed. Evidence: `docs/evidence/D2-CSR-DRAFT-CONTROL/2026-10-29/`. Red 12/12, green 24/24, regression 485/485, mutations 14/14 killed.

- **Deliverable:**
  - "Draft three alternatives" asks the **existing** draft route three times, once per tone in the existing vocabulary (professional, concise, detailed). Each answer is its own single-use candidate, with its own check and turn record. The label is what the platform asked for ("Asked for a concise text"), never the model's claim.
  - The alternatives arrive one at a time in the same panel. Focus does not move, and a polite live region says which one arrived.
  - The person switches between alternatives. Each keeps its own edits. The person compares the shown alternative with the saved section or with another alternative, as a redline. The panel states the paragraph and word counts of each alternative, computed by code.
  - Two ways to take a draft:
    - **The whole alternative**: the existing accept, unchanged.
    - **Chosen paragraphs**: each paragraph of the alternative, as AnA drafted it, is rendered with a choice. In a section with text, each chosen paragraph replaces the current paragraph the person pairs it with. The default pairing is the most similar paragraph by shared words, shown with its redline. In an empty section the chosen paragraphs go in as one `insert-empty` addition.
  - They land through the workbench's own `EditorBridge.propose`, as AnA's tracked changes, with the alternative's turn record as `sourceRecord`, under the existing model gate and saved-base check. The person then accepts, rejects or edits each one in the editor and saves.
- **Completes:**
  - `surfaces/AuthoringAiDraft.tsx`
  - `editor/useAuthoringDraftReview.ts`
  - `editor/authoringDraftTransport.ts` (state only)
  - `editor/DocumentWorkbench.tsx`: the panel gets the bridge it already builds, and the saved section text.
- **New modules beside them:**
  - `editor/draftAlternatives.ts` (pure)
  - `editor/DraftAlternatives.tsx` (the picker, the comparison and the paragraph choice)
- **No server change.** The route already parks one candidate per call.
- **Proof:**
  - Red: a workbench test asks the real panel for alternatives and chosen paragraphs. It fails on today's panel.
  - Green: three requests, one per tone. Progressive arrival. The editor holds `ins`/`del` by `ana` with the right `data-source-record`. No PATCH and no accept is sent. Whole accept sends the shown alternative's `draftId`. An unqualified record is refused. A partial failure says how many arrived.
  - Mutations: author, source record, record passed to the gate, pairing, tone, shown index, kept edits.
- **Part 11 lineage:**
  - Whole accept: unchanged.
  - Paragraph path: no candidate is consumed and no source span is recorded. Each decision row names the turn record. On save, AnA's unchanged words verify against that alternative's turn record, which holds the draft verbatim, and are credited with the serving model. Words the person typed are the person's. There is no audit-level `draft_modified_on_accept` at this grain, because the span split is the record.
  - The panel says before the click that this path carries no source citations.

### Slice 2. The figure gate on candidates in CSR results sections (decision 5)

- **Deliverable:**
  - For a section whose document carries CSR import receipts (`importedCsrEvidence(provenance)`), the draft response carries, for each candidate, the figures that `findUnclaimedNumbers` finds against that section's claimed cells and study-information numbers. In §2 and §10–13 they are blocking, by the same `RESULTS` rule the saved verdict uses.
  - The accept route re-runs the gate on the content actually accepted. It refuses with 422 `CSR_FIGURE_NOT_FROM_ENGINE`, naming each figure.
  - The panel shows the figures inline on every alternative and paragraph. It disables accept and the proposal of a paragraph carrying one, and names the figure and the reason.
  - For the paragraph path, a paragraph edited in the editor is gated again by the saved-CSR verdict at save, critique and release. That already exists; nothing new is needed.
- **Converges with the CSR lane:** the helper is exported from `server/services/ana/csr-saved-evidence.ts` (`planSection`'s figure step), not copied. The lane is asked before that file is touched.
- **Files:**
  - `server/services/ana/csr-saved-evidence.ts` (export only)
  - `server/routes/authoring.router.ts` (draft and accept, a few lines)
  - `editor/authoringDraftTransport.ts`
  - `editor/DraftAlternatives.tsx`
  - route test under `server/routes/__tests__/`
- **Proof:**
  - Red: a §11.4.1 candidate stating 17/305 where the receipts claim 16/305 is accepted today.
  - Green: the accept is refused and the figure is named. §9 (methods) reports it without blocking.
  - Mutations: drop the results rule; skip the accept re-run.
- **Lineage:** a refused accept writes nothing. `ci:launch-scope-api` applies, because a route's response changes.

### Slice 3. Revise by instruction (decision 4)

- **Deliverable:**
  - `POST …/ai/draft` takes `revise: { fromDraftId, instruction }`.
  - The server reads that live candidate read-only (org, section, unexpired; never consumed). It drafts from it with the instruction as the person's words, in the turn request and in the check's person words.
  - It parks a **new** candidate whose generator records `derivedFrom: { draftId, contentSha256, instruction }`.
  - Quick instructions in the panel: "Shorter", "Follow the SAP wording", "Use the E3 structure for this heading", plus free text. The result joins the alternatives as "Revised: …", derived from the alternative it names. The original stays.
- **Files:**
  - `draft-candidate-store.ts` (`readDraftCandidate`)
  - `authoring-draft-template.ts` (revision prompt)
  - `authoring.router.ts`
  - transport, hook, `DraftAlternatives.tsx`
  - route and panel tests
- **Proof:**
  - Red: a revision request is drafted from scratch today.
  - Green: the prompt holds the base text, the base candidate still accepts, and the new candidate's audit names `derivedFrom`.
  - Mutations: consume instead of read; drop `derivedFrom`.
- **Lineage:** accept records the generator, including `derivedFrom`. The revision's turn record holds the base text as model input. A number the instruction asks for ("add the per-protocol result") is still subject to slice 2.

### Slice 4. Alternatives for a selected passage (decision 2, passage grain)

- **Deliverable:**
  - A selection affordance in the editor, "Offer alternatives for this passage", beside "Cite selection" (`RichSectionEditor` `onAsk` pattern).
  - It opens the same panel in passage mode. Up to three replacements of the exact quote come from the draft route, with `passage: { quote, prefix, suffix }` and the saved section as context. Each is a candidate with its own check.
  - The chosen one lands as a `replace` proposal through `bridge.propose`.
- **Files:** `RichSectionEditor.tsx` (prop only), `DocumentWorkbench.tsx` (wiring), the route, transport, hook and panel.
- **Proof:**
  - Red: no passage door exists.
  - Green: one alternative replaces exactly the selection; an ambiguous quote is refused.
  - Mutation: drop prefix and suffix.
- **Lineage:** as for slice 1's paragraph path.

### Slice 5. Review by keyboard in the editor (decision 6)

- **Deliverable:**
  - In the one editor: next and previous change, accept, and reject, as key commands. The keys are proposed in the open questions.
  - Each moves the selection to the change and announces author, kind and text politely. Accept and reject use the existing `resolveSuggestion`, so the decision record is unchanged.
  - The review strip states the shortcuts.
- **Files:** `editor/reviewNavigation.ts` (a TipTap extension, new), `RichSectionEditor.tsx` (register, a few lines), tests.
- **Proof:**
  - Red: no command moves to the next change.
  - Green: next and previous wrap within the section, accept and reject record a decision, and the undo floor holds.
  - Mutation: skip the recorded-decision meta.
  - a11y-auditor review.
- **Lineage:** none new; the same decision rows.

### Slice 6. Progressive arrival inside the text, in the canvas too (decision 6)

- **Deliverable:**
  - The draft route streams the candidate as it is written. The candidate is parked and the check is filed only at the end; a stream that ends early parks nothing.
  - The panel shows the text growing, rendered, in the workbench and in the conversation's canvas.
  - Alternatives are requested in parallel within one attempt.
- **Files:** `authoring.router.ts` (SSE variant of the same handler), the gateway's stream API, transport and hook.
- **Proof:**
  - Red: no partial text before completion.
  - Green: a cut-off stream parks no candidate and says so.
- **Lineage:** unchanged; the candidate is the completed text only.

### Slice 7. Chosen paragraphs with source citations (decision 3, lineage)

- **Deliverable:** when chosen paragraphs from one candidate are accepted in the editor and saved, the save consumes that candidate and records verified source spans for those paragraphs against its parked chunks, in the same transaction, with the earlier spans carried forward. Today they carry none.
- **Files:**
  - `authoring.router.ts` (the PATCH save, a few lines)
  - `draft-candidate-store.ts`
  - `lineage-gate.ts` (accepts sources beside `previousContent`)
  - `suggestions.ts` (`AcceptedInsertion` gains the candidate id from the mark)
- **Proof:**
  - Red: no source spans after a paragraph accept.
  - Green: spans for exactly the accepted paragraphs, none for rejected ones, and a 410 when the candidate is gone.
- **Lineage:** adds source spans. A product decision first (open question 2).

## Open product questions (the lead decides)

1. **What alternatives differ by.** Slice 1 uses the existing tone vocabulary, so the label is what was asked, deterministically. The other choices are a closed list of named approaches the lead writes ("leads with the primary result", "follows the SAP order"), or angles the model proposes and narrates, with a digit guard on the narration.
2. **The paragraph path carries no source citations.** Is that acceptable with the warning (slice 1), or must slice 7 land before customers see it?
3. **The option set in the record.** Rejected alternatives keep their turn records, but nothing links "chose 2 of 3". Should the accept's audit name the set?
4. **Cost and rate.** "Three alternatives" is three gateway calls. In production every call is PQ-gated today (`approved-models.ts`, PQ-DRAFT-001 pending).
5. **Default pairing** by most-shared words, with the person able to change it. Or no default, with the person always choosing?
6. **CSR results sections before slice 2.** Until the figure gate lands, a candidate figure that is not from the engine is caught only by the saved-CSR verdict (critique and release), as for today's single draft. Should alternatives be withheld in §2 and §10–13 of an imported CSR until slice 2?
7. **Keys for slice 5.** For example Alt+] and Alt+[ for next and previous, and Alt+Enter and Alt+Backspace for accept and reject. They must not collide with screen-reader or OS keys.
8. **Adding a new paragraph after an existing one.** The remedy contract inlines a one-paragraph `insert-after`. Should slice 1's "add" pairing wait for a block-boundary insert in `suggestions.ts` (a change to the canonical door), or stay "replace a paragraph" plus "empty section"?

## Decisions on slice 1's questions (the lead, 2026-10-29, under the founder's delegation)

1. **What alternatives differ by.** Tone is the interim. Next is a closed list of named approaches the platform writes per section type, for example "concise synopsis style", "full ICH E3 structure" and "follows the protocol and SAP wording". The model never proposes the angles, so no model-written label can carry a figure.
2. **Chosen paragraphs carry no source citations.** This is acceptable, with the warning the panel already shows, until slice 7. It is not acceptable in a CSR results section once production drafting is qualified (see 6).
3. **The accept's audit names the option set** ("alternative 2 of 3, concise"). It lands in slice 2.
4. **Three gateway calls** are acceptable. They are made only when the person asks for alternatives; one draft stays the default.
5. **Paragraph pairing** keeps the default by shared words. The pairing is shown and changeable before anything is added.
6. **Results sections (§2, §10–13).** Slice 2's per-candidate figure gate must land before the CSR-drafting PQ is executed, because production drafting is PQ-gated today. Until then, a non-engine figure is caught by the saved-CSR verdict at critique and release. If the PQ is scheduled first, alternatives and the paragraph path are withheld in those sections.
7. **Keys** are as proposed, after an accessibility review for operating-system, browser and screen-reader conflicts. The review comes before slice 5 ships.
8. **Adding a paragraph after an existing one** waits for the `suggestions.ts` change, in slice 4.

## Slices 3 and 4: status and decisions (the lead, 2026-10-30, under the founder's delegation)

Both slices landed on 2026-10-30. Evidence is in `docs/evidence/D2-CSR-DRAFT-CONTROL/2026-10-29/slice-3-4/`: 69 new tests, 133 of 133 green, and 41 of 41 mutations killed.

- **Slice 3, revise by instruction.** `POST …/ai/draft` takes `revise: { fromDraftId, instruction }`. The base is read with `readDraftCandidate` and never consumed. The new candidate records `derivedFrom: { draftId, contentSha256, instruction }`, and accepting it writes that to the audit row. The panel shows revision N against N−1 as a redline, and every earlier revision stays reachable.
- **Slice 4, alternatives for a selected passage.** The editor offers "Offer alternatives" for a selection that the proposal door will resolve to exactly one place. The server admits the passage only from the saved section. The chosen alternative lands as AnA's tracked replacement of exactly the selection, through `EditorBridge.propose`.

Decisions:

1. **Passage alternatives are not parked as candidates.** This departs from this design's slice 4 text, and the departure is accepted. A candidate's only consumer is the whole-section accept, which would replace the whole section with the passage. Each passage alternative keeps its own check and turn record, and lands through the proposal door under its saved-base check and quote resolution.
2. **Decision 6 covers every path that puts model words into a CSR results section**: alternatives, the paragraph path, revisions and passage alternatives. If the drafting PQ is scheduled before slice 2's figure gate, all four are withheld in §2 and §10–13.
3. **Decision 8 (adding a paragraph after an existing one)** was not taken in slice 4. It becomes slice 4b, after slice 2: the block-boundary insert in `suggestions.ts`, pinned by tests.
4. **The assembly "Review" edge is fixed in the next CSR lane.** If the passage view is open on a section and the person presses the assembly list's "Review" for that section, the panel stays on the passage. That is a stale state over a section the person asked to review. `onReviewSection` will clear the passage, with an assembly-flow test.

