# User roles by client type: the job-role catalog, and Administration reaching the job roles

Founder decision P-119 (2026-11-10): "Add user roles per biotech, pharma, CRO, cmc - and so on to align to the many use
cases of the entire platform." Packages: R1 (Administration reaches the job-role store) and L1 (launch rows D2 and D6).
Evidence: `docs/evidence/F1/2026-11-10-client-admin/job-roles/`.

This design completes what exists. It adds no screen, route, service, table or AnA tool (RULE 6).

## In short

A person has an **access level**, which decides what they may do, and **job roles**, which say what their function is.
The six access levels stay as they are. The job roles get a standard catalog for each client type. An administrator
adopts the catalog into the organisation's own job roles and gives them to members, in Administration. A job role
suggests an access level. It never grants one.

## What already exists

Searched on 2026-11-10 at `23092f458`, by every name a role could have: `role`, `ASSIGNABLE`, `ROLE_SCOPES`, `persona`,
`job role`, `jobRole`, `job_function`, `functional`, `responsibilit`, `RACI`, `groups`, `discipline`, `assignedRole`,
across `shared/`, `server/`, `services/`, `client/src/concept2cure/` and the migrations.

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| The six access levels | `shared/constants/org-roles.ts` (`ASSIGNABLE_ORG_ROLES`: admin, approver, manager, reviewer, member, viewer; P-18) | The vocabulary an administrator assigns. `approver` extends `manager` and `reviewer` extends `member`. `organization_users_role_known` (P-72 slice 1a) holds the column to it | Say anything about a person's function |
| What each access level may do | `server/services/tenant/role-scopes.ts` (`roleScopesOf`) | Reads each scope from the check that enforces it (signing policy, governed-write roles, audit readers, administrators). Shown in Administration's "Roles + scopes" tab | — |
| Job roles | `migrations/20261029g_qms_job_roles_and_training_assignments.sql` (`qms_job_roles`, `qms_job_role_members`); `server/services/qms/training-assignment.ts`; `GET/POST/PATCH/DELETE /api/mdx/qms/job-roles` and `…/:id/members` (`server/routes/mdx-qms-training.ts`); `shared/qms/training.ts` (P-49) | "A job role is a job function the organization manages, not a permission role." Each write is governed, with a reason, by an administrator only, and soft-deleted with its history kept | Offer any standard role: every organisation starts with none ("no seed rows"). Appear in Administration |
| The job-role dialog | `client/src/concept2cure/quality/TrainingCoverage.tsx` ("Job roles"), `quality/hooks.ts` (`useQmsJobRoles`) | In Quality's training coverage: lists roles and members; an administrator creates, renames, deletes, and adds or removes a member | Reach an administrator who is not in Quality's training screen. It is the only place a job role can be managed |
| The member list | `client/src/concept2cure/v2/surfaces/AdminAccess.tsx` (the "Groups" column and the member detail's "Groups"); `server/routes/mdx-admin.ts:188` (`groups: [] as string[]`) | Draws a Groups column | Ever hold a value: the server always answers an empty list |
| Changing an access level, inviting | `surfaces/AdminMemberActions.tsx` (`ROLE_OPTIONS`), `AdminAccess.tsx` ("Invite member"), `surfaces/Onboarding.tsx` (the invitations step); `server/routes/tenant-users.ts` | Offers the six levels, by name | Say which level suits which function |
| Client types | `shared/regulatory/client-type-profiles.ts` (`IndustryMode`: biotech, pharma, cro, medtech, academic, regulatory, medical_writing; `ClientType`: medtech, biotech, pharma, diagnostics, cro, health); `GET/PATCH /api/mdx/industry-profile`; `surfaces/OrganizationProfileCard.tsx` | The preset table per industry: AnA's emphasis, terms, the default approval path, the default document type | List the functions that work in each |
| Task roles in the program plan | `services/regulatory/pyramids/`, `services/regulatory/globalPyramids.ts` (`role`, `assignedRole`: 26 keys such as `ra_lead`, `cmc_lead`, `regulatory_ops`, `qa_manager`, `medical_writer`) | Each plan task names the function that does it | Share a vocabulary with job roles: a task's role cannot be matched to a person |
| The program's roles | `docs/design/THE_PROGRAM_2026-11-01.md` §3.4 (fifteen functions and what each is accountable for) | The reference list this catalog is written from | — |
| Project responsibilities and sharing | `surfaces/ProjectTeamResponsibilities.tsx` (project lead, project owner), `shared/project-sharing.ts` (owner, edit, use) | Per-project coordination and per-project access | — (unchanged by this design) |
| AnA's emphasis | `client-type-profiles.ts` `personaEmphasis`; `server/services/ana-context-router.ts` (`buildUserContext`) | AnA leans to the organisation's industry | Know the person's function |

Deleted history: `git log --diff-filter=D --name-only` for `role`, `persona`, `job-role` and `rbac` names finds no deleted
role catalog in the clone's reach (the clone is shallow; `git rev-parse --is-shallow-repository` answers `true`).

## The design

### 1. The catalog is data

One new data module beside the client-type presets, `shared/regulatory/client-type-job-roles.ts`:

- **The roles.** One table of standard job roles. Each has:
  - a stable key (`regulatory_affairs_lead`);
  - a name, of at most 80 characters, and a one-sentence description, of at most 500 (the table's own limits);
  - its function group;
  - the access level it usually takes, with a one-clause reason;
  - the work areas it uses, as launch surface ids;
  - the plan task roles it answers to.
- **The groups.** Regulatory; clinical; data and statistics; safety; nonclinical; CMC; quality; device and diagnostics;
  program.
- **By client type.** For each `IndustryMode` and each `ClientType`, the ordered list of role keys that apply. A
  diagnostics organisation gets the device roles and the diagnostics ones. CMC is a group, offered to every drug and
  biologic type.
- **Pure helpers.**
  - `standardJobRolesFor({ industryMode, clientType })` gives the list.
  - `suggestedAccessLevel(roleKey)` gives one of `ASSIGNABLE_ORG_ROLES`.
  - `jobRoleForPlanTaskRole(taskRole)` maps a plan task role to its catalog role.
  - `matchStandardJobRole(name)` finds a catalog role by an organisation's role name, ignoring case.

Suggested access levels follow least privilege:
- a role that approves or releases records takes `approver`;
- a role that reviews and signs as reviewer takes `reviewer`;
- a role that runs projects takes `manager`;
- a role that writes takes `member`;
- a role that reads takes `viewer`.

Nothing suggests `admin`: administration is a person's standing in the organisation, not a function.

### 2. An organisation adopts it

In Administration's roles tab, under the access levels, a section "Job roles" lists the organisation's job roles, read
from `GET /api/mdx/qms/job-roles`. While the organisation has none of a standard role, the section offers "Add the
standard roles for a {client type} organisation". The administrator sees the list, chooses all or some, states a reason
once, and each chosen role is created through the existing `POST /api/mdx/qms/job-roles`, with that reason. A role that
exists by name is skipped and said so. Nothing is created without the administrator's act.

### 3. A member's job roles

- The member list's "Groups" column becomes "Job roles", filled from the same read. The always-empty `groups` field is
  retired from the server's answer (`mdx-admin.ts`) and from the client (zero duplication: one source for a member's
  job roles).
- The member's detail lists their job roles. An administrator adds or removes one through the existing
  `POST` and `DELETE …/job-roles/:id/members`, with a reason. When the role carries training assignments, the existing
  writer raises the member's training tasks; the confirmation says so.
- When the administrator invites a person or changes an access level, the dialog shows, for a chosen job role, "A
  {role} usually takes {level}: {reason}". It is a suggestion. The select stays the administrator's.

### 4. One vocabulary with the program plan

`jobRoleForPlanTaskRole` maps each of the 26 plan task role keys to a catalog role. A test reads the keys from
`services/regulatory/` and fails when one has no mapping. The plan's files do not change here. S11 uses the mapping to
propose a task's owner from the people who hold the role.

### 5. States, refusals and words

- The section tells loading, a failed read and "no job roles yet" apart, through the one read classifier
  (`readFailureFor`), as the Vault and the Data Room do. A plan without Quality, a role without the right, and "not in
  this release" each read as themselves.
- A member sees their own job roles in Account. Only an administrator sees the controls.
- No id, key or enum value is shown. An access level is shown by its name ("Approver"), a job role by its name.
- Design: plan §2. A quiet section and list. No stat tile, eyebrow label or guidance box.

## What this does not decide

1. Whether a CMC-only organisation (a contract manufacturer) is a client type of its own.
2. Whether a job role should set what a person sees first (Home's suggestions, AnA's emphasis). The catalog carries
   each role's work areas so that D1 and S4 can read them; reaching them is their packages' work.
3. Whether job roles should be available to an organisation whose plan has no Quality module. Today the routes are
   Quality's. The section says so honestly where the plan refuses.

## Slices

| Slice | What | Files | Proof |
|---|---|---|---|
| 1 | The catalog and its helpers | `shared/regulatory/client-type-job-roles.ts`, its test | Every client type has roles; every role's name and description fit the table; every suggested level is assignable; every plan task role maps |
| 2 | Administration reaches the job roles: the section, adopting the standard set, the member's job roles, the suggestion | `surfaces/AdminAccess.tsx`, `AdminMemberActions.tsx`, a split-out `AdminJobRoles.tsx` in the same folder; `server/routes/mdx-admin.ts` (the `groups` field); the launch-scope claim for the job-role routes on the Administration screen | Red first. Used in the running app at 1440 and 390 as an administrator and as a member. Each write found in the audit ledger |
| 3 | The member's own job roles in Account | `v2/AccountPanel.tsx` | Used in the running app |

Slices 2 and 3 wait until the client-administration walk that is using the running app has finished, so the screens do
not change under it.
