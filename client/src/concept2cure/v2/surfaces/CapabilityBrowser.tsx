/**
 * CapabilityBrowser — the long tail of the home surface, in an overlay.
 *
 * WHY THIS EXISTS. The landing page used to render every module in the tenant's
 * segment inline, below the composer: a full "Everything in your {category}"
 * grid over every `SEGMENT_MODULES` group. That put the product's entire
 * capability catalogue on the first authenticated screen, under a composer whose
 * whole point is that you can just ask. The home is the short head; this is the
 * long tail.
 *
 * NOTHING WAS DELETED TO BUILD THIS. The grid moved here whole — same data
 * (`getSegmentModules` → `getSurfaceMeta`), same `onNav(id)` handler, same
 * card markup. Every capability that was one click from the home before is one
 * click from the home now: trigger, then card. What is new is the search, which
 * the inline grid never had and which is what makes a catalogue this size
 * usable at all.
 *
 * Styles: `.capbrowser*` in styles/surfaces-v2.css — the `.landing-modules`
 * rules, rescoped. Focus/Escape/restore come from `useDialog` (which is not a
 * full focus trap; see its docstring — that is the v2 modal convention here).
 */
import React from 'react';
import { I } from '../icons';
import { getSegmentContext, getSegmentModules, getSurfaceMeta } from '../registryModel';
import { useDialog } from '../useDialog';

export function CapabilityBrowser({
  segment,
  onNav,
  onClose,
}: {
  segment: string;
  onNav: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useDialog(onClose);
  const [q, setQ] = React.useState('');
  const ctx = getSegmentContext(segment);
  const modGroups = React.useMemo(() => getSegmentModules(segment) ?? [], [segment]);

  /* Resolve every id to its registry meta ONCE, then filter on the resolved
     label. Filtering on the raw id instead would silently miss the thing the
     user can actually see: `document-authoring` is labelled "Authoring", so
     typing "authoring" would match while typing the visible word on a card
     might not. The label is what is on screen, so the label is what is
     searched — plus the group heading, so "evidence" finds an evidence group
     whose members are named for their documents. */
  const groups = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return modGroups
      .map((g) => {
        const items = g.items
          .map((id) => ({ id, meta: getSurfaceMeta(id) }))
          .filter(({ meta }) => {
            if (!needle) return true;
            if (g.label.toLowerCase().includes(needle)) return true;
            return meta.label.toLowerCase().includes(needle);
          });
        return { label: g.label, items };
      })
      .filter((g) => g.items.length > 0);
  }, [modGroups, q]);

  const total = React.useMemo(
    () => groups.reduce((n, g) => n + g.items.length, 0),
    [groups],
  );

  const go = (id: string) => {
    onNav(id);
    onClose();
  };

  return (
    <div className="capbrowser-bd" onClick={onClose}>
      <div
        className="capbrowser"
        role="dialog"
        aria-modal="true"
        aria-label="Browse all capabilities"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="capbrowser-h">
          <div>
            <h2 className="cb-title">Everything in your {ctx ? ctx.label : 'workspace'}</h2>
            <span className="cb-sub">All modules built for this client category</span>
          </div>
          <button type="button" className="capbrowser-x" onClick={onClose} aria-label="Close">
            {I.close}
          </button>
        </div>

        <div className="capbrowser-search">
          <span className="ico">{I.search}</span>
          <input
            type="search"
            className="cb-input"
            placeholder="Search capabilities"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search capabilities"
            autoFocus
          />
        </div>

        {/* The count is the search's only feedback when a query narrows a long
            catalogue, so it is announced rather than merely drawn. */}
        <span className="sr-only" aria-live="polite">
          {q.trim() ? `${total} capabilit${total === 1 ? 'y' : 'ies'} match ${q.trim()}` : ''}
        </span>

        <div className="capbrowser-body">
          {/* There is deliberately no "this segment has no modules" branch.
              `getSegmentModules` cannot return empty — an unresolved id falls
              back to SEGMENT_MODULES.biopharma (registryModel.ts:1004) — so
              such a branch could never execute. A gate that cannot be made to
              fail has not been tested, and shipping one reads as handling a
              state that in fact cannot arise. If that fallback is ever
              removed, this is where the empty state belongs. */}
          {groups.length === 0 ? (
            <p className="cb-empty">
              Nothing matches “{q.trim()}”. Try a shorter word, or ask AnA on the home screen.
            </p>
          ) : (
            <div className="capbrowser-groups">
              {groups.map((g) => (
                <section key={g.label} className="capbrowser-group">
                  <h3 className="cb-grp-label">{g.label}</h3>
                  <div className="cb-grp-grid">
                    {g.items.map(({ id, meta }) => (
                      <button
                        key={id}
                        type="button"
                        className="cb-card"
                        onClick={() => go(id)}
                        title={('notes' in meta && meta.notes) || meta.label}
                      >
                        <span className="cb-card-ic">{(meta.icon && I[meta.icon]) ?? I.grid}</span>
                        <span className="cb-card-l">{meta.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
