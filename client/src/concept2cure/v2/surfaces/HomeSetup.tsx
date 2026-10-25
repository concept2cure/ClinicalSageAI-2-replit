/**
 * Setting up a new organisation: three steps on Home (decision 9,
 * CLIENT_JOURNEY_2026-10-25.md pass 5), for the people who can take them —
 * organisation administrators. Each step's state is read, never assumed, and
 * each opens the screen where it is done today; nothing here is a new store.
 *
 *   Company details   GET /api/client-branding/company-documents — recorded
 *                     when the profile has been saved (revision > 0) with an
 *                     address. The company name alone is not evidence: the
 *                     profile falls back to the organisation's signup name.
 *                     Done in Admin & access, Settings (CompanyDocumentSettings).
 *   Your team         GET /api/organizations/:id — activeUsers counts the
 *                     organisation's memberships, so more than one means
 *                     someone else was invited. Done in Admin & access, Members.
 *   First project     the project list Home already reads (one read, shared
 *                     with "Your projects"). Done in the New project wizard.
 *
 * A read that fails is said ("Could not be checked"), never shown as to do or
 * done. When all three are done the checklist is gone.
 */
import React from 'react';
import { I } from '../icons';
import { useLiveData, type ListState } from '../dataConnect';
import { useAuth } from '@/services/portal/authService';
import { isOrgAdminRole } from '../orgAdmin';
import { applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

type StepState = 'done' | 'todo' | 'unknown' | 'reading';
interface CompanyProfileRead { data?: { revision?: unknown; address?: unknown }; revision?: unknown; address?: unknown }
interface OrganizationRead { organization?: { activeUsers?: unknown } }

/** Saved, with an address: the profile's own facts, from either response shape. */
export function companyDetailsState(read: { data: CompanyProfileRead | null; loading: boolean; error?: string }): StepState {
  if (read.loading) return 'reading';
  if (read.error || !read.data) return 'unknown';
  const profile = read.data.data ?? read.data;
  const revision = Number(profile.revision);
  if (!Number.isFinite(revision)) return 'unknown';
  return revision > 0 && String(profile.address ?? '').trim() ? 'done' : 'todo';
}

export function teamState(read: { data: OrganizationRead | null; loading: boolean; error?: string }): StepState {
  if (read.loading) return 'reading';
  const n = Number(read.data?.organization?.activeUsers);
  if (read.error || !Number.isFinite(n)) return 'unknown';
  return n > 1 ? 'done' : 'todo';
}

const STATE_WORDS: Record<StepState, string> = { done: 'Done', todo: 'To do', unknown: 'Could not be checked', reading: 'Checking…' };

function openAdminTab(tab: 'settings' | 'members', onNav: (id: string) => void) {
  const res = resolveSurfaceAction('admin-console.open-tab', { tab });
  if (res.ok) applySurfaceAction(res.directive, () => onNav('admin-console'));
  else onNav('admin-console');
}

export function HomeSetup({ onNav, onNewProject, projects }: {
  onNav: (id: string) => void;
  onNewProject: () => void;
  projects: ListState<unknown>;
}) {
  const { user } = useAuth();
  const admin = isOrgAdminRole(user?.roles);
  const orgId = user?.organizationId != null ? String(user.organizationId) : null;
  const company = useLiveData<CompanyProfileRead>(admin ? '/api/client-branding/company-documents?includeLegal=false' : null);
  const org = useLiveData<OrganizationRead>(admin && orgId ? `/api/organizations/${encodeURIComponent(orgId)}` : null);
  if (!admin) return null;
  const steps: Array<{ id: string; label: string; hint: string; state: StepState; act: () => void }> = [
    { id: 'company', label: 'Record your company details', hint: 'Name, address and contact, used on your documents and letters.',
      state: companyDetailsState(company), act: () => openAdminTab('settings', onNav) },
    { id: 'team', label: 'Invite your team', hint: 'The people who write, review and sign with you.',
      state: teamState(org), act: () => openAdminTab('members', onNav) },
    { id: 'project', label: 'Create your first project', hint: 'One regulatory filing, for example an IND, from plan to submission.',
      state: projects.loading ? 'reading' : projects.error ? 'unknown' : projects.rows.length > 0 ? 'done' : 'todo', act: onNewProject },
  ];
  if (steps.every((s) => s.state === 'done')) return null;
  const done = steps.filter((s) => s.state === 'done').length;
  return (
    <section className="home-sec" aria-labelledby="home-setup-h" data-testid="home-setup">
      <div className="home-sec-head">
        <h2 id="home-setup-h" className="home-sec-h">Set up your organisation</h2>
        <span className="home-row-m">{done} of {steps.length} done</span>
      </div>
      <ol className="home-list home-setup">
        {steps.map((s) => (
          <li key={s.id} data-step={s.id} data-state={s.state}>
            {s.state === 'done' ? (
              <div className="home-row home-setup-done">
                <span className="home-row-go">{I.check}</span>
                <span className="home-row-t">{s.label}</span>
                <span className="home-row-m">{STATE_WORDS[s.state]}</span>
              </div>
            ) : (
              <button type="button" className="home-row" onClick={s.act}>
                <span className="home-row-t">{s.label}<span className="home-setup-hint">{s.hint}</span></span>
                <span className="home-row-m">{STATE_WORDS[s.state]}</span>
                <span className="home-row-go">{I.right}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
