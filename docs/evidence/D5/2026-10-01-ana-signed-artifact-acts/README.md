# D5 — approving or locking an artifact is an electronic signature on every door (2026-10-01)

Row **D5**. Lane: `…session_01SuVLo2`, claimed `41eaa960`. This closes two hand-ons of 2026-09-28 that were still open at `c41b758a`, with neither named lane on the board:
- **Item 10.** AnA `update_artifact_status` approves and locks on a reason only.
- **Item 6.** The `authoring-actions` approve and lock routes write no signature.

## Before

| Door | Approve (review → approved) | Lock (approved → locked) | Reachable by a person |
|---|---|---|---|
| Status route `PUT …/artifacts/:id/status` | Signed (2026-09-28) | Signed | No: no client caller |
| AnA `update_artifact_status` | **A reason only.** No re-authentication, no signature, no version recorded. | **A reason only.** No signature, no snapshot. | **Yes**: chat, then the governed-action sign-off |
| `POST /api/authoring-actions/approve-artifact` | **No signature at all** | n/a | No caller |
| `POST /api/authoring-actions/lock-artifact` | n/a | **No signature at all** | No caller |
| AnA `create_artifact` and `POST /api/cortex/save-draft` (found by the review below) | **Wrote `status: 'approved'` from the call**, at the confirm tier (one click) | **Wrote `status: 'locked'`**, and could overwrite a signed, locked artifact in the same section | Yes |

## After

Both acts are the status route's signature, committed through one act (`server/services/artifact-signed-act.ts`). The checks before them live in one place (`server/services/artifact-approval-act.ts`):
- the role table;
- the transitions;
- a lock must cover the approval;
- the contradiction gate;
- the review quorum.

| Commit | What it changes |
|---|---|
| `dacc2ff8` | **The tier follows the call.** `update_artifact_status` to approved or locked is the e-signature tier, with the act's own meaning: `approval` or `release`.<br>**The meaning is checked first.** The governed-action route refuses any other meaning before it checks the password.<br>**One signed path.** The handler commits through the status route's act, using the status route's checks. The status route now reads those checks from the shared module, and its suites are unchanged (`green/status-route-unchanged.txt`).<br>**The dialog.** It offers only the meaning the act fixes, already chosen, and adds Release.<br>**Attestation.** The statement of intent the server records is the one the dialog shows (`shared/constants/signature-attestation.ts`). |
| `1631dfb0` | **Review follow-up** (below).<br>The artifact writer writes draft or review only, and never overwrites an approved or locked artifact. This covers every caller.<br>The tier and the handler read one normalised status.<br>Release is declarable only where the act fixes it.<br>The ledger row names the door (`ana-governed-action`), and the signature's time is when the signer was verified. |
| `7038fec5` | **The unsigned `authoring-actions` twins are removed.** The commit names the replacements by path: the status route and AnA's signed command, each pinned by its suite.<br>What the twins' suite pinned (lock coverage, and every review-quorum branch) is pinned on AnA's door. |

## Red, then green

| Suite | Red on trunk | Green |
|---|---|---|
| `ana-signed-artifact-act.pglite.integration` (PGlite, real handler) | `red/ana-signed-act.txt`: **12/12**. AnA approves and locks on a reason, for any role and any meaning, and records no version or signature. | `green/final-signed-suites.txt`, with the cases added by `1631dfb0` and `7038fec5`: **28/28** |
| `governedActionArtifactSignature` (the route) | `red/route-artifact-signature.txt`: **8/9** (the review case passes on both) | `green/route-artifact-signature.txt`: **10/10** |
| `part11-governance` tier rules | `red/part11-governance.txt`: the functions do not exist on trunk | `green/part11-governance.txt` |
| The dialog (`governed-action-signoff-fixed-meaning`) | `red/client-fixed-meaning.txt`: **4** | `green/client-fixed-meaning.txt`: **29/29** with the existing sign-off suite |
| Review follow-up: writer, casing, door, time | `red/followup.txt`: **22**. "review → Approved" and "→ archived" are written raw; the writer accepts `locked`. | `green/followup.txt`: **65/65**. The writer suite is **9 red, 13/13 green**; `1631dfb0`'s message says "11/11", which is a miscount. |
| `authoringActionsUnsignedActsRemoved` | `red/twins-removed.txt`: **2/2**. Trunk answers 200 "Artifact approved." and "Artifact locked for submission." with no signature. | `green/twins-removed.txt`: **2/2** (404, nothing written) |

Three suites pinned the old contract, "succeeds and records nothing":
- `artifact-status-approval-version`
- `artifact-approval-follows-status`
- `artifact-status-transitions`

They were restated, not deleted. Each keeps its starting states, which are now refused without a signature, with the row unchanged.

## The review

An independent read-only review of `dacc2ff8` (a security-auditor agent) found:
- the `create_artifact` / save-draft door;
- the status-casing hole;
- Release accepted on unrelated actions;
- the ledger surface and authentication timestamp.

All were fixed in `1631dfb0`, each red first. The reviewer also checked these, and found them sound:
- **Every door.** No caller other than the governed-action route stamps `humanConfirmed` or builds a sign-off. The MCP connector reaches no AnA command.
- **Params.** Every tier caller passes them, and on a held run the tier and the execution read the same row.
- **Status route.** Its behaviour is unchanged.
- **Tenant scoping and atomicity.**

## Not done, recorded

- **The signer's IP address.** The command context carries none, so the signature records the address as unknown rather than inventing one.
- **No governed-context gate on AnA's path.** The status route's `GOVERNED_CONTRACT_INVALID` check and its `metadata.harness` refresh read the HTTP request body, so AnA's path does not apply them.
- **The version is not in the proposal.** The signature binds the version current at signing. A lock over an edit made after the approval, and an approval over reviewer decisions on an earlier version, are both refused. An approval with no reviewers assigned binds whatever version is current when the person signs.
- **The contradiction check fails open** when it cannot run. This is inherited from the status route and now applies to both doors. It is the contradiction engine owner's to change.
- **Who can approve through AnA.** The intersection of RBAC `minRole: manager` and the status route's role table means only an `admin` approves or locks through AnA. That is fail-closed, and narrower than the status route.
- **Failures outside this change.** In the wide run, 28 tests in 5 files fail (`green/wide-run-summary.txt`): `approval-workflow.contract`, `evidence-sufficiency-5xx-containment`, `predicate-intelligence-error-containment`, `rim-date-validation`, `se-matrix-5xx-containment`. They fail identically with trunk's copies of this change's files (401 / 500 where the tests expect 400 / 502). These are other lanes' files and were not touched.
