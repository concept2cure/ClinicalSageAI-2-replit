# CAPA state, vigilance and critical audit — 2026-10-14

Scope: O01's single discarded audit helper in the existing CAPA/complaint/MDR
service. It served eight mutation types. Simply forwarding its old audit result
would have retained a more serious defect: state committed before its vigilance
event, and both committed before a potentially absent platform audit row.

Every public service entry now requires a distinct trusted caller identity. The
API derives it from authenticated request context; four existing AnA handlers
derive it from `ToolContext.userId`. Model/request fields such as `createdBy`,
`actor`, `actorRole` and `userId` cannot supply service authority. The service
reads active current membership and applies the existing canonical
`authorizeAuthoringProgram` policy to the actual programme/project relationship.
Writes use the existing `GOVERNED_WRITE_ROLES`; private access is the canonical
project policy, including its recorded review access. No new permission model,
programme relationship, table or migration was introduced.

Each mutation now holds one actual PostgreSQL transaction and connection for
the state change, vigilance event and `writeChainedAuditRow`. Current actor,
programme, anchor and private-sharing dependencies remain locked through commit.
Canonical admission runs again after any lock waits. Transitions lock and reread
the record before applying the existing state machine. Generated display codes
are serialized by programme and have bounded uniqueness retries inside
savepoints. MDR complaint back-links are in the same transaction and require the
actual source complaint to belong to the selected programme. Changes stamp the
actual update time and verified actor.

An audit or timeline refusal before commit rolls back all three records. Only a
confirmed commit produces `{persisted:true,chained:true}`; the API forwards it
through root `meta.auditTrail`. If COMMIT's completion is lost, the service
discards the uncertain connection and returns HTTP 503 `CAPA_COMMIT_UNCONFIRMED`
with a stable record id and authenticated readback URL. It does not claim a
rollback or retry the potentially committed operation. Reads and recovery apply
current actor and private-project policy. AnA preserves `status:unconfirmed`, the
safe error code and readback receipt; existing tool telemetry records this as
degraded rather than falsely successful.

Explicit unanchored programmes return canonical HTTP 409 and require a verified
project relationship. No backfill is fabricated. Organization-wide queues
filter to currently accessible, uniquely anchored programmes before applying
record limits. A lost actor or verification outage remains an error, never an
empty queue.

## Qualification

- `continuation-capa-focused.log`: **25 passing tests / 3 files** — transaction
  completion, authority, uncertainty, missing critical audit, lost-actor list
  admission, four actual registered AnA handler handoffs and existing tool cases.
- `wave3-capa-native.log` / `.json`: **12 passing native cases** using genuine
  authentication/ALS, verified TLS, deployed non-superuser/non-bypass
  `app_service`, canonical tables and FORCE RLS. No fixture schema, policy,
  trigger or grants were installed. The cases exercise all eight actual mutation
  types, sixteen real timeline/audit refusal requests, private/foreign reads and
  queues, a current viewer with forged admin claims, wrong-programme back-link
  refusal, concurrent transitions/codes and actual tenant-chain/HMAC verification.
- The native pause immediately before audit proves six concurrent changes are
  blocked with actual PostgreSQL `55P03`: actor membership deletion, programme
  deletion timestamp, project anchor movement, visibility change, member
  revocation and insertion of a previously absent ACL row through its parent FK.
  Other connections see none of the pending state/event/audit before commit.
- The native completion-loss case executes the real COMMIT and then suppresses
  its completion signal. It proves durable state/event/audit, the uncertainty
  receipt, connection destruction, absence of a claimed rollback, and authorized
  readback.
- `wave3-capa-critical-chain-red.log`: removing the critical write while leaving
  the would-be success counter/receipt fails **4 native cases**. The exact
  original source was restored before the accepted native run. Audit retargeting
  fails the canonical chain-position trigger with `23000`; timeline retargeting
  fails actual RLS with `42501`. Neither is a simulated successful audit.
- `continuation-capa-ana-uncertainty-red.log`: the prior uncertainty envelope
  fails **2 handoff cases** because it would be counted as tool success. Restored
  handlers pass and actual `classifyResult` reports degraded.
- Scoped ESLint: **0 errors / 6 warnings** across the CAPA source and new focused
  tests. The existing AnA monolith has **0 errors / 98 warnings**; the native test
  has **0 errors / 1 warning**. Warnings remain visible, not waived.
- Discarded-audit scanner and `scripts/ai/verify-tests.sh` pass; the latter is a
  companion-file presence check and does not qualify execution.

## Reachability and limits

Current client consumers `useTriageQueue` and `useCerPmsFeeds` read these APIs.
No current client mutation form was found. The two existing AnA creation tools
use the repaired canonical service and preserve its audit/recovery receipts.
Launch fences remain in place; this repair activates no additional product
surface. Internal tracked MDR status is not evidence of an actual agency
transmission or acknowledgement. Existing state-machine rules and caller-supplied
clinical narratives are not newly qualified by transaction integrity.

No commit, push, deployment, live agency operation or external message occurred.
