import React, { useState } from 'react';
import { parseDiscovery, type OnboardingDiscovery } from '@shared/types/onboarding-discovery';
import { getOrgId } from '@/utils/authToken';
import { useLiveData } from '../dataConnect';

/** Human-selected handoff to the canonical project intake, never a project writer. */
export function DiscoveryProjectPrefill({ onApply }: { onApply: (project: OnboardingDiscovery['project']) => void }) {
  const orgId = getOrgId();
  const read = useLiveData<{ settings?: { onboardingDiscovery?: unknown } }>(
    orgId ? `/api/organizations/${encodeURIComponent(String(orgId))}/settings` : null,
  );
  const saved = parseDiscovery(read.data?.settings?.onboardingDiscovery);
  const [applied, setApplied] = useState(false);
  if (read.error) return <p className="scaf-note">Saved onboarding context could not be read. You can still enter project details below.</p>;
  if (!saved || ![saved.project.name, saved.project.indication, saved.project.targetDate].some(Boolean)) return null;
  return <div className="npw-seg-note">
    <div>
      <div className="npw-seg-t">Your planned first project</div>
      <p className="npw-seg-s">{saved.project.name || 'From your discovery answers'}{saved.project.goals ? ` — ${saved.project.goals}` : ''}</p>
      <p className="npw-seg-s">Copy the stated name, intended use, product class and milestone into this form, then review them. Choose the filing type yourself.</p>
      <button type="button" className="sp-ask" onClick={() => { onApply(saved.project); setApplied(true); }}>Use planned project details</button>
      <div role="status">{applied ? 'Details copied. Review them before creating the project.' : ''}</div>
    </div>
  </div>;
}
