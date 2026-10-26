/** Recorded section tracking, reached through the existing project dossier. */
import React from 'react';
import { normalizeCtdCode } from '@shared/regulatory/section-code';
import { preferredTrackingStatusOf, trackingModuleStats, trackingStatusRank,
  trackingSectionLabel, trackingModuleLabel, trackingSectionPlacement,
  type DossierSectionTracking, type TrackedSection, type TrackingModule, type UnmappedTrackedSection,
} from '@shared/types/dossier-section-tracking';
import type { DossierState } from './ProjectDossier';

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const status = (v: unknown): v is string | null => v === null || text(v);
const STATS = ['counted', 'complete', 'unknownCount', 'pct', 'tone'] as const;
const UNMAPPED_REASONS = new Map([
  ['INVALID_SECTION_CODE', 'Section code needs review.'],
  ['INVALID_MODULE', 'Module needs review.'],
  ['MODULE_MISMATCH', 'Module and section code do not match.'],
]);

function hasTrackedSection(v: unknown): v is TrackedSection {
  if (!object(v) || !text(v.code) || !normalizeCtdCode(v.code)) return false;
  if (!text(v.title) || v.label !== trackingSectionLabel(v.code, v.title) || !status(v.status)) return false;
  if (!Array.isArray(v.observedStatuses) || v.observedStatuses.length === 0 || !v.observedStatuses.every(status)) return false;
  return preferredTrackingStatusOf(v.observedStatuses) === v.status;
}

function hasTrackingModule(v: unknown): v is TrackingModule {
  if (!object(v) || !text(v.m) || trackingModuleLabel(v.m) === null || v.label !== trackingModuleLabel(v.m)) return false;
  if (!Array.isArray(v.sections) || v.sections.length === 0 || !v.sections.every(hasTrackedSection)) return false;
  const sections = v.sections;
  if (new Set(sections.map(s => s.code)).size !== sections.length) return false;
  if (!sections.every(s => trackingSectionPlacement(s.code, `M${v.m}`).m === v.m)) return false;
  const expected = trackingModuleStats(sections);
  return STATS.every(key => v[key] === expected[key]);
}

function hasUnmappedSection(v: unknown): v is UnmappedTrackedSection {
  if (!object(v) || !text(v.code) || !text(v.title) || v.label !== trackingSectionLabel(v.code, v.title)) return false;
  if (!status(v.status) || !status(v.module) || !text(v.reason) || !UNMAPPED_REASONS.has(v.reason)) return false;
  const placement = trackingSectionPlacement(v.code, v.module);
  return placement.m === null && placement.reason === v.reason;
}

function hasMeasuredTracking(v: Record<string, unknown>): boolean {
  if (!Array.isArray(v.modules) || !Array.isArray(v.unmapped)) return false;
  if (!v.modules.every(hasTrackingModule) || !v.unmapped.every(hasUnmappedSection)) return false;
  if (new Set(v.modules.map(m => m.m)).size !== v.modules.length) return false;
  const hasRows = v.modules.length > 0 || v.unmapped.length > 0;
  return v.state === 'measured' ? hasRows : !hasRows;
}

/** Withhold missing or contradictory facts in both the screen and AnA context. */
export function sectionTrackingOf(value: unknown): DossierSectionTracking | null {
  if (!object(value) || value.basis !== 'section_tracking') return null;
  if (value.state === 'unavailable' || value.state === 'unanchored') {
    return text(value.reason) && value.reason.trim() !== '' && value.modules === null && value.unmapped === null
      ? value as unknown as DossierSectionTracking : null;
  }
  if (value.state !== 'measured' && value.state !== 'no_sections') return null;
  return hasMeasuredTracking(value) ? value as unknown as DossierSectionTracking : null;
}

function stateWords(value: string | null): string {
  if (value === null) return 'Status not recorded';
  if (trackingStatusRank(value) === null) return `${value} (not assessed)`;
  const words = value.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function TrackingModuleDetails({ module }: { module: TrackingModule }) {
  return <div className="pj-tracking-module">
    <h3>Module {module.m} · {module.label}</h3>
    <p className="pj-card-note">{module.complete} of {module.counted} tracked sections complete · {module.pct === null ? 'Completion not assessed' : `${module.pct}%`}</p>
    {module.unknownCount > 0 && <p className="pj-card-note">{module.unknownCount} section{module.unknownCount === 1 ? ' has' : 's have'} an unknown or missing recorded state.</p>}
    <details className="pj-lmod-sections">
      <summary>Tracked sections ({module.counted})</summary>
      <ul aria-label={`Module ${module.m} tracked sections`}>
        {module.sections.map(section => <li key={section.code}>
          <span>{section.label}<small className="pj-tracking-code">Recorded code: {section.code}</small>
            {section.observedStatuses.length > 1 && <small className="pj-tracking-code">Recorded states: {section.observedStatuses.map(s => s ?? 'not recorded').join(', ')}</small>}
          </span><span>{stateWords(section.status)}</span>
        </li>)}
      </ul>
    </details>
  </div>;
}

function TrackingRecords({ tracking }: { tracking: Extract<DossierSectionTracking, { modules: TrackingModule[] }> }) {
  return <>
    {tracking.modules.map(module => <TrackingModuleDetails key={module.m} module={module} />)}
    {tracking.unmapped.length > 0 && <div className="pj-tracking-module">
      <h3>Unmapped tracking records</h3>
      <ul className="pj-tracking-unmapped">
        {tracking.unmapped.map((section, index) => <li key={`${section.module}:${section.code}:${index}`}>
          <span>{section.label || section.code || 'Section code not recorded'}</span>
          <span>{stateWords(section.status)}</span>
          <p className="pj-card-note">{UNMAPPED_REASONS.get(section.reason)} Recorded module: {section.module || 'not recorded'}.</p>
        </li>)}
      </ul>
    </div>}
  </>;
}

export function SectionTracking({ read }: { read: DossierState }) {
  const heading = React.useId();
  const { state, retry } = read;
  const tracking = sectionTrackingOf(state.data?.sectionTracking);
  let body: React.ReactNode;
  if (state.error) {
    body = <div role="alert"><p>Section tracking could not be read.</p><button type="button" className="btn ghost" onClick={retry}>Retry</button></div>;
  } else if (!state.data) {
    body = <p role="status" aria-busy="true">Reading section tracking…</p>;
  } else if (!tracking) {
    body = <p className="pj-card-note">Section tracking is unavailable.</p>;
  } else if (tracking.modules === null) {
    body = <p className="pj-card-note">{tracking.reason}</p>;
  } else if (tracking.state === 'no_sections') {
    body = <p className="pj-card-note">No tracked sections yet.</p>;
  } else {
    body = <TrackingRecords tracking={tracking} />;
  }
  return <section className="pj-sec" aria-labelledby={heading}>
    <div className="pj-sec-h"><h2 id={heading}>Section tracking</h2></div>
    <p className="pj-card-note">Recorded section tracking counts approved, signed or locked sections as complete. These tracking figures are separate from document completion and artifact status; they do not establish filing readiness.</p>
    {body}
  </section>;
}
