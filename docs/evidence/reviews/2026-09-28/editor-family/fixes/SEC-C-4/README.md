# SEC-C-4: three protocol AnA buttons sent stored names as the person's own words

Periodic review 2026-09-28, editor family, security lens (high, per its
verifier).

"Ask AnA", "Draft with AnA" and the empty state's ask built the chat turn
from stored text: the protocol number, a section title from an organisation
template, the programme name. The turn was sent as the clicking person's
own request, so an instruction planted in any of them went around the fence
the server puts on screen context.

- Each button now sends a fixed sentence that names no stored value.
- The fenced surface context now names what those sentences point at: the
  section open on screen (it carried the server's default section, not the
  one shown) and, in the empty state, the programme.
- askForSource in RichSectionEditor.tsx (the selected text) is not in this
  change: no fenced channel for a selection exists yet.

Failing first: protocolDevAskAnA.test.tsx (7 cases, planted instructions as
the stored values), plus two existing assertions that required the stored
name in the prompt and now require its absence.
- Before: 7 failed; 2 guards passed.
- After: 59 of 59 across 7 suites.
- Six mutants, each caught.

Files: red.txt (before the fix), green.txt (after), mutants.txt.

## Not done here
- `askForSource` in `RichSectionEditor.tsx` still sends ``Suggest a source for this claim: "${selection}"``. It needs a fenced channel for the selection: an optional `onAsk(prompt, { selection })` carried as `module_context.facts.selectedText`, or a dedicated `selection` field inside the surface block's fence.
- Defence in depth: `PROMPT_INJECTION_ENCAPSULATE` on by default in production (server/infra).
