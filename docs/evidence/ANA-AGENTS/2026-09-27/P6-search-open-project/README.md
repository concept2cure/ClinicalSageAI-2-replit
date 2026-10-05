# ADR-0015 §6 / PF-10 F6: AnA can search the project she is working in

**Row:** 74 (founder-directed; moves no D-row), coordinated with PF-10
(`…01KnUGoX`, `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`). **Session:** `…019ZvHmh`.

## What was wrong

`project_knowledge_search` searched only when its context held an integer
project id **and** the tenant uuid. On the chat stream neither was true for a
v2 project:

- the project arrives as a `regulatory_programs` UUID, whose integer form is
  `null` (`turn-tool-context.ts` `projectFields`);
- the stream's tool context carries no tenant uuid.

So with a project open, AnA answered *"No active project is in context, so
project knowledge cannot be searched"*: she could not search the project the
person was working in.

## The change (`server/services/ana/AnaToolExecutor.ts`, the handler only)

Nothing new is invented. Both missing facts come from the one source each
already has:

- the tenant uuid from the request's own tenant scope, by the existing
  `withScopeOrganizationUuid`, and only for the same tenant;
- the integer project of an open program from the canonical resolver
  `integerProjectForRef` (`c2c/project-ref.ts`, PF-10 S6a), for the caller's
  own organization. A program that is not the caller's, or a lookup that
  fails, is no project; the search does not run.

A context that already holds an integer project and a uuid is searched
exactly as before, without the resolver.

## Proof

| Stage | File | Result |
|---|---|---|
| New test against the handler before the change | `red.txt` | 2 failed / 4 passed: the open v2 project was not searched |
| With the change | `green.txt` | 6/6 |
| Mutations | `mutations.txt` | 5/5 red, including a cross-tenant resolve, another tenant's uuid accepted, and the overcorrection of treating a failed lookup as a project. Two of these first survived; the cases that close those gaps were added before filing. |
| Neighbours (all AnA service, c2c and stream-route suites) | `neighbours.txt` | 3558/3559; the one failure is the pre-existing `governed-reason-not-invented.test.ts`, already shown failing on trunk (`../F1-decline-not-a-failure/`) |
| `tsc --noEmit` | — | 0 errors |
| Lint ratchet | — | unchanged |

## Decisions recorded

PF-10's eight founder decisions (F1–F8) were made on 2026-10-05 by the
product owner under the founder's delegation (ADR-0015), and are written into
the PF-10 plan. This change is F6 for the one integer-keyed tool the catalog
work (PF-10 S7) had not moved.

## Not in this change

- The stream's other readers and PF-10's S3/S4 (the fork) stay with PF-10.
- `search_document_passages` and the catalog tools already resolve the open
  program (PF-10 S7).
