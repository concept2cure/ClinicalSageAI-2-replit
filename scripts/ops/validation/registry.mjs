/**
 * The URS registry and its structural rules — shared by the generator that
 * renders the validation package and by the CI gate that refuses a broken one.
 *
 * WHY A REGISTRY AND NOT PROSE. `docs/LAUNCH_DEFINITION_OF_DONE.md` row D4 asks
 * for a URS per launch app, a risk assessment, a traceability matrix "generated
 * from tests", and a summary report. Written as seven hand-maintained markdown
 * files, those drift the moment a route moves, and nothing reports it: a
 * traceability matrix whose cited test was deleted still renders as a matrix.
 * That is the defect class this repository exists to remove — a control that
 * reports success while doing nothing.
 *
 * So the requirements live here as data, every citation is a path that must
 * resolve on disk, and the documents are rendered from it. A deleted test breaks
 * the gate instead of quietly emptying a cell.
 *
 * WHAT THIS MODULE DECIDES, AND WHAT IT CANNOT. It decides structure: ids are
 * well formed and unique, every cited path exists, every requirement carries at
 * least one verification, and the assurance effort matches the declared risk.
 * It cannot decide that a requirement is TRUE of the code, or that a cited test
 * actually exercises it. Nothing mechanical can. That judgement is the reviewer's,
 * and the package says so in its own header rather than implying otherwise.
 *
 * CSA framing, stated honestly. FDA's Computer Software Assurance guidance is
 * scoped to device production and quality-system software and does not modify
 * 21 CFR Part 11 (see docs/COMPETITIVE_LANDSCAPE_AUDIT_2026-07-18.md §Validation).
 * This package borrows its METHOD — risk-based assurance effort, critical
 * thinking about intended use, credit for unscripted and automated testing — and
 * does not claim the guidance governs this system. The binding requirements here
 * are 21 CFR Part 11 and EU Annex 11; GAMP 5 (2nd ed.) is the framework.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const REGISTRY_PATH = 'docs/validation/launch/urs-registry.json';

/** Verification methods, ordered weakest to strongest as assurance evidence. */
export const METHODS = ['inspection', 'unit', 'integration', 'e2e'];

/**
 * CSA assurance rule: the effort must match the risk, and "high" cannot be
 * satisfied by inspection or by a unit test alone. A high-assurance requirement
 * is one whose failure corrupts a regulated record or lets an unauthorised act
 * through; proving that with a mocked unit test proves the mock.
 */
export const ASSURANCE_MIN_METHOD = {
  high: ['integration', 'e2e'],
  medium: ['unit', 'integration', 'e2e'],
  low: ['inspection', 'unit', 'integration', 'e2e'],
};

const ID_RE = /^URS-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}$/;

export function readRegistry(root = repoRoot) {
  const abs = path.join(root, REGISTRY_PATH);
  if (!fs.existsSync(abs)) {
    return { registry: null, errors: [`registry not found at ${REGISTRY_PATH}`] };
  }
  try {
    return { registry: JSON.parse(fs.readFileSync(abs, 'utf8')), errors: [] };
  } catch (error) {
    return { registry: null, errors: [`registry is not valid JSON: ${error.message}`] };
  }
}

/** Every path a requirement cites, whatever the shape it cites it in. */
export function refsOf(requirement) {
  return [
    ...(requirement.codeRefs ?? []),
    ...(requirement.verification ?? []).flatMap((v) => v.refs ?? []),
  ];
}

/**
 * Structural validation. Returns a list of findings; an empty list is the only
 * thing that counts as a pass.
 *
 * `root` is a parameter rather than a constant so the self-test can point this
 * at a constructed fixture tree and watch each rule fail on the case it exists
 * to catch. A gate that has only ever been seen to pass has not been tested.
 */
export function validateRegistry(registry, root = repoRoot) {
  const findings = [];
  const fail = (rule, id, detail) => findings.push({ rule, id, detail });

  if (!registry || typeof registry !== 'object') {
    fail('shape', '-', 'registry is not an object');
    return findings;
  }

  const apps = Array.isArray(registry.apps) ? registry.apps : null;
  const requirements = Array.isArray(registry.requirements) ? registry.requirements : null;
  if (!apps) fail('shape', '-', 'registry.apps must be an array');
  if (!requirements) fail('shape', '-', 'registry.requirements must be an array');
  if (!apps || !requirements) return findings;

  const appIds = new Set(apps.map((a) => a.id));
  for (const app of apps) {
    for (const field of ['id', 'label', 'intendedUse']) {
      if (typeof app[field] !== 'string' || !app[field].trim()) {
        fail('app-field', app.id ?? '-', `app is missing ${field}`);
      }
    }
  }

  const seen = new Set();
  for (const r of requirements) {
    const id = r.id ?? '-';
    if (!ID_RE.test(String(r.id ?? ''))) fail('id-format', id, 'id must look like URS-<APP>-NN');
    if (seen.has(id)) fail('id-unique', id, 'duplicate requirement id');
    seen.add(id);

    if (!appIds.has(r.appId)) fail('app-unknown', id, `appId "${r.appId}" is not a declared app`);

    for (const field of ['statement', 'intendedUse', 'failureMode']) {
      if (typeof r[field] !== 'string' || r[field].trim().length < 10) {
        fail('req-field', id, `${field} is missing or too short to mean anything`);
      }
    }
    if (typeof r.statement === 'string' && !/^The system shall\b/.test(r.statement.trim())) {
      fail('statement-form', id, 'a requirement states an obligation: "The system shall ..."');
    }
    if (!['direct', 'indirect'].includes(r.csaImpact)) {
      fail('impact', id, 'csaImpact must be "direct" or "indirect"');
    }
    if (!Object.keys(ASSURANCE_MIN_METHOD).includes(r.assuranceLevel)) {
      fail('assurance', id, 'assuranceLevel must be high, medium or low');
    }

    const verification = Array.isArray(r.verification) ? r.verification : [];
    if (verification.length === 0) {
      fail('unverified', id, 'no verification declared — a requirement nothing checks is a wish');
    }
    for (const v of verification) {
      if (!METHODS.includes(v.method)) fail('method', id, `unknown verification method "${v.method}"`);
      if (!Array.isArray(v.refs) || v.refs.length === 0) {
        fail('method-empty', id, `verification method "${v.method}" cites nothing`);
      }
    }

    /* Assurance effort must match declared risk. An `inspection`-only high-risk
       requirement is the shape a CSA reviewer is specifically looking for. */
    const allowed = ASSURANCE_MIN_METHOD[r.assuranceLevel] ?? [];
    const methods = verification.map((v) => v.method);
    if (allowed.length && !methods.some((m) => allowed.includes(m))) {
      fail(
        'assurance-effort',
        id,
        `assurance "${r.assuranceLevel}" requires at least one of [${allowed.join(', ')}]; has [${methods.join(', ') || 'none'}]`,
      );
    }

    /* A direct-impact requirement cannot be low assurance. Direct impact means
       the software itself affects the integrity of a regulated record. */
    if (r.csaImpact === 'direct' && r.assuranceLevel === 'low') {
      fail('impact-assurance', id, 'a direct-impact requirement cannot carry low assurance');
    }

    for (const ref of refsOf(r)) {
      if (!fs.existsSync(path.join(root, ref))) {
        fail('dangling-ref', id, `cited path does not exist: ${ref}`);
      }
    }
    if (!Array.isArray(r.codeRefs) || r.codeRefs.length === 0) {
      fail('no-code', id, 'no implementing code cited — the requirement is unanchored');
    }
  }

  /* Every launch app must carry requirements. An app with none reads as "in
     scope and fully satisfied" in the rendered matrix, which is the inverse of
     the truth. */
  for (const app of apps) {
    if (!requirements.some((r) => r.appId === app.id)) {
      fail('app-empty', app.id, 'launch app has no requirements');
    }
  }

  return findings;
}
