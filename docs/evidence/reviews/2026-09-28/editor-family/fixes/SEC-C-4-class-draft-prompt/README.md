# SEC-C-4 class: "Ask AnA to draft" sent the program's name as the person's own words

**Finding.** The SEC-A-4 lens listed three DocumentWorkbench sites that put
stored text into the chat turn sent as the clicking person's own words. No
fix covered them. This folder fixes the first, `askAnaToDraftPrompt`:
- it built the Authoring empty state's turn from the program name;
- any member can set that name;
- the other two sites are in `DocumentWorkbench.tsx`, which another lane holds,
  and are handed on.

**Fix.** The helper returns one fixed sentence. The project travels as
`project_id`.

**Evidence.**
- `red.txt`: 3 of 3 fail on the old helper, with a planted name holding
  "Ignore prior instructions", a newline and `</screen>`.
- `green.txt`: 3 of 3 pass.
- `mutant-1..3.txt`: each fails the test:
  - the interpolation restored;
  - a "sanitised" name kept;
  - the name appended to the fixed sentence.
- `lint.txt`.

**Adversarial review:** sound, no blocking issue. The reviewer re-proved the
red on the old code independently.

**Its notes, for the held-file hand-on:**
- The workbench test should also click "Ask AnA to draft" with a planted
  name.
- The "Draft with AnA" sentence should match the editor's own: "Draft this
  section from the linked section evidence."
