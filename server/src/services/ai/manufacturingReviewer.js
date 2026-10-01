import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optional future LLM call (kept off by default)
async function callLLM(_prompt, _input) {
  // Wire OpenAI or your LLM here later; return [] for now.
  return [];
}

const RULES_PATH = path.join(__dirname, 'rules', 'manufacturingRules.yaml');
let RULES = [];
try {
  if (yaml && fs.existsSync(RULES_PATH)) {
    RULES = yaml.load(fs.readFileSync(RULES_PATH, 'utf8')) || [];
  }
} catch (e) {
  console.warn('[manufacturingReviewer] rules load error:', e.message);
}

function isPast(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return Number.isFinite(+d) && d.getTime() < Date.now();
}

function pushRule(findings, ruleId, { evidence = [], confidence = 0.78 } = {}) {
  const rule = RULES.find(r => r.id === ruleId);
  if (!rule) return;
  findings.push({
    ruleId,
    title: rule.title,
    severity: rule.severity || 'medium',
    confidence,
    rationale: rule.rationale || '',
    evidence,
    actions: rule.actions || [],
    relatedTabs: rule.relatedTabs || [],
    module3Sections: rule.module3Sections || []
  });
}

function runDeterministicChecks(snapshot = {}) {
  const findings = [];
  // A rule runs only on a section the snapshot carries. PPQ used to default to
  // { completedRuns: 0, targetRuns: 3 }, so a snapshot with no validation data
  // was reported as "PPQ completed 0 / target 3" — a finding about runs nobody
  // planned. Stability's 0/0 default never fired; it is made explicit too.
  const ppq = snapshot.validation?.ppq;
  const matrix = snapshot.process?.cppCqaMatrix || [];
  const equipment = snapshot.equipment || []; // [{id, critical, calibrationDue, pq:true/false}, ...]
  const ebrIssues = snapshot.ebr?.incompleteSteps || 0;
  const stability = snapshot.stability;

  // PV-101
  if (ppq && typeof ppq.completedRuns === 'number' && typeof ppq.targetRuns === 'number' && ppq.completedRuns < ppq.targetRuns) {
    pushRule(findings, 'PV-101', {
      evidence: [`PPQ completed ${ppq.completedRuns} / target ${ppq.targetRuns}`],
      confidence: 0.88
    });
  }

  // Q8-210
  const missingRelations = Array.isArray(matrix) ? matrix.filter(m => !m.relation || m.relation === 'unknown').length : 0;
  if (missingRelations > 0) {
    pushRule(findings, 'Q8-210', {
      evidence: [`Missing/unknown CPP↔CQA relations: ${missingRelations}`],
      confidence: 0.85
    });
  }

  // STAB-330
  if (stability && typeof stability.longTermMonths === 'number' && typeof stability.claimMonths === 'number' && stability.longTermMonths < stability.claimMonths) {
    pushRule(findings, 'STAB-330', {
      evidence: [`Long-term data: ${stability.longTermMonths}m < claim: ${stability.claimMonths}m`],
      confidence: 0.86
    });
  }

  // EBR-140
  if ((ebrIssues ?? 0) > 0) {
    pushRule(findings, 'EBR-140', {
      evidence: [`EBR steps lacking Part 11 e-signatures: ${ebrIssues}`],
      confidence: 0.83
    });
  }

  // EQP-075
  const overdueEqp = equipment.filter(e => e.critical && (isPast(e.calibrationDue) || e.pq === false));
  if (overdueEqp.length > 0) {
    pushRule(findings, 'EQP-075', {
      evidence: overdueEqp.slice(0, 5).map(e => `Eqp ${e.id}: calibDue=${e.calibrationDue || 'n/a'} pq=${String(e.pq)}`),
      confidence: 0.86
    });
  }

  // CC-220
  const cc = snapshot.changeControls || [];
  const ccMissing = cc.filter(c => !Array.isArray(c.impacted?.module3Sections) || c.impacted.module3Sections.length === 0);
  if (ccMissing.length > 0) {
    pushRule(findings, 'CC-220', {
      evidence: [`Change controls missing 3.2 impact mapping: ${ccMissing.length}`],
      confidence: 0.80
    });
  }

  return findings;
}

function toDeficiencyLetter(findings = []) {
  // Compose regulator-style comments
  return findings.map(f => ({
    section: (f.module3Sections && f.module3Sections[0]) || '3.2.P.3',
    comment: `${f.ruleId}: ${f.title}. ${f.rationale} Provide: ${f.actions.join('; ')}.`,
    severity: f.severity || 'medium'
  }));
}

function draftApplicantResponse(deficiency) {
  // A response STUB: the bracketed parts are the applicant's to write. It used
  // to state "We performed an impact assessment" and commit to "completing
  // corrective actions within 60–90 days" — work and a timeline nobody had
  // agreed, in a document drafted for a regulator.
  return [
    `We acknowledge the Agency's comment regarding ${deficiency.section}.`,
    `Rationale & Data: [state the assessment performed and its results for "${deficiency.comment}"].`,
    `Actions & Commitments: [state the actions taken or planned to ${deficiency.comment.replace(/^.*Provide:\s*/,'')}].`,
    `Timing: [state the committed completion date and the Module 3 sections to be updated].`,
  ].join('\n');
}

async function reviewManufacturing(snapshot = {}, { useLLM = false } = {}) {
  const det = runDeterministicChecks(snapshot);
  const llm = useLLM ? await callLLM('manufacturing-review', snapshot) : [];
  // TODO: merge/dedupe with priority to deterministic high severity
  return [...det, ...llm];
}

async function simulateDeficiency(snapshot = {}, { useLLM = false } = {}) {
  const findings = await reviewManufacturing(snapshot, { useLLM });
  const letter = toDeficiencyLetter(findings);
  const responses = letter.map(ld => ({ ...ld, draftResponse: draftApplicantResponse(ld) }));
  return { letter, responses };
}

export { reviewManufacturing, simulateDeficiency };