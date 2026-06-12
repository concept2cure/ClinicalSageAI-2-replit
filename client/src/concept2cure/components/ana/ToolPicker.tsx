/**
 * ToolPicker — the composer's "Tools" control, now wired.
 *
 * Replaces the previously inert Tools button with a popover that lets the user
 * pin specific ANA tools for the next turn. Pins are additive focus, not a hard
 * restriction: the server always keeps the command bridge and context-selected
 * tools, so a narrow pin can't break ANA (per the ANA backend contract).
 *
 * - Catalog comes from `GET /api/ana-tool-policy/catalog` →
 *   `{ categories: [{ id, label, tools: [{ name, description }] }], deniedTools }`.
 *   Fetched lazily on first open and cached for the component's life.
 * - `deniedTools` (org policy) render disabled — visible but not selectable.
 * - Empty selection = "auto" (ANA chooses by intent), the recommended default.
 *
 * Design: calm popover, sentence case, Lucide icons, one accent focal point,
 * 200ms ease-out, aria-expanded/haspopup, Escape + click-outside to close.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { I } from './icons';
import styles from './styles.module.css';
import { getAuthHeaders } from '../../../utils/authToken';

interface CatalogTool {
  name: string;
  description: string;
}
interface CatalogCategory {
  id: string;
  label: string;
  tools: CatalogTool[];
}
interface ToolCatalog {
  categories: CatalogCategory[];
  deniedTools: string[];
}

export interface ToolPickerProps {
  /** Tool names the user has pinned for the next turn. */
  selectedTools: string[];
  /** Replace the pinned set. */
  onChange: (tools: string[]) => void;
}

export function ToolPicker({ selectedTools, onChange }: ToolPickerProps) {
  const ToolsIco = I.tools;
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<ToolCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const denied = new Set(catalog?.deniedTools ?? []);
  const pinned = new Set(selectedTools);

  // Lazy-load the catalog the first time the popover opens.
  useEffect(() => {
    if (!open || catalog || loading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/ana-tool-policy/catalog', {
      headers: getAuthHeaders(),
      credentials: 'include',
    })
      .then(async res => {
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        return (await res.json()) as ToolCatalog;
      })
      .then(data => {
        if (cancelled) return;
        setCatalog({
          categories: Array.isArray(data.categories) ? data.categories : [],
          deniedTools: Array.isArray(data.deniedTools) ? data.deniedTools : [],
        });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load tools");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalog, loading]);

  // Close on click-outside and Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleTool = useCallback(
    (name: string) => {
      if (denied.has(name)) return;
      const next = new Set(selectedTools);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      onChange(Array.from(next));
    },
    // denied is derived from catalog each render; selectedTools drives the set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTools, onChange, catalog]
  );

  const count = selectedTools.length;

  return (
    <div className={styles.toolPicker} ref={rootRef}>
      <button
        className={styles.composerIcon}
        title={count > 0 ? `${count} tool${count !== 1 ? 's' : ''} pinned` : 'Tools (auto)'}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <ToolsIco size={16} />
        {count > 0 && <span className={styles.toolPickerBadge}>{count}</span>}
      </button>

      {open && (
        <div className={styles.toolPickerPop} role="group" aria-label="Pin tools for this turn">
          <div className={styles.toolPickerHead}>
            <span>Tools</span>
            {count > 0 ? (
              <button
                type="button"
                className={styles.toolPickerReset}
                onClick={() => onChange([])}
              >
                Reset to auto
              </button>
            ) : (
              <span className={styles.toolPickerAuto}>Auto</span>
            )}
          </div>
          <p className={styles.toolPickerHint}>
            Pin tools to focus this turn. Auto lets ANA choose by intent.
          </p>

          {loading && <div className={styles.toolPickerState}>Loading tools…</div>}
          {error && <div className={styles.toolPickerState}>{error}</div>}

          {!loading && !error && catalog && (
            <div className={styles.toolPickerList}>
              {catalog.categories.map(cat => (
                <div key={cat.id} className={styles.toolPickerCat}>
                  <div className={styles.toolPickerCatLabel}>{cat.label}</div>
                  {cat.tools.map(tool => {
                    const isDenied = denied.has(tool.name);
                    const isPinned = pinned.has(tool.name);
                    return (
                      <label
                        key={tool.name}
                        className={styles.toolPickerRow}
                        data-disabled={isDenied || undefined}
                        title={isDenied ? 'Disabled by your organization' : tool.description}
                      >
                        <input
                          type="checkbox"
                          checked={isPinned}
                          disabled={isDenied}
                          onChange={() => toggleTool(tool.name)}
                        />
                        <span className={styles.toolPickerName}>
                          {tool.name.replace(/_/g, ' ')}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
