# D5 — AnA's filing was recorded as a person's decision

**Row:** D5 (Part 11 evidence), `docs/LAUNCH_DEFINITION_OF_DONE.md`; the
requirement is URS-VAULT-007 (`docs/validation/URS-002-VAULT.md`): *"A person
confirms the filing decision … the placement is recorded and audited."*
**Workstream:** the AnA client-files lane. **Date:** 2026-09-24.
**Reach:** gated — `place_project_document` is withheld while
`ana.document_catalog` is off (the launch default), so this is reachable only
where that toggle is on. It is fixed now because a Part 11 record that names the
wrong actor is not something to leave for the day the switch is flipped.

## The defect

`place_project_document` called `placeVaultDocument` with nothing but the
human's user id. So AnA's choice of folder was written as:

- `placement_status = 'confirmed'` — which the Vault surface defines as "an
  upload a person filed; it counts as settled" (`Vault.tsx`);
- `placed_by` = that person, `placed_at` = now;
- a chained `vault.document.file` audit row whose `user_id` and `actor_id` were
  that person, carrying AnA's rationale as if they had written it.

The tool context held the serving model, the thread and the turn; all of it
was dropped. Nothing anywhere recorded that an agent had made the call. The
Part 11 trail said a person decided something no person decided — and
`confirm_suggested` let AnA do it even more directly, by confirming the
classifier's proposal in the person's name.

## Red — `red/HEAD.txt` is the parent commit

| File | Result |
|---|---|
| `red/vault-placement.dbtest.red.txt` | 4 failed / 9 passed, real PostgreSQL as `app_service` with `RLS_ENFORCE=on`. The first failure is the defect verbatim: `reported: 'confirmed'`, `placementStatus: "confirmed"`, where a suggestion was expected |
| `red/document-placement-tools.unit.red.txt` | 6 failed / 9 passed |

## Fix

- **`vault-placement.service.ts`** takes an optional `agent` (the agent's
  provenance). Its presence makes the write the `'suggested'` state the ingest
  classifier already uses for a machine proposal — the state the Vault already
  asks a person to confirm — with `placed_by` and `placed_at` NULL, as for the
  classifier's. The audit row carries the provenance beside the move; `user_id`
  stays the person on whose behalf the agent acted. An agent's `confirm` is
  refused (`CONFIRMATION_REQUIRES_A_PERSON`, 403), so no other agent caller can
  record a confirmation either. A person's placement through the route is
  unchanged.
- **`document-placement-tools.ts`** passes that provenance in the repo's one
  agent-audit shape — `agentAuditDetails` from `ana-ri/mdx-tool-policy.ts`
  (`actorKind: 'agent:ana'`), plus the tool, the serving model as the gateway
  reported it, the thread and the turn — and refuses `confirm_suggested`
  outright, telling the model what it can do instead.
  `reasonReferencedArtifact` is recorded as null (not assessed), because the
  gate that computes it does not run for this tool and `false` would be a
  finding nobody made.
- **The stored rationale names its author** — "AnA's suggestion: …". The Vault
  shows a suggestion's rationale beside its Confirm button, and labelled every
  suggestion "Classifier: …"; it now says "Classifier" only for a suggestion
  that carries the classifier's confidence. Without both halves, AnA's proposal
  would have been shown to the person deciding on it as the classifier's.
- **The tool description** tells the model truthfully that it suggests a folder
  for a person to confirm, never that a document is filed.

## Green

| File | Result |
|---|---|
| `green/vault-placement.dbtest.green.txt` | **13/13** as `app_service` — AnA's folder is `suggested` with `placed_by` NULL and a signed rationale; the audit row carries `actorKind`, tool, serving model, thread and turn; AnA's confirm is refused by the tool and by the service; unfiling carries the same attribution; a person's placement still records `confirmed` with no agent marker |
| `green/document-placement-tools.unit.green.txt` | 15/15 |
| `green/authoring-file-to-vault.green.txt` | 6/6 — WM's authoring file-to-vault, a person's governed action through the same service, unchanged |
| `green/neighbour-unit-suites.green.txt` | 2,712 passed — `server/services/ana`, `server/routes/c2c`, `server/services/vault`, and the Vault surface suite including two new cases: the classifier's proposal is labelled as the classifier's; AnA's is not (red against the parent's `Vault.tsx`, green after) |
| `green/gates.txt` | `ci:migration-drop-safety`, `ci:untracked-imports` |

`green/lane-dbtests-as-app_service.txt` is the lane's eight real-PostgreSQL
suites as `app_service`: **68 passed, 1 failed**. The failure —
`vault-passage-search` "returns the passage that answers the question" — is
**not this change**: it fails the same way on the parent commit with this change
stashed (3 of 3 runs). Its cause is the `ivfflat` index on
`vault.document_chunks`, built on an empty table: once the planner prefers it,
a nearest-neighbour search probes a list with nothing in it and returns zero
hits (the suite passes 7/7 with `ivfflat.probes=100` or index scans off). That
is a production defect in the lane's own migration and is fixed in the commit
that follows this one.

ESLint: no new warnings or errors in any changed file.

## Owed

- Whether URS-VAULT-007 should say more than it does. AnA now suggests and a
  person confirms, which is what the requirement already says; if the founder
  turns the catalog on, OQ-002 needs a step that exercises the AnA door.
