# LIVE-PROOF — 2026-09-21 run date, executed 2026-09-22 00:07–00:11 UTC

The live proof three finished workstreams owed on report: **WP** (the vault-leaf
dispatch-readiness defect), **WK** (the one review lifecycle, VSR-001 F-6) and
**W3** (the traceability matrix regenerated after them).

Nothing here was executed by a model. Every verdict below is the deterministic
server answer, recorded verbatim; the transcripts are in `transcripts/`.

## Environment

| Field | Value |
|---|---|
| Server | `npx tsx server/index.ts`, PORT=5102, `ALLOW_DEV_AUTH=1 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on ALLOWED_ORIGINS=http://localhost:5102,http://127.0.0.1:5102` |
| Git | `concept2cure-v2` @ `8a40bb187be3f5b89b8380d23950029d908537f3` (read from `.git/HEAD`; no git command was run) |
| Node / Chromium / playwright-core | v22.22.2 / `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` / 1.63.0 |
| Identity | jonmichaelpsmith@gmail.com, organisation 2, via `POST /api/auth/dev-login` (Bearer token; the route answers a token, not a cookie) |
| `/readyz` | **HTTP 503**, `failed: ["ana"]`, `anaState: "no_provider"` — `transcripts/readyz.json` |
| AI provider | **none configured.** No model output was produced, requested or simulated anywhere in this run. |
| Demo packs | **re-used, not re-seeded.** Submissions 67/68 and sequences 28/29 were already on the tree from the 2026-09-21 18:03–18:08 UTC seed. Re-running `npm run demo:seed` would have rewritten `docs/evidence/DEMO/*/manifest.json`, which is the only surviving *before* record of the defect in (1). The seeded ids were read from those manifests and the live rows were confirmed present (6 leaves on each sequence, same ids and SHA-256s). |

---

## 1. WP — dispatch readiness over vault-filed leaves: before and after

### The route

`GET /api/submissions/sequences/:seqId/dispatch-readiness`
(`server/routes/submissions.ts:1605`). Note there is **no** `/submissions/:id`
prefix on this route — `GET /api/submissions/68/sequences/29/dispatch-readiness`
answers **404 `API endpoint not found`**. The demo packs call the sequence-only
form (`scripts/demo/launch-demo/packs/mdx.mjs:408`,
`packs/biotech-submission.mjs:84`) and so does this run.

### Before (the seed's own record, 2026-09-21 18:03–18:08 UTC)

Source: `docs/evidence/DEMO/biotech/manifest.json` → `records.submission.readiness`,
`docs/evidence/DEMO/mdx/manifest.json` → `records.readiness`. The seed recorded the
defect against itself rather than working around it
(`packs/biotech-submission.mjs:81`: *"every vault-placed leaf is a permanent
dispatch blocker. Product defect recorded, not fixed by the seed."*).

| | biotech · submission 67 · sequence 28 | mdx · submission 68 · sequence 29 |
|---|---|---|
| `leafCount` | 6 | 6 |
| `validationErrors` | **6** | **6** |
| `readiness.errors` | **6** | **6** |
| error code on every leaf | `UNRESOLVED_DOCUMENT` | `UNRESOLVED_DOCUMENT` |
| gate blockers | 3 | 2 |

Verbatim, one of the twelve:

```
{"severity":"error","code":"UNRESOLVED_DOCUMENT","sectionCode":"m1.14.4.1",
 "message":"Leaf \"Investigator's Brochure v3.0\" (m1.14.4.1) has no resolvable document — it cannot be assembled into the package."}
```

### After (this run, 2026-09-22 00:07:5x UTC)

Full responses: `transcripts/dispatch-readiness-biotech.json`,
`transcripts/dispatch-readiness-mdx.json`.

| | biotech · sequence 28 | mdx · sequence 29 |
|---|---|---|
| HTTP | 200 | 200 |
| `leafCount` | 6 | 6 |
| `validationErrors` | **0** | **0** |
| `readiness.errors` | **0** | **0** |
| `readiness.warnings` | 6 (`MISSING_REQUIRED_SECTION` 1.1, 1.2, 1.3, 1.12.14, 1.14.4.2, 1.20) | 3 (`MISSING_REQUIRED_SECTION` 1.1, 1.2, 1.3) |
| `readiness.infos` | 1 (`DUPLICATE_NEW_SECTION` m5.3.5.1 — two protocol-class leaves, lifecycle confirmed intended by the pack) | 0 |
| `gate.cleared` | false | false |
| `gate.blockers` | 2 | 1 |

**All six `UNRESOLVED_DOCUMENT` errors are gone on both sequences.** Nothing else in
either assessment changed: the warning and info findings are character-for-character
the same as the seed recorded, which is what a targeted fix should look like.

### The blockers that remain, and why each is legitimate

**Both sequences — "No completed Shadow Review has run for this sequence. A
never-reviewed dossier is not cleared for dispatch — run Shadow Review before
transmitting."**

Real. `GET /api/submissions/sequences/:seqId/shadow-review`
(`transcripts/shadow-review-*.json`):

- sequence 29 (mdx): `[]` — no shadow review has ever been started.
- sequence 28 (biotech): one row, `id:1`, `status:"failed"`, `model:null`,
  `rtfRiskScore:null`, `crlRiskScore:null`, `summary:null`.

`shadowReviewRunCount` is 0 on both because neither has a *completed* run. The
biotech run failed with `model: null` — Shadow Review is a model-driven lens and
**there is no AI provider configured in this environment** (`/readyz`:
`anaState: "no_provider"`). This blocker is **owed to a provider key**, not to a
product defect: the gate is correctly refusing to certify a dossier no reviewer
and no model has ever looked at. It cannot be cleared here and nothing was
simulated to clear it. (No shadow-review POST was issued in this run: it would
have written a second `failed` row into the demo pack's state for a result
already known from the biotech row.)

**biotech sequence 28 only — "Dispatch is blocked because this submission type
requires a 21 CFR Part 11 release signature and none has been applied (no
orchestrator run is linked to this submission; and no dispatch-intent signature is
recorded on ectd-sequence:28)."**

Real, and correct behaviour. `releaseSignature.required` is `true` for the IND
(application type `ind`) and `false` for the 510(k) (`sequence 29`,
`releaseSignature.cleared: true`). The seed never applied a dispatch-intent
signature, so §11.70 has nothing to bind to. Clearing it requires a real signing
event by a real signer — exactly the control that must not be faked.

Both blockers were already present in the *before* record. The fix removed the
six false ones and left the two true ones standing.

### The Builder leaves route — "Source document: unlinked" is gone

`GET /api/submissions/sequences/:seqId/leaves` — full responses in
`transcripts/leaves-biotech.json`, `transcripts/leaves-mdx.json`. Every leaf now
carries a `sourceDocument` block from `server/services/ectd/leaf-document-resolver.ts`:

| seq | leaf id | section | `documentId` | `documentUuid` | `keyKind` | `status` | `pin` |
|---|---|---|---|---|---|---|---|
| 28 | 39 | m1.14.4.1 | `null` | a59481b8… | uuid | **resolved** | **match** |
| 28 | 44 | m1.6.3 | `null` | 13c026e1… | uuid | **resolved** | **match** |
| 28 | 42 | m2.3 | `null` | 4f6c55f9… | uuid | **resolved** | **match** |
| 28 | 43 | m2.6.6 | `null` | 93d8cd98… | uuid | **resolved** | **match** |
| 28 | 40 | m5.3.5.1 | `null` | c4411315… | uuid | **resolved** | **match** |
| 28 | 41 | m5.3.5.1 | `null` | 3b4b1518… | uuid | **resolved** | **match** |
| 29 | 38 | 1.14 | `null` | 1b80ee68… | uuid | **resolved** | **match** |
| 29 | 37 | 1.16 | `null` | 8a302d5a… | uuid | **resolved** | **match** |
| 29 | 33 | 3.2.P.1 | `null` | 0bdf94f7… | uuid | **resolved** | **match** |
| 29 | 34 | 3.2.R | `null` | 89d0bfce… | uuid | **resolved** | **match** |
| 29 | 35 | 5.3.1.4 | `null` | d0b35c47… | uuid | **resolved** | **match** |
| 29 | 36 | 5.3.5.2 | `null` | 121d2df3… | uuid | **resolved** | **match** |

Twelve of twelve: `documentId` is still `null` (these are uuid-keyed vault rows —
that is the whole point), `keyKind` is `uuid`, `status` is `resolved`, `pin` is
`match`, `reason` is `null`. The pinned `documentContentSha256` equals the digest
the vault reports now on every leaf, so `DOCUMENT_CONTENT_MISMATCH` is correctly
not raised either.

Verbatim, leaf 39:

```json
"sourceDocument": {
  "keyKind": "uuid",
  "documentTable": "vault_documents",
  "documentId": null,
  "documentUuid": "a59481b8-733f-4fc0-bf28-9b5569368b2a",
  "pinnedSha256": "b23339ccea9d8b0ef2087fc525c56abe512815ae7244d2b77cfec383d7c94578",
  "storedSha256": "b23339ccea9d8b0ef2087fc525c56abe512815ae7244d2b77cfec383d7c94578",
  "status": "resolved",
  "pin": "match",
  "reason": null
}
```

**WP's "Owed" section is closed.**

---

## 2. WK — OQ-AUTH-17 and OQ-AUTH-17b (VSR-001 F-6)

```
set -a; source <scratchpad>/wf-signer.env; set +a      # OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD / OQ_AUTHOR_EMAIL
VALIDATION_BASE_URL=http://localhost:5102 npm run validation:oq -- authoring
```

The password was never printed, echoed or written to any file in this folder.

### Result

```
OQ-AUTH-17   pass
OQ-AUTH-17b  pass
...
OQ-003 Authoring: 23 pass, 0 fail, 1 deviation, 0 not-executed → docs/evidence/W3/2026-09-20/OQ-AUTHORING
```

**OQ-AUTH-17b passes.** It had failed in every run since the baseline. Regenerated
bundle: `docs/evidence/W3/2026-09-20/OQ-AUTHORING/` (`result.json`,
`OQ-003-execution-record.md`, `steps/*`), executed 2026-09-22T00:08:57.969Z →
00:09:32.564Z against `http://localhost:5102`, commit `8a40bb18`.

### Its evidence file, before and after

| | before (2026-09-21T16:26:59Z, port 5200, commit `ad69500f`) | after (2026-09-22T00:09:06Z, port 5102, commit `8a40bb18`) |
|---|---|---|
| verdict | **fail** — `"authoring review request is not on the Review board queue"` | **pass** |
| `GET /api/review/board` | HTTP 200, `data.meta = {scope:"all", total:0, …}`, queue empty | HTTP 200, queue **12 items** |
| observed | `{"scope":"all","total":0,"threadItemId":null,"threadDocumentId":null}` | `"queue lists the document (12 items)"` |
| step evidence | `steps/OQ-AUTH-17b.api-1.json`, `steps/OQ-AUTH-17b.at-failure.png` | `steps/OQ-AUTH-17b.api-1.json` (no failure screenshot — the step passed) |

Both copies are preserved here: `transcripts/oq-auth-17b-before/` (step record,
board response, failure screenshot) and `transcripts/oq-auth-17b-after/`.

The queue row the board now returns for the document OQ-AUTH-17 created:

```json
{
  "id": "76adad64-ded1-4cae-9181-463e744d46f3",
  "doc": "OQ-003 Clinical Overview 20260922000859",
  "prog": "OQ-003 Authoring program 20260922000859",
  "module": "M2",
  "docStatus": "IN_REVIEW",
  "state": "in-review",
  "reviews": [{
    "id": "bf9c7e66-7d99-4d98-bf2d-469a6d611227",
    "reviewerEmail": "jonmichaelpsmith@gmail.com",
    "status": "pending",
    "requestedBy": "jonmichaelpsmith@gmail.com",
    "requestedAt": "2026-09-22T00:09:05.905Z",
    "reviewedAt": null
  }],
  "myReviewStatus": "pending",
  "awaitingMyReview": true,
  "esig": "pending",
  "prov": "in review · review requested by jonmichaelpsmith@gmail.com"
}
```

The row is built from the authoring store: the `reviews[].id`
`bf9c7e66-7d99-4d98-bf2d-469a6d611227` is the `authoring_reviews` id that
`POST /api/authoring/documents/:id/request-review` returned one second earlier in
OQ-AUTH-17 (`steps/OQ-AUTH-17.api-1.json`, HTTP 200). One review lifecycle, one id.

The same board response also carries the **demo packs'** review requests — e.g.
`[Demo · MDX] Cybersecurity and Interoperability Summary`, reviewer
`oq-signer@validation.local`, requested 2026-09-21T17:50:51.430Z. The MDX pack's
finding F4 is closed by the same change.

### The rest of OQ-003

23 pass · 0 fail · 1 deviation · 0 not-executed (was 22 · 1 · 1 · 0).
The one deviation is **OQ-AUTH-16**: `POST /api/authoring/sections/:id/ai/draft`
answered **HTTP 503 `GATEWAY_UNAVAILABLE` — "No AI provider is configured for this
deployment, so this section cannot be drafted. Nothing was changed."** That is
owed to a provider key. OQ-AUTH-15 (the fail-closed negative case) passes on the
same route, so the refusal is the product behaving correctly, not an outage.

### The board screenshot over the seeded demo programs

`OQ-AUTH-20.png` from this run (copied here as
`transcripts/review-board-OQ-AUTH-20.png`) is that screenshot. The board, filtered
to *All open*, renders **"8 documents await your review"** and the queue lists,
below the OQ-003 document:

- `[Demo · MDX] Cybersecurity and Interoperability Summary` — 510k, IN-REVIEW,
  `OQ Signer (validation) · Reviewer`
- `[Demo · Biotech] Module 2.5 Clinical Overview — C2C-101` — M2, IN-REVIEW,
  `OQ Signer (validation) · Reviewer`

Both were requested by the demo seed on 2026-09-21 through
`POST /api/authoring/documents/:id/request-review`, and neither was visible on this
surface before WK's change. The detail pane (on the selected OQ-003 row) shows that
document's authoring approval workflow
(`710107d3-4604-465a-b8d5-abcb9296ba20`, step 1 QA · *Awaiting signature*) and the
header states the §11.50 boundary in the product's own words: *"Verdicts recorded
here are not electronic signatures — apply a binding signature from the authoring
workspace."* The actions offered are *Request changes…* and *Record review
decision*; there is no delegate action, which is what WK's README says was stated
as absent rather than faked.

**WK's "Owed" section is closed in full** — OQ-AUTH-17/17b re-executed, and the
board screenshot over the seeded demo programs filed.

---

## 3. W3 — TM-001 regenerated

```
npm run validation:traceability
TM-001: 67 requirements — pass 66, partial 1, fail 0, open 0, uncovered 0; 96 OQ steps
```

| | last recorded run (§10.2) | this run |
|---|---|---|
| requirements | 67 | 67 |
| pass | 65 | **66** |
| partial | 1 | 1 |
| fail | **1** | **0** |
| open | 0 | 0 |
| uncovered | 0 | 0 |
| OQ steps | 96 (94 pass / 1 fail / 1 deviation) | 96 (**95** pass / **0** fail / 1 deviation) |
| `problems` | — | `[]` |

Exactly one requirement moved: **URS-AUTH-013 `fail` → `pass`** — *"A review can be
requested from named reviewers … a reviewer sees the pending review on the Review
surface and records a decision with a meaning."* Its three steps now read
`OQ-AUTH-17 (pass)`, `OQ-AUTH-17b (pass)`, `OQ-AUTH-20 (pass)`.

By app after this run: Projects 9/9, Vault 10/10, **Authoring 14 pass + 1 partial**,
Submission Center 12/12, Submission Readiness 8/8, QMS 13/13.

The remaining **partial** is **URS-AUTH-012** (AI drafting through the governed
gateway): `OQ-AUTH-15 (pass)` + `OQ-AUTH-16 (deviation)`. It stays partial until a
PQ-passed provider is configured. It is the only requirement in the set that is
not `pass`, and it is owed to a provider key.

Generated: `docs/validation/TM-001-TRACEABILITY-MATRIX.md` / `.json`,
`generatedAt 2026-09-22T00:10:13.813Z`, `runDate 2026-09-20`.

---

## 4. Gates shown failing on the cases they exist to catch

No product code was changed in this session, so there was no new check to break.
The two validation gates that carry these numbers were instead re-proved against
their own negative cases (`transcripts/selftests.txt`):

```
VALIDATION_BASE_URL=http://localhost:5102 npm run validation:oq:selftest
  ST-01  pass
  ST-02  FAIL  (healthz returned 200, not 418 (this failure is the point))
  ST-03  deviation  (selftest: deliberately not executable)
  ST-04  not-executed  (prerequisite step ST-02 did not pass)
  ST-05  FAIL  (runner error: Error: selftest: runner error ...)
harness selftest: OK — false expectation → fail, deviation → deviation,
dependent → not-executed, thrown → fail; bundle written

npm run validation:traceability:selftest
negative case: builder exited 1 and named URS-FAKE-999 — the gate fails when it should
positive case: builder exited 0 on the real tree (TM-001: 67 requirements — pass 66,
partial 1, fail 0, open 0, uncovered 0; 96 OQ steps)
build-traceability selftest: OK
```

A false expectation is recorded as `fail`, not smoothed into a pass; a fabricated
requirement makes the matrix builder exit 1. The 66/1/0 above is therefore a
verdict from machinery that has just been seen to refuse.

The *fail-first* record for the two defects themselves predates this session and is
filed, not re-created: the six `UNRESOLVED_DOCUMENT` errors in the demo manifests
(§1, before) and the `fail` verdict with `total: 0` in
`transcripts/oq-auth-17b-before/step.json` (§2, before) are the failing observations
on the unchanged code. This session is doc-and-evidence scope; it did not re-break
a shared tree that other sessions are working in.

---

## What this run does **not** close

1. **Shadow Review** has never completed on either demo sequence, and cannot here:
   it is model-driven and no AI provider is configured. Both dispatch gates stand
   blocked on it, correctly.
2. **The IND release signature** on sequence 28 is unapplied. Needs a real signing
   event by a real signer.
3. **URS-AUTH-012 / OQ-AUTH-16** stay partial/deviation until a PQ-passed provider
   is configured.
4. **Staging execution** of IQ-001 and all six OQ protocols against the production
   image with a real second signer account, per VSR-001 §10.4.
5. **Signatures.** Every document in the package is still `DRAFT — UNSIGNED`.

## Files

```
docs/evidence/LIVE-PROOF/2026-09-21/
  README.md                                  this file
  transcripts/
    dispatch-readiness-biotech.json          GET .../sequences/28/dispatch-readiness   (200)
    dispatch-readiness-mdx.json              GET .../sequences/29/dispatch-readiness   (200)
    leaves-biotech.json                      GET .../sequences/28/leaves               (200)
    leaves-mdx.json                          GET .../sequences/29/leaves               (200)
    shadow-review-biotech.json               GET .../sequences/28/shadow-review        (200)
    shadow-review-mdx.json                   GET .../sequences/29/shadow-review        (200)
    readyz.json                              GET /readyz                               (503)
    selftests.txt                            both validation gate selftests
    review-board-OQ-AUTH-20.png             Review board over the seeded demo programs
    oq-auth-17b-before/{step.json,board.api-1.json,OQ-AUTH-17b.at-failure.png}
    oq-auth-17b-after/{step.json,board.api-1.json}
```

Regenerated runner output (OQ-003 only; the other five protocols' bundles are
untouched from the 2026-09-21 16:26 run): `docs/evidence/W3/2026-09-20/OQ-AUTHORING/`.

No credential appears in this folder. No git command was run in this session.
Recorded by the LIVE-PROOF Claude session (drafting only; cannot sign).
