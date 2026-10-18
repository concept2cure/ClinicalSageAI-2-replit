import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { readSavedAssemblySources, type SavedAssemblySources } from '@shared/authoring/saved-assembly-sources';

type SavedReadResult = { ok: true; data: SavedAssemblySources } | { ok: false; message: string; stale?: true };
const stale = (): SavedReadResult => ({ ok: false, stale: true, message: 'The document, project, account or source context changed. No saved source selection was applied.' });
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Explicit GET only; null history is accepted only in a valid affirmative receipt. */
export async function getSavedAssemblySources(docId: string, programId: string, current: () => boolean): Promise<SavedReadResult> {
  if (!current()) return stale();
  try {
    const response = await apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(docId)}/assembly/sources?programId=${encodeURIComponent(programId)}`);
    if (!current()) return stale();
    const body = object(await response.json().catch(() => null));
    if (!current()) return stale();
    if (!response.ok) return { ok: false, message: serverMessage(body) ?? `Saved sources could not be read (HTTP ${response.status}).` };
    const data = body?.success === true ? readSavedAssemblySources(body.data) : null;
    if (!data || data.docId.toLowerCase() !== docId.toLowerCase() || data.programId.toLowerCase() !== programId.toLowerCase()) {
      return { ok: false, message: 'The server did not confirm saved source references for this exact document and project.' };
    }
    return { ok: true, data };
  } catch (error) {
    if (!current()) return stale();
    return { ok: false, message: error instanceof Error ? redactInternals(error.message, 'Saved sources could not be read.') : 'Saved sources could not be read.' };
  }
}
