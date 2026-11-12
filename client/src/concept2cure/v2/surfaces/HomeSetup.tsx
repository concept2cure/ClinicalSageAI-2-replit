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
 * done. When all three are done the checklist is gone. It is not offered to a
 * viewer the company read says cannot manage (its canManage).
 *
 *   Getting started   (P-127 §3.6) the getting-started course for the person's
 *                     client type, on Help & training, for every member. Its
 *                     progress is not recorded anywhere, so it has no Done: it
 *                     is not one of the three counted steps, and once the person
 *                     has opened it (this browser remembers, a convenience only)
 *                     it is not offered again. A member who is not an
 *                     administrator sees it alone, as "Get started".
 */
import React from 'react';
import { I } from '../icons';
import { useLiveData, type ListState } from '../dataConnect';
import { useAuth } from '@/services/portal/authService';
import { isOrgAdminRole } from '../orgAdmin';
import { applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { stashNavParamsForTarget } from '../navParams';

type StepState = 'done' | 'todo' | 'unknown' | 'reading';
interface CompanyProfileRead { data?: { revision?: unknown; address?: unknown }; revision?: unknown; address?: unknown; canManage?: unknown }
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

/** Help & training resolves "getting-started" to the course for the organisation's client type (Training.tsx). */
export const GETTING_STARTED_COURSE = 'getting-started';
const courseKey = (userId: unknown) => `c2c.help.gettingStartedOpened.${String(userId ?? 'anon')}`;
function courseOpened(userId: unknown): boolean {
  try { return window.localStorage.getItem(courseKey(userId)) === '1'; } catch { return false; }
}
function openCourse(userId: unknown, onNav: (id: string) => void) {
  try { window.localStorage.setItem(courseKey(userId), '1'); } catch { /* still opens; it is offered again next time */ }
  stashNavParamsForTarget('training', { course: GETTING_STARTED_COURSE });
  onNav('training');
}

function CourseRow({ act }: { act: () => void }) {
  return (
    <li data-step="course" data-state="course">
      <button type="button" className="home-row" onClick={act}>
        <span className="home-row-t">Take the getting-started course<span className="home-setup-hint">Short lessons on projects, AnA, assigning work and getting help, for you and each person you invite.</span></span>
        <span className="home-row-m">Course</span>
        <span className="home-row-go">{I.right}</span>
      </button>
    </li>
  );
}

/** A member who is not an administrator: the course alone, until they have opened it. */
function MemberGettingStarted({ userId, onNav }: { userId: unknown; onNav: (id: string) => void }) {
  const [opened] = React.useState(() => courseOpened(userId));
  if (opened) return null;
  return (
    <section className="home-sec" aria-labelledby="home-start-h" data-testid="home-getting-started">
      <div className="home-sec-head"><h2 id="home-start-h" className="home-sec-h">Get started</h2></div>
      <ol className="home-list home-setup"><CourseRow act={() => openCourse(userId, onNav)} /></ol>
    </section>
  );
}

function openAdminTab(tab: 'settings' | 'members', onNav: (id: string) => void) {
  const res = resolveSurfaceAction('admin-console.open-tab', { tab });
  if (res.ok) applySurfaceAction(res.directive, () => onNav('admin-console'));
  else onNav('admin-console');
}

interface SetupStep { id: string; label: string; hint: string; state: StepState; act: () => void }

/** The three counted steps, each with its state as read and the screen where it is done. */
function setupSteps({ company, org, projects, onNav, onNewProject }: {
  company: { data: CompanyProfileRead | null; loading: boolean; error?: string };
  org: { data: OrganizationRead | null; loading: boolean; error?: string };
  projects: ListState<unknown>;
  onNav: (id: string) => void;
  onNewProject: () => void;
}): SetupStep[] {
  const projectState: StepState = projects.loading ? 'reading' : projects.error ? 'unknown' : projects.rows.length > 0 ? 'done' : 'todo';
  return [
    { id: 'company', label: 'Record your company details', hint: 'Name, address and contact, used on your documents and letters.',
      state: companyDetailsState(company), act: () => openAdminTab('settings', onNav) },
    { id: 'team', label: 'Invite your team', hint: 'The people who write, review and sign with you.',
      state: teamState(org), act: () => openAdminTab('members', onNav) },
    { id: 'project', label: 'Create your first project', hint: 'One regulatory filing, for example an IND or a 510(k), from plan to submission.',
      state: projectState, act: onNewProject },
  ];
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
  const memberOnly = <MemberGettingStarted userId={user?.id} onNav={onNav} />;
  if (!admin) return memberOnly;
  /* The role list above is the client's, and wider than the server's: it admits
     business_admin and platform_admin, whom both writes refuse (company details
     and invitations need the organisation role owner or admin). The company
     read answers for the viewer (canManage), so someone it says cannot manage is
     not offered steps the server would refuse (2026-10-25, the what-exists
     critic of the client journey). */
  if (company.data?.canManage === false) return memberOnly;
  const steps = setupSteps({ company, org, projects, onNav, onNewProject });
  if (steps.every((s) => s.state === 'done')) return memberOnly;
  const showCourse = !courseOpened(user?.id);
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
        {showCourse && <CourseRow act={() => openCourse(user?.id, onNav)} />}
      </ol>
    </section>
  );
}
