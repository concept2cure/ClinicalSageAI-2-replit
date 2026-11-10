/**
 * launch-demo/packs/cmc-registers.mjs — the eleven CMC registers `ensureCmc`
 * did not fill (P-122, 2026-11-10).
 *
 * The demo seed wrote seven of CMC's eighteen registers: substance, product,
 * methods, specifications, stability with results, batches and QC results.
 * The other eleven — reference standards, impurities, dissolution profiles,
 * characterisation, manufacturing processes, process validation, formulation,
 * materials, container closure, change control and comparability — rendered
 * "No … yet" on every demo project, so a CMC team opening Substance & product
 * saw a wall of empty registers and §3.2 composed its sections without them
 * (`docs/evidence/DESIGN/P-122/inventory/cmc.md`, A16).
 *
 * Each register is written through the route its own card posts to
 * (`client/src/concept2cure/v2/surfaces/cmcRegisters.tsx`), with the body
 * shape its form builds (`cmcRegisterForms.ts`). An earlier run's row is found
 * by its name before anything is created. No row is created in a signed state:
 * `qualified`, `validated` and `approved` are ceremonies the register refuses
 * on an ordinary write (`refusesUngovernedQualification`), so every row here is
 * a draft or in progress, as it would be before its signature.
 *
 * Every pack passes its own content; nothing here names a product.
 */
import { must } from '../lib.mjs';

const DAY = 86_400_000;
const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : []);
const trimmed = (v) => String(v ?? '').trim();

/**
 * One register: its route, the field that names a row, whether its list is
 * narrowed to the project, and the tally key. `scope: 'organization'` is the
 * register's own decision (cmcRegisters.tsx REGISTER_SCOPE): a change record and
 * a process validation are organisation assets, listed org-wide.
 */
export const CMC_REGISTERS = [
  { key: 'referenceStandards', path: '/api/cmc/reference-standards', name: 'standardCode', tally: 'cmc-reference-standard' },
  { key: 'impurities', path: '/api/cmc/impurity-profiles', name: 'impurityName', tally: 'cmc-impurity' },
  { key: 'dissolution', path: '/api/cmc/dissolution-profiles', name: 'batchNumber', tally: 'cmc-dissolution-profile' },
  { key: 'characterisation', path: '/api/cmc/characterization-studies', name: 'studyTitle', tally: 'cmc-characterisation' },
  { key: 'processes', path: '/api/cmc/manufacturing-processes', name: 'processName', tally: 'cmc-manufacturing-process' },
  { key: 'processValidation', path: '/api/cmc/process-validation', name: 'processName', tally: 'cmc-process-validation', scope: 'organization' },
  { key: 'formulations', path: '/api/cmc/formulation-records', name: 'formulationName', tally: 'cmc-formulation' },
  { key: 'materials', path: '/api/cmc/material-specs', name: 'materialName', tally: 'cmc-material-spec' },
  { key: 'containerClosures', path: '/api/cmc/container-closures', name: 'systemName', tally: 'cmc-container-closure' },
  { key: 'changes', path: '/api/cmc/change-control', name: 'changeNumber', tally: 'cmc-change', scope: 'organization' },
  { key: 'comparability', path: '/api/cmc/comparability-studies', name: 'title', tally: 'cmc-comparability' },
];

/** A row's name as the list returns it: camelCase from the Drizzle registers, snake_case from the raw ones. */
function nameOf(row, field) {
  const snake = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return trimmed(row?.[field] ?? row?.[snake]);
}

/** Relative days in a row become ISO dates at write time, so a re-seed a year later is still current. */
function dated(body) {
  const out = { ...body };
  for (const [k, v] of Object.entries(body)) {
    if (k.endsWith('InDays') && typeof v === 'number') {
      out[k.replace(/InDays$/, '')] = new Date(Date.now() + v * DAY).toISOString();
      delete out[k];
    }
  }
  return out;
}

async function ensureRegister({ api, tally }, program, register, rows) {
  const listPath = register.scope === 'organization'
    ? register.path
    : `${register.path}?projectId=${encodeURIComponent(program.id)}`;
  const listed = rowsOf(must(await api('GET', listPath), 200, `list ${register.key}`));
  const have = new Set(listed.map((r) => nameOf(r, register.name)));
  let created = 0;
  for (const row of rows) {
    const name = trimmed(row[register.name]);
    if (!name) throw new Error(`a ${register.key} row has no ${register.name}; the seed names every row it writes`);
    if (have.has(name)) { tally.found(register.tally); continue; }
    must(await api('POST', register.path, { ...dated(row), projectId: program.id }), [200, 201], `create ${register.key} "${name}"`);
    tally.created(register.tally);
    created += 1;
  }
  return created;
}

/**
 * registers: { referenceStandards: [...], impurities: [...], … } keyed as
 * CMC_REGISTERS names them. A register the pack does not carry is skipped and
 * said to be skipped, never filled with something generic.
 */
export async function ensureCmcRegisters(ctx, program, registers, label) {
  if (!registers) return;
  for (const register of CMC_REGISTERS) {
    const rows = registers[register.key];
    if (!rows?.length) continue;
    await ctx.run.step(`CMC / Module 3: ${register.key} on ${label}`, async () =>
      `${await ensureRegister(ctx, program, register, rows)} created of ${rows.length}`);
  }
}
