import type { SavedAssemblySources } from '@shared/authoring/saved-assembly-sources';

export interface SavedAssemblySourcesView {
  phase: 'idle' | 'checking' | 'recorded' | 'empty' | 'failed' | 'reusing';
  data?: SavedAssemblySources;
  message: string;
}
export interface SavedAssemblySourcesControls {
  savedSources: SavedAssemblySourcesView;
  savedSourcesReadDisabledReason: string | null;
  savedSourcesReuseDisabledReason: string | null;
  checkSavedSources: () => Promise<void>;
  useSavedSources: () => Promise<void>;
}
/** This private ownership is never serialized or confused with a build receipt. */
export interface SavedAssemblySourcesCache {
  view: SavedAssemblySourcesView;
  current: () => boolean;
  attempt: object | null;
}
export const initialSavedAssemblySources = (): SavedAssemblySourcesView => ({ phase: 'idle', message: '' });
