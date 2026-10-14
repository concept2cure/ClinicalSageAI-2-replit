import React from 'react';
import type { OnboardingDiscoveryAssessment } from '@shared/types/onboarding-discovery';

export function DiscoveryNextSteps({ assessment, onNav }: { assessment: OnboardingDiscoveryAssessment; onNav: (id: string) => void }) {
  return (
    <div className="ob-discovery-summary">
      <div className="pj-seclbl">Next steps for your workspace</div>
      <p className="scaf-note">Guidance is based on your discovery answers. Each destination checks your access and supported scope. Saving discovery does not create a project or configure security controls.</p>
      {assessment.recommendations.map((recommendation) => <div className="ob-rev-row" key={recommendation.id}>
        <div><b>{recommendation.title}</b><p className="scaf-note">{recommendation.description}</p></div>
        <button type="button" className="sp-ask" aria-label={`Open: ${recommendation.title}`} onClick={() => onNav(recommendation.surface)}>Open</button>
      </div>)}
    </div>
  );
}
