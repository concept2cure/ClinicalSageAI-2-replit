# The standard job roles by client type: slice 1, the catalog (P-119, 2026-11-10)

The founder, 2026-11-10: "Add user roles per biotech, pharma, CRO, cmc - and so on to align to the many use cases of
the entire platform." Decision P-119 (`docs/LAUNCH_DEFINITION_OF_DONE.md`); design
`docs/design/CLIENT_TYPE_JOB_ROLES_2026-11-10.md`. This is slice 1: the catalog as data, with its test. Nothing
imports it yet. Slice 2 reaches it from Administration.

## What already exists

The design's "What already exists" table is the search (RULE 3). In short:

- The six access levels (`shared/constants/org-roles.ts`) decide what a person may do. They do not change.
- The job-role store (`qms_job_roles`, P-49) holds an organisation's job functions and who has them. Every
  organisation starts with none, and the only screen that manages them is Quality's training dialog.
- The client-type presets (`shared/regulatory/client-type-profiles.ts`) say what each industry defaults to. They do
  not list the functions that work in it.
- The program plan's tasks each name a function by key (26 keys in `services/regulatory/`), with no link to a person.

## What this slice adds

`shared/regulatory/client-type-job-roles.ts`, beside the client-type presets: 53 standard job roles in nine function
groups, and the list offered to each kind of organisation. It is data and pure helpers. It adds no screen, route,
service, table or AnA tool, and nothing in it can grant access: a role only suggests a level.

| Function | Job roles (the access level each usually takes) |
|---|---|
| Regulatory (8) | Regulatory affairs lead (Approver); Regional regulatory lead (Reviewer); Regulatory affairs associate (Member); Regulatory operations lead (Reviewer); Labeling lead (Reviewer); Medical writer (Member); Lead medical writer (Reviewer); Regulatory consultant (Member) |
| Clinical (8) | Clinical development lead (Reviewer); Medical monitor (Reviewer); Clinical operations lead (Manager); Clinical trial manager (Member); Clinical research associate (Member); Clinical pharmacologist (Reviewer); Sponsor-investigator (Reviewer); Study coordinator (Member) |
| Data and statistics (3) | Biostatistician (Reviewer); Statistical programmer (Member); Clinical data manager (Member) |
| Safety (3) | Pharmacovigilance lead (Reviewer); Drug safety associate (Member); EU qualified person responsible for pharmacovigilance (QPPV) (Reviewer) |
| Nonclinical (1) | Nonclinical lead (Reviewer) |
| CMC (8) | CMC lead (Reviewer); Regulatory CMC lead (Reviewer); Analytical development scientist (Member); Formulation and process development scientist (Member); Manufacturing lead (Member); Quality control analyst (Member); Supply chain lead (Member); Qualified person for batch certification (Approver) |
| Quality (5) | Quality assurance lead (Approver); Quality assurance specialist (Member); Document control specialist (Member); Internal auditor (Member); Computerised system validation lead (Approver) |
| Device and diagnostics (12) | Design engineering lead (Reviewer); Device software engineer (Member); Risk management lead (Reviewer); Human factors engineer (Member); Manufacturing engineering lead (Member); Clinical evaluation lead (Reviewer); Person responsible for regulatory compliance (Approver); Post-market surveillance lead (Reviewer); Management representative (Approver); Assay development scientist (Member); Performance evaluation lead (Reviewer); Clinical laboratory director (Approver) |
| Program (5) | Executive sponsor (Approver); Project director (Member); Project manager (Manager); Market access lead (Member); External reviewer (Viewer) |

| Organisation | Roles offered | By function |
|---|---|---|
| Biotech | 36 | Regulatory 7, Clinical 6, Data and statistics 3, Safety 2, Nonclinical 1, CMC 8, Quality 5, Program 4 |
| Pharma | 37 | Regulatory 7, Clinical 6, Data and statistics 3, Safety 3, Nonclinical 1, CMC 8, Quality 5, Program 4 |
| CRO | 23 | Regulatory 6, Clinical 4, Data and statistics 3, Safety 2, Quality 5, Program 3 |
| Medical device | 29 | Regulatory 5, Clinical 4, Data and statistics 2, Nonclinical 1, Quality 5, Device and diagnostics 9, Program 3 |
| Academic | 8 | Regulatory 2, Clinical 2, Data and statistics 1, Quality 1, Program 2 |
| Regulatory consultancy | 10 | Regulatory 6, CMC 1, Quality 1, Program 2 |
| Medical writing | 5 | Regulatory 2, Quality 1, Program 2 |
| Diagnostics (a device organisation working in IVD) | 32 | Regulatory 5, Clinical 4, Data and statistics 2, Nonclinical 1, Quality 5, Device and diagnostics 12, Program 3 |
| Health system or academic (client type) | 8 | Regulatory 2, Clinical 2, Data and statistics 1, Quality 1, Program 2 |

CMC is a function group, as P-119 decided. A biotech and a pharma organisation are offered all eight CMC roles; a
regulatory consultancy is offered the regulatory CMC lead.

Each role carries:

- a name and a one-sentence description that fit the store's limits (80 and 500 characters);
- the access level it usually takes, with the reason as a clause, read from what each level can really do
  (`server/services/tenant/role-scopes.ts`). No role suggests Administrator;
- the work areas it uses, as launch-catalog surface ids;
- the plan task roles it answers to, so a plan task can be matched to the people who hold the role.

The helpers: `standardJobRolesFor`, `standardJobRolesByGroup`, `suggestedAccessLevel`, `jobRoleForPlanTaskRole`,
`matchStandardJobRole` (exact, ignoring case and spacing, never fuzzy) and `standardJobRole`.

## How it was made

One author wrote the test first and then the catalog. Five subject-matter reviews read it: drug development
(regulatory, clinical, CRO); CMC and quality; device and diagnostics; access and Part 11; wording. They returned 60
findings, three of them blocking. A reviser applied 52 and declined 10, each with a reason. Two verifiers then checked
it (mutations and gates; completeness and truth) and found nine more points. A repair applied eight and declined
three. A final verifier, with its own mutation driver, passed it.

What the reviews changed, in the main:

- **Levels follow what each level can do here.** The computerised system validation lead became Approver, because a
  Manager cannot sign the validation deliverables the role is accountable for. The internal auditor became Member,
  because a Viewer cannot record an audit. The CRO project director stayed Member, because Manager reaches every
  project in the organisation, and a CRO keeps its sponsors' work apart.
- **Each organisation is offered what it staffs.** A biotech is offered the whole CMC group and the roles a marketing
  application needs. A device organisation is offered a nonclinical lead (biocompatibility) and a manufacturing
  engineering lead. A CRO is not offered the executive sponsor, which is the sponsor's.
- **A drug-only function is not offered to a device organisation, and the reverse.** The EU QPPV and the qualified
  person are for medicines. The person responsible for regulatory compliance is for devices and diagnostics.
- **No clause of a regulation or standard is cited.** Each description says the function in plain words.
- **Every plan task has an owner in every organisation that runs that plan.** An academic sponsor-investigator holds
  the CMC, nonclinical, safety and writing tasks of its own IND plan (`PLAN_TASK_ROLE_HOLDERS_ELSEWHERE`).

## Proof

- **Red first.** The module missing; then the module with one role: 8 of 37 tests failed, among them 25 of the 26
  plan task roles with no job role and 11 organisations with no roles.
- **Green.** `npx vitest run shared/regulatory/__tests__/client-type-job-roles.test.ts --maxWorkers=2`: 44 tests pass
  (run again by the lead on 2026-11-10).
- **The test reads, it does not copy.** The plan task role keys come from the plan engines by import and from their
  source text; the program's fifteen functions come from `docs/design/THE_PROGRAM_2026-11-01.md` section 3.4; the
  work areas come from the launch registry.
- **Mutations.** The author's 18, the first verifier's 41 and the final verifier's own set, one change at a time, each
  file restored and its digest checked. The first verifier found one the test missed (a reading role raised from
  Viewer to Member); the repair added the rule "only reads exactly when it is Viewer", and the final verifier's
  mutation of it is caught.
- **Gates.** Scoped `tsc` and ESLint on both files: no errors. `ci:one-product`: "101 surfaces, 11 rail entries, none
  new". `ci:unreferenced-modules`, `ci:launch-scope` and `ci:check-test-imports` pass.

## Left for slice 2 and for other owners

1. **Show the suggestion as "Usually {level} access: {reason}"** under the role's name. Where a deployment changes
   who may sign, the screen reads the level's scopes from `roleScopesOf` and does not repeat the catalog's words.
2. **When an administrator adopts the standard roles, prompt them to designate QMS approvers.** Until they do, every
   member with the Approver level approves QMS documents, and several standard roles suggest Approver.
3. **Let the section offer roles from another function group**, so a contract manufacturer signed up as a CRO can
   adopt the CMC group. Whether a CMC-only organisation is a client type of its own stays the founder's (P-119).
4. **The validation package is under Administration, which only administrators open.** The validation lead cannot
   reach it by their own access level.
5. **No access level reads the audit trail without also writing governed records.** An internal auditor who should
   only read has no level that fits. This is a product gap for the access-level owner, not a catalog change.
6. **For the CMC lane:** batch release checks signing authority and re-authentication, and not that the releaser is
   someone other than the author (`server/api/cmc/batchRecordRoutes.ts`). Recorded in COORDINATION.md.
7. **A marketed biotech with an EU authorisation is not offered the EU QPPV**, because sign-up files every biotech as
   "biotech". The administrator can still create the role by name.
8. One "consider" from the final verifier is open: the test does not yet hold that a device-only function is kept
   from an organisation that serves sponsors (a CRO). The data is right today.
