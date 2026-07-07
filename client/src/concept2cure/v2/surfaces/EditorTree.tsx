/**
 * EditorTree -- SectionTree sidebar component.
 *
 * Ported from the design kit's Editor.jsx (SectionTree, lines 22-101).
 * Renders the pathway tree navigation: header, TA selector, search,
 * collapsible volumes, section buttons, and template-add menu.
 */

import React, { useState } from 'react';
import { I } from '../icons';
import { REG_TA_GROUPS } from '../fixtures/editor-ta-templates';
import type { TherapeuticAreaGroup } from '../fixtures/editor-ta-templates';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface SectionItem {
  readonly id: string;
  readonly num: string;
  readonly label: string;
  readonly status: string;
  readonly conf?: number;
  readonly blocker?: boolean;
}

export interface VolumeItem {
  readonly vol: string;
  readonly items: SectionItem[];
}

export interface PathwayData {
  readonly kind: string;
  readonly program: string;
  readonly code: string;
  readonly dueline: string;
  readonly readiness: number;
  readonly tree: VolumeItem[];
  readonly ta: string;
  readonly active: string;
  readonly owner: string;
}

export interface TaItem {
  readonly id: string;
  readonly label: string;
  readonly group: string;
}

export interface TemplateItem {
  readonly id: string;
  readonly num: string;
  readonly label: string;
}

export interface TemplateGroup {
  readonly group: string;
  readonly items: readonly TemplateItem[];
}

export interface SectionTreeProps {
  pathway: PathwayData;
  active: string;
  onNav: (id: string) => void;
  query: string;
  setQuery: (q: string) => void;
  ta: string;
  taList: TaItem[];
  onTa: (id: string) => void;
  templates: TemplateGroup[];
  onAddTemplate: (t: TemplateItem) => void;
  added?: SectionItem[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function SectionTree({
  pathway,
  active,
  onNav,
  query,
  setQuery,
  ta,
  taList,
  onTa,
  templates,
  onAddTemplate,
  added,
}: SectionTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tplOpen, setTplOpen] = useState(false);

  const q = query.trim().toLowerCase();

  const toggle = (v: string) =>
    setCollapsed((c) => ({ ...c, [v]: !c[v] }));

  const vols: VolumeItem[] =
    added && added.length
      ? [...pathway.tree, { vol: 'Added from templates', items: added }]
      : pathway.tree;

  return (
    <aside className="rce-tree">
      {/* ---- Header ---- */}
      <div className="rce-tree-h">
        <div className="rce-path">
          <span className="rce-path-k">{pathway.kind}</span>
        </div>
        <div className="rce-path-prog">{pathway.program}</div>
        <div className="rce-path-meta">
          <span>{pathway.code}</span>
          <span>{'·'}</span>
          <span>{pathway.dueline}</span>
        </div>
        <div className="rce-readbar">
          <div
            className="rce-readbar-f"
            style={{ width: pathway.readiness + '%' }}
          />
        </div>
        <div className="rce-path-meta" style={{ marginTop: 5 }}>
          <span>{pathway.readiness}% submission-ready</span>
        </div>

        {/* ---- Therapeutic area selector ---- */}
        <label className="rce-ta">
          <span className="rce-ta-k">Therapeutic area</span>
          <select value={ta} onChange={(e) => onTa(e.target.value)}>
            {(REG_TA_GROUPS || []).length
              ? (REG_TA_GROUPS as readonly TherapeuticAreaGroup[]).map(
                  (g) => {
                    const items = taList.filter((t) => t.group === g.id);
                    return items.length ? (
                      <optgroup key={g.id} label={g.label}>
                        {items.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  },
                )
              : taList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
          </select>
        </label>
      </div>

      {/* ---- Search ---- */}
      <div className="rce-search">
        <span className="ico">{I.search}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sections..."
        />
        {query && (
          <button
            className="tbtn"
            style={{ height: 20, minWidth: 20, fontSize: 13 }}
            onClick={() => setQuery('')}
          >
            {I.close}
          </button>
        )}
      </div>

      {/* ---- Scrollable tree ---- */}
      <div className="rce-tree-scroll">
        {vols.map((mod) => {
          const items = mod.items.filter(
            (s) =>
              !q ||
              s.label.toLowerCase().includes(q) ||
              s.num.includes(q),
          );
          if (!items.length) return null;
          const isC = collapsed[mod.vol] && !q;
          return (
            <div
              key={mod.vol}
              className="rce-mod"
              data-collapsed={isC || undefined}
            >
              <button
                className="rce-mod-h"
                onClick={() => toggle(mod.vol)}
              >
                <span className="rce-mod-chev">{I.chevDown}</span>
                <span className="rce-mod-l">{mod.vol}</span>
                {/module [2345]/i.test(mod.vol) && (
                  <span
                    style={{
                      fontSize: 8,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background:
                        'color-mix(in srgb,var(--success) 14%,transparent)',
                      color: 'var(--success)',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    Common
                  </span>
                )}
                <span className="rce-mod-ct">
                  {mod.items.filter((s) => s.status === 'complete').length}/
                  {mod.items.length}
                </span>
              </button>
              {items.map((s) => (
                <button
                  key={s.id}
                  className="rce-sec"
                  data-active={active === s.id || undefined}
                  data-blocker={s.blocker || undefined}
                  onClick={() => onNav(s.id)}
                >
                  <span className="rce-sec-num">{s.num}</span>
                  <span className="rce-sec-l">{s.label}</span>
                  <span className="rce-sec-meta">
                    <span className="rce-sec-dot" data-s={s.status} />
                    <span className="rce-sec-conf">
                      <span
                        className="rce-sec-conf-f"
                        style={{
                          width:
                            Math.round((s.conf || 0.5) * 100) + '%',
                        }}
                      />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          );
        })}

        {/* ---- Template add menu ---- */}
        <div className="rce-tpl-wrap">
          <button
            className="rce-tree-add"
            onClick={() => setTplOpen((o) => !o)}
          >
            {I.plus} New from template
          </button>
          {tplOpen && (
            <div
              className="rce-tpl-menu"
              onMouseLeave={() => setTplOpen(false)}
            >
              {(templates || []).map((g) => (
                <div key={g.group} className="rce-tpl-grp">
                  <div className="rce-tpl-grp-h">{g.group}</div>
                  {g.items.map((t) => (
                    <button
                      key={t.id}
                      className="rce-tpl-item"
                      onClick={() => {
                        onAddTemplate(t);
                        setTplOpen(false);
                      }}
                    >
                      <span className="rce-tpl-num">{t.num}</span>
                      <span className="rce-tpl-lbl">{t.label}</span>
                      <span className="rce-tpl-add">{I.plus}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
