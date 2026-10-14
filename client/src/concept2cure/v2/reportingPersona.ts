/** The optional reporting persona is personalisation, never authorisation. */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, extractApiError, queryClient } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { isReportPersona, type ReportPersona } from '@shared/constants/domain/report-personas';

export const REPORT_PERSONA_PATH = '/api/users/me/persona';
export interface PersonaRead { persona: ReportPersona | null; role: string; availablePersonas: ReportPersona[] }
export function isPersonaRead(v: unknown): v is PersonaRead {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const value = v as Record<string, unknown>;
  return (value.persona === null || isReportPersona(value.persona)) && typeof value.role === 'string' && !!value.role.trim() &&
    Array.isArray(value.availablePersonas) && value.availablePersonas.length > 0 && value.availablePersonas.every(isReportPersona) &&
    new Set(value.availablePersonas).size === value.availablePersonas.length &&
    (value.persona === null || value.availablePersonas.includes(value.persona));
}

/** Session identity is part of the cache key: one account's role never personalises another account. */
export const reportPersonaKey = (userId: string, organizationId: string) => [REPORT_PERSONA_PATH, userId, organizationId] as const;
const sessionIdentity = () => {
  const user = authService.getUser();
  return { userId: user ? String(user.id) : '', organizationId: user ? String(user.organizationId) : '' };
};

/** Reads on catalog entrance. Account's successful PUT updates this same scoped query cache. */
export function useCurrentReportPersona() {
  const [identity, setIdentity] = React.useState(sessionIdentity);
  React.useEffect(() => {
    const update = () => setIdentity(sessionIdentity());
    update();
    const unsubscribe = ['login', 'logout', 'session_expired', 'user_updated'].map(event => authService.on(event as Parameters<typeof authService.on>[0], update));
    return () => unsubscribe.forEach(stop => stop());
  }, []);
  const enabled = Boolean(getAuthToken() && /^\d+$/.test(identity.userId) && Number(identity.userId) > 0 &&
    /^\d+$/.test(identity.organizationId) && Number(identity.organizationId) > 0);
  const read = useQuery({
    queryKey: reportPersonaKey(identity.userId, identity.organizationId),
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const response = await apiRequest('GET', REPORT_PERSONA_PATH);
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(extractApiError(body, response.status).message);
      if (!isPersonaRead(body)) throw new Error('Your reporting role could not be read.');
      return body;
    },
  }, queryClient);
  return { ...read, enabled, identityKey: `${identity.userId}:${identity.organizationId}` };
}

/** Saved role is a default; an explicit choice, including All, stays in control. */
export function useCatalogReportingRole(personas: string[]) {
  const [persona, setPersona] = React.useState('');
  const explicit = React.useRef(false);
  const profile = useCurrentReportPersona();
  const vocabulary = personas.join('|');
  React.useEffect(() => {
    explicit.current = false;
    setPersona('');
  }, [profile.identityKey]);
  const saved = profile.data?.persona;
  React.useEffect(() => {
    if (explicit.current || !profile.enabled) return;
    if (profile.isSuccess) setPersona(saved && vocabulary.split('|').includes(saved) ? saved : '');
    else if (profile.isError) setPersona('');
  }, [profile.enabled, profile.isSuccess, profile.isError, saved, vocabulary, profile.identityKey]);
  const choose = (value: string) => { explicit.current = true; setPersona(value); };
  return { persona, choose, profile };
}
