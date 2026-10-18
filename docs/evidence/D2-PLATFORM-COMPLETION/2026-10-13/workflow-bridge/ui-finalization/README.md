# W1 / D2: governed workflow UI consistency

The existing source-intake dialog, authoring handoff, section editor and signing
dialog remain the canonical UI. This increment verifies that stored protocol
and CSR output reaches the confirmed working-copy ID and actual returned
section code, with current scope and unsaved-work guards. It adds no alternate
editor, import route or signature ceremony.

Three findings from the authenticated saved-CSR browser flow were reproduced
and corrected:

- A table ending the stored HTML triggered StarterKit's trailing-node plugin
  during a metadata-only mount transaction. The editor reported unsaved work
  and cached a draft before anyone typed. Its baseline now comes from the
  stored parse before construction, with the initial metadata-only plugin
  update treated as hydration. A real content transaction, including one
  preceding the delayed create callback, remains dirty. No timer or buffer
  replacement is used to suppress dirty state. Earlier genuine device drafts
  remain explicitly restorable and account scoped.
- An unbound working copy with an explicit null module showed the program's
  IND filing tree as its own outline. Its saved sections now form the primary
  tree and the UI states that the copy is unbound. Bound documents retain the
  existing project filing tree and rule-pack basis.
- The deterministic `workflow_import` compositor was described as AI
  authorship. The canonical attribution summary now supplies its retained
  machine identity. Pure workflow buckets say imported content awaiting
  review; mixed buckets retain one truthful machine/import label and the
  server's existing count. Selection origins distinguish the compositor from
  original authorship. Source receipts retain machine, template and unknown
  origin facts. No lineage kind, count, acceptance or signing gate is changed
  by these labels.

The figure node view and read-only HTML renderer share the authenticated
resolver. Five red regressions showed that its page-lifetime blob cache could
bypass a new viewer's or revoked project's current authorization and leaked
object URLs. Every mounted view now requests current access, refuses bytes
arriving after a session change, and releases owned URLs on destruction,
including late completions. The read-only renderer states canonical transport
permission refusals accurately. Inline PNG/JPEG/GIF and governed reference
validation remain unchanged. This does not assert real-time revocation of
bytes already viewed by a currently mounted user.

Verification groups overlap and must not be added:

- Images and existing source-intake entry points: 77 tests in 7 files pass.
- Hydration, save integrity, account-owned cache and origin widgets: 39 tests
  in 6 files pass.
- Editor, deep links, unsaved navigation, plain text, protocol/CSR entry points:
  68 tests in 7 files pass.
- Final browser-finding regressions after complete AuthUser fixture correction:
  29 tests in 4 files pass.

Scoped lint reports zero errors. New figure and hydration tests have no
warnings. Existing large Workbench and RichSectionEditor warnings were not
baselined away. Red logs retain the stale figure reuse, false hydration dirty
state, incorrect filing tree and workflow compositor mislabeling failures.
Root owns final whole-tree types, production build, authenticated browser
screenshots and direct publication to `concept2cure-v2`.

An additional authenticated mobile browser pass found a native 401 image
request alongside the correct authenticated node view. TipTap's HTML helper
serialized an image in the active document before moving it into an inert
container; serialization alone could therefore trigger a native request with
no bearer header. Two additional red regressions reproduced live API image
nodes during both hydration and deliberate edit/save serialization. The
existing `roundTrip.ts` now provides the shared HTML serializer with an inert
document supplied directly to ProseMirror's DOM serializer. RichSectionEditor
uses it for both stored baselines and live saves. Stored figure references and
captions stay intact; authentication is unchanged. The final image, hydration,
save-integrity, plain-text and caption group passes 79 tests across 7 files.

The following browser pass identified one remaining native request from the
live schema renderer, independently of serialization. Installed TipTap React
clears the EditorView's direct `nodeViews` prop before detaching EditorContent.
That temporarily selected the plain schema image renderer. Two actual
ProseMirror regressions reproduce the operation and show its native API image
node, including after permission revocation. AuthoringImage now uses one
authenticated node-view factory for its direct renderer and a ProseMirror
plugin fallback, which remains active when the direct prop is cleared.
Stored HTML and image references are unchanged. The follow-up figure,
hydration, read-only and caption group passes 75 tests across 6 files; scoped
lint has no errors or warnings. Instrumented authenticated desktop reopening
of the saved QA figure reports zero live API source writes and five
authenticated Fetch image requests, with no native Image request.

The corresponding fresh mobile pass renders the saved QA figure at its real
240-pixel intrinsic width, reports no API failures or page errors, and stays
within the 390-pixel viewport. It also identifies a separate unresolved
provenance defect: the earlier figure-only human save retired both original
workflow-import machine spans and attributed unchanged imported prose to the
saver. No review adoption or signing event exists for that copy. Exact
read-only row evidence and observed labels are retained here; this is assigned
to the canonical backend lineage owner, not marked as correct by relaxing the
browser assertion or changing the UI label.
