# Independent source-first editor interactions

W1 / D2; canonical `concept2cure-v2`, initial source `ff5e065a7`.
Actual SourceAssemblyAction/Dialog, editorTarget channel, DocumentWorkbench,
assembly controller/queue, AuthoringAiDraft and canonical transports. Only HTTP
responses are synthetic. Unrelated filing, collaboration and creation children
are omitted from this focused harness. AuthService session adoption, shell
project visits, the dirty-work guard, ceremony admission and RichSectionEditor
remain actual implementations.

The nine source-flow cases verify both full and embedded receiver hosts; exact
mixed Data Room/Vault selectors and complete source/excerpt manifest parity
through preview, commit, sequential generation and manual regeneration; no
generation or writes on opening the chooser/editor; no automatic acceptance;
dirty Cancel followed by unrelated manual navigation without leaked source
intent; ceremony refusal followed by a fresh handoff; old-source response
suppression; unresolved structural writes held across source changes/clearing;
and project-visit invalidation before a deferred leave decision.

The pinned-host case uses the actual chooser and dirty-work guard, confirms
exact external editorTarget publication at the navigation boundary, unmounts
the pinned host and mounts the canonical full Workbench. It then verifies source
parity in the first preview and one RichSectionEditor. The navigation callback
is observed at that boundary; this is not a full router or browser claim.

Independent inspection found a material integration gap: changing the source
selection while a queued review was open dropped its controlled review session.
The still-open panel could start broad retrieval. [The failing case](bypass-red.txt)
observed a third generation request when the new explicit selection had not been
verified and the expected count remained two. The implementation owner closed
the old review on source selection changes, blocked unbound generation under an
explicit selection, and kept the captured old review ownership guard on delayed
requests. A separate case confirms a delayed regeneration from selection A is
not adopted into selection B. Completed earlier candidates remain retained.

The existing unknown-acceptance panel test also runs against the new explicit
`503 DRAFT_ACCEPT_UNCONFIRMED` response. It retains the candidate, blocks another
acceptance, requires an explicit exact saved-section GET and never infers which
request wrote matching text or automatically repeats a POST.

Retained receipts:

- [Embedded baseline](embedded-red.txt): 3/3 failed; the former embedded host
  ignored source assembly intents.
- [Chooser intermediate](chooser-query-intermediate.txt): 4/4 failed; one full
  host lookup was ambiguous between tree and editor text. It was corrected to
  the exact active level-one heading without weakening source assertions.
- [Corrected RED](red.txt): 4/4 failed. The embedded receiver did not navigate;
  the full host did not adopt sources or open/load the build disclosure.
- [First candidate](green-4.txt): those four actual flows passed.
- [Independent bypass RED](bypass-red.txt): four passed, one failed for the
  extra generation described above.
- [Expanded candidate](green-7.txt): 7/7 passed after the ownership fixes.
- [Pinned/uncertain acceptance regression](green-27-before-final-pin.txt):
  27/27 in two files: nine source flows and eighteen existing/expanded AI review
  cases. [Scoped lint](lint-before-final-pin.txt) passed both tests with zero
  errors and warnings.

- [Final frozen-source run](green.txt): 27/27 in two files. The complete
  selected-source manifest uses strict equality assertions for queued and
  manually regenerated requests. [Final strict lint](lint.txt): zero errors
  and warnings in both owned tests.

Final frozen-source hashes and counts are recorded in [summary.json](summary.json).
All nineteen client/shared/test pins matched before and after this final run.
Receipt normalization and original/repository hashes appear in
[receipt-storage.json](receipt-storage.json). No provider, database, deployment,
human-review or regulatory-readiness claim follows from this synthetic HTTP
qualification. SQL transaction/source access and browser evidence are separate.
