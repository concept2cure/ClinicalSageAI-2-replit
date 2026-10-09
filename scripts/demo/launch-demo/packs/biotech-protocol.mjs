/**
 * launch-demo/packs/biotech-protocol.mjs — Protocol development for the biotech
 * demo: the Phase 2 protocol document (ICH M11 sections written), structured
 * objectives, eligibility, schedule visits, schedule-of-assessments matrix, risk
 * register, milestones, one amendment, a version snapshot — then the read model
 * the Protocol development surface renders (GET /api/protocol-dev).
 */
import { must } from '../lib.mjs';
import { PROTOCOL, STUDY, T, findDemoByTitle } from './biotech-content.mjs';
import { asArray } from './biotech-shared.mjs';

const reason = (what) => `Launch demo seed: ${what} for ${STUDY}.`;

/**
 * Add every item of `wanted` that `have` does not already hold (matched by
 * `same`), through `post`. Returns the number added; tallies found/created.
 */
async function ensureEach({ tally }, kind, wanted, have, { same, post }) {
  let added = 0;
  for (const item of wanted) {
    if (have.some((x) => same(x, item))) {
      tally.found(kind);
      continue;
    }
    await post(item);
    tally.created(kind);
    added += 1;
  }
  return added;
}

async function ensureDocument({ api, tally }, rec) {
  const list = must(await api('GET', '/api/protocol-development/documents?kind=clinical'), 200, 'list protocol documents');
  let doc = findDemoByTitle(asArray(list, 'data', 'documents'), PROTOCOL.name);
  if (doc) tally.found('protocol-document');
  else {
    doc = must(await api('POST', '/api/protocol-development/documents', {
      protocolKind: 'clinical',
      title: T(PROTOCOL.name),
      protocolNumber: STUDY,
      designType: 'interventional',
      phase: 'Phase 2',
      therapeuticArea: 'Dermatology — plaque psoriasis',
      synopsis: PROTOCOL.synopsis,
      reason: reason('create the Phase 2 protocol document'),
    }), 201, 'create protocol document');
    tally.created('protocol-document');
  }
  rec.id = Number(doc.id);
  return `${doc.sectionsSeeded != null ? 'created' : 'found'} #${rec.id}`;
}

const readDoc = ({ api }, rec) => api('GET', `/api/protocol-development/documents/${rec.id}`).then((r) => must(r, 200, 'read protocol document'));

async function ensureSections(ctx, rec) {
  const sections = asArray(await readDoc(ctx, rec), 'sections');
  const byKey = (key) => {
    const s = sections.find((x) => (x.section_key ?? x.sectionKey) === key);
    if (!s) throw new Error(`protocol section "${key}" was not seeded by the template`);
    return s;
  };
  // "Found" = the template-seeded section already carries content.
  const filled = (s, [key]) => (s.section_key ?? s.sectionKey) === key && String(s.content ?? '').trim() !== '';
  const written = await ensureEach(ctx, 'protocol-section', Object.entries(PROTOCOL.sections), sections, { same: filled, post: async ([key, content]) => {
    must(await ctx.api('PATCH', `/api/protocol-development/sections/${byKey(key).id}`, { content, status: 'complete', reason: reason(`write the ${key} section`) }), 201, `write section ${key}`);
  } });
  return `${Object.keys(PROTOCOL.sections).length} sections (${written} written)`;
}

async function ensureComponents(ctx, rec) {
  const { api } = ctx;
  const d = await readDoc(ctx, rec);
  const base = `/api/protocol-development/documents/${rec.id}`;
  const objectives = await ensureEach(ctx, 'protocol-objective', PROTOCOL.objectives, asArray(d, 'objectives'), { same: (x, o) => x.objective === o.objective, post: async (o) => {
    must(await api('POST', `${base}/objectives`, { ...o, reason: reason('add an objective') }), 201, 'add objective');
  } });
  const criteria = [...PROTOCOL.inclusion.map((criterion) => ({ kind: 'inclusion', criterion })), ...PROTOCOL.exclusion.map((criterion) => ({ kind: 'exclusion', criterion }))];
  const eligibility = await ensureEach(ctx, 'protocol-criterion', criteria, asArray(d, 'eligibility', 'eligibilityCriteria'), { same: (x, c) => x.criterion === c.criterion && x.kind === c.kind, post: async (c) => {
    must(await api('POST', `${base}/eligibility`, { ...c, reason: reason(`add an ${c.kind} criterion`) }), 201, `add ${c.kind} criterion`);
  } });
  const visits = await ensureEach(ctx, 'protocol-visit', PROTOCOL.visits, asArray(d, 'visits', 'scheduleVisits'), { same: (x, v) => (x.visit_name ?? x.visitName) === v.visitName, post: async (v) => {
    must(await api('POST', `${base}/visits`, { ...v, reason: reason('add a schedule visit') }), 201, `add visit ${v.visitName}`);
  } });
  const team = await ensureEach(ctx, 'protocol-team-member', PROTOCOL.team, asArray(d, 'team', 'teamMembers'), { same: (x, m) => (x.member_name ?? x.memberName) === m.memberName, post: async (m) => {
    must(await api('POST', `${base}/team`, { ...m, reason: reason('add a study team member') }), 201, `add team member ${m.memberName}`);
  } });
  return `added objectives ${objectives}, criteria ${eligibility}, visits ${visits}, team ${team}`;
}

/** The route answers { matrix: { columns, rows, totalCells } }. */
async function readMatrix({ api }, rec) {
  const m = must(await api('GET', `/api/protocol-soa/documents/${rec.id}/matrix`), 200, 'read SoA matrix');
  return m.matrix ?? m;
}

async function ensureSoaCells(ctx, rec, visitId) {
  const { api } = ctx;
  const rows = asArray(await readMatrix(ctx, rec), 'rows');
  let added = 0;
  for (const a of PROTOCOL.assessments) {
    const row = rows.find((r) => r.name === a.name);
    if (!row) throw new Error(`SoA: assessment "${a.name}" missing after create`);
    const present = (row.cells ?? []).filter((c) => c.present).map((c) => Number(c.visitId));
    added += await ensureEach(ctx, 'protocol-soa-cell', a.visits.map(visitId), present, { same: (vid, want) => vid === want, post: async (vid) => {
      must(await api('POST', '/api/protocol-soa/cells', { assessmentId: Number(row.assessmentId), visitId: vid, required: true, reason: reason('mark an assessment at a visit') }), 201, `SoA cell ${a.name} @ visit ${vid}`);
    } });
  }
  return added;
}

async function ensureSoa(ctx, rec) {
  const { api } = ctx;
  const visits = asArray(await readDoc(ctx, rec), 'visits', 'scheduleVisits');
  const visitId = (name) => {
    const v = visits.find((x) => (x.visit_name ?? x.visitName) === name);
    if (!v) throw new Error(`SoA: visit "${name}" not found on the document`);
    return Number(v.id);
  };
  const rows = asArray(await readMatrix(ctx, rec), 'rows');
  const addedRows = await ensureEach(ctx, 'protocol-soa-assessment', PROTOCOL.assessments, rows, { same: (r, a) => r.name === a.name, post: async (a) => {
    const orderIndex = PROTOCOL.assessments.indexOf(a);
    must(await api('POST', `/api/protocol-soa/documents/${rec.id}/assessments`, { name: a.name, category: a.category, orderIndex, reason: reason('add a schedule-of-assessments row') }), 201, `add assessment ${a.name}`);
  } });
  const addedCells = await ensureSoaCells(ctx, rec, visitId);
  const matrix = await readMatrix(ctx, rec);
  rec.soa = { assessments: asArray(matrix, 'rows').length, visits: asArray(matrix, 'columns').length, totalCells: matrix.totalCells ?? null };
  return `${rec.soa.assessments} assessments × ${rec.soa.visits} visits, ${rec.soa.totalCells} cells (${addedRows} rows, ${addedCells} cells added)`;
}

const registerRows = (j) => asArray(j, 'risks', 'rows', 'data', 'register');

async function ensureRisks(ctx, rec) {
  const { api } = ctx;
  const url = `/api/protocol-risks/documents/${rec.id}/register`;
  const have = registerRows(must(await api('GET', url), 200, 'read risk register'));
  const added = await ensureEach(ctx, 'protocol-risk', PROTOCOL.risks, have, { same: (x, r) => x.description === r.description, post: async (r) => {
    must(await api('POST', `/api/protocol-risks/documents/${rec.id}/risks`, { ...r, reason: reason('register a protocol risk with its mitigation') }), 201, `add risk ${r.description.slice(0, 40)}`);
  } });
  rec.risks = registerRows(must(await api('GET', url), 200, 'read risk register')).length;
  return `${rec.risks} risks (${added} added)`;
}

const milestoneRows = (j) => asArray(j, 'milestones', 'rows', 'data');

async function ensureMilestones(ctx, rec) {
  const { api } = ctx;
  const url = `/api/protocol-milestones/documents/${rec.id}/milestones`;
  const have = milestoneRows(must(await api('GET', url), 200, 'read milestones'));
  const added = await ensureEach(ctx, 'protocol-milestone', PROTOCOL.milestones, have, { same: (x, m) => x.name === m.name, post: async (m) => {
    must(await api('POST', url, { ...m, reason: reason('plan a study milestone') }), 201, `add milestone ${m.name}`);
  } });
  rec.milestones = milestoneRows(must(await api('GET', url), 200, 'read milestones')).length;
  return `${rec.milestones} milestones (${added} added)`;
}

async function ensureAmendment({ api, tally }, rec) {
  const list = must(await api('GET', `/api/protocol-amendments/amendments?protocolDocumentId=${rec.id}`), 200, 'list amendments');
  let am = asArray(list, 'amendments', 'rows', 'data').find((x) => x.title === PROTOCOL.amendment.title) || null;
  if (am) tally.found('protocol-amendment');
  else {
    const { change, ...body } = PROTOCOL.amendment;
    const r = must(await api('POST', '/api/protocol-amendments/amendments', { ...body, protocolDocumentId: rec.id, reason: reason('open a protocol amendment') }), 201, 'create amendment');
    am = { id: r.id, title: body.title };
    must(await api('POST', `/api/protocol-amendments/amendments/${am.id}/changes`, { ...change, reason: reason('record the amendment change') }), 201, 'add amendment change');
    tally.created('protocol-amendment');
  }
  rec.amendment = { id: Number(am.id), title: am.title };
  return `#${am.id} ${am.title}`;
}

async function ensureVersion(ctx, rec) {
  const { api, tally } = ctx;
  const versions = asArray(await readDoc(ctx, rec), 'versions');
  if (versions.length > 0) {
    tally.found('protocol-version');
    rec.versions = versions.length;
    return `found ${versions.length} version(s)`;
  }
  const r = must(await api('POST', `/api/protocol-development/documents/${rec.id}/versions`, { changeSummary: 'Initial complete draft of Protocol C2C-101-201 for the IND (demo seed).', reason: reason('snapshot the initial draft') }), 201, 'snapshot version');
  tally.created('protocol-version');
  rec.versions = 1;
  return `snapshot ${r.version}`;
}

async function readPdev({ api }, rec) {
  const docs = must(await api('GET', '/api/protocol-dev'), 200, 'protocol-dev read model').data ?? [];
  const mine = docs.find((x) => String(x.id) === String(rec.id) || x.title === rec.title) || null;
  if (!mine) throw new Error(`protocol-dev read model (${docs.length} docs) does not include #${rec.id}`);
  const n = (v) => (Array.isArray(v) ? v.length : 0);
  rec.pdev = {
    id: mine.id,
    objectives: n(mine.objectives),
    inclusion: n(mine.inclusion ?? mine.eligibility?.inclusion),
    exclusion: n(mine.exclusion ?? mine.eligibility?.exclusion),
    visits: n(mine.soa?.visits ?? mine.visits),
    assessments: n(mine.soa?.assessments),
    risks: n(mine.risks),
    milestones: n(mine.milestones),
    amendments: n(mine.amendments),
    team: n(mine.team),
    keys: Object.keys(mine),
  };
  return `#${mine.id}: objectives ${rec.pdev.objectives}, risks ${rec.pdev.risks}, milestones ${rec.pdev.milestones}, amendments ${rec.pdev.amendments}`;
}

export async function ensureProtocol(ctx) {
  const { run } = ctx;
  const rec = { title: T(PROTOCOL.name), protocolNumber: STUDY };
  run.record('protocol', rec);
  await run.step(`Protocol development: ${STUDY} document`, () => ensureDocument(ctx, rec));
  await run.step('Protocol development: section content', () => ensureSections(ctx, rec));
  await run.step('Protocol development: objectives, eligibility, visits, team', () => ensureComponents(ctx, rec));
  await run.step('Protocol development: schedule of assessments matrix', () => ensureSoa(ctx, rec));
  await run.step('Protocol development: risk register', () => ensureRisks(ctx, rec));
  await run.step('Protocol development: milestones', () => ensureMilestones(ctx, rec));
  await run.step('Protocol development: amendment 1', () => ensureAmendment(ctx, rec));
  await run.step('Protocol development: version snapshot', () => ensureVersion(ctx, rec));
  await run.step('Protocol development: GET /api/protocol-dev returns it', () => readPdev(ctx, rec));
  return rec;
}
