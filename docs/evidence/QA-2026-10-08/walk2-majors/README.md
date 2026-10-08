# QA 2026-10-08, walk 2: majors j3, j5 and j9

Findings: the walk-2 findings files for j3 (Vault review), j5 (AnA path) and
j9 (admin and onboarding). This folder holds the red and green test runs, the
browser measurements, and the scripts that produced them. No passwords, tokens
or setup links are stored here. The QA accounts used are the ones the walk
used: david.kim, raj.patel and emily.watson in org 1, and the walk's throwaway
viewer in org 60. In the browser text, one member's personal address is
replaced with `[second admin address]`.

## j3 (a): Sign review offered to someone who cannot sign

**Cause.** `VersionLifecycleActions` decided who could act from the client's
role list (`rolesCannotAuthor`). A manager, and a member, can author, so the
client offered "Sign review". The lifecycle route then refused after the
password, with 403 under §11.10(g).

**Fix.** `GET /api/c2c/project-vault/:id/documents/:documentId/versions` now
returns `signing: { canSign, signers }`
(`server/services/vault/vault-signing-posture.ts`):

- `canSign` comes from `checkSigningAuthority`, the same check the Gateway
  uses for `meta.signing.canSign`. It is null when the lookup fails, and then
  the server decides.
- `signers` lists the members whose role passes `isSigningAuthorized`. When
  two members share a printed name, their addresses tell them apart.

When `canSign === false`, the Vault disables Sign review and Approve and
explains why. On every version in review, the Vault also names who can sign
it: the signers minus the uploader and the sender, and minus the reviewer for
the approval step. If that leaves nobody, it says so plainly.

**Red → green.**

- `client/src/concept2cure/v2/__tests__/vaultSigningPosture.test.tsx`:
  `j3/red-j3a-client.txt` shows 2 of 3 failing on HEAD. The test now passes.
- `server/services/vault/__tests__/vault-signing-posture.test.ts`:
  `j3/red-j3a-server.txt` shows the module missing. All 4 tests now pass.

**Browser.** `j3/browser-after-5091.txt` comes from an app instance on :5091
running this tree against the QA database. As david.kim (member), Sign review
is disabled with the reason. As raj.patel (approver), it is enabled.

## j3 (b): a version in review is in nobody's queue

**Cause.** "Send for review" on a Vault version starts its canonical lifecycle
record at `in_review` and assigns nobody. The Review & approval board
(`GET /api/review/board`) read only the Authoring review store, so it never
listed a Vault version in review. That is why it was missing from raj's queue
and from "All open". The "Your work" tray reads tasks, and no task is created
either.

**Fix.** The board now also returns `vaultReviews`
(`server/services/review/vault-review-queue.ts`). These are this
organization's `canonical_documents` at `in_review` with a Vault source,
filtered by program, each with:

- its step: review, or approval;
- who sent it;
- who can take the step, by name.

The scopes work like the Authoring rows:

- "Awaiting my review" shows the versions where the reader is an eligible
  signer.
- "Requested by me" shows the versions the reader sent.

The surface (`ReviewVaultQueue.tsx`) lists them above the Authoring queue. It
no longer says "Nothing is in review" while they exist. A failed read is
reported as such, never shown as an empty list.

**Red → green.**

- `client/src/concept2cure/v2/__tests__/reviewVaultQueue.test.tsx`:
  `j3/red-j3b-client.txt` shows 3 of 3 failing. All 3 now pass.
- `server/services/review/__tests__/vault-review-queue.test.ts`:
  `j3/red-j3b-server.txt` shows the module missing. All 4 tests now pass.

**Browser.** In `j3/browser-after-5091.txt`, raj's "Awaiting my review"
contains the version. David's does not, because he cannot sign; he sees it
under "All open" with the names of the people who can.

## j5 (a): the Progress card covered the answer

**Cause.** In the editor's AnA pane the work card took its full height above
the conversation. The conversation was pinned to its own bottom, so after a
turn only the suggestion chips were visible.

**Fix.** The work card (`ed-ana-work`) is capped at 38% of the pane and
scrolls on its own. When a turn ends, the conversation scrolls to the start of
the newest answer. Only the pane scrolls: `scrollIntoView` also moved the page
under the app bar, so it is not used.

**Red → green.** In `authoringAnaPane.test.tsx`, see `j5/red-j5ac.txt`.

**Browser.** `j5/anapane-after.txt` and `.png` show the answer visible, the
page not scrolled, and the header at y=48.

## j5 (b): raw `action_ready` in replies

**Where it leaks.** AnA's tool returns `status: 'action_ready'` to the model
(`AnaToolExecutor.ts`, `act_on_screen`). In the walk, the scripted stand-in
model wrote that status into its answer ("Vault search result:
action_ready."). A real model that echoes a tool result does the same.
`server/routes/ana-ri/stream.ts` streams the model's text unchanged, and the
text is stored unchanged. stream.ts was not edited.

**Fix.** A known tool status code is now rendered in words, in one place:
`client/src/concept2cure/v2/anaReplyText.ts` (`readableReplyText`). Two
renderers call it:

- `AnaMarkdown`, the one renderer for answers in the thread, the editor pane
  and eCTD co-author;
- the "AnA's reply is in the conversation" strip (`LiveDriveOverlay`).

Unknown snake_case words are left alone.

**Red → green.** `anaReplyText.test.tsx`: `j5/red-j5b.txt` shows both
renderers failing. All 3 tests now pass.

## j5 (c): toolbar controls off-screen

**Cause.** All 23 header controls were in one `nowrap` scroller,
`.ed-doc-actions`. At 1440×900, Save, E-sign and Place into filing sat at
x 2362–3269 inside a box that ended at 1076. At 390×844, the editor kept its
220px outline column, which left a page column 114px wide.

**Fix.**

- The governed acts are now their own group, `.ed-doc-commit`, which wraps
  and is never clipped: reason for change, Save, Lock/Freeze/E-sign, and Place
  into filing.
- Above 760px the header wraps, so every control is on screen.
- At phone width the tools row stays a scroller, as decided and measured
  earlier, but the governed acts sit above it.
- At phone width the editor is one column wherever it is mounted, not only
  inside the canvas.

**Red → green.** In `authoringAnaPane.test.tsx`: "Save is in the commit
group, outside the panel scroller".

**Browser.**

- `j5/toolbar-before.txt` and `toolbar-after.txt` show where each control is.
- At 1440, every control is visible. The header is 229px tall with the AnA
  pane open; this is the cost.
- At 390, Save, Freeze, E-sign and Place into filing are visible, and the
  tools row scrolls.

## j9: the 15-minute idle sign-out did not happen

**Why it did not fire in the walk.** The QA server log shows a Vite full page
reload at 13:15:48: `[vite] (client) page reload src/concept2cure/v2/__tests__/turnSummary.test.tsx`.
The walk sat idle from 13:06:39 to 13:23:39.

The client guard (`IdleSessionGuard` and `startIdleWatch`) kept its clock in
memory and started it at mount. The reload therefore restarted the 15 minutes
at 13:15:48, so sign-out would have come at 13:30:48. The reload's burst of
API requests was also recorded on the server as session activity.

Any reload has the same effect in production: an F5, or a reload after a
deploy. `j9/idle-4min-no-activity-events.txt` rules out stray activity: in an
idle page, no pointer, key, wheel or scroll events fire. A fake-clock run in
the scratchpad also showed the guard warning at 14 minutes and signing out at
15 when no reload happens.

`j9/real-time-before-fix.txt` reproduces the walk. Dev reloads at 8.4, 11.2,
12.2 and 15.4 minutes, and the page is still signed in at 17.1 minutes.

**Fix.** The person's last activity is kept per session in `localStorage`,
keyed by the server's session id (`SessionPolicy.sessionId`, taken from
`GET /session`), in `idleSession.ts` and `IdleSessionGuard.tsx`:

- A mount continues the session's clock.
- Activity in one tab of the session counts in every tab.
- An earlier session's clock is never applied to a new sign-in.
- "Stay signed in" records the activity.

**Red → green.** `IdleSessionGuardReload.test.tsx`: `j9/red-j9.txt` shows 3 of
4 failing, and all 4 now pass. The existing guard tests and the authService
tests also pass. Two `toEqual` expectations on the session policy now include
`sessionId`.

**Real time, after the fix.**

- `j9/real-time-after-fix-reload-at-9min.txt`: fresh sign-in, a dev reload at
  4.9 minutes and an explicit `page.reload()` at 9.0 minutes. The warning
  appears at 14.0 minutes, `POST /logout` runs at 14.93, and the sign-in page
  says "You were signed out after a period of inactivity." Screenshots: the
  two PNGs.
- `j9/real-time-after-fix-continued-session.txt`: a new browser context on the
  same session continued its stored clock and signed out at 8.5 minutes, 15
  minutes after that session's last activity.

**Residual, not changed.** The server counts every authenticated request as
activity (`session-inactivity.ts`), including the requests a reload makes. In
a browser, the client guard now ends the session and `POST /logout` revokes
it. A page whose JavaScript is not running makes no requests, so the server
clock ends it. Having the server measure the person, for example through a
header that carries the client's idle time, would need every one of the 22
client call sites that set `Authorization` to send the header. That was left
for a decision.
