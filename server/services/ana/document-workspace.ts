/**
 * Filesystem confinement for AnA's tools (C2C-AI-003, INJ-PATH-002).
 *
 * ── The gap this closes ───────────────────────────────────────────────────────
 * Many AnA tools take a filesystem path straight out of the model's tool
 * arguments — `input_docx_path`, `output_pdf_path`, `template_path`,
 * `source_path`, `leaves[].source_path`, `output_dir` — and hand it to
 * `fs.readFile`, to a Python or LibreOffice worker, or to a writer. Tool
 * arguments are chosen by the model, and the model reads untrusted content
 * (uploaded protocols, fetched pages, documents another user supplied), so
 * every such argument is attacker-influenced input.
 *
 * C2C-AI-003 added a root check to ONE tool (`convert_docx_to_pdf`) and
 * confined it to `tmp/` and `uploads/` — every tenant's `uploads/`, and every
 * tenant's scratch files under `tmp/`. INJ-PATH-002 (audit 2026-07) found the
 * siblings unguarded: an org-1 user could ask AnA to build a document "from the
 * template at uploads/org-2/file_…" and download org 2's dossier section.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * A path the model supplies is accepted only inside THE CALLER'S OWN
 * workspace, and every workspace directory is per tenant:
 *
 *   uploads/org-<id>/…            the tenant's uploads (IAM-07 prefix)
 *   tmp/<kind>/org-<id>/<uuid>/…  AnA's scratch space, one per tool family
 *
 * `anaScratchDir` is the one place scratch directories are named, so every
 * file a tool writes lands where only its own tenant's later calls can reach
 * it. Scratch files written before this rule (`tmp/docbuilder/<uuid>/…`, no
 * organization) belong to nobody and are refused — they were only ever
 * per-turn working files.
 *
 * Containment itself is `isPathWithin` and the tenant prefix is
 * `tenantPrefixDir`, both from `server/utils/document-file-roots.ts`, the
 * decision point the HTTP routes use: one definition of "inside" and one of
 * "this tenant's prefix", not a second copy here. What this module adds is
 * AnA's roots and the scratch layout.
 *
 * ── Two ways a checked path can still name another file ─────────────────────
 * 1. A different BASE. The guard resolves against `process.cwd()`, the same
 *    base the Python worker's `Path(arg).resolve()` uses, and returns the
 *    resolved path; callers must hand THAT onward, never the caller's string.
 *    (An earlier version resolved against the root while the worker resolved
 *    against cwd, and `output_pdf_path: "dist/index.js"` overwrote the server
 *    bundle.)
 * 2. A SYMLINK. A lexical check passes `uploads/org-7/link` even when `link`
 *    points at `/etc` or at another tenant's prefix. The candidate's deepest
 *    existing ancestor is resolved with realpath and containment is checked
 *    again on the real path, and the REAL path is what is returned.
 *
 * Confinement is necessary, not sufficient: a handler still requires
 * `ctx.organizationId` (without one, nothing is inside), and tenant uploads are
 * better addressed by `file_id` through ./uploaded-file-access.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isPathWithin, tenantPrefixDir } from '../../utils/document-file-roots.js';
import { usableOrgId } from '../../utils/authedOrgId.js';

/**
 * AnA's scratch areas under `tmp/`. A tool writes into
 * `anaScratchDir(orgId, kind)`; nothing else under `tmp/` is reachable by a
 * model-supplied path.
 */
export const SCRATCH_KINDS = ['docbuilder', 'submissions', 'ana-scripts', 'ana-container'] as const;
export type ScratchKind = (typeof SCRATCH_KINDS)[number];

/** Resolved per call: tests and workers change `process.cwd()`, and a stale root would move the boundary. */
function underCwd(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}

/**
 * A fresh scratch directory for one tool call, inside the tenant's own area:
 * `tmp/<kind>/org-<id>/<uuid>`. Not created — the writer creates it. Throws
 * without a usable organization: a file nobody owns is a file anybody could be
 * handed.
 */
export function anaScratchDir(organizationId: unknown, kind: ScratchKind): string {
  const org = usableOrgId(organizationId);
  if (org === null) throw new Error('AnA scratch space needs the organization the call runs for.');
  return path.join(tenantPrefixDir(underCwd('tmp', kind), org), randomUUID());
}

/**
 * The directories a model-supplied path may resolve inside, for this tenant.
 * Empty without a usable organization, so every candidate is refused.
 */
export function documentWorkspaceRoots(organizationId: unknown): string[] {
  const org = usableOrgId(organizationId);
  if (org === null) return [];
  return [
    ...SCRATCH_KINDS.map(kind => tenantPrefixDir(underCwd('tmp', kind), org)),
    tenantPrefixDir(underCwd('uploads'), org),
  ];
}

/** A `..` component in either separator style, anywhere in the string. */
const TRAVERSAL_SEGMENT = /(^|[\\/])\.\.([\\/]|$)/;

/**
 * `p` with every symlink in its deepest existing ancestor resolved. A path that
 * does not exist yet (an output file) keeps its missing tail as written; its
 * existing parent is what could be a link.
 */
function realPathOf(p: string): string {
  const missing: string[] = [];
  let existing = p;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(existing), ...missing.reverse());
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return p;
      missing.push(path.basename(existing));
      existing = parent;
    }
  }
}

/**
 * The real absolute path `candidate` denotes, if and only if it lies inside
 * this tenant's workspace — otherwise null.
 *
 * `..` and NUL are refused on their own terms, before anything is resolved.
 * Then the candidate is resolved against cwd (the consumer's base) and must be
 * inside a root lexically; then its real path must be inside the real root.
 */
export function resolveWithinDocumentWorkspace(candidate: unknown, organizationId: unknown): string | null {
  if (typeof candidate !== 'string' || candidate.length === 0) return null;
  if (candidate.includes('\0')) return null;
  if (TRAVERSAL_SEGMENT.test(candidate)) return null;

  const roots = documentWorkspaceRoots(organizationId);
  if (roots.length === 0) return null;

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  // -- the resolve IS the sanitiser here, not a sink: this function opens
  // nothing, and the two containment tests below are what make the result safe.
  const lexical = path.resolve(process.cwd(), candidate);
  if (!roots.some(root => isPathWithin(root, lexical))) return null;

  const real = realPathOf(lexical);
  return roots.some(root => isPathWithin(realPathOf(root), real)) ? real : null;
}

/** True when `candidate` denotes a path inside this tenant's workspace. */
export function isWithinDocumentWorkspace(candidate: unknown, organizationId: unknown): boolean {
  return resolveWithinDocumentWorkspace(candidate, organizationId) !== null;
}

/**
 * Throw unless `candidate` is inside this tenant's workspace; return the real
 * path, which the caller must use in place of the argument.
 *
 * `label` names the offending argument so the model gets a correctable error
 * instead of an opaque failure it will retry verbatim. The message does NOT
 * echo the rejected path: that string is attacker-influenced and the tool
 * result goes back into the conversation.
 */
export function assertWithinDocumentWorkspace(candidate: unknown, label: string, organizationId: unknown): string {
  const resolved = resolveWithinDocumentWorkspace(candidate, organizationId);
  if (resolved === null) {
    throw new Error(
      `${label} must be a path inside your organization's AnA workspace (a path an earlier document ` +
        `tool returned in this conversation, or one of your uploads). Other paths, and any '..' ` +
        `segment, are refused. For an uploaded document, use its file_id with the uploaded-document tools.`,
    );
  }
  return resolved;
}

/**
 * A file name safe to join onto a workspace directory, from model input (a
 * title, an id, a sequence number): every character outside [A-Za-z0-9._-] —
 * separators included — replaced, no leading dot, at most 120 characters,
 * never empty. The one sanitiser for names AnA's tools build.
 */
export function workspaceFileName(raw: unknown, fallback: string): string {
  const name = (typeof raw === 'string' ? raw : '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return name.length > 0 && name !== '_' ? name.slice(0, 120) : fallback;
}

/**
 * assertWithinDocumentWorkspace for a tool handler: the real path to open, or
 * the refusal (a tool result the model reads and can correct) to return
 * instead of opening anything.
 */
export function workspacePathOrRefusal(
  candidate: unknown,
  label: string,
  organizationId: unknown,
): { path: string; refusal?: undefined } | { path?: undefined; refusal: string } {
  try {
    return { path: assertWithinDocumentWorkspace(candidate, label, organizationId) };
  } catch (err) {
    return { refusal: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) };
  }
}
