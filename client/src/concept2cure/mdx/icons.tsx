/**
 * Lucide-derived icon set ported verbatim from
 * design-system/ui_kits/mdx/Icons.jsx (1.75 stroke, 16px default).
 *
 * Class-name and prop contract matches the kit exactly so the CSS in app.css
 * (which targets `.ico`, `[stroke="currentColor"]`, etc.) renders identically.
 *
 * Per design-system non-negotiable: Lucide icons only. Do not add inline
 * shapes that are not Lucide-equivalent.
 */

import * as React from 'react';

interface IconProps {
  d: string | React.ReactNode;
  size?: number;
}

export function Icon({ d, size = 16 }: IconProps) {
  return (
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
}

export const I = {
  // Nav items (the 10)
  stethoscope: <Icon d={<><path d="M4.8 2.3A.3.3 0 0 1 5.1 2h1.8a.3.3 0 0 1 .3.3v4.4a3 3 0 0 1-6 0V2.3z"/><path d="M8 15v1a5 5 0 0 0 10 0V8"/><circle cx="20" cy="10" r="2"/></>} />,
  atom:        <Icon d={<><circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4.5"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(120 12 12)"/></>} />,
  folder:      <Icon d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  vault:       <Icon d={<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M12 17v-1.5M8.5 12H7M17 12h-1.5"/></>} />,
  checkCircle: <Icon d={<><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>} />,
  send:        <Icon d={<><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></>} />,
  microscope:  <Icon d={<><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/></>} />,
  barChart:    <Icon d={<><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><path d="M3 20h18"/></>} />,
  sparkles:    <Icon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/></>} />,
  beaker:      <Icon d={<><path d="M9 2v6L3.5 18.5A2 2 0 0 0 5.3 21.5h13.4a2 2 0 0 0 1.8-3L15 8V2"/><path d="M8 2h8"/><path d="M7 14h10"/></>} />,
  sigma:       <Icon d={<><path d="M18 4H6l6 8-6 8h12"/></>} />,
  shieldCheck: <Icon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>} />,
  brain:       <Icon d={<><path d="M9.5 2a3 3 0 0 0-3 3v1A3 3 0 0 0 4 9v1a3 3 0 0 0 .6 5A3 3 0 0 0 9 20a3 3 0 0 0 3-3V5a3 3 0 0 0-2.5-3z"/><path d="M14.5 2a3 3 0 0 1 3 3v1A3 3 0 0 1 20 9v1a3 3 0 0 1-.6 5A3 3 0 0 1 15 20a3 3 0 0 1-3-3"/></>} />,
  scroll:      <Icon d={<><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M15 8h4M15 12h4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2V5a2 2 0 0 1 2-2"/></>} />,
  settings:    <Icon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></>} />,

  // Chrome
  search:      <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>} />,
  panelLeft:   <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>} />,
  panelRight:  <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></>} />,
  plus:        <Icon d="M12 5v14M5 12h14" />,
  bell:        <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>} />,
  help:        <Icon d={<><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>} />,
  down:        <Icon d="M6 9l6 6 6-6" />,
  right:       <Icon d="M9 6l6 6-6 6" />,
  arrowRight:  <Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>} />,
  arrowUp:     <Icon d={<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>} />,
  attach:      <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  tools:       <Icon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />,
  dots:        <Icon d={<><circle cx="12" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>} />,
  close:       <Icon d="M18 6 6 18M6 6l12 12" />,
  sliders:     <Icon d={<><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></>} />,

  // Suggestion + recents
  file:        <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>} />,
  flask:       <Icon d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0M5.5 16h13" />,
  globe:       <Icon d={<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>} />,
  clip:        <Icon d={<><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></>} />,
  chat:        <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  pencil:      <Icon d={<><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></>} />,

  // Dashboard metric decor
  clock:       <Icon d={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>} />,
  trendingUp:  <Icon d={<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>} />,
  alertCircle: <Icon d={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>} />,

  // MDX-specific additions
  grid:        <Icon d={<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>} />,
  scale:       <Icon d={<><path d="M16 16.5a4 4 0 0 1 8 0"/><path d="M0 16.5a4 4 0 0 1 8 0"/><path d="M4 16.5 8 6l8-1 4 11.5"/><path d="M12 4v17M8 21h8"/></>} />,
  wrench:      <Icon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />,
  tag:         <Icon d={<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.83z"/><circle cx="7" cy="7" r="1.2"/></>} />,
  arrowLeft:   <Icon d={<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>} />,
  filter:      <Icon d="M22 3H2l8 9.46V19l4 2v-8.54z" />,
  download:    <Icon d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>} />,
  play:        <Icon d="m6 3 14 9-14 9z" />,
  circle:      <Icon d={<circle cx="12" cy="12" r="10"/>} />,
  check:       <Icon d="M20 6 9 17l-5-5" />,
  x:           <Icon d="M18 6 6 18M6 6l12 12" />,
  eq:          <Icon d="M5 9h14M5 15h14" />,
  minus:       <Icon d="M5 12h14" />,
  chevronRight:<Icon d="M9 6l6 6-6 6" />,
  zap:         <Icon d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  users:       <Icon d={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>} />,
  calendar:    <Icon d={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />,

  // Additional surface icons
  shield:        <Icon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>} />,
  key:           <Icon d={<><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></>} />,
  trendingDown:  <Icon d={<><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></>} />,
  pin:           <Icon d={<><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></>} />,
  link:          <Icon d={<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>} />,
  upload:        <Icon d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>} />,

  // Workbench + intelligence tiers
  clipboardList: <Icon d={<><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6M9 8h.01"/></>} />,
  rocket:        <Icon d={<><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>} />,
  shieldAlert:   <Icon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>} />,
  template:      <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></>} />,
  barChart3:     <Icon d={<><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></>} />,
  database:      <Icon d={<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></>} />,
  userCheck:     <Icon d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></>} />,
  messageSquare: <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  eye:           <Icon d={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>} />,
} as const;

export type IconKey = keyof typeof I;
