# A-B-2, A-B-3: a click on commented text opened nothing, and two markers claimed to be links

**Findings:** periodic review 2026-09-28, editor family, accessibility lens.
Both were verified, and each verifier found more than the lens had
(`../../verification.md`, A-B block).

- **A-B-2.** The lens reported that there was no keyboard route from a comment
  anchor to its thread. Its verifier found the pointer route dead as well, for
  everyone.
  - RichSectionEditor's contract says "A click on annotated text — open the
    thread in the host's rail", and the anchor has `cursor: pointer`.
  - The plugin listened on `handleClickOn` and read the marks of the node it
    was handed. For a click on text, ProseMirror hands that hook the enclosing
    paragraph, because a mark is not a node in the view tree, and a paragraph
    carries no inline marks.
  - Only a click on an inline node inside the range (a cross-reference or a
    citation) worked.
  - The verifier graded the dead pointer path medium, and the keyboard gap
    low, since the rail's "Show in text" button is a working keyboard route.
- **A-B-3 (low).** Citation and cross-reference markers carried
  `role="link"` with no href, no focus and nothing to activate. Their own code
  comment says a click places the caret. A screen reader listed them as links
  that do nothing.

## The change

- `commentAnchor.ts` keeps `handleClickOn`, which serves inline nodes, and adds
  `handleClick`, which reads the comment mark at the clicked position.
- `crossReferenceNode.ts` and `citationNode.ts` drop the `role` attribute. The
  marker's text still reads inline.

The verifier's suggested keyboard chord is not added. The rail's "Show in
text" already gives keyboard users the route. Enter, which the lens proposed,
splits paragraphs.

## Shown failing first

`client/src/concept2cure/v2/editor/__tests__/anchorClickAndMarkerRoles.test.ts`.
It uses a headless TipTap editor with the real extensions, and dispatches the
click as prosemirror-view's `handleSingleClick` does, since jsdom has no
layout.
- `red-vitest.txt`: with the three source files at HEAD, 2 of 5 fail: the
  text click and the link roles. The inline-node click passes before and
  after, which is the verifier's finding.
- `green-vitest.txt`: the 22 test files that import these modules or the
  editor pass, 205 tests.
- `mutants.txt`: four mutants, each caught.
  - No `handleClick`.
  - No `handleClickOn`.
  - Either link role back.
