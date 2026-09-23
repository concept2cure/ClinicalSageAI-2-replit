# IRB submission — wiring a capability this repository already has

**Status:** binding design, 2026-09-22. **Decided by:** the founder, in two
instructions: *"the protocol development solution needs to follow all
guidelines and have the ability to submit to the IRB"* and, on the routing
question, *"submitted protocols would go through our unified submission
center."*

## The finding that reshapes this work

A read-only survey on 2026-09-22 found that **an IRB capability already exists
in this repository and is unreachable.** Nobody needs to build it. It needs to
be wired, completed and made honest.

What exists, and is good:

| Piece | Where | State |
|---|---|---|
| Six tables — submissions, sites, consent documents, reviews, amendments, reportable events | `migrations/20260610_irb_submissions.sql` | written, CHECK-constrained, grounded in 45 CFR 46 / 21 CFR 56 / ICH E6(R2) |
| Drizzle mirror | `shared/schema/irb.ts` | 208 lines |
| Service layer | `server/services/irb/irb-service.ts` | every mutation inside `BEGIN → setTenantContextTx → recordGovernedAction(domain:'irb') → COMMIT` |
| Deterministic engines | `server/services/irb/irb-logic.ts` | `recommendReviewType`, `evaluateIrbCompleteness`, `continuingReviewStatus` |
| Nine routes | `server/routes/irb.ts`, mounted at `register-inline-routes.ts:418` | reachable by HTTP |
| Consent element set and completeness | `server/services/protocol-consent/*`, `/api/protocol-consent` | 21 CFR 50.25 / 45 CFR 46.116 elements, 6 routes, AnA tools |
| Committee governance | `migrations/20260619_research_committees.sql` | members, meetings, quorum, agenda items, per-member votes |

**Two facts make all of it dead.**

1. **No client code calls any of it.** Zero references to `/api/irb` or
   `/api/protocol-consent` anywhere under `client/`. A capability nobody can
   reach is a capability the product does not have.
2. **The migration is not in `C2C_MIGRATION_FILES`.** Under Rule 1 that means
   the tables **never reach a deployed database**. They exist on this laptop
   only because an overlay created them. On production there is no IRB.

This is the same failure the editor suffered five times and that `CLAUDE.md`
now has a rule about. It is recorded here so the next session finds it.

## Decisions

**D1 — One Submission Center.** An IRB submission is a submission, registered
alongside the eCTD ones, not a parallel stack. The original author already
designed for this: `irb_submissions.submission_id` is a foreign key to
`submissions(id)`. That link becomes load-bearing.

**D2 — Submission type decides the placement vocabulary.** The one real
blocker is that `upsertLeaf` runs every section code through a CTD normaliser
and refuses anything else:

```
Section code "estar.device-description" does not name a CTD section a document
can be filed at. Use a CTD section code — for example 1.2, 2.7.3 or 3.2.S.4.2
```

The submission row already carries `applicationType`. The section vocabulary
must become a property of that type. **One change, three beneficiaries:** eCTD
keeps CTD codes and its DTD backbone; eSTAR gets device codes, which closes a
finding the MDX demo pack already raised; an IRB package gets its artifact
slots. Anything else forks the packager.

**D3 — The platform never claims a transmission it did not perform.** FDA has
a real AS2 gateway with acknowledgements. **No IRB has a universal electronic
gateway** — they are portals (IRBNet, Advarra, WCG, Huron) or email. So
"submit to IRB" here means: assemble the package, validate it, freeze it,
Part 11 sign it, record a governed submission event with what was sent and
when, and **track the IRB's response as entered by a human**. The word
"transmitted" is not used. This reuses the `UnverifiedTransportError` pattern
that already makes the unverified FDA REST path refuse rather than pretend,
and it is what `ci:action-overclaim` exists to police.

**D4 — The engine decides what it can, and nothing more.** It may find: a
required artifact absent; a consent element missing against 21 CFR 50.25(a)
and (b) and the 45 CFR 46.116(a)(5) key-information summary; the submitted
protocol version not being the current one; an approval expired or a
continuing review due; a vulnerable-population protection absent when subpart
B, C or D applies. It may **recommend** a review pathway. It must never decide
whether the study is approvable, and never state the review category the IRB
will actually apply — `recommendReviewType` is a recommendation and its output
must be rendered as one.

**D5 — Rule 2.** This is new capability while the launch rows are not green.
The founder directed it on 2026-09-22 and owns that rule. Recorded here so a
later session finds a decision rather than an unexplained exception.

## The work, in order

1. **Register the migration** in `C2C_MIGRATION_FILES`, additive and
   idempotent, before the final sweep pair, with the Rule 1 header note. Until
   this lands nothing else matters, because production has no tables. Verify
   with `ci:migration-set-order`, `ci:migration-drop-safety` and
   `db:sync-manifest:check`.
2. **Generalise the placement vocabulary** (D2), with the eSTAR case as the
   proof that it is not IRB-specific. The existing eCTD tests must be
   untouched and still pass.
3. **Assemble the package** from the vault through the existing leaf-document
   resolver and exporter — protocol at a pinned immutable version, IB, consent
   and assent and HIPAA authorization, recruitment and subject-facing
   material, the investigator's CV and licence, Form FDA 1572 and the
   financial disclosure for an IND study, the safety monitoring plan, site
   and laboratory documentation.
4. **Surface it** inside the Submission Center as an IRB submission, and link
   to it from Protocol development. The consent register the protocol surface
   already shows becomes the same consent the package carries — one consent,
   not two.
5. **Lifecycle:** approval and expiration recorded, continuing review
   scheduled from the approval date, modifications tied to protocol
   amendments, reportable events, closure. `continuingReviewStatus` already
   computes the timing.
6. **Evidence** under `docs/evidence/IRB/`, with a fail-first proof for every
   new gate and a live run against the seeded biotech program.

## Out of scope

A portal connector for any specific IRB vendor; IACUC and IBC (the committee
tables cover them and the surface does not); automated determination of
exempt or expedited category.
