/// <reference types="jest" />
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
// @ts-ignore - JSX module without type declarations
import SubmissionTimeline from '../components/510k/SubmissionTimeline';
// @ts-ignore - JSX module without type declarations
import WorkflowPanel from '../components/510k/WorkflowPanel';
// @ts-ignore - JSX module without type declarations
import SmartWorkflowsInterface from '../components/cmc/SmartWorkflowsInterface';
import { WorkflowTimeline as ConceptWorkflowTimeline } from '../concept2cure/components/workflow/WorkflowTimeline';
// @ts-ignore - JSX module without type declarations
import { WorkflowTimeline as CoauthorWorkflowTimeline } from '../components/coauthor/WorkflowTimeline';
import { DocumentWorkspace } from '../concept2cure/components/intelligentDocs/DocumentWorkspace';
import { DocumentSherpa } from '../concept2cure/components/intelligentDocs/DocumentSherpa';
import { ComplianceGuardian } from '../concept2cure/components/intelligentDocs/ComplianceGuardian';
import { CrossModuleDataBridge } from '../concept2cure/components/intelligentDocs/CrossModuleDataBridge';
import { AutoTraceabilityEngine } from '../concept2cure/components/intelligentDocs/AutoTraceabilityEngine';
import { SourceSuggestionPanel, InlineSuggestionTooltip } from '../concept2cure/components/intelligentDocs/SourceSuggestionPanel';
import { ClaimIndicator, ClaimSummaryStrip, ClaimTooltip } from '../concept2cure/components/intelligentDocs/SmartClaimHighlighter';

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/components/ui/toaster', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@tiptap/react', () => ({
  __esModule: true,
  useEditor: () => ({
    getHTML: () => '<p>Mock content</p>',
    getText: () => 'The clinical study demonstrated 95% accuracy.',
    commands: { setContent: jest.fn() },
  }),
  EditorContent: () => <div data-testid="editor-content" />,
}));

jest.mock('@tiptap/starter-kit', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('@tiptap/extension-highlight', () => ({
  __esModule: true,
  default: { configure: jest.fn(() => ({})) },
}));

jest.mock('@tiptap/extension-placeholder', () => ({
  __esModule: true,
  default: { configure: jest.fn(() => ({})) },
}));

jest.mock('@tiptap/extension-character-count', () => ({
  __esModule: true,
  default: { configure: jest.fn(() => ({})) },
}));

jest.mock('react-dnd', () => ({
  __esModule: true,
  DndProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-provider">{children}</div>,
  useDrag: () => [{}, jest.fn()],
  useDrop: () => [{}, jest.fn()],
}));

jest.mock('react-dnd-html5-backend', () => ({
  __esModule: true,
  HTML5Backend: {},
}));

jest.mock('@/lib/queryClient', () => ({
  apiRequest: jest.fn(() => Promise.resolve({
    json: () => Promise.resolve({ data: [] }),
  })),
}));

jest.mock('@/contexts/TenantContext', () => ({
  useTenantContext: () => ({ currentOrganization: { id: 'org-1' } }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: [] }, isLoading: false, refetch: jest.fn() }),
  useMutation: () => ({ mutate: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('../components/cer/DeviceProfileList', () => ({
  __esModule: true,
  default: () => <div data-testid="device-profile-list" />,
}));

jest.mock('../components/510k/PredicateFinderPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="predicate-finder-panel" />,
}));

jest.mock('../components/510k/EquivalenceBuilderPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="equivalence-builder-panel" />,
}));

jest.mock('../components/510k/ComplianceCheckPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="compliance-check-panel" />,
}));

jest.mock('../components/510k/ReportGenerator', () => ({
  __esModule: true,
  default: () => <div data-testid="report-generator" />,
}));

jest.mock('../components/510k/ESTARBuilderPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="estar-builder-panel" />,
}));

jest.mock('../components/510k/ManagerSignOffDialog', () => ({
  __esModule: true,
  default: () => <div data-testid="manager-signoff-dialog" />,
}));

jest.mock('../components/510k/AuditTrailPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="audit-trail-panel" />,
}));

jest.mock('../services/ManagerSignOffService', () => ({
  __esModule: true,
  default: {
    getApprovalHistory: jest.fn(() => ({})),
    getPendingApprovals: jest.fn(() => []),
    recordApproval: jest.fn(),
    isStageApproved: jest.fn(() => false),
  },
}));

jest.mock('../services/FDA510kService', () => ({
  FDA510kService: {},
}));

jest.mock('../components/cmc/WorkflowTemplateBuilder', () => ({
  __esModule: true,
  default: () => <div data-testid="workflow-template-builder" />,
}));

jest.mock('../components/cmc/WorkflowCollaboration', () => ({
  __esModule: true,
  default: () => <div data-testid="workflow-collaboration" />,
}));

jest.mock('../components/510k/GuidedTooltip', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Step 4 click-throughs', () => {
  test('SubmissionTimeline allows step selection', () => {
    const onSelectStep = jest.fn();
    const steps = [
      { id: 1, title: 'Start', status: 'complete' },
      { id: 2, title: 'Review', status: 'in-progress' },
    ];

    render(
      <SubmissionTimeline
        currentStep={1}
        steps={steps}
        onSelectStep={onSelectStep}
      />
    );

    const stepButton = screen.getByTestId('timeline-step-1');
    fireEvent.click(stepButton);
    expect(onSelectStep).toHaveBeenCalledWith(1);
  });

  test('WorkflowPanel renders tabs and primary action', () => {
    render(
      <WorkflowPanel
        projectId="proj-1"
        organizationId="org-1"
        deviceProfile={{ id: 'device-1', deviceName: 'Test Device' }}
        setDeviceProfile={jest.fn()}
        onComplianceChange={jest.fn()}
        onPredicatesFound={jest.fn()}
        onEquivalenceComplete={jest.fn()}
        onComplianceComplete={jest.fn()}
        onSubmissionReady={jest.fn()}
      />
    );

    expect(screen.getByTestId('tab-workflow')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-predicates'));

    const continueButton = screen.getByTestId('button-continue-to-predicate');
    fireEvent.click(continueButton);
  });

  test('SmartWorkflowsInterface responds to key actions', () => {
    render(<SmartWorkflowsInterface drugName="Test Drug" structuredInputs={{}} />);

    const newWorkflowButton = screen.getByTestId('button-new-workflow');
    fireEvent.click(newWorkflowButton);
  });

  test('Concept workflow timeline steps are clickable', () => {
    const steps = [
      { id: 'step-1', name: 'Draft', status: 'IN_PROGRESS', stepType: 'TASK', order: 1, isRequired: true },
      { id: 'step-2', name: 'Review', status: 'READY', stepType: 'REVIEW', order: 2, isRequired: true },
    ];

    render(
      <ConceptWorkflowTimeline
        steps={steps}
        progressPercent={50}
        assetState="REVIEW"
        onStepClick={jest.fn()}
        showPhases={false}
      />
    );

    const stepButton = screen.getByTestId('button-workflow-step-step-1');
    fireEvent.click(stepButton);
  });

  test('Coauthor workflow timeline primary controls are clickable', () => {
    render(<CoauthorWorkflowTimeline />);

    fireEvent.click(screen.getByTestId('button-view-board'));
    fireEvent.click(screen.getByTestId('button-refresh'));
  });
});

describe('Step 5 click-throughs', () => {
  test('DocumentWorkspace command center actions are clickable', () => {
    render(
      <DocumentWorkspace
        document={{
          id: 'doc-1',
          title: 'Test Doc',
          type: '510k_summary',
          status: 'draft',
          content: 'The clinical study demonstrated 95% accuracy.',
          lastEditedBy: 'User',
          lastEditedAt: new Date(),
          completionPercent: 10,
          nextActions: [],
          blockers: [],
          complianceStatus: 'needs-attention',
          complianceScore: 78,
        }}
        submissionType="510K"
        projectId="proj-1"
        onSave={jest.fn()}
        onExport={jest.fn()}
        onRequestReview={jest.fn()}
        enableAutoSave={false}
      />
    );

    fireEvent.click(screen.getByTestId('button-command-link-sources'));
    fireEvent.click(screen.getByTestId('button-panel-tab-sources'));
    fireEvent.click(screen.getByTestId('button-hide-panel'));
  });

  test('DocumentSherpa action buttons trigger', () => {
    render(
      <DocumentSherpa
        document={{
          id: 'doc-1',
          title: 'Test Doc',
          type: '510k_summary',
          status: 'draft',
          content: 'Draft content',
          lastEditedBy: 'User',
          lastEditedAt: new Date(),
          completionPercent: 40,
          nextActions: [],
          blockers: [],
          complianceStatus: 'needs-attention',
          complianceScore: 60,
        }}
        submissionType="510K"
        workflowStep={2}
        totalSteps={5}
        dataBridges={[{ id: 'bridge-1', sourceModule: 'predicate_finder', status: 'available', itemCount: 5, preview: 'Predicate data' }]}
        complianceScore={60}
        totalClaims={4}
        supportedClaims={1}
        unsupportedClaims={3}
        pendingReviews={1}
        onGuidanceAction={jest.fn()}
        onBlockerAction={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('button-next-best-action-guide-claims'));
    fireEvent.click(screen.getByTestId('button-upcoming-action-guide-data'));
  });

  test('ComplianceGuardian compact toggle works', () => {
    render(
      <ComplianceGuardian
        document={{ id: 'doc-1', title: 'Test Doc', content: 'Short content', complianceStatus: 'needs-attention', complianceScore: 70 }}
        submissionType="510K"
        totalClaims={2}
        supportedClaims={1}
        connectedModules={1}
        hasPendingReviews={false}
        hasSignatures={false}
        compact
      />
    );

    fireEvent.click(screen.getByTestId('button-compliance-compact-toggle'));
  });

  test('CrossModuleDataBridge buttons are clickable', () => {
    render(
      <CrossModuleDataBridge
        projectId="proj-1"
        submissionType="510K"
        predicateDevices={[{ id: 'pred-1' }]}
        literatureData={[]}
        cmcData={[]}
        onNavigateToModule={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('button-bridge-sync-predicate_finder'));
    fireEvent.click(screen.getByTestId('button-bridge-connect-literature_search'));
    fireEvent.click(screen.getByTestId('button-bridge-connect-vault'));
  });

  test('AutoTraceabilityEngine detects claims and supports actions', () => {
    jest.useFakeTimers();

    render(
      <AutoTraceabilityEngine
        content="The clinical study demonstrated 95% accuracy."
        availableSources={[{
          id: 'source-1',
          title: 'Clinical Study A',
          sourceType: 'clinical_study',
          citation: 'Study A',
          relevanceScore: 92,
          keyExcerpt: 'demonstrated 95% accuracy',
          dataModule: 'clinical_trials',
          isLinked: false,
        }]}
        onClaimsDetected={jest.fn()}
        onLinkCreated={jest.fn()}
        onBulkLink={jest.fn()}
        onSourcePreview={jest.fn()}
        autoDetect
      />
    );

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    const bulkLinkButton = screen.getByTestId('button-bulk-link-confirm');
    fireEvent.click(bulkLinkButton);

    jest.useRealTimers();
  });

  test('SourceSuggestionPanel and inline tooltip actions fire', async () => {
    const claim = {
      id: 'claim-1',
      text: 'The device is safe.',
      claimType: 'safety',
    };

    const suggestions = [
      {
        sourceId: 'source-1',
        sourceTitle: 'Safety Study',
        matchConfidence: 88,
        relevantExcerpt: 'No adverse events',
        sourceType: 'clinical_study',
        matchReason: 'Direct evidence',
      },
      {
        sourceId: 'source-2',
        sourceTitle: 'Literature Review',
        matchConfidence: 82,
        relevantExcerpt: 'Supports safety profile',
        sourceType: 'literature',
        matchReason: 'Corroborating evidence',
      },
    ];

    render(
      <SourceSuggestionPanel
        claim={claim as any}
        suggestions={suggestions as any}
        dataBridges={[{ moduleType: 'clinical_trials', status: 'connected' }] as any}
        onLinkSource={jest.fn(() => Promise.resolve())}
        onClose={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('button-link-source-source-1'));
    });
    fireEvent.click(screen.getByTestId('button-source-filter-all'));
    fireEvent.click(screen.getByTestId('button-close-source-panel'));

    render(
      <InlineSuggestionTooltip
        suggestion={suggestions[0] as any}
        position={{ x: 10, y: 10 }}
        onLink={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('button-link-inline-source-source-1'));
    fireEvent.click(screen.getByTestId('button-dismiss-inline-suggestion-source-1'));
  });

  test('Smart claim indicators are clickable', () => {
    const claim = {
      id: 'claim-1',
      text: 'Clinical study demonstrated efficacy',
      claimType: 'clinical',
      sourceStatus: 'needs-source',
    };

    render(<ClaimIndicator claim={claim as any} onClick={jest.fn()} />);
    fireEvent.click(screen.getByTestId('button-claim-indicator-claim-1'));

    render(
      <ClaimSummaryStrip
        claims={[claim as any]}
        onClaimClick={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('button-claim-needs-source'));

    render(
      <ClaimTooltip
        claim={{ ...claim, linkedSources: [] } as any}
        position={{ x: 10, y: 10 }}
        onLinkClick={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('button-claim-link-source-claim-1'));
    fireEvent.click(screen.getByTestId('button-dismiss-claim-tooltip-claim-1'));
  });
});
