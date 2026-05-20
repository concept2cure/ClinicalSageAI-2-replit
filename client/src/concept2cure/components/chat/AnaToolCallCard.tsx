/**
 * AnaToolCallCard — inline tool-call disclosure for the chat surface.
 *
 * Every time AnA invokes a backend tool (FDA precedent lookup, evidence
 * integrity scan, CER section write, etc.) the server emits `tool_use`
 * and then `tool_result` SSE events. We capture those on the client
 * and render a card per call so the user can:
 *
 *   - SEE which tool ran (name, status pill, latency)
 *   - SEE what arguments AnA passed (collapsed by default)
 *   - SEE the raw result (collapsed by default)
 *
 * This is the trust affordance regulated customers need: when AnA
 * writes a CER section or pulls regulatory precedents, the workstep
 * is auditable inline instead of disappearing into the response text.
 *
 * Card states:
 *   - running:  tool_use received, no tool_result yet (spinner)
 *   - success:  tool_result received, result parses cleanly
 *   - error:    tool_result carries an error payload
 *
 * The component intentionally avoids any dependency on the Concept2Cure
 * design system primitives so it can be embedded inside the 5K-line
 * AnaPersistentPanel without dragging additional surface in. Styling
 * matches the muted-stone palette already used by the panel.
 *
 * @module client/src/concept2cure/components/chat/AnaToolCallCard
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Wrench, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AnaToolCall {
  /** Tool name as registered in AnaToolDefinitions. */
  name: string;
  /** Arguments AnA passed to the tool (LLM-generated, never tenant-trusted). */
  input: Record<string, unknown>;
  /** Raw result string returned by the handler. Always a JSON string when present. */
  result?: string;
  /** Lifecycle. */
  status: 'running' | 'success' | 'error';
}

interface Props {
  call: AnaToolCall;
}

/**
 * Human-readable label for the tool name. Falls back to the raw name
 * for tools without a curated label. Curated labels are short verbs
 * matching how a regulatory operator would describe the workstep.
 */
function labelForTool(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

const TOOL_LABELS: Record<string, string> = {
  search_clinical_evidence: 'Searched ClinicalTrials.gov',
  search_literature: 'Searched literature',
  lookup_fda_guidance: 'Looked up FDA guidance',
  lookup_ich_guideline: 'Looked up ICH guideline',
  check_regulatory_compliance: 'Checked regulatory compliance',
  validate_cross_references: 'Validated cross-references',
  generate_citation: 'Generated citation',
  analyze_predicate_device: 'Analyzed predicate device',
  extract_document_structure: 'Extracted document structure',
  mine_precedents: 'Mined regulatory precedents',
  check_numerical_integrity: 'Checked numerical integrity',
  check_dossier_consistency: 'Checked dossier consistency',
  generate_document: 'Generated document',
  build_from_template: 'Built from template',
  ind_generate_section: 'Drafted IND section',
  ind_get_status: 'Read IND status',
  rasterize_page: 'Rasterized page',
  pdf_overlay: 'Composed PDF overlay',
  lookup_regulatory_precedents: 'Looked up regulatory precedents',
  compare_submission_against_precedent: 'Compared submission against precedent',
  assess_claim_evidence_integrity: 'Assessed claim-evidence integrity',
  simulate_reviewer_challenges: 'Simulated reviewer challenges',
  predict_change_impact: 'Predicted change impact',
  fetch_template_and_fill: 'Fetched and filled template',
  author_docx_native: 'Authored Word document',
  convert_docx_to_pdf: 'Converted Word to PDF',
  create_q_sub: 'Created Q-Sub',
  update_q_sub_commitment_rolled_in: 'Updated Q-Sub commitment',
  link_program_clinical_study: 'Linked program to clinical study',
  set_program_metadata: 'Updated program metadata',
  write_kit_section: 'Wrote section to editor',
  assemble_ectd_module_from_artifacts: 'Assembled eCTD module',
  draft_510k_substantial_equivalence: 'Drafted 510(k) substantial equivalence',
  draft_clinical_overview_m2_5: 'Drafted clinical overview (M2.5)',
  draft_fda_ir_response: 'Drafted FDA IR response',
};

/**
 * Pretty-print a JSON-stringified tool result. Server handlers all
 * return JSON via JSON.stringify — if parsing fails (rare) we render
 * the raw string. The error case typically has shape `{error: '...'}`
 * and is detected before we get here, but a parse failure still
 * shouldn't take the whole card down.
 */
function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function AnaToolCallCard({ call }: Props) {
  const [open, setOpen] = useState(false);

  const Icon =
    call.status === 'running'
      ? Loader2
      : call.status === 'error'
        ? AlertCircle
        : CheckCircle2;

  const statusTint =
    call.status === 'running'
      ? 'text-stone-400'
      : call.status === 'error'
        ? 'text-amber-500'
        : 'text-emerald-500';

  return (
    <div className="my-2 rounded-md border border-stone-200 bg-stone-50/60 text-[12px] leading-[1.4] text-stone-700">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-stone-100/60 rounded-md"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
        )}
        <Wrench className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
        <span className="font-medium text-stone-800 truncate">{labelForTool(call.name)}</span>
        <Icon
          className={cn(
            'w-3.5 h-3.5 flex-shrink-0 ml-auto',
            statusTint,
            call.status === 'running' && 'animate-spin',
          )}
          aria-label={call.status}
        />
      </button>

      {open && (
        <div className="px-2.5 pb-2 pt-1 space-y-2 border-t border-stone-200">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-1">
              Tool name
            </div>
            <code className="text-stone-700">{call.name}</code>
          </div>

          {Object.keys(call.input ?? {}).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-1">
                Inputs
              </div>
              <pre className="bg-white border border-stone-200 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap break-words text-stone-700">
                {JSON.stringify(call.input, null, 2)}
              </pre>
            </div>
          )}

          {call.result && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-1">
                Result
              </div>
              <pre className="bg-white border border-stone-200 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap break-words text-stone-700 max-h-64 overflow-y-auto">
                {formatJson(call.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AnaToolCallCard;
