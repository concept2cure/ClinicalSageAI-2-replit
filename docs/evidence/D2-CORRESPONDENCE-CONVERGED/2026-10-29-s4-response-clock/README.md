# P-39 step 3, S4: the response clock runs on the project inbox's letters

Row: D2 (W1). This is slice S4 of `docs/design/CORRESPONDENCE_CONVERGENCE_2026-10-29.md`. Its "What already exists"
section maps the clock and the inbox.

## Before

- **The clock** (`server/services/regulatory-correspondence/response-clock.ts`) ran only on `c2c_correspondence`, the
  duplicate store. It applies the agency's stated date, the class's codified window with its citation, and "owed,
  undated".
  - Its one consumer was the MDX proactive signal, which no client reads.
- **The inbox**, which holds the letters people work, recorded only:
  - the agency's free-text wording (`communication_type`);
  - a due date a person typed.
- So no letter people worked was on the clock. A refuse-to-file letter with no stated date showed no due date at all,
  although 21 CFR 314.101(a)(3) gives it 30 days.

## What changed

- **Storage.**
  - `migrations/20261029j_agency_letter_class.sql` adds `concept2cure_agency_communications.letter_class TEXT`, nullable
    and additive. It is replayed on every deploy and registered before the sweep.
  - The vocabulary is `AGENCY_LETTER_CLASSES`, held by the create route's schema. A CHECK would need a conditional
    replacement for each new class (RULE 1).
- **Labels.** `AGENCY_LETTER_CLASS_LABEL` (`shared/regulatory/agency-interaction.ts`) names each class, for the form
  and the card.
- **The create** (`POST …/agency-communications`) takes an optional `letterClass` and refuses a class outside the
  vocabulary.
- **The list** returns each letter's `responseClock`.
  - `inboxResponseClock` runs the one clock on the letter's class, receipt, stated due date and closure, and on its
    linked submission's application type.
  - A letter with no class is on no clock, never on a guessed one.
- **The client.**
  - Communication's Log communication form gains "Letter class (optional)".
  - The inbox card's due line is `clockLine`:
    - the agency's date as it stands;
    - or a derived date, with "30 days from receipt (21 CFR 314.101(a)(3))";
    - or "response owed; the letter states no date and none is codified for its class";
    - or, with no clock, the typed date as before.

## Proof

- **`server/routes/c2c/__tests__/communication-advance.pglite.test.ts`**, "the response clock on an inbox letter". It
  runs on the deploy DDL, with the migration replayed.
  - A refuse-to-file letter received ten days ago shows a derived date: 30 days, `21 CFR 314.101(a)(3)`, 19 whole days
    remaining by the clock's floor rule.
  - An information request with a stated date of 2099-01-15 keeps the agency's date.
  - A letter with no class is untracked.
  - An unknown class is refused with a 400.
- **`client/src/concept2cure/v2/__tests__/agencyInboxClockLine.test.ts`:** the four lines.
- **Mutation:** feeding the clock the free-text `communication_type` instead of the class fails the derived-date
  case. Restoring the class read makes it pass.
- **Passing:**
  - `communication-center.test.ts`;
  - `agencyInboxDueDays`, `communicationOpensLetter`, `communicationCommitmentsDoors`,
    `communicationDraftCarriesLetter` and `communicationLogLinksLetter`;
  - `ci:migration-set-order`;
  - `tsc --noEmit`: no error.

## The overdue verdict follows the clock (same day, second commit)

- **`responseDueDate(letter)`** (`response-logic.ts`) is when a response is due:
  - the agency's stated date;
  - else the date the clock derives from the letter's class and receipt;
  - else none.
- **`letterOverdue` judges by it.** So the letter's questions view (`GET …/questions`, which now also returns
  `responseDueDate`) and CMC / Module 3's counts (`module-view.ts`) call a refuse-to-file letter with no stated date
  overdue 30 days after receipt, and both say so with the same verdict.
- **The letter readers** (`readLetter`, `readProjectLetters`) carry `letter_class`.
- **Proof.**
  - `server/services/agency-responses/__tests__/module-view.test.ts`: a refuse-to-file letter received 2026-09-01 is
    due 2026-10-01 and is overdue on 2026-10-19; one received 2026-10-01 is not; the agency's own date of 2026-12-01
    wins; and a letter with no class has no derived date.
  - Mutation: judging by the typed date alone fails the case.
- **Test setups that build the inbox table without the new column.** S4's create writes `letter_class` and this
  change's readers select it, so two setups failed until it was added. Both are updated:
  - `c2c-audit-outcomes.pglite.test.ts` now applies `20261029j`;
  - `_agency-response-authoring-fixture.ts` gains the column.
  - The first was red on trunk after S4's commit. The pre-push gates do not run it.
