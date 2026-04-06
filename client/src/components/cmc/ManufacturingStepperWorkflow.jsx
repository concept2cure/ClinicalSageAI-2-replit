import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle, ArrowRight, Clock, AlertTriangle } from 'lucide-react';

const WORKFLOW_PHASES = [
 {
 id: 'design',
 title: 'Design',
 description: 'Process planning & infrastructure',
 color: 'bg-stone-700',
 sections: ['overview-kpis', 'sites-equipment', 'digital-twin', 'cpp-cqa']
 },
 {
 id: 'validate',
 title: 'Validate', 
 description: 'Testing & qualification',
 color: 'bg-orange-500',
 sections: ['materials-bom', 'mbr-ebr', 'validation', 'tech-transfer']
 },
 {
 id: 'publish',
 title: 'Publish',
 description: 'Final compliance & output', 
 color: 'bg-green-500',
 sections: ['deviation-capa-cc', 'pack-serial', 'ai-oversight', 'doc-outputs']
 }
];

const SECTION_STATUS = {
 'overview-kpis': { completed: 3, total: 6, status: 'in-progress' },
 'sites-equipment': { completed: 0, total: 4, status: 'not-started' },
 'digital-twin': { completed: 0, total: 5, status: 'not-started' },
 'cpp-cqa': { completed: 1, total: 8, status: 'in-progress' },
 'materials-bom': { completed: 0, total: 12, status: 'not-started' },
 'mbr-ebr': { completed: 0, total: 6, status: 'not-started' },
 'validation': { completed: 0, total: 9, status: 'not-started' },
 'tech-transfer': { completed: 0, total: 5, status: 'not-started' },
 'deviation-capa-cc': { completed: 0, total: 7, status: 'not-started' },
 'pack-serial': { completed: 0, total: 4, status: 'not-started' },
 'ai-oversight': { completed: 0, total: 3, status: 'not-started' },
 'doc-outputs': { completed: 0, total: 8, status: 'not-started' }
};

function PhaseProgress({ sections }) {
 if (!sections || !Array.isArray(sections)) {
 return { completed: 0, total: 0, percentage: 0 };
 }
 
 const totalCompleted = sections.reduce((acc, sectionId) => 
 acc + (SECTION_STATUS[sectionId]?.completed || 0), 0);
 const totalItems = sections.reduce((acc, sectionId) => 
 acc + (SECTION_STATUS[sectionId]?.total || 0), 0);
 
 return {
 completed: totalCompleted,
 total: totalItems,
 percentage: totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0
 };
}

function StatusIcon({ status }) {
 switch (status) {
 case 'completed':
 return <CheckCircle2 className="w-4 h-4 text-green-600" />;
 case 'in-progress':
 return <Clock className="w-4 h-4 text-orange-500" />;
 case 'blocked':
 return <AlertTriangle className="w-4 h-4 text-red-500" />;
 default:
 return <Circle className="w-4 h-4 text-gray-400" />;
 }
}

function StatusBadge({ status }) {
 const variants = {
 'completed': { variant: 'default', className: 'bg-green-100 text-green-800 border-green-300' },
 'in-progress': { variant: 'secondary', className: 'bg-orange-100 text-orange-800 border-orange-300' },
 'blocked': { variant: 'destructive', className: 'bg-red-100 text-red-800 border-red-300' },
 'not-started': { variant: 'outline', className: 'bg-gray-50 text-gray-600 border-gray-300' }
 };
 
 const config = variants[status] || variants['not-started'];
 
 return (
 <Badge variant={config.variant} className={config.className}>
 {status.replace('-', ' ')}
 </Badge>
 );
}

export default function ManufacturingStepperWorkflow({ 
 activePhase = 'design', 
 onPhaseChange, 
 onSectionSelect 
}) {
 const activePhaseIndex = WORKFLOW_PHASES.findIndex(p => p.id === activePhase);
 const overallProgress = PhaseProgress(WORKFLOW_PHASES.flatMap(p => p.sections));

 return (
 <div className="space-y-6">
 {/* Overall Progress Header */}
 <Card className="border-2 border-stone-200 bg-gradient-to-r from-stone-50 to-indigo-50 dark:to-indigo-950">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="text-lg text-stone-900 ">
 Manufacturing Workflow Progress
 </CardTitle>
 <p className="text-sm text-stone-700 dark:text-stone-300 mt-1">
 {overallProgress.completed} of {overallProgress.total} items completed across all phases
 </p>
 </div>
 <div className="text-right">
 <div className="text-2xl font-bold text-stone-900 ">
 {overallProgress.percentage}%
 </div>
 <Badge variant="secondary" className="bg-stone-100 text-stone-800">
 Phase {activePhaseIndex + 1} of 3
 </Badge>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <Progress 
 value={overallProgress.percentage} 
 className="h-3"
 indicatorClassName="bg-gradient-to-r from-stone-600 to-indigo-500"
 />
 </CardContent>
 </Card>

 {/* Phase Stepper */}
 <div className="flex items-center justify-between relative">
 {/* Progress Line */}
 <div className="absolute top-6 left-6 right-6 h-0.5 bg-gray-200 dark:bg-gray-700 -z-10" />
 <div 
 className="absolute top-6 left-6 h-0.5 bg-stone-700 -z-10 transition-all duration-500"
 style={{ width: `${(activePhaseIndex / (WORKFLOW_PHASES.length - 1)) * 100}%` }}
 />

 {WORKFLOW_PHASES.map((phase, index) => {
 const isActive = phase.id === activePhase;
 const isCompleted = index < activePhaseIndex;
 const progress = PhaseProgress(phase.sections);
 
 return (
 <div key={phase.id} className="flex-1 text-center relative">
 <button
 onClick={() => onPhaseChange?.(phase.id)}
 className={`w-12 h-12 rounded-full border-4 flex items-center justify-center transition-all duration-300 hover:scale-110 ${
 isCompleted 
 ? 'bg-green-500 border-green-500 text-white' 
 : isActive 
 ? `${phase.color} border-current text-white shadow-lg` 
 : 'bg-white border-gray-300 text-gray-400 dark:bg-gray-50 dark:border-gray-400'
 }`}
 data-testid={`phase-${phase.id}`}
 >
 {isCompleted ? (
 <CheckCircle2 className="w-6 h-6" />
 ) : (
 <span className="text-sm font-bold">{index + 1}</span>
 )}
 </button>
 
 <div className="mt-3">
 <h3 className={`font-semibold text-sm ${
 isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'
 }`}>
 {phase.title}
 </h3>
 <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
 {phase.description}
 </p>
 <div className="flex items-center justify-center gap-2 mt-2">
 <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
 {progress.completed}/{progress.total}
 </div>
 <Progress 
 value={progress.percentage} 
 className="h-1.5 w-16"
 indicatorClassName={phase.color}
 />
 </div>
 </div>
 </div>
 );
 })}
 </div>

 {/* Active Phase Details */}
 <Card className="border-l-4 border-l-stone-500">
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="text-base">
 {WORKFLOW_PHASES.find(p => p.id === activePhase)?.title} Phase
 </CardTitle>
 <p className="text-sm text-muted-foreground">
 {WORKFLOW_PHASES.find(p => p.id === activePhase)?.description}
 </p>
 </div>
 <Badge variant="outline" className="bg-stone-50 border-stone-200 text-stone-700">
 {WORKFLOW_PHASES.find(p => p.id === activePhase)?.sections.length} sections
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="space-y-2">
 {WORKFLOW_PHASES.find(p => p.id === activePhase)?.sections.map(sectionId => {
 const status = SECTION_STATUS[sectionId];
 const sectionNames = {
 'overview-kpis': 'Overview & KPIs',
 'sites-equipment': 'Sites & Equipment',
 'digital-twin': 'Process Digital Twin',
 'cpp-cqa': 'CPP↔CQA Matrix',
 'materials-bom': 'Materials & BOM',
 'mbr-ebr': 'MBR Editor & EBR Viewer',
 'validation': 'Validation Lifecycle',
 'tech-transfer': 'Tech Transfer & Scale-up',
 'deviation-capa-cc': 'Deviations • CAPA • CC',
 'pack-serial': 'Packaging & Serialization',
 'ai-oversight': 'AI Oversight (ex-FDA)',
 'doc-outputs': 'Document Outputs'
 };

 return (
 <button
 key={sectionId}
 onClick={() => onSectionSelect?.(sectionId)}
 className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-stone-300 hover:bg-stone-50 dark:hover:bg-stone-100 transition-colors text-left group"
 data-testid={`section-${sectionId}`}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <StatusIcon status={status?.status} />
 <div>
 <div className="font-medium text-sm group-hover:text-stone-700 dark:group-hover:text-stone-300">
 {sectionNames[sectionId]}
 </div>
 <div className="text-xs text-gray-500">
 {status?.completed || 0} of {status?.total || 0} completed
 </div>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <StatusBadge status={status?.status} />
 <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-stone-500" />
 </div>
 </div>
 <Progress 
 value={status?.total ? (status.completed / status.total * 100) : 0} 
 className="h-1.5 mt-2"
 indicatorClassName="bg-stone-700"
 />
 </button>
 );
 })}
 </CardContent>
 </Card>
 </div>
 );
}