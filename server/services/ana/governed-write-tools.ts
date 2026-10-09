/**
 * Which AnA tools persist MODEL-AUTHORED text into a governed record.
 *
 * ── Why this list exists ─────────────────────────────────────────────────────
 * The gateway refuses an unapproved model for high-risk regulatory work
 * (approvedForHighRisk in server/services/ai-governance/approved-models.ts).
 * That rule reads the request's task type and risk. It cannot see the case
 * that matters most in AnA: a turn labelled `chat`, or a medium-risk turn on
 * the regulatory surface, served by Haiku or Sonnet, whose model writes a
 * document into a tool call's arguments — and the tool stores it. The bypass
 * sweep of 2026-09-23 confirmed it: POST /api/chat, "draft the clinical
 * overview as an authoring document", served by claude-haiku-4-5, created
 * authoring_documents rows with Part 11 audit entries. The gateway never saw a
 * drafting task.
 *
 * So the rule is enforced where the content becomes a record: at the tool.
 * registerToolHandler wraps every tool named below, so every way of reaching
 * its handler — the stream's dispatch, the /api/chat agentic loop, and one
 * tool calling another's handler directly — refuses unless the model that
 * produced the call is approved for high-risk work.
 *
 * ── How the list is kept honest ──────────────────────────────────────────────
 * Derived, not remembered. A schema scan finds every tool whose input carries
 * free text (FREE_TEXT_FIELD below); of 762 tools, 32 do. Each was classified
 * by reading its handler, then independently re-checked, and the re-check
 * moved two in the dangerous direction (analysis → write). governed-write-gate
 * .test.ts fails when a tool with a free-text input is in neither map, so a
 * new one cannot ship unclassified.
 */

/** Input property names that carry prose a model writes. */
export const FREE_TEXT_FIELD =
  /^(content|body|html|markdown|text|narrative|draft|draftContent|sectionContent|newContent|replacement|prose|summary_text|letter|response_text)$/i;

/** Tools that store model-authored text in a governed record. Gated. */
export const GOVERNED_CONTENT_WRITE_TOOLS: Readonly<Record<string, string>> = {
  author_docx_native:
    'Stores model-authored content as a generated .docx/PDF deliverable that can be exported or filed, with no version, audit or lineage record.',
  commit_document_revision:
    'Commits model-authored content as a new canonical, audited version of a regulated document.',
  draft_authoring_document:
    'Stores model-authored section content as an authoring document in the editor, which can later be filed to the vault.',
  generate_document:
    'Stores model-authored section content or template replacements as a generated regulatory document file (for example a CSR) that can be exported, with no audit or lineage.',
  insert_document_content:
    'Writes model-authored insertions into an edited .docx that is an exportable deliverable, with no audit trail.',
  pdf_overlay:
    'Its declared contract is to stamp model-authored text into a finalized PDF deliverable. It does no analysis, and it is a false-success stub, so it is gated as a write that fails closed rather than exempted as analysis.',
  save_document_to_vault:
    'Stores model-authored content as a versioned, audited vault document.',
  update_biosketch_section:
    'Stores model-authored content in a biosketch section that is later finalized and submitted.',
  update_consent_element:
    'Stores model-authored content in an informed-consent form element, which is a governed, audited record.',
  update_dms_plan_element:
    'Stores model-authored content in an NIH DMS plan element that is later finalized and submitted.',
  update_protocol_section:
    'Stores model-authored content in a governed protocol section, with lineage and an audit trail.',
  update_vault_document:
    'Writes model-authored content as a new version of a governed vault document.',
  write_kit_section:
    'Stores model-authored prose in a 510(k)/PMA/CER kit section with version history and lineage.',
  write_q_sub_section:
    'Stores model-authored Q-Sub section prose bound for FDA, with author and source lineage.',
};

/**
 * Tools that take free text but do not store it as governed content — the text
 * is input to an analysis whose RESULT comes back, or it lands somewhere that is
 * not a governed record. Not gated, each with the reason.
 */
export const FREE_TEXT_NON_GOVERNED_TOOLS: Readonly<Record<string, string>> = {
  advise_labeling_structure:
    'Returns deterministic labeling-structure advice about the supplied content; nothing is stored.',
  assemble_crl_premortem_artifact:
    'Its premortem is a deterministic analysis. Its only governed write is the export, which calls author_docx_native\'s handler with this tool\'s context — and that handler is gated at registration, so the export is refused on an unapproved model while the analysis still runs (pinned in governed-write-gate.test.ts).',
  assess_readability:
    'Returns deterministic readability metrics; the text is not stored.',
  build_abbreviation_list:
    'Returns a deterministic acronym extraction; nothing is stored.',
  check_consistency:
    'The supplied texts are inputs to a model consistency check whose findings are kept as an analysis log; the texts themselves are not stored as governed content.',
  check_grounding:
    'Returns a deterministic grounding report; the text is not stored.',
  check_numerical_integrity:
    'Returns a deterministic numerical-consistency verdict; the content is not stored.',
  detect_evidence_contradictions:
    'Runs deterministic contradiction detection over the supplied claims and returns the result to the conversation.',
  extract_document_structure:
    'Returns a deterministic structure parse; the text is not stored.',
  fire_notification:
    'Stores the model-written title and body as an operational in-app notification, not as a governed record that can be filed, signed, submitted or exported.',
  generate_spl:
    'The SPL XML built from spec text is returned inline to the conversation only; nothing is stored as a labeling artifact (re-check this if the result key ever becomes \'content\').',
  reconcile_dossier_numbers:
    'Runs a deterministic cross-document number reconciliation and returns the discrepancies; the input text is not stored.',
  review_informed_consent:
    'Runs deterministic consent-element QC on the supplied text and returns only the findings.',
  run_submission_premortem:
    'Runs a deterministic deficiency scan plus a precedent read and returns the verdict; the input text is not stored.',
  scan_regulatory_deficiencies:
    'Runs a deterministic deficiency pattern scan and returns the findings.',
  screen_promotional_language:
    'Runs a deterministic promotional-claims screen and returns the findings; the text is not stored.',
  search_document:
    'Returns deterministic in-text search matches; nothing is stored.',
  validate_spl:
    'Runs deterministic structural SPL validation and returns the result; the spec text is not stored.',
};

/**
 * A request to draft something that will become a governed record.
 *
 * The tool gate above refuses a governed write from an unapproved model, which
 * is correct and, on its own, a poor experience: AnA's default Balanced tier is
 * Sonnet, so "draft the clinical overview" would be refused after the model had
 * already written it. This lets the kernel score such a turn high-risk up
 * front, so the tier chooses an approved model before anything is written.
 * It is a routing hint, not the control — phrasing it misses still meets the
 * gate, and gets an honest refusal rather than an unapproved draft.
 */
export const GOVERNED_DRAFT_REQUEST =
  /\b(draft|redraft|write|rewrite|author|compose|prepare|generate)\b(?:\W+\w+){0,6}?\W+(document|section|sections|summary|overview|narrative|letter|response|module|report|protocol|plan|sop|label|labeling|consent|briefing|submission|amendment|biosketch)\b/i;

export function requestsGovernedDraft(message: string | null | undefined): boolean {
  return typeof message === 'string' && GOVERNED_DRAFT_REQUEST.test(message);
}

export function isGovernedContentWriteTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(GOVERNED_CONTENT_WRITE_TOOLS, name);
}

/** Dotted paths of free-text properties in a tool's input schema. */
export function freeTextFields(schema: unknown, path = ''): string[] {
  const out: string[] = [];
  const s = schema as { properties?: Record<string, unknown>; items?: unknown } | null;
  if (!s || typeof s !== 'object') return out;
  for (const [key, value] of Object.entries(s.properties ?? {})) {
    const p = path ? `${path}.${key}` : key;
    const v = value as { type?: string };
    if (FREE_TEXT_FIELD.test(key) && (v?.type === 'string' || v?.type === undefined)) out.push(p);
    out.push(...freeTextFields(value, p));
  }
  if (s.items) out.push(...freeTextFields(s.items, `${path}[]`));
  return out;
}
