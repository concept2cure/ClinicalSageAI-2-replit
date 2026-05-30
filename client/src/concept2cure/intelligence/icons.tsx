/**
 * Intelligence cluster — Lucide-derived icon set (Phase 11).
 * Ported verbatim from ui_kits/intelligence/surfaces.jsx. Lucide only.
 *
 * @module client/src/concept2cure/intelligence/icons
 */

import * as React from 'react';

const Icon = ({ d, size = 14 }: { d: React.ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);

export const I = {
  microscope: <Icon d={<><path d="M6 18h8" /><path d="M3 22h18" /><path d="M14 22a7 7 0 1 0 0-14h-1" /><path d="M9 14h2" /><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2z" /><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" /></>} />,
  beaker:     <Icon d={<><path d="M4.5 3h15" /><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" /><path d="M6 14h12" /></>} />,
  sigma:      <Icon d={<><polyline points="18 7 18 4 6 4 12 12 6 20 18 20 18 17" /></>} />,
  barChart3:  <Icon d={<><line x1="3" y1="20" x2="21" y2="20" /><rect x="5" y="12" width="3" height="8" /><rect x="10.5" y="8" width="3" height="12" /><rect x="16" y="4" width="3" height="16" /></>} />,
  search:     <Icon d={<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>} />,
  bell:       <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>} />,
  help:       <Icon d={<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>} />,
  sparkle:    <Icon d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />,
  right:      <Icon d={<><polyline points="9 6 15 12 9 18" /></>} />,
  plus:       <Icon d={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} />,
  more:       <Icon d={<><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>} />,
  external:   <Icon d={<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>} />,
  clock:      <Icon d={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>} />,
  flag:       <Icon d={<><line x1="4" y1="22" x2="4" y2="15" /><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /></>} />,
  layers:     <Icon d={<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>} />,
  trending:   <Icon d={<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>} />,
  arrowUp:    <Icon d={<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>} />,
  arrowRight: <Icon d={<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>} />,
  arrowLeft:  <Icon d={<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>} />,
  filter:     <Icon d={<><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></>} />,
} as const;

export type IntIconKey = keyof typeof I;
