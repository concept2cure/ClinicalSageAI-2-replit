/**
 * @fileoverview Concept2Cure Unified Workspace Demo
 * @module concept2cure/demo/UnifiedWorkspaceDemo
 * @version 1.0.0
 *
 * @description
 * Complete demonstration of the industry-aligned workspace system.
 * Shows how all components work together for real regulatory workflows.
 *
 * This demo showcases:
 * - Session restoration (Claude.ai style)
 * - Industry-specific navigation (Biotech/Pharma/CRO)
 * - Role-based dashboards
 * - eCTD dossier navigation
 * - Medical writer document queue
 * - Regulatory calendar with PDUFA dates
 * - Team collaboration features
 * - Quick start project wizard
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

// Import all industry components
import { IndustryWorkspaceShell, type WorkspaceView, type CurrentUser } from '../components/shell/IndustryWorkspaceShell';
import type { IndustryMode } from '../types/workspace';
import { IndustryRoleDashboard } from '../components/dashboards/IndustryRoleDashboard';
import { RegulatoryCalendar, type RegulatoryEvent } from '../components/calendar/RegulatoryCalendar';
import { DossierNavigator, type DossierNode } from '../components/submission/DossierNavigator';
import { MedicalWriterQueue, type DocumentTask } from '../components/writing/MedicalWriterQueue';
import { CROResourceDashboard, type CROClient, type CROProject, type ResourceAllocation, type ChangeOrder } from '../components/cro/CROResourceDashboard';
import { TeamCollaborationPanel, type TeamMember, type ActivityItem, type ActiveSession } from '../components/collaboration/TeamCollaborationPanel';
import { QuickStartWizard, type WizardData } from '../components/wizard/QuickStartWizard';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_USER: CurrentUser = {
  id: 'user-1',
  name: 'Dr. Sarah Chen',
  email: 'sarah.chen@concept2cure.com',
  role: 'ra_lead',
  department: 'Regulatory Affairs',
  industryMode: 'biotech',
};

const MOCK_NOTIFICATIONS = [
  {
    id: '1',
    type: 'deadline' as const,
    title: 'PDUFA Date Approaching',
    message: 'ABC-123 NDA review decision due in 14 days',
    timestamp: new Date().toISOString(),
    read: false,
  },
  {
    id: '2',
    type: 'mention' as const,
    title: 'New Comment',
    message: '@Sarah mentioned you in CSR Section 11',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    read: false,
  },
  {
    id: '3',
    type: 'review' as const,
    title: 'Review Complete',
    message: 'QC review completed for Protocol Amendment 2',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    read: true,
  },
];

const MOCK_CALENDAR_EVENTS: RegulatoryEvent[] = [
  {
    id: 'pdufa-1',
    title: 'ABC-123 NDA PDUFA Date',
    type: 'pdufa',
    date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    allDay: true,
    priority: 'critical',
    productName: 'ABC-123',
    region: 'US',
    submissionType: 'NDA',
  },
  {
    id: 'meeting-1',
    title: 'Pre-NDA Meeting with FDA',
    type: 'meeting',
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    allDay: false,
    priority: 'high',
    productName: 'XYZ-456',
    attendees: ['Dr. Chen', 'Dr. Smith', 'John Doe'],
  },
  {
    id: 'commitment-1',
    title: 'PMC Study Report Due',
    type: 'commitment',
    date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    allDay: true,
    priority: 'high',
    productName: 'DEF-789',
    description: 'Post-marketing commitment: 5-year pediatric study results',
  },
  {
    id: 'filing-1',
    title: 'IND Annual Report',
    type: 'internal',
    date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    allDay: true,
    priority: 'medium',
    productName: 'LMN-101',
  },
];

const MOCK_DOSSIER: DossierNode[] = [
  {
    id: 'm1',
    name: 'Module 1: Administrative Information',
    type: 'module',
    children: [
      { id: 'm1.1', name: '1.1 Forms', type: 'section', status: 'final' },
      { id: 'm1.2', name: '1.2 Cover Letters', type: 'section', status: 'review' },
      { id: 'm1.3', name: '1.3 Administrative Information', type: 'section', status: 'drafting' },
    ],
  },
  {
    id: 'm2',
    name: 'Module 2: Summaries',
    type: 'module',
    children: [
      { id: 'm2.3', name: '2.3 Quality Overall Summary', type: 'section', status: 'review' },
      { id: 'm2.5', name: '2.5 Clinical Overview', type: 'section', status: 'drafting' },
      { id: 'm2.7', name: '2.7 Clinical Summary', type: 'section', status: 'not_started' },
    ],
  },
  {
    id: 'm3',
    name: 'Module 3: Quality',
    type: 'module',
    children: [
      { id: 'm3.2.s', name: '3.2.S Drug Substance', type: 'section', status: 'qc' },
      { id: 'm3.2.p', name: '3.2.P Drug Product', type: 'section', status: 'review' },
    ],
  },
  {
    id: 'm5',
    name: 'Module 5: Clinical Study Reports',
    type: 'module',
    children: [
      { id: 'm5.3.5.1', name: '5.3.5.1 Study ABC-001', type: 'document', status: 'final' },
      { id: 'm5.3.5.2', name: '5.3.5.2 Study ABC-002', type: 'document', status: 'qc' },
    ],
  },
];

const MOCK_WRITING_TASKS: DocumentTask[] = [
  {
    id: 'doc-1',
    title: 'Clinical Study Report - ABC-001',
    documentType: 'csr',
    productName: 'ABC-123',
    studyId: 'ABC-001',
    stage: 'qc',
    progress: 85,
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    assignedWriter: 'Dr. Sarah Chen',
    priority: 'high',
    wordCount: 45000,
    pageCount: 120,
    pendingComments: 3,
  },
  {
    id: 'doc-2',
    title: 'Investigator Brochure v4.0',
    documentType: 'ib',
    productName: 'XYZ-456',
    stage: 'sme_review',
    progress: 60,
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    assignedWriter: 'Dr. Sarah Chen',
    priority: 'medium',
    wordCount: 18000,
    pageCount: 55,
  },
  {
    id: 'doc-3',
    title: 'Clinical Overview (CTD 2.5)',
    documentType: 'ctd_2_5',
    productName: 'ABC-123',
    stage: 'draft',
    progress: 25,
    dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    assignedWriter: 'Dr. Sarah Chen',
    priority: 'critical',
    wordCount: 8000,
    targetWordCount: 30000,
  },
];

const MOCK_TEAM: TeamMember[] = [
  { id: 't1', name: 'Dr. Sarah Chen', initials: 'SC', role: 'RA Lead', department: 'Regulatory Affairs', status: 'online' },
  { id: 't2', name: 'John Smith', initials: 'JS', role: 'Medical Writer', department: 'Medical Writing', status: 'online', currentDocument: 'CSR ABC-001' },
  { id: 't3', name: 'Emily Davis', initials: 'ED', role: 'CMC Lead', department: 'CMC', status: 'away' },
  { id: 't4', name: 'Michael Brown', initials: 'MB', role: 'QA Manager', department: 'Quality', status: 'busy' },
  { id: 't5', name: 'Lisa Wang', initials: 'LW', role: 'Clinical Ops', department: 'Clinical', status: 'offline' },
];

const MOCK_ACTIVITIES: ActivityItem[] = [
  {
    id: 'a1',
    type: 'document_edit',
    actor: MOCK_TEAM[1],
    timestamp: new Date(Date.now() - 300000).toISOString(),
    documentName: 'CSR ABC-001',
    message: 'Updated Section 11 - Safety Results',
  },
  {
    id: 'a2',
    type: 'comment_added',
    actor: MOCK_TEAM[3],
    timestamp: new Date(Date.now() - 900000).toISOString(),
    documentName: 'Protocol Amendment 2',
    message: 'Please review the eligibility criteria changes',
  },
  {
    id: 'a3',
    type: 'review_completed',
    actor: MOCK_TEAM[2],
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    documentName: 'Module 3.2.P Drug Product',
  },
];

const MOCK_SESSIONS: ActiveSession[] = [
  {
    documentId: 'csr-001',
    documentName: 'Clinical Study Report ABC-001',
    documentType: 'CSR',
    participants: [MOCK_TEAM[0], MOCK_TEAM[1]],
    startedAt: new Date(Date.now() - 1800000).toISOString(),
    lastActivity: new Date(Date.now() - 60000).toISOString(),
  },
];

// CRO Mock Data
const MOCK_CRO_CLIENTS: CROClient[] = [
  {
    id: 'client-1',
    name: 'PharmaCo Inc.',
    tier: 'enterprise',
    msaNumber: 'MSA-2024-001',
    msaEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    activeProjects: 4,
    totalContractValue: 2500000,
    revenueYTD: 1800000,
    satisfaction: 85,
  },
  {
    id: 'client-2',
    name: 'BioTech Innovations',
    tier: 'strategic',
    msaNumber: 'MSA-2024-002',
    msaEndDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    activeProjects: 2,
    totalContractValue: 850000,
    revenueYTD: 420000,
    satisfaction: 92,
  },
];

const MOCK_CRO_PROJECTS: CROProject[] = [
  {
    id: 'proj-1',
    clientId: 'client-1',
    clientName: 'PharmaCo Inc.',
    sowNumber: 'SOW-2024-001',
    projectName: 'Product X NDA Support',
    productName: 'Product X',
    studyPhase: 'NDA',
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    targetEndDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    contractValue: 1200000,
    billedToDate: 650000,
    burnRate: 54,
    hoursConsumed: 2400,
    hoursBudgeted: 4500,
    status: 'active',
    healthScore: 82,
    projectManager: 'John Smith',
    teamSize: 6,
  },
  {
    id: 'proj-2',
    clientId: 'client-2',
    clientName: 'BioTech Innovations',
    sowNumber: 'SOW-2024-003',
    projectName: 'IND Package Development',
    productName: 'BT-101',
    studyPhase: 'IND',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    targetEndDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    contractValue: 450000,
    billedToDate: 120000,
    burnRate: 27,
    hoursConsumed: 600,
    hoursBudgeted: 2200,
    status: 'active',
    healthScore: 95,
    projectManager: 'Emily Davis',
    teamSize: 4,
  },
];

const MOCK_RESOURCES: ResourceAllocation[] = [
  {
    resourceId: 'res-1',
    resourceName: 'John Smith',
    role: 'Senior Medical Writer',
    department: 'Medical Writing',
    totalHours: 160,
    allocatedHours: 145,
    billableHours: 140,
    utilizationRate: 91,
    assignments: [
      { projectId: 'proj-1', projectName: 'Product X NDA Support', clientName: 'PharmaCo Inc.', allocatedHours: 80, startDate: '', endDate: '' },
      { projectId: 'proj-2', projectName: 'IND Package Development', clientName: 'BioTech Innovations', allocatedHours: 65, startDate: '', endDate: '' },
    ],
  },
  {
    resourceId: 'res-2',
    resourceName: 'Emily Davis',
    role: 'Regulatory Specialist',
    department: 'Regulatory Affairs',
    totalHours: 160,
    allocatedHours: 120,
    billableHours: 115,
    utilizationRate: 75,
    assignments: [
      { projectId: 'proj-1', projectName: 'Product X NDA Support', clientName: 'PharmaCo Inc.', allocatedHours: 120, startDate: '', endDate: '' },
    ],
  },
];

const MOCK_CHANGE_ORDERS: ChangeOrder[] = [
  {
    id: 'co-1',
    projectId: 'proj-1',
    projectName: 'Product X NDA Support',
    clientName: 'PharmaCo Inc.',
    type: 'scope_change',
    status: 'pending_approval',
    description: 'Additional Module 2.7 sections requested',
    financialImpact: 85000,
    hoursImpact: 320,
    requestedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    requestedBy: 'Client',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const DashboardView: React.FC<{ user: CurrentUser }> = ({ user }) => (
  <div className="p-6">
    <IndustryRoleDashboard role={user.role} userName={user.name} industryMode={user.industryMode} />
  </div>
);

const CalendarView: React.FC = () => (
  <RegulatoryCalendar
    events={MOCK_CALENDAR_EVENTS}
    onEventClick={(event) => console.log('Event clicked:', event)}
    onAddEvent={(date) => console.log('Add event for:', date)}
    className="h-full"
  />
);

const SubmissionsView: React.FC = () => (
  <DossierNavigator
    nodes={MOCK_DOSSIER}
    submissionName="ABC-123 NDA"
    submissionType="NDA"
    onNodeSelect={(node) => console.log('Node selected:', node)}
    className="h-full"
  />
);

const DocumentsView: React.FC<{ user: CurrentUser }> = ({ user }) => (
  <MedicalWriterQueue
    tasks={MOCK_WRITING_TASKS}
    currentUser={user.name}
    onTaskClick={(task) => console.log('Task clicked:', task)}
    onStartWriting={(task) => console.log('Start writing:', task)}
    className="h-full"
  />
);

const TeamView: React.FC<{ user: CurrentUser }> = ({ user }) => (
  <div className="flex h-full">
    <div className="flex-1 p-6 bg-stone-50">
      <h2 className="text-base font-medium text-stone-900 mb-4">Team Workspace</h2>
      <p className="text-stone-500">Select a team member to collaborate or view activity.</p>
    </div>
    <TeamCollaborationPanel
      teamMembers={MOCK_TEAM}
      activities={MOCK_ACTIVITIES}
      activeSessions={MOCK_SESSIONS}
      currentUserId={user.id}
      onMemberClick={(member) => console.log('Member clicked:', member)}
      onActivityClick={(activity) => console.log('Activity clicked:', activity)}
      className="w-80"
    />
  </div>
);

const ClientsView: React.FC = () => (
  <CROResourceDashboard
    clients={MOCK_CRO_CLIENTS}
    projects={MOCK_CRO_PROJECTS}
    resources={MOCK_RESOURCES}
    changeOrders={MOCK_CHANGE_ORDERS}
    onProjectClick={(project) => console.log('Project clicked:', project)}
    onResourceClick={(resource) => console.log('Resource clicked:', resource)}
    className="h-full"
  />
);

const ResourcesView: React.FC = () => (
  <CROResourceDashboard
    clients={MOCK_CRO_CLIENTS}
    projects={MOCK_CRO_PROJECTS}
    resources={MOCK_RESOURCES}
    changeOrders={MOCK_CHANGE_ORDERS}
    onProjectClick={(project) => console.log('Project clicked:', project)}
    onResourceClick={(resource) => console.log('Resource clicked:', resource)}
    className="h-full"
  />
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DEMO COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const UnifiedWorkspaceDemo: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<CurrentUser>(MOCK_USER);
  const [currentView, setCurrentView] = useState<WorkspaceView>('dashboard');
  const [showWizard, setShowWizard] = useState(false);
  
  const handleViewChange = useCallback((view: WorkspaceView) => {
    setCurrentView(view);
  }, []);
  
  const handleNewProject = useCallback(() => {
    setShowWizard(true);
  }, []);
  
  const handleWizardComplete = useCallback((data: WizardData) => {
    console.log('Project created:', data);
    setShowWizard(false);
    // In real app, create project and navigate to it
  }, []);
  
  const handleModeChange = useCallback((mode: IndustryMode) => {
    setCurrentUser(prev => ({ ...prev, industryMode: mode }));
  }, []);
  
  // Render the current view
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView user={currentUser} />;
      case 'calendar':
        return <CalendarView />;
      case 'submissions':
        return <SubmissionsView />;
      case 'documents':
        return <DocumentsView user={currentUser} />;
      case 'team':
        return <TeamView user={currentUser} />;
      case 'clients':
        return <ClientsView />;
      case 'resources':
        return <ResourcesView />;
      case 'projects':
        return (
          <div className="p-6">
            <h2 className="text-base font-medium">Projects View</h2>
            <p className="text-stone-500 mt-2">Product/portfolio management view</p>
          </div>
        );
      default:
        return (
          <div className="p-6">
            <h2 className="text-base font-medium">{currentView} View</h2>
            <p className="text-stone-500 mt-2">Coming soon...</p>
          </div>
        );
    }
  };
  
  return (
    <div className="h-screen">
      {/* Mode Switcher (Demo Only) */}
      <div className="fixed top-4 right-4 z-50 bg-white rounded-lg shadow-sm border border-stone-200 p-2 flex gap-2">
        {([
          'biotech',
          'pharma',
          'cro',
          'medtech',
          'academic',
          'regulatory',
          'medical_writing',
        ] as IndustryMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => handleModeChange(mode)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
              currentUser.industryMode === mode
                ? 'bg-stone-800 text-white'
                : 'text-stone-600 hover:bg-stone-100'
            )}
          >
            {mode}
          </button>
        ))}
      </div>
      
      {/* Main Shell */}
      <IndustryWorkspaceShell
        currentUser={currentUser}
        notifications={MOCK_NOTIFICATIONS}
        onViewChange={handleViewChange}
        onNewProject={handleNewProject}
        onSearch={(q) => console.log('Search:', q)}
      >
        {renderView()}
      </IndustryWorkspaceShell>
      
      {/* Quick Start Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-sm w-[800px] h-[600px] overflow-hidden">
            <QuickStartWizard
              onComplete={handleWizardComplete}
              onCancel={() => setShowWizard(false)}
              initialData={{ industryMode: currentUser.industryMode }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedWorkspaceDemo;
