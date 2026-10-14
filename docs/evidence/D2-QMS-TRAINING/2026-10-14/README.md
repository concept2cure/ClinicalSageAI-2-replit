# Quality controlled text and personal acknowledgement

2026-10-14. Workstream D2/W1. [Contract](../../../architecture/QMS_PERSONAL_TRAINING.md).

The existing Quality register now provides the native document owner and reader
path: prepare actual controlled section text in the existing `RichSectionEditor`,
review and release through the existing signing workflow, then personally read
and acknowledge that exact release. No separate Training/LMS app, approval
engine, table, dependency or model call was introduced.

## Result and integrity

- **Open document → Edit controlled text** saves draft/in-review bodies with an
  explicit reason, expected version and canonical digest. Saving returns the
  document to draft for review. Closing unsaved work requires a discard choice.
- **Read and acknowledge** displays verified released text and starts with an
  unchecked declaration. Only the signed-in person can attest; AnA and demo
  setup cannot attest for someone or for a team.
- A receipt binds the actor, version and exact content digest and retains the
  released text snapshot. Current coverage counts distinct active members with
  unexpired receipts for that exact release; old or unbound history is excluded.
- Text changes and new acknowledgements commit with their chained audit on the
  request transaction. Audit failure rolls both back; uncertain commit responses
  require rereading rather than reporting success or confirmed rollback.
- Actual controlled-text contributors accumulate in protected metadata while the
  original author remains. The canonical signing gate refuses any contributor's
  self-approval. Clients cannot seed fictional contributor history on creation.
- Account/organization changes clear the register and reader. Writes capture and
  pin the matching account/organization bearer before dispatch; late responses
  cannot publish into another identity's session.

## Verification

[Backend verification](backend-verification.md) records failing-before-repair
proofs and 147 passing tests across seven canonical SQL/native approval suites.
The final integrated run passes **514/514 across 29 suites**. Whole-repository
TypeScript has zero errors and the production build passes. Selected raw
verdicts are retained in [verification-verdicts.txt](verification-verdicts.txt).

The UI tests exercise the register, reader, actual authenticated transport and
existing editor, including stale revision, duplicate click, audit confirmation,
uncertain response, account change, viewer/read-only behavior and unsaved work.
The former AnA handler was temporarily restored for a negative control: its own
handler returned success and wrote SQL; the fixed refusal passes without SQL.
A separate pre-render bearer identity-swap negative control failed before the
captured-scope transport protection.

[Browser verdicts](browser-verdicts.json) exercise actual `QualityRoute`,
`AuthProvider` and `RichSectionEditor` on Vite with synthetic intercepted API
and account data. Light 1440px and dark 390px flows both prepare controlled text,
submit one personal acknowledgement and reopen the receipt, with no horizontal
overflow or page error. Screenshots retain released reader, editor and receipt
states. They contain only synthetic test data.

## Human verification boundary

Canonical PGlite executes the production QMS service SQL using canonical QMS
DDL; its audit/signature collaborators are controlled fixtures. Browser API,
account and authentication responses are synthetic. These checks do not
establish production RLS, audit-chain cryptographic validity, a live password
ceremony, deployment or regulatory validation. The credentialed OQ-006 runner
now prepares real controlled text before signing and uses the exact native
acknowledgement contract; it was syntax-checked here, not executed with live
credentials.

Run the [Quality human checklist](../../../testing/HUMAN_BETA_CHECKLIST_V1.md)
in a test organization with editor, independent approver and reader identities.
Retain actual document, audit, signature and receipt identifiers. This feature
records personal reading and understanding; it does not certify competence or
satisfy a role-specific training matrix by itself.

Artifact-only, skeleton-only and unverifiable legacy releases stay unavailable
for acknowledgement and explain the reason. This work deliberately does not
read mutable artifact bytes or revive the parallel approval-orchestrator store.
