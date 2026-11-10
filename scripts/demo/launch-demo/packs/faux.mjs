/**
 * Fictional FBT-201 CSR demonstration in the existing Project Management flow.
 *
 * This is DATA SEEDING ONLY. There is no separate CSR application, editor or
 * data room. The operator FIRST provisions the separate fictional organization
 * through the existing authorized account flow and signs in as its member.
 * This pack creates its Project Management CSR project, stores synthetic source
 * evidence in the existing Vault/Data Room, and leaves real review/signature
 * ceremonies to the person who performs them in the application.
 *
 * --pack faux is deliberately excluded from --pack all: never seed it into
 * another client's organization by accident.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { demoTitle, makeMultiPagePdfBuffer, must, REPO_ROOT, sha256 } from '../lib.mjs';
import { makeTally } from './biotech-shared.mjs';
import { ensureTasks } from './work-areas.mjs';

const FAUX_ORG_NAME = 'Faux Biotech Therapeutics';
const CLIENT = { name: 'Faux Biotech Therapeutics — fictional demonstration', slug: 'faux-biotech-therapeutics-demo' };
const TITLE = 'FBT-201 Phase 2 Clinical Study Report — SYNTHETIC';
const DOC_ROOT = path.join(REPO_ROOT, 'docs', 'demo', 'faux-biotech-csr');
const title = (name) => demoTitle('faux', name);
const asRows = (payload) => Array.isArray(payload) ? payload
  : Array.isArray(payload?.data) ? payload.data
  : Array.isArray(payload?.clients) ? payload.clients : [];

const tasks = [
  { title: title('FBT-201 · Verify the synthetic source catalog'), moduleType: 'Clinical',
    priority: 'high', status: 'pending', dueInDays: 5,
    description: 'Confirm the actual Data Room source IDs, versions and sha256 receipts. Synthetic data are not clinical evidence or an approved submission.' },
  { title: title('FBT-201 · Reconcile PASI75 and safety outputs'), moduleType: 'Biostatistics',
    priority: 'high', status: 'pending', dueInDays: 8,
    description: 'Reconcile fictional PASI75: 52/80 and 30/80; TEAE 42/80 and 37/80; SAE 3/80 and 2/80. Keep the source run and its data cut with every claim.' },
  { title: title('FBT-201 · Human-review the ICH E3 CSR draft'), moduleType: 'Clinical',
    priority: 'medium', status: 'pending', dueInDays: 14,
    description: 'Use the existing one editor and AnA on this project. A reviewer must assess the source-grounded draft through the actual governed review path; this task is NOT an approval or signature.' },
];

function sourceBytes() {
  const compressed = fs.readFileSync(path.join(DOC_ROOT, 'FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz'));
  // The original revision's SHA-256 lives in the already-recorded provenance
  // manifest. A file with plausible counts but altered observations must not
  // silently become the next demonstration source.
  const provenance = JSON.parse(fs.readFileSync(path.join(DOC_ROOT, 'REVISION_PROVENANCE_v2.json'), 'utf8'));
  if (provenance.revision !== 2 || provenance.synthetic !== true ||
      provenance.clinical_verification !== 'not-established' ||
      sha256(compressed) !== provenance.source_gzip_sha256) {
    throw new Error('The source archive does not match the recorded synthetic revision-2 provenance. Nothing was seeded.');
  }
  const bytes = gunzipSync(compressed);
  const digest = sha256(bytes);
  if (digest !== provenance.revised_source_sha256) {
    throw new Error('The decompressed FBT-201 source digest differs from the immutable revision-2 manifest. Nothing was seeded.');
  }
  const source = JSON.parse(bytes.toString('utf8'));
  if (source.format !== 'concept2cure.csr-source.v1' ||
      source.studyInfo?.protocolNumber !== 'FBT-201-2026' ||
      source.participants?.length !== 160 ||
      source.studyData?.adverseEvents?.length !== 79 ||
      source.studyData?.dispositionBasis !== 'end-of-treatment') {
    throw new Error('The checked-in Faux Biotech revision-2 source is not the intended synthetic CSR data. Nothing was seeded.');
  }
  for (const [arm, completed, response] of [['FBT201', 74, 65], ['PBO', 76, 37.5]]) {
    if (source.studyData.treatmentArms.find(a => a.armId === arm)?.populations?.completed !== completed ||
        source.studyData.efficacy.find(e => e.armId === arm)?.value !== response) {
      throw new Error('Faux Biotech source and current revised statistical totals differ. Nothing was seeded.');
    }
  }
  return { bytes, digest, envelope: source };
}


/** Fixed, deliberately simple fictional CSVs: no quoting or embedded commas.
 * Refuse any changed shape rather than silently misreading a clinical result. */
function syntheticRows(name, bytes, expectedColumns) {
  const value = bytes.toString('utf8').trimEnd();
  if (!value || value.includes('"')) throw new Error('Synthetic demo CSV contains an unsupported or empty row: ' + name);
  const lines = value.split(/\r?\n/);
  const headers = lines.shift();
  if (headers !== expectedColumns.join(',')) throw new Error('Synthetic demo CSV headers changed: ' + name);
  return lines.map((line, index) => {
    const fields = line.split(',');
    if (fields.length !== expectedColumns.length) throw new Error('Synthetic demo CSV column count changed: ' + name + ' row ' + (index + 2));
    return Object.fromEntries(expectedColumns.map((key, i) => [key, fields[i]]));
  });
}

const DEMO_CSV_NAMES = [
  'ADSL_160_SUBJECT_QC_INDEX.csv',
  'TLF_PRIMARY_EFFICACY.csv',
  'TLF_SAFETY.csv',
];

/** This is synthetic demonstration reconciliation only, NOT a clinical
 * statistics engine, ADaM parser or CDISC/FDA conformance checker. The caller
 * uploads THESE validated bytes, not freshly opened copies. */
export function validateSyntheticDemoRows(source, files) {
  const qc = syntheticRows(DEMO_CSV_NAMES[0], files[DEMO_CSV_NAMES[0]],
    ['STUDYID', 'USUBJID', 'TRT01A', 'ITTFL', 'SAFFL', 'PASI75W12', 'COMPLTRT', 'TEAEFL', 'SAEFL', 'AEWITHFL', 'PROVENANCE']);
  const efficacy = syntheticRows(DEMO_CSV_NAMES[1], files[DEMO_CSV_NAMES[1]],
    ['arm', 'ITT', 'responders', 'response_rate_pct', 'treatment_complete']);
  const safety = syntheticRows(DEMO_CSV_NAMES[2], files[DEMO_CSV_NAMES[2]],
    ['arm', 'safety_n', 'subjects_with_teae', 'subjects_with_sae', 'subjects_ae_withdrawal', 'deaths']);
  const participants = new Map(source.participants.map(p => [p.subjectId, p]));
  const events = new Map();
  for (const event of source.studyData.adverseEvents) {
    if (!events.has(event.subjectId)) events.set(event.subjectId, []);
    events.get(event.subjectId).push(event);
  }
  if (qc.length !== participants.size || efficacy.length !== source.studyData.treatmentArms.length ||
      safety.length !== source.studyData.treatmentArms.length) {
    throw new Error('Synthetic FBT-201 source and CSV row counts disagree; nothing was seeded.');
  }
  const seen = new Set();
  const flags = ['ITTFL', 'SAFFL', 'PASI75W12', 'COMPLTRT', 'TEAEFL', 'SAEFL', 'AEWITHFL'];
  for (const row of qc) {
    const subject = participants.get(row.USUBJID);
    const arm = source.studyData.treatmentArms.find(a => a.armId === subject?.armId);
    const adverseEvents = events.get(row.USUBJID) ?? [];
    if (!subject || !arm || seen.has(row.USUBJID) || row.STUDYID !== source.studyInfo.protocolNumber ||
        row.TRT01A !== arm.armName || row.PROVENANCE !== 'SYNTHETIC_REVISION_2_NOT_CLINICAL_EVIDENCE' ||
        flags.some(key => row[key] !== 'Y' && row[key] !== 'N') ||
        row.ITTFL !== (subject.itt ? 'Y' : 'N') ||
        row.SAFFL !== (subject.safety ? 'Y' : 'N') ||
        row.COMPLTRT !== (subject.completed ? 'Y' : 'N') ||
        row.TEAEFL !== (adverseEvents.length ? 'Y' : 'N') ||
        row.SAEFL !== (adverseEvents.some(e => e.serious) ? 'Y' : 'N') ||
        row.AEWITHFL !== (adverseEvents.some(e => e.ledToDiscontinuation) ? 'Y' : 'N')) {
      throw new Error('Synthetic subject QC index conflicts with the structured source at ' + row.USUBJID + '; nothing was seeded.');
    }
    seen.add(row.USUBJID);
  }

  for (const arm of source.studyData.treatmentArms) {
    const members = qc.filter(row => row.TRT01A === arm.armName);
    const eff = efficacy.filter(row => row.arm === arm.armName);
    const safe = safety.filter(row => row.arm === arm.armName);
    const primary = source.studyData.efficacy.filter(item => item.armId === arm.armId && item.endpointType === 'primary');
    const count = (name, value) => members.filter(row => row[name] === value).length;
    const randomized = count('ITTFL', 'Y');
    const responders = count('PASI75W12', 'Y');
    const teae = count('TEAEFL', 'Y');
    const sae = count('SAEFL', 'Y');
    const withdrawals = count('AEWITHFL', 'Y');
    const deaths = new Set(source.studyData.adverseEvents.filter(e => e.armId === arm.armId && e.outcome === 'fatal')
      .map(e => e.subjectId)).size;
    if (eff.length !== 1 || safe.length !== 1 || primary.length !== 1 ||
        members.length !== arm.randomized || randomized !== arm.populations.itt ||
        count('COMPLTRT', 'Y') !== arm.populations.completed ||
        Number(eff[0].ITT) !== randomized ||
        Number(eff[0].responders) !== responders ||
        Number(eff[0].response_rate_pct) !== Number(primary[0].value) ||
        Number(eff[0].response_rate_pct) !== 100 * responders / randomized ||
        Number(eff[0].treatment_complete) !== count('COMPLTRT', 'Y') ||
        Number(safe[0].safety_n) !== arm.populations.safety ||
        Number(safe[0].subjects_with_teae) !== teae ||
        Number(safe[0].subjects_with_sae) !== sae ||
        Number(safe[0].subjects_ae_withdrawal) !== withdrawals ||
        Number(safe[0].deaths) !== deaths) {
      throw new Error('Synthetic QC, efficacy TLF, safety TLF and structured source disagree for ' + arm.armId + '; nothing was seeded.');
    }
  }
  return files;
}

/** Preserve the exact bytes that passed reconciliation until governed upload. */
function validatedDemoCsvFiles(source) {
  const files = Object.fromEntries(DEMO_CSV_NAMES.map(name =>
    [name, fs.readFileSync(path.join(DOC_ROOT, name))]));
  return validateSyntheticDemoRows(source, files);
}


const ORIGINAL_CSV_BUNDLE = 'FBT201_ADAM_INSPIRED_SOURCE_CSV_BUNDLE_v2.json.gz';
const ORIGINAL_CSV_BUNDLE_SHA256 = 'a4d5f423c98f3bd9ef0fe17ce0bb44e8fc05ccd5e6baeeabf479d9bf01d49590';
const ORIGINAL_CSV_NAMES = [
  '01_ADSL_synthetic_v2.csv', '02_ADEFF_synthetic.csv',
  '03_ADAE_synthetic.csv', '04_ADLB_synthetic.csv',
];

/** Load the original fictional rows, not a replacement synthetic re-generation.
 * This validates the exact bytes before upload; it never treats text CSVs as
 * CDISC-qualified SDTM/ADaM transport files or laboratory interpretation. */
export function validateOriginalDemoCsvBundle(source, qcFiles, bundleBytes) {
  if (sha256(bundleBytes) !== ORIGINAL_CSV_BUNDLE_SHA256) {
    throw new Error('The original fictional analysis CSV bundle does not match its pinned version-2 SHA-256. Nothing was seeded.');
  }
  const bundle = JSON.parse(gunzipSync(bundleBytes).toString('utf8'));
  if (bundle.synthetic !== true || bundle.sourceRevision !== 2 ||
      bundle.clinicalVerification !== 'not-established' ||
      !bundle.files || Object.keys(bundle.files).length !== ORIGINAL_CSV_NAMES.length ||
      ORIGINAL_CSV_NAMES.some(name => typeof bundle.files[name]?.contents !== 'string')) {
    throw new Error('The original fictional analysis CSV bundle is incomplete or was changed. Nothing was seeded.');
  }
  const files = Object.fromEntries(ORIGINAL_CSV_NAMES.map(name => {
    const bytes = Buffer.from(bundle.files[name].contents, 'utf8');
    if (sha256(bytes) !== bundle.files[name].sha256) {
      throw new Error('The original synthetic analysis file digest changed: ' + name + '. Nothing was seeded.');
    }
    return [name, bytes];
  }));

  const adsl = syntheticRows(ORIGINAL_CSV_NAMES[0], files[ORIGINAL_CSV_NAMES[0]],
    ['STUDYID', 'USUBJID', 'TRT01A', 'SAFFL', 'ITTFL', 'AGE', 'SEX', 'BASEPASI', 'COMPLTRT', 'PASI75W12']);
  const adeff = syntheticRows(ORIGINAL_CSV_NAMES[1], files[ORIGINAL_CSV_NAMES[1]],
    ['USUBJID', 'AVISIT', 'AVISITN', 'PASI', 'PASI75']);
  const adae = syntheticRows(ORIGINAL_CSV_NAMES[2], files[ORIGINAL_CSV_NAMES[2]],
    ['USUBJID', 'TRTA', 'AEDECOD', 'AESER', 'AESEV', 'AEREL', 'AEOUT', 'AEWITH']);
  const adlb = syntheticRows(ORIGINAL_CSV_NAMES[3], files[ORIGINAL_CSV_NAMES[3]],
    ['USUBJID', 'PARAM', 'AVISIT', 'AVAL']);
  const qc = syntheticRows(DEMO_CSV_NAMES[0], qcFiles[DEMO_CSV_NAMES[0]],
    ['STUDYID', 'USUBJID', 'TRT01A', 'ITTFL', 'SAFFL', 'PASI75W12', 'COMPLTRT', 'TEAEFL', 'SAEFL', 'AEWITHFL', 'PROVENANCE']);
  const qcBySubject = new Map(qc.map(r => [r.USUBJID, r]));
  const demographics = new Map(source.studyData.demographics.map(r => [r.subjectId, r]));
  const original = new Map(adsl.map(r => [r.USUBJID, r]));
  if (adsl.length !== 160 || original.size !== 160 || adeff.length !== 320 ||
      adae.length !== source.studyData.adverseEvents.length || adlb.length !== 320) {
    throw new Error('The synthetic ADSL/ADEFF/ADAE/ADLB rows no longer match the recorded trial size. Nothing was seeded.');
  }
  for (const row of adsl) {
    const q = qcBySubject.get(row.USUBJID);
    const demographic = demographics.get(row.USUBJID);
    if (!q || !demographic || row.STUDYID !== q.STUDYID || row.TRT01A !== q.TRT01A ||
        row.ITTFL !== q.ITTFL || row.SAFFL !== q.SAFFL ||
        row.PASI75W12 !== q.PASI75W12 || row.COMPLTRT !== q.COMPLTRT ||
        Number(row.AGE) !== demographic.age ||
        row.SEX !== ({ M: 'Male', F: 'Female', Other: 'Other' }[demographic.sex]) ||
        !Number.isFinite(Number(row.BASEPASI)) || Number(row.BASEPASI) <= 0) {
      throw new Error('The original synthetic ADSL observations contradict the QC index or source for ' + row.USUBJID + '. Nothing was seeded.');
    }
  }
  const visits = new Set();
  for (const row of adeff) {
    const p = original.get(row.USUBJID);
    const q = qcBySubject.get(row.USUBJID);
    const key = row.USUBJID + ':' + row.AVISITN;
    if (!p || !q || visits.has(key) ||
        !((row.AVISIT === 'Baseline' && row.AVISITN === '0' && row.PASI75 === '' &&
            Number(row.PASI) === Number(p.BASEPASI)) ||
           (row.AVISIT === 'Week 12' && row.AVISITN === '12' && row.PASI75 === q.PASI75W12)) ||
        !Number.isFinite(Number(row.PASI)) || Number(row.PASI) < 0) {
      throw new Error('The synthetic efficacy observations do not reconcile to ADSL/QC for ' + row.USUBJID + '. Nothing was seeded.');
    }
    visits.add(key);
  }
  const events = new Map(source.studyData.adverseEvents.map(r => [r.subjectId, r]));
  if (events.size !== adae.length) throw new Error('This synthetic AE listing no longer has one record per event subject. Nothing was seeded.');
  const related = { Related: 'related', 'Not related': 'unrelated', 'Not assessed': 'unknown' };
  const outcomes = { Recovered: 'recovered', Recovering: 'recovering', 'Not recovered': 'not-recovered', Fatal: 'fatal' };
  const matchedAes = new Set();
  for (const row of adae) {
    const e = events.get(row.USUBJID);
    const p = original.get(row.USUBJID);
    if (!e || !p || matchedAes.has(row.USUBJID) || row.TRTA !== p.TRT01A ||
        row.AEDECOD !== e.pt || (row.AESER === 'Y') !== e.serious ||
        row.AESEV.toLowerCase() !== e.severity || related[row.AEREL] !== e.related ||
        outcomes[row.AEOUT] !== e.outcome ||
        (row.AEWITH === 'Y') !== e.ledToDiscontinuation) {
      throw new Error('The synthetic AE listing contradicts the structured safety source for ' + row.USUBJID + '. Nothing was seeded.');
    }
    matchedAes.add(row.USUBJID);
  }
  const labVisits = new Set();
  for (const row of adlb) {
    const key = row.USUBJID + ':' + row.AVISIT;
    if (!original.has(row.USUBJID) || labVisits.has(key) || row.PARAM !== 'ALT (U/L)' ||
        !['Baseline', 'Week 12'].includes(row.AVISIT) ||
        !Number.isFinite(Number(row.AVAL)) || Number(row.AVAL) < 0) {
      throw new Error('The synthetic ALT lab CSV has a missing, duplicate or invalid observation. Nothing was seeded.');
    }
    labVisits.add(key);
  }
  for (const subjectId of original.keys()) {
    if (!visits.has(subjectId + ':0') || !visits.has(subjectId + ':12') ||
        !labVisits.has(subjectId + ':Baseline') || !labVisits.has(subjectId + ':Week 12')) {
      throw new Error('The synthetic efficacy/lab source omits a recorded subject or visit. Nothing was seeded.');
    }
  }
  return files;
}

function validatedOriginalCsvFiles(source, qcFiles) {
  return validateOriginalDemoCsvBundle(source, qcFiles,
    fs.readFileSync(path.join(DOC_ROOT, ORIGINAL_CSV_BUNDLE)));
}

function checkDemoOrg(identity) {
  // The organization is an existing authorized tenant, NOT a product-specific
  // workspace. Never post fictional clinical documents to a different tenant.
  const named = String(identity.organizationName ?? '').trim().toLowerCase();
  if (!named.startsWith(FAUX_ORG_NAME.toLowerCase())) {
    throw new Error('Faux Biotech seed refused: sign in as a member of the separately created Faux Biotech Therapeutics demonstration organization. Nothing was seeded.');
  }
}

async function ensureClient({ api, run, tally, identity }) {
  let id;
  await run.step('Project Management: fictional client record', async () => {
    const j = must(await api('GET', '/api/clients'), 200, 'list client records');
    if (!Array.isArray(j.clients)) {
      throw new Error('The client catalog was unavailable. No new fictional client was created.');
    }
    const candidates = asRows(j).filter(c => c.slug === CLIENT.slug);
    if (candidates.length > 1) {
      throw new Error('Multiple client records have the Faux Biotech slug. Reconcile client identity before seeding.');
    }
    const found = candidates[0] ?? null;
    if (found) {
      // The existing endpoint returns name, status and organizationId for each
      // client. The slug alone does not authorize adopting an unrelated,
      // inactive or renamed client as this fictional project's parent.
      if (found.name !== CLIENT.name || String(found.organizationId ?? '') !== String(identity.organizationId) ||
          String(found.status ?? '').toLowerCase() !== 'active') {
        throw new Error('The Faux Biotech client record has a mismatched tenant, name or inactive status. No project/data was attached.');
      }
      id = Number(found.id);
      tally.found('client-record');
    } else {
      const created = must(await api('POST', '/api/clients', CLIENT), [200, 201], 'create fictional client record');
      const saved = created.client ?? created.data ?? created;
      if (saved.name !== CLIENT.name || saved.slug !== CLIENT.slug ||
          String(saved.organizationId ?? '') !== String(identity.organizationId)) {
        throw new Error('The new client receipt did not confirm the fictional tenant and identity. No project was created.');
      }
      id = Number(saved.id);
      tally.created('client-record');
    }
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Client record did not return a valid identifier.');
    return `client ${id}`;
  });
  return id;
}

async function listProjects(api) {
  const rows = [];
  for (let offset = 0, page = 0; page < 100; page += 1) {
    const data = must(await api('GET', `/api/c2c/projects?limit=200${offset ? `&offset=${offset}` : ''}`), 200, 'list governed projects');
    if (!Array.isArray(data.data) || data.meta?.pendingStore === true || data.meta?.reconciliationRequired === true) {
      throw new Error('The existing Project Management list is unavailable or not reconciled; project creation was not attempted.');
    }
    rows.push(...data.data);
    if (data.meta?.hasMore !== true) return rows;
    if (data.data.length === 0) throw new Error('Project pagination returned no progress; refusing duplicate creation.');
    offset += data.data.length;
  }
  throw new Error('Project pagination exceeded the search limit; refusing duplicate creation.');
}

async function ensureProject({ api, run, tally }, clientWorkspaceId, clinicalSource) {
  const name = title(TITLE);
  // Put the study's goal, proposed hypothesis and trial context in the
  // EXISTING Project Management charter objective at creation. The user does
  // not have to reconstruct that context from PDFs in a separate CSR app.
  // This is entirely FICTIONAL, not a clinical conclusion or approval.
  const info = clinicalSource.studyInfo;
  const objective = [
    'Synthetic study and medical-writing objective: author an evidence-linked ICH E3 Clinical Study Report for FBT-201; report unknown fields rather than fabricate results.',
    `Fictional protocol ${info.protocolNumber}: ${info.studyDesign}; indication ${info.indication}; planned randomized population ${info.sampleSize}.`,
    `Fictional study hypothesis (not a finding): ${info.investigationalProduct} increases ${info.primaryEndpoint} versus ${info.comparator}.`,
    `Recorded source data cut ${clinicalSource.dataCutDate}; maintain all original versions, statistical source links and independent human review.`,
  ].join(' ');
  let result;
  await run.step('Project Management: create/reopen FBT-201 (document type CSR)', async () => {
    const matchingProjects = (await listProjects(api)).filter(p => (p.title ?? p.name) === name);
    if (matchingProjects.length > 1) {
      throw new Error('More than one FBT-201 project has this exact title. Reconcile the existing projects before creating or reusing a record.');
    }
    let row = matchingProjects[0];
    if (!row) {
      const j = must(await api('POST', '/api/c2c/projects', {
        name, productName: 'FBT-201',
        programType: 'csr', submissionTypeId: 'ich_csr',
        productType: 'biologic', primaryAgency: 'ICH / Global',
        clientWorkspaceId,
        indication: 'Moderate-to-severe plaque psoriasis (fictional)',
        objective,
        objectiveSources: [], priority: 'high', teamMembers: [],
      }), 201, 'create FBT-201 CSR project');
      row = j.data;
      tally.created('project');
    } else tally.found('project');
    if (!row?.id) throw new Error('The CSR project had no recorded identifier.');
    // GET /api/c2c/projects/:id returns the project DETAIL directly, unlike
    // POST /api/c2c/projects, whose creation receipt is nested under data.
    // Do not mistake a valid unwrapped response for an empty object.
    const detail = must(await api('GET', `/api/c2c/projects/${row.id}`), 200, 'read FBT-201 project');
    if (String(detail.id ?? '') !== String(row.id)) {
      throw new Error('Project Management returned another project identity. No demo records were attached.');
    }
    // The existing PM anchor joins client_workspaces. An absent binding is a
    // gap, not permission to proceed with data in an unanchored project.
    if (!Number.isSafeInteger(Number(detail.client_workspace_id)) ||
        Number(detail.client_workspace_id) !== clientWorkspaceId) {
      throw new Error('The FBT-201 project is not recorded under this fictional client. Nothing was moved or overwritten.');
    }
    if (detail.program_type !== 'csr') {
      throw new Error('An existing FBT-201 project is not the CSR document type. Nothing was overwritten.');
    }
    result = { id: row.id, title: name, programType: 'csr', clientWorkspaceId };
    return `project ${row.id}`;
  });
  run.record('project', result);
  return result;
}

function pdfFromMarkdown(filename, label) {
  const markdown = fs.readFileSync(path.join(DOC_ROOT, filename), 'utf8');
  const paragraphs = markdown.split(/\n\s*\n/).map(p => p.replace(/^#+\s*/gm, '').trim()).filter(Boolean);
  return makeMultiPagePdfBuffer({
    title: title(label),
    subtitle: 'SYNTHETIC — NOT CLINICAL EVIDENCE',
    footer: 'Faux Biotech Therapeutics · Fictional demonstration',
    sections: [{ heading: label, paragraphs }],
  });
}

/** Search ALL current Vault results for this source label before creating
 * another version. A page of 50 results is not evidence that a source on page
 * two does not exist. The existing project search returns an exact total and
 * bounded offset; incomplete/malformed search fails closed. */
async function sourceCandidates(api, programId, label, exactTitle) {
  const matches = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const path = `/api/c2c/project-vault/${programId}/search?q=${encodeURIComponent(label)}&limit=50${offset ? `&offset=${offset}` : ''}`;
    const response = must(await api('GET', path), 200, 'search existing project Data Room source');
    const data = response.data;
    if (!Array.isArray(data?.results) || !Number.isSafeInteger(data.total) ||
        data.total < 0 || data.results.length > 50) {
      throw new Error('The project Data Room did not return a complete, paginated source list. No duplicate upload was attempted.');
    }
    for (const entry of data.results) {
      if (entry.title === exactTitle) matches.push(entry);
    }
    offset += data.results.length;
    if (offset === data.total) return matches;
    if (data.results.length === 0 || offset > data.total) {
      throw new Error('Project Data Room search paging made no progress or changed during the read. No duplicate upload was attempted.');
    }
  }
  throw new Error('Project Data Room search exceeded 100 pages. Reconcile the existing catalog rather than risk a duplicate upload.');
}

async function ensureSource({ api, run, tally }, project, spec) {
  await run.step(`Project Data Room: ${spec.label}`, async () => {
    const name = title(spec.label);
    const content = spec.bytes();
    const digest = sha256(content);
    const sameTitle = await sourceCandidates(api, project.id, spec.label, name);
    if (sameTitle.length > 1) {
      throw new Error(`The project Data Room has duplicate current candidates titled "${name}". Reconcile their versions before a demo seed.`);
    }
    const existing = sameTitle[0] ?? null;
    if (existing) {
      if (existing.current !== true || existing.contentHash !== digest) {
        throw new Error(`A source titled "${name}" exists but its current SHA-256 does not match revision 2. Reconcile it in Vault; this seed will not overwrite governed data.`);
      }
      // A matching catalog checksum alone is not proof the original is
      // available to Data Room/AnA. The existing search projects the governed
      // binary-availability decision. Never claim this source is ready when its
      // original was removed or cannot be supplied to the editor.
      if (existing.originalFileAvailable !== true) {
        throw new Error(`Source "${name}" has matching metadata but its original file is unavailable. Restore or re-ingest it through the existing governed Vault lifecycle; this seed will not claim success.`);
      }
      let metadataCorrected = false;
      if (existing.documentType !== spec.documentType) {
        // A prior seed labelled all three files OTHER. This exact-byte,
        // unpublished synthetic protocol or SAP can be reclassified through
        // the EXISTING audited Vault Edit details action, never through SQL.
        // Do not change an approved/frozen record or replace an unrelated type.
        if (existing.documentType !== 'OTHER' || spec.documentType === 'OTHER' ||
            existing.lifecycleStage != null) {
          throw new Error(`The current source "${name}" has an incompatible or governed document type. Correct it through the existing Vault review controls.`);
        }
        const edited = must(await api('POST',
          `/api/c2c/project-vault/${project.id}/documents/${existing.id}/details`, {
            documentType: spec.documentType,
            reason: 'Fictional FBT-201 demo source-catalog correction: classify the unchanged original bytes as the recorded protocol or statistical analysis plan.',
          }), 200, 'audit the synthetic source type correction');
        if (edited.success !== true) {
          throw new Error('The Vault did not confirm the source metadata correction; do not assume it was saved.');
        }
        // The same governed search that located the source must confirm both
        // its type AND digest before the seed can proceed.
        const confirmed = await sourceCandidates(api, project.id, spec.label, name);
        if (confirmed.length !== 1 ||
            confirmed[0].documentType !== spec.documentType ||
            confirmed[0].contentHash !== digest || confirmed[0].current !== true ||
            confirmed[0].originalFileAvailable !== true) {
          throw new Error('The corrected Vault document type or content hash could not be confirmed. Review its existing audit history before retrying.');
        }
        tally.created('source-metadata-correction');
        metadataCorrected = true;
      }
      tally.found('source-document');
      run.record(`source.${spec.key}`, { id: existing.id, title: name, sha256: digest,
        documentType: spec.documentType, action: metadataCorrected ? 'audited-type-correction' : 'found-and-hash-checked' });
      return `found ${existing.id} (digest and document type verified)`;
    }

    const form = new FormData();
    form.append('file', new Blob([content], { type: spec.mime }), spec.fileName);
    form.append('programId', project.id);
    form.append('documentCode', spec.code);
    form.append('documentTitle', name);
    // Preserve the source's existing Vault document taxonomy rather than
    // flattening every protocol/SAP into 'Other'. The synthetic JSON remains
    // OTHER because the current ingest enum has no scientific-dataset token.
    form.append('documentType', spec.documentType);
    const result = must(await api('POST', '/api/vault/ingest', form), 201, `ingest ${spec.label}`);
    if (!result.document?.id || result.document?.contentHash !== digest) {
      throw new Error('The Data Room ingestion returned no document or a different content hash; the source is not qualified.');
    }
    tally.created('source-document');
    run.record(`source.${spec.key}`, { id: result.document.id, title: name, sha256: digest,
      documentType: spec.documentType, action: 'uploaded', approval: 'not-assumed' });
    return `uploaded ${result.document.id} (digest verified)`;
  });
}

/** The existing ONE editor only exposes the study-data build when the
 * working document stores this exact component template entry. Resolve its
 * current UUID from the existing governed catalog, never by guessing a row
 * or selecting the second legacy ICH_CSR template. */
const CSR_TEMPLATE_ENTRY = 'component:clinical_study_report';
const AUTHORING_DOC_NAME = 'FBT-201 ICH E3 Clinical Study Report — working draft';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function canonicalCsrTemplate(api) {
  // Resolve the one editor's template BEFORE writing the project or the Vault
  // assets. An unready authoring catalog must not leave a new half-demo behind.
  const search = must(await api('GET',
    '/api/authoring/templates?search=Clinical%20Study%20Report'), 200, 'read the existing authoring template catalog');
  const matches = (Array.isArray(search.templates) ? search.templates : [])
    .filter(template => template.entryId === CSR_TEMPLATE_ENTRY);
  if (matches.length !== 1 || !UUID_RE.test(String(matches[0].id ?? '')) ||
      !(Number(matches[0].section_count) > 0)) {
    throw new Error('The one canonical CSR component template is unavailable or duplicated. No demo records were written.');
  }
  return matches[0];
}

async function ensureCsrWorkingDocument({ api, run, tally }, project, template) {
  let document;
  await run.step('Canvas / one editor: create or reopen ICH E3 CSR working draft', async () => {
    const endpoint = `/api/authoring/docs?status=all&programId=${encodeURIComponent(project.id)}`;
    const before = must(await api('GET', endpoint), 200, 'list the project\'s working documents');
    if (!Array.isArray(before.documents)) {
      throw new Error('The authorized project document list was not readable; no CSR draft was created.');
    }
    const titleText = title(AUTHORING_DOC_NAME);
    const already = before.documents.filter(row => row.title === titleText);
    if (already.length > 1) {
      throw new Error('Multiple same-title CSR working documents already exist. Reconcile in the one editor; no new document was created.');
    }
    if (already.length && (
        String(already[0].program_id ?? '') !== String(project.id) ||
        String(already[0].template_id ?? '') !== String(template.id) ||
        !UUID_RE.test(String(already[0].id ?? '')))) {
      throw new Error('An existing CSR working document has the wrong project or template. No record was replaced.');
    }
    // The one editor projects the current document's stored status and
    // permission scope. A frozen, approved or review-locked record is NOT a
    // working draft; a section-only reader cannot open the whole document.
    // Reusing either would leave a pending Tasking review linked to a record
    // the current actor may not edit or even open.
    if (already.length && (
        String(already[0].status ?? '').trim().toUpperCase() !== 'DRAFT' ||
        already[0].readScope !== 'document')) {
      throw new Error('The existing CSR is not an editable working draft with full document access. Resolve its status or access in the existing editor; no pending review task was attached.');
    }

    let id;
    if (already.length) {
      id = String(already[0].id);
      tally.found('authoring-document');
    } else {
      const started = must(await api('POST', '/api/authoring/docs', {
        title: titleText,
        template_id: template.id,
        client_program_id: project.id,
      }), 201, 'create the CSR working copy in the existing editor');
      id = String(started.document?.id ?? '');
      if (!UUID_RE.test(id)) {
        throw new Error('Authoring creation did not return a stored document UUID. Inspect the created records before retrying.');
      }
      tally.created('authoring-document');
    }

    // The list read is the same endpoint used by DocumentAuthoring. It must
    // actually show the new or found document in the CURRENT project.
    const after = must(await api('GET', endpoint), 200, 'reopen the project\'s CSR working document');
    const matching = (Array.isArray(after.documents) ? after.documents : [])
      .filter(row => row.title === titleText);
    const saved = matching.find(row => String(row.id) === id);
    if (matching.length !== 1 || !saved || String(saved.program_id ?? '') !== String(project.id) ||
        String(saved.template_id ?? '') !== String(template.id) ||
        !(Number(saved.section_count) > 0) ||
        String(saved.status ?? '').trim().toUpperCase() !== 'DRAFT' ||
        saved.readScope !== 'document') {
      throw new Error('The editor did not return an accessible, editable CSR draft with the canonical template and seeded ICH E3 sections. The demo is not ready.');
    }
    // A whole-document read grant is not necessarily an EDIT grant. The
    // existing document-detail endpoint resolves the caller's current
    // Authoring permissions and project scope, without making a write.
    const detail = must(await api('GET',
      `/api/authoring/docs/${id}?programId=${encodeURIComponent(project.id)}`), 200, 'verify governed CSR editing access');
    if (detail.success !== true || String(detail.document?.id ?? '') !== id ||
        String(detail.document?.client_program_id ?? '') !== String(project.id) ||
        String(detail.document?.template_id ?? '') !== String(template.id) ||
        String(detail.document?.status ?? '').trim().toUpperCase() !== 'DRAFT' ||
        detail.document?.readScope !== 'document' ||
        detail.access?.edit?.allowed !== true) {
      throw new Error('The current account cannot edit this CSR document in the one editor. Resolve its governed Authoring permissions before creating a review task.');
    }
    document = {
      id,
      title: titleText,
      templateId: String(template.id),
      templateEntry: CSR_TEMPLATE_ENTRY,
      programId: String(project.id),
      sectionCount: Number(saved.section_count),
      status: saved.status ?? 'draft',
    };
    run.record('authoring.document', document);
    return `document ${id}, ${document.sectionCount} ICH E3 sections (not approved)`;
  });
  return document;
}

/** The original evidence stays in the project's Data Room; no fabricated approval. */
export async function seed(ctx) {
  checkDemoOrg(ctx.identity);
  const source = sourceBytes(); // fail before any write on a wrong revision
  const csvFiles = validatedDemoCsvFiles(source.envelope); // compare all six sources before any write
  const originalCsvFiles = validatedOriginalCsvFiles(source.envelope, csvFiles);
  const tally = makeTally(ctx.run);
  const c = { ...ctx, tally };
  ctx.run.note('The fictional client and FBT-201 project use the platform\'s existing Project Management, Data Room, Tasking and single editor. No CSR application, parallel workflow, study approval, signature or clinical trial is created.');
  ctx.run.record('sourceRevision', { revision: 2, sha256: source.digest, synthetic: true, clinicalVerification: 'not-established' });
  const canonicalTemplate = await canonicalCsrTemplate(ctx.api);

  const clientWorkspaceId = await ensureClient(c);
  const project = await ensureProject(c, clientWorkspaceId, source.envelope);
  await ensureSource(c, project, {
    key: 'csr-source-v2', label: 'FBT-201 clinical source JSON · synthetic v2',
    fileName: 'fbt201-csr-source-synthetic-v2.json', mime: 'application/json',
    code: 'FBT-201-CSR-SOURCE-v2.json', documentType: 'OTHER', bytes: () => source.bytes,
  });
  for (const [key, filename, label] of [
    ['protocol', 'PROTOCOL_FBT-201-2026_v2.md', 'FBT-201 study protocol · synthetic v2'],
    ['sap', 'SAP_FBT-201-2026_v1.md', 'FBT-201 statistical analysis plan · synthetic v1'],
  ]) {
    await ensureSource(c, project, {
      key, label, fileName: `fbt201-${key}-synthetic.pdf`, mime: 'application/pdf',
      code: `FBT-201-${key.toUpperCase()}-SYNTHETIC.pdf`,
      documentType: key === 'protocol' ? 'PROTOCOL' : 'SAP',
      bytes: () => pdfFromMarkdown(filename, label),
    });
  }
  // These original/reconciled fictional tabulations already exist alongside
  // the structured source. Admit them into the SAME project's Data Room, so
  // Biostatistics, the one editor and AnA can inspect their real Vault records.
  // The ADSL file is only a synthetic QC INDEX, not an ADaM XPT, SDTM dataset
  // or a CDISC conformity receipt. TLFs are descriptive and unapproved.
  for (const [key, fileName, label, documentType] of [
    ['adsl-qc-v2', 'ADSL_160_SUBJECT_QC_INDEX.csv', 'FBT-201 synthetic subject QC index · v2 (not ADaM)', 'OTHER'],
    ['tl-f-efficacy-v2', 'TLF_PRIMARY_EFFICACY.csv', 'FBT-201 synthetic PASI75 efficacy TLF · v2', 'REPORT'],
    ['tl-f-safety-v2', 'TLF_SAFETY.csv', 'FBT-201 synthetic adverse-event safety TLF · v2', 'REPORT'],
  ]) {
    await ensureSource(c, project, {
      key, label, documentType,
      fileName: `fbt201-${key}-synthetic.csv`, mime: 'text/csv',
      code: `FBT-201-${key.toUpperCase()}-SYNTHETIC.csv`,
      bytes: () => csvFiles[fileName],
    });
  }
  // These ORIGINAL fictional analysis rows are source observations, not
  // trusted clinical statistics or qualified CDISC transports. Each is opened
  // through the existing Data Room and preserved byte-for-byte with its digest.
  for (const [key, fileName, label] of [
    ['adsl-original-v2', '01_ADSL_synthetic_v2.csv', 'FBT-201 synthetic ADSL-inspired participant observations · v2 (not CDISC)'],
    ['adeff-original-v2', '02_ADEFF_synthetic.csv', 'FBT-201 synthetic ADEFF-inspired efficacy observations · v2 (not CDISC)'],
    ['adae-original-v2', '03_ADAE_synthetic.csv', 'FBT-201 synthetic ADAE-inspired safety observations · v2 (not CDISC)'],
    ['adlb-original-v2', '04_ADLB_synthetic.csv', 'FBT-201 synthetic ADLB-inspired ALT observations · v2 (not CDISC)'],
  ]) {
    await ensureSource(c, project, {
      key, label, documentType: 'OTHER',
      fileName: `fbt201-${key}-synthetic.csv`, mime: 'text/csv',
      code: `FBT-201-${key.toUpperCase()}-SYNTHETIC.csv`,
      bytes: () => originalCsvFiles[fileName],
    });
  }
  const workingDocument = await ensureCsrWorkingDocument(c, project, canonicalTemplate);
  // The original Tasking and one-editor navigation already understand the
  // authoring_document origin. This is a pending work item, not an executed
  // review or an electronic signature.
  const linkedTasks = tasks.map(task => task.title.includes('Human-review')
    ? { ...task, moduleType: 'Authoring', taskType: 'review', category: 'review',
      sourceEntityType: 'authoring_document', sourceEntityId: workingDocument.id,
      moduleData: { authoringDocId: workingDocument.id, programId: project.id, raisedFrom: 'demo-project' },
    } : task);
  await ensureTasks(c, project, linkedTasks, 'FBT-201');
  const sum = counts => Object.values(counts).reduce((a, b) => a + b, 0);
  ctx.run.record('summary', { created: sum(tally.tally.created), found: sum(tally.tally.found) });
  ctx.run.note('CSR source is uploaded, not reviewed or approved. Authorized source selection/preview/freeze, real AnA drafting, editor save/reopen and reviewer actions must be completed in the existing UI.');
}

export async function purge({ run }) {
  await run.step('Purge: Faux Biotech synthetic demo', async () => {
    run.note('No destructive purge of the governed project, sources or task records is authorized by this pack; archive through existing Project Management/Vault lifecycle controls.');
    return 'no records deleted';
  });
}
