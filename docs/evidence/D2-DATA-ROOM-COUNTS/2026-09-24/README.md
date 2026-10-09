# D2 — the data room counts what it says, and says when it is a window

**Row:** D2 Launch catalog (Vault, Projects). **Date:** 2026-09-24. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.
Found by the 2026-09-24 Vault-against-Veeva mapping (workflow `wf_7221b784-39b`, data-room mapper);
recorded by neither the assessment nor the work-order board before that.

## 1. What was wrong

Two readers of the same sources, the Vault's data-room lane (`GET /api/c2c/project-vault/:id`)
and Project home's data room (`GET /api/c2c/projects/:id/sources`), both called
`listClientDocuments` with no limit and no `currentOnly`. Three defects followed:

- **A silent cap.** The reader's default is 200 rows. Captured, Classified, Filed and Project
  home's "N sources · M readable" stopped at 200 with nothing said, and AnA was given those counts
  as facts.
- **A re-upload counted twice.** A re-upload retires its predecessor (`is_current = false`), and
  both rows were listed and counted.
- **"Classified" meant "the classifier ran".** Its fail-closed answer (no folder proposed,
  `needsReview`) was counted and shown as "Classified", so a source it had refused to place read
  as placed.

## 2. What changed

- **Vault lane.** It reads current sources only, with a window of 200 plus one extra row, and
  reports `window: { shown, truncated }`. A source the classifier refused has its own stage,
  `needs_review`, and a `needsReview` count. "Classified" is cumulative (a proposal was made, or
  the source is filed). The surface shows a full window's counts as floors ("200+"), says what
  they cover, shows how many need review, and labels a refused source "Needs review". AnA's facts
  carry `needsReview` and `truncated`.
- **`/sources`.** The same window, reported. The route stays inclusive, because the authoring
  canvas and sources rail also read it and should not change silently. Each source carries
  `isCurrent`, which the evidence spine now exposes (`adaptSource`; a row older than the column
  is current). Project home counts current sources only, and a full window reads as a floor
  with "newest N shown".

## 3. Proof

| | |
|---|---|
| `red/data-room-counts.txt` | Old code, new tests: **10 of 26 fail**, every new case: no window asked for or reported, superseded rows counted, a refusal counted as classified, no floor on screen, AnA not told. The 16 pre-existing cases pass either way. |
| `green/data-room-counts.txt` | 26 of 26. The 72 test files touching these readers (the spine, `/sources`, project-vault, the Vault and ProjectHome surfaces, the canvas and sources rail): 71 pass. The 72nd, `vault-download.test.ts`, was red on trunk at `7fd5d6af` for a stale storage mock and is fixed in its own commit. tsc 0. |

## 4. Not done here

- An exact total past the window. That needs a count query over the spine's own filter, which
  would be a second reader; the window is reported instead.
- The data room has no "file to vault" action on the surface (AnA's `file_chat_upload_to_vault`
  is behind a tenant toggle that is off by default).
