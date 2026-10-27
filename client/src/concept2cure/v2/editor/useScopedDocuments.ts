/** The existing authoring list reader, shared unchanged with project template starts. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { authService, useAuth } from '@/services/portal/authService';
import { useAuthoringReadSession } from './authoringCurrentRead';
import { captureDocumentRefreshOwner } from './documentRecordRead';
import type { AuthDoc } from './DocumentWorkbench';

type WorkingDocumentRead = { success?: boolean; documents?: Array<AuthDoc & { program_id?: unknown }> };
function workingDocumentRows(body: WorkingDocumentRead | null): AuthDoc[] {
  return Array.isArray(body?.documents) ? body.documents : [];
}
function verifiedWorkingDocuments(body: WorkingDocumentRead | null, programId: string | null): boolean {
  return programId !== null && body?.success === true && Array.isArray(body.documents) && body.documents.every(row =>
    row && typeof row.id === 'string' && row.id.trim() && typeof row.title === 'string' && row.program_id === programId);
}

export function useScopedDocuments(programId: string | null, status: string) {
  const { user } = useAuth();
  const session = useAuthoringReadSession(user);
  const [docs, setDocs] = useState<AuthDoc[]>([]);
  const [docsState, setDocsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const sequence = useRef(0);
  const alive = useRef(true);
  const context = JSON.stringify([session.actor, session.key, programId, status]);
  const currentContext = useRef({ key: context });
  if (currentContext.current.key !== context) currentContext.current = { key: context };
  const recoveredContext = useRef<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current += 1; }; }, []);
  const readDocs = useCallback(async (readStatus: string, recovery = false) => {
    const scope = currentContext.current;
    if (scope.key !== context) return false;
    const owner = captureDocumentRefreshOwner(recovery);
    if (!owner) return false;
    const generation = ++sequence.current;
    const revision = authService.captureSessionReadGuard().sameRevision;
    const currentRead = () => alive.current && generation === sequence.current && currentContext.current === scope
      && session.sameRevision() && revision() && owner.current();
    setDocsState('loading');
    let body: WorkingDocumentRead | null = null;
    let ok = false;
    try {
      const path = `/api/authoring/docs?status=${encodeURIComponent(readStatus)}` + (programId ? `&programId=${encodeURIComponent(programId)}` : '');
      const res = owner.headers ? await apiRequest('GET', path, undefined, owner.headers) : await apiRequest('GET', path);
      body = await res.json().catch(() => null);
      ok = res.ok;
    } catch { /* A failed read is reported below, without stale list fallback. */ }
    if (!currentRead()) return false;
    const verified = ok && verifiedWorkingDocuments(body, programId);
    const usable = recovery ? verified : ok && Boolean(body) && Array.isArray(body?.documents);
    setLoadedScope(JSON.stringify([session.actor, session.key, programId, readStatus]));
    setDocs(usable ? workingDocumentRows(body) : []);
    setDocsState(usable ? 'ready' : 'error');
    return verified;
  }, [programId, context, session]);
  const loadDocs = useCallback(async () => { await readDocs(status); }, [readDocs, status]);
  const refreshCreationContext = useCallback(async () => {
    const scope = currentContext.current;
    if (!await readDocs('all', true) || currentContext.current !== scope) return false;
    recoveredContext.current = JSON.stringify([session.actor, session.key, programId, 'all']);
    return true;
  }, [readDocs, programId, session]);
  useEffect(() => {
    const recovered = recoveredContext.current === context;
    recoveredContext.current = null;
    if (!recovered) void loadDocs();
  }, [loadDocs, context]);
  const current = loadedScope === context && session.sameRevision();
  return { docs: current ? docs : [], docsState: current ? docsState : 'loading' as const, loadDocs, refreshCreationContext };
}
