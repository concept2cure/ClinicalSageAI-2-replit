/**
 * Home's sections, in the order a client reads them (surfaces/Surfaces.tsx
 * Home composes them with the composer).
 */
import React from 'react';
import { I } from '../icons';
import { type ListState } from '../dataConnect';
import type { OnboardingWelcome } from '../onboardingWelcome';
import { openProjectHome } from '../shellProject';
import { applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { PJ_LIFECYCLE } from '../fixtures/project-home-data';
import { WS_LABEL } from './ProjectPortfolioFilters';
import { enumWords } from './projectWords';
import { OpenWorkGroups, useOpenWorkReads } from '../OpenWork';
import { taskActorScope, taskTargetLocation } from '../taskTarget';
import { useAuth } from '@/services/portal/authService';

/* ════════════ Home — where a client starts ════════════
   docs/design/CLIENT_JOURNEY_2026-10-25.md. Home was a chat page: a greeting,
   one "lead programme" line, the composer with three AnA run controls in its
   foot, four AnA starter prompts, four per-segment shortcuts (one opened an
   empty Program journey) and "Explore workflows", the 87-feature catalog. A
   client testing it could not tell how to start or what came next. It now
   leads with the work itself, in this order:
     1. Your projects, each opening its Project home; with none, what a
        project is, its six steps, and one way to start one.
     2. Your open items, listed: assigned to you, approvals you sign, reviews.
     3. Ask AnA: the same composer, its run controls behind "AnA settings".
     4. Your recent conversations: the conversation in progress is reached
        here now that the rail's Conversation entry is gone. */

/**
 * One row of the real programme portfolio, as GET /api/c2c/projects projects it
 * from `regulatory_programs` (server/routes/c2c/projects.ts). Home only needs
 * the identity fields; the Projects surface reads the same route for the full
 * card. Declared here rather than imported so Home does not pull the whole
 * Projects module (and its New-Project wizard) into the landing chunk.
 */
export interface HomeProgram {
  id: string;
  title: string;
  code: string;
  status: string;
  ws: string;
  stage?: string | null;
}

/** How many projects Home lists before "All projects". */
const HOME_PROJECTS = 5;
/** A project's name on its row: its title, with its code in front only when the title does not already say it. */
const rowTitle = (p: { code?: string | null; title: string }): string =>
  p.code && !p.title.includes(p.code) ? `${p.code} — ${p.title}` : p.title;

/**
 * Your projects — on Home, beneath the composer.
 *
 * Four honest states, no fixture (the rule HomeLeadProgram set on 2026-09-07,
 * when a constant named a programme the organization had never created):
 * loading, a failed read said plainly with a retry, no projects, or the
 * projects themselves. With none, it says what a project is and the six steps
 * it is worked through (PJ_LIFECYCLE, the steps Project home shows), and offers
 * one way to start. The first-run welcome's other ways to start (AnA set-up,
 * workspace discovery, starting from a document) are offered there and only
 * there: once a project exists they are not the next step.
 */
export function HomeProjects({
  onNav,
  onNewProject,
  welcome,
  onDismissWelcome,
  read,
  onRetry,
}: {
  onNav: (id: string) => void;
  onNewProject: () => void;
  welcome?: OnboardingWelcome | null;
  onDismissWelcome?: () => void;
  /** GET /api/c2c/projects, read once by Home: the setup checklist's "first project" reads the same rows. */
  read: ListState<HomeProgram>;
  onRetry: () => void;
}) {
  const { rows, loading, error, empty } = read;
  const newProjectButton = (label: string) => (
    <button type="button" className="landing-newproj" onClick={onNewProject}>
      <span className="ico">{I.plus}</span>{label}
    </button>
  );
  return (
    <section className="home-sec" aria-labelledby="home-projects-h">
      <div className="home-sec-head">
        <h2 id="home-projects-h" className="home-sec-h">Your projects</h2>
        {!loading && !error && !empty && newProjectButton('New project')}
      </div>
      {loading ? (
        <div role="status" className="home-note">Loading your projects…</div>
      ) : error ? (
        <div role="alert" className="home-note" data-tone="error">
          <span className="ico">{I.alertTriangle}</span>
          Couldn&rsquo;t load your projects. This is a failed read, not an empty list.{' '}
          <button type="button" className="home-link" onClick={onRetry}>Try again</button>
        </div>
      ) : empty ? (
        <div className="home-first" data-testid="home-first-project">
          <p className="home-first-lead">
            A project holds one regulatory filing, for example an IND or a 510(k), and everything that goes into it. You work
            through it in six steps:
          </p>
          <ol className="home-steps">
            {PJ_LIFECYCLE.map((step) => (
              <li key={step.id}>
                <span className="home-step-l">{step.label}</span>
                <span className="home-step-t">{step.blurb}</span>
              </li>
            ))}
          </ol>
          {newProjectButton('Create your first project')}
          {welcome && <HomeWelcome welcome={welcome} onNav={onNav} onDismiss={onDismissWelcome} />}
        </div>
      ) : (
        <>
          <ul className="home-list" data-testid="home-projects">
            {rows.slice(0, HOME_PROJECTS).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="home-row"
                  onClick={() => openProjectHome({ id: p.id, title: p.title, code: p.code, ws: p.ws, status: p.status }, onNav)}
                >
                  <span className="home-row-t">{rowTitle(p)}</span>
                  <span className="home-row-m">{[p.ws ? WS_LABEL[p.ws] ?? p.ws : null, p.stage, enumWords(p.status)].filter(Boolean).join(' · ')}</span>
                  <span className="home-row-go" aria-hidden="true">{I.right}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="home-link" onClick={() => onNav('projects')}>
            {rows.length > HOME_PROJECTS ? `All projects (${rows.length})` : 'All projects'}
          </button>
        </>
      )}
    </section>
  );
}

/** The first-run welcome's other ways to start, offered beside the
 *  first-project explanation and only there (HomeProjects). */
function HomeWelcome({ welcome, onNav, onDismiss }: {
  welcome: OnboardingWelcome;
  onNav: (id: string) => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="ana-welcome landing-welcome" data-testid="home-welcome">
      <div className="ana-welcome-sub">Or start another way. {welcome.subline}</div>
      <div className="ana-welcome-starters">
        {welcome.starters.map((s) => (
          <button
            key={s.label}
            type="button"
            className="ana-welcome-starter"
            onClick={() => {
              if (s.navTo) {
                onNav(s.navTo);
                return;
              }
              /* The same front door as the composer: a new conversation,
                 seeded with the starter, sent there. */
              (window as any).C2C_CONVO = { id: 'new', seed: s.prompt };
              onNav('conversation-thread');
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {onDismiss && (
        <button type="button" className="ana-welcome-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}

/**
 * Your open items (decision 9, CLIENT_JOURNEY pass 5): what is waiting for you
 * across every project, listed — the sections and deliverables assigned to
 * you, the approvals you sign, the reviews you were asked for. The same reads
 * and the same groups as the top bar's "Your work" (OpenWork.tsx), so Home and
 * the bell never disagree. Each item opens where it is worked; the board is
 * one link away, on your own tasks, asked through the same validated action
 * bus the rail uses.
 */
export function HomeTasks({ onNav }: { onNav: (id: string) => void }) {
  const { user } = useAuth();
  const scope = taskActorScope(user);
  const { myWork, queue, approvals, assigned, approvalRows } = useOpenWorkReads(true, 0);
  const openMine = () => {
    // Across every project, as the rail opens Tasks (P-131 item 1): this list spans them all.
    const res = resolveSurfaceAction('tasking.filter', { mine: 'true', project: 'all' });
    if (res.ok) applySurfaceAction(res.directive, () => onNav('tasks'));
    else onNav('tasks');
  };
  const openTask = (taskId: string) => onNav(taskTargetLocation(taskId, scope) ?? 'tasks');
  return (
    <section className="home-sec" aria-labelledby="home-tasks-h" data-testid="home-open-items">
      <div className="home-sec-head">
        <h2 id="home-tasks-h" className="home-sec-h">Your open items</h2>
        <button type="button" className="home-link" onClick={openMine}>
          Open the tasks assigned to you {I.right}
        </button>
      </div>
      <div className="home-open">
        <OpenWorkGroups workLoading={myWork.loading} workError={myWork.error} assigned={assigned}
          queue={queue.data} queueError={queue.error} approvalRows={approvalRows} approvalsError={approvals.error}
          go={onNav} openTask={openTask} />
      </div>
    </section>
  );
}
