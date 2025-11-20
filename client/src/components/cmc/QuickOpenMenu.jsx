import React from 'react';
import { openDeepLink } from '@/lib/deeplink';

export default function QuickOpenMenu({ focusId, sectionId, className = '' }) {
  const params = { source: 'manufacturing', focus: focusId, section: sectionId };

  const items = [
    { label: 'Open in Analytical', tab: 'analytical' },
    { label: 'Open in Stability', tab: 'stability' },
    { label: 'Open in Regulatory', tab: 'regulatory' },
    { label: 'Open in Supply Chain', tab: 'supply-chain' },
    { label: 'Open in Risk', tab: 'risk' },
  ];

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map(i => (
        <button
          key={i.tab}
          className="rounded-md border px-2 py-1 text-xs"
          onClick={() => openDeepLink(i.tab, params)}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}