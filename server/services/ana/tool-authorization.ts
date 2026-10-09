/**
 * What each of AnA's tools is allowed to do on its own (P1-34, DP-36).
 *
 * ── Why a register ───────────────────────────────────────────────────────────
 * P0-12 made every platform command that writes a proposal a person confirms.
 * But AnA has several hundred tools, and most that change records do it
 * through their own handlers, not through a command, so the command partition
 * never reached them. They ran on the model's word: a risk item, an adverse
 * event, a DEA registration, a committee vote, a retired SOP.
 *
 * So every registered tool is classified here, by name, in one register
 * (tool-authorization.register.json):
 *
 *   read      no lasting effect. Runs.
 *   self      AnA's own working state — her interview progress, a scratch
 *             document not filed anywhere. Runs.
 *   confirm   creates or changes a tenant record, files, notifies, writes to
 *             another system, or runs code. Proposed; runs on a person's yes.
 *   refuse    a person's own act — an attestation, a vote, an approval, a
 *             verification, a release. AnA never takes it, with or without a
 *             yes; she tells the person where they do it themselves.
 *   command   execute_platform_command, whose command the command partition
 *             (command-rbac.ts, part11-governance.ts) already classifies.
 *
 * Some tools are one class or another depending on what they were asked to do
 * — the same call that creates a draft can record an approval. Those carry a
 * rule below, and the register names the rule.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────────
 * A tool the register does not know is proposed, never run: a new tool ships
 * as `confirm` until somebody classifies it. The anti-drift test compares the
 * register to the live registry and fails on any gap in either direction.
 *
 * Pure, no I/O. Enforced in two places that read this one module: the tool
 * gate (governed-tool-gate.ts), which lets the live chat stream hold the turn
 * and ask; and the registry wrapper in AnaToolExecutor, which covers every
 * other path.
 *
 * @module server/services/ana/tool-authorization
 */

import register from './tool-authorization.register.json';

export type ToolClass = 'read' | 'self' | 'confirm' | 'refuse' | 'command';

export interface ToolAuthorization {
  class: ToolClass;
  /** For a refusal: what the act is and where the person does it. Shown to the model. */
  why?: string;
  /** True when the tool is not in the register (and is therefore proposed). */
  unclassified?: true;
  /**
   * The tool's own handler is the refusal: it writes nothing and answers with
   * who signs and where (and, for some, what is still outstanding), which a
   * generic refusal would lose. The gate and the wrapper let it answer.
   * ana-cannot-sign.test.ts pins every one of them to write nothing.
   */
  refusedBy?: 'handler';
}

type RegisterClass = ToolClass | 'conditional';
interface RegisterEntry {
  class: RegisterClass;
  writes: string;
  why?: string;
  refusedBy?: 'handler';
}

export const TOOL_REGISTER: Readonly<Record<string, RegisterEntry>> = register.tools as Record<string, RegisterEntry>;

type Input = Record<string, unknown>;
type Rule = (input: Input) => ToolAuthorization;

const CONFIRM: ToolAuthorization = { class: 'confirm' };
const refuse = (why: string): ToolAuthorization => ({ class: 'refuse', why });
const isIn = (v: unknown, set: readonly string[]) => typeof v === 'string' && set.includes(v.trim().toLowerCase());
const given = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/**
 * The input-dependent tools. Each rule returns the class for one call. Keyed by
 * tool name; the register marks the same names `conditional`, and the test
 * holds the two in step.
 */
export const CONDITIONAL_RULES: Readonly<Record<string, Rule>> = {
  add_labeling_translation: i =>
    i.back_translation_verified === true
      ? refuse('Recording that a back-translation was verified is the verifier’s own statement. Add the translation without it; the person who checked it records the verification on the labeling surface.')
      : CONFIRM,
  add_risk_control: i =>
    isIn(i.status, ['verified', 'effective'])
      ? refuse('Marking a risk control verified or effective is the ISO 14971 verification itself, which a person records. Add the control as proposed or implemented instead.')
      : CONFIRM,
  assemble_briefing_book: i =>
    i.run_premortem !== false && typeof i.package_id === 'number' && typeof i.assessment_id === 'number'
      ? CONFIRM
      : { class: 'read' },
  classify_tmf_artifact: i =>
    isIn(i.status, ['final'])
      ? refuse('Filing a TMF artifact as final is its QC finalization, which a person performs in the eTMF. Add it at an earlier status.')
      : CONFIRM,
  commit_intelligence_flow: i => (i.dry_run === true ? { class: 'read' } : CONFIRM),
  convert_docx_to_pdf: i => {
    // The PDF lands at output_pdf_path, or beside the input. Scratch space is
    // AnA's own; anywhere else (uploads/) is a file a person will see.
    const out = [i.output_pdf_path, i.input_docx_path].find(p => typeof p === 'string' && p.trim()) as string | undefined;
    return out && /(^|\/)tmp\//.test(out) && !/(^|\/)uploads(\/|$)/.test(out) ? { class: 'self' } : CONFIRM;
  },
  create_clinical_study: i =>
    i.irb_approved === true
      ? refuse('Recording that the IRB approved a study states a determination AnA did not see made. Create the study without it; the approval is recorded from the IRB determination.')
      : CONFIRM,
  create_per_document: i =>
    isIn(i.per_status, ['approved', 'superseded'])
      ? refuse('A performance evaluation report becomes approved or superseded by a person’s decision. Create it as a draft or for review.')
      : CONFIRM,
  create_software_lifecycle_item: i =>
    isIn(i.status, ['approved', 'superseded'])
      ? refuse('A software lifecycle item becomes approved or superseded by a person’s decision. Create it as a draft or for review.')
      : CONFIRM,
  generate_document: i => (isIn(i.output_format, ['xml']) ? CONFIRM : { class: 'self' }),
  log_cs_transaction: i =>
    given(i.witnessed_by)
      ? refuse('A named witness to a controlled-substance transaction attests to it themselves. Log the transaction without a witness; the witness records their attestation.')
      : CONFIRM,
  // Accepting a suggested filing is the person's confirmation. The handler
  // refuses it itself, saying what AnA can do instead (pinned to write nothing
  // in tests/db/vault-placement.dbtest.ts), so it answers.
  place_project_document: i =>
    i.confirm_suggested === true
      ? { ...refuse('Accepting a suggested filing location is the person’s own confirmation; they accept it in the Vault.'), refusedBy: 'handler' }
      : CONFIRM,
  qms_change_transition: i => {
    // Approval: the change-control service refuses it itself, pointing to the
    // e-signed Approve button (pinned in qms-change-tools.test.ts), so the
    // handler answers. Closing stamps the effectiveness verification.
    if (isIn(i.to, ['approved'])) {
      return { ...refuse('Approving a change control is an e-signed act, done with its Approve button.'), refusedBy: 'handler' };
    }
    return isIn(i.to, ['closed'])
      ? refuse('Closing a change control records that its effectiveness was verified, which is the verifier’s sign-off; they close it from the change control.')
      : CONFIRM;
  },
  report_protocol_deviation: i =>
    given(i.severity) && given(i.affects_safety)
      ? refuse('Severity together with safety impact records a reportability assessment in the person’s name. Report the deviation without them; the assessment is recorded, with its rationale, on the deviation.')
      : CONFIRM,
  review_schedule_of_events_health: i => (i.apply === false ? { class: 'read' } : CONFIRM),
  run_rbm_assessment: i => (i.seed === true ? CONFIRM : { class: 'read' }),
  scan_document_citations: i => (i.persist === true ? CONFIRM : { class: 'read' }),
  screen_subaward: i =>
    isIn(i.screen_status, ['cleared'])
      ? refuse('Clearing a subaward’s restricted-party screen is the compliance determination that lets it be executed. A person records it.')
      : CONFIRM,
  set_registration_status: i =>
    isIn(i.market_status, ['approved'])
      ? refuse('An approved registration states that the product holds a marketing authorization. A person records it from the authority’s decision.')
      : CONFIRM,
  update_invention_disclosure: i =>
    isIn(i.status, ['elected', 'patent_filed', 'licensed', 'released', 'abandoned']) || given(i.election_date)
      ? refuse('Election, filing, licensing, release and abandonment are the tech-transfer office’s Bayh-Dole decisions. A person records them.')
      : CONFIRM,
  update_tmf_artifact_status: i =>
    isIn(i.status, ['final'])
      ? refuse('Setting a TMF artifact to final is its QC finalization, which a person performs in the eTMF.')
      : CONFIRM,
};

/**
 * The class of one call. An unknown tool is proposed, never run; a
 * conditional tool with no readable input is judged on an empty one, which
 * every rule above resolves to its stricter non-read branch or to confirm.
 */
export function toolAuthorizationOf(name: string, input: unknown): ToolAuthorization {
  const entry = TOOL_REGISTER[name];
  if (!entry) return { class: 'confirm', unclassified: true };
  if (entry.class !== 'conditional') {
    if (entry.class !== 'refuse') return { class: entry.class };
    const refusal = refuse(entry.why ?? 'This is a person’s own act.');
    return entry.refusedBy === 'handler' ? { ...refusal, refusedBy: 'handler' } : refusal;
  }
  const rule = CONDITIONAL_RULES[name];
  if (!rule) return { class: 'confirm', unclassified: true };
  const args = input && typeof input === 'object' && !Array.isArray(input) ? (input as Input) : {};
  return rule(args);
}

/** What the model reads instead of a result when AnA may not take the action. */
export function buildToolRefusal(tool: string, why: string | undefined) {
  return {
    error: 'NOT_AN_ANA_ACTION',
    tool,
    retry: false,
    message:
      `${tool} was not run, and would not run with a confirmation either. ${why ?? ''} ` +
      'Nothing was changed. Tell the person what they would do and where; do not attempt it another way.',
  };
}
