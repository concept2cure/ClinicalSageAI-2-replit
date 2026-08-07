/**
 * Pure verdict function for the pre-submission gate. Lives outside the
 * route file so it can be unit-tested without dragging in DB or service
 * dependencies. The route imports this and applies it to assembled
 * readiness + CMC + CRL/RTF + ICH inputs.
 */

export type GateVerdict = 'ready' | 'conditional' | 'hold';

export interface GateVerdictInput {
  readinessStatus: string;
  readinessScore: number;
  readinessBlockers: Array<{ severity: string }>;
  crlRisk: string;
  rtfRisk: string;
  cmcOpenCritical: number;
  /**
   * `'incomplete'` means the ICH check COULD NOT RUN — not that it passed.
   *
   * It was added when the Module 3 stability reads were fixed: those queries
   * targeted columns the provisioned table does not have, failed every time,
   * and were swallowed into `[]`, so the checker reported "no stability
   * studies recorded" with an evidence string it had never obtained. The
   * checker now says `incomplete` instead of inventing a clean result, and
   * this gate has to honour that distinction or the fabrication just moves
   * one level up.
   */
  ichStatus?: 'compliant' | 'warnings' | 'non_compliant' | 'incomplete';
  ichFailCount: number;
}

export interface GateVerdictResult {
  verdict: GateVerdict;
  rationale: string[];
}

export function deriveVerdict(input: GateVerdictInput): GateVerdictResult {
  const rationale: string[] = [];
  let verdict: GateVerdict = 'ready';

  const hasCriticalReadiness = input.readinessBlockers.some(b => b.severity === 'critical');
  if (hasCriticalReadiness) {
    verdict = 'hold';
    rationale.push('Readiness has critical blockers');
  }

  if (input.cmcOpenCritical > 0) {
    verdict = 'hold';
    rationale.push(`${input.cmcOpenCritical} open critical CMC contradiction(s)`);
  }

  if (input.crlRisk === 'critical' || input.rtfRisk === 'critical') {
    verdict = 'hold';
    if (input.crlRisk === 'critical') rationale.push('CRL risk is critical');
    if (input.rtfRisk === 'critical') rationale.push('RTF risk is critical');
  }

  if (input.ichStatus === 'non_compliant') {
    verdict = 'hold';
    rationale.push(`ICH compliance non-compliant (${input.ichFailCount} failing finding(s))`);
  }

  if (verdict !== 'hold') {
    // An ICH check that could not evaluate must never read as one that passed.
    // `conditional` is the honest floor: not a hold, because nothing has been
    // shown to be wrong — but not `ready`, because nothing has been shown to
    // be right either.
    const moderateRisk = input.crlRisk === 'high' || input.rtfRisk === 'high'
      || input.readinessScore < 70 || input.readinessStatus === 'needs_attention'
      || input.ichStatus === 'warnings' || input.ichStatus === 'incomplete';
    if (moderateRisk) {
      verdict = 'conditional';
      if (input.crlRisk === 'high') rationale.push('CRL risk is high');
      if (input.rtfRisk === 'high') rationale.push('RTF risk is high');
      if (input.readinessScore < 70) rationale.push(`Readiness score is ${input.readinessScore} (<70)`);
      if (input.ichStatus === 'warnings') rationale.push('ICH compliance has warnings');
      if (input.ichStatus === 'incomplete') {
        rationale.push('ICH compliance could not be evaluated — treat as unverified, not as passing');
      }
    }
  }

  if (verdict === 'ready') {
    rationale.push('Readiness on track, no critical blockers, CRL/RTF risk acceptable, ICH compliance clean');
  }

  return { verdict, rationale };
}
