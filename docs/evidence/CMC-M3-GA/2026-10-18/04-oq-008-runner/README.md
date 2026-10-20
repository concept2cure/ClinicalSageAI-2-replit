# OQ-008 — the CMC / Module 3 operational-qualification runner

**What this directory is:** the runner for OQ-008 and two of its **smoke runs**.
It is **not** an OQ record. Decision P-28 requires the W3 posture — RLS
enforcing, a non-owner runtime role, launch scope enforced, a credentialed
second signer — at one commit beside IQ-001 and OQ-001…007, plus a named
expert's signature on the reference records the protocol creates. Neither run
below had the signer identities, so every step that needs one is recorded
*deviation — not executed, credential not supplied*. §4 of
`docs/validation/OQ-008-CMC-MODULE-3.md` lists what a real run needs.

| File | What it is |
|---|---|
| `smoke-run-default-posture.md` | the runner against the development server as it ships locally (launch scope off) |
| `smoke-run-launch-scope-enforced.md` | the same runner against a server booted `LAUNCH_SCOPE_ENFORCE=on LAUNCH_SCOPE_API_UNATTRIBUTED=enforce` |
| `OQ-CMC-29.launch-scope-refusal.json` | the refusal that step observed under that posture |
| `OQ-CMC-32.register-create-ledger.json` | the chained ledger rows naming the operator of every record the prerequisite created |

```
14 pass · 0 fail · 11 deviation · 8 not-executed   (launch scope enforced)
15 pass · 0 fail · 10 deviation · 8 not-executed   (default posture)
```

## Four steps were reported as passing on evidence that proved nothing

The third smoke run of this protocol read **14 pass, 1 fail, 10 deviation**.
Four of those passes did not observe the requirement they were filed against,
and two survived into a fourth run before being caught. They are written down
here because the failure mode — *a step whose assertion is satisfied by the
wrong response* — is the one an OQ record cannot absorb.

| Step | What it did | Why the pass was empty | Now |
|---|---|---|---|
| **OQ-CMC-32** | read `GET /api/audit/logs` and found no `new_values` | that route serves the separate `audit_events` table; the chained `audit_logs` ledger is `GET /api/audit-trail/ledger`. The step reported a product gap that did not exist | reads the ledger: 6/6 records named by a register-create row, none anonymous, chain verified over 4 844 rows |
| **OQ-CMC-26** | `POST /api/ana/tools/start_intelligence_flow` for `cmc` and `protocol`, both 404 | **there is no such route.** `start_intelligence_flow` is an AnA *tool*; its refusal is the dispatcher's launch-scope rule. The assertion (`proto.status >= 400`) was satisfied by the 404 that any nonexistent path answers, so `cmc 404; protocol 404` was filed as a pass | reads the two preconditions a turn needs (a configured provider, enforced scope) and records *not executed* when either is missing |
| **OQ-CMC-29** | probed `/api/cmc/variations/classify` as the unclaimed path | that prefix **is** claimed by the cmc surface entry, so its 400 was body validation. And launch scope was off, so nothing would have been refused anyway | probes `/api/cmc/projects/:id/process-capability` — the one prefix the registry does not claim — and says *partly executed* unless the posture is enforced. **Under that posture it passes: 403 `LAUNCH_SCOPE`** |
| **OQ-CMC-04** | asserted a foreign programme leaks no rows and the write is refused | the assertion was right; the `expected` prose said "404/403", which the observed `read 200` contradicts | the prose now states what the requirement needs: the read names no record, the write is refused |

## The control that was demonstrated, not assumed

OQ-CMC-29 is the launch-scope API boundary (URS-CMC-019). It was run twice
against the same commit:

| Posture | Unclaimed path | Verdict |
|---|---|---|
| `LAUNCH_SCOPE_ENFORCE` unset (dev default: off) | served | **deviation** — *partly executed*, naming the setting |
| `LAUNCH_SCOPE_ENFORCE=on`, `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce` | `403 LAUNCH_SCOPE` | **pass** |

That is the gate refusing the case it exists to catch, and the same step
refusing to call the served response a pass.

## What these runs found that is not a runner defect

Both runs record the same two findings, which belong to the GA plan, not here:

1. **`POST /api/cmc/ich-compliance` performs no project-membership check.** A
   programme id this organisation does not hold answers `200` with a verdict
   (`OQ-CMC-24`, and `OQ-CMC-04`'s read). The register reads filter by
   `organization_id` and leak nothing; the quality engines judge whatever id
   they are given.
2. **Nothing resolves `OQ_FOREIGN_PROJECT_ID`.** Until a second tenant's
   programme exists on the runner's machine, URS-CMC-014's cross-tenant 404
   cannot be observed at all — only the nonexistent-id case can.

## Reproducing

```bash
# default posture
set -a; . ./.env; set +a
VALIDATION_NO_BROWSER=1 VALIDATION_BASE_URL=http://127.0.0.1:5000 \
  node tests/validation/oq/cmc/run.mjs

# launch scope enforced (a second server, its own origin allowed)
PORT=5201 LAUNCH_SCOPE_ENFORCE=on LAUNCH_SCOPE_API_UNATTRIBUTED=enforce \
  ALLOWED_ORIGINS=http://127.0.0.1:5201 npx tsx server/index.ts
VALIDATION_NO_BROWSER=1 VALIDATION_BASE_URL=http://127.0.0.1:5201 \
  node tests/validation/oq/cmc/run.mjs
```

`VALIDATION_NO_BROWSER=1` is why OQ-CMC-25 (the unscripted screen read) is a
deviation: `playwright-core` is not installed on this machine. The harness
advertised `needsBrowser: false` and then required playwright in `finish()`
anyway — fixed here (`playwrightCoreVersion()`), which is why the record's
Node/Chromium row reads *not installed* instead of crashing the run.
