/**
 * OQ-008 steps OQ-CMC-06…10: the one deterministic compile, the composition
 * boundary that refuses everything outside small-molecule US IND, and that a
 * request body can supply neither a section's record nor its completeness.
 */
import { step, state, IND, stamp } from './context.mjs';
import { completenessOf, dataOf, errCode, errDetail, sectionKeys } from './signed-acts.mjs';
import { ACCESS_STEPS } from './steps-access.mjs';

await step(
  {
    id: 'OQ-CMC-06',
    urs: ['URS-CMC-004'],
    title: 'One deterministic compile from the programme’s own records',
    action: 'POST /api/cmc/module3-os/compile/:programme, then read the sections',
    expected: 'the core §3.2.S / §3.2.P / 3.1 / 3.3 sections, the emittable 3.2.A appendices and US 3.2.R; each completeness is the compiler’s',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect, attach }) => {
    const compile = await api('POST', `/api/cmc/module3-os/compile/${state.projectId}`, {});
    expect(compile.status === 200, `compile expected 200, got ${compile.status}`, compile.json);
    const read = await api('GET', `/api/cmc/module3-os/sections/${state.projectId}`);
    const sections = dataOf(read);
    const keys = sectionKeys(sections);
    state.sectionKeys = keys;
    state.sections = sections;
    for (const required of ['3.2.S.1', '3.2.P.1', '3.1', '3.3']) {
      expect(keys.includes(required), `§${required} was not composed; got ${keys.join(', ')}`, keys);
    }
    expect(keys.some((k) => k.startsWith('3.2.R')), 'no regional 3.2.R section was composed', keys);
    /* Completeness is the compiler's verdict, carried per section; a section
       with none is a section nothing scored, which URS-CMC-006 forbids. */
    const unscored = (Array.isArray(sections) ? sections : []).filter((s) => completenessOf(s) === null);
    expect(unscored.length === 0, `sections carry no compiled completeness: ${unscored.map((s) => s.sectionKey).join(', ')}`, unscored);
    attach('sections.json', sections);
    return `${keys.length} sections: ${keys.join(', ')}`;
  },
);

await step(
  {
    id: 'OQ-CMC-07',
    urs: ['URS-CMC-004'],
    title: 'A compile with nothing recorded is refused and says what to record',
    action: 'create a second IND programme with no CMC records and compile it',
    expected: '409 naming the registers to record first; nothing written',
  },
  async ({ api, expect }) => {
    const prog = await api('POST', '/api/c2c/projects', { ...IND, name: `BX-700 EMPTY ${stamp}`, applicationNumber: undefined });
    expect(prog.status === 201, `empty programme create expected 201, got ${prog.status}`, prog.json);
    const empty = dataOf(prog).id;
    state.emptyProjectId = empty;
    const compile = await api('POST', `/api/cmc/module3-os/compile/${empty}`, {});
    expect(compile.status === 409, `expected 409, got ${compile.status}`, compile.json);
    const detail = String(errDetail(compile) || errCode(compile) || '');
    expect(/record|register|source/i.test(detail), 'the refusal does not say what to record', detail);
    const read = await api('GET', `/api/cmc/module3-os/sections/${empty}`);
    expect(sectionKeys(dataOf(read)).length === 0, 'the refused compile wrote sections', read.json);
    return `409: ${detail.slice(0, 180)}`;
  },
);

await step(
  {
    id: 'OQ-CMC-08',
    urs: ['URS-CMC-005'],
    title: 'A biologic programme composes nothing',
    action: 'create a programme with productType biologic, record a mAb, compile',
    expected: '409 CMC_PRODUCT_CLASS_OUT_OF_SCOPE; nothing composed; the refusal names ICH Q6B and the authoring path',
  },
  async ({ api, expect }) => {
    const prog = await api('POST', '/api/c2c/projects', {
      ...IND, name: `BX-902 IND ${stamp}`, productName: 'BX-902', productType: 'biologic', applicationNumber: undefined,
    });
    expect(prog.status === 201, `biologic programme create expected 201, got ${prog.status}`, prog.json);
    const bio = dataOf(prog).id;
    state.biologicProjectId = bio;
    const sub = await api('POST', '/api/cmc/drug-substances', {
      substanceName: 'BX-902',
      inn: 'belantezumab',
      projectId: bio,
      manufacturingProcess: { route: 'CHO cell culture, fed-batch; protein A capture' },
      status: 'development',
    });
    expect([200, 201].includes(sub.status), `the mAb record expected 200/201, got ${sub.status}`, sub.json);
    const compile = await api('POST', `/api/cmc/module3-os/compile/${bio}`, {});
    expect(compile.status === 409, `expected 409, got ${compile.status}`, compile.json);
    expect(
      errCode(compile) === 'CMC_PRODUCT_CLASS_OUT_OF_SCOPE',
      `expected CMC_PRODUCT_CLASS_OUT_OF_SCOPE, got ${errCode(compile)}`,
      compile.json,
    );
    const detail = String(errDetail(compile));
    expect(/Q6B/.test(detail), 'the refusal does not name ICH Q6B', detail);
    expect(/authoring/i.test(detail), 'the refusal does not name the authoring path', detail);
    const read = await api('GET', `/api/cmc/module3-os/sections/${bio}`);
    expect(sectionKeys(dataOf(read)).length === 0, 'the biologic programme composed sections', read.json);
    return `409 CMC_PRODUCT_CLASS_OUT_OF_SCOPE; 0 sections; ${detail.slice(0, 160)}`;
  },
);

await step(
  {
    id: 'OQ-CMC-09',
    urs: ['URS-CMC-005'],
    title: 'A marketing application, and a substance whose modality is not established',
    action: 'compile an NDA programme; then a drug programme whose substance records no route',
    expected: '409 CMC_APPLICATION_OUT_OF_SCOPE, then 409 CMC_MODALITY_NOT_ESTABLISHED; nothing composed',
  },
  async ({ api, expect }) => {
    const nda = await api('POST', '/api/c2c/projects', {
      ...IND, name: `BX-701 NDA ${stamp}`, programType: 'nda', applicationNumber: undefined,
    });
    expect(nda.status === 201, `NDA programme create expected 201, got ${nda.status}`, nda.json);
    const ndaId = dataOf(nda).id;
    await api('POST', '/api/cmc/drug-substances', {
      substanceName: 'BX-701',
      projectId: ndaId,
      modality: 'small_molecule',
      manufacturingProcess: { route: 'Four-step chemical synthesis' },
      status: 'development',
    });
    const ndaCompile = await api('POST', `/api/cmc/module3-os/compile/${ndaId}`, {});
    expect(ndaCompile.status === 409, `the NDA compile expected 409, got ${ndaCompile.status}`, ndaCompile.json);
    expect(
      errCode(ndaCompile) === 'CMC_APPLICATION_OUT_OF_SCOPE',
      `expected CMC_APPLICATION_OUT_OF_SCOPE, got ${errCode(ndaCompile)}`,
      ndaCompile.json,
    );

    const vague = await api('POST', '/api/c2c/projects', {
      ...IND, name: `BX-703 IND ${stamp}`, productName: 'BX-703', applicationNumber: undefined,
    });
    const vagueId = dataOf(vague).id;
    await api('POST', '/api/cmc/drug-substances', { substanceName: 'BX-703', projectId: vagueId, status: 'development' });
    const vagueCompile = await api('POST', `/api/cmc/module3-os/compile/${vagueId}`, {});
    expect(vagueCompile.status === 409, `the unestablished-modality compile expected 409, got ${vagueCompile.status}`, vagueCompile.json);
    expect(
      errCode(vagueCompile) === 'CMC_MODALITY_NOT_ESTABLISHED',
      `expected CMC_MODALITY_NOT_ESTABLISHED, got ${errCode(vagueCompile)}`,
      vagueCompile.json,
    );
    return `NDA ${errCode(ndaCompile)}; no route recorded ${errCode(vagueCompile)}`;
  },
);

await step(
  {
    id: 'OQ-CMC-10',
    urs: ['URS-CMC-006'],
    title: 'A request body cannot supply a section’s record or its completeness',
    action: 'refresh a section with a body claiming completeness 100 and missingInputs []',
    expected: 'the stored record is the composer’s; the body’s claim is not written',
    dependsOn: ['OQ-CMC-06'],
  },
  async ({ api, expect }) => {
    const key = state.sectionKeys.find((k) => k.startsWith('3.2.S')) ?? state.sectionKeys[0];
    const path = `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(key)}`;
    const before = await api('GET', path);
    const claimed = await api('POST', `${path}/refresh`, {
      completeness: 100,
      missingInputs: [],
      deterministicJson: { completeness: 100, missingInputs: [] },
      narrativeText: 'INJECTED BY THE REQUEST BODY',
    });
    const after = await api('GET', path);
    const stored = dataOf(after);
    expect(
      !JSON.stringify(stored).includes('INJECTED BY THE REQUEST BODY'),
      'the request body’s narrative reached the stored section',
      stored,
    );
    expect(
      completenessOf(stored) === completenessOf(dataOf(before)),
      `the body changed the stored completeness: ${completenessOf(dataOf(before))} → ${completenessOf(stored)}`,
      stored,
    );
    return `§${key} refresh ${claimed.status}; stored completeness ${completenessOf(stored)} unchanged`;
  },
);

/**
 * Named so run.mjs can import this module with a `from` clause: that is how
 * `ci:validation-traceability` finds a runner's step modules (it reads the
 * runner as run.mjs plus the modules it imports `from './*.mjs'`). A bare
 * side-effect import runs the steps and leaves the gate unable to see them, so
 * every step here would read as described-but-never-executed.
 *
 * It also carries the ORDER. Sibling ES modules that use top-level await
 * interleave — the first smoke run of this protocol ran OQ-CMC-06 before the
 * prerequisite OQ-CMC-03, and eight steps recorded *prerequisite did not pass*
 * against a step that had passed. A module's dependencies are fully evaluated
 * before it begins, so each step module imports the previous one's name, which
 * both serialises them and reads out as the execution order.
 */
export const COMPILE_STEPS = `${ACCESS_STEPS} \u2192 steps-compile.mjs`;
