# P1-34 (DP-36) — every AnA tool is classified, and the class is enforced

Row **D6** (security) with **D5** (AnA governance). Plan item P1-34 in
`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`; finding DP-36 in
`docs/security/SECURITY_AUDIT_2026-09-24.md` (re-opens DP-08 in part; DP-31, DP-32).

## What was wrong

P0-12 made every platform command that writes a proposal a person confirms. AnA
reaches those through one tool, `execute_platform_command`. She also has 762
other tools, and the ones that change records do it on their own handlers — the
command partition never saw them. Five were gated on 2026-09-26 (the first slice
of this item). Every other writing tool ran on the model's word: a monitoring
signal raised, a DEA registration created, a committee member's vote cast, a
training attestation written in the user's name, a TMF artifact set to final.

## What changed

| | |
|---|---|
| `server/services/ana/tool-authorization.register.json` | One entry per registered tool (763): its class, what it writes, where. |
| `server/services/ana/tool-authorization.ts` | The classes, the 21 input rules, the lookup, the refusal text. Pure. |
| `server/services/ana/AnaToolExecutor.ts` `preHandlerRefusal` | The registry wrapper every handler is registered through — every path: the SSE stream, the agentic loop (`/api/chat`, deep investigation), MCP, a tool calling a tool. `refuse` → refused whatever was confirmed; `confirm` or unknown → a proposal unless a person confirmed this call. |
| `server/services/ana/governed-tool-gate.ts` | The gate the live stream asks before dispatch reads the register; new verdict `REFUSED`. The hand-kept list of five (`CONFIRM_TIER_TOOLS`) is gone — folded into the register. |
| `server/routes/ana-ri/stream.ts` | A `REFUSED` call is answered and not dispatched; the held-run context is recorded for every tool. |
| `server/routes/ana-ri/utility.ts` `heldToolDecision` | The governed-action route runs a held tool only if the register, asked again on the held params, says `confirm`. |

### The classes

| Class | Count | Means | At runtime |
|---|---:|---|---|
| read | 552 | no lasting effect | runs |
| self | 14 | AnA's own working state (interview progress, scratch documents under `tmp/docbuilder` filed nowhere, her read receipts) | runs |
| confirm | 159 | creates or changes a tenant record, files, notifies, writes to another system, or runs code | proposed; runs on a person's yes |
| refuse | 16 | a person's own act — an approval, a vote, an attestation, an execution, a transmission | refused, with or without a yes |
| conditional | 21 | one of the above depending on what the call asks | the rule decides per call |
| command | 1 | `execute_platform_command` | the command partition decides, as before |
| *not in the register* | 0 | a tool added later | **proposed** (fails closed) |

Of the 16 refusals, 14 were already refusals in their own handlers (the
`finalize_*`, `approve_*`, `execute_*`, `certify_other_support`,
`transmit_submission`). Those answer better than a generic refusal can — who
signs, where, and for `finalize_protocol_document` what is still missing — so the
register marks them `refusedBy: "handler"` and lets the handler answer.
`ana-cannot-sign.test.ts` pins every one of them to write nothing, and fails if
the register and the pinned set ever differ. The two new refusals are
`cast_committee_vote` (casts, or overwrites, any member's vote) and
`ack_training` (a training attestation in the user's name with a model-supplied
quiz score). Two conditional branches are handler-owned the same way:
`qms_change_transition` to `approved` (the change-control service refuses it
and names the signed Approve button; pinned in `qms-change-tools.test.ts`) and
`place_project_document` with `confirm_suggested` (the handler says what AnA can
do instead; pinned in `tests/db/vault-placement.dbtest.ts`).

The conditional rules refuse the branch that would take a person's act —
`qms_change_transition` to `approved` or `closed`; `update_tmf_artifact_status` /
`classify_tmf_artifact` to `final`; `set_registration_status` to `approved`;
`create_clinical_study` with `irb_approved`; `log_cs_transaction` with a named
witness; `screen_subaward` to `cleared`; `add_risk_control` as verified or
effective; `add_labeling_translation` with a verified back-translation;
`report_protocol_deviation` with severity and safety impact together (the
reportability assessment); `update_invention_disclosure` to a Bayh-Dole
decision; `create_per_document` / `create_software_lifecycle_item` as approved or
superseded; `place_project_document` accepting a suggestion — and propose the
rest. Four decide read versus write (`review_schedule_of_events_health` `apply`,
`run_rbm_assessment` `seed`, `commit_intelligence_flow` `dry_run`,
`scan_document_citations` `persist`, `assemble_briefing_book`), two decide self
versus write by where a file lands (`convert_docx_to_pdf`, `generate_document`).

## How the tools were classified

1. **Static scan** (`scan.json`): all 763 registered names (`all.names`, from the
   live registry), each handler searched for write signals. 164 candidates.
2. **Candidates** (`verdicts/candidates-batch0..3.txt`): each traced to its
   write by a reviewer reading the handler and its services.
3. **The scan's misses.** A seeded random 50 of the 573 presumed reads
   (`readsample.txt`) was traced: 5 were writes (10%) — writes inside services
   whose names are not write verbs (`raise_monitoring_signal`,
   `predict_change_impact`, `catalog_project_document`, `build_from_template`,
   `set_protocol_budget_params`). A 10% miss rate means the scan cannot be the
   classification, so **every one** of the 573 was then traced two levels deep
   (`verdicts/presumed-read-batch0..7.txt`, non-reads in `*.nonreads.txt`).
   That found 64 non-reads, **43 of them writes that were running unconfirmed**
   (38 confirm, 5 conditional) — 7.5%, consistent with the sample. The 26
   `global_ri_*` tools were checked by reading their module: every import is
   internal, nothing reaches a database, a file or the network.
4. `gen_register.py` builds the register from the verdict files; run it from
   this folder and it reproduces the committed JSON exactly.

Decisions taken on the verdicts, where a reviewer's call was changed:

- **`retire_qms_document`: confirm, not refuse.** The handler requires a reason
  of eight characters and records a governed action (pinned by
  `qms-change-tools.test.ts`); the person's own route has no signature either.
  With a person's yes on top it is a governed write. Whether retiring should be
  signed is a hand-on (below), not something to decide by refusing it in chat.
- **`revise_qms_document`: confirm.** It opens a controlled revision with a
  required reason. That it withdraws the effective version in place is a data
  model defect, handed on.
- **Scratch documents are `self`.** `insert_document_content` and
  `insert_clause_template` were rated confirm by one reviewer and their siblings
  self by another; every tool that writes only to `tmp/docbuilder` and files
  nothing is `self`.
- **Unsure is confirm.** `suggest_predicate_devices` and `generate_se_matrix` POST
  to a service outside this repository with an admin token; whether it persists
  cannot be read here, so they are proposed. `check_submission_status` writes
  only for agency-polling gateways, which depends on the target row, so it is
  proposed.

## Red, then green

- `red-enforcement.txt` — `tool-authorization-enforcement.test.ts` against the
  pre-change wrapper and gate: **12 of 15 fail** (a missed write runs; a vote is
  cast on a confirmation; an unknown tool runs; the gate calls every write
  ungoverned). The vote case took 406 ms because the handler really ran and
  reached for the database.
- `red-drift.txt` — the anti-drift test with `raise_monitoring_signal` removed from
  the register and a retired name added: **both directions fail, by name**.
- `red-route.txt` — the governed-action route test against the pre-change route
  and gate: **exactly the three new cases fail** (a write outside the five cannot
  be confirmed; a held `closed` transition is not recognised as a refusal; an
  unknown held tool is not a tool).
- `green.txt` — the seven files: **173 passed**. Every AnA suite
  (`server/services/ana`, `server/routes/ana-ri`, `server/services/ana-ri`,
  `server/mcp`, `server/services/ai-gateway`): **3875 passed, 3 skipped, 0 failed.**
  The whole server suite: 20662 passed; the failures left are `run-pq` and
  `signer-org-scope` (red on trunk before this change) and three audit-outcome
  tests fixed in the follow-up commit. The six real-database tests that call
  these handlers, against a deploy-shaped database built the way CI builds it
  (`install-fresh` + `deploy-migrate`, `RLS_ENFORCE=on`, the runtime role):
  **55 passed**; the founder-path lineage test: **14 passed**.

### Tests changed, and why

About 30 handler test files call handlers directly to pin their guards (bad
input, missing tenant). Those calls now carry `humanConfirmed: true`: the guard
they pin runs after a person's yes, which is the only way it is now reached. Two
files register `__test_*` probe tools and now declare them read-only through a
module mock, because an unclassified tool fails closed. Changed semantics, each
said in its test:

- `governed-write-gate.test.ts`: an Opus-written governed write on the agentic
  loop clears the model gate and is then **proposed**, not run; a new case shows
  it reaching the handler on a person's yes.
- `governed-tool-gate.test.ts`: a tool named like a command (`freeze_document`)
  is judged as a tool — unknown, so proposed at the confirm tier, never the
  command's e-signature tier or clearance.
- `qms-change-tools.test.ts`: the illegal-transition case uses `in_implementation`;
  `closed` is now refused before the state machine is asked.
- `direct-mutator-confirm-gate.test.ts`: the list of five is replaced by the
  register; the five are asserted `confirm` in it.

## Hand-ons (found while tracing; not in this change)

Security, highest first. None is widened into this change; each needs its own.

1. **Arbitrary server file reads from model-supplied paths:** `build_from_template`
   / `generate_document` (`template_path`, `masterDocumentBuilder.ts:177`),
   `surgical_docx_xml_edit`, `insert_document_content`, `insert_clause_template`,
   `validate_docx`, `verify_docx_against_source`, `start_legacy_import`
   (`source_path`), `package_ectd_for_region` (`leaves[].source_path`, and its
   `output_dir` plus unsanitised file name make an arbitrary **write**),
   `generate_document` XML mode (title into the path). `convert_docx_to_pdf` is
   confined to `tmp/` and `uploads/` but not per tenant and not through
   `realpath`.
2. **Cross-tenant reads/writes:** `assess_site_risk` reads `site_intel.sites` by
   program with no organisation filter and copies the scores into the caller's
   tenant; `establish_governed_fact` resolves facts by program only;
   `setBudgetParamsTx` upserts on `protocol_document_id` with no organisation
   predicate; many handlers take a program / document / site id from the model
   without checking it belongs to the organisation (`create_risk_item`,
   `pair_companion_diagnostic`, `add_risk_control`, `log_study_deviation`,
   `log_study_ae`, `create_clinical_study`, `create_labeling_document`,
   `record_clinical_performance_study`, `qms_change_create`, `run_rbm_assessment`,
   `set_qtl`, `define_kri`, `draft_monitoring_plan`, `raise_monitoring_signal`,
   `link_program_clinical_study`, `approve_import`, `simulate_reviewer_challenges`).
3. **Platform-wide integrations reachable by every tenant:** `search_crm` (one
   HubSpot account), `search_regulatory_correspondence` (one Gmail mailbox),
   `create_calendar_event` (one Google Calendar); `suggest_predicate_devices` and
   `generate_se_matrix` forward model input with the admin token.
4. **Writes with no audit row:** among others `create_risk_item`,
   `add_ctq_factor`, `set_qtl`, `triage_signal`, `raise_monitoring_signal`,
   `log_study_ae`, `record_endpoint_result`, `register_supplier`,
   `set_program_metadata`, `predict_change_impact`,
   `assess_claim_evidence_integrity`; `seed_tmf` and `update_tmf_artifact_status`
   record their governed action with the default surface `api`, not `ana`.
5. **Approved content changeable while the status still says approved:**
   `update_vault_document` (approved artifacts), `commit_document_revision`,
   `write_kit_section`, `write_q_sub_section` (clears acceptance silently).
   `revise_qms_document` withdraws the effective version in place.
6. **Human routes with no signature for acts refused here:** retiring a QMS
   document, closing a change control, a TMF artifact to final, a registration
   to approved, a subaward screen to cleared, a Bayh-Dole decision, a COI
   disclosure submitted for another person. The register sends the person to
   those routes; making them signed is the product decision DP-32 asks for.
7. **Stubs that claim success:** `rasterize_page`, `pdf_overlay`.
8. `execute_platform_command`'s result text tells the model to re-issue with
   `params.confirm=true`, which does nothing now; the text should go.

## Rows

- **DP-36** closed by this change. **DP-08** closed again (the re-opened part).
- **DP-31** closed on the AnA door: approval is refused by the change-control
  service with the signed Approve button named, closing is refused by the
  register, every other transition is a person's confirmation. The HTTP door's
  approval is the signed route; its `closed` transition is unsigned (hand-on 6).
- **DP-32** partial: the AnA door now needs a person's yes and a reason of eight
  characters; the retire act is unsigned on both doors (hand-on 6).
