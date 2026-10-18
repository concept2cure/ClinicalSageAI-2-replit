import React, { useState } from 'react';
import { useLiveData } from '../dataConnect';

interface GuidanceRow {
  id?: string; guidance_text?: string; guidance_note?: string;
  regulatory_references?: string[]; compliance_checklist?: string[]; common_pitfalls?: string[];
  source_reference?: string;
  template_source?: { limitations?: string[]; kind?: string };
}
interface Guidance { template_guidance: GuidanceRow[] }

const textList = (value: unknown): boolean => value === undefined || (Array.isArray(value) && value.every(s => typeof s === 'string'));
function validRow(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (row.guidance_text !== undefined && typeof row.guidance_text !== 'string') return false;
  if (![row.regulatory_references, row.compliance_checklist, row.common_pitfalls].every(textList)) return false;
  if (row.template_source === undefined) return true;
  if (!row.template_source || typeof row.template_source !== 'object') return false;
  return textList((row.template_source as Record<string, unknown>).limitations);
}
function validGuidance(value: unknown): value is Guidance {
  return !!value && typeof value === 'object' && 'template_guidance' in value && Array.isArray(value.template_guidance) && value.template_guidance.every(validRow);
}

/** The same disclosure pattern as imported-source limits; reference text never enters the editor body. */
export function TemplateGuidance({ sectionId }: { sectionId: string }) {
  const [epoch, setEpoch] = useState(0);
  const guide = useLiveData<Guidance>(`/api/authoring/guidance/${encodeURIComponent(sectionId)}`, [sectionId, epoch], validGuidance);
  const rows = Array.isArray(guide.data?.template_guidance) ? guide.data.template_guidance : [];
  return <details className="ed-provline ed-source-notice" data-testid="template-guidance">
    <summary>Template guidance and source requirements</summary>
    <div className="ed-source-detail">
      <p>Reference guidance for the saved section. Confirm current requirements and applicability; it is separate from authored evidence.</p>
      {guide.loading && <p role="status">Loading template guidance…</p>}
      {guide.error && <><p role="alert">Template guidance could not be read. {guide.error}</p><button type="button" className="btn ghost" onClick={() => setEpoch(v => v + 1)}>Retry guidance</button></>}
      {!guide.loading && !guide.error && rows.length === 0 && <p>No template guidance is recorded for this section.</p>}
      {!guide.error && rows.map((row, index) => <div key={row.id ?? index}>
        {row.template_source?.limitations && <ul>{row.template_source.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul>}
        {row.guidance_text && <p>{row.guidance_text}</p>}
        {row.compliance_checklist?.length ? <><strong>Source and completion checks</strong><ul>{row.compliance_checklist.map((check, i) => <li key={i}>{check}</li>)}</ul></> : null}
        {row.common_pitfalls?.length ? <><strong>Review points</strong><ul>{row.common_pitfalls.map((pitfall, i) => <li key={i}>{pitfall}</li>)}</ul></> : null}
        {row.regulatory_references?.length ? <p>Reference basis: {row.regulatory_references.join('; ')}</p> : null}
      </div>)}
    </div>
  </details>;
}
