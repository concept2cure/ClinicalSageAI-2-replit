export function deriveInsights(issues: any[], stages: any[], dosageForm: string) {
  const insights = [];

  const hasShelfLifeError = issues.some(i => i.ruleId === 'P8-003' && i.severity === 'ERROR');
  if (hasShelfLifeError) {
    insights.push({
      id: 'i1',
      text: 'Shelf-life claim likely fails review due to insufficient long-term data.',
      why: 'Rule P8-003',
      action: 'Lower claim or add Q1E projection + commitment.',
      ownerSuggestion: 'Reg CMC',
    });
  }

  const needsMicro = issues.some(i => i.ruleId === 'P5-007');
  if (needsMicro && dosageForm && !/sterile/i.test(dosageForm)) {
    insights.push({
      id: 'i2',
      text: 'Spec table lacks microbial quality row for non-sterile dosage form.',
      why: 'Rule P5-007',
      action: 'Insert TAMC/TYMC + specified organisms with USP <61>/<62>.',
      ownerSuggestion: 'QA Micro',
    });
  }

  const mv = stages.find(s => /Method Validation/i.test(s.name));
  if (mv && mv.progress < 90) {
    insights.push({
      id: 'i3',
      text: 'Method validation sign-off is lagging and may block spec approval.',
      why: 'Stage gate under 90% progress.',
      action: 'Prioritize validation summary approvals and link methods to spec rows.',
      ownerSuggestion: 'Analytical Lead',
    });
  }

  return insights;
}
