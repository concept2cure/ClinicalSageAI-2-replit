# F1 repair — deliver a recent conversation selection to the existing conversation

Continuation of the shell's pending-work/handoff repair, under the open F1
package of `docs/design/ONE_DESIGN_PLAN.md`. It serves D1's existing sidebar and
palette conversation selection. No layout, new capability or plan change.

## What already exists

- `client/src/concept2cure/v2/Shell.tsx`: `openConversation` writes the existing
  `C2C_CONVO` channel. Rail and CmdK ask the shared leave guard before writing it.
  Their recent-conversation tests spy on navigation without mounting its target.
- `client/src/concept2cure/v2/V2App.tsx`: `nav` owns routing; `convoEpoch` already
  remounts the one conversation when a new question is handed to it. A selected
  saved conversation does not advance that identity, so a selection made while
  the conversation is open leaves the prior conversation mounted.
- `surfaces/ConversationThread.tsx`: reads the handoff/URL at mount, loads the
  selected history, preserves the shell chat's current answer, and refuses a
  different history while AnA is streaming. Those safeguards cannot run for a
  handoff which never reaches a mount.
- `routing.ts`: `conversationIdFromLocation` and `locationForConversation` own
  saved-conversation URL identity and validation. Reuse them.
- `navParams.ts`, `ceremony.ts`: pending-work/dialog/ceremony refusal owners;
  `shellAskGuard.test.tsx` mounts the real shell and conversation for seeded asks.
- `server/routes/chat/threads.ts`, the existing chat hook and chat stores own
  saved histories and project admission. No route, model, tool, store or API is
  needed for this repair. Existing project-mismatch refusal stays intact.

Search covered recent/saved conversation selection, shell routing, mount keys,
handoff, stream refusal, URL identity, thread routes and existing tests. The
shallow checkout was unshallowed before the deleted-history search:
`git log --all --diff-filter=D -- 'client/**/*Conversation*' 'client/**/*Shell*'
'client/**/*routing*' 'client/**/*navParams*'`. Earlier shells/chat trees were
deleted; this repair changes no owner or reachable capability.

## Bounded repair and acceptance

Use the existing conversation mount identity when an explicit saved-conversation
handoff selects another thread. Keep its canonical saved-thread URL. Selecting
the thread already named by the current URL must preserve the mounted composer
and its unsent text. A navigation naming the conversation in progress has no new
handoff and must preserve its running stream.

Keep the existing guard before the handoff, existing seed handling, failed-history
retry and stream refusal. A rejected selection must be consumed, with no delayed
replay; a fresh selection after the answer ends can load. Test the actual V2App,
Shell and ConversationThread boundary, not only the writer callback. Walk the
same path in the running app. No app, card, editor, canvas, panel, API mount,
service, table or dependency is added.

Independent review caught a refusal that came too late: remounting to invoke the
existing active-answer refusal preserved the stream but discarded a follow-up in
the local composer. Red SSE tests reproduce it for both entry points. Factor
that existing refusal into `routing.ts` and use it both at the shell boundary
(before remount/URL change) and on conversation arrival. `V2App` reads its own
chat's latest streaming state through a ref, and uses the existing `C2CToast`
for the same reason. No second guard registry or chat state is introduced.

The full typecheck also found that `ProjectHome.tsx`'s global `C2C_CONVO`
declaration is only `Record<string, string>`, while the existing conversation
reader/writers use a nullable seed. That file is held by D3. The F1 writer uses
the same precise nullable boundary type as the existing writer, preserving the
`{ id: 'current', seed: null }` runtime contract without touching the held file.
The before/after TypeScript erasure emits identical JavaScript.
