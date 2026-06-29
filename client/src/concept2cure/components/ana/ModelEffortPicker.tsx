/**
 * ModelEffortPicker — the AnA Composer's Fast/Balanced/Thorough effort control
 * plus an advanced model dropdown. Flag-gated by ENABLE_MODEL_EFFORT_PICKER
 * (the Composer renders this only when the flag is on).
 *
 * Effort is exposed as an accessible segmented control (`role="radiogroup"`);
 * the model list lazy-fetches from GET /api/claude/models the first time the
 * picker mounts. Calm styling, 200ms ease-out transitions, no emoji, visible
 * focus rings, and accessible names on every control.
 *
 * @module client/src/concept2cure/components/ana/ModelEffortPicker
 */
import { useEffect, useState } from 'react';

import { getAuthHeaders } from '../../../utils/authToken';
import styles from './styles.module.css';

/** The three effort levels, mirroring server EffortLevel. */
export type EffortLevel = 'fast' | 'balanced' | 'thorough';

export const EFFORT_OPTIONS: ReadonlyArray<{ value: EffortLevel; label: string; hint: string }> = [
  { value: 'fast', label: 'Fast', hint: 'Quick, lower-cost answers' },
  { value: 'balanced', label: 'Balanced', hint: 'Default — task-matched routing' },
  { value: 'thorough', label: 'Thorough', hint: 'Deeper reasoning, highest quality' },
];

/** One model option as projected by GET /api/claude/models. */
export interface PickerModelOption {
  id: string;
  label: string;
  provider: string;
  recommendedEffort?: EffortLevel;
}

export interface ModelEffortPickerProps {
  /** Current effort level. */
  effort: EffortLevel;
  /** Change the effort level. */
  onEffortChange: (effort: EffortLevel) => void;
  /**
   * Current model override (registry id), or null/undefined for "Auto" — let
   * the server route by effort.
   */
  modelOverride?: string | null;
  /** Change the model override. null clears it back to Auto. */
  onModelOverrideChange: (modelId: string | null) => void;
}

/** Module-level cache so we only hit /api/claude/models once per session. */
let cachedModels: PickerModelOption[] | null = null;

async function fetchModels(): Promise<PickerModelOption[]> {
  if (cachedModels) return cachedModels;
  const res = await fetch('/api/claude/models', {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`models request failed: ${res.status}`);
  const body = (await res.json()) as {
    data?: { models?: Array<Record<string, unknown>> };
  };
  const rows = Array.isArray(body.data?.models) ? body.data!.models! : [];
  const models: PickerModelOption[] = rows
    .filter((m) => typeof m.id === 'string' && typeof m.label === 'string')
    .map((m) => ({
      id: m.id as string,
      label: m.label as string,
      provider: typeof m.provider === 'string' ? (m.provider as string) : '',
      recommendedEffort:
        m.recommendedEffort === 'fast' ||
        m.recommendedEffort === 'balanced' ||
        m.recommendedEffort === 'thorough'
          ? (m.recommendedEffort as EffortLevel)
          : undefined,
    }));
  cachedModels = models;
  return models;
}

export function ModelEffortPicker({
  effort,
  onEffortChange,
  modelOverride,
  onModelOverrideChange,
}: ModelEffortPickerProps) {
  const [models, setModels] = useState<PickerModelOption[]>(cachedModels ?? []);
  const [loaded, setLoaded] = useState<boolean>(cachedModels != null);

  // Lazy-fetch the model list the first time the picker mounts.
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    fetchModels()
      .then((m) => {
        if (!cancelled) {
          setModels(m);
          setLoaded(true);
        }
      })
      .catch((err) => {
        // Non-blocking: the effort control still works without the model list.
        console.warn('[ModelEffortPicker] models fetch failed:', err?.message);
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  return (
    <>
      <div
        className={styles.effortControl}
        role="radiogroup"
        aria-label="Response effort"
      >
        {EFFORT_OPTIONS.map((opt) => {
          const active = opt.value === effort;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${opt.label} effort — ${opt.hint}`}
              title={opt.hint}
              data-active={active}
              className={styles.effortOption}
              onClick={() => onEffortChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {models.length > 0 && (
        <select
          className={styles.modelSelect}
          aria-label="Model"
          value={modelOverride ?? ''}
          onChange={(e) => onModelOverrideChange(e.target.value || null)}
        >
          <option value="">Auto</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

/** Reset the module model cache — for tests. */
export function __resetModelCache(): void {
  cachedModels = null;
}
