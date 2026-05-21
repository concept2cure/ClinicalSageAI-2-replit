/**
 * PDEV Lucide subset — mirrors design-system/ui_kits/pdev/Icons.jsx.
 * Shapes are 1:1 with the kit so per-pixel cadence matches.
 */

import * as React from 'react';

const Icon: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 16,
}) => (
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
    {children}
  </svg>
);

export const PdevIcons = {
  // Nav
  grid: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  ),
  beaker: (
    <Icon>
      <path d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0M5.5 16h13" />
    </Icon>
  ),
  microscope: (
    <Icon>
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </Icon>
  ),
  stethoscope: (
    <Icon>
      <path d="M4.8 2.3A.3.3 0 0 1 5.1 2h1.8a.3.3 0 0 1 .3.3v4.4a3 3 0 0 1-6 0V2.3z" />
      <path d="M8 15v1a5 5 0 0 0 10 0V8" />
      <circle cx="20" cy="10" r="2" />
    </Icon>
  ),
  shieldCheck: (
    <Icon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  ),
  rocket: (
    <Icon>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    </Icon>
  ),
  alertCircle: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </Icon>
  ),
  chat: (
    <Icon>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  ),
  // Chrome
  search: (
    <Icon>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  ),
  panelLeft: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </Icon>
  ),
  panelRight: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </Icon>
  ),
  bell: (
    <Icon>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </Icon>
  ),
  help: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  ),
  filter: (
    <Icon>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />
    </Icon>
  ),
  down: (
    <Icon>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  ),
  arrowRight: (
    <Icon>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Icon>
  ),
  arrowUp: (
    <Icon>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </Icon>
  ),
  arrowLeft: (
    <Icon>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </Icon>
  ),
  close: (
    <Icon>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  ),
  check: (
    <Icon>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  ),
  sparkles: (
    <Icon>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
    </Icon>
  ),
  link: (
    <Icon>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07L11.7 5.69" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.74-1.74" />
    </Icon>
  ),
  zap: (
    <Icon>
      <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
    </Icon>
  ),
} as const;

export type PdevIconKey = keyof typeof PdevIcons;

export function PdevIcon({ name }: { name: PdevIconKey | string }) {
  const icon = (PdevIcons as Record<string, React.ReactNode>)[name];
  return <>{icon ?? null}</>;
}
