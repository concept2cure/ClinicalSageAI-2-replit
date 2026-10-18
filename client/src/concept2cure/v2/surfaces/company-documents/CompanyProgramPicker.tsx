import React, { useState } from 'react';
import { useCompanyResource } from './useCompanyResource';

interface ProjectPage { data: Array<{ id: string; title: string; code: string }>; meta: { hasMore: boolean } }
function projectsOf(value: unknown): ProjectPage | null {
  const page = value as ProjectPage | null;
  return page && Array.isArray(page.data) && page.data.every(row => typeof row.id === 'string' && typeof row.title === 'string') && typeof page.meta?.hasMore === 'boolean' ? page : null;
}
export function CompanyProgramPicker({ value, onChange, disabled }: { value: string | null; onChange: (id: string | null) => void; disabled: boolean }) {
  const [offset, setOffset] = useState(0);
  const resource = useCompanyResource(`/api/c2c/projects?limit=25&offset=${offset}`, projectsOf);
  return <div className="company-wide">
    <label className="company-field"><span>Design project scope</span><select value={value ?? ''} disabled={disabled || resource.loading || Boolean(resource.error)} onChange={event => onChange(event.target.value || null)}>
      <option value="">Any admitted project</option>
      {value && !resource.data?.data.some(project => project.id === value) && <option value={value}>Selected project {value}</option>}
      {resource.data?.data.map(project => <option key={project.id} value={project.id}>{project.title} · {project.code}</option>)}
    </select></label>
    {resource.loading && <p role="status">Reading accessible project choices…</p>}
    {resource.error && <p className="company-error" role="alert">{resource.error} <button type="button" className="btn ghost small" onClick={resource.reload}>Retry project choices</button></p>}
    {resource.data && <div className="company-pagination"><button type="button" className="btn ghost small" disabled={disabled || offset === 0} onClick={() => setOffset(previous => Math.max(0, previous - 25))}>Previous project choices</button><span>Project choices page {offset / 25 + 1}</span><button type="button" className="btn ghost small" disabled={disabled || !resource.data.meta.hasMore} onClick={() => setOffset(previous => previous + 25)}>More project choices</button></div>}
  </div>;
}
