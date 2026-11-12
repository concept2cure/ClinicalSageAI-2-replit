/**
 * launch-demo/packs/lumen-csr-text.mjs — the text of a completed synthetic CSR, section by ICH E3 section.
 *
 * Every count, percentage, mean and listing below is computed here from the study's own source (the same
 * concept2cure.csr-source.v1 file frozen into the report as its study data), so the report agrees with the tables
 * the editor's "Build from the study's data" makes from that file. Nothing is typed in as a number. Where the source
 * does not hold what a section asks for (individual laboratory values, compliance, CRF pages), the section says so
 * rather than inventing it. The narrative (objectives, criteria, sites, dates, people) is the study's spec in
 * lumen-csr-studies.mjs; all of it is fictional.
 *
 * This is demo-seed text written as the demo lead, not text drafted by a model: no section carries machine
 * provenance, so the report can be reviewed, frozen and signed like any person's document.
 */

import { twoProportionPower } from './lumen-csr-studies.mjs';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const p = (text) => `<p>${esc(text)}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const r1 = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '—');
const pct = (x, n) => (n ? `${x} (${r1((100 * x) / n)}%)` : `${x}`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const SYNTHETIC_BANNER = 'SYNTHETIC DEMONSTRATION REPORT. The study, its participants and every result are invented for the Concept2Cure demonstration. This is not clinical evidence and describes no real person, product or trial. Every number is computed from the study\'s synthetic source, which is filed in the project\'s Vault and frozen into this report as its study data.';

/* ── Statistics from the source ────────────────────────────────────────────────────────────────────────────────── */

function describe(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { n: v.length, mean, sd, median, min: v[0], max: v[v.length - 1] };
}
const descText = (d) => (d ? `${r1(d.mean)} (${r1(d.sd)}); median ${r1(d.median)} (${r1(d.min)}–${r1(d.max)})` : 'not recorded');

/** Everything the sections read, computed once from the source. */
export function csrStats(source) {
  const sd = source.studyData;
  const arms = sd.treatmentArms.map((a) => {
    const subjects = source.participants.filter((x) => x.armId === a.armId);
    const disp = sd.disposition.filter((d) => d.armId === a.armId);
    return { ...a, subjects, disposition: disp, discontinued: disp.filter((d) => d.status !== 'completed') };
  });
  const total = source.participants.length;
  const armOf = (id) => arms.find((a) => a.armId === id);
  const aes = sd.adverseEvents;
  const subjectsWith = (rows) => new Set(rows.map((x) => x.subjectId)).size;
  const aeByArm = (armId, filter = () => true) => aes.filter((x) => x.armId === armId && filter(x));
  const socs = [...new Set(aes.map((x) => x.soc))].sort();
  const ptsBySoc = Object.fromEntries(socs.map((soc) => [soc, [...new Set(aes.filter((x) => x.soc === soc).map((x) => x.pt))].sort()]));
  const vitals = [...new Set((sd.vitalSigns ?? []).map((v) => v.parameter))].map((parameter) => ({
    parameter,
    byArm: arms.map((a) => {
      const rows = (sd.vitalSigns ?? []).filter((v) => v.parameter === parameter && v.armId === a.armId);
      return { armId: a.armId, base: describe(rows.map((r) => r.baseline)), last: describe(rows.map((r) => r.lastOnTreatment)), change: describe(rows.map((r) => r.lastOnTreatment - r.baseline)) };
    }),
  }));
  return { source, arms, total, armOf, aes, subjectsWith, aeByArm, socs, ptsBySoc, vitals };
}

/* ── Shared tables ─────────────────────────────────────────────────────────────────────────────────────────────── */

const armHead = (s, first) => [first, ...s.arms.map((a) => `${a.armName} (N=${a.randomized})`)];

function dispositionTable(s) {
  const reasons = [...new Set(s.arms.flatMap((a) => a.discontinued.map((d) => d.reason ?? d.status)))];
  return table(armHead(s, 'Disposition'), [
    ['Randomised', ...s.arms.map((a) => String(a.randomized))],
    ['Treated (safety population)', ...s.arms.map((a) => String(a.populations.safety))],
    ['Completed the study', ...s.arms.map((a) => pct(a.populations.completed, a.randomized))],
    ['Did not complete', ...s.arms.map((a) => pct(a.discontinued.length, a.randomized))],
    ...reasons.map((r) => [`  ${r}`, ...s.arms.map((a) => String(a.discontinued.filter((d) => (d.reason ?? d.status) === r).length))]),
  ]);
}

function demographicsTable(s) {
  const demo = s.source.studyData.demographics;
  const rows = [];
  const col = (fn) => [...s.arms.map((a) => fn(demo.filter((d) => d.armId === a.armId), a.randomized)), fn(demo, s.total)];
  rows.push(['Age (years), mean (SD); median (min–max)', ...col((d) => descText(describe(d.map((x) => x.age))))]);
  for (const sex of ['F', 'M']) rows.push([sex === 'F' ? 'Female, n (%)' : 'Male, n (%)', ...col((d, n) => pct(d.filter((x) => x.sex === sex).length, n))]);
  const races = [...new Set(demo.map((d) => d.race).filter(Boolean))].sort();
  for (const race of races) rows.push([`Race: ${race}, n (%)`, ...col((d, n) => pct(d.filter((x) => x.race === race).length, n))]);
  if (demo.some((d) => d.ethnicity)) rows.push(['Hispanic or Latino, n (%)', ...col((d, n) => pct(d.filter((x) => x.ethnicity === 'Hispanic or Latino').length, n))]);
  if (demo.some((d) => d.weight)) rows.push(['Weight (kg), mean (SD); median (min–max)', ...col((d) => descText(describe(d.map((x) => x.weight))))]);
  if (demo.some((d) => d.bmi)) rows.push(['Body-mass index (kg/m²), mean (SD); median (min–max)', ...col((d) => descText(describe(d.map((x) => x.bmi))))]);
  return table([...armHead(s, 'Characteristic'), `Total (N=${s.total})`], rows);
}

function efficacyTable(s) {
  const rows = s.source.studyData.efficacy.map((e) => [
    `${e.endpointName} (${e.endpointType})`,
    e.armId ? s.armOf(e.armId)?.armName ?? e.armId : 'Comparison',
    e.display,
    e.ci ? `${r1(100 * e.ci.lower)} to ${r1(100 * e.ci.upper)} (${e.ci.level})` : '—',
    e.pValue !== undefined ? e.pValue.toFixed(4) : '—',
  ]);
  return table(['Endpoint', 'Arm', 'Result', '95% confidence interval (percentage points)', 'p-value'], rows);
}

function aeOverviewTable(s) {
  const line = (label, filter) => [label, ...s.arms.map((a) => pct(s.subjectsWith(s.aeByArm(a.armId, filter)), a.populations.safety))];
  return table(armHead(s, 'Participants with, n (%)'), [
    line('Any treatment-emergent adverse event', () => true),
    line('A related adverse event', (x) => x.related === 'related'),
    line('A severe adverse event', (x) => x.severity === 'severe'),
    line('A serious adverse event', (x) => x.serious),
    line('An adverse event leading to discontinuation', (x) => x.ledToDiscontinuation === true),
    line('An adverse event with a fatal outcome', (x) => x.outcome === 'fatal'),
    ['Adverse events (all, events)', ...s.arms.map((a) => String(s.aeByArm(a.armId).length))],
  ]);
}

function aeSocPtTable(s) {
  const rows = [];
  for (const soc of s.socs) {
    rows.push([soc, ...s.arms.map((a) => pct(s.subjectsWith(s.aeByArm(a.armId, (x) => x.soc === soc)), a.populations.safety))]);
    for (const pt of s.ptsBySoc[soc]) rows.push([`  ${pt}`, ...s.arms.map((a) => pct(s.subjectsWith(s.aeByArm(a.armId, (x) => x.pt === pt)), a.populations.safety))]);
  }
  return rows.length ? table(armHead(s, 'System organ class / preferred term, participants n (%)'), rows) : p('No adverse events are recorded in the source.');
}

function aeListing(s, filter = () => true) {
  const rows = s.aes.filter(filter).map((x) => [x.subjectId, s.armOf(x.armId)?.armName ?? x.armId, x.soc, x.pt, x.severity, x.serious ? 'Yes' : 'No', x.related, x.outcome ?? 'not recorded', x.ledToDiscontinuation ? 'Yes' : 'No']);
  return rows.length ? table(['Participant', 'Arm', 'System organ class', 'Preferred term', 'Severity', 'Serious', 'Relationship', 'Outcome', 'Led to discontinuation'], rows) : p('None recorded.');
}

function exposureTable(s) {
  const ex = s.source.studyData.exposure ?? [];
  if (!ex.length) return p('The source records no exposure summary.');
  return table(['Arm', 'Dose', 'Mean duration of exposure (days)', 'Total exposure (participant-years)'], ex.map((e) => [s.armOf(e.armId)?.armName ?? e.armId, e.meanDailyDose ?? 'not recorded', r1(e.meanExposureDays), e.totalPersonYears !== undefined ? e.totalPersonYears.toFixed(3) : '—']));
}

function labShiftTable(s) {
  const labs = s.source.studyData.labShifts ?? [];
  if (!labs.length) return p('The source records no laboratory summaries.');
  return table(['Parameter', 'Arm', 'Assessed', 'Normal at baseline', 'Normal to high', 'Normal to low'], labs.map((l) => [l.parameter, s.armOf(l.armId)?.armName ?? l.armId, String(l.totalAssessed), String(l.shiftFromNormal), pct(l.shiftToHigh, l.shiftFromNormal), pct(l.shiftToLow, l.shiftFromNormal)]));
}

function vitalsTable(s) {
  if (!s.vitals.length) return p('The source records no vital signs.');
  const rows = s.vitals.flatMap((v) => v.byArm.map((b) => [v.parameter, s.armOf(b.armId)?.armName ?? b.armId, b.base ? `${r1(b.base.mean)} (${r1(b.base.sd)})` : '—', b.last ? `${r1(b.last.mean)} (${r1(b.last.sd)})` : '—', b.change ? `${r1(b.change.mean)} (${r1(b.change.sd)})` : '—']));
  return table(['Parameter', 'Arm', 'Baseline, mean (SD)', 'Last on treatment, mean (SD)', 'Change, mean (SD)'], rows);
}

function conmedTable(s) {
  const cm = s.source.studyData.concomitantMedications ?? [];
  if (!cm.length) return p('No concomitant medications are recorded in the source.');
  const meds = [...new Set(cm.map((c) => c.medication))].sort();
  return table(armHead(s, 'Medication (ATC class), participants n (%)'), meds.map((m) => {
    const atc = cm.find((c) => c.medication === m)?.atcClass;
    return [`${m}${atc ? ` (${atc})` : ''}`, ...s.arms.map((a) => pct(new Set(cm.filter((c) => c.medication === m && c.armId === a.armId).map((c) => c.subjectId)).size, a.populations.safety))];
  }));
}

/* ── Sentences that summarise results ──────────────────────────────────────────────────────────────────────────── */

function primarySentences(study, s) {
  const info = s.source.studyInfo;
  const results = s.source.studyData.efficacy.filter((e) => e.endpointName === info.primaryEndpoint);
  const perArm = results.filter((e) => e.armId).map((e) => `${s.armOf(e.armId)?.armName ?? e.armId}: ${e.display}`);
  const diff = results.find((e) => !e.armId && e.ci);
  const out = [`${info.primaryEndpoint}: ${perArm.join('; ')}.`];
  if (diff) out.push(`The difference was ${r1(100 * diff.value)} percentage points (95% CI ${r1(100 * diff.ci.lower)} to ${r1(100 * diff.ci.upper)}; two-sided Fisher's exact p = ${diff.pValue.toFixed(4)}).`);
  return out;
}

function safetySentences(s) {
  const any = s.arms.map((a) => `${pct(s.subjectsWith(s.aeByArm(a.armId)), a.populations.safety)} on ${a.armName}`);
  const serious = s.aes.filter((x) => x.serious).length;
  const deaths = s.aes.filter((x) => x.outcome === 'fatal').length;
  const disc = s.aes.filter((x) => x.ledToDiscontinuation).length;
  const counts = new Map();
  for (const x of s.aes) counts.set(x.pt, (counts.get(x.pt) ?? new Set()).add(x.subjectId));
  const common = [...counts.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).slice(0, 3).map(([pt, set]) => `${pt} (${plural(set.size, 'participant')})`);
  return [
    `Participants with at least one treatment-emergent adverse event: ${any.join('; ')}.`,
    common.length ? `The most frequent preferred terms overall were ${common.join(', ')}.` : 'No adverse event was recorded.',
    `${plural(deaths, 'death')} and ${plural(serious, 'serious adverse event')} were recorded; ${plural(disc, 'adverse event')} led to discontinuation of study treatment.`,
  ];
}

/* ── The sections ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** The study narrative, wherever the spec keeps it (LMN-201 at the top level, generated studies under `narrative`). */
const narrativeOf = (study) => study.narrative ?? study;

function sectionsFor(study, s) {
  const n = narrativeOf(study);
  const info = s.source.studyInfo;
  const control = s.arms.find((a) => /placebo|control/i.test(a.armId)) ?? s.arms[s.arms.length - 1];
  const dataCut = s.source.dataCutDate;
  const lowerBetter = study.efficacy?.primary?.lowerIsBetter;
  const notInSource = (what) => p(`${what} are not part of this study's synthetic source, so they are not reproduced in this demonstration report. In a report for filing they are provided here.`);

  return {
    '1': p(SYNTHETIC_BANNER) + table(['Item', 'Detail'], [
      ['Study title', info.title], ['Protocol number', info.protocolNumber], ['Phase', info.phase],
      ['Investigational product', info.investigationalProduct], ['Indication', info.indication], ['Sponsor', info.sponsor],
      ['Design', n.design], ['First participant enrolled', n.dates.firstSubjectIn], ['Last participant completed', n.dates.lastSubjectOut],
      ['Data cut-off', dataCut], ['Report date', n.dates.report], ['Report version', study.reportVersion],
      ['Sponsor signatory', 'Medical Director, Lumen Bioscience (fictional demo role)'],
    ]) + p('The study was conducted in accordance with the principles of the Declaration of Helsinki and ICH E6(R3) Good Clinical Practice, including the archiving of essential documents (synthetic statement).'),
    '2': p(SYNTHETIC_BANNER)
      + table(['Synopsis item', 'Summary'], [
        ['Objectives', [...n.objectives.primary, ...n.objectives.secondary].join(' ')],
        ['Design', `${n.design[0].toUpperCase()}${n.design.slice(1)}; ${n.durationText}.`],
        ['Population', `${n.population[0].toUpperCase()}${n.population.slice(1)}. ${s.total} participants were randomised: ${s.arms.map((a) => `${a.randomized} to ${a.armName}`).join(', ')}.`],
        ['Treatments', `${n.dosing.active}; control: ${n.dosing.control}.`],
        ['Primary endpoint', info.primaryEndpoint],
        ['Efficacy results', primarySentences(study, s).join(' ')],
        ['Safety results', safetySentences(s).join(' ')],
        ['Conclusions', conclusion(study, s)],
      ]),
    '3': p('The table of contents is generated from this report\'s headings by the editor, so it always matches the report as written. The main sections are:') + ul(['1 Title page', '2 Synopsis', '5–6 Ethics, investigators and administrative structure', '7–9 Introduction, objectives and investigational plan', '10 Study participants', '11 Efficacy evaluation', '12 Safety evaluation', '13 Discussion and overall conclusions', '14–16 Tables, references and appendices']),
    '4': table(['Abbreviation', 'Definition'], [
      ['AE', 'Adverse event'], ['ATC', 'Anatomical Therapeutic Chemical classification'], ['CI', 'Confidence interval'], ['CRF', 'Case report form'],
      ['CSR', 'Clinical study report'], ['ICH', 'International Council for Harmonisation'], ['IRB / IEC', 'Institutional review board / independent ethics committee'],
      ['ITT', 'Intention to treat: all randomised participants, analysed as randomised'], ['MedDRA', 'Medical Dictionary for Regulatory Activities'],
      ['PT / SOC', 'Preferred term / system organ class (MedDRA)'], ['SAE', 'Serious adverse event'], ['SD', 'Standard deviation'],
      ['TEAE', 'Treatment-emergent adverse event: an AE starting on or after the first dose'],
    ]),
    '5': p('The protocol, its amendments, the informed consent form and recruitment material were reviewed and approved by the responsible boards before any participant was enrolled (sections 5.1 to 5.3).'),
    '5.1': p('Each site\'s board approved the protocol and the consent documents before enrolment at that site:') + table(['Site', 'Board'], n.sites.map((x) => [`${x.id} — ${x.name}`, x.irb])) + p('The list of boards is also in Appendix 16.1.3.'),
    '5.2': p('The study was conducted in accordance with the ethical principles of the Declaration of Helsinki, ICH E6(R3) Good Clinical Practice, and 21 CFR Parts 50, 56 and 312. The sponsor\'s monitoring confirmed that each site followed the approved protocol (synthetic statement).'),
    '5.3': p('Written informed consent was obtained from each participant before any study procedure, using the board-approved consent form. Participants were told that they could withdraw at any time without giving a reason and without effect on their care.'),
    '6': p('The study was conducted at the following sites (all fictional):') + table(['Site', 'Principal investigator'], n.sites.map((x) => [`${x.id} — ${x.name}`, x.pi]))
      + table(['Function', 'Responsible'], [['Sponsor medical officer', 'Medical Director, Lumen Bioscience (fictional demo role)'], ['Clinical operations and monitoring', 'Northlake Clinical Services (fictional CRO)'], ['Central laboratory', 'Cascade Central Laboratory (fictional)'], ['Biostatistics', 'Biostatistics lead, Concept2Cure demo team (fictional)'], ['Medical writing', 'Medical writing, Concept2Cure demo team (fictional)']]),
    '7': p(`${n.productDescription}.`) + p(`This report describes ${info.protocolNumber}, ${n.design} in ${n.population}. ${info.indication} is the target of the programme; this study was designed to ${n.objectives.primary[0].replace(/^To /, '').replace(/\.$/, '')}.`),
    '8': p('Primary objective:') + ul(n.objectives.primary) + p('Secondary objectives:') + ul(n.objectives.secondary) + p('Exploratory objectives:') + ul(n.objectives.exploratory),
    '9': p('The investigational plan is described in sections 9.1 to 9.8.'),
    '9.1': p(`${n.design[0].toUpperCase()}${n.design.slice(1)}, with ${n.durationText}.`) + table(['Arm', 'Planned participants', 'Treatment'], s.arms.map((a) => [a.armName, String(a.randomized), (s.source.studyData.exposure ?? []).find((e) => e.armId === a.armId)?.meanDailyDose ?? '—'])),
    '9.2': p(`A ${control.armName.toLowerCase()} arm was used so that adverse events and outcomes could be attributed to the investigational product rather than to the course of the condition, the study procedures or expectation. Blinding (section 9.4.6) protects the comparison.`),
    '9.3': p(`The study enrolled ${n.population}.`),
    '9.3.1': p('Participants were eligible if they met all of the following:') + ul(n.inclusion),
    '9.3.2': p('Participants were not eligible if any of the following applied:') + ul(n.exclusion),
    '9.3.3': p('A participant could withdraw consent at any time. The investigator stopped study treatment for an adverse event that made continuation unsafe, for pregnancy, or for a significant protocol deviation. Participants who stopped treatment were asked to complete the follow-up visits. Reasons for not completing are given in section 10.1.'),
    '9.4': p('Treatments are described in sections 9.4.1 to 9.4.8.'),
    '9.4.1': table(['Arm', 'Treatment'], s.arms.map((a) => [a.armName, (s.source.studyData.exposure ?? []).find((e) => e.armId === a.armId)?.meanDailyDose ?? '—'])) + p(`Active: ${n.dosing.active}. Control: ${n.dosing.control}.`),
    '9.4.2': p(`${n.productDescription}. Placebo matched the active product in appearance. One synthetic batch of each was used (Appendix 16.1.6).`),
    '9.4.3': p(n.randomisation),
    '9.4.4': p('The dose and regimen are illustrative for this demonstration; in a report for filing this section gives the nonclinical and earlier clinical basis for the doses chosen.'),
    '9.4.5': p(`Doses were taken as described in section 9.4.1 for ${n.durationText}. Missed doses were not replaced.`),
    '9.4.6': p(n.blinding) + p('The blind was not broken for any participant before database lock (synthetic statement).'),
    '9.4.7': p('Medicines needed for participants\' care were allowed, except those listed as prohibited in the protocol. Concomitant medications recorded during the study:') + conmedTable(s),
    '9.4.8': p('Treatment compliance was assessed by the sites at each visit. Individual compliance records are not part of the synthetic source; exposure by arm is in section 12.1.'),
    '9.5': p('Efficacy and safety variables are described in sections 9.5.1 to 9.5.4.'),
    '9.5.1': table(['Assessment', 'Screening', 'Treatment period', 'End of treatment', 'Follow-up'], [
      ['Informed consent, eligibility', 'X', '', '', ''], ['Demography, medical history', 'X', '', '', ''],
      ['Vital signs', 'X', 'X', 'X', 'X'], ['Clinical laboratory tests', 'X', 'X', 'X', ''],
      ['Adverse events', '', 'X', 'X', 'X'], ['Concomitant medications', 'X', 'X', 'X', 'X'], [`${info.primaryEndpoint}`, '', 'X', 'X', 'X'],
    ]),
    '9.5.2': p('The efficacy and safety measurements are standard for studies of this kind and are recorded with validated methods at the sites and the central laboratory. Adverse events were coded with MedDRA and medications with the WHO Drug ATC classification.'),
    '9.5.3': p(`Primary endpoint: ${info.primaryEndpoint}.`) + ((info.secondaryEndpoints ?? []).length ? p(`Secondary or exploratory: ${(info.secondaryEndpoints ?? []).join('; ')}.`) : ''),
    '9.5.4': p('Drug concentrations were not measured in this study, so there is no pharmacokinetic analysis.'),
    '9.6': p('Sites were monitored against the protocol and source documents by the CRO, with risk-based monitoring of key indicators. Laboratory tests were run by the central laboratory. Data were entered in an electronic data capture system with edit checks, and the database was locked after all queries were resolved (synthetic statement).'),
    '9.7': p('The statistical methods are described in sections 9.7.1 and 9.7.2.'),
    '9.7.1': p(n.efficacyAnalysis) + p('Analysis populations: ITT (all randomised participants, analysed as randomised) for efficacy; safety (all participants who received at least one dose, analysed as treated) for safety. Safety data are summarised descriptively; no adjustment for multiplicity was made for secondary endpoints. The formulas are in Appendix 16.1.9.'),
    '9.7.2': p(sampleSizeText(study, s)),
    '9.8': p('There were no changes to the conduct of the study or to the planned analyses after the first participant was enrolled (synthetic statement).'),
    '10': p('Participant disposition and protocol deviations are described in sections 10.1 and 10.2.'),
    '10.1': p(`${s.total} participants were randomised and all received study treatment. ${s.arms.map((a) => `${pct(a.populations.completed, a.randomized)} on ${a.armName} completed the study`).join('; ')}.`) + dispositionTable(s) + p('Participants who did not complete are listed in Appendix 16.2.1.'),
    '10.2': p('The study\'s source records no protocol deviations, so none are reported here. In a report for filing, important deviations are summarised by category and listed in Appendix 16.2.2.'),
    '11': p('The efficacy evaluation is described in sections 11.1 to 11.4.'),
    '11.1': table(armHead(s, 'Population'), [
      ['Randomised', ...s.arms.map((a) => String(a.randomized))], ['ITT', ...s.arms.map((a) => String(a.populations.itt))],
      ['Safety', ...s.arms.map((a) => String(a.populations.safety))], ['Completed', ...s.arms.map((a) => String(a.populations.completed))],
    ]),
    '11.2': p('Baseline characteristics by arm:') + demographicsTable(s),
    '11.3': p('Individual compliance records are not part of the synthetic source. The mean duration of exposure by arm is given in section 12.1.'),
    '11.4': p('Efficacy results are given in sections 11.4.1 to 11.4.7.'),
    '11.4.1': p(primarySentences(study, s).join(' ')) + efficacyTable(s) + p(lowerBetter ? 'A lower proportion is better for this endpoint.' : 'Results are presented as recorded in the source.'),
    '11.4.2': p('Statistical and analytical issues are described in sections 11.4.2.1 to 11.4.2.8.'),
    '11.4.2.1': p('The primary analysis was not adjusted for covariates.'),
    '11.4.2.2': p(missingDataText(study, s)),
    '11.4.2.3': p('No interim analysis of efficacy was performed. Safety was reviewed by the study team throughout.'),
    '11.4.2.4': p(`The study was conducted at ${plural(n.sites.length, 'site')}. With ${s.total} participants, results were not analysed by site.`),
    '11.4.2.5': p('There was one primary endpoint, tested once; secondary and exploratory endpoints were not adjusted for multiplicity and are interpreted descriptively.'),
    '11.4.2.6': p('No efficacy subset was used; the efficacy analysis used the ITT population.'),
    '11.4.2.7': p('Not applicable: the study compared the investigational product with placebo, not with an active control.'),
    '11.4.2.8': p(`No subgroup analyses were performed: with ${s.total} participants, subgroups would be too small to be informative.`),
    '11.4.3': p('Individual efficacy responses are recorded in the study\'s analysis datasets; the frozen source carries results by arm, which are tabulated in section 11.4.1.'),
    '11.4.4': p(doseResponseText(study, s)),
    '11.4.5': p('Drug–drug and drug–disease interactions were not studied.'),
    '11.4.6': p('By-participant displays are in Appendix 16.2.'),
    '11.4.7': p(conclusion(study, s)),
    '12': p('The safety evaluation is described in sections 12.1 to 12.6, in the safety population.'),
    '12.1': exposureTable(s),
    '12.2': p('Adverse events are summarised in sections 12.2.1 to 12.2.4.'),
    '12.2.1': p(safetySentences(s).join(' ')) + aeOverviewTable(s),
    '12.2.2': aeSocPtTable(s),
    '12.2.3': p(aeAnalysisText(s)),
    '12.2.4': aeListing(s),
    '12.3': p('Deaths, serious adverse events and other significant adverse events are described in sections 12.3.1 to 12.3.3.'),
    '12.3.1': p('Listings follow in sections 12.3.1.1 to 12.3.1.3.'),
    '12.3.1.1': p(s.aes.some((x) => x.outcome === 'fatal') ? 'Deaths:' : 'No deaths occurred during the study.') + (s.aes.some((x) => x.outcome === 'fatal') ? aeListing(s, (x) => x.outcome === 'fatal') : ''),
    '12.3.1.2': p(s.aes.some((x) => x.serious) ? 'Serious adverse events:' : 'No serious adverse events were recorded.') + (s.aes.some((x) => x.serious) ? aeListing(s, (x) => x.serious) : ''),
    '12.3.1.3': p(s.aes.some((x) => x.ledToDiscontinuation) ? 'Adverse events that led to discontinuation of study treatment:' : 'No adverse event led to discontinuation of study treatment.') + (s.aes.some((x) => x.ledToDiscontinuation) ? aeListing(s, (x) => x.ledToDiscontinuation) : ''),
    '12.3.2': narratives(s),
    '12.3.3': p(significantDiscussion(s)),
    '12.4': p('Clinical laboratory results are described in sections 12.4.1 and 12.4.2.'),
    '12.4.1': p('Individual laboratory values are not part of the synthetic source; it records shifts from baseline by arm and parameter, which are tabulated in section 12.4.2.'),
    '12.4.2': p('Each parameter is evaluated in sections 12.4.2.1 to 12.4.2.3.'),
    '12.4.2.1': p('Shifts from a normal baseline value to a value above or below the reference range at any time on treatment:') + labShiftTable(s),
    '12.4.2.2': p(labChangeText(s)),
    '12.4.2.3': p('No laboratory abnormality was recorded as an adverse event or judged clinically significant by an investigator (synthetic statement).'),
    '12.5': p('Vital signs at baseline and at the last assessment on treatment:') + vitalsTable(s) + p('No physical examination finding was recorded as an adverse event (synthetic statement).'),
    '12.6': p(`${safetySentences(s).join(' ')} ${safetyConclusion(s)}`),
    '13': p(`${conclusion(study, s)} ${safetyConclusion(s)}`) + p('These are synthetic results invented for the demonstration and support no clinical conclusion.'),
    '14': p('The tables referred to in the text are presented in the sections indicated below, so that the report is read in one place.'),
    '14.1': p('Demographic data (as section 11.2):') + demographicsTable(s),
    '14.2': p('Efficacy data (as section 11.4.1):') + efficacyTable(s),
    '14.3': p('Safety data are presented in sections 14.3.1 to 14.3.4.'),
    '14.3.1': p('Adverse events by system organ class and preferred term (as section 12.2.2):') + aeSocPtTable(s),
    '14.3.2': p('Deaths, serious and other significant adverse events: see sections 12.3.1.1 to 12.3.1.3.'),
    '14.3.3': p('Narratives: see section 12.3.2.'),
    '14.3.4': p('Laboratory shifts (as section 12.4.2.1):') + labShiftTable(s),
    '15': ul(['ICH E3: Structure and content of clinical study reports.', 'ICH E6(R3): Good clinical practice.', 'ICH E9: Statistical principles for clinical trials, and E9(R1): Estimands and sensitivity analysis.', 'World Medical Association. Declaration of Helsinki.', '21 CFR Parts 50, 56 and 312.', 'MedDRA and WHO Drug dictionaries.']),
    '16': p('Appendices are listed in sections 16.1 to 16.4.'),
    '16.1': p('Study information is given in Appendices 16.1.1 to 16.1.12.'),
    '16.1.1': p(`The protocol for ${info.protocolNumber} and any amendments are filed in the project's Vault and open in the protocol workspace. There were no amendments after the first participant was enrolled.`),
    '16.1.2': notInSource('Sample case report form pages'),
    '16.1.3': table(['Site', 'Board'], n.sites.map((x) => [`${x.id} — ${x.name}`, x.irb])) + p('The consent form approved by each board is filed in the project\'s Vault.'),
    '16.1.4': table(['Site', 'Principal investigator', 'Role'], n.sites.map((x) => [x.name, x.pi, 'Principal investigator'])),
    '16.1.5': p('This report is signed electronically in the editor. Each signature records the signer, the meaning of the signature, the reason and the time, and covers the text as frozen.'),
    '16.1.6': table(['Arm', 'Batch'], s.arms.map((a) => [a.armName, `SYNTH-${info.protocolNumber.split('-').slice(-2).join('')}-${a.armId}`])),
    '16.1.7': p('Treatment assigned to each randomised participant:') + table(['Participant', 'Arm'], s.source.participants.map((x) => [x.subjectId, s.armOf(x.armId)?.armName ?? x.armId])),
    '16.1.8': p('No audit certificates are attached to this synthetic report.'),
    '16.1.9': p('Difference in proportions: p1 − p2, with a Wald 95% confidence interval, (p1 − p2) ± 1.96 × √(p1(1 − p1)/n1 + p2(1 − p2)/n2). Fisher\'s exact test: the two-sided p-value sums the probabilities of every 2×2 table with the observed margins that is no more likely than the observed table. Continuous variables: mean, standard deviation (n − 1 denominator), median, minimum and maximum. Percentages use the arm\'s number of participants in the population analysed. Power of the difference in two proportions (section 9.7.2): Φ((|pa − pb| − 1.96 × √(2p̄(1 − p̄)/n)) / √((pa(1 − pa) + pb(1 − pb))/n)), with p̄ the mean of pa and pb and n per arm.'),
    '16.1.10': p('All protocol laboratory tests were run by one central laboratory, so no inter-laboratory standardisation was needed.'),
    '16.1.11': p('There are no publications based on this study.'),
    '16.1.12': p('See section 15.'),
    '16.2': p('Participant data listings are given in Appendices 16.2.1 to 16.2.8.'),
    '16.2.1': (() => { const rows = s.arms.flatMap((a) => a.discontinued.map((d) => [d.subjectId, a.armName, d.status, d.reason ?? 'not recorded'])); return rows.length ? table(['Participant', 'Arm', 'Status', 'Reason'], rows) : p('Every randomised participant completed the study.'); })(),
    '16.2.2': p('The source records no protocol deviations.'),
    '16.2.3': p(exclusionText(study, s)),
    '16.2.4': table(['Participant', 'Arm', 'Age', 'Sex', ...(s.source.studyData.demographics.some((d) => d.race) ? ['Race'] : []), ...(s.source.studyData.demographics.some((d) => d.bmi) ? ['BMI'] : [])],
      s.source.studyData.demographics.map((d) => [d.subjectId, s.armOf(d.armId)?.armName ?? d.armId, String(d.age), d.sex, ...(d.race !== undefined ? [d.race] : s.source.studyData.demographics.some((x) => x.race) ? ['—'] : []), ...(d.bmi !== undefined ? [r1(d.bmi)] : s.source.studyData.demographics.some((x) => x.bmi) ? ['—'] : [])])),
    '16.2.5': notInSource('Individual compliance records and drug concentration data'),
    '16.2.6': p('Individual efficacy responses are held in the analysis datasets; the frozen source records the results by arm (section 11.4.1).'),
    '16.2.7': aeListing(s),
    '16.2.8': notInSource('Individual laboratory measurements'),
    '16.3': p('Case report forms are described in Appendices 16.3.1 and 16.3.2.'),
    '16.3.1': notInSource('Case report forms for deaths, serious adverse events and withdrawals for adverse events'),
    '16.3.2': notInSource('Other case report forms'),
    '16.4': p('In a submission the individual participant data are provided as SDTM and ADaM datasets with define.xml in eCTD Module 5 (5.3.5.1). This synthetic study\'s source is the JSON file filed in the project\'s Vault and frozen into this report.'),
  };
}

function sampleSizeText(study, s) {
  const n = narrativeOf(study);
  if (n.sampleSizeText) return n.sampleSizeText;
  if (n.assumedRates) {
    const { active, control, alpha } = n.assumedRates;
    const perArm = Math.min(...s.arms.map((a) => a.randomized));
    const power = twoProportionPower(active, control, perArm, alpha);
    return `Assuming ${r1(100 * control)}% of placebo participants and ${r1(100 * active)}% of LMN-301 participants would have the primary endpoint, ${perArm} participants per arm give ${r1(100 * power)}% power for a two-sided test at the ${alpha} level (normal approximation to the difference in two proportions; formula in Appendix 16.1.9). The assumptions are illustrative.`;
  }
  return 'The sample size was chosen for the demonstration, not by a power calculation.';
}

function missingDataText(study, s) {
  if (study.efficacy?.kind === 'teae-primary') {
    const ex = s.source.studyData.efficacy.filter((e) => e.endpointType === 'exploratory');
    const missing = s.arms.map((a) => a.randomized - Number((ex.find((e) => e.armId === a.armId)?.display.match(/n=(\d+)/) ?? [])[1] ?? a.randomized));
    return `The primary endpoint (adverse events) is complete for the safety population. The exploratory change in body weight is summarised for participants with a Day 28 weight; ${missing.reduce((x, y) => x + y, 0)} without one ${missing.reduce((x, y) => x + y, 0) === 1 ? 'is' : 'are'} not imputed.`;
  }
  return 'Every randomised participant has a recorded result for the primary endpoint in the source; no imputation was needed.';
}

function doseResponseText(study, s) {
  if (study.efficacy?.kind !== 'teae-primary') return 'One dose of the investigational product was studied, so dose–response was not evaluated.';
  const ex = s.source.studyData.efficacy.filter((e) => e.endpointType === 'exploratory' && e.armId);
  return `Two doses were studied. The exploratory change in body weight by arm: ${ex.map((e) => `${s.armOf(e.armId)?.armName}: ${e.display}`).join('; ')}. The study was not designed to test a dose–response relationship.`;
}

function exclusionText(study, s) {
  if (study.efficacy?.kind === 'teae-primary') {
    const ids = s.source.studyData.disposition.filter((d) => d.status !== 'completed').map((d) => d.subjectId);
    return ids.length ? `No participant was excluded from the safety analysis. Without a Day 28 weight, ${ids.join(', ')} ${ids.length === 1 ? 'is' : 'are'} not in the exploratory body-weight summary.` : 'No participant was excluded from any analysis.';
  }
  return 'No randomised participant was excluded from the ITT analysis.';
}

function aeAnalysisText(s) {
  const sev = ['mild', 'moderate', 'severe'].map((v) => `${s.aes.filter((x) => x.severity === v).length} ${v}`).join(', ');
  const related = s.arms.map((a) => `${s.aeByArm(a.armId, (x) => x.related === 'related').length} of ${s.aeByArm(a.armId).length} on ${a.armName}`).join('; ');
  return `By severity, ${s.aes.length} adverse events were ${sev}. Events judged related to study treatment: ${related}. Most events resolved without treatment.`;
}

function narratives(s) {
  const events = s.aes.filter((x) => x.serious || x.ledToDiscontinuation || x.outcome === 'fatal');
  if (!events.length) return p('No death, serious adverse event or adverse event leading to discontinuation occurred, so no narrative is required.');
  return events.map((x) => {
    const d = s.source.studyData.demographics.find((y) => y.subjectId === x.subjectId);
    return p(`${x.subjectId} (${s.armOf(x.armId)?.armName}; ${d ? `${d.age}-year-old ${d.sex === 'F' ? 'female' : 'male'}` : 'demographics not recorded'}): ${x.pt} (${x.soc}), ${x.severity}, ${x.serious ? 'serious' : 'not serious'}, ${x.related} to study treatment by the investigator. ${x.ledToDiscontinuation ? 'Study treatment was stopped. ' : ''}Outcome: ${x.outcome ?? 'not recorded'}.`);
  }).join('');
}

function significantDiscussion(s) {
  const serious = s.aes.filter((x) => x.serious).length;
  const disc = s.aes.filter((x) => x.ledToDiscontinuation).length;
  if (!serious && !disc) return 'No death, serious adverse event or adverse event leading to discontinuation occurred.';
  return `${plural(serious, 'serious adverse event')} and ${plural(disc, 'adverse event')} leading to discontinuation were recorded (narratives in section 12.3.2). Their pattern across arms does not, in this small synthetic study, indicate a specific risk.`;
}

function labChangeText(s) {
  const labs = s.source.studyData.labShifts ?? [];
  const high = labs.filter((l) => l.shiftToHigh > 0).map((l) => `${l.parameter} on ${s.armOf(l.armId)?.armName} (${l.shiftToHigh} of ${l.shiftFromNormal})`);
  return high.length ? `Shifts from normal to high: ${high.join('; ')}. No shift to low was recorded.` : 'No participant shifted from a normal baseline to an abnormal value.';
}

function conclusion(study, s) {
  const info = s.source.studyInfo;
  const diff = s.source.studyData.efficacy.find((e) => e.endpointName === info.primaryEndpoint && !e.armId && e.ci);
  if (study.efficacy?.kind === 'teae-primary') {
    return `LMN-801 was given for 28 days at two dose levels. ${primarySentences(study, s).join(' ')} Adverse events were mostly mild and gastrointestinal, more frequent at the higher dose, consistent with the intended appetite-reducing action.`;
  }
  if (diff) {
    const favours = diff.ci.upper < 0 ? 'the investigational product (the interval excludes no difference)' : diff.ci.lower > 0 ? 'the comparator' : 'neither arm conclusively (the interval includes no difference)';
    return `${primarySentences(study, s).join(' ')} The result favours ${favours}.`;
  }
  return `${primarySentences(study, s).join(' ')} With ${s.total} participants the study was not powered for a confirmatory test; the result is descriptive.`;
}

function safetyConclusion(s) {
  const serious = s.aes.filter((x) => x.serious).length;
  return serious ? 'Serious adverse events are described in section 12.3.' : 'No new safety concern was identified in this synthetic study.';
}

/**
 * The HTML of each section, by the template's section code. A code this table does not know gets a sentence that
 * names its heading and says it holds nothing for this study, never an empty section.
 */
export function csrSectionContent(study, source) {
  const s = csrStats(source);
  const byCode = sectionsFor(study, s);
  return (code, title) => byCode[code] ?? p(`${title}: nothing in this synthetic study is reported under this heading.`);
}
