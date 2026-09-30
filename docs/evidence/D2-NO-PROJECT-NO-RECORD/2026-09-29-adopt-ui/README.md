# PF-07 (D2), the user's half: a conversation file reaches the open project's Data Room

**Founder decision PF-07 (2026-09-26):** every governed record belongs to a
project. A chat file attached with no project open stays a conversation file,
and one audited adopt brings it into a project.

## The gap

The server half landed in `824f699c`. A no-project upload records no source,
and `POST /api/c2c/projects/:id/adopt` brings a file in, once and audited.
Nothing in the client offered adoption, so a file attached before a project
was opened could reach no Data Room at all.

## The fix

- **`GET /api/c2c/projects/:id/conversation-files`** (`server/routes/c2c/projects.ts`).
  It lists the caller's own chat files that are in no project's Data Room.
  - Only the caller's: a colleague's chat attachment is theirs to bring in.
  - Only files whose bytes are no project's source yet: adopt is from no
    project.
  - The project must be a live one of the organization. A full page says so;
    the window is 50.
- **`ConversationFilesAdopt.tsx`**, mounted in ProjectHome's Data Room. It lists
  those files, each with "Add to this project", which calls the adopt route.
  - A success is said and recorded, and both lists reload.
  - A refusal says what the server said and changes nothing.
  - A failed read says so; nothing to offer renders nothing.

**Handed on, not edited:** the chat itself should say, when the upload response
carries `dataRoom: { recorded: false, reason }`, that the file is kept as a
conversation file and can be added from a project's Data Room. That is
`client/src/hooks/useChatUpload.ts`, which is claimed by the W1 lane
(`…01T2wooC`). See the board.

## Evidence

- **The LX-00 walk's `adopt` hop** runs the real routes on PGlite, with 2 new
  checks (5 green in all):
  - the project offers the caller's conversation file, and not a colleague's;
  - once adopted, the file is no longer offered.
- **`conversationFilesAdopt.test.tsx`**, 5/5:
  - lists and adopts, and the list reloads;
  - a refused adopt says the server's reason and changes nothing;
  - a failed read is not an empty list;
  - nothing to offer renders nothing;
  - ProjectHome mounts it.
- **`01-red.txt`:**
  - with the route's user filter removed, the walk fails;
  - with its already-in-a-project filter removed, the walk fails;
  - with the control unmounted, the mount case fails.
- All 11 ProjectHome and records suites pass (60 tests). `tsc` reports 0
  errors, the ratchet is unchanged, and `ci:undefined-css-classes` passes.
