# F1: the agency inbox's "Draft response with AnA" is a quiet button

**Package:** F1 (repair). **Completes:** `client/src/concept2cure/v2/surfaces/AgencyInbox.tsx`.
**Found by:** the D3-4 session's acceptance walk (`docs/evidence/DESIGN/D3/D3-4/README.md`, "Found, not D3's"): D3 §6
item 3 allows one orange on the project page, the composer's send, and Respond showed a filled orange draft button.
**Read at:** `59dc4f9f58`, 2026-11-10. `AgencyInbox.tsx` is held by no session in COORDINATION.

## What already exists

`AgencyInboxList` / `AgencyInboxCard` (`surfaces/AgencyInbox.tsx`) is one component, used by Communication
(`CommunicationCenter.tsx:696`), the HAQ manager (`HaqManager.tsx:97`) and the project's Respond step
(`ProjectRespond.tsx:166`). Each open letter that needs a response carried `className="cc-btn sm primary"`, a filled
orange button on every row. Plan §2: one primary action per view, and orange for the send button, the spark, focus
and that one action.

## Change

The button is `cc-btn sm`, the same quiet button as "Questions & responses" and "Triage" beside it. Its label,
handler (`draftResponseWithAna`: the letter is pinned for the turn) and condition are unchanged. Nothing else moved.

## Evidence

- `red.txt`: the new case in `communicationDraftCarriesLetter.test.tsx` ("each letter's draft button is quiet") fails
  on trunk: `expected 'cc-btn sm primary' not to match /\bprimary\b/`.
- `green.txt`: after the change, 7 files and 42 tests over the list's hosts pass. They include Communication's draft
  and letter tests and the project's `projectRespondStage`.
- `walk.cjs`, `walk.json`, `respond-1440.png`, `communication-1440.png`: the running app. One letter was logged on the
  local walk project through the inbox's own POST. On Respond the only filled orange button is the composer's send
  ("Start the conversation"). On Communication it is the header's "Log communication". The draft button is
  `cc-btn sm` with the page's background.
- Typecheck 0 errors. ESLint on `AgencyInbox.tsx`: the same two warnings as trunk (`AgencyInboxCard`'s length and
  complexity, which predate this change). `ci:undefined-css-classes`, `ci:one-product`, `ci:fixture-fallback` and
  `ci:one-design-plan` pass.
