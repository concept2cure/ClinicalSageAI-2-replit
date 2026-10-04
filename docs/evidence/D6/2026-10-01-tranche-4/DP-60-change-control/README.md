# DP-60 — QMS change control refuses a viewer

Found 2026-10-01 by the review of P1-31. On `/api/mdx/qms/changes`, create, edit, lifecycle transition, delete and
the link add/remove carried no role gate: a viewer could open, change, move through its lifecycle and delete a change
record. Only the approve step (a signature with its own authority check) refused it. All six writes now carry
`requireEditorAccess`, as the document, supplier, audit and nonconformance writes do (P1-31). Reads are unchanged.
The change-approval test harness now names its caller as a member (its signer role is mocked separately).

| Check | Red | Green |
|---|---|---|
| `server/routes/__tests__/qms-changes.test.ts`, a viewer on each of the six writes | 6 failed: the handler ran (`red/qms-changes.txt`) | 403 with no query; every QMS route suite 134/134 (`green/qms-changes.txt`) |
