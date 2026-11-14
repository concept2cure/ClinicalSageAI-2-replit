/**
 * ICH Q3D(R2): elemental impurities, judged from the impurity register.
 *
 * Split out of ich-compliance-rules.ts (2026-11-13), as Q1E and Q2 were, when
 * the rule began reading the register: where the project records elemental
 * impurities, the verdict is the impurity engine's (impurity-assessment.ts),
 * the one the register row and the composed §3.2.S.3.2 / §3.2.P.5.5 print.
 * With none recorded it reads the specification and source keys as it did.
 */
import {
  assessRecordedImpurity,
  impurityClassOf,
  type ElementalImpurityAssessed,
  type ImpurityAssessmentRefusal,
} from './impurity-assessment';
import {
  blockedInputs,
  notEvaluatedFinding,
  type IchCheckFinding,
  type ProjectInputs,
} from './ich-compliance-rules';

/**
 * The impurity register's current elemental rows.
 *
 * The register writes each impurity as an `impurity_profile` source object
 * keyed `impurity_profile:<id>` (cmc-write-through.ts), so neither of this
 * rule's keyword searches ("elemental" / "q3d" in a source key or type) ever
 * matched one. A project whose register held a Palladium row assessed against
 * its Q3D permitted daily exposure was told "No elemental-impurities
 * assessment found" by this check, on the same screen. A retired row is
 * superseded and is not read, as in the composed section.
 */
function recordedElementalImpurities(inp: ProjectInputs): Array<Record<string, unknown>> {
  return inp.sourceObjects
    .filter((o) => String(o.sourceType ?? '') === 'impurity_profile')
    .map((o) => (o.sourcePayload && typeof o.sourcePayload === 'object' ? o.sourcePayload : {}) as Record<string, unknown>)
    .filter((p) => String(p.impurityName ?? '').trim() !== '')
    .filter((p) => String(p.status ?? '').toLowerCase() !== 'retired')
    .filter((p) => impurityClassOf(p.impurityType) === 'elemental');
}

function q3dExposureLine(a: ElementalImpurityAssessed): string {
  const derived = a.exposureBasis
    ? ` — this material's contribution, from ${a.observedAsRecorded} and the recorded maximum daily dose`
    : '';
  return `${a.elementName}: ${a.observedMicrogramsPerDay} µg/day against a permitted daily exposure of ` +
    `${a.pdeMicrogramsPerDay} µg/day (${a.route}, ${a.elementClass})${derived}`;
}

/**
 * Q3D from the register: the verdict is the impurity engine's
 * (`assessRecordedImpurity`), the one the register row and the composed
 * §3.2.S.3.2 / §3.2.P.5.5 already print. This rule reports it; it does not
 * judge the rows a second way.
 */
function q3dFromRegister(rows: Array<Record<string, unknown>>, specEvidence: string[]): IchCheckFinding[] {
  const citation = 'ICH Q3D(R2) §3 and Appendix 2 — permitted daily exposures by route of administration.';
  const assessed = rows.map((p) => assessRecordedImpurity(p, 'drug_substance'));
  const compared = assessed.filter((a): a is ElementalImpurityAssessed => a.ok && a.basis === 'ICH Q3D(R2)');
  const above = compared.filter((a) => !a.withinLimit);
  const refused = assessed.filter((a): a is ImpurityAssessmentRefusal => !a.ok);
  const ofAll = `of ${rows.length} recorded elemental ${rows.length === 1 ? 'impurity' : 'impurities'}`;

  const findings: IchCheckFinding[] = [];
  if (above.length > 0) {
    findings.push({
      guideline: 'Q3D(R2)',
      ruleId: 'Q3D_ABOVE_PDE',
      status: 'fail',
      message: `${above.length} ${ofAll} ${above.length === 1 ? 'is' : 'are'} above the ICH Q3D permitted daily exposure.`,
      evidence: above.map(q3dExposureLine),
      citation,
    });
  }
  if (refused.length > 0) {
    findings.push({
      guideline: 'Q3D(R2)',
      ruleId: 'Q3D_NOT_ASSESSABLE',
      status: 'warning',
      message: `${refused.length} ${ofAll} could not be compared with a permitted daily exposure.`,
      evidence: refused.map((r) => `${r.impurityName}: ${r.message}`),
      citation,
    });
  }
  if (findings.length === 0) {
    findings.push({
      guideline: 'Q3D(R2)',
      ruleId: 'Q3D_OK',
      status: 'pass',
      message: rows.length === 1
        ? 'The recorded elemental impurity is within its ICH Q3D permitted daily exposure.'
        : `All ${rows.length} recorded elemental impurities are within their ICH Q3D permitted daily exposures.`,
      evidence: [...compared.map(q3dExposureLine), ...specEvidence],
      citation,
    });
  }
  return findings;
}

export function checkQ3D(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  const elementalSpec = inp.specs.find(s => {
    const txt = JSON.stringify(s.testParameters ?? '').toLowerCase();
    return txt.includes('elemental') || txt.includes('heavy metal');
  });
  const elementalSource = inp.sourceObjects.find(o => {
    const k = String(o.sourceKey ?? '').toLowerCase();
    const t = String(o.sourceType ?? '').toLowerCase();
    return k.includes('elemental') || k.includes('q3d') || t.includes('elemental');
  });

  /* Recorded elemental impurities are judged, not merely noticed: where the
     register holds any, the engine's verdict on them is this rule's answer,
     and a specification that mentions elemental impurities no longer passes
     the rule over a row that is above its limit. With none recorded, the rule
     reads the specification and source keys exactly as before. */
  const recorded = recordedElementalImpurities(inp);
  if (recorded.length > 0) {
    return q3dFromRegister(recorded, elementalSpec ? [`Spec: ${String(elementalSpec.materialName ?? '')}`] : []);
  }

  // Q3D concludes from ABSENCE across two inputs. Finding evidence is sound
  // even if the other input failed, but concluding "no assessment exists"
  // requires that both reads actually happened.
  const blockedQ3D = blockedInputs(inp, ['specs', 'sourceObjects']);
  if (!elementalSpec && !elementalSource && blockedQ3D.length > 0) {
    return [notEvaluatedFinding(
      'Q3D(R2)',
      'Q3D_NOT_EVALUATED',
      blockedQ3D,
      'ICH Q3D(R2) §3 — Risk assessment for Class 1, 2A, 2B, 3 elemental impurities.',
    )];
  }

  if (!elementalSpec && !elementalSource) {
    findings.push({
      guideline: 'Q3D(R2)',
      ruleId: 'Q3D_NO_ASSESSMENT',
      status: 'fail',
      message: 'No elemental-impurities assessment (ICH Q3D / USP <232>/<233>) found in specifications or source objects.',
      evidence: ['No spec test parameter matches "elemental"', 'No source object keyed to Q3D'],
      citation: 'ICH Q3D(R2) §3 — Risk assessment for Class 1, 2A, 2B, 3 elemental impurities.',
    });
  } else {
    findings.push({
      guideline: 'Q3D(R2)',
      ruleId: 'Q3D_OK',
      status: 'pass',
      message: 'Elemental impurities assessment present.',
      evidence: [
        elementalSpec ? `Spec: ${elementalSpec.materialName}` : '',
        elementalSource ? `Source: ${elementalSource.sourceKey}` : '',
      ].filter(Boolean),
      citation: 'ICH Q3D(R2) §3.',
    });
  }

  return findings;
}
