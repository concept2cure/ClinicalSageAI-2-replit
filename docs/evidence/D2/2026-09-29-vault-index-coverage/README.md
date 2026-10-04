# VR-15: a numbered Vault index, and required-section coverage from the one resolver (row D2)

**Plan item:** VR-15, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-09-29.
**Depends on:** VR-04 (`docs/evidence/D4/2026-09-29-vault-classifier-anchoring/`).

## The finding

Nothing in the Vault showed what it holds against what the program is
required to hold. A filed document's number was its raw `ctd_section`, as
typed (`3.2.s.1` and `3.2.S.1` sorted apart), or a dash, in no stable order.

## The change

| Piece | File |
|---|---|
| Coverage. The required list comes from `resolveRequiredSections`, the one resolver every gate uses (read, not edited: D7 spine). It carries its provenance: the live pack and version, or the ICH baseline and why. A section is covered only by a **confirmed** filing at it or below it (3.2.S.4.2 covers 3.2.S; 5.3.5 does not cover 5.3.5.1). A suggestion and unfiled never count. | `server/services/vault/vault-coverage.ts` |
| No figure where there is none. A rule-pack store that could not be read is `unavailable` with the reason, never "0 of m". The resolver swallows that failure into its fallback, so the query it is handed is watched. Filings that cannot be read are `unavailable` too. A vault that is not CTD-numbered (device, IVD, service) is `not_applicable` with why. | same file |
| `GET /api/c2c/project-vault/:id` carries `coverage`; the program read adds `program_type` and `primary_agency` | `server/routes/c2c/project-vault.ts` |
| Index numbers. In a CTD view: the normalized section, or "—" until a leaf has one. A dotted folder ordinal there would read as a CTD code, "3.1" for a Module 3 document. Outside a CTD view: the folder's ordinal and the leaf's position. Ordered by CTD section, then title, then id, so every read numbers the same. Unfiled leaves are not numbered, because a section there is the classifier's suggestion. | `project-vault.ts` (`indexedLeaves`) |
| The "Vault coverage" block: "Required sections: n of m have a confirmed document", where the list came from, and per module which sections are confirmed. Each missing section offers Upload (the page's picker) and filing an existing document there (the page's own filing call, audited). The same counts are in AnA's screen context. | `client/src/concept2cure/v2/surfaces/VaultCoverage.tsx`, `Vault.tsx` |

Counts only: no percentage, no readiness ring. A source guard
(`vault-coverage.test.ts`) keeps the Vault read model the module's only
reader, so it feeds no readiness figure.

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| Route and service (`vault-tree-bounded.test.ts`, `vault-coverage.test.ts`) | `red/route-and-coverage.txt`: no `coverage` in the payload; numbers raw and unordered (`['3.2.P.8', '—', '3.2.s.1']`); a device leaf `—`; the source guard found no reader | `green/route-and-coverage.txt`: 24/24 + the cabinet suite 7/7 |
| On PostgreSQL as `app_service`, RLS enforcing (`tests/db/vault-coverage.dbtest.ts`) | new module | `green/db-vault-coverage.txt`: a confirmed filing adds exactly one covered section, and a suggestion adds none |
| Surface (`vaultCoverage.test.tsx`) | `red/client-coverage.txt`: 4 failed against trunk's `Vault.tsx` (no block) | `green/client-coverage.txt`; 5/5 with the AnA-context case; the 16 Vault client files 95/95 |

The cabinet suite had pinned "—" for a device leaf, to prove no CTD section
is invented. It now asserts the folder index `4.1` *and* that `ctdSection`
stays null, which is the same intent.

Also green: ESLint unchanged per file; `tsc` 0 errors;
`ci:ana-surface-context`, `ci:check-client-reachability`, microcopy,
internals-in-copy, action-overclaim, success-before-ok, design-system and
phantom-token gates.

## Limits, stated

- "Covered" means *confirmed*, the strongest state a filing has before VR-13
  brings approval. After VR-13 it should mean approved.
- VR-19 freezes these index numbers when it seals a room. Until then they
  follow the live filings.
