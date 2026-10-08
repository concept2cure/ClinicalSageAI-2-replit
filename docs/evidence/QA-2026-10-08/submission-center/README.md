# Submission Center publishing lifecycle — QA 2026-10-08 (j6, j1)

Reproduced on the running app (http://localhost:5078, QA database, signed in through the real form as a
manager; second-signer account not needed). Files in `before-5078/` are that reproduction: screens (`.png` /
`.txt`) and the non-GET API calls (`r*-api.log`, passwords redacted).

| Finding | Reproduced | Evidence |
|---|---|---|
| Dispatched sequence has no package / download / transmit (blocker) | yes: Dispatch offered only "Run dispatch QC" | `04-f1-f2b-dispatch.*`, `r1-dispatch.txt` |
| Freeze from the Sequences row opens the e-signature with no gate; signature recorded before the refusal | yes: `POST /api/c2c/actions/sign` 200, then `POST …/sequences/6/freeze` 422 | `03-f2a-*`, `01-f2a-after-sign.*`, `r4-api.log` |
| Unapproved Vault leaves invisible to the gate the client sees | yes: readiness errors 0, blockers name only Shadow Review and release signature | `04-f1-f2b-dispatch.*`, `r1b-api.log` |
| "SOURCE VERIFIED" on unapproved Vault versions | yes | `05-f2c-builder-source-chips.*` |
| Validated with no validation run | yes: new sequence 8 (Nexavir) Draft → Assembling → Validated, `validation_status` NULL | `01-f3a-*`, `r2-api.log` |
| Leaf placed into a Validated sequence leaves it Validated | yes | `r2-api.log`, `02-sequences.txt` |
| Identical re-placement shown as "placed — server-confirmed" | yes: server answered `unchanged: true` (the 24e8cb5f4 path, all stores), client ignored it | `02-f4a-*`, `r2-api.log` |
| No remove control / no target for replace / pin advice that cannot work | yes | `05-…`, `06-f4c-add-leaf-form.txt`, `r1b-api.log` |
| Transmit refusal names an API route, ends "..", omits gateway credentials | yes | `01-f5-*`, `r3-api.log` |
| Submission Center ignores the open project; 510(k) verdict on every mount | yes (header names HLV-333 with Vorelinib open; two `POST /api/510k/estar/assemble`) | `01-f6-*` — **not fixed** |

Red/green: `server-red.txt` and `client-red.txt` hold the new and changed tests run against HEAD's sources
(red) and against the change (green).

Writes made in the QA database through the UI (no SQL writes): sequence 8 (`0000`, Nexavir, submission 7)
created and moved to Validated; leaf 68 (1.5) placed in it; one freeze signature
`act_772cf9fa9c4c4a988da0ec4ed54acdff` on `ectd-sequence:6` for a freeze the server refused (the defect being
reproduced); one refused gateway transmit probe.

Not verified at runtime: the 5078 server runs the code from before these changes and was not restarted, so the
fixes are verified by tests only. Dispatch and transmit cannot be reached in this environment (the Shadow Review
stand-in never returns valid JSON).
