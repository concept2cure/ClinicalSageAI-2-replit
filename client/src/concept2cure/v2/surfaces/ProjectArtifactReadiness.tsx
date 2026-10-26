/** The existing artifact rollup, reached from Author with the project's dossier read. */
import React from 'react';
import { artifactSectionStateOf, artifactReadinessSummaryOf, type ArtifactReadiness, type ArtifactSectionReadiness } from '@shared/types/dossier-artifact-readiness';
import type { DossierState } from './ProjectDossier';

const STATUS_LABELS = new Map([
  ['draft', 'Draft'], ['review', 'In review'], ['approved', 'Approved'],
  ['locked', 'Locked'], ['not_assessed', 'Not assessed'],
]);
const COUNTS = ['artifactCount', 'draftCount', 'reviewCount', 'approvedCount', 'lockedCount', 'unknownCount'] as const;
const SUMMARY = ['totalSections', 'readySections', 'inProgressSections', 'draftSections', 'notAssessedSections'] as const;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function hasSectionIdentity(section: Record<string, unknown>): boolean {
  return typeof section.ctdSection === 'string' && section.ctdSection.trim() !== '' &&
    typeof section.status === 'string' && STATUS_LABELS.has(section.status);
}

function hasArtifactSection(value: unknown): value is ArtifactSectionReadiness {
  if (!object(value) || !hasSectionIdentity(value) || !COUNTS.every(key => count(value[key])) || value.artifactCount === 0) return false;
  const section = value as unknown as ArtifactSectionReadiness;
  const hasDate = section.lastUpdated === null || (typeof section.lastUpdated === 'string' && Number.isFinite(new Date(section.lastUpdated).getTime()));
  const total = section.draftCount + section.reviewCount + section.approvedCount + section.lockedCount + section.unknownCount;
  return hasDate && total === section.artifactCount && artifactSectionStateOf(section) === section.status;
}

function hasMeasuredArtifactRead(value: Record<string, unknown>): boolean {
  const { sections, summary } = value;
  if (!Array.isArray(sections) || !object(summary) || !SUMMARY.every(key => count(summary[key]))) return false;
  if (value.state === 'no_artifacts' ? sections.length !== 0 : sections.length === 0) return false;
  if (!sections.every(hasArtifactSection)) return false;
  if (new Set(sections.map(s => s.ctdSection)).size !== sections.length) return false;
  const expected = artifactReadinessSummaryOf(sections);
  return SUMMARY.every(key => summary[key] === expected[key]);
}

/** An older or malformed answer cannot become a measured empty artifact source. */
export function artifactReadinessOf(value: unknown): ArtifactReadiness | null {
  if (!object(value) || value.basis !== 'governed_artifacts') return null;
  if (value.state === 'unavailable' || value.state === 'unanchored') {
    return typeof value.reason === 'string' && value.reason.trim() !== '' && value.sections === null && value.summary === null
      ? value as unknown as ArtifactReadiness : null;
  }
  if (value.state !== 'measured' && value.state !== 'no_artifacts') return null;
  return hasMeasuredArtifactRead(value) ? value as unknown as ArtifactReadiness : null;
}

export function ArtifactSectionStatus({ read }: { read: DossierState }) {
  const heading = React.useId();
  const { state, retry } = read;
  const artifacts = artifactReadinessOf(state.data?.artifactReadiness);
  let body: React.ReactNode;
  if (state.error) {
    body = <div role="alert"><p>Artifact section status could not be read.</p><button type="button" className="btn ghost" onClick={retry}>Retry</button></div>;
  } else if (!state.data) {
    body = <p role="status" aria-busy="true">Reading artifact section status…</p>;
  } else if (!artifacts) {
    body = <p className="pj-card-note">Artifact section status is unavailable.</p>;
  } else if (artifacts.sections === null) {
    body = <p className="pj-card-note">{artifacts.reason}</p>;
  } else if (artifacts.state === 'no_artifacts') {
    body = <p className="pj-card-note">No sectioned artifacts yet. Artifacts with a recorded CTD section appear here.</p>;
  } else {
    const { summary, sections } = artifacts;
    body = <>
      <p className="pj-card-note">{summary.totalSections} section{summary.totalSections === 1 ? '' : 's'} · {summary.readySections} approved or locked · {summary.inProgressSections} in review · {summary.draftSections} draft · {summary.notAssessedSections} not assessed</p>
      <div className="pj-artifact-table">
        <table className="reg-tbl">
          <caption className="pj-card-note">Artifact counts by CTD section</caption>
          <thead><tr><th scope="col">CTD section</th><th scope="col">Artifacts</th><th scope="col">Draft / Review / Approved / Locked / Unknown</th><th scope="col">Updated</th><th scope="col">Weakest state</th></tr></thead>
          <tbody>{sections.map(section => <tr key={section.ctdSection}>
            <td>{section.ctdSection}</td><td>{section.artifactCount}</td>
            <td>{section.draftCount} / {section.reviewCount} / {section.approvedCount} / {section.lockedCount} / {section.unknownCount}</td>
            <td>{section.lastUpdated ? <time dateTime={section.lastUpdated}>{new Date(section.lastUpdated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time> : 'Update time not recorded.'}</td>
            <td>{STATUS_LABELS.get(section.status)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>;
  }
  return <section className="pj-sec" aria-labelledby={heading}>
    <div className="pj-sec-h"><h2 id={heading}>Artifact section status</h2></div>
    <p className="pj-card-note">Each section shows its weakest recorded artifact state. Unknown states remain not assessed. These artifact states are separate from document-section completion and do not establish filing readiness.</p>
    {body}
  </section>;
}
