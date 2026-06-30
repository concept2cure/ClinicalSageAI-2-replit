/**
 * Per-user UI preferences — Phase 10.2 (docs/legacy/PHASE_10_2_INSTALL.md §3.4).
 *
 * density + rail collapse state + AnA dock open state, persisted to
 * users.preferences via PUT /api/users/me/preferences (merge-patch,
 * allowed keys: density | railGroups | dockOpen). The hook also reads
 * the session user (GET /api/users/me) for the greeting name and the
 * organization's client_type (tenant IA).
 *
 * Degrades gracefully: when the session endpoints are unreachable the
 * hook falls back to localStorage (the pre-10.2 store) so the shell
 * still works in dev / unauthenticated review sessions — the established
 * `live ?? fallback` pattern.
 *
 * @module client/src/concept2cure/biopharma/data/preferences
 */

import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '../../../utils/authToken';
import { asClientType, type ClientType } from './clientTypes';
import { defaultRailGroupsOpen } from './nav';

export type Density = 'compact' | 'comfortable' | 'spacious';

const LS_DENSITY = 'biopharma.density';
const LS_DOCK = 'biopharma.anaOpen';
const LS_RAIL = 'biopharma.railGroupsOpen';
const LS_CLIENT_TYPE = 'biopharma.clientType';

function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode — preferences still persist server-side */
  }
}

function asDensity(value: unknown): Density | null {
  return value === 'compact' || value === 'comfortable' || value === 'spacious' ? value : null;
}

function asRailGroups(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export interface UseUserPreferencesResult {
  /** True once the GET /api/users/me round-trip resolved (either way). */
  loaded: boolean;
  density: Density;
  setDensity: (d: Density) => void;
  /** Rail group id -> open. Merged over the brief's smart defaults. */
  railGroups: Record<string, boolean>;
  setRailGroupOpen: (groupId: string, open: boolean) => void;
  dockOpen: boolean;
  setDockOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  /** Tenant IA from organizations.client_type (server-derived). */
  clientType: ClientType;
  /** Session user's first name for the Overview greeting; null when unknown. */
  userFirstName: string | null;
}

export function useUserPreferences(): UseUserPreferencesResult {
  const [loaded, setLoaded] = useState(false);
  const [density, setDensityState] = useState<Density>(
    () => asDensity(readLs(LS_DENSITY)) ?? 'comfortable',
  );
  const [railGroups, setRailGroupsState] = useState<Record<string, boolean>>(() => {
    const stored = (() => {
      try {
        const raw = readLs(LS_RAIL);
        return raw ? asRailGroups(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    })();
    return { ...defaultRailGroupsOpen(), ...(stored ?? {}) };
  });
  const [dockOpen, setDockOpenState] = useState<boolean>(() => {
    try {
      return JSON.parse(readLs(LS_DOCK) ?? 'false') === true;
    } catch {
      return false;
    }
  });
  const [clientType, setClientType] = useState<ClientType>(() =>
    asClientType(readLs(LS_CLIENT_TYPE)),
  );
  const [userFirstName, setUserFirstName] = useState<string | null>(null);

  // Hydrate from the live session: preferences + org client type + name.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/users/me', { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(
        (me: {
          firstName?: string;
          displayName?: string;
          organizationClientType?: string;
          preferences?: Record<string, unknown>;
        }) => {
          if (cancelled) return;
          const prefs = me.preferences ?? {};
          const liveDensity = asDensity(prefs.density);
          if (liveDensity) setDensityState(liveDensity);
          const liveRail = asRailGroups(prefs.railGroups);
          if (liveRail) setRailGroupsState({ ...defaultRailGroupsOpen(), ...liveRail });
          if (typeof prefs.dockOpen === 'boolean') setDockOpenState(prefs.dockOpen);
          if (me.organizationClientType) {
            const ct = asClientType(me.organizationClientType);
            setClientType(ct);
            writeLs(LS_CLIENT_TYPE, ct);
          }
          const first = me.firstName || me.displayName?.split(' ')[0] || null;
          if (first) setUserFirstName(first);
          setLoaded(true);
        },
      )
      .catch(() => {
        // Unauthenticated / endpoint unreachable — localStorage state stands.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Fire-and-forget merge-patch; localStorage mirrors as the offline copy. */
  const persist = useCallback((patch: Record<string, unknown>) => {
    fetch('/api/users/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(patch),
    }).catch(() => {
      /* offline / unauthenticated — local mirror below still applies */
    });
  }, []);

  const setDensity = useCallback(
    (d: Density) => {
      setDensityState(d);
      writeLs(LS_DENSITY, d);
      persist({ density: d });
    },
    [persist],
  );

  const setRailGroupOpen = useCallback(
    (groupId: string, open: boolean) => {
      setRailGroupsState(prev => {
        const next = { ...prev, [groupId]: open };
        writeLs(LS_RAIL, JSON.stringify(next));
        persist({ railGroups: next });
        return next;
      });
    },
    [persist],
  );

  const setDockOpen = useCallback(
    (open: boolean | ((prev: boolean) => boolean)) => {
      setDockOpenState(prev => {
        const next = typeof open === 'function' ? open(prev) : open;
        writeLs(LS_DOCK, JSON.stringify(next));
        persist({ dockOpen: next });
        return next;
      });
    },
    [persist],
  );

  return {
    loaded,
    density,
    setDensity,
    railGroups,
    setRailGroupOpen,
    dockOpen,
    setDockOpen,
    clientType,
    userFirstName,
  };
}
