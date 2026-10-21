# D2 Projects — PM-03 identity and responsibility contract

Scope: the existing Projects Team & activity read. All client segments use the
same identity, sharing, review, and signing boundaries. No assignment, access,
delegation, or signing policy changes; no new surface, dependency, or migration.

## Frozen read interface

`GET /api/c2c/projects/:id/team` retains `team` and the legacy row fields
`user_id`, `role`, `name`, `email`. Add `program_id` and `project_id` identifying
the canonical admitted UUID program and integer project anchor. Each row adds:

- `entry_id`: `user:<id>` or `recorded-name:<position>`; only IDs deduplicate.
- `identity`: `active_member`, `unconfirmed_account`, or `recorded_name`.
- `label`: disambiguated current identity, account reference, or recorded name.
- `responsibilities`: recorded `project_lead` and/or `project_owner` facts.
- `sharing_role`: `owner`, `edit`, `use`, or null; a separate sharing fact.
- `sources`: any of `program_lead`, `project_owner`, `project_creator`,
  `project_member`, `recorded_name`.

`role` remains `lead` only for the recorded program lead, otherwise null.
Recorded names have no user ID, email, responsibility, or sharing role. A name
or email is never used to link an account. Account details are exposed only for
current same-organization members with active accounts; other account references
remain visible with unconfirmed membership and null identity details/sharing.
Owner and creator sharing membership follows the existing canonical sharing
normalizer; creator provenance does not imply business responsibility. Revoked
explicit sharing rows do not become roster members unless another recorded
source independently includes the user. No assignment date is synthesized.

The request database client and canonical current-program admission select the
anchor. Recheck admission before returning the roster. Missing stores or failed
verification are unavailable responses, never successful empty rosters. The UI
validates the response and current program scope and retains distinct loading,
unavailable, and genuinely empty states. AnA receives the same identity and
source distinctions as the panel, with roster totals and an explicit truncation
flag for her bounded excerpt. Existing email exclusion remains: email fields,
email-bearing display labels, and recorded names containing an email address do
not enter her team facts; stable account/entry IDs retain identity distinctions.

## Responsibility and authority matrix

| Recorded fact | Read | Edit | Manage access | Approve/sign | Delegate |
| --- | --- | --- | --- | --- | --- |
| Project lead | Current project admission required | Existing program mutation policy, including current role, applies | Existing sharing policy only | Document/workflow checks and signing ceremony apply | No new delegation path |
| Project owner | Current project admission required | Existing action-specific policy applies | Existing sharing policy only | Document/workflow checks and signing ceremony apply | No new delegation path |
| Sharing owner/edit/use | Existing sharing policy applies | Scope depends on the actual action; edit is not universal program mutation | Existing sharing policy applies | Sharing never proves approval/signing authority | No new delegation path |
| Recorded name | Grants no rights | Grants no rights | Grants no rights | Grants no rights | Grants no rights |
| Contributor, reviewer, approver, client observer | No project-wide business assignment inferred | Actual workflow and current admission apply | No implied administration | Review/approval assignments remain document-scoped | No generic delegation inferred |

Biotech, pharma, device, IVD, and CRO/consultancy teams can distinguish internal
coordination from client access and regulated decisions using this common
contract. Specialized business assignments and member/delegation writes remain
PM-04 follow-up work; this projection does not claim those are implemented.

## Verification targets

Actual HTTP and PostgreSQL admission: private/foreign projects, duplicate or
missing anchors, current membership revocation, subject standing, differing
lead/owner/creator, durable sharing and revocation, same-name accounts, legacy
names, read failure, and revocation during roster loading. Component/integration
tests: identity labels, honest empty/error states, invalid scope/payload, AnA
facts, and abandoned reads on program switches. Existing write and signing
policies must remain unchanged.
