/**
 * Checklist Bot Agent (Shadow Review)
 *
 * Rules-based hard-gate checks that tend to map to common FDA information requests.
 * This is NOT legal advice; it is an engineering checklist.
 */

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ChecklistFinding = {
  severity: Severity;
  rule: string;
  message: string;
  section?: string;
  fix_url?: string;
};

export type ChecklistResult = {
  score: number; // 0..100
  findings: ChecklistFinding[];
  status: 'PASS' | 'AT_RISK' | 'FAIL';
};

function severityRank(s: Severity): number {
  return s === 'CRITICAL' ? 0 : s === 'HIGH' ? 1 : s === 'MEDIUM' ? 2 : 3;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export const ChecklistBot = {
  async validate(dossierContext: any): Promise<ChecklistResult> {
    const ctx = dossierContext || {};
    const findings: ChecklistFinding[] = [];

    // Cybersecurity: software devices (SBOM)
    if (ctx.isSoftware === true && ctx.hasSBOM !== true) {
      findings.push({
        severity: 'CRITICAL',
        rule: 'FDA Guidance: Cybersecurity in Medical Devices (2023)',
        message: 'Missing Software Bill of Materials (SBOM). This commonly triggers immediate information requests; treat as a hard gate for v1.',
        section: 'Cybersecurity',
        fix_url: 'https://www.fda.gov/medical-devices/digital-health-center-excellence/cybersecurity',
      });
    }

    // Biocompatibility: permanent contact
    if (String(ctx.contactDuration || '').toLowerCase() === 'permanent' && ctx.iso10993Report !== true) {
      findings.push({
        severity: 'HIGH',
        rule: 'ISO 10993-1:2018 (Biological Evaluation)',
        message: 'Permanent contact devices generally require robust biocompatibility evidence; missing ISO 10993 support is a common deficiency theme.',
        section: 'Biocompatibility',
        fix_url:
          'https://www.fda.gov/medical-devices/recently-published-documents/use-international-standard-iso-10993-1-biological-evaluation-medical-devices-part-1-evaluation',
      });
    }

    // AI/ML change control
    if (ctx.hasAIML === true && ctx.hasPCCP !== true) {
      findings.push({
        severity: 'CRITICAL',
        rule: 'FDA Guidance: Marketing Submission for Device Software Functions',
        message: 'AI/ML component detected without a Predetermined Change Control Plan (PCCP) / change management plan. Expect direct FDA questions.',
        section: 'Software / AI-ML',
        fix_url:
          'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/marketing-submission-recommendations-device-software-functions',
      });
    }

    // Predicate age heuristic
    if (ctx.predicateClearanceDate) {
      const clearanceTs = new Date(ctx.predicateClearanceDate).getTime();
      if (Number.isFinite(clearanceTs)) {
        const ageYears = (Date.now() - clearanceTs) / (365 * 24 * 60 * 60 * 1000);
        if (ageYears < 1) {
          findings.push({
            severity: 'MEDIUM',
            rule: '510(k) substantial equivalence heuristics',
            message: 'Predicate cleared < 1 year ago. FDA may ask for longer-term performance rationale and stronger equivalence justification.',
            section: 'Substantial Equivalence',
            fix_url: 'https://www.fda.gov/medical-devices/premarket-submissions/selecting-and-using-predicate-devices-510k',
          });
        }
      }
    }

    // Clinical power/sample size heuristic
    if (typeof ctx.clinicalSampleSize === 'number' && ctx.clinicalSampleSize > 0 && ctx.clinicalSampleSize < 30) {
      findings.push({
        severity: 'HIGH',
        rule: 'Clinical evidence/statistical justification expectations',
        message: 'Clinical sample size < 30. Provide power analysis and justification (or strengthen non-clinical performance evidence).',
        section: 'Clinical Evidence',
        fix_url: 'https://www.fda.gov/science-research/clinical-trials-and-human-subject-protection',
      });
    }

    findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

    // Scoring: penalize by severity (simple and transparent)
    const penalty = findings.reduce((sum, f) => {
      if (f.severity === 'CRITICAL') return sum + 25;
      if (f.severity === 'HIGH') return sum + 15;
      if (f.severity === 'MEDIUM') return sum + 8;
      return sum + 3;
    }, 0);

    const score = clamp(100 - penalty, 0, 100);
    const status: ChecklistResult['status'] = score >= 90 ? 'PASS' : score >= 70 ? 'AT_RISK' : 'FAIL';

    return { score, findings, status };
  },
};
