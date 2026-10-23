import React from 'react';
import { Button } from '@/components/ui/button';

export interface MdxCatalogFeature {
  id: string;
  label: string;
  description: string;
  access: React.ReactNode;
  locked?: boolean;
}

/** One project-first solution; feature access remains individually governed. */
export function MdxCatalogSolution({
  features,
  onOpenProjects,
  expanded = false,
}: {
  features: MdxCatalogFeature[];
  onOpenProjects: () => void;
  expanded?: boolean;
}) {
  if (features.length === 0) return null;
  return (
    <section className="sec" aria-label="MDX solutions" data-testid="mdx-catalog-solution">
      <div className="sec-hdr">
        <div className="sec-title">MDX solutions</div>
        <div className="sec-sub">Medical devices and diagnostics · project workflows</div>
      </div>
      <div className="launch">
        <div className="launch-title">Medical devices and diagnostics</div>
        <div className="launch-desc">
          Start with a project. Regulatory strategy, design, risk, evidence, authoring,
          submission and post-market work share that project’s context.
        </div>
        <div className="launch-foot">
          <Button onClick={onOpenProjects}>Open projects</Button>
        </div>
        <details style={{ marginTop: 16 }} open={expanded}>
          <summary style={{ cursor: 'pointer' }}>Feature access ({features.length})</summary>
          <ul style={{ padding: 0, margin: '12px 0 0', listStyle: 'none' }}>
            {features.map((feature) => (
              <li
                key={feature.id}
                data-feature-id={feature.id}
                data-locked={feature.locked || undefined}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--border)' }}
              >
                <div style={{ flex: '1 1 240px' }}>
                  <div className="launch-title">{feature.label}</div>
                  <div className="launch-desc">{feature.description}</div>
                </div>
                <div className="launch-foot" style={{ gap: 8 }}>{feature.access}</div>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
