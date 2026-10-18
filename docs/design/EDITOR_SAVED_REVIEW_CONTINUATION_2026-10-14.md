# Saved document review and working-copy handoffs

W1 / D2 continuation from `87b27c89` on `concept2cure-v2`. Preserve the existing
one editor / one AnA / one canvas decision and design-system controls. Evidence
belongs in `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/saved-review/`.

## Guarded editor view and remedy targets

Switching from Section to Document view currently unmounts a dirty editor before
its unsaved-work decision; Save and continue then has no mounted editor to save.
Route view transitions through the existing leave target and Save / Discard /
Cancel guard. Change the mode only when navigation is actually accepted. Cancel
retains the mode, section and mounted dirty buffer.

A full-document AnA remedy opens its exact section in Section view through that
same guard, including when the section was already selected behind Document
view. The existing remedy button and bridge gain only the necessary current
view fact; no new editor or interaction pattern is introduced. Draft requests
use fixed instructions and carry stored section/document names only through the
existing structured saved origin.

Desktop/touch browser checks exposed the existing track-changes checkbox at
13px on desktop, below its minimum accessible target. Extend its existing 24px
native checkbox sizing to all pointers; keep the established 44px touch label
and shared editor typography/tokens. This changes control sizing only.

## Reopening edited working copies

An exact fingerprint can reopen a previously imported unbound DRAFT whose
sections have since been edited. For a confirmed reused result, validate actual
saved sections, source identity, project, document and retained provenance,
without requiring their code set to equal the original conversion preview.
For a newly created copy, retain the preview fidelity requirement. Invalid,
duplicate or mismatched identities remain refusals.

Protocol removal retains recorded Schedule of Activities cells while excluding
soft-removed visits/assessments from the live export matrix. Verify those
retained cells against recorded endpoints in the same organization and
protocol, including explicitly soft-removed endpoints. Keep them in snapshot
fingerprints/provenance, compose the live matrix, and refuse missing, foreign
or cross-protocol endpoints. Do not change Protocol CRUD or create an alternate
export/materialization path.

## Complete saved-document critique in the existing AnA tool

The current `critique_document` only judges model-supplied section text. It can
score a copied subset as a whole document and filters malformed sections out.
Extend that same read-only deterministic tool with `document_id` for an exact
saved authoring document in the conversation's currently authorized project.
Read its complete ordered section snapshot through one read transaction and
the existing project/object permission checks. The model cannot supply tenant,
project, membership or authoritative content for this mode.

Use the current deterministic precision/consistency engine. Critique the saved
document text with pending insertions excluded and proposed deletions retained;
report pending suggestions as pending. Return exact saved section identities,
versions and an aggregate snapshot digest for later remedy reads. Check stored
citation markers against the existing exact-section citation reader. Missing
records are findings, never fabricated bibliography evidence.

Every saved-review result fits the current serialized tool-result budget. Page
located findings and coverage records without omitting middle findings; compute
the whole document before reporting its writing score. Continuations require
the returned snapshot digest so changed content cannot mix into the earlier
review. Refuse invalid scope, inaccessible records, malformed stored structure,
failed reads or resource limits without a plausible complete-document verdict.
Retain the existing caller-text mode, explicitly scoped to supplied text, and
reject invalid section arrays rather than silently dropping sections. No new
tool name, model call, provider, store, route, dependency or migration is added.

## Ownership and evidence

The editor session owns DocumentWorkbench, DocumentCanvas, AuthoringRemedies
and necessary leave/bridge helpers and regressions. The intake session owns the
existing workflow materializer, source-result reader and their regressions.
Control tower owns the existing critique_document contract/handler and its
bounded read/report helpers, fixed oversight prompts, overall verification,
evidence and the canonical commit/push. Production writes do not overlap.

First reproduce failures, then check saved reads, project/object permission,
full-document coverage and output pagination, stale continuations, pending
suggestions, exact remedy handoff, unsaved decisions and edited-copy reopening.
Use actual database and deterministic-engine tests and existing desktop/touch
browser controls, then run applicable design/canvas/type/build and push gates.
