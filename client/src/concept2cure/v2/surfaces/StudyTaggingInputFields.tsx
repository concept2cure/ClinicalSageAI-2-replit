import React from 'react';
import { requiresStfReference, stfFileName } from '@shared/regulatory/ectd-leaf-rules';
import { canonicalRegionOf } from '@shared/regulatory/region-identity';
import { REASON_KIT } from './filingTarget';

export interface StudyTaggingValues { studyId: string; stfFileTag: string }

function studyTaggingProblem(required: boolean, values: StudyTaggingValues): string | null {
  const studyId = values.studyId.trim();
  const tag = values.stfFileTag.trim();
  if (required && (!studyId || !tag)) return 'Study id and STF file-tag are required for a study file in this sequence.';
  if (studyId) {
    try { stfFileName(studyId); }
    catch (error) { return error instanceof Error ? error.message : 'The study id cannot form its Study Tagging File name.'; }
  }
  if (tag.length > 128 || Array.from(values.stfFileTag).some(char => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159))) {
    return 'STF file-tag must be at most 128 characters and contain no control characters.';
  }
  return null;
}

/** Reuse coverage severity and filename policy before any placement or filing copy. */
export function studyTaggingPlacement(section: string, operation: string, region: string | undefined, values: StudyTaggingValues): {
  show: boolean; required: boolean; valid: boolean; problem: string | null;
  payload: { studyId?: string | null; stfFileTag?: string | null };
} {
  const show = operation !== 'delete' && requiresStfReference(section);
  const canonicalRegion = canonicalRegionOf(region);
  const required = show && (canonicalRegion === undefined || canonicalRegion === 'US');
  if (!show) return { show, required, valid: true, problem: null, payload: {} };
  const studyId = values.studyId.trim();
  const stfFileTag = values.stfFileTag.trim();
  const problem = studyTaggingProblem(required, values);
  const payload = !required && !studyId && !stfFileTag ? {} : { studyId: studyId || null, stfFileTag: stfFileTag || null };
  return { show, required, valid: problem === null, problem, payload };
}

/** The existing Builder's controlled input pair, using the existing field kits. */
export function StudyTaggingInputFields({ value, onChange, idPrefix, disabled, required, variant = 'inline' }: {
  value: StudyTaggingValues; onChange: (value: StudyTaggingValues) => void; idPrefix: string;
  disabled?: boolean; required?: boolean; variant?: 'inline' | 'dialog';
}) {
  const kit = REASON_KIT[variant];
  return <>
    <div className={kit.field}><label className={kit.label} htmlFor={`${idPrefix}-id`}>Study id</label>
      <input id={`${idPrefix}-id`} className={kit.input} value={value.studyId} disabled={disabled} aria-required={required || undefined}
        onChange={event => onChange({ ...value, studyId: event.target.value })} /></div>
    <div className={kit.field}><label className={kit.label} htmlFor={`${idPrefix}-tag`}>STF file-tag</label>
      <input id={`${idPrefix}-tag`} className={kit.input} value={value.stfFileTag} maxLength={128} disabled={disabled} aria-required={required || undefined}
        onChange={event => onChange({ ...value, stfFileTag: event.target.value })} /></div>
  </>;
}
