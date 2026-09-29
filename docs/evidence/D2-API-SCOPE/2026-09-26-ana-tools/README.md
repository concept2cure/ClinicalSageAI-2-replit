# D2 / D6: launch scope applied to AnA's tools

**Row:** D2 / D6, the launch-scope API lane (`…session_01E8btkB8mcLirW4rNvsMNxK`).
**Date:** 2026-09-26.

## What was wrong

Since 2026-09-25 the API refuses the routes of apps outside the launch catalog.
AnA does not use those routes. Her tools call the same services in-process,
so in production a signed-in user could still ask her to create an IACUC
protocol, record a grant award, run an RBM assessment, write a 510(k) section
or open a device CAPA: apps the product hides. AnA tools and platform commands
carry no surface id, so there was nothing to apply launch scope to.

## The classification

Every tool (763) and platform command (115) was classified by reading its
handler and the service, table or route it touches. Seven read-only agents did
this in batches, and each result names the handler line and the records
touched. `hiddenApp` means it touches records of surfaces outside the launch
catalog only. Everything else is `inScope`: it operates a launch surface, or
touches no tenant records (guidance, literature, public databases,
deterministic calculators over the input).

| | Total | hiddenApp | inScope |
|---|---|---|---|
| Tools | 763 | **189** | 574 |
| Platform commands | 115 | **47** | 68 |

The hidden-app tools, counted by the first surface each names:

- research administration: 77 (IRB committees, IACUC, IBC, grants, COI,
  export control, controlled substances, effort, other support, DMS plans);
- RBM / central monitoring: 20;
- CMC stability and interview flows: 10;
- eTMF: 9;
- device diagnostics: 7;
- 6 each: agency meetings, device 510(k), insights reports;
- 5 each: device post-market, submission twin;
- 4 each: clinical ops, device clinical studies;
- 3 each: change assessment, device presub, labeling, lifecycle,
  nonclinical, registrations;
- 2 each: deep research, device CER, pharmacovigilance, risk;
- 1 each: CSR workflow, device software, device UDI, source tracer.

Checked before use: every name is a real tool or command, there are no
duplicates, and every surface named is a real registry id outside the launch
catalog. The same checks are now tests.

**Corrections made by hand, with reasons:**
- `get_portfolio_readiness`: the classifier said hidden (`insights`). It reads
  `report-os/portfolio`, which the stage-1 API work attributed to
  `ana-command`, a launch surface, so it is `inScope`.
- The command classifier reported 114 commands; there are 115. Each of the 68
  in-scope names was checked against its report.
- It also reported that `recommend_endpoints`, `evaluate_endpoint` and
  `generate_clinical_insights` read `csr_reports`/`csr_details` "with no
  organization filter". **Refuted:** both tables have `tenant_isolation_policy`
  with forced RLS (checked on the live schema), so production's non-superuser
  role is scoped by the database. It is not a cross-tenant read. The commands
  are hidden-app anyway.

**Known limit, stated plainly.** A tool or command that touches both a launch
and a hidden surface is `inScope`, the rule the API applies to a prefix two
surfaces claim. So some mostly-hidden capabilities stay reachable because
they also write launch records: `scan_contradictions` (it also feeds
Authoring's promotion gate), the submission-twin commands, `run_rim_scan`,
the module3 build/refresh commands, `generate_sap`, `pdev.activity.ai_draft`
and `pdev.ind_assembly.compile`.

## What changed (this commit)

- `server/services/ana/ana-launch-scope.inventory.json` holds the
  classification. `ana-launch-scope.ts` is the pure reader. The surface check
  runs at call time, so promoting a surface into the launch catalog brings its
  tools back without an inventory edit.
- `governedToolsetFor`, which `send-message`, `stream` and `deep-investigation`
  all compose through, withholds hidden-app tools when launch scope is enforced
  (production by default), including for an org-less turn.
- `ana-launch-scope.test.ts` fails when an enabled tool or command is in
  neither list. So a new tool cannot ship unclassified.

| Proof | Red | Green |
|---|---|---|
| Production toolset withholds hidden-app tools and keeps knowledge, launch tools, navigation and the bridge | 2 failed of 7: `create_iacuc_protocol` offered (`toolset-red.txt`) | 7/7 (`toolset-green.txt`) |
| An unclassified tool fails the suite | `search_literature` removed from the inventory, which fails (`guard-red.txt`) | restored, passes |

The neighbouring suites pass: `governed-toolset`, `catalog-gated-tools`,
`vault-named-tools-honesty`, `chat-path-parity` and `persona-client-files`
(52/52). None of the always-on tools is hidden-app.

## Not closed here: inside other lanes' 24-hour windows

- ~~**Platform commands.**~~ **Done 2026-09-29.** See the section below.
- **Execution.** Withholding a tool from the offered set is what the model
  sees. A refusal at execution belongs in the `registerToolHandler` wrapper
  (`AnaToolExecutor.ts`, window ends 2026-09-27 12:39 UTC), the one place every
  dispatch path passes through.
- ~~**The realtime door.**~~ **Picked up by its lane.** `ana-realtime.ts`
  now composes through `governedToolsetFor`, so the tenant deny-list and this
  filter hold on the socket too.
- **Navigation.** `list_app_screens`/`navigate_to` honour only the locked
  screens the client sends, and only the streaming door sends them. A
  server-side launch-scope lock needs `DEEP_LINK_ALIASES` in `shared/` and
  the handlers in `AnaToolExecutor.ts`.

## Platform commands refused (2026-09-29)

`authorizeCommand` (`server/services/ana-ri/command-rbac.ts`) is where the four
command paths meet: `execute_platform_command`, `POST /execute`,
`POST /governed-action` and chat command blocks. It now refuses a command
classified `hiddenApp` whenever launch scope is enforced (production by
default), with `LAUNCH_SCOPE` and the API's wording. The step runs after the
metadata check and before the tenant policy and the read-only early return. So
a hidden app's reads are refused too, and a tenant allow-list cannot re-open
what the release excludes. In-scope commands and development servers are
unchanged.

| Proof | Red | Green |
|---|---|---|
| `command-rbac.test.ts` launch-scope cases: `pdev.program.get`, `q_sub.create`, `post_market.document.create`, `cmc_status` and `search_precedents` refused for an admin; `list_projects`, `create_task`, `audit.explain` and `module3_build_all` untouched; dev unchanged | 1 failed of 35 (`commands-red.txt`) | 35/35 (`commands-green.txt`) |

The inventory guard has already done its job once. On 2026-09-28 `7f82872dd`
added sixteen protocol-authoring tools without classifying them.
`ana-launch-scope.test.ts` failed, and that lane classified them in
`759049b5c`.

Unrelated and not touched: `artifact-status-approval-version.pglite.test.ts`
fails 2 of its tests on trunk without this change. The cause is
`update_artifact_status` message wording, in a file `…01YZFCXR` edited in
`c0056614d`.
