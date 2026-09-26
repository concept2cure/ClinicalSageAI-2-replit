/**
 * Which directly registered AnA tools a person must authorise before they run,
 * and which may not run from a chat turn at all.
 *
 * ── Why a second registry ────────────────────────────────────────────────────
 * P0-12 made every platform COMMAND a proposal: `PROPOSE_ONLY_COMMANDS`
 * (command-rbac.ts) is derived from `COMMAND_AUTHORIZATION`, the dispatcher
 * refuses a member without `ctx.humanConfirmed`, and one route stamps that flag
 * after a person's yes. That closure holds for the ~110 commands the model
 * reaches through the one `execute_platform_command` bridge tool — and for
 * nothing else. The other ~730 tools are registered by name with
 * `registerToolHandler`, their names and the command names are disjoint, and
 * `governed-tool-gate.ts` used to say in so many words that they were out of
 * scope. The 2026-09-26 lens (DP-36) found the consequence: a model response
 * could save to the vault, revise a controlled document, approve an import or
 * acknowledge training with no person confirming.
 *
 * So the partition needs a tool-name-keyed sibling. It cannot be DERIVED the
 * way the command one is — a registered handler carries no `effect` field —
 * so it is CLASSIFIED, once, by reading each handler, and kept honest the way
 * governed-write-tools.ts is: propose-only-tools.test.ts derives the candidate
 * writers from the handler sources (every body with a write marker) and fails
 * when one is in none of the three maps below. A new writer cannot ship
 * unclassified.
 *
 * ── The three classes, and the rule for each ─────────────────────────────────
 *   PROPOSE_ONLY_TOOLS      Its effect outlives the turn as something the
 *                           organisation keeps or ships: a database record, a
 *                           vault or upload object, a placement into a
 *                           submission, an in-app notification. The model may
 *                           propose it; a person takes it. `tier` is what the
 *                           person supplies: 'confirm' (one explicit yes),
 *                           'reason' (a reason-for-change recorded verbatim —
 *                           used where the handler already demands one, so the
 *                           reason is the person's and not the model's, and for
 *                           GCP study records, financial-conflict disclosures,
 *                           governed facts and canonical document revisions),
 *                           'esignature' (re-authentication; no tool uses it
 *                           today, because every signature-class act is a
 *                           refusal below, not a proposal).
 *   REFUSE_IN_CHAT_TOOLS    An approval, attestation, determination, vote,
 *                           submission, retirement, finalisation, execution or
 *                           agency transmission. These need the person's own
 *                           credentials at the moment of acting, which no chat
 *                           confirmation supplies, so they are refused and
 *                           handed to the surface that can take them (`where`).
 *                           Fourteen handlers already refuse inline
 *                           (refuseSignatureInChat and three hand-written
 *                           copies); they are registered here so this table,
 *                           not per-handler memory, is the single source.
 *                           `when` makes a refusal conditional on one input
 *                           value: qms_change_transition is a refusal for the
 *                           approve / reject / close targets and a proposal for
 *                           the rest of the lifecycle.
 *   READ_ONLY_TOOL_EXCLUSIONS  The scan flags it, or it looks like a write, and
 *                           it does not persist a governed record: the row it
 *                           writes is the state of an analysis or interview
 *                           session, or the file it writes is scratch that
 *                           becomes a record only through a further proposal.
 *                           Each says why.
 *
 * Model-authored content and human confirmation are two gates that COMPOSE:
 * every GOVERNED_CONTENT_WRITE_TOOLS member is also a proposal or a refusal
 * here (pinned by the test), so a governed draft is never written unaided by
 * either an unapproved model or an unconfirming person.
 *
 * ── What this module does not do ─────────────────────────────────────────────
 * It does not enforce. The enforcement points are the registration wrapper in
 * AnaToolExecutor.ts (every door: agentic loop, stream, MCP, nested calls),
 * the stream's hold-and-ask, the /governed-action route that executes a
 * confirmed tool, and — today — the MCP runtime. It does not consult
 * `governedTierOf` or `buildHumanConfirmationRequiredResult`: those answer for
 * command names, fall to 'confirm' for any name they do not know, and carry a
 * `{command, params}` retry; a tool needs its own tier and a `{tool, input}`
 * retry, so the envelope is built here in the same shape.
 *
 * Pure, no I/O, no database.
 *
 * @module server/services/ana/propose-only-tools
 */

/** What a person must supply before a proposed tool call runs. */
export type ToolApprovalTier = 'confirm' | 'reason' | 'esignature';

export interface ProposeOnlyToolEntry {
  readonly tier: ToolApprovalTier;
  readonly why: string;
}

export interface RefuseInChatToolEntry {
  /** The act, as a person would name it: "Approving an import mapping". */
  readonly act: string;
  /** Where the person takes it. */
  readonly where: string;
  readonly why: string;
  /**
   * Present when only some values of one input field are the refused act.
   * Any other value is a proposal at `otherwiseTier`; a value that cannot be
   * read is refused (fail closed), never proposed.
   */
  readonly when?: {
    readonly field: string;
    readonly values: readonly string[];
    readonly otherwiseTier: ToolApprovalTier;
  };
}

/** The tool that carries a platform command; governed by the command partition, never listed here. */
export const PLATFORM_COMMAND_BRIDGE_TOOL = 'execute_platform_command';

const confirm = (why: string): ProposeOnlyToolEntry => ({ tier: 'confirm', why });
const reason = (why: string): ProposeOnlyToolEntry => ({ tier: 'reason', why });

/** The same entry for every name in a family of handlers that write the same kind of record. */
function family<T>(entry: T, names: readonly string[]): Record<string, T> {
  return Object.fromEntries(names.map((n) => [n, entry]));
}

/** Direct tools that persist a record: the model proposes, a person takes the action. */
export const PROPOSE_ONLY_TOOLS: Readonly<Record<string, ProposeOnlyToolEntry>> = {
  // ── Vault, authoring and the document spine ──────────────────────────────
  save_document_to_vault: reason(
    'Inserts a versioned, audited vault document with provenance; the handler demands a reason-for-change of at least eight characters, which must be the person’s.',
  ),
  update_vault_document: reason(
    'Writes a new version of a governed vault document and moves its head; the handler demands a reason-for-change, which must be the person’s.',
  ),
  draft_authoring_document: confirm(
    'Creates authoring_documents rows with Part 11 audit entries that can later be filed to the vault.',
  ),
  commit_document_revision: reason(
    'Commits a new canonical, audited version of a regulated document through the document spine; a revision of the official record carries the person’s reason.',
  ),
  file_chat_upload_to_vault: confirm('Ingests a chat upload as a vault document the organisation keeps.'),
  catalog_project_document: confirm('Completes and stores the catalog metadata of a vault document.'),
  place_project_document: confirm('Places a vault document into a project folder, a change to where the organisation keeps it.'),
  remember_document_in_project: confirm('Ingests a file into the project’s memory as a document the project keeps.'),
  record_literature: confirm('Inserts or updates literature entries the organisation keeps as its evidence record.'),
  edit_spreadsheet: confirm('Saves the edited workbook as a new derived upload row and file the organisation keeps.'),
  verify_memory_atom: confirm('Marks a client memory entry as verified, a governed change to what the platform treats as established.'),

  // ── Deliverable builders: a document a person can file or send ────────────
  ...family(
    confirm(
      'Builds a downloadable document deliverable from model-supplied content or selections; a person confirms before a document that can be filed or sent exists.',
    ),
    [
      'author_docx_native',
      'generate_document',
      'insert_document_content',
      'pdf_overlay',
      'build_from_template',
      'fetch_template_and_fill',
      'assemble_ectd_module_from_artifacts',
      'surgical_docx_xml_edit',
    ],
  ),
  ind_generate_section: confirm(
    'Writes an IND section through a loopback POST to /api/ind-generation, a write path that carries none of this tool’s own context.',
  ),

  // ── Programs, Q-Subs, submissions ─────────────────────────────────────────
  create_q_sub: confirm('Creates a Q-Submission record bound for FDA.'),
  update_q_sub_commitment_rolled_in: confirm('Updates a Q-Sub commitment on the program’s metadata through mergeProgramMetadata.'),
  write_q_sub_section: confirm('Inserts Q-Sub section prose bound for FDA, with author and source lineage.'),
  write_kit_section: confirm('Stores a 510(k)/PMA/CER kit section with version history and lineage.'),
  link_program_clinical_study: confirm('Writes the program’s clinical-study link into its metadata through mergeProgramMetadata.'),
  set_program_metadata: confirm('Merges model-supplied fields into the program’s metadata record.'),
  place_into_sequence: confirm('Places a document into an eCTD sequence (upsertLeaf), changing what the submission contains.'),
  record_validation_finding: confirm('Inserts a submission validation finding the organisation tracks to closure.'),
  resolve_validation_finding: reason('Closes a submission validation finding; closing an open finding carries the person’s reason.'),
  ...family(confirm('Writes the project’s schedule of events, milestones or goals, records the project keeps.'), [
    'generate_schedule_of_events',
    'amend_schedule_of_events',
    'reset_project_goals',
  ]),
  create_calendar_event: confirm('Creates a calendar event visible to people in the organisation.'),
  fire_notification: confirm(
    'Sends a model-written title and body to people in the organisation as an in-app notification; a person confirms what is said, and to whom.',
  ),
  save_report_definition: confirm('Persists a report definition the organisation reuses.'),
  commit_intelligence_flow: confirm('Commits a completed intelligence interview into the platform’s registers, with an audit entry.'),
  ...family(reason('Establishes or changes a governed program fact whose history is the official record; the change carries the person’s reason.'), [
    'establish_governed_fact',
    'apply_fact_change',
  ]),

  // ── Devices, IVD, RBM, post-market ────────────────────────────────────────
  ...family(
    confirm('Inserts a device or IVD lifecycle record (UDI, risk, software, performance study, classification, PER, CLIA, CDx, LDT) the organisation keeps as a registration record.'),
    [
      'create_udi_record',
      'create_risk_item',
      'add_risk_control',
      'create_software_lifecycle_item',
      'record_analytical_performance_study',
      'record_clinical_performance_study',
      'classify_ivd_device',
      'create_per_document',
      'categorize_clia_complexity',
      'pair_companion_diagnostic',
      'register_ldt',
    ],
  ),
  run_rbm_assessment: confirm('Inserts a risk-based-monitoring assessment and its risk items.'),
  ...family(confirm('Writes a risk-based-monitoring record (CtQ factor, KRI, reading, QTL, signal, plan or action) the study keeps.'), [
    'add_ctq_factor',
    'define_kri',
    'record_kri_reading',
    'set_qtl',
    'raise_monitoring_signal',
    'triage_signal',
    'draft_monitoring_plan',
    'create_monitoring_action',
    'update_monitoring_action',
  ]),
  create_complaint: confirm('Creates a post-market complaint record.'),
  open_device_capa: confirm('Opens a CAPA record on a device.'),

  // ── Clinical and GCP ──────────────────────────────────────────────────────
  create_clinical_study: confirm('Inserts a clinical study record with a governed action.'),
  create_clinical_investigator: confirm('Creates an investigator record with a governed action.'),
  ...family(reason('Records a GCP study event (deviation, adverse event or endpoint result) into the study’s official record; the entry carries the person’s reason.'), [
    'log_study_deviation',
    'log_study_ae',
    'record_endpoint_result',
    'report_protocol_deviation',
  ]),
  ...family(reason('Records a financial conflict-of-interest disclosure or interest, a regulated attestation record whose entry carries the person’s reason.'), [
    'create_financial_disclosure',
    'add_disclosure_interest',
    'create_coi_disclosure',
  ]),

  // ── Research compliance (governedPdev / *Tx + recordGovernedAction) ────────
  ...family(confirm('Creates or changes a research-compliance record in one governed, audited transaction (health-authority interactions, commitments, IACUC, IRB, IBC, nonclinical studies).'), [
    'create_ha_interaction',
    'create_regulatory_commitment',
    'fulfill_regulatory_commitment',
    'create_iacuc_protocol',
    'register_animal_cohort',
    'create_irb_submission',
    'add_irb_site',
    'create_ibc_registration',
    'add_biological_agent',
    'create_nonclinical_study',
  ]),
  ...family(confirm('Creates or changes a protocol-development record in one governed, audited transaction (budget, schedule of assessments, templates, milestones, amendments, CAPA, reviews, consent, risks, sections, objectives, eligibility).'), [
    'add_protocol_budget_item',
    'set_protocol_budget_params',
    'add_soa_assessment',
    'set_soa_cell',
    'create_protocol_template',
    'clone_protocol_template',
    'save_document_as_template',
    'add_protocol_milestone',
    'set_protocol_milestone_status',
    'create_protocol_amendment',
    'add_amendment_change',
    'add_capa_action',
    'assign_protocol_reviewer',
    'add_protocol_review_comment',
    'create_consent_form',
    'update_consent_element',
    'add_protocol_risk',
    'create_protocol_document',
    'update_protocol_section',
    'add_protocol_objective',
    'add_eligibility_criterion',
    'bind_protocol_to_study_design',
    'apply_protocol_design_derivation',
  ]),
  ...family(confirm('Creates or changes a sponsored-research document that is later finalized or submitted (DMS plan, Other Support, biosketch, invention disclosure, export-control review, research agreement).'), [
    'create_dms_plan',
    'update_dms_plan_element',
    'create_other_support',
    'add_other_support_entry',
    'create_biosketch',
    'update_biosketch_section',
    'create_invention_disclosure',
    'update_invention_disclosure',
    'create_export_control_review',
    'update_export_control_review',
    'create_research_agreement',
    'update_research_agreement',
  ]),
  import_citi_records: confirm('Imports CITI training records into the personnel training register.'),
  add_personnel_training: confirm('Adds a personnel training record with a governed action.'),
  set_funding_profile: confirm('Upserts the organisation’s funding profile.'),
  ...family(confirm('Creates or changes a committee record (membership, meetings, agenda items) with a governed action.'), [
    'assign_committee_member',
    'convene_committee_meeting',
    'add_committee_agenda_item',
  ]),
  ...family(confirm('Creates or changes a coverage-analysis record with a governed action.'), ['create_coverage_analysis', 'add_coverage_item', 'classify_coverage_item']),
  ...family(confirm('Creates or changes a grant record (proposal, award, milestone, closeout, subaward, budget, expenditure, cost share, extension request, opportunity) with a governed action.'), [
    'create_grant_proposal',
    'record_grant_award',
    'set_grant_milestone_status',
    'open_grant_closeout',
    'update_grant_closeout',
    'record_subaward',
    'add_grant_budget_line',
    'record_grant_expenditure',
    'record_cost_share_contribution',
    'request_no_cost_extension',
    'record_grant_opportunity',
  ]),
  triage_compliance_attention: confirm('Creates tasks from the compliance-attention triage and records one governed action over the batch.'),
  ...family(confirm('Creates or changes a RIM, inspection, controlled-substance, lifecycle-obligation or effort record with a governed action.'), [
    'register_controlled_substance',
    'create_rim_product',
    'set_registration_status',
    'create_inspection',
    'log_inspection_finding',
    'register_dea',
    'log_cs_transaction',
    'create_lifecycle_obligation',
    'create_effort_certification',
    'add_effort_line',
  ]),

  // ── eTMF ──────────────────────────────────────────────────────────────────
  create_tmf: confirm('Creates a trial master file with a governed action.'),
  classify_tmf_artifact: confirm('Adds and classifies a TMF artifact with a governed action.'),
  seed_tmf: reason('Seeds a TMF from the reference model; the handler demands a reason of at least eight characters, which must be the person’s.'),
  update_tmf_artifact_status: reason('Sets a TMF artifact’s filing status; the handler demands a reason of at least eight characters, which must be the person’s.'),

  // ── QMS, suppliers, labeling, legacy import ───────────────────────────────
  create_qms_document: confirm('Inserts a controlled QMS document with a governed action.'),
  revise_qms_document: reason('Opens a controlled revision of a QMS document; the handler demands a reason-for-change, which must be the person’s.'),
  qms_change_create: confirm('Creates a change-control record with an audit row.'),
  qms_change_link: confirm('Links a change-control record to a document or artifact, with an audit row.'),
  register_supplier: confirm('Inserts a supplier record into the QMS.'),
  log_nonconforming_product: confirm('Inserts a nonconformance record into the QMS.'),
  ...family(confirm('Inserts a labeling document, translation or symbol record.'), ['create_labeling_document', 'add_labeling_translation', 'add_labeling_symbol']),
  start_legacy_import: confirm('Creates a legacy-import job and its file rows.'),
  override_import_mapping: confirm('Overrides a legacy-import file mapping before approval.'),
};

/** Direct tools whose act is a ceremony a chat turn cannot perform: refused, with the surface that can. */
export const REFUSE_IN_CHAT_TOOLS: Readonly<Record<string, RefuseInChatToolEntry>> = {
  // Already refusing inline through refuseSignatureInChat; act and where are verbatim.
  finalize_dms_plan: {
    act: 'Finalizing a data management and sharing plan',
    where: 'the DMS plan in its workspace',
    why: 'Finalization is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  certify_other_support: {
    act: 'Certifying Other Support',
    where: 'the Other Support document in its workspace',
    why: 'Certification is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  finalize_biosketch: {
    act: 'Finalizing a biosketch',
    where: 'the biosketch in its workspace',
    why: 'Finalization is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  finalize_export_control_determination: {
    act: 'Finalizing an export-control determination',
    where: 'the determination in the export-control workspace',
    why: 'A determination is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  execute_research_agreement: {
    act: 'Executing a research agreement',
    where: 'the agreement in its workspace',
    why: 'Execution is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  finalize_committee_determination: {
    act: "Finalizing a committee's determination",
    where: 'the agenda item in the committee workspace, by a member holding the approve privilege',
    why: 'A determination is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  finalize_grant_closeout: {
    act: 'Finalizing a grant closeout',
    where: 'the closeout in the grant workspace',
    why: 'Finalization is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  execute_subaward: {
    act: 'Executing a subaward',
    where: 'the subaward in the grant workspace',
    why: 'Execution is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  approve_no_cost_extension: {
    act: 'Approving a no-cost extension',
    where: 'the extension in the grant workspace',
    why: 'An approval is an electronic signature (§11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  // Already refusing inline with hand-written copy.
  finalize_protocol_document: {
    act: 'Finalizing a protocol document',
    where: 'the protocol workspace, where the person enters their password',
    why: 'Finalization is an electronic signature (§11.200); the handler already refuses with its own copy and is registered here so the registry is the single source.',
  },
  approve_qms_document: {
    act: 'Approving a controlled document',
    where: "the Quality register: the document's Approve button asks for your password and second factor",
    why: 'Approval of a controlled document is a signed act (§11.50, §11.200); the handler already refuses and is registered here so the registry is the single source.',
  },
  approve_rbm_assessment: {
    act: 'Approving a risk assessment',
    where: 'the assessment itself in the monitoring workspace, which asks for your password and second factor at signing',
    why: 'Activating a risk assessment is an electronic signature (§11.200) by a holder of signing authority (§11.10(g)); the handler already refuses with its own copy.',
  },
  approve_rbm_plan: {
    act: 'Approving a monitoring plan',
    where: 'the plan itself in the monitoring workspace, which asks for your password and second factor at signing',
    why: 'Approving a monitoring plan is an electronic signature (§11.200); the handler already refuses with its own copy.',
  },
  transmit_submission: {
    act: 'Transmitting a submission to an agency gateway',
    where: 'Gateway transmittals (POST /api/mdx/gateways/:region/:gateway/transmit), with re-authentication, a recorded reason and the eCTD structural gate',
    why: 'Agency transmission is the one irreversible action in the platform and requires a person; the handler already refuses with its own copy and the gateway layer enforces it independently.',
  },
  // Newly registered refusals (DP-36): approvals, attestations and determinations that ran from chat.
  retire_qms_document: {
    act: 'Retiring a controlled document',
    where: "the Quality register: the document's Retire action, which asks for your password and second factor",
    why: 'Retirement is terminal for a controlled document and its reason enters the hash-chained ledger (§11.10(e)); the model-written reason the handler accepted was nobody’s attestation (DP-32).',
  },
  ack_training: {
    act: 'Acknowledging training on a controlled document',
    where: 'the training acknowledgement on the document in the Quality register',
    why: 'A training acknowledgement is the person’s own attestation that they have read and understood the document; the model cannot acknowledge on their behalf.',
  },
  approve_import: {
    act: 'Approving a legacy-import mapping and materialising its artifacts',
    where: "the import job's review screen",
    why: 'Approval materialises artifacts with provenance from a mapping the person has reviewed; the approve class is never a chat confirmation.',
  },
  submit_invention_disclosure: {
    act: 'Submitting an invention disclosure',
    where: 'the disclosure in the invention-disclosure workspace',
    why: 'Submission is the inventor’s attestation that the disclosure is complete and true; it is signed by the person, not confirmed in chat.',
  },
  cast_committee_vote: {
    act: 'Casting a committee vote',
    where: 'the agenda item in the committee workspace, as the voting member',
    why: 'A vote is the member’s own recorded decision on an agenda item; nobody casts it for them.',
  },
  set_coverage_qualifying_determination: {
    act: 'Recording a coverage-analysis qualifying determination',
    where: 'the coverage analysis in its workspace',
    why: 'The qualifying determination is a billing-compliance determination the reviewer attests to; a determination is never a chat confirmation.',
  },
  screen_subaward: {
    act: 'Recording a subaward screening determination (cleared or excluded)',
    where: 'the subaward in the grant workspace, after the live SAM.gov lookup',
    why: 'Clearing or excluding a subaward is a compliance determination the screener attests to; a determination is never a chat confirmation.',
  },
  qms_change_transition: {
    act: 'Approving, rejecting or closing a change control',
    where: "the change in the Quality register: Approve asks for your password and second factor, and closure records the effectiveness review",
    why: 'Approving, rejecting or closing a change is a signed determination (DP-31; the service itself refuses an unsigned approval); the draft-side moves — assessment, implementation, verification, cancellation — are proposals a person confirms with their reason.',
    when: { field: 'to', values: ['approved', 'rejected', 'closed'], otherwiseTier: 'reason' },
  },
};

/** Direct tools the scan flags that persist no governed record, each with the reason. */
export const READ_ONLY_TOOL_EXCLUSIONS: Readonly<Record<string, string>> = {
  run_python_script:
    'Writes the script’s output files into the turn’s isolated compute scratch; nothing is filed, versioned or audited, and an output becomes a record only through a further proposal.',
  run_in_container:
    'Writes the container’s output files into the turn’s isolated compute scratch; nothing is filed, versioned or audited, and an output becomes a record only through a further proposal.',
  convert_docx_to_pdf:
    'Renders an existing document to PDF in scratch, a mechanical transformation with no model-supplied content; filing the PDF is a separate proposal.',
  insert_clause_template:
    'Inserts a library clause into a scratch copy of a document, a mechanical edit with no model-supplied content; filing the result is a separate proposal.',
  package_ectd_for_region:
    'Assembles the sequence’s existing artifacts into a bundle on disk, the step before the wire; transmit_submission is the refused act, and the code records that everything up to the wire is the agent’s.',
  start_deep_investigation:
    'Starts a background analysis job whose ana_deep_investigations row is the job’s own state; any governed write the job makes goes through the same registered handlers.',
  convene_drafting_council:
    'Runs a drafting council whose lumen.council_sessions row is the session’s own state; its draft becomes a record only through commit_document_revision or draft_authoring_document.',
  run_shadow_review:
    'Records a shadow review run and its findings, the log of an analysis over an existing sequence; it creates or changes no regulated artifact.',
  start_war_game:
    'Runs a deterministic war game and writes only an audit-log entry that it ran; the trail of a read is not a record write.',
  start_intelligence_flow:
    'Creates an interview session row that is the conversation’s own state; the register write is commit_intelligence_flow, which is a proposal.',
  answer_intelligence_question:
    'Saves the interview session’s state after each answer; the register write is commit_intelligence_flow, which is a proposal.',
  assemble_crl_premortem_artifact:
    'Its premortem is a deterministic analysis; its only write is the nested call to author_docx_native’s registered handler, which is itself a proposal, so the export is held while the analysis still runs.',
};

function has<T>(map: Readonly<Record<string, T>>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, name);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * True when the tool may only be proposed by the model. A conditional refusal
 * counts: on its non-refused targets it is a proposal.
 */
export function isProposeOnlyTool(name: string): boolean {
  if (has(PROPOSE_ONLY_TOOLS, name)) return true;
  return has(REFUSE_IN_CHAT_TOOLS, name) && REFUSE_IN_CHAT_TOOLS[name].when !== undefined;
}

/** The tier a proposed tool is confirmed at, or null when the tool is not a proposal. */
export function toolTierOf(name: string): ToolApprovalTier | null {
  if (has(PROPOSE_ONLY_TOOLS, name)) return PROPOSE_ONLY_TOOLS[name].tier;
  const conditional = has(REFUSE_IN_CHAT_TOOLS, name) ? REFUSE_IN_CHAT_TOOLS[name].when : undefined;
  return conditional ? conditional.otherwiseTier : null;
}

export interface RefusedInChat {
  readonly tool: string;
  readonly act: string;
  readonly where: string;
  readonly why: string;
  /** For a conditional refusal: the target that was refused, or null when it could not be read. */
  readonly target?: string | null;
}

/**
 * The refusal for this call, or null when the call is not a refused act.
 *
 * For a conditional entry the target is read from `input[when.field]`. A
 * target that is not a non-empty string is refused rather than proposed: the
 * gate must not open widest when it can see least.
 */
export function refusedInChatTool(name: string, input: unknown): RefusedInChat | null {
  if (!has(REFUSE_IN_CHAT_TOOLS, name)) return null;
  const entry = REFUSE_IN_CHAT_TOOLS[name];
  const base = { tool: name, act: entry.act, where: entry.where, why: entry.why };
  if (!entry.when) return base;
  const raw = asRecord(input)?.[entry.when.field];
  const target = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  if (target === null) return { ...base, target: null };
  return entry.when.values.includes(target) ? { ...base, target } : null;
}

/**
 * The result a tool returns instead of running when a person must take the
 * action. Same envelope as buildHumanConfirmationRequiredResult
 * (part11-governance.ts) so GovernedActionSignoff handles it unchanged — the
 * one difference is the retry payload, `{tool, input}` in place of
 * `{command, params}`, because that is what /governed-action will re-run.
 *
 * Throws for a tool that is not a proposal: silently answering 'confirm' for an
 * unknown name is the under-tiering this module exists to prevent.
 */
export function buildToolProposalResult(
  tool: string,
  input: unknown,
): {
  success: false;
  action: string;
  error: 'HUMAN_CONFIRMATION_REQUIRED';
  message: string;
  openModal: 'esign';
  data: {
    tier: ToolApprovalTier;
    reasonRequired: boolean;
    signatureRequired: boolean;
    proposedByAgent: true;
    retry: { tool: string; input: Record<string, unknown> };
  };
} {
  const tier = toolTierOf(tool);
  if (tier === null) throw new TypeError(`${tool} is not a propose-only tool`);
  const message =
    tier === 'confirm'
      ? 'This action changes the record, so it is taken by a person rather than on your ' +
        'behalf. Review it and confirm to continue.'
      : 'This action changes the official record, so it has to be taken by a person rather ' +
        'than on your behalf. Review it and confirm to continue — your reason for the change ' +
        'is recorded with it.';
  return {
    success: false,
    action: tool,
    error: 'HUMAN_CONFIRMATION_REQUIRED',
    message,
    openModal: 'esign',
    data: {
      tier,
      reasonRequired: tier !== 'confirm',
      signatureRequired: tier === 'esignature',
      proposedByAgent: true,
      retry: { tool, input: asRecord(input) ?? {} },
    },
  };
}

/**
 * The result a refused act returns. Same keys as refuseSignatureInChat in
 * AnaToolExecutor.ts (`ok:false, signatureRequired:true, tool, message`) so the
 * fourteen inline refusals can be relocated onto this one builder, plus an
 * `error` code so every door that reads `error` as a refusal (the MCP runtime's
 * parseAnaResult) treats it as one.
 */
export function buildToolRefusalResult(refusal: RefusedInChat): {
  ok: false;
  error: 'REFUSED_IN_CHAT';
  signatureRequired: true;
  tool: string;
  act: string;
  where: string;
  message: string;
} {
  const unreadable = refusal.target === null ? ' The target of the change could not be read, so it was refused rather than proposed.' : '';
  return {
    ok: false,
    error: 'REFUSED_IN_CHAT',
    signatureRequired: true,
    tool: refusal.tool,
    act: refusal.act,
    where: refusal.where,
    message:
      `${refusal.act} is an act only a person can take: it needs their own credentials at the moment ` +
      `of acting, which a chat turn cannot collect. Nothing was recorded or changed. Do it from ${refusal.where}.${unreadable}`,
  };
}
