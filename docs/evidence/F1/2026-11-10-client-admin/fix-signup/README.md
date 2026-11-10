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

- **Red first**, on the page as it was (`red.log`): 6 of 7 tests fail. Typing "Avery" leaves "A"; tabbing to the next
  field leaves it empty; the second step leaves "N" of "Northgate Biologics"; no field is marked invalid; no focus
  ring; the switch is there.
- **Green**: `npx vitest run client/src/concept2cure/auth --maxWorkers=2`: 9 files, 64 tests pass.
- **Used in the running app** (the runtime role, RLS and the launch gate on), at 1440 and 390 px, typing one key at a
  time: "Avery", Tab, "Lind", Tab, the address. Each field holds all of it and focus is in the third field. An empty
  address is refused under its field, with the field marked invalid. The agreements step has no switch.
  `signup-1440-typed-by-keyboard.png`, `signup-1440-refusal-and-focus-ring.png`, `signup-390-typed-by-keyboard.png`,
  `signup-390-refusal-and-focus-ring.png`. Script: `walk.cjs.txt`.

## Still open on this page (not in this change)

- **The three acceptances are not sent or recorded** (W1-02), and the job title is required and then dropped (W1-04).
  Both need `server/routes/auth.ts`; they are the next change.
- **The privacy summary on the agreements step still describes an opt-in to "AI Learning"** that the product does not
  have. It is agreement text, so it is the founder's and the lawyer's to change (launch row D9). Recommended: remove
  the two "AI Learning" paragraphs, leaving "your content is not used for AI model improvement".
- The six verification-code boxes on sign-in have no accessible name (A11Y-03, `ZenLogin.tsx`).
