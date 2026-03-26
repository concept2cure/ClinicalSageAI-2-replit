import { BarChart3, CheckCircle2, ShieldAlert, SquareChartGantt, Users } from 'lucide-react';

export const reportModules = [
  { id: 'executive', label: 'Executive Intelligence', icon: BarChart3 },
  { id: 'project', label: 'Project Performance', icon: SquareChartGantt },
  { id: 'risk', label: 'Risk & Controls (KRI)', icon: ShieldAlert },
  { id: 'operations', label: 'Task & Delivery Ops', icon: CheckCircle2 },
  { id: 'client', label: 'Client Reporting Packs', icon: Users },
];

export const moduleFocus = {
  executive: 'Board/leadership report surface with portfolio KPIs and forecast confidence.',
  project: 'Project-level burnup, delivery health, and milestone confidence by engagement.',
  risk: 'KRI and control status for escalations, compliance drift, and mitigation tracking.',
  operations: 'Cross-team delivery execution and completed vs blocked task throughput.',
  client: 'Client-ready pack templates and examples for paid user tiers.',
};

export const paidPersonaReports = {
  startup: [
    'Burn-down vs milestone confidence report',
    'Investor update snapshot (weekly)',
    'Regulatory readiness trendline',
    'Program velocity and blocker digest',
  ],
  growth: [
    'Program portfolio KPI dashboard',
    'Vendor/cost variance report',
    'Audit readiness and CAPA closure report',
    'Client delivery SLA performance report',
  ],
  enterprise: [
    'Cross-program PMO command center report',
    'KRI heatmap + corrective action pack',
    'Board-level operating rhythm report',
    'Global portfolio and regional compliance pack',
  ],
};

export const clientPackExamples = [
  { name: 'Executive Weekly Summary', module: 'executive', audience: 'C-Suite', cadence: 'Weekly' },
  { name: 'Portfolio KPI / KRI Dashboard', module: 'risk', audience: 'PMO + QA', cadence: 'Daily' },
  { name: 'Project Status + Milestones', module: 'project', audience: 'Client Sponsors', cadence: 'Weekly' },
  { name: 'Task Completion & Delays', module: 'operations', audience: 'Delivery Leads', cadence: 'Daily' },
  { name: 'Client Quarterly Review Pack', module: 'client', audience: 'External Clients', cadence: 'Quarterly' },
];

export const reportFormatOptions = [
  { id: 'pdf', label: 'PDF (Client-ready narrative)' },
  { id: 'xlsx', label: 'XLSX (Data workbook)' },
  { id: 'pptx', label: 'PPTX (Executive slides)' },
];

export const launchPolishChecklist = [
  'Consistent naming for KPI, KRI, and Project status cards',
  'Audience and cadence labels on all client-facing report templates',
  'Live data provenance badges (Demo vs API) always visible',
  'No-empty-state examples for each paid persona tier',
];

export const starterProjects = [
  { id: 'PJT-401', name: 'BTX-112 IND', health: 87, tasksDone: 138, tasksTotal: 161, risk: 'Low' },
  { id: 'PJT-577', name: 'OncoLead CER v2', health: 71, tasksDone: 92, tasksTotal: 128, risk: 'Medium' },
  { id: 'PJT-812', name: 'CMC Tech Transfer', health: 58, tasksDone: 64, tasksTotal: 123, risk: 'High' },
  { id: 'PJT-990', name: 'EU MDR Remediation', health: 79, tasksDone: 75, tasksTotal: 97, risk: 'Medium' },
];

export const starterTaskLedger = [
  { stream: 'Clinical', completed: 42, inProgress: 10, blocked: 3 },
  { stream: 'Regulatory', completed: 37, inProgress: 8, blocked: 2 },
  { stream: 'CMC', completed: 24, inProgress: 7, blocked: 5 },
  { stream: 'Quality', completed: 18, inProgress: 5, blocked: 1 },
];

export const getRiskBadgeClassName = riskLevel => {
  if (riskLevel === 'High') return 'bg-red-100 text-red-700';
  if (riskLevel === 'Medium') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
};
