/**
 * ProjectsListFilters — saved-views row + search + 5 multi-select
 * filter pills. Mirror of design-system/ui_kits/home/ProjectsExtras.jsx
 * (lines 423–496).
 */
import { useEffect, useRef, useState } from 'react';
import { I } from './icons';
import {
  PLF_TYPES, PLF_STATUSES, PLF_AGENCIES, PLF_OWNERS, PLF_ACTIVITY,
  PLF_SAVED_VIEWS,
} from './data';
import type { ProjectsFilters, SavedView, FilterKey } from './types';

interface Props {
  filters: ProjectsFilters;
  onChange: (next: ProjectsFilters) => void;
  savedView: string | null;
  onSavedView: (v: SavedView) => void;
  query: string;
  onQuery: (q: string) => void;
  customViews?: SavedView[];
  onSaveView?: (name: string, filters: ProjectsFilters) => void;
}

export function ProjectsListFilters({
  filters, onChange, savedView, onSavedView, query, onQuery,
  customViews = [], onSaveView,
}: Props) {
  const set = (k: FilterKey, v: string[]) => onChange({ ...filters, [k]: v });
  const toggle = (k: FilterKey, val: string) => {
    const arr = filters[k] || [];
    set(k, arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };
  const totalChips = (Object.values(filters) as string[][])
    .reduce((n, arr) => n + (arr ? arr.length : 0), 0);

  return (
    <div className="plf">
      <div className="plf-row plf-row-views">
        <span className="plf-views-lbl">Saved views</span>
        <div className="plf-views">
          {[...PLF_SAVED_VIEWS, ...customViews].map(v => (
            <button
              type="button"
              key={v.id}
              className={`plf-view ${savedView === v.id ? 'is-on' : ''}`}
              onClick={() => onSavedView(v)}
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            className="plf-view-add"
            title="Save current filters as a view"
            onClick={() => {
              if (!onSaveView) return;
              const name = window.prompt('Save current filters as view — name:');
              if (!name || !name.trim()) return;
              onSaveView(name.trim(), filters);
            }}
            disabled={!onSaveView}
          >
            {I.plus} Save view
          </button>
        </div>
      </div>

      <div className="plf-row">
        <div className="plf-search">
          <span className="plf-search-ico">{I.search}</span>
          <input
            className="plf-search-input"
            placeholder="Search by project, sponsor, or product…"
            value={query}
            onChange={e => onQuery(e.target.value)}
          />
        </div>
        <FilterPill label="Type"     options={[...PLF_TYPES]}    selected={filters.type}     onToggle={v => toggle('type', v)} />
        <FilterPill label="Status"   options={[...PLF_STATUSES]} selected={filters.status}   onToggle={v => toggle('status', v)} />
        <FilterPill label="Agency"   options={[...PLF_AGENCIES]} selected={filters.agency}   onToggle={v => toggle('agency', v)} />
        <FilterPill label="Owner"    options={[...PLF_OWNERS]}   selected={filters.owner}    onToggle={v => toggle('owner', v)} />
        <FilterPill label="Activity" options={[...PLF_ACTIVITY]} selected={filters.activity} onToggle={v => toggle('activity', v)} />
        {totalChips > 0 && (
          <button
            type="button"
            className="plf-clear"
            onClick={() => onChange({ type: [], status: [], agency: [], owner: [], activity: [] })}
          >
            Clear all ({totalChips})
          </button>
        )}
      </div>
    </div>
  );
}

interface PillProps {
  label: string;
  options: string[];
  selected?: string[];
  onToggle: (v: string) => void;
}

function FilterPill({ label, options, selected = [], onToggle }: PillProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="plf-pill-wrap" ref={ref}>
      <button
        type="button"
        className={`plf-pill ${selected.length ? 'has-selected' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        {selected.length > 0 && <span className="plf-pill-c">{selected.length}</span>}
        <span className="plf-pill-chev">{I.down}</span>
      </button>
      {open && (
        <div className="plf-menu">
          {options.map(o => {
            const on = selected.includes(o);
            return (
              <button
                type="button"
                key={o}
                className={`plf-menu-row ${on ? 'is-on' : ''}`}
                onClick={() => onToggle(o)}
              >
                <span className="plf-menu-check">{on ? I.check : null}</span>
                <span>{o}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
