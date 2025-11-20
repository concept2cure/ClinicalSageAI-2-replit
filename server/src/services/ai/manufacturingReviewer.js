import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

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
  const ppq = snapshot.validation?.ppq || { completedRuns: 0, targetRuns: 3 };
  const matrix = snapshot.process?.cppCqaMatrix || [];
  const equipment = snapshot.equipment || []; // [{id, critical, calibrationDue, pq:true/false}, ...]
  const ebrIssues = snapshot.ebr?.incompleteSteps || 0;
  const stability = snapshot.stability || { longTermMonths: 0, claimMonths: 0 };

  // PV-101
  if ((ppq.completedRuns ?? 0) < (ppq.targetRuns ?? 0)) {
    pushRule(findings, 'PV-101', {
      evidence: [`PPQ completed ${ppq.completedRuns ?? 0} / target ${ppq.targetRuns ?? 0}`],
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
  if ((stability.longTermMonths ?? 0) < (stability.claimMonths ?? 0)) {
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
  // Draft a sober, regulator-credible response stub
  return [
    `We acknowledge the Agency's comment regarding ${deficiency.section}.`,
    `Rationale & Data: We performed an impact assessment and identified the following gaps related to "${deficiency.comment}".`,
    `Actions & Commitments: We will ${deficiency.comment.replace(/^.*Provide:\s*/,'')}.`,
    `Timing: We anticipate completing corrective actions within 60–90 days and will update Module 3 accordingly.`,
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