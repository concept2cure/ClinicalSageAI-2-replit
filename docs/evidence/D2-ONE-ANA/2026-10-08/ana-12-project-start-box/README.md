# ana-12 — Project home starts a conversation; it is not one

Launch row **D2** (one AnA). Design: `docs/design/ONE_ANA_ONE_CANVAS.md` §2.3.

## What was wrong

The real-browser capture of 2026-10-08 (`../ana-9-rail-goes/screens/`, shots 11
and 12, finding 5) found Project home's Author stage still drawing a chat panel
of its own:

- a header, "AnA · co-author", with "Open full thread";
- a message in AnA's voice, "I'm your co-author on <project>, bound to this
  project's governed dossier…", that no model wrote and nothing stored;
- a composer, "Message AnA about this project", which measured 157×42 px inside
  a panel about 1180 px wide.

With the shell conversation as the one place AnA talks, the panel was a second
AnA on the screen, and its opening line was made up.

## What it is now

`StartConversation` in `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`:
a heading, "Start a conversation in <project>", one line saying what AnA works
with, and the composer. It has no bubbles, no header chrome and no second thread
link. Typed text starts a new conversation in the project. The hand-off is the
same as before (`window.C2C_CONVO = { id: 'new', seed }`, then
`conversation-thread`). An empty box starts nothing; the button is disabled and
Enter does nothing.

The chat chrome's CSS (`.pj-convo-h/-mark/-id/-t/-ctx/-open/-scroll/-activity/-act*`,
`.pj-msg*` and the `pjtype` keyframes) had no other user and is removed. The
generated text ramp was regenerated.

## Proof

- `red/vitest.txt`: `projectHomeStartBox.test.tsx` run against the previous
  `ProjectHome.tsx`. All 3 fail. The first fails on the claim itself: "a message
  bubble nobody sent: expected <div class="pj-msg ana">… to be null".
- `green/vitest.txt`: the same test passes on the change, alongside
  `projectHomeConversations.test.tsx` (the start box still precedes the
  workspace grid) and `projectHomeLaunchScope.test.tsx`. 11/11.
- Gates: `ci:undefined-css-classes` OK; `ci:surface-text-ramp` OK; ESLint
  warnings on `ProjectHome.tsx` unchanged (10 lines before and after).

## Not yet shown

Why the old composer measured 157 px. In the screenshot its header and composer
are both shrink-wrapped and centred, which no rule in the v2 stylesheets
explains by reading. The new box sets `display:block; width:100%; min-width:0;
box-sizing:border-box` on the textarea. Whether it fills the column is checked
in the next real-browser capture. Until then, the width is not claimed fixed.
