# Sign-up can be typed into again (F1, 2026-11-10)

Found by the client administration walk on 2026-11-10 (`../walk-onboarding-and-people.md`, W1-01, W1-03) and by its
accessibility audit (A11Y-01, A11Y-02). Sign-up is the first screen a new client uses.

## What already exists

- `client/src/concept2cure/auth/ZenSignup.tsx`: the four-step sign-up page. This change finishes it; it adds no screen.
- `client/src/concept2cure/auth/__tests__/signupPasswordRefusal.test.tsx`: the page's existing test. It sets each
  field's value in one event, as a paste does, so it never saw the fault.

## What was wrong

1. **Typing lost focus after every key.** The text field and the select were components declared inside the page
   component. Each key press changed the page's state, which made new component types, so React remounted the field
   and focus fell to the page. Typing "Avery" left "A". Pasting and a password manager's autofill worked, which is why
   earlier walks missed it.
2. **Focus was hard to see, and a refusal was not tied to its field.** The outline was removed and replaced by a faint
   change of border colour. A refused field carried no `aria-invalid` and did not name its message.
3. **"AI Model Improvement" was a switch connected to nothing.** Its value was never sent or stored, and Settings has
   no such control, although the switch said "you can change this anytime in Settings".

## What changed

- The two fields are now `client/src/concept2cure/auth/SignupFields.tsx`, split out of the page into the same folder
  and declared at module level. They take their value, refusal and change from the page.
- A field shows a focus ring. A refused field is marked invalid and names the element that holds its message.
- Each field states what it is for the browser's autofill (`autoComplete`).
- The switch is removed.

## Proof

- **Red first**, on the page as it was (`red.txt`): 6 of 7 tests fail. Typing "Avery" leaves "A"; tabbing to the next
  field leaves it empty; the second step leaves "N" of "Northgate Biologics"; no field is marked invalid; no focus
  ring; the switch is there.
- **Green**: `npx vitest run client/src/concept2cure/auth --maxWorkers=2`: 9 files, 64 tests pass.
- **Used in the running app** (the runtime role, RLS and the launch gate on), at 1440 and 390 px, typing one key at a
  time: "Avery", Tab, "Lind", Tab, the address. Each field holds all of it and focus is in the third field. An empty
  address is refused under its field, with the field marked invalid. The agreements step has no switch.
  `signup-1440-typed-by-keyboard.png`, `signup-1440-refusal-and-focus-ring.png`, `signup-390-typed-by-keyboard.png`,
  `signup-390-refusal-and-focus-ring.png`. Script: `walk.cjs.txt`.

## Second change: what the person agreed to, and their job title, are kept (W1-02, W1-04)

### What already exists

- `server/routes/auth.ts`: `POST /api/auth/signup` and its `signupSchema`. It creates the organisation, the account and
  the membership, and records one `user_signup` audit event.
- `server/services/audit/auth-event-audit.ts`: `recordAuthEvent`, which writes that event into the new organisation's
  own audit chain.
- `users.title`: the column for a person's job title. Sign-up never filled it.
- `server/services/licensing/eula-service.ts` (`license_acceptances`): a fuller acceptance store. Nothing calls it and
  its tables are on no applier, so reaching it is a founder decision (a table on the applier). It is not used here.

### What was wrong

The last step makes a person scroll through the Terms of Service and the Privacy Policy and tick three boxes before
"Create account" is enabled. The request carried none of it, and the audit row held none of it. So nothing recorded
that anyone had agreed to anything. The first step refused to continue without a job title, and then dropped it.

### What changed

- The page sends the three acceptances, the revision of the agreement text it showed
  (`SIGNUP_AGREEMENTS_REVISION`, `2026-11-10`) and the job title.
- The server keeps the job title on the account (`users.title`).
- The server records the acceptance on the sign-up's audit event, in the new organisation's chain: which agreements,
  which revision, and a sentence a reader of the audit trail can understand.
- An acceptance is recorded whole or the sign-up is refused (400): each of the three must be true, the revision must
  be named, and no other key is admitted.
- A request that sends no acceptance (a script, a test) still creates the account, and its audit row says "No
  acceptance of the agreements was sent with this sign-up". Nothing is invented for it.
- The revision is pinned to the text: `signupAgreements.test.tsx` holds the digest of the two documents and the three
  acceptance sentences for each revision. Changing a word without a new revision fails that test.

### Proof

- **Red first** (`red-agreements.txt`): 14 tests fail before the change. (Ten of them failed on the sign-up limiter's
  429 in that first run, because every case came from one address. Each case now comes from its own address, so the
  limiter stays real and the refusals are the schema's.)
- **Green**: the three test files and the auth folder: 12 files, 107 tests pass.
- **Mutations** (`mutations.txt`): 13 single changes, each caught, each restored and its file's digest checked. Among
  them: the audit event loses the acceptance; a false acceptance is admitted; an unknown key is admitted; the revision
  is optional; the job title is not stored; a sign-up with no acceptance is recorded as if it had one; a word of the
  agreement text changes with no new revision.
- **Used in the running app**: a whole sign-up through the page on a second instance of the app (same database,
  runtime role, RLS and the launch gate on, mail to a local sink), typed one key at a time (`signup-full.cjs.txt`).
  The request carried the acceptances and the job title, the server answered 201, and the page said "Check your
  e-mail" (`signup-1440-agreements-accepted.png`, `signup-1440-after-create.png`). Read back from the database
  (`audit-row.txt`): `users.title` is "Head of Regulatory Affairs", and the organisation's audit chain holds, at
  `chain_seq` 201, "Signed up: the account waits on its e-mail confirmation link. Accepted the Terms of Service, the
  Privacy Policy and the regulatory acknowledgement (agreements revision 2026-11-10)".

### Decided here, and what it leaves open

- **The record lives on the sign-up's audit event**, not in a new table. It is in the organisation's own tamper-evident
  chain, it is exported with the organisation's data, and it needed no schema change.
- **A sign-up sent without the page is not refused.** Twenty-odd tests and scripts create organisations through this
  route and send no acceptance. Refusing them on a deployment is the right end state. It needs each caller changed and
  the database tests run, and it is the next step for whoever holds this route.
- **The plan chosen on step three is still not sent for the free plan**, and "Country" is free text mapped to a market
  (an unknown country becomes US). Both are W1-04's remainder.

## Still open on this page

- **The privacy summary on the agreements step still describes an opt-in to "AI Learning"** that the product does not
  have. It is agreement text, so it is the founder's and the lawyer's to change (launch row D9). Recommended: remove
  the two "AI Learning" paragraphs, leaving "your content is not used for AI model improvement". The change needs a
  new revision and its digest (see above).
- A sign-up sent without the page is not yet refused on a deployment (see "Decided here").
- The six verification-code boxes on sign-in have no accessible name (A11Y-03, `ZenLogin.tsx`).
