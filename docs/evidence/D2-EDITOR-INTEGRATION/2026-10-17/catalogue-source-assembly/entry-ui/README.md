# Catalogue source entry UI qualification

This bounded implementation reuses the existing Data Room selection, Vault file
details, Project files rail, dialog styles and editor target channel. It adds no
editor, creator, queue, CSS or source text in global navigation state.

ProjectHome offers **Build in editor** only for explicitly pinned sources. Six
pins are refused with the exact count, rather than silently dropping one. Vault
keeps its document UUID namespace; Data Room keeps its integer source identity.
Readable retained data can enter assembly when original-file import is
unavailable. Excluded or superseded rows explain their disabled action.

The shared chooser lists verified working documents in the original project,
requires explicit selection and checks the scoped list again before publishing
the exact target. Account, organization, project visit, source identity, target
selection and mount changes retire late reads. An unrelated governed ceremony
blocks publication. Creating a document uses the existing editor and a truthful
return-to-select remedy; the chooser does not create or generate anything.
Inside the editor it publishes only one target event through the existing leave
guard. External hosts navigate after publication. Existing **Work on document**
continues to use the separate source import workflow.

The published source target also retains the sender's canonical session and
project-visit ownership before a lazy editor mounts. A private WeakMap holds the
guard for the actual target object, registered before the existing event fires.
A project round trip, account/organization change, replacement session or
unregistered raw copy cannot be adopted by a later receiver. Closing the chooser
and unmounting its component does not invalidate legitimate navigation. Ordinary
targets keep their existing behavior; no public target fields were added.

- [Original actual-surface RED](baseline-red.json): the existing Data Room rail
  lacked the entry. The test later expanded; no historical full-test pin is
  claimed.
- [Initial new checks](new-cases-final.json): 21 passed, including actual
  ProjectHome, Vault, Data Room, chooser and deep-copy channel interactions.
- [Publisher ownership RED](publisher-red.json) captures five actual failures
  before the remedy, with [pre-fix source pins](publisher-red-pins.json).
  [Final publisher/channel checks](publisher-final.json) passed 50/50: all
  29 entry checks and 21 existing generic channel checks. The three controls
  prove ordinary targets, event delivery and chooser unmount still work.
  [Final publisher lint](publisher-lint-final.json) is clean. The
  [first green candidate](publisher-first-green.json) and its
  [complexity lint finding](publisher-first-lint.json) are preserved; a small
  private reader extraction resolved it without suppressions.
- [Final typed-fixture replay](typed-fixture-final.json) passed 50/50 with
  [clean strict lint](typed-fixture-lint.json). A compiler diagnostic exposed
  that the previous malformed-selection array table was interpreted as
  positional arguments by Vitest. Explicitly typed object rows now supply the
  entire intended empty, invalid-id, duplicate or over-limit selector array;
  production code and the refusal assertions are unchanged. No input cast is
  needed. The [pre-typing summary](pre-typing-summary.json) preserves those
  earlier historical test pins.
- [Existing regression](regression-initial.json): 114 passed, with six failures
  caused by an incomplete old auth mock. The [fixture-only replay](rail-replay-final.json)
  passed all six, preserving the original assertions. Together, 120 existing
  checks in 13 files passed; these were separate invocations.
- [Strict focused lint](strict-final.json) and [fixture lint](rail-strict-final.json):
  zero errors and warnings. [Existing surface warnings](warning-comparison.json)
  remain 7 in ProjectHome and 4 in Vault, unchanged from the canonical base.
- [First candidate](first-candidate.json) preserves the corrected test assumption
  about ProjectHome's pre-existing document-list read.
- [Runtime and source receipts](summary.json) record Node 22.23.3 and 15 hashes
  captured after the final targeted runs. The [pre-remedy summary](pre-publisher-summary.json)
  preserves the earlier 11 historical pins. The 120-case regression preceded
  the bounded publisher guard; root owns the final integration replay and
  release-wide pins.

All HTTP was synthetic. These results do not claim provider, database, browser
or human-test completion. Browser and integrated editor qualification have their
own evidence directories. No Git mutations were performed by this delegate.
