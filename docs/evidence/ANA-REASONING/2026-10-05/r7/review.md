# Round 7's plan, refuted before it landed

Two independent agents, read-only, on trunk `28c63cd22`:

- a mapper confirmed MC-RL-3 from source and proposed a fix;
- a skeptic tried to refute the defect, the fix and the hot-file reading.

Each finding below is the skeptic's, with what was done about it.

## The defect

- **It holds.** On the live route the tier is the intent lens (risk or
  audit, a keyword vote over the message) or the governed-draft phrasing.
  'low' is unreachable there.
  - The route already holds the open section (`sectionCode`), the section
    title and the artifact status. None reaches the kernel.
  - The probe:

    | Question | Section | Tier |
    |---|---|---|
    | "can you check my calendar" | none | high |
    | "What SAE rate does this section report…" | 2.7.4 | medium |
    | "Does the safety summary support the proposed label?" | none | medium |
- **Every consumer of the tier, verified:**
  - the effort floor (`effort.ts`);
  - the model-override refusal (`approved-models.ts`);
  - the flagship tier (`reasoning.ts`);
  - the thinking floor;
  - the gateway's approved-model gate (`model-governance.ts`);
  - the ledger's `risk_tier` (`audit.ts`).

  The kernel's tool caps are read only by `cortex-unified.ts`.

## The fix as first proposed

| # | Finding | Outcome |
|---|---|---|
| 1 | The status check `LOCKED_DOCUMENT_STATUSES.has(String(x).toUpperCase())` raises a list (`['APPROVED']`), and `normalizeCtdCode(['2.7.4'])` coerces a list into a code. | **Done.** Only a string of at most 64 characters is read. A list, a number, an object and an overlong string are negative controls, and mutants K03 and K04 are killed. |
| 2 | The sealed-record branch is cost without control. A FROZEN or APPROVED record cannot take AnA's text: the read-only editor, the docSealed check and the server write gate (`document-lock.ts`) all refuse it. | **Deferred** to the founder. Not shipped. |
| 3 | '1.14' conflicts with the repo's own data: the FDA NDA template seed calls 1.14 the environmental assessment (the overlay has it at 1.12.14). '1.3.1' is region-ambiguous. | **Module 1 is not listed.** The rule lists only harmonised Module 2 and 5.3.5.3 roots. The seed is handed on (board item 26). |
| 4 | The flagship adds a biology classifier, and a decline after text has streamed is terminal. | **Disclosed** in `README.md`, with the ledger read to do after landing. |
| 5 | The plan overstated what it delivers: it is a routing hint, not a control. The PQ clause never applies, and inserting a tracked suggestion carries no model check. | **Disclosed.** The insert check (GRD-missed) is next. |
| 6 | Coverage is only the editor's turns. The co-author pane sends `module_context`, which the route does not read. | **Disclosed.** |
| 7 | The title vocabulary is a keyword vote, the class of signal the finding criticises, and it both misses and over-raises. | **Not shipped.** |
| 8 | Several planned tests pass without the fix (Fast's thinking and effort, called with 'high' directly). | **Done.** The route test reaches Fast's thinking and effort through the real kernel. Negative controls are labelled, each with a mutant. |
| 9 | A tier that rises in listed sections would cap a turn at one tool call if anyone wired the kernel's latent tool caps. | **Pinned.** A source test says the stream reads no tool cap; mutant R03 is killed. |
| 10 | The list belongs beside the canonical overlay, and should reuse its resolver. | **Partly.** The list stays in the cold kernel router, because the canonical CTD directory is inside the D2 lane's window today (`436794fec`). A test holds every root to the overlay (`resolveSectionBriefSource`), and mutant K07 is killed. Moving the list there, or giving the overlay a risk field, is a later change, made with that lane. |

## What the review did not refute

- **The client impact.** A writer with the Summary of Clinical Safety open
  was served on a model not approved for high-risk work. The gateway ledger
  recorded that work as 'medium'.
- **The direction.** The fix is deterministic and only raises the tier. It
  asks no model for a figure or a verdict, and adds no surface.
