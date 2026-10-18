# AnA editor UI consistency

W1 / D2 follow-through on the existing DocumentWorkbench and RichSectionEditor.
This pass implements the authoring kit, token-first handoff, progressive
disclosure and accessible-control requirements for the AnA oversight and remedy
controls. It does not introduce another editor, conversation implementation or
proposal route.

## Changes

The four review operations remain reachable through a native **Review with AnA**
disclosure in both editor hosts. The saved-record caveat sits outside that
disclosure, including the explicit unsaved-work warning and the project-scope
instruction when no project is open. The disclosure and its options refer to
that explanation through `aria-describedby`. Existing project, document and
section gates remain intact.

Each proposed fix keeps its real section label, reason, application action and
refusal or status visible. A native **What changed** disclosure contains the
complete original and replacement passages. The passages retain their exact
text and use the existing `rdl-del` / `rdl-ins` treatment with semantic `del` /
`ins` markup; deletion has an explicit textual label. The article has a named
heading, and its application control remains associated with its status text.
Known-section navigation still uses the existing guarded bridge.

Inline dimensions and font overrides were removed from these two components.
Shared authoring CSS provides canonical card radius, spacing, sans chrome,
serif reading text, focus treatment, disabled appearance and phone targets.
The remedy component now lives in the canonical conversation. The control tower
owns the CSS and browser verification evidence.

The immutable-turn model gate, version / exact-quote checks, document seal
checks and attributed tracked-change application are preserved. Frozen and
assembled Document views keep a disabled insert offer with their actual host
reason. Applying a proposal still does not save, accept or approve it.

## One canonical conversation and editor

Every Workbench AnA control now reaches `surfaces/ConversationThread.tsx`.
Embedded asks prefill their existing host composer. Standalone asks use the
shell's existing `C2C_CONVO` origin/prefill contract, continue the conversation
in progress and wait for the person's explicit submission. The toolbar can
open it without an invented prompt. No new conversation, provider, model,
store or editor was introduced. The private Workbench chat hook, pane and
input were removed; History, Comments, Sources, Signatures, Audit, Exports,
Project files and Tasks remain in the same editor.

Standalone navigation goes through the existing unsaved-work guard. Cancel
keeps the local buffer and location. Explicit leave carries saved identity
without the unsaved text. Save and continue overlays the confirmed PATCH
timestamp before navigation, so a React render cannot leave the handoff with
an obsolete saved version. A later authoritative rename or revert version
cannot be replaced by an earlier confirmed-save timestamp. A refused save
preserves the editor and pending decision. Both the shell publisher and
handoff carry only saved metadata.

The arrival verifies the exact document against the existing all-status,
project-scoped authoring inventory, without an AnA-only source filter. Until
verified, sending its source context is disabled. Retry and removal of the
attached context remain available. A changed project invalidates the origin
and canvas; cancelled or late verification cannot reopen an old or removed
attachment. Missing inventory rows are described as unverified, without
inventing an absence or ownership verdict.

The verified document uses the existing cardless `DocumentCanvas` path, which
reads its actual document and sections and mounts **the same** Workbench and
RichSectionEditor. An exact section id feeds the existing guarded section-open
nonce. On narrow screens the existing ready-document offer keeps the composer
visible until the person opens the canvas. An asynchronous desktop arrival
preserves composer focus. A question arriving during another run waits for its
own contextual turn instead of becoming a words-only steer of that run.

An embedded question stages a fresh one-turn source from the current canvas's
saved document and section before the phone canvas is hidden. This replaces
an earlier arrival's source and survives a previously spent origin. Hiding the
canvas retains its mounted local buffer; the question still carries only the
saved record. A document without a selected section supplies its actual saved
document identity without inventing a section.

The reachable replacement also preserves sanitized Markdown, real work and
grounding, generated follow-up prompts, governed signoffs and attributed
insertion. Successful bridge inserts and replacements still admit the turn
for machine-attributed paste; unadmitted paste retains the person's attribution
and origin record. Completed answers reveal their start in the conversation's
own scroller without scrolling the page. The textbox has supported listbox
popup semantics, and the progress chip does not reference a panel displaced
by the document canvas.

Before removal, the required search was run:
`git log --all --diff-filter=D -- 'client/**/*Editor*' 'client/**/*Canvas*'`.
It returned no entries in the available shallow checkout. This pass removes
the private conversation input, with its capabilities delivered and tested
through ConversationThread → DocumentCanvas → DocumentWorkbench, rather than
removing an editor capability. This supersedes the private-pane placement
description in the earlier `ANA_OVERSIGHT.md` evidence.

## Validation

The final targeted Vitest run passed **81 tests in seven files**:

- `client/src/concept2cure/v2/editor/__tests__/authoringAnAUI.test.tsx` — six new
  cases cover closed/open native disclosures, caveats remaining visible, all
  four reachable review operations, disabled project/section gates, accessible
  remedy naming and status association, semantic exact-passage redlines,
  visible frozen-document refusals, explicit deletion and attributed pending
  application while the passage disclosure is closed.
- `client/src/concept2cure/v2/editor/__tests__/workbenchRemedies.test.tsx` — six
  cases retain genuine TipTap replacement in both hosts, stale-version and
  unqualified-model refusals, known-section navigation and the source-handoff
  unsaved-work guard. Tests open the review disclosure before using its options.
- `client/src/concept2cure/v2/editor/__tests__/authoringRemedies.test.ts` — four
  parser and oversight-prompt cases.
- `client/src/concept2cure/v2/editor/__tests__/editorBridgePropose.test.tsx` —
  44 existing bridge and structure/selection cases.
- `client/src/concept2cure/v2/editor/__tests__/editorBridgeProposeGate.test.tsx`
  — six governed proposal and paste-admission cases.
- `client/src/concept2cure/v2/editor/__tests__/authoringConversationHandoff.test.tsx`
  — six cases cover clean and dirty navigation, Cancel, saved source requests,
  confirmed save versions, refused saves, missing-version honesty and protection
  against an older save timestamp replacing a newer authoritative version.
- `client/src/concept2cure/v2/editor/__tests__/conversationAuthoringOrigin.test.tsx`
  — nine cases cover explicit submission, empty toolbar arrivals, queued
  requests, exact document/section identity, inventory verification, retry,
  context removal, scope invalidation and late-completion protection. They
  also check document-only snapshots, numeric-scope rejection, supported textbox
  semantics and progress controls while the canonical canvas is open.

Five migrated capability suites separately passed **60 tests**:
`authoringAnaPane.test.tsx`, `authoringAnaMarkdown.test.tsx`,
`authoringAnaInsertGate.test.tsx`, `documentAuthoringSourcesRail.test.tsx` and
`workbenchA11ySweep.test.tsx`. Their shared `canonicalAuthoringFlow.tsx`
mounts the actual Authoring → ConversationThread → saved DocumentCanvas path
and explicitly submits the prefilled question. They retain disabled model,
frozen and Document-view reasons, admitted/unadmitted paste, source-state
honesty, follow-up prompts, completion reading and the remaining record rails.

Two additional embedded-context regressions passed after reproducing both
failures before the fix: a phone question after a spent origin retains the
current saved section while preserving its dirty hidden buffer, and reviewing
section B before the first submission replaces the initial section A source.
Neither case submits automatically or sends the unsaved text. Logs are
`/workspace/scratch/canonical-embedded-context-before.log` and
`/workspace/scratch/canonical-embedded-context-final.log`.

ESLint reports zero errors and zero warnings for both changed UI components,
the new UI test and the adapted Workbench remedy test. The final canonical
handoff lint pass reports no errors or warnings in new helpers or tests; the
existing Canvas, Workbench and Thread warnings are unchanged or reduced.
The targeted run is recorded in
`/workspace/scratch/editor-ana-canonical-final.log` and the scoped lint results
in `/workspace/scratch/editor-ana-handoff-final-lint.json`.
`git diff --check` passes.
The pre-existing bridge suite emits React `act` warnings. No live model request
was made. These jsdom tests establish disclosure, navigation and semantic
behavior. The control tower records the fresh combined typecheck, build,
repository gates and actual-browser accessibility/geometry evidence.
