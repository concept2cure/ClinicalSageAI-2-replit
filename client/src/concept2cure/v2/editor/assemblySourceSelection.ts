import { readAssemblySourceManifest, readAssemblySourceSelectors, type AssemblySourceManifest, type AssemblySourceSelector } from '@shared/authoring/assembly-sources';

export const assemblySelectionKey = (sources?: AssemblySourceSelector[] | null): string => sources ? JSON.stringify(sources) : 'template-only';

/** Ordered selectors and expected versions must survive without omission. */
export function assemblyManifestForSelection(raw: unknown, programId: string, selected?: AssemblySourceSelector[]): AssemblySourceManifest | null | undefined {
  if (selected === undefined) return raw === undefined ? undefined : null;
  const selectors = readAssemblySourceSelectors(selected);
  const manifest = readAssemblySourceManifest(raw);
  if (!selectors || !manifest || manifest.programId !== programId) return null;
  return assemblySelectionKey(manifest.entries.map(entry => entry.source)) === assemblySelectionKey(selectors) ? manifest : null;
}

export function sameAssemblyManifest(actual: AssemblySourceManifest | undefined, expected: AssemblySourceManifest | undefined): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
