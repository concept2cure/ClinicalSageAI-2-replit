/**
 * Filesystem confinement for AnA document tools (C2C-AI-003).
 *
 * ── The gap this closes ───────────────────────────────────────────────────────
 * Several AnA tools take a filesystem path straight out of the model's tool
 * arguments — `input_docx_path`, `output_pdf_path`, `package_path` — and hand it
 * to `fs.readFile` or to the docx→pdf worker, which writes with
 * `Path.replace(output_pdf)`. Tool arguments are chosen by the model, and the
 * model reads untrusted content (uploaded protocols, fetched pages, documents
 * another user supplied). So those arguments are attacker-influenced input, and
 * an absolute path in one of them was a server-side file read whose bytes come
 * back through the tool result, or an overwrite of an arbitrary file.
 *
 * Nothing enforced a root, and — unlike their siblings — some of those handlers
 * were registered without a ToolContext at all, so they had no tenant identity
 * to check even in principle.
 *
 * ── Why an allowlist of roots is the right control ────────────────────────────
 * Every legitimate path these tools see is produced by ANOTHER AnA tool earlier
 * in the same turn: the docx builders write under `tmp/docbuilder/<uuid>/`, the
 * eCTD packager under `tmp/submissions/`. Tenant-owned uploads are never
 * addressed by raw path — they go through the tenant-scoped resolver in
 * ./uploaded-file-access.ts, which enforces both the org column and the
 * `uploads/org-{id}/` storage prefix. So confining raw paths to `tmp/` and
 * `uploads/` costs nothing legitimate and removes the whole class.
 *
 * This is confinement, not authorization. It stops a path from LEAVING the
 * workspace; it does not decide whether this tenant may touch a given file
 * inside it. Handlers must still require `ctx.organizationId`, exactly as the
 * document-surgery tools already do.
 */
import path from 'node:path';

/**
 * Roots a model-supplied path may resolve inside.
 *
 * Resolved per call rather than cached: the test suite and the worker both
 * manipulate `process.cwd()`, and a stale root would silently widen or narrow
 * the boundary.
 */
export function documentWorkspaceRoots(): string[] {
  const cwd = process.cwd();
  return [path.resolve(cwd, 'tmp'), path.resolve(cwd, 'uploads')];
}

/** A `..` component in either separator style, anywhere in the string. */
const TRAVERSAL_SEGMENT = /(^|[\\/])\.\.([\\/]|$)/;

/**
 * True when `candidate` resolves inside one of the workspace roots.
 *
 * The `..` and NUL rejections happen BEFORE resolution so a traversal is
 * refused on its own terms rather than only when it happens to escape; the
 * containment test is what makes an absolute path safe, since `path.resolve`
 * lets an absolute candidate override the root and it then fails this check.
 */
export function isWithinDocumentWorkspace(candidate: unknown): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  if (candidate.includes('\0')) return false;
  if (TRAVERSAL_SEGMENT.test(candidate)) return false;

  return documentWorkspaceRoots().some(root => {
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    // -- the resolve IS the sanitiser here, not a sink: this function returns a
    // boolean and opens nothing. `..` and NUL are already rejected above, and
    // the containment comparison below is what makes the result safe.
    const resolved = path.resolve(root, candidate);
    return resolved === root || resolved.startsWith(root + path.sep);
  });
}

/**
 * Throw unless `candidate` is confined to the workspace.
 *
 * `label` names the offending argument so the model gets a correctable error
 * ("output_pdf_path is outside…") instead of an opaque failure it will retry
 * verbatim. The message deliberately does NOT echo the rejected path — that
 * string is attacker-influenced and the tool result goes back into the
 * conversation.
 */
export function assertWithinDocumentWorkspace(candidate: unknown, label: string): string {
  if (!isWithinDocumentWorkspace(candidate)) {
    throw new Error(
      `${label} must be a path inside the AnA document workspace (tmp/ or uploads/). ` +
        `Absolute paths outside it, and any '..' segment, are refused. Use a path returned ` +
        `by an earlier document tool, or a file_id with the uploaded-document tools.`,
    );
  }
  return candidate as string;
}
