/**
 * Say out loud when a new document is not attached to a filing.
 *
 * ── What the server already tells us ──────────────────────────────────────────
 * `POST /api/authoring/docs` returns a `governance` field on every success:
 *
 *   { bound: true,  c2cDocumentId }   attached to the project's governed filing
 *   { bound: false, reason }          not attached, and why
 *
 * c2c_documents is the system of record for a regulatory filing; the authoring
 * stack is the editing layer over it. Binding happens at creation, and unbound
 * is a legitimate outcome — an org-wide document, a project with no derivable
 * document class, a project created before scaffolding existed. That is why
 * server/services/c2c/governed-document-binding.ts returns a REASON on every
 * negative path rather than a bare null.
 *
 * ── The gap this closes ───────────────────────────────────────────────────────
 * Both client create paths threw the reason away. AuthoringCreateExport fired
 * "Document created · <title>" and authoringHandoff returned "Saved to the
 * authoring store as …" — unqualified success either way. So a document the
 * server had just declined to bind looked identical to one it had bound, and
 * the user had no way to know the thing they were about to spend hours writing
 * was not attached to the filing they thought they were writing.
 *
 * A silently unbound document is exactly how the two stores drifted apart in
 * the first place. Unbound is fine; unbound and unsaid is the defect.
 *
 * ── Deliberately a sentence, not a control ────────────────────────────────────
 * This appends to the confirmation message that already exists. No banner, no
 * badge, no dialog, no new affordance — the surrounding code's idiom is a toast
 * that states what happened and what did not, and this stays inside it.
 *
 * @module client/src/concept2cure/v2/governanceNotice
 */

/** The `governance` field of a successful document-create response. */
export type GovernanceOutcome =
  | { bound: true; c2cDocumentId?: string }
  | { bound: false; reason?: string };

/**
 * The clause to append when a created document is not bound, or '' when it is.
 *
 * Returns '' for a bound document AND for a response with no `governance` field
 * at all: an older server that does not report binding has not told us the
 * document is unbound, and inventing a warning from silence would be its own
 * kind of dishonesty.
 */
export function unboundNotice(governance: unknown): string {
  if (!governance || typeof governance !== 'object') return '';
  const g = governance as { bound?: unknown; reason?: unknown };
  // Only an explicit `false` counts. An absent or malformed flag is unknown,
  // not negative.
  if (g.bound !== false) return '';
  const reason = typeof g.reason === 'string' ? g.reason.trim() : '';
  return reason
    ? ` Not bound to a filing — ${reason}`
    : ' Not bound to a filing.';
}
