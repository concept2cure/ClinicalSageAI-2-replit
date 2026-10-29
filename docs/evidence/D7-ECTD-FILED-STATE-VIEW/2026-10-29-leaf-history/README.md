# D7: each document on file says how it came to be there (gap 6.2, history half, 2026-10-29)

Gap 6, work item 2 of `docs/design/VEEVA_GAP_2026-10-22.md` reads: "Complete it with per-leaf history and source documents." This change completes the history half. It extends the filed-state fold and the "On file at the agency" card that work item 1 reached on 2026-10-22 (`../2026-10-22/`). It is not a new view.

## What already exists

- **The fold.** `foldManifestRows` (`server/services/ectd/prior-sequence-loader.ts`) folds sent or acknowledged sequences into what the agency holds:
  - a `replace` or `delete` takes off file the leaf its `modified-file` names (P-42);
  - each leaf keeps only the sequence and act that last put it there;
  - earlier acts were discarded.
- **The read route.** `GET /api/ectd-compile/:ident/filed-state` returns that fold, and `EctdFiledState.tsx` renders it.
- **Per-document placement.** Vault "Placed in" (`vault-where-used.ts`) lists the leaves that place a version, per document. It does not say what the agency holds.
- **Per-compile acts.** EctdCompile's `LifecycleView` shows one compile's acts, not their sum.
- **Not used here.** `foldFiledState` (`package-sequence-lifecycle.ts`, work item 3) and the IND diff routes (work item 4).
- **Searches.** Run on `history`, `filed acts`, `leaf history`, `lifecycle history`, `FiledAct`; deleted `*History*` under `client/**/ectd*` and `server/services/ectd`. Nothing else gives a filed leaf's acts.

## The change

- **The fold keeps the acts**, oldest first, in a `history` map beside the leaves:
  - a replace under the same name keeps both acts;
  - a replace under a new name takes the acts of the leaf it took off file with it, so the old name filed again later starts its own history;
  - a withdrawal is the withdrawn document's act, so if the document is filed again its history says so;
  - an append is its own document on file.
- **Compile and transmit are unchanged.** `loadLatestPriorManifestBySubmission` and the rehearsal read return only `{ priorSequenceNumber, leaves }`, and a test pins that.
- **The route** returns each leaf's `history` as `[{ sequenceNumber, operation, fileName }]`.
- **The card** shows, for a document with more than one act, a line such as "Filed 0000 new (general.pdf), 0001 replaced (general-v2.pdf)". A document filed once adds nothing. A withdrawal reads "withdrawn".

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | At `65f57f2d7`: the route on real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`), the card and the fold each fail without history. |
| `02-green.txt` | The route on real PostgreSQL 16 (3/3). The full set (every suite under `server/services/ectd`, every compile-route suite and the card) passes: 136 files, 1,870 passed, 0 failed. That run includes the compile-suite fixture fix filed beside this (`../../D7-ECTD-COMPILE-TRUNK-RED/2026-10-29/`), without which 15 of those files are red on trunk. |
| `03-mutation.txt` | Three mutations, each caught: a replacement under a new name that carries no acts; a leaf that keeps only its last act; a replacement that leaves its acts behind on the old name (added after review). |

## Not done

**Source documents for a filed leaf remain open.** The stored manifest (`ectd_compilations.leaf_manifest`) records each leaf's file, MD5 and act, but not the Vault document or version it was built from. Naming the source therefore needs the publishing path to write that identity into the manifest at compile time; reading it back from today's placements would guess. That is D7 package work and is the next step for this item.
