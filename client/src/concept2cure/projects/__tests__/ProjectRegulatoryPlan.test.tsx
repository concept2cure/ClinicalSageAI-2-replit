// @vitest-environment jsdom
/**
 * The contextual regulatory sections of the project cockpit — MDX-PM-01.
 *
 * The acceptance criterion is a statement about rendering: "Selecting an MDX
 * project changes the Project center content; selecting a Biopharma project
 * restores Biopharma content without route or rail changes." The server half is
 * covered by project-plan.test.ts. This is the client half, and it pins the
 * negative case as hard as the positive one — a component that renders a stray
 * heading for a biopharma project has broken the criterion just as thoroughly as
 * one that renders nothing for a device project.
 *
 * The rest of the suite pins the places where it would be easy, and wrong, to
 * fill a gap in: a package with no linked tasks, a programme with no dated
 * milestones, and a project whose specialization nobody declared.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling surface tests.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProjectRegulatoryPlan } from '../components/ProjectRegulatoryPlan';
import type {
  ProjectRegulatoryPlanData, PlanItemView,
} from '../components/useRegulatoryContext';

afterEach(cleanup);

const section = (id: string, label: string) => ({ id, label, description: `${label} description` });

const item = (over: Partial<PlanItemView> = {}): PlanItemView => ({
  archetypeId: 'analytical_performance',
  label: 'Analytical performance',
  lifecyclePhase: 'verification',
  purpose: 'Characterize the measurement itself.',
  applicability: 'required',
  appliesWhen: null,
  applicabilityBasis: null,
  studyArchetypes: ['precision'],
  deliverables: ['Analytical performance study reports'],
  decisions: ['What is the medical decision point?'],
  references: ['CLSI EP05-A3'],
  filings: ['ivd_510k'],
  unsettledInputs: [],
  persisted: null,
  tasks: { total: 0, complete: 0, blocked: 0 },
  offPlan: false,
  ...over,
});

const plan = (over: Partial<ProjectRegulatoryPlanData> = {}): ProjectRegulatoryPlanData => ({
  context: {
    vertical: 'mdx', specialization: 'ivd_diagnostics', specializationSource: 'organization',
    primaryIndustry: 'medical_device_diagnostics', needsDeclaration: [], terminology: {},
  },
  sections: [section('plan', 'Regulatory plan')],
  packages: [item()],
  registryLimit: null,
  registryVersion: '2026.07.1',
  awaitingDeclaration: false,
  ...over,
});

// ── The acceptance criterion, both directions ────────────────────────────────

describe('a project with no contextual plan', () => {
  it('renders nothing at all when the plan is null', () => {
    // Null is what a failed or absent fetch yields. The cockpit around it must be
    // untouched — a contextual enhancement cannot be allowed to add furniture to
    // a page it could not load data for.
    const { container } = render(<ProjectRegulatoryPlan plan={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the server returns no sections', () => {
    // This is the biopharma case. The server decides it; the component must not
    // second-guess by rendering an empty shell.
    const { container } = render(
      <ProjectRegulatoryPlan plan={plan({ sections: [], packages: [] })} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing even when packages arrive without sections', () => {
    // Defensive: sections is the authority on what to show. Packages without
    // sections would be a server bug, and the right response is silence, not a
    // heading nobody asked for.
    const { container } = render(
      <ProjectRegulatoryPlan plan={plan({ sections: [], packages: [item()] })} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('an MDX project', () => {
  it('renders the section the server asked for, with its label', () => {
    render(<ProjectRegulatoryPlan plan={plan()} />);
    expect(screen.getByText('Regulatory plan')).toBeTruthy();
    expect(screen.getByText('Analytical performance')).toBeTruthy();
  });

  it('uses the server-supplied section label rather than a hardcoded one', () => {
    // The specialization vocabulary is the visible payoff of the whole context
    // architecture. A hardcoded "Studies" here would throw it away at the last
    // step.
    render(<ProjectRegulatoryPlan plan={plan({
      sections: [section('studies', 'Performance studies')],
    })} />);
    expect(screen.getByText('Performance studies')).toBeTruthy();
    expect(screen.queryByText('Clinical investigations')).toBeNull();
  });

  it('groups packages under their lifecycle phase', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      packages: [
        item({ archetypeId: 'regulatory_strategy', label: 'Regulatory strategy', lifecyclePhase: 'strategy' }),
        item(),
      ],
    })} />);
    expect(screen.getByText('Strategy')).toBeTruthy();
    expect(screen.getByText('Verification')).toBeTruthy();
  });
});

// ── The places it would be easy to fill in a gap ─────────────────────────────

describe('what it refuses to invent', () => {
  it('says no tasks are linked rather than showing 0%', () => {
    render(<ProjectRegulatoryPlan plan={plan()} />);
    expect(screen.getByText(/No tasks linked/)).toBeTruthy();
    expect(screen.queryByText(/0%/)).toBeNull();
  });

  it('counts linked tasks when there are some', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      packages: [item({ tasks: { total: 7, complete: 3, blocked: 2 } })],
    })} />);
    expect(screen.getByText(/3 of 7 linked tasks complete/)).toBeTruthy();
    expect(screen.getByText(/2 blocked/)).toBeTruthy();
  });

  it('shows an empty timeline as an absence of commitments, not a schedule', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      sections: [section('timeline', 'Timeline')],
    })} />);
    expect(screen.getByText(/No dated commitments/)).toBeTruthy();
    expect(screen.getByText(/nothing on this timeline is inferred/)).toBeTruthy();
  });

  it('lists a dated milestone only when a target date was recorded', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      sections: [section('timeline', 'Timeline')],
      packages: [item({
        persisted: {
          id: 'wp-1', status: 'in_progress', statusReason: null, ownerUserId: null,
          targetDate: '2027-03-01', completedAt: null, clientVisibility: 'internal',
        },
      })],
    })} />);
    expect(screen.getByText('2027-03-01')).toBeTruthy();
  });

  it('shows deliverables without a state nobody earned', () => {
    // This layer knows which documents a package must produce. It does not know
    // which of them exist, and a green tick would assert that it does.
    render(<ProjectRegulatoryPlan plan={plan({
      sections: [section('deliverables', 'Deliverables')],
    })} />);
    expect(screen.getByText('Analytical performance study reports')).toBeTruthy();
    expect(screen.queryByText(/complete/i)).toBeNull();
  });

  it('marks every decision open, and says why none is answered', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      sections: [section('decisions', 'Decisions')],
    })} />);
    expect(screen.getByText('What is the medical decision point?')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText(/nothing has written one for this programme/)).toBeTruthy();
  });
});

describe('conditional and off-plan packages', () => {
  it('marks a conditional package and states its condition', () => {
    // The registry refuses to decide whether a device contains software. The UI
    // has to carry that refusal through, or the question disappears.
    render(<ProjectRegulatoryPlan plan={plan({
      packages: [item({
        archetypeId: 'software_lifecycle', label: 'Software lifecycle',
        applicability: 'conditional',
        appliesWhen: 'The product contains software, or is software.',
      })],
    })} />);
    expect(screen.getByText('Conditional')).toBeTruthy();
    expect(screen.getByText(/The product contains software/)).toBeTruthy();
  });

  it('shows the recorded basis alongside the condition once answered', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      packages: [item({
        applicability: 'conditional',
        appliesWhen: 'The product contains software, or is software.',
        applicabilityBasis: 'The instrument runs embedded firmware.',
      })],
    })} />);
    expect(screen.getByText(/The instrument runs embedded firmware/)).toBeTruthy();
  });

  it('flags an off-plan package rather than hiding it', () => {
    // Real recorded work whose specialization no longer calls for it. Hiding it
    // from the plan meant to account for all of it is the worst outcome.
    render(<ProjectRegulatoryPlan plan={plan({ packages: [item({ offPlan: true })] })} />);
    expect(screen.getByText('Off plan')).toBeTruthy();
    expect(screen.getByText('Analytical performance')).toBeTruthy();
  });

  it('reports unsettled inputs without implying anything is blocked', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      packages: [item({ unsettledInputs: ['scientific_validity'] })],
    })} />);
    expect(screen.getByText(/Scientific validity, not yet recorded complete/)).toBeTruthy();
  });
});

describe('honesty about the registry itself', () => {
  it('renders what the registry does not model, on the plan section', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      registryLimit: 'Only the device constituent is modeled.',
    })} />);
    expect(screen.getByText(/Only the device constituent is modeled/)).toBeTruthy();
  });

  it('asks for a specialization instead of showing an empty plan', () => {
    // The resolver refuses to guess. This is where the refusal becomes a question
    // rather than looking like a loading failure.
    render(<ProjectRegulatoryPlan plan={plan({
      awaitingDeclaration: true,
      packages: [],
      registryLimit: 'No specialization has been declared for this project.',
    })} />);
    expect(screen.getByText(/No specialization has been declared/)).toBeTruthy();
    expect(screen.getByText(/Set the specialization/)).toBeTruthy();
  });

  it('does not render the package list while awaiting a declaration', () => {
    render(<ProjectRegulatoryPlan plan={plan({
      awaitingDeclaration: true,
      sections: [section('plan', 'Regulatory plan'), section('studies', 'Studies')],
      packages: [],
    })} />);
    expect(screen.queryByText('Studies')).toBeNull();
  });
});
