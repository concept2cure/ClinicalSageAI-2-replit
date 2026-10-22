# Canonical integration qualification

The final publication fetch advanced the canonical branch from `4b0e3ff1e`
to `accf8c6ba`. Three incoming commits contain 1,354 changed paths, including
769 outside docs. Seven paths overlap the assembly feature; four require
manual server conflict resolution. Work stays on `concept2cure-v2`.

The feature was committed locally as `059ffd846` after its initial qualification
and rebased onto those canonical updates. Earlier evidence remains qualified to
its recorded source pins. This directory records combined-source qualification;
it does not relabel historical runs as tests of the combined tree.

Integration preserves canonical current edit permissions, exact mounted editor
handoffs and unsaved-work guards, catalogue/Vault source retrieval and reservation,
and governed import outcomes. It also preserves atomic assembly, retained reviews,
saved-section base checks and exact host adoption guards. No provider or deployment
is invoked by this process.

## Combined results

Counts overlap; these are separate qualified runs, not a summed unique total.

| Evidence | Result | Qualification |
| --- | --- | --- |
| [Frontend](frontend/README.md) | 242/242, 11 files | Actual Workbench/controller/review, current permissions, navigation and recovery with synthetic HTTP |
| [AnA and Vault](ana-server/README.md) | 75/75, 11 files | Current project retrieval, version receipts, saved bases and transactional rollback coexist |
| [SQL-gate backend replay](sql-gate/README.md) | 127/127, ten files | Final backend bytes, fixed SQL variants and unchanged row locks/bind parameters |
| [Backend](backend/README.md) | 127/127, then final affected 33/33 | Larger run precedes same-client refinement; final actual HTTP replay includes the single-slot pool constraint |
| [Final focused replay](release/focused-final.json) | 39/39, three files | Final UI navigation, controller and saved-base/Vault HTTP behavior; later SQL variants have a separate backend replay |
| [Root regression](release/related-regression.json) | 313/313, 12 files | Canonical starts/imports, template identity, source checkpoints, existing AnA panel and editor behavior |
| [Browser](browser/README.md) | 9/9 | Desktop/touch light/dark, read-only refusal and separate manual wheel proof in the bounded embedded host |
| [Build and editor gates](release/checks.json) | Compiler, build and eight gates pass | Existing bundle-size advisory retained; final compiler and warning statuses recorded in the receipt |
| [Source verification](release/source-pin-verification.json) | Final pins match | 44 root, 26 backend, 14 AnA, 23 browser production and five fixture pins; the historical frontend map predates the final navigation updater |

The assembly COMMIT transport cases first failed against the merged service.
Unknown commit replies now discard the connection without rollback/retry.
A confirmed commit rechecks current project and document access before returning
private content, using the same checked-out connection after transaction end.
Revocation returns the existing generic unavailable response; the known-parent
client remains held for explicit inspection. A one-slot pool fixture verifies
that post-commit admission does not wait for a second pool connection.

The newer explicit editor refusal is displayed verbatim and blocks build/AnA.
Denial and restoration invalidate old plans. Canonical mounted-target events,
ceremony, dirty Back and source-import outcomes remain intact. The two incoming
notification/deep-link fixtures now preserve actual AuthService exports while
stubbing display-only authentication; assertions were not weakened.

The 27 human cases remain **Not run**. No live provider, deployment, native
PostgreSQL/RLS or regulatory acceptance claim follows from these local checks.

The warning ratchet initially showed one new Workbench complexity warning even
though the net count fell. The final equivalent review-panel state updater
removes that warning: no changed file grows, and the existing panel decreases
by three. Final focused tests and browser captures cover that last navigation
refinement. Historical frontend pins retain their pre-refinement qualification.

The normal pre-push SQL gate then refused six optional locking-clause
interpolations. All six now choose complete fixed SQL variants with the same
bind parameters, tenant filters and row locks. The [SQL-gate qualification](sql-gate/README.md)
records that actual rejection and the affected backend replay; no baseline or
guard was relaxed.

A final fetch found concurrent commit `70cb68971`, changing only five evidence
files. The feature was rebased onto it before publication. No production, test
or configuration bytes changed; all 44 root pins still match, so the completed
source qualification remains applicable.
