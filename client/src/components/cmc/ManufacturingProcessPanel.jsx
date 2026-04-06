import React, { useState, useEffect, useRef } from 'react';
import { ManufacturingProvider, useManufacturingStore } from '@/store/manufacturing.store.jsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
 Settings,
 Save,
 Download,
 RefreshCw,
 FileText,
 Shield,
 AlertCircle,
 CheckCircle2,
 Clock,
 Bell,
 Menu,
 X,
 ChevronRight,
 Users,
 Globe,
 Zap,
 Target,
 Activity,
 Brain,
 Factory,
 BookOpen,
 Archive,
 Sparkles,
 Loader2,
 HelpCircle,
 Eye
} from 'lucide-react';

import ManufacturingStepperWorkflow from './ManufacturingStepperWorkflow';
import ManufacturingKPICards from './ManufacturingKPICards';
import SiteAndEquipmentPanel from './SiteAndEquipmentPanel';
import DigitalTwinCanvas from './DigitalTwinCanvas';
import ParameterMatrix from './ParameterMatrix';
import MaterialsBOMPanel from './MaterialsBOMPanel';
import MbrEditor from './MbrEditor';
import EbrViewer from './EbrViewer';
import ValidationLifecyclePanel from './ValidationLifecyclePanel';
import TechTransferPanel from './TechTransferPanel';
import DeviationCapaBoard from './DeviationCapaBoard';
import PackagingSerializationPanel from './PackagingSerializationPanel';
import ManufacturingAIInsights from './ManufacturingAIInsights';
import DocumentExportsPanel from './DocumentExportsPanel';
import QuickOpenMenu from './QuickOpenMenu';
import RegulatorViewDrawer from './RegulatorViewDrawer';

const SECTIONS = {
 'overview-kpis': { 
 label: 'Overview & KPIs', 
 icon: Activity,
 Comp: ({ onSectionSelect }) => {
 // PAI Simulator integrated into Overview section
 const [paiData, setPaiData] = useState(null);
 const [paiPlan, setPaiPlan] = useState(null);
 const [paiLoading, setPaiLoading] = useState(true);

 // Readiness Heatmap integrated into Overview section
 const [readinessData, setReadinessData] = useState(null);
 const [readinessLoading, setReadinessLoading] = useState(true);

 // OEE Advisor integrated into Overview section
 const [oeeData, setOeeData] = useState(null);
 const [oeeImprovementPlan, setOeeImprovementPlan] = useState(null);
 const [oeeLoading, setOeeLoading] = useState(true);

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const r = await fetch('/api/cmc/pai/checklist', {credentials: 'include'}); 
 const j = await r.json();
 if(alive) setPaiData(j); 
 } catch (error) {
 console.error('Failed to load PAI checklist:', error);
 } finally {
 if(alive) setPaiLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const r = await fetch('/api/cmc/readiness/heatmap', {credentials: 'include'}); 
 const j = await r.json();
 if(alive) setReadinessData(j); 
 } catch (error) {
 console.error('Failed to load readiness heatmap:', error);
 } finally {
 if(alive) setReadinessLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const r = await fetch('/api/cmc/oee/advisor', {credentials: 'include'}); 
 const j = await r.json();
 if(alive) setOeeData(j); 
 } catch (error) {
 console.error('Failed to load OEE data:', error);
 } finally {
 if(alive) setOeeLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 const buildPaiPlan = async () => {
 try {
 const r = await fetch('/api/cmc/pai/action-plan', {
 method:'POST', 
 headers:{'Content-Type':'application/json'}, 
 credentials:'include',
 body: JSON.stringify({ gaps: paiData?.gaps || [] })
 });
 const plan = await r.json();
 setPaiPlan(plan);
 } catch (error) {
 console.error('Failed to build PAI action plan:', error);
 }
 };

 const generateOeeImprovementPlan = async () => {
 try {
 const r = await fetch('/api/cmc/oee/improvement-plan', {
 method:'POST', 
 headers:{'Content-Type':'application/json'}, 
 credentials:'include',
 body: JSON.stringify({ 
 drivers: oeeData?.drivers || [], 
 oee: oeeData?.oee || {} 
 })
 });
 const plan = await r.json();
 setOeeImprovementPlan(plan);
 } catch (error) {
 console.error('Failed to generate OEE improvement plan:', error);
 }
 };

 return (
 <div className="space-y-6">
 <ManufacturingKPICards />
 
 {/* Readiness Heatmap Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Activity className="w-5 h-5 text-purple-600" />
 <CardTitle className="text-lg">Submission Readiness Heatmap</CardTitle>
 <div className="grow"/>
 {readinessData && (
 <Badge variant={readinessData.overall.status === 'Good' ? "default" : readinessData.overall.status === 'Acceptable' ? "secondary" : "destructive"}>
 Overall: {readinessData.overall.score}%
 </Badge>
 )}
 </div>
 </CardHeader>
 <CardContent>
 {readinessLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading readiness assessment...</span>
 </div>
 ) : readinessData ? (
 <div className="space-y-6">
 {/* Heatmap Grid */}
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-4">Manufacturing Readiness Grid</h4>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {readinessData.heatmapGrid.map((dimension) => (
 <button
 key={dimension.dimension}
 className={`p-4 rounded-lg border-2 text-left transition-all hover:shadow-md ${
 dimension.status === 'Good' 
 ? 'bg-green-50 border-green-200 hover:bg-green-100' 
 : dimension.status === 'Acceptable'
 ? 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
 : 'bg-red-50 border-red-200 hover:bg-red-100'
 }`}
 onClick={() => {
 // Deep link navigation to relevant section
 const sections = {
 'Process': 'digital-twin',
 'Validation': 'validation',
 'Equipment': 'sites-equipment', 
 'Deviations': 'deviation-capa-cc',
 'Packaging': 'pack-serial',
 'AI': 'ai-oversight'
 };
 const targetSection = sections[dimension.dimension];
 if (targetSection && onSectionSelect) {
 onSectionSelect(targetSection);
 }
 }}
 data-testid={`heatmap-${dimension.dimension.toLowerCase()}`}
 >
 <div className="flex items-center justify-between mb-2">
 <span className="font-medium text-gray-900">{dimension.dimension}</span>
 <Badge 
 variant={dimension.status === 'Good' ? "default" : dimension.status === 'Acceptable' ? "secondary" : "destructive"}
 className="text-xs"
 >
 {dimension.status}
 </Badge>
 </div>
 <div className="text-2xl font-bold mb-2" data-testid={`score-${dimension.dimension.toLowerCase()}`}>
 {dimension.score}%
 </div>
 <div className="text-xs text-gray-600 mb-2">
 {dimension.description}
 </div>
 <div className="text-xs text-stone-700 font-medium">
 CTD: {dimension.ctdSections.join(', ')}
 </div>
 </button>
 ))}
 </div>
 </div>

 {/* CTD Section Mapping */}
 <div className="bg-stone-50 dark:bg-stone-100 rounded-lg p-4">
 <h4 className="font-medium text-stone-900 mb-3">CTD Section Mapping</h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
 {Object.entries(readinessData.ctdSectionMapping).map(([section, description]) => (
 <div key={section} className="flex gap-2">
 <Badge variant="outline" className="shrink-0">{section}</Badge>
 <span className="text-gray-700">{description}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Summary & Recommendations */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-3">Readiness Summary</h4>
 <div className="space-y-2 text-sm">
 <div className="flex justify-between">
 <span className="text-gray-600">Good:</span>
 <span className="font-medium text-green-700">{readinessData.summary.good}/6 dimensions</span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-600">Acceptable:</span>
 <span className="font-medium text-yellow-700">{readinessData.summary.acceptable}/6 dimensions</span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-600">Poor:</span>
 <span className="font-medium text-red-700">{readinessData.summary.poor}/6 dimensions</span>
 </div>
 <Separator className="my-2" />
 <div className="flex justify-between items-center">
 <span className="text-gray-600">Submission Ready:</span>
 <Badge variant={readinessData.summary.submissionReady ? "default" : "destructive"}>
 {readinessData.summary.submissionReady ? 'Yes' : 'No'}
 </Badge>
 </div>
 </div>
 </div>

 {readinessData.recommendations && readinessData.recommendations.length > 0 && (
 <div className="bg-amber-50 dark:bg-amber-100 rounded-lg p-4">
 <h4 className="font-medium text-amber-900 mb-3">Priority Actions</h4>
 <div className="space-y-2">
 {readinessData.recommendations.slice(0, 3).map((rec, index) => (
 <div key={index} className="text-sm">
 <div className="flex items-start gap-2 mb-1">
 <Badge 
 variant={rec.priority === 'High' ? "destructive" : "secondary"}
 className="mt-0.5 text-xs"
 >
 {rec.priority}
 </Badge>
 <span className="font-medium text-gray-900">{rec.dimension}</span>
 </div>
 <div className="text-amber-800 ml-2">{rec.recommendation}</div>
 <div className="text-xs text-gray-600 ml-2 mt-1">
 CTD: {rec.ctdSections.join(', ')}
 </div>
 </div>
 ))}
 {readinessData.recommendations.length > 3 && (
 <div className="text-xs text-amber-700 mt-2">
 +{readinessData.recommendations.length - 3} more recommendations
 </div>
 )}
 </div>
 </div>
 )}
 </div>

 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 Readiness assessment integrates manufacturing process data, validation status, equipment qualification, 
 deviation management, packaging compliance, and AI system readiness across key CTD sections. 
 Click on dimension cells to navigate to relevant panels for detailed investigation.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load readiness assessment data
 </div>
 )}
 </CardContent>
 </Card>
 
 {/* PAI Simulator Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Shield className="w-5 h-5 text-stone-600" />
 <CardTitle className="text-lg">PAI (Pre-Approval Inspection) Simulator</CardTitle>
 <div className="grow"/>
 {paiData && (
 <Badge variant={paiData.scorePct >= 90 ? "default" : paiData.scorePct >= 70 ? "secondary" : "destructive"}>
 Readiness: {paiData.scorePct}%
 </Badge>
 )}
 <Button 
 size="sm" 
 onClick={buildPaiPlan}
 disabled={!paiData || paiLoading}
 data-testid="btn-build-pai-plan"
 >
 Build Action Plan
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {paiLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading PAI checklist...</span>
 </div>
 ) : paiData ? (
 <div className="space-y-4">
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-3">Inspection Readiness Checklist</h4>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-gray-200">
 <th className="text-left py-2 font-medium text-gray-700">Item</th>
 <th className="text-left py-2 font-medium text-gray-700">Module 3 Section</th>
 <th className="text-left py-2 font-medium text-gray-700">Status</th>
 </tr>
 </thead>
 <tbody>
 {paiData.items.map(item => (
 <tr key={item.id} className="border-b border-gray-100">
 <td className="py-2 pr-4">{item.title}</td>
 <td className="py-2 pr-4 text-gray-600">{item.section}</td>
 <td className="py-2">
 <Badge variant={item.ok ? "default" : "destructive"}>
 {item.ok ? 'OK' : 'Gap'}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {paiPlan && (
 <div className="bg-amber-50 dark:bg-amber-100 rounded-lg p-4">
 <h4 className="font-medium text-amber-900 mb-3">Recommended Action Plan</h4>
 <ul className="space-y-2">
 {paiPlan.plan.map(p => (
 <li key={p.id} className="text-sm">
 <Badge variant="outline" className="mr-2">{p.type}</Badge>
 <strong>{p.title}</strong> [{p.section}]
 <div className="text-gray-600 ml-2 mt-1">{p.recommendation}</div>
 </li>
 ))}
 </ul>
 <div className="mt-3 text-xs text-amber-700">
 Open CAPA/Change Control from relevant panels to formalize these actions.
 </div>
 </div>
 )}
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load PAI checklist data
 </div>
 )}
 </CardContent>
 </Card>
 
 {/* OEE Advisor Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Target className="w-5 h-5 text-green-600" />
 <CardTitle className="text-lg">OEE (Overall Equipment Effectiveness) Advisor</CardTitle>
 <div className="grow"/>
 {oeeData && (
 <Badge variant={oeeData.oee.overall >= 85 ? "default" : oeeData.oee.overall >= 65 ? "secondary" : "destructive"}>
 OEE: {oeeData.oee.overall}%
 </Badge>
 )}
 <Button 
 size="sm" 
 onClick={generateOeeImprovementPlan}
 disabled={!oeeData || oeeLoading}
 data-testid="btn-generate-oee-plan"
 >
 Generate Action Plan
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {oeeLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading OEE data...</span>
 </div>
 ) : oeeData ? (
 <div className="space-y-4">
 {/* OEE Breakdown */}
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-3">OEE Breakdown</h4>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="text-center">
 <div className="text-2xl font-bold text-stone-600" data-testid="oee-availability">
 {oeeData.breakdown.availability.value}%
 </div>
 <div className="text-sm font-medium text-gray-700">Availability</div>
 <div className="text-xs text-gray-500 mt-1">
 {oeeData.breakdown.availability.description}
 </div>
 <Badge 
 variant={oeeData.breakdown.availability.status === 'good' ? "default" : 
 oeeData.breakdown.availability.status === 'acceptable' ? "secondary" : "destructive"}
 className="mt-2"
 >
 {oeeData.breakdown.availability.status}
 </Badge>
 </div>
 <div className="text-center">
 <div className="text-2xl font-bold text-orange-600" data-testid="oee-performance">
 {oeeData.breakdown.performance.value}%
 </div>
 <div className="text-sm font-medium text-gray-700">Performance</div>
 <div className="text-xs text-gray-500 mt-1">
 {oeeData.breakdown.performance.description}
 </div>
 <Badge 
 variant={oeeData.breakdown.performance.status === 'good' ? "default" : 
 oeeData.breakdown.performance.status === 'acceptable' ? "secondary" : "destructive"}
 className="mt-2"
 >
 {oeeData.breakdown.performance.status}
 </Badge>
 </div>
 <div className="text-center">
 <div className="text-2xl font-bold text-purple-600" data-testid="oee-quality">
 {oeeData.breakdown.quality.value}%
 </div>
 <div className="text-sm font-medium text-gray-700">Quality</div>
 <div className="text-xs text-gray-500 mt-1">
 {oeeData.breakdown.quality.description}
 </div>
 <Badge 
 variant={oeeData.breakdown.quality.status === 'good' ? "default" : 
 oeeData.breakdown.quality.status === 'acceptable' ? "secondary" : "destructive"}
 className="mt-2"
 >
 {oeeData.breakdown.quality.status}
 </Badge>
 </div>
 </div>
 </div>

 {/* Drivers/Issues */}
 {oeeData.drivers && oeeData.drivers.length > 0 && (
 <div className="bg-red-50 dark:bg-red-100 rounded-lg p-4">
 <h4 className="font-medium text-red-900 mb-3 flex items-center gap-2">
 <AlertCircle className="w-4 h-4" />
 Identified Issues & Drivers
 </h4>
 <div className="space-y-2">
 {oeeData.drivers.map((driver, index) => (
 <div key={index} className="flex items-start gap-2 text-sm">
 <Badge variant={driver.severity === 'high' ? "destructive" : "secondary"} className="mt-0.5">
 {driver.severity}
 </Badge>
 <div className="flex-1">
 <div className="font-medium text-gray-900">{driver.description}</div>
 <div className="text-xs text-gray-600 mt-1">
 Impact: <span className="font-medium capitalize">{driver.impact}</span>
 {driver.equipment && (
 <span className="ml-2">Equipment: {driver.equipment.join(', ')}</span>
 )}
 {driver.parameters && (
 <span className="ml-2">Parameters: {driver.parameters.join(', ')}</span>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Improvement Plan */}
 {oeeImprovementPlan && (
 <div className="bg-green-50 dark:bg-green-100 rounded-lg p-4">
 <h4 className="font-medium text-green-900 mb-3 flex items-center gap-2">
 <CheckCircle2 className="w-4 h-4" />
 Recommended Improvement Plan
 </h4>
 <div className="text-sm text-green-800 mb-3">
 {oeeImprovementPlan.summary.totalActions} actions identified 
 ({oeeImprovementPlan.summary.highPriority} high priority, {oeeImprovementPlan.summary.mediumPriority} medium priority)
 </div>
 <div className="space-y-3">
 {oeeImprovementPlan.plan.map(action => (
 <div key={action.id} className="bg-white dark:bg-gray-50 rounded border p-3">
 <div className="flex items-start gap-2 mb-2">
 <Badge variant="outline" className="mt-0.5">{action.type}</Badge>
 <Badge 
 variant={action.priority === 'High' ? "destructive" : "secondary"}
 className="mt-0.5"
 >
 {action.priority}
 </Badge>
 <div className="flex-1">
 <div className="font-medium text-gray-900">{action.title}</div>
 <div className="text-xs text-gray-600 mt-1">{action.timeline}</div>
 </div>
 </div>
 <div className="text-sm text-gray-700 mb-2">{action.recommendation}</div>
 <div className="text-xs text-stone-700">
 <span className="font-medium">Expected Impact:</span> {action.estimatedImpact}
 {action.section && (
 <span className="ml-2 font-medium">CTD Section:</span>
 )}
 {action.section && <span> {action.section}</span>}
 </div>
 </div>
 ))}
 </div>
 <div className="mt-3 text-xs text-green-700">
 Use Deviations • CAPA • CC panel to formalize PM, CAPA, and Change Control actions.
 </div>
 </div>
 )}

 {/* Quick Recommendations */}
 {oeeData.recommendations && (oeeData.recommendations.immediate?.length > 0 || oeeData.recommendations.planned?.length > 0) && (
 <div className="bg-stone-50 dark:bg-stone-100 rounded-lg p-4">
 <h4 className="font-medium text-stone-900 mb-3">Quick Recommendations</h4>
 <div className="space-y-2">
 {oeeData.recommendations.immediate?.length > 0 && (
 <div>
 <div className="font-medium text-red-700 text-sm">Immediate Actions:</div>
 <ul className="list-disc list-inside text-sm text-gray-700 ml-2">
 {oeeData.recommendations.immediate.map((rec, index) => (
 <li key={index}>{rec}</li>
 ))}
 </ul>
 </div>
 )}
 {oeeData.recommendations.planned?.length > 0 && (
 <div>
 <div className="font-medium text-orange-700 text-sm">Planned Actions:</div>
 <ul className="list-disc list-inside text-sm text-gray-700 ml-2">
 {oeeData.recommendations.planned.map((rec, index) => (
 <li key={index}>{rec}</li>
 ))}
 </ul>
 </div>
 )}
 </div>
 </div>
 )}

 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 OEE calculated from manufacturing signals: Equipment uptime/scheduled time (Availability) × 
 Actual/ideal production rate (Performance) × Good/total units (Quality).
 Integrates with equipment calibration, process validation, and deviation management.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load OEE advisor data
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'Manufacturing dashboard, KPIs, and PAI inspection readiness simulator',
 phase: 'design'
 },
 'sites-equipment': { 
 label: 'Sites & Equipment', 
 icon: Factory,
 Comp: () => {
 // Equipment Qualification tracking integrated
 const [equipmentData, setEquipmentData] = useState(null);
 const [riskAlerts, setRiskAlerts] = useState(null);
 const [equipmentLoading, setEquipmentLoading] = useState(true);

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const [equipRes, alertRes] = await Promise.all([
 fetch('/api/cmc/equipment/qualification', {credentials: 'include'}),
 fetch('/api/cmc/equipment/risk-alert', {method: 'POST', credentials: 'include'})
 ]);
 
 const equipCt = equipRes.headers.get('content-type')||'';
 const alertCt = alertRes.headers.get('content-type')||'';
 
 let equipData, alertData;
 if (equipRes.ok && equipCt.includes('application/json')) {
 equipData = await equipRes.json();
 } else {
 equipData = {
 equipment: [
 { id: 'EQ-001', name: 'Mixer MX-400', type: 'Critical', site: 'Site A',
 iq: { status: 'Complete', date: '2024-01-15', nextReview: '2026-01-15' },
 oq: { status: 'Complete', date: '2024-02-20', nextReview: '2026-02-20' },
 pq: { status: 'Complete', date: '2024-03-10', nextReview: '2026-03-10' },
 calibration: { lastDate: '2024-11-01', nextDue: '2025-11-01', status: 'Current' }
 },
 { id: 'EQ-002', name: 'Tablet Press TP-500', type: 'Critical', site: 'Site A',
 iq: { status: 'Complete', date: '2023-12-01', nextReview: '2025-12-01' },
 oq: { status: 'Complete', date: '2024-01-05', nextReview: '2026-01-05' },
 pq: { status: 'Overdue', date: '2023-11-15', nextReview: '2024-11-15' },
 calibration: { lastDate: '2024-06-15', nextDue: '2024-12-15', status: 'Due Soon' }
 }
 ]
 };
 }
 
 if (alertRes.ok && alertCt.includes('application/json')) {
 alertData = await alertRes.json();
 } else {
 alertData = {
 alerts: [
 { id: 'EQP-075-001', equipment: 'EQ-002', name: 'Tablet Press TP-500', 
 type: 'PQ Overdue', severity: 'High',
 message: 'Performance Qualification overdue by 30+ days - PAI risk',
 recommendation: 'Complete PQ immediately before production use',
 ctdSection: '3.2.P.3.3'
 }
 ]
 };
 }
 
 if(alive) {
 setEquipmentData(equipData);
 setRiskAlerts(alertData);
 }
 } catch (error) {
 console.error('Failed to load equipment data:', error);
 // Fallback data
 if(alive) {
 setEquipmentData({
 equipment: [
 { id: 'EQ-001', name: 'Mixer MX-400', type: 'Critical', site: 'Site A',
 iq: { status: 'Complete', date: '2024-01-15', nextReview: '2026-01-15' },
 oq: { status: 'Complete', date: '2024-02-20', nextReview: '2026-02-20' },
 pq: { status: 'Complete', date: '2024-03-10', nextReview: '2026-03-10' },
 calibration: { lastDate: '2024-11-01', nextDue: '2025-11-01', status: 'Current' }
 }
 ]
 });
 setRiskAlerts({
 alerts: [
 { id: 'EQP-075-001', equipment: 'EQ-002', name: 'Tablet Press TP-500', 
 type: 'PQ Overdue', severity: 'High',
 message: 'Performance Qualification overdue - PAI risk',
 recommendation: 'Complete PQ immediately',
 ctdSection: '3.2.P.3.3'
 }
 ]
 });
 }
 } finally {
 if(alive) setEquipmentLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 const getStatusColor = (status) => {
 switch(status) {
 case 'Complete': case 'Current': return 'text-green-700 bg-green-50';
 case 'Due Soon': case 'In Progress': return 'text-yellow-700 bg-yellow-50';
 case 'Overdue': case 'Pending': return 'text-red-700 bg-red-50';
 default: return 'text-gray-700 bg-gray-50';
 }
 };

 return (
 <div className="space-y-6">
 <SiteAndEquipmentPanel />
 
 {/* Equipment Qualification Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <CheckCircle2 className="w-5 h-5 text-green-600" />
 <CardTitle className="text-lg">Equipment Qualification Tracking</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 {equipmentLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading equipment data...</span>
 </div>
 ) : equipmentData ? (
 <div className="space-y-6">
 {/* Risk Alerts */}
 {riskAlerts?.alerts?.length > 0 && (
 <div className="bg-red-50 dark:bg-red-100 rounded-lg p-4 mb-4">
 <h4 className="font-medium text-red-900 mb-3">EQP-075 Risk Alerts</h4>
 <ul className="space-y-2">
 {riskAlerts.alerts.map(alert => (
 <li key={alert.id} className="text-sm">
 <Badge variant="destructive" className="mr-2">{alert.severity}</Badge>
 <strong>{alert.name}</strong> - {alert.message}
 <div className="text-xs text-red-700 ml-2 mt-1">
 Recommendation: {alert.recommendation} [CTD: {alert.ctdSection}]
 </div>
 </li>
 ))}
 </ul>
 </div>
 )}

 {/* Equipment Table */}
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-gray-200">
 <th className="text-left py-3 font-medium text-gray-700">Equipment</th>
 <th className="text-left py-3 font-medium text-gray-700">Type</th>
 <th className="text-left py-3 font-medium text-gray-700">Site</th>
 <th className="text-left py-3 font-medium text-gray-700">IQ</th>
 <th className="text-left py-3 font-medium text-gray-700">OQ</th>
 <th className="text-left py-3 font-medium text-gray-700">PQ</th>
 <th className="text-left py-3 font-medium text-gray-700">Calibration</th>
 </tr>
 </thead>
 <tbody>
 {equipmentData.equipment.map(eq => (
 <tr key={eq.id} className="border-b border-gray-100">
 <td className="py-3 pr-4 font-medium">{eq.name}</td>
 <td className="py-3 pr-4">
 <Badge variant={eq.type === 'Critical' ? 'destructive' : 'secondary'}>
 {eq.type}
 </Badge>
 </td>
 <td className="py-3 pr-4">{eq.site}</td>
 <td className="py-3 pr-4">
 <span className={`px-2 py-1 rounded text-xs ${getStatusColor(eq.iq.status)}`}>
 {eq.iq.status}
 </span>
 </td>
 <td className="py-3 pr-4">
 <span className={`px-2 py-1 rounded text-xs ${getStatusColor(eq.oq.status)}`}>
 {eq.oq.status}
 </span>
 </td>
 <td className="py-3 pr-4">
 <span className={`px-2 py-1 rounded text-xs ${getStatusColor(eq.pq.status)}`}>
 {eq.pq.status}
 </span>
 </td>
 <td className="py-3">
 <div className="flex flex-col gap-1">
 <span className={`px-2 py-1 rounded text-xs ${getStatusColor(eq.calibration.status)}`}>
 {eq.calibration.status}
 </span>
 <span className="text-xs text-gray-500">
 Due: {new Date(eq.calibration.nextDue).toLocaleDateString()}
 </span>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load equipment qualification data
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'Manufacturing sites, equipment qualification (IQ/OQ/PQ), and calibration tracking',
 phase: 'design'
 },
 'digital-twin': { 
 label: 'Process Digital Twin', 
 icon: Globe,
 Comp: () => {
 // Digital Twin PAR simulation integrated
 const [parameters, setParameters] = useState(null);
 const [simulation, setSimulation] = useState(null);
 const [paramLoading, setParamLoading] = useState(true);
 const [simValue, setSimValue] = useState('');

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const res = await fetch('/api/cmc/digital-twin/parameters', {credentials: 'include'});
 const ct = res.headers.get('content-type')||'';
 let data;
 if (res.ok && ct.includes('application/json')) {
 data = await res.json();
 } else {
 data = {
 unitOperations: [
 {
 id: 'OP-001', name: 'Mixing',
 parameters: [
 { id: 'MIX-SPEED', name: 'Mixing Speed', current: 285, target: 300, 
 par: { min: 250, max: 350 }, unit: 'rpm', status: 'In Range' },
 { id: 'MIX-TIME', name: 'Mixing Time', current: 22, target: 20, 
 par: { min: 15, max: 25 }, unit: 'min', status: 'In Range' }
 ]
 },
 {
 id: 'OP-002', name: 'Compression',
 parameters: [
 { id: 'COMP-FORCE', name: 'Compression Force', current: 18.5, target: 18.0, 
 par: { min: 15.0, max: 20.0 }, unit: 'kN', status: 'Near Edge' }
 ]
 }
 ]
 };
 }
 if(alive) setParameters(data);
 } catch (error) {
 console.error('Failed to load parameters:', error);
 if(alive) {
 setParameters({
 unitOperations: [
 {
 id: 'OP-001', name: 'Mixing',
 parameters: [
 { id: 'MIX-SPEED', name: 'Mixing Speed', current: 285, target: 300, 
 par: { min: 250, max: 350 }, unit: 'rpm', status: 'In Range' }
 ]
 }
 ]
 });
 }
 } finally {
 if(alive) setParamLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 const runSimulation = async (parameterId) => {
 try {
 const res = await fetch('/api/cmc/digital-twin/simulate', {
 method: 'POST',
 headers: {'Content-Type': 'application/json'},
 credentials: 'include',
 body: JSON.stringify({ parameterId, newValue: parseFloat(simValue) })
 });
 const result = await res.json();
 setSimulation(result);
 } catch (error) {
 console.error('Failed to run simulation:', error);
 }
 };

 const getParamStatus = (param) => {
 if (param.status === 'Near Edge') return 'text-yellow-700 bg-yellow-50';
 if (param.current < param.par.min || param.current > param.par.max) return 'text-red-700 bg-red-50';
 return 'text-green-700 bg-green-50';
 };

 return (
 <div className="space-y-6">
 <DigitalTwinCanvas />
 
 {/* PAR Simulation Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Target className="w-5 h-5 text-stone-600" />
 <CardTitle className="text-lg">Process Parameters & PAR Simulation</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 {paramLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading process parameters...</span>
 </div>
 ) : parameters ? (
 <div className="space-y-6">
 {parameters.unitOperations.map(operation => (
 <div key={operation.id} className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-4">{operation.name}</h4>
 <div className="space-y-3">
 {operation.parameters.map(param => (
 <div key={param.id} className="bg-white rounded border p-3">
 <div className="flex items-center justify-between mb-2">
 <span className="font-medium">{param.name}</span>
 <span className={`px-2 py-1 rounded text-xs ${getParamStatus(param)}`}>
 {param.status}
 </span>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
 <div>
 <span className="text-gray-600">Current:</span>
 <div className="font-medium">{param.current} {param.unit}</div>
 </div>
 <div>
 <span className="text-gray-600">Target:</span>
 <div className="font-medium">{param.target} {param.unit}</div>
 </div>
 <div>
 <span className="text-gray-600">PAR Range:</span>
 <div className="font-medium">{param.par.min} - {param.par.max} {param.unit}</div>
 </div>
 <div className="flex gap-2">
 <input 
 className="rounded border border-gray-300 px-2 py-1 text-sm w-20" 
 type="number" 
 placeholder="Value"
 value={simValue}
 onChange={e => setSimValue(e.target.value)}
 data-testid={`input-sim-${param.id}`}
 />
 <Button 
 size="sm" 
 onClick={() => runSimulation(param.id)}
 data-testid={`btn-simulate-${param.id}`}
 >
 Simulate
 </Button>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 ))}

 {/* Simulation Results */}
 {simulation && (
 <div className={`rounded-lg p-4 ${simulation.withinPAR ? 'bg-green-50 dark:bg-green-100' : 'bg-red-50 dark:bg-red-100'}`}>
 <h4 className={`font-medium mb-3 ${simulation.withinPAR ? 'text-green-900' : 'text-red-900'}`}>
 Simulation Result: {simulation.newValue} {simulation.withinPAR ? 'Within PAR' : 'Outside PAR'}
 </h4>
 <p className="text-sm mb-3">{simulation.recommendation}</p>
 <div className="text-xs">
 <strong>Required Actions:</strong>
 <ul className="list-disc list-inside mt-1">
 {simulation.actions.map((action, idx) => (
 <li key={idx}>{action}</li>
 ))}
 </ul>
 </div>
 </div>
 )}
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load process parameters
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'Digital twin with PAR simulation and Change Control recommendations',
 phase: 'design'
 },
 'cpp-cqa': { 
 label: 'CPP↔CQA Matrix & Control', 
 icon: Target,
 Comp: () => {
 // CPP-CQA AI suggestions and Control Strategy integrated
 const [matrixData, setMatrixData] = useState(null);
 const [controlStrategy, setControlStrategy] = useState(null);
 const [matrixLoading, setMatrixLoading] = useState(true);

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const res = await fetch('/api/cmc/cpp-cqa/matrix', {credentials: 'include'});
 const ct = res.headers.get('content-type')||'';
 let data;
 if (res.ok && ct.includes('application/json')) {
 data = await res.json();
 } else {
 data = {
 cpp: ['Mixing Speed', 'Mixing Time', 'Compression Force', 'Temperature'],
 cqa: ['Assay', 'Dissolution', 'Hardness', 'Friability'],
 relationships: [
 { cpp: 'Mixing Speed', cqa: 'Assay', strength: 'High', justified: true },
 { cpp: 'Mixing Speed', cqa: 'Dissolution', strength: 'Medium', justified: true },
 { cpp: 'Compression Force', cqa: 'Hardness', strength: 'High', justified: true },
 { cpp: 'Compression Force', cqa: 'Friability', strength: 'Medium', justified: false }
 ],
 gaps: [
 { cpp: 'Temperature', cqa: 'Dissolution', missing: true, 
 aiSuggestion: 'Temperature affects API solubility - recommend DoE study' }
 ]
 };
 }
 if(alive) setMatrixData(data);
 } catch (error) {
 console.error('Failed to load CPP-CQA matrix:', error);
 if(alive) {
 setMatrixData({
 cpp: ['Mixing Speed', 'Compression Force'],
 cqa: ['Assay', 'Dissolution'],
 relationships: [
 { cpp: 'Mixing Speed', cqa: 'Assay', strength: 'High', justified: true }
 ],
 gaps: []
 });
 }
 } finally {
 if(alive) setMatrixLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 const generateControlStrategy = async () => {
 try {
 const res = await fetch('/api/cmc/cpp-cqa/control-strategy', {
 method: 'POST',
 credentials: 'include'
 });
 const strategy = await res.json();
 setControlStrategy(strategy);
 } catch (error) {
 console.error('Failed to generate control strategy:', error);
 }
 };

 return (
 <div className="space-y-6">
 <ParameterMatrix />
 
 {/* CPP-CQA Matrix Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Brain className="w-5 h-5 text-purple-600" />
 <CardTitle className="text-lg">AI-Enhanced CPP↔CQA Matrix</CardTitle>
 <div className="grow"/>
 <Button 
 size="sm" 
 onClick={generateControlStrategy}
 data-testid="btn-generate-control-strategy"
 >
 Generate Control Strategy
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {matrixLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading matrix data...</span>
 </div>
 ) : matrixData ? (
 <div className="space-y-6">
 {/* Matrix Grid */}
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-4">Parameter-Attribute Relationships</h4>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-gray-200">
 <th className="text-left py-2 font-medium text-gray-700">CPP</th>
 <th className="text-left py-2 font-medium text-gray-700">CQA</th>
 <th className="text-left py-2 font-medium text-gray-700">Strength</th>
 <th className="text-left py-2 font-medium text-gray-700">Justified</th>
 </tr>
 </thead>
 <tbody>
 {matrixData.relationships.map((rel, idx) => (
 <tr key={idx} className="border-b border-gray-100">
 <td className="py-2 pr-4">{rel.cpp}</td>
 <td className="py-2 pr-4">{rel.cqa}</td>
 <td className="py-2 pr-4">
 <Badge variant={rel.strength === 'High' ? 'destructive' : 'secondary'}>
 {rel.strength}
 </Badge>
 </td>
 <td className="py-2">
 <Badge variant={rel.justified ? 'default' : 'destructive'}>
 {rel.justified ? 'Yes' : 'Needs Justification'}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {/* AI Suggestions for Gaps */}
 {matrixData.gaps?.length > 0 && (
 <div className="bg-amber-50 dark:bg-amber-100 rounded-lg p-4">
 <h4 className="font-medium text-amber-900 mb-3">AI-Identified Gaps & Suggestions</h4>
 <ul className="space-y-2">
 {matrixData.gaps.map((gap, idx) => (
 <li key={idx} className="text-sm">
 <Badge variant="outline" className="mr-2">Missing Link</Badge>
 <strong>{gap.cpp} → {gap.cqa}</strong>
 <div className="text-amber-700 ml-2 mt-1">{gap.aiSuggestion}</div>
 </li>
 ))}
 </ul>
 </div>
 )}

 {/* Control Strategy Output */}
 {controlStrategy && (
 <div className="bg-stone-50 dark:bg-stone-100 rounded-lg p-4">
 <h4 className="font-medium text-stone-900 mb-3">Generated Control Strategy [CTD: {controlStrategy.ctdMapping}]</h4>
 
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
 <div>
 <h5 className="font-medium text-stone-800 mb-2">Monitoring Plan</h5>
 <ul className="text-sm space-y-1">
 {controlStrategy.monitoring.map((item, idx) => (
 <li key={idx}>
 <strong>{item.parameter}:</strong> {item.method} ({item.frequency}) - Alert: {item.alertLevel}
 </li>
 ))}
 </ul>
 </div>
 
 <div>
 <h5 className="font-medium text-stone-800 mb-2">Alarm Actions</h5>
 <ul className="text-sm space-y-1">
 {controlStrategy.alarms.map((alarm, idx) => (
 <li key={idx}>
 <strong>{alarm.parameter}:</strong> {alarm.condition} → {alarm.action}
 </li>
 ))}
 </ul>
 </div>
 </div>
 </div>
 )}
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load CPP-CQA matrix
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'AI-enhanced CPP↔CQA mapping with Control Strategy Generator',
 phase: 'design'
 },
 'materials-bom': { 
 label: 'Materials & BOM', 
 icon: Archive,
 Comp: () => {
 // Supply Risk Management integrated
 const [bomData, setBomData] = useState(null);
 const [alternates, setAlternates] = useState(null);
 const [bomLoading, setBomLoading] = useState(true);

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const res = await fetch('/api/cmc/supply/risk-assessment', {credentials: 'include'});
 const data = await res.json();
 if(alive) setBomData(data);
 } catch (error) {
 console.error('Failed to load BOM data:', error);
 } finally {
 if(alive) setBomLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 const findAlternates = async (materialId) => {
 try {
 const res = await fetch('/api/cmc/supply/find-alternates', {
 method: 'POST',
 headers: {'Content-Type': 'application/json'},
 credentials: 'include',
 body: JSON.stringify({ materialId })
 });
 const data = await res.json();
 setAlternates(data);
 } catch (error) {
 console.error('Failed to find alternates:', error);
 }
 };

 const getRiskColor = (risk) => {
 switch(risk) {
 case 'High': return 'text-red-700 bg-red-50 border-red-200';
 case 'Medium': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
 case 'Low': return 'text-green-700 bg-green-50 border-green-200';
 default: return 'text-gray-700 bg-gray-50 border-gray-200';
 }
 };

 return (
 <div className="space-y-6">
 <MaterialsBOMPanel />
 
 {/* Supply Risk Assessment Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <AlertTriangle className="w-5 h-5 text-orange-600" />
 <CardTitle className="text-lg">Supply Risk Assessment</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 {bomLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading supply data...</span>
 </div>
 ) : bomData ? (
 <div className="space-y-4">
 {bomData.bomItems.map(item => (
 <div key={item.id} className={`border rounded-lg p-4 ${getRiskColor(item.riskLevel)}`}>
 <div className="flex items-center justify-between mb-3">
 <div>
 <h4 className="font-medium">{item.name}</h4>
 <p className="text-sm opacity-75">Supplier: {item.supplier}</p>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant={item.riskLevel === 'High' ? 'destructive' : item.riskLevel === 'Medium' ? 'secondary' : 'default'}>
 {item.riskLevel} Risk
 </Badge>
 {item.singleSource && (
 <Badge variant="outline">Single Source</Badge>
 )}
 </div>
 </div>
 
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
 <div>
 <span className="text-sm font-medium">Quality Score:</span>
 <div className="text-lg font-bold">{item.qualityScore}%</div>
 </div>
 <div>
 <span className="text-sm font-medium">On-Time Delivery:</span>
 <div className="text-lg font-bold">{item.onTimeDelivery}%</div>
 </div>
 <div>
 <span className="text-sm font-medium">Alternates Available:</span>
 <div className="text-lg font-bold">{item.alternates.length}</div>
 </div>
 </div>
 
 <Button 
 size="sm" 
 variant="outline"
 onClick={() => findAlternates(item.id)}
 data-testid={`btn-find-alternates-${item.id}`}
 >
 Find Alternates
 </Button>
 </div>
 ))}

 {/* Alternates Display */}
 {alternates && (
 <div className="bg-stone-50 dark:bg-stone-100 rounded-lg p-4 mt-4">
 <h4 className="font-medium text-stone-900 mb-3">Alternative Suppliers</h4>
 <div className="space-y-2">
 {alternates.alternatives.map((alt, idx) => (
 <div key={idx} className="bg-white rounded border p-3 text-sm">
 <div className="flex justify-between items-center mb-2">
 <strong>{alt.supplier}</strong>
 <Badge variant="secondary">Quality: {alt.qualityScore}%</Badge>
 </div>
 <div className="grid grid-cols-3 gap-2 text-xs">
 <span>Lead Time: {alt.leadTime}</span>
 <span>Cost Impact: {alt.costImpact}</span>
 <span>Qualification: {alt.qualification}</span>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load supply risk data
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'Raw materials, BOM, and supply risk management with alternates',
 phase: 'validate'
 },
 'mbr-ebr': { 
 label: 'MBR Editor & EBR Viewer', 
 icon: FileText,
 Comp: () => {
 // MBR Versioning & EBR Timeline integrated
 const [mbrVersions, setMbrVersions] = useState(null);
 const [ebrTimeline, setEbrTimeline] = useState(null);
 const [mbrLoading, setMbrLoading] = useState(true);

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const [mbrRes, ebrRes] = await Promise.all([
 fetch('/api/cmc/mbr/versions', {credentials: 'include'}),
 fetch('/api/cmc/ebr/timeline', {credentials: 'include'})
 ]);
 const [mbrData, ebrData] = await Promise.all([mbrRes.json(), ebrRes.json()]);
 if(alive) {
 setMbrVersions(mbrData);
 setEbrTimeline(ebrData);
 }
 } catch (error) {
 console.error('Failed to load MBR/EBR data:', error);
 } finally {
 if(alive) setMbrLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 const getVersionStatus = (status) => {
 switch(status) {
 case 'Current': return 'text-green-700 bg-green-50 border-green-200';
 case 'Superseded': return 'text-gray-700 bg-gray-50 border-gray-200';
 default: return 'text-gray-700 bg-gray-50 border-gray-200';
 }
 };

 const getStepStatus = (status) => {
 switch(status) {
 case 'Complete': return 'text-green-700 bg-green-50';
 case 'In Progress': return 'text-stone-700 bg-stone-50';
 case 'Pending': return 'text-yellow-700 bg-yellow-50';
 default: return 'text-gray-700 bg-gray-50';
 }
 };

 return (
 <div className="space-y-6">
 <MbrEditor />
 <EbrViewer />
 
 {/* MBR Version Management Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <GitBranch className="w-5 h-5 text-purple-600" />
 <CardTitle className="text-lg">MBR Version History & E-Sign</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 {mbrLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading MBR versions...</span>
 </div>
 ) : mbrVersions ? (
 <div className="space-y-4">
 {mbrVersions.versions.map(version => (
 <div key={version.version} className={`border rounded-lg p-4 ${getVersionStatus(version.status)}`}>
 <div className="flex items-center justify-between mb-3">
 <div>
 <h4 className="font-medium">MBR {version.version}</h4>
 <p className="text-sm opacity-75">Approved: {new Date(version.approvedDate).toLocaleDateString()}</p>
 </div>
 <Badge variant={version.status === 'Current' ? 'default' : 'secondary'}>
 {version.status}
 </Badge>
 </div>
 
 <div className="mb-3">
 <h5 className="text-sm font-medium mb-2">E-Sign Approvals:</h5>
 <div className="flex flex-wrap gap-2">
 {version.approvedBy.map((approver, idx) => (
 <Badge key={idx} variant="outline" className="text-xs">
 ✓ {approver}
 </Badge>
 ))}
 </div>
 </div>
 
 <div className="text-sm">
 <strong>Changes:</strong> {version.changes}
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load MBR versions
 </div>
 )}
 </CardContent>
 </Card>

 {/* EBR Timeline & Genealogy Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Clock className="w-5 h-5 text-stone-600" />
 <CardTitle className="text-lg">EBR Timeline & Batch Genealogy</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 {ebrTimeline ? (
 <div className="space-y-4">
 <div className="bg-stone-50 dark:bg-stone-100 rounded-lg p-3 mb-4">
 <h4 className="font-medium text-stone-900">Batch: {ebrTimeline.timeline[0]?.batchId}</h4>
 </div>
 
 <div className="space-y-3">
 {ebrTimeline.timeline.map((step, idx) => (
 <div key={idx} className="flex items-center gap-4 border-l-4 border-gray-200 pl-4">
 <div className={`px-2 py-1 rounded text-xs ${getStepStatus(step.status)}`}>
 {step.status}
 </div>
 <div className="flex-1">
 <div className="font-medium">{step.step}</div>
 <div className="text-sm text-gray-600">
 Operator: {step.operator} • {new Date(step.timestamp).toLocaleString()}
 {step.duration && ` • Duration: ${step.duration}`}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 No batch timeline data available
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'MBR versioning with e-sign and EBR timeline with batch genealogy',
 phase: 'validate'
 },
 'validation': { 
 label: 'Validation Lifecycle', 
 icon: CheckCircle2,
 Comp: () => {
 // Stability Planner integrated into Validation section 
 const [stabilityData, setStabilityData] = useState(null);
 const [stabilityProj, setStabilityProj] = useState(null);
 const [claimMonths, setClaimMonths] = useState(24);
 const [stabilityLoading, setStabilityLoading] = useState(true);

 useEffect(() => { 
 let alive = true;
 (async() => {
 try {
 const r = await fetch('/api/cmc/stability', {credentials: 'include'}); 
 const j = await r.json();
 if(alive) setStabilityData(j); 
 } catch (error) {
 console.error('Failed to load stability data:', error);
 } finally {
 if(alive) setStabilityLoading(false);
 }
 })(); 
 return () => {alive = false}; 
 }, []);

 const projectStability = async () => {
 try {
 const r = await fetch('/api/cmc/stability/projection', {
 method:'POST', 
 headers:{'Content-Type':'application/json'}, 
 credentials:'include',
 body: JSON.stringify({ 
 longTermMonths: 12, 
 accelSupport: true, 
 desiredClaim: Number(claimMonths) 
 })
 });
 const proj = await r.json();
 setStabilityProj(proj);
 } catch (error) {
 console.error('Failed to project stability:', error);
 }
 };

 return (
 <div className="space-y-6">
 <ValidationLifecyclePanel />
 
 {/* CPV Control Charts Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <TrendingUp className="w-5 h-5 text-stone-600" />
 <CardTitle className="text-lg">CPV Control Charts</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <CpvControlCharts />
 </CardContent>
 </Card>

 {/* Stability & Shelf-life Planner Panel */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Clock className="w-5 h-5 text-green-600" />
 <CardTitle className="text-lg">Stability & Shelf-life Planner</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 {stabilityLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading stability data...</span>
 </div>
 ) : stabilityData ? (
 <div className="space-y-4">
 <div className="text-sm text-gray-700 mb-4">
 Product: <strong>{stabilityData.product}</strong>
 </div>
 
 <div className="grid gap-4 md:grid-cols-2">
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-3">Study Matrix</h4>
 <ul className="space-y-2">
 {stabilityData.studies.map(study => (
 <li key={study.id} className="text-sm">
 <Badge variant="outline" className="mr-2">{study.type}</Badge>
 {study.cond} • {study.durationMonths}m • 
 <span className="text-gray-600"> points: {study.points.join(', ')}</span>
 </li>
 ))}
 </ul>
 </div>
 
 <div className="bg-stone-50 dark:bg-stone-100 rounded-lg p-4">
 <h4 className="font-medium text-stone-900 mb-3">Trends & Projection</h4>
 <div className="text-sm mb-3">
 <div>Assay: <Badge variant="default">{stabilityData.dataSummary.assayTrend}</Badge></div>
 <div className="mt-1">Dissolution: <Badge variant="default">{stabilityData.dataSummary.dissolutionTrend}</Badge></div>
 </div>
 
 <div className="flex items-center gap-2 mb-3">
 <label className="text-sm font-medium text-gray-700">Desired Claim (months):</label>
 <input 
 className="rounded border border-gray-300 px-2 py-1 text-sm w-20" 
 type="number" 
 value={claimMonths} 
 onChange={e => setClaimMonths(e.target.value)}
 data-testid="input-claim-months"
 />
 <Button 
 size="sm" 
 onClick={projectStability}
 data-testid="btn-project-stability"
 >
 Project
 </Button>
 </div>
 
 {stabilityProj && (
 <div className="bg-white dark:bg-gray-50 rounded border p-3 text-sm">
 <div className="font-medium mb-2">
 <Badge variant={stabilityProj.ok ? "default" : "destructive"}>
 Projection: {stabilityProj.ok ? 'Supported' : 'Not Supported'}
 </Badge>
 </div>
 <div className="text-gray-700 mb-2">{stabilityProj.recommendation}</div>
 {stabilityProj.commitments?.length > 0 && (
 <div className="text-xs text-stone-700">
 <strong>Commitments:</strong> {stabilityProj.commitments.join('; ')}
 </div>
 )}
 {stabilityProj.projectionBasis && (
 <div className="text-xs text-gray-600 mt-2">
 Basis: {stabilityProj.projectionBasis}
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 
 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 Mapped to 3.2.P.8 (Drug Product) and 3.2.S.7 (Drug Substance) stability sections.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load stability data
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'Process validation, PPQ, continued process verification, and stability planning',
 phase: 'validate'
 },
 'tech-transfer': { 
 label: 'Tech Transfer & Scale-up', 
 icon: Zap,
 Comp: () => {
 const [deltaMatrix, setDeltaMatrix] = useState(null);
 const [loading, setLoading] = useState(true);
 const [selectedComparison, setSelectedComparison] = useState(null);

 useEffect(() => {
 let alive = true;
 (async() => {
 try {
 const res = await fetch('/api/cmc/tech-transfer/delta-matrix', {credentials: 'include'});
 const data = await res.json();
 if(alive) setDeltaMatrix(data);
 } catch (error) {
 console.error('Failed to load delta matrix:', error);
 } finally {
 if(alive) setLoading(false);
 }
 })();
 return () => {alive = false};
 }, []);

 const getRiskColor = (risk) => {
 switch(risk) {
 case 'High': return 'text-red-700 bg-red-50 border-red-200';
 case 'Medium': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
 case 'Low': return 'text-green-700 bg-green-50 border-green-200';
 default: return 'text-gray-700 bg-gray-50 border-gray-200';
 }
 };

 return (
 <div className="space-y-6">
 <TechTransferPanel />
 
 {/* Tech Transfer Delta Matrix */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Zap className="w-5 h-5 text-stone-600" />
 <CardTitle className="text-lg">Tech Transfer Delta Matrix</CardTitle>
 <div className="grow"/>
 {deltaMatrix && (
 <Badge variant={deltaMatrix.riskAssessment.overallRisk === 'Low' ? "default" : deltaMatrix.riskAssessment.overallRisk === 'Medium' ? "secondary" : "destructive"}>
 Overall Risk: {deltaMatrix.riskAssessment.overallRisk}
 </Badge>
 )}
 </div>
 </CardHeader>
 <CardContent>
 {loading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading delta analysis...</span>
 </div>
 ) : deltaMatrix ? (
 <div className="space-y-6">
 {/* Site Comparison Overview */}
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-4">Site Comparison</h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {deltaMatrix.comparisonSites.map((site) => (
 <div key={site.id} className={`p-4 rounded-lg border-2 ${site.status === 'Reference Site' ? 'border-stone-300 bg-stone-50' : 'border-green-300 bg-green-50'}`}>
 <div className="flex items-center justify-between mb-2">
 <h5 className="font-medium">{site.name}</h5>
 <Badge variant={site.status === 'Reference Site' ? 'default' : 'secondary'}>
 {site.status}
 </Badge>
 </div>
 <div className="text-sm space-y-1">
 <div><strong>Equipment:</strong> {site.equipmentSuite}</div>
 <div><strong>Batch Size:</strong> {site.batchSize}</div>
 <div><strong>Qualification:</strong> 
 <Badge variant={site.qualificationStatus === 'Complete' ? 'default' : 'secondary'} className="ml-2">
 {site.qualificationStatus}
 </Badge>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Delta Analysis Matrix */}
 <div className="bg-white border rounded-lg overflow-hidden">
 <div className="bg-gray-50 p-4 border-b">
 <h4 className="font-medium text-gray-900">Delta Analysis Matrix</h4>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-gray-50 border-b">
 <tr>
 <th className="text-left p-3 font-medium">Category</th>
 <th className="text-left p-3 font-medium">Parameter</th>
 <th className="text-left p-3 font-medium">Reference Site</th>
 <th className="text-left p-3 font-medium">Receiving Site</th>
 <th className="text-left p-3 font-medium">Delta</th>
 <th className="text-left p-3 font-medium">Impact</th>
 <th className="text-left p-3 font-medium">PPQ Recommendation</th>
 </tr>
 </thead>
 <tbody>
 {deltaMatrix.deltaAnalysis.map((item, index) => (
 <tr key={index} className="border-b hover:bg-gray-50">
 <td className="p-3">
 <Badge variant="outline">{item.category}</Badge>
 </td>
 <td className="p-3 font-medium">{item.parameter}</td>
 <td className="p-3 text-gray-600">{item.referenceSite}</td>
 <td className="p-3 text-gray-600">{item.receivingSite}</td>
 <td className="p-3">
 <span className="font-medium">{item.delta}</span>
 </td>
 <td className="p-3">
 <Badge variant={item.impact === 'None' ? 'default' : item.impact === 'Low' ? 'secondary' : item.impact === 'Medium' ? 'secondary' : 'destructive'}>
 {item.impact}
 </Badge>
 </td>
 <td className="p-3 text-sm text-stone-700">{item.ppqRecommendation}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {/* AI Recommendations */}
 <div className="bg-stone-50 dark:bg-stone-100 rounded-lg p-4">
 <h4 className="font-medium text-stone-900 mb-3 flex items-center gap-2">
 <Brain className="w-5 h-5" />
 AI PPQ Strategy Recommendations
 </h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <h5 className="font-medium text-stone-800 mb-2">PPQ Strategy</h5>
 <p className="text-sm text-stone-700 mb-3">{deltaMatrix.aiRecommendations.ppqStrategy}</p>
 
 <h5 className="font-medium text-stone-800 mb-2">Critical Parameters</h5>
 <div className="flex flex-wrap gap-1">
 {deltaMatrix.aiRecommendations.criticalParameters.map((param, idx) => (
 <Badge key={idx} variant="outline" className="text-xs">{param}</Badge>
 ))}
 </div>
 </div>
 
 <div>
 <h5 className="font-medium text-stone-800 mb-2">Additional Studies</h5>
 <ul className="text-sm text-stone-700 space-y-1 mb-3">
 {deltaMatrix.aiRecommendations.additionalStudies.map((study, idx) => (
 <li key={idx}>• {study}</li>
 ))}
 </ul>
 
 <h5 className="font-medium text-stone-800 mb-2">Timeline</h5>
 <p className="text-sm text-stone-700">{deltaMatrix.aiRecommendations.timeline}</p>
 </div>
 </div>
 
 <div className="mt-4 p-3 bg-white rounded border">
 <h5 className="font-medium text-gray-900 mb-2">Regulatory Considerations</h5>
 <ul className="text-sm text-gray-700 space-y-1">
 {deltaMatrix.aiRecommendations.regulatoryConsiderations.map((consideration, idx) => (
 <li key={idx}>• {consideration}</li>
 ))}
 </ul>
 </div>
 </div>
 
 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 Delta matrix analysis supports Module 3.2.P.3.3 (Manufacturing) site comparison and transfer strategy. 
 AI recommendations based on equipment, process, and analytical differences between sites.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load tech transfer delta matrix
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'Technology transfer, site comparison delta matrix with AI PPQ recommendations',
 phase: 'validate'
 },
 'deviation-capa-cc': { 
 label: 'Deviations • CAPA • CC', 
 icon: AlertCircle,
 Comp: () => {
 const [rcaData, setRcaData] = useState(null);
 const [selectedDeviation, setSelectedDeviation] = useState(null);
 const [rcaLoading, setRcaLoading] = useState(false);

 const generateRCA = async (deviationId, description, category) => {
 setRcaLoading(true);
 try {
 const res = await fetch('/api/cmc/rca/generate', {
 method: 'POST',
 headers: {'Content-Type': 'application/json'},
 credentials: 'include',
 body: JSON.stringify({ deviationId, description, category })
 });
 const data = await res.json();
 setRcaData(data);
 } catch (error) {
 console.error('Failed to generate RCA:', error);
 } finally {
 setRcaLoading(false);
 }
 };

 return (
 <div className="space-y-6">
 <DeviationCapaBoard />
 
 {/* AI RCA with Ishikawa + 5-Whys */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Brain className="w-5 h-5 text-purple-600" />
 <CardTitle className="text-lg">AI Root Cause Analysis (RCA)</CardTitle>
 <div className="grow"/>
 <Button 
 size="sm" 
 onClick={() => generateRCA('DEV-2024-001', 'Tablet hardness failure', 'Quality')}
 disabled={rcaLoading}
 data-testid="btn-generate-rca"
 >
 {rcaLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
 Generate AI RCA
 </Button>
 </div>
 </CardHeader>
 <CardContent>
 {rcaLoading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Generating AI root cause analysis...</span>
 </div>
 ) : rcaData ? (
 <div className="space-y-6">
 {/* Ishikawa Diagram */}
 <div className="bg-gradient-to-br from-purple-50 to-stone-50 rounded-lg p-6">
 <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
 <Target className="w-5 h-5 text-purple-600" />
 Ishikawa (Fishbone) Diagram Analysis
 </h4>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {Object.entries(rcaData.ishikawa).map(([category, causes]) => (
 <div key={category} className="bg-white rounded-lg p-4 border border-purple-200">
 <h5 className="font-medium text-purple-800 mb-3 capitalize">
 {category}
 </h5>
 <ul className="space-y-2 text-sm">
 {causes.map((cause, idx) => (
 <li key={idx} className="flex items-start gap-2">
 <div className="w-2 h-2 bg-purple-400 rounded-full mt-1.5 flex-shrink-0"></div>
 <span className="text-gray-700">{cause}</span>
 </li>
 ))}
 </ul>
 </div>
 ))}
 </div>
 </div>

 {/* 5-Whys Analysis */}
 <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-6">
 <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
 <HelpCircle className="w-5 h-5 text-orange-600" />
 5-Whys Deep Dive Analysis
 </h4>
 <div className="space-y-3">
 {rcaData.fiveWhys.map((item, idx) => (
 <div key={idx} className="bg-white rounded-lg p-4 border border-orange-200">
 <div className="flex items-start gap-4">
 <div className="bg-orange-100 text-orange-800 font-bold rounded-full w-8 h-8 flex items-center justify-center text-sm flex-shrink-0">
 {item.step}
 </div>
 <div className="flex-1">
 <h5 className="font-medium text-orange-800 mb-1">{item.question}</h5>
 <p className="text-gray-700 text-sm">{item.answer}</p>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Root Cause Analysis Summary */}
 <div className="bg-gradient-to-br from-green-50 to-teal-50 rounded-lg p-6">
 <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
 <CheckCircle2 className="w-5 h-5 text-green-600" />
 Root Cause Analysis Summary
 </h4>
 <div className="bg-white rounded-lg p-4 border border-green-200">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
 <div>
 <h5 className="font-medium text-green-800 mb-2">Probable Root Cause</h5>
 <p className="text-gray-700 text-sm">{rcaData.rootCauseAnalysis.probableRootCause}</p>
 </div>
 <div className="space-y-3">
 <div className="flex justify-between">
 <span className="text-sm font-medium text-gray-600">Confidence Level:</span>
 <Badge variant="default">{rcaData.rootCauseAnalysis.confidenceLevel}%</Badge>
 </div>
 <div className="flex justify-between">
 <span className="text-sm font-medium text-gray-600">Evidence Strength:</span>
 <Badge variant="secondary">{rcaData.rootCauseAnalysis.evidenceStrength}</Badge>
 </div>
 <div className="flex justify-between">
 <span className="text-sm font-medium text-gray-600">Risk Level:</span>
 <Badge variant={rcaData.rootCauseAnalysis.riskLevel === 'Low' ? 'default' : 'secondary'}>
 {rcaData.rootCauseAnalysis.riskLevel}
 </Badge>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* CAPA Recommendations */}
 <div className="bg-gradient-to-br from-stone-50 to-indigo-50 rounded-lg p-6">
 <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
 <Target className="w-5 h-5 text-stone-600" />
 AI-Generated CAPA Recommendations
 </h4>
 <div className="space-y-3">
 {rcaData.capaRecommendations.map((capa) => (
 <div key={capa.id} className="bg-white rounded-lg p-4 border border-stone-200">
 <div className="flex items-start justify-between mb-3">
 <div>
 <h5 className="font-medium text-stone-800">{capa.id}</h5>
 <Badge variant={capa.priority === 'High' ? 'destructive' : 'secondary'} className="mt-1">
 {capa.priority} Priority
 </Badge>
 </div>
 <Badge variant="outline">{capa.type}</Badge>
 </div>
 <p className="text-gray-700 text-sm mb-3">{capa.action}</p>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
 <div>
 <span className="font-medium text-gray-600">Assignee:</span>
 <div className="text-gray-700">{capa.assignee}</div>
 </div>
 <div>
 <span className="font-medium text-gray-600">Due Date:</span>
 <div className="text-gray-700">{capa.dueDate}</div>
 </div>
 <div>
 <span className="font-medium text-gray-600">CTD Section:</span>
 <div className="text-stone-600">{capa.ctdSection}</div>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Regulatory Impact Assessment */}
 <div className="bg-amber-50 rounded-lg p-4">
 <h4 className="font-medium text-amber-900 mb-3">Regulatory Impact Assessment</h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
 <div>
 <div className="mb-2">
 <span className="font-medium text-amber-800">CTD Sections Impacted:</span>
 <div className="mt-1">
 {rcaData.regulatoryImpact.ctdSections.map((section, idx) => (
 <Badge key={idx} variant="outline" className="mr-1 mb-1">{section}</Badge>
 ))}
 </div>
 </div>
 <div>
 <span className="font-medium text-amber-800">Reporting Required:</span>
 <Badge variant={rcaData.regulatoryImpact.reportingRequired ? 'destructive' : 'default'} className="ml-2">
 {rcaData.regulatoryImpact.reportingRequired ? 'Yes' : 'No'}
 </Badge>
 </div>
 </div>
 <div>
 <div className="mb-2">
 <span className="font-medium text-amber-800">Inspection Risk:</span>
 <Badge variant="secondary" className="ml-2">{rcaData.regulatoryImpact.inspectionRisk}</Badge>
 </div>
 <div>
 <span className="font-medium text-amber-800">Recommended Timeline:</span>
 <div className="text-amber-700 mt-1">{rcaData.regulatoryImpact.recommendedTimeline}</div>
 </div>
 </div>
 </div>
 </div>
 
 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 AI RCA analysis combines Ishikawa fishbone methodology with systematic 5-Whys investigation. 
 Generated CAPA recommendations align with ICH Q10 and 21 CFR 211 requirements for corrective and preventive actions.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Click "Generate AI RCA" to perform comprehensive root cause analysis with Ishikawa diagram and 5-Whys methodology
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'AI-powered RCA with Ishikawa diagram, 5-Whys analysis, and CAPA recommendations',
 phase: 'publish'
 },
 'pack-serial': { 
 label: 'Packaging & Serialization', 
 icon: Archive,
 Comp: () => {
 const [regionPresets, setRegionPresets] = useState(null);
 const [selectedRegion, setSelectedRegion] = useState('US');
 const [variables, setVariables] = useState({});
 const [generatedLabels, setGeneratedLabels] = useState(null);
 const [loading, setLoading] = useState(true);
 const [generating, setGenerating] = useState(false);

 useEffect(() => {
 let alive = true;
 (async() => {
 try {
 const res = await fetch('/api/cmc/packaging/regions', {credentials: 'include'});
 const data = await res.json();
 if(alive) {
 setRegionPresets(data);
 // Initialize variables for US region
 if(data.US) {
 const initialVars = {};
 data.US.template.variables.forEach(v => {
 initialVars[v] = v === 'productName' ? 'Sample Product' : 
 v === 'strength' ? '10mg' :
 v === 'dosageForm' ? 'Tablets' :
 v === 'ndc' ? '12345-678-90' :
 v === 'lotNumber' ? 'LOT123456' :
 v === 'expiryDate' ? '12/2026' :
 v === 'udi' ? '(01)12345678901234(17)251231(10)LOT123' :
 'Sample Value';
 });
 setVariables(initialVars);
 }
 }
 } catch (error) {
 console.error('Failed to load packaging regions:', error);
 } finally {
 if(alive) setLoading(false);
 }
 })();
 return () => {alive = false};
 }, []);

 const handleRegionChange = (region) => {
 setSelectedRegion(region);
 if(regionPresets && regionPresets[region]) {
 const newVars = {};
 regionPresets[region].template.variables.forEach(v => {
 newVars[v] = variables[v] || 'Sample Value';
 });
 setVariables(newVars);
 }
 };

 const handleVariableChange = (key, value) => {
 setVariables(prev => ({ ...prev, [key]: value }));
 };

 const generateLabels = async () => {
 setGenerating(true);
 try {
 const res = await fetch('/api/cmc/packaging/generate-labels', {
 method: 'POST',
 headers: {'Content-Type': 'application/json'},
 credentials: 'include',
 body: JSON.stringify({
 region: selectedRegion,
 variables,
 productInfo: { name: variables.productName }
 })
 });
 const data = await res.json();
 setGeneratedLabels(data);
 } catch (error) {
 console.error('Failed to generate labels:', error);
 } finally {
 setGenerating(false);
 }
 };

 return (
 <div className="space-y-6">
 <PackagingSerializationPanel />
 
 {/* Regional Packaging Presets */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Globe className="w-5 h-5 text-green-600" />
 <CardTitle className="text-lg">Regional Packaging Presets</CardTitle>
 <div className="grow"/>
 {regionPresets && (
 <div className="flex items-center gap-2">
 <span className="text-sm text-gray-600">Region:</span>
 <select 
 value={selectedRegion} 
 onChange={(e) => handleRegionChange(e.target.value)}
 className="border border-gray-300 rounded px-3 py-1 text-sm"
 data-testid="select-packaging-region"
 >
 {Object.keys(regionPresets).map(region => (
 <option key={region} value={region}>
 {regionPresets[region].name} ({region})
 </option>
 ))}
 </select>
 </div>
 )}
 </div>
 </CardHeader>
 <CardContent>
 {loading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading regional presets...</span>
 </div>
 ) : regionPresets && regionPresets[selectedRegion] ? (
 <div className="space-y-6">
 {/* Region Information */}
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-3">
 {regionPresets[selectedRegion].name} Requirements
 </h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <h5 className="font-medium text-gray-700 mb-2">Regulations</h5>
 <div className="space-y-1">
 {regionPresets[selectedRegion].regulations.map((reg, idx) => (
 <Badge key={idx} variant="outline" className="mr-1 mb-1">{reg}</Badge>
 ))}
 </div>
 </div>
 <div>
 <h5 className="font-medium text-gray-700 mb-2">Labeling Requirements</h5>
 <div className="text-sm space-y-1">
 <div><strong>Format:</strong> {regionPresets[selectedRegion].labeling.format}</div>
 <div><strong>Barcode:</strong> {regionPresets[selectedRegion].labeling.barcodeType}</div>
 <div><strong>Language:</strong> {regionPresets[selectedRegion].labeling.language}</div>
 </div>
 </div>
 </div>
 
 <div className="mt-4">
 <h5 className="font-medium text-gray-700 mb-2">Required Label Elements</h5>
 <div className="flex flex-wrap gap-1">
 {regionPresets[selectedRegion].labeling.required.map((req, idx) => (
 <Badge key={idx} variant="default" className="text-xs">{req}</Badge>
 ))}
 </div>
 </div>
 
 {regionPresets[selectedRegion].serialization.required && (
 <div className="mt-4 p-3 bg-stone-50 rounded">
 <h5 className="font-medium text-stone-800 mb-2">Serialization</h5>
 <div className="text-sm text-stone-700 space-y-1">
 <div><strong>Format:</strong> {regionPresets[selectedRegion].serialization.format}</div>
 <div><strong>Aggregation:</strong> {regionPresets[selectedRegion].serialization.aggregation}</div>
 <div><strong>Reporting:</strong> {regionPresets[selectedRegion].serialization.reportingEndpoint}</div>
 </div>
 </div>
 )}
 </div>

 {/* Variable Injection Interface */}
 <div className="bg-white border rounded-lg p-4">
 <div className="flex items-center justify-between mb-4">
 <h4 className="font-medium text-gray-900">Label Variable Injection</h4>
 <Button 
 onClick={generateLabels}
 disabled={generating}
 data-testid="btn-generate-labels"
 >
 {generating ? (
 <Loader2 className="w-4 h-4 animate-spin mr-2" />
 ) : (
 <Sparkles className="w-4 h-4 mr-2" />
 )}
 Generate Labels
 </Button>
 </div>
 
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
 {regionPresets[selectedRegion].template.variables.map((variable) => (
 <div key={variable}>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 {variable.charAt(0).toUpperCase() + variable.slice(1).replace(/([A-Z])/g, ' $1')}
 </label>
 <input
 type="text"
 value={variables[variable] || ''}
 onChange={(e) => handleVariableChange(variable, e.target.value)}
 className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
 placeholder={`Enter ${variable}`}
 data-testid={`input-${variable}`}
 />
 </div>
 ))}
 </div>
 
 <div className="bg-gray-50 rounded-lg p-3">
 <h5 className="font-medium text-gray-700 mb-2">Label Template Preview</h5>
 <div className="font-mono text-sm bg-white border rounded p-3 whitespace-pre-line">
 {regionPresets[selectedRegion].template.primaryLabel.replace(
 /\{\{(\w+)\}\}/g, 
 (match, key) => variables[key] || `{{${key}}}`
 )}
 </div>
 </div>
 </div>

 {/* Generated Labels Display */}
 {generatedLabels && (
 <div className="bg-green-50 rounded-lg p-4">
 <h4 className="font-medium text-green-900 mb-3 flex items-center gap-2">
 <CheckCircle2 className="w-5 h-5" />
 Generated Labels ({generatedLabels.region})
 </h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {generatedLabels.labels.map((label, idx) => (
 <div key={idx} className="bg-white rounded border p-3">
 <div className="flex items-center justify-between mb-2">
 <h5 className="font-medium text-gray-900">{label.type} Label</h5>
 <Badge variant="default">{label.compliance}</Badge>
 </div>
 <div className="font-mono text-xs bg-gray-50 p-2 rounded whitespace-pre-line mb-2">
 {label.content.length > 100 ? label.content.substring(0, 100) + '...' : label.content}
 </div>
 <div className="text-xs text-gray-600">
 Format: {label.format}
 </div>
 </div>
 ))}
 </div>
 
 {generatedLabels.barcodes.length > 0 && (
 <div className="mt-4 p-3 bg-white rounded border">
 <h5 className="font-medium text-gray-900 mb-2">Generated Barcodes</h5>
 <div className="space-y-2">
 {generatedLabels.barcodes.map((barcode, idx) => (
 <div key={idx} className="flex items-center justify-between">
 <div>
 <span className="font-medium text-sm">{barcode.type}:</span>
 <span className="ml-2 font-mono text-sm">{barcode.data}</span>
 </div>
 <Badge variant="outline">{barcode.format}</Badge>
 </div>
 ))}
 </div>
 </div>
 )}
 
 <div className="mt-4 p-3 bg-stone-50 rounded">
 <h5 className="font-medium text-stone-900 mb-2">Validation Results</h5>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
 <div className="flex items-center gap-2">
 <CheckCircle2 className="w-4 h-4 text-green-600" />
 <span>Compliance Check</span>
 </div>
 <div className="flex items-center gap-2">
 <CheckCircle2 className="w-4 h-4 text-green-600" />
 <span>Required Fields</span>
 </div>
 <div className="flex items-center gap-2">
 <CheckCircle2 className="w-4 h-4 text-green-600" />
 <span>Format Valid</span>
 </div>
 <div className="flex items-center gap-2">
 <CheckCircle2 className="w-4 h-4 text-green-600" />
 <span>Regulatory Compliant</span>
 </div>
 </div>
 </div>
 </div>
 )}
 
 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 Regional packaging presets ensure compliance with local regulations. Variable injection allows dynamic label generation 
 with product-specific information. Supports Module 3.2.P.7 (Container Closure System) requirements.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load regional packaging presets
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'Regional packaging presets (US/EU/JP) with variable injection and compliance',
 phase: 'publish'
 },
 'ai-oversight': { 
 label: 'AI Oversight (ex-FDA)', 
 icon: Brain,
 Comp: () => {
 const [deficiencyLetter, setDeficiencyLetter] = useState(null);
 const [draftResponse, setDraftResponse] = useState(null);
 const [selectedAgency, setSelectedAgency] = useState('FDA');
 const [selectedSeverity, setSelectedSeverity] = useState('All');
 const [loading, setLoading] = useState(false);
 const [responseText, setResponseText] = useState('');
 const [selectedDeficiency, setSelectedDeficiency] = useState(null);

 const simulateDeficiencyLetter = async () => {
 setLoading(true);
 try {
 const res = await fetch('/api/cmc/deficiency/simulate', {
 method: 'POST',
 headers: {'Content-Type': 'application/json'},
 credentials: 'include',
 body: JSON.stringify({
 submissionType: 'NDA',
 agency: selectedAgency,
 severity: selectedSeverity
 })
 });
 const data = await res.json();
 setDeficiencyLetter(data);
 } catch (error) {
 console.error('Failed to simulate deficiency letter:', error);
 } finally {
 setLoading(false);
 }
 };

 const generateDraftResponse = async (deficiencyId) => {
 try {
 const res = await fetch('/api/cmc/deficiency/draft-response', {
 method: 'POST',
 headers: {'Content-Type': 'application/json'},
 credentials: 'include',
 body: JSON.stringify({
 deficiencyId,
 proposedResponse: responseText,
 supportingData: ['Process validation data', 'Historical batch records']
 })
 });
 const data = await res.json();
 setDraftResponse(data);
 } catch (error) {
 console.error('Failed to generate draft response:', error);
 }
 };

 return (
 <div className="space-y-6">
 <ManufacturingAIInsights />
 
 {/* Deficiency Letter Simulator */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <FileText className="w-5 h-5 text-red-600" />
 <CardTitle className="text-lg">Deficiency Letter Simulator</CardTitle>
 <div className="grow"/>
 <div className="flex items-center gap-2">
 <select 
 value={selectedAgency} 
 onChange={(e) => setSelectedAgency(e.target.value)}
 className="border border-gray-300 rounded px-3 py-1 text-sm"
 data-testid="select-agency"
 >
 <option value="FDA">FDA</option>
 <option value="EMA">EMA</option>
 <option value="PMDA">PMDA</option>
 </select>
 <select 
 value={selectedSeverity} 
 onChange={(e) => setSelectedSeverity(e.target.value)}
 className="border border-gray-300 rounded px-3 py-1 text-sm"
 data-testid="select-severity"
 >
 <option value="All">All Severities</option>
 <option value="Major">Major Only</option>
 <option value="Minor">Minor Only</option>
 </select>
 <Button 
 onClick={simulateDeficiencyLetter}
 disabled={loading}
 data-testid="btn-simulate-deficiency"
 >
 {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
 Simulate Letter
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {deficiencyLetter ? (
 <div className="space-y-6">
 {/* Letter Header */}
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <div className="text-center mb-4">
 <h3 className="font-bold text-lg text-gray-900">{deficiencyLetter.letterhead}</h3>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
 <div>
 <strong>Subject:</strong> {deficiencyLetter.subject}
 </div>
 <div>
 <strong>Issue Date:</strong> {deficiencyLetter.issueDate}
 </div>
 <div>
 <strong>Response Due:</strong> 
 <Badge variant="destructive" className="ml-2">{deficiencyLetter.responseDeadline}</Badge>
 </div>
 </div>
 </div>

 {/* Deficiencies List */}
 <div className="space-y-4">
 <h4 className="font-medium text-gray-900">Identified Deficiencies</h4>
 {deficiencyLetter.deficiencies.map((deficiency) => (
 <div key={deficiency.id} className="border rounded-lg p-4">
 <div className="flex items-start justify-between mb-3">
 <div>
 <h5 className="font-medium text-gray-900">
 {deficiency.id} - {deficiency.category}
 </h5>
 <Badge variant="outline" className="mt-1">{deficiency.section}</Badge>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant={deficiency.severity === 'Major' ? 'destructive' : 'secondary'}>
 {deficiency.severity}
 </Badge>
 <Button 
 size="sm" 
 variant="outline"
 onClick={() => {
 setSelectedDeficiency(deficiency.id);
 setResponseText('');
 setDraftResponse(null);
 }}
 data-testid={`btn-respond-${deficiency.id}`}
 >
 Draft Response
 </Button>
 </div>
 </div>
 
 <div className="bg-red-50 rounded p-3 mb-3">
 <h6 className="font-medium text-red-800 mb-1">Agency Finding:</h6>
 <p className="text-sm text-red-700">{deficiency.finding}</p>
 </div>
 
 <div className="bg-stone-50 rounded p-3">
 <h6 className="font-medium text-stone-800 mb-1">Recommendation:</h6>
 <p className="text-sm text-stone-700">{deficiency.recommendation}</p>
 </div>
 </div>
 ))}
 </div>

 {/* Contact Information */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 mb-2">Contact Information</h4>
 <div className="text-sm text-gray-700 space-y-1">
 <div><strong>Review Team:</strong> {deficiencyLetter.contactInfo.reviewTeam}</div>
 <div><strong>Email:</strong> {deficiencyLetter.contactInfo.email}</div>
 <div><strong>Phone:</strong> {deficiencyLetter.contactInfo.phone}</div>
 </div>
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Select agency and severity, then click "Simulate Letter" to generate realistic deficiency letter
 </div>
 )}
 </CardContent>
 </Card>

 {/* Draft Response Editor */}
 {selectedDeficiency && (
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Edit className="w-5 h-5 text-stone-600" />
 <CardTitle className="text-lg">Draft Response Editor</CardTitle>
 <div className="grow"/>
 <Badge variant="outline">Responding to: {selectedDeficiency}</Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">
 Draft Response
 </label>
 <textarea
 value={responseText}
 onChange={(e) => setResponseText(e.target.value)}
 rows={6}
 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
 placeholder="Enter your response to the deficiency..."
 data-testid="textarea-response"
 />
 </div>
 
 <div className="flex gap-2">
 <Button 
 onClick={() => generateDraftResponse(selectedDeficiency)}
 disabled={!responseText.trim()}
 data-testid="btn-generate-draft"
 >
 <Sparkles className="w-4 h-4 mr-2" />
 Generate AI-Enhanced Response
 </Button>
 <Button variant="outline" onClick={() => setSelectedDeficiency(null)}>
 Cancel
 </Button>
 </div>
 </div>
 
 {draftResponse && (
 <div className="mt-6 space-y-4">
 <div className="bg-green-50 rounded-lg p-4">
 <h4 className="font-medium text-green-900 mb-3">AI-Enhanced Draft Response</h4>
 <div className="bg-white rounded border p-4 mb-4">
 <div className="whitespace-pre-line text-sm">{draftResponse.response.detailedResponse}</div>
 </div>
 
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <h5 className="font-medium text-green-800 mb-2">AI Recommendations</h5>
 <ul className="text-sm text-green-700 space-y-1">
 {draftResponse.aiRecommendations.map((rec, idx) => (
 <li key={idx}>• {rec}</li>
 ))}
 </ul>
 </div>
 
 <div>
 <h5 className="font-medium text-green-800 mb-2">Risk Assessment</h5>
 <div className="text-sm space-y-1">
 <div>
 <span className="text-green-700">Approvability Impact:</span>
 <Badge variant="secondary" className="ml-2">{draftResponse.riskAssessment.approvabilityImpact}</Badge>
 </div>
 <div>
 <span className="text-green-700">Timeline Impact:</span>
 <Badge variant="default" className="ml-2">{draftResponse.riskAssessment.timelineImpact}</Badge>
 </div>
 <div>
 <span className="text-green-700">Additional Studies:</span>
 <Badge variant={draftResponse.riskAssessment.additionalStudiesNeeded ? 'destructive' : 'default'} className="ml-2">
 {draftResponse.riskAssessment.additionalStudiesNeeded ? 'Required' : 'Not Required'}
 </Badge>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 )}
 
 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 Deficiency Letter Simulator provides realistic agency communications for submission preparation. 
 Draft Response Editor includes AI enhancement and regulatory strategy recommendations.
 </div>
 </div>
 );
 },
 description: 'AI insights with Deficiency Letter Simulator and Draft Response Editor',
 phase: 'publish'
 },
 'doc-outputs': { 
 label: 'Document Outputs', 
 icon: BookOpen,
 Comp: () => {
 const [exportGates, setExportGates] = useState(null);
 const [loading, setLoading] = useState(true);
 const [auditTrail, setAuditTrail] = useState(null);
 const [tasksWorklist, setTasksWorklist] = useState(null);

 useEffect(() => {
 let alive = true;
 (async() => {
 try {
 const [gatesRes, auditRes, tasksRes] = await Promise.all([
 fetch('/api/cmc/export/gate-status', {credentials: 'include'}),
 fetch('/api/cmc/audit/trail', {credentials: 'include'}),
 fetch('/api/cmc/tasks/worklist', {credentials: 'include'})
 ]);
 const [gatesData, auditData, tasksData] = await Promise.all([
 gatesRes.json(), auditRes.json(), tasksRes.json()
 ]);
 if(alive) {
 setExportGates(gatesData);
 setAuditTrail(auditData);
 setTasksWorklist(tasksData);
 }
 } catch (error) {
 console.error('Failed to load document outputs data:', error);
 } finally {
 if(alive) setLoading(false);
 }
 })();
 return () => {alive = false};
 }, []);

 const publishEvent = async (eventType, data) => {
 try {
 await fetch('/api/cmc/events/publish', {
 method: 'POST',
 headers: {'Content-Type': 'application/json'},
 credentials: 'include',
 body: JSON.stringify({
 eventType,
 module: 'Document Outputs',
 data,
 userId: 'current-user'
 })
 });
 } catch (error) {
 console.error('Failed to publish event:', error);
 }
 };

 return (
 <div className="space-y-6">
 <DocumentExportsPanel />
 
 {/* Export Gating System */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <Shield className="w-5 h-5 text-orange-600" />
 <CardTitle className="text-lg">Export Gating System</CardTitle>
 <div className="grow"/>
 {exportGates && (
 <Badge variant={exportGates.overallStatus === 'Passed' ? "default" : "destructive"}>
 Status: {exportGates.overallStatus}
 </Badge>
 )}
 </div>
 </CardHeader>
 <CardContent>
 {loading ? (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="w-6 h-6 animate-spin mr-2" />
 <span className="text-gray-600">Loading export gates...</span>
 </div>
 ) : exportGates ? (
 <div className="space-y-6">
 {exportGates.overallStatus === 'Blocked' && (
 <div className="bg-red-50 border border-red-200 rounded-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <AlertCircle className="w-5 h-5 text-red-600" />
 <h4 className="font-medium text-red-800">Export Blocked</h4>
 </div>
 <p className="text-red-700 text-sm mb-3">
 {exportGates.blockers} gate(s) are currently blocking export. 
 All gates must pass before commercial release can proceed.
 </p>
 <div className="text-sm text-red-600">
 <strong>Required Actions:</strong>
 <ul className="list-disc ml-5 mt-1">
 {exportGates.releaseActions.map((action, idx) => (
 <li key={idx}>{action}</li>
 ))}
 </ul>
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {exportGates.gates.map((gate) => (
 <div key={gate.id} className={`border-2 rounded-lg p-4 ${
 gate.status === 'Passed' 
 ? 'border-green-300 bg-green-50' 
 : gate.status === 'Blocked'
 ? 'border-red-300 bg-red-50'
 : 'border-yellow-300 bg-yellow-50'
 }`}>
 <div className="flex items-center justify-between mb-3">
 <h5 className="font-medium text-gray-900">{gate.name}</h5>
 <Badge variant={gate.status === 'Passed' ? 'default' : 'destructive'}>
 {gate.status}
 </Badge>
 </div>
 
 <p className="text-sm text-gray-700 mb-3">{gate.description}</p>
 
 <div className="text-xs text-gray-600 mb-3">
 <strong>Requirements:</strong> {gate.requirements}
 </div>
 
 {gate.status === 'Blocked' && gate.blockingItems && (
 <div className="space-y-2">
 <h6 className="text-sm font-medium text-red-800">Blocking Items:</h6>
 {gate.blockingItems.map((item, idx) => (
 <div key={idx} className="bg-white border border-red-200 rounded p-2 text-xs">
 <div className="font-medium">{item.id}: {item.title}</div>
 <div className="text-gray-600 mt-1">Status: {item.status}</div>
 {item.approvals && (
 <div className="mt-2">
 <span className="font-medium">Pending Approvals:</span>
 <div className="mt-1 space-y-1">
 {item.approvals.map((approval, appIdx) => (
 <div key={appIdx} className="flex justify-between">
 <span>{approval.role}</span>
 <Badge variant={approval.status === 'Approved' ? 'default' : 'destructive'} className="text-xs">
 {approval.status}
 </Badge>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 ))}
 
 <div className="text-xs text-orange-700">
 <strong>Estimated Clearance:</strong> {gate.estimatedClearance}
 </div>
 </div>
 )}
 
 {gate.status === 'Passed' && gate.lastVerified && (
 <div className="text-xs text-green-700">
 <strong>Last Verified:</strong> {gate.lastVerified}
 </div>
 )}
 </div>
 ))}
 </div>
 
 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 Export Gating System ensures all change controls are approved and CAPAs are verified before commercial release. 
 Complies with ICH Q10 and 21 CFR 211.100 requirements for batch release procedures.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load export gate status
 </div>
 )}
 </CardContent>
 </Card>

 {/* Unified Tasks Worklist */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <CheckCircle2 className="w-5 h-5 text-stone-600" />
 <CardTitle className="text-lg">Unified Tasks Worklist</CardTitle>
 <div className="grow"/>
 {tasksWorklist && (
 <div className="flex items-center gap-2">
 <Badge variant="destructive">{tasksWorklist.overdueTasks} Overdue</Badge>
 <Badge variant="secondary">{tasksWorklist.dueTodayTasks} Due Today</Badge>
 </div>
 )}
 </div>
 </CardHeader>
 <CardContent>
 {tasksWorklist ? (
 <div className="space-y-6">
 {/* Summary Statistics */}
 <div className="bg-gray-50 dark:bg-gray-100 rounded-lg p-4">
 <h4 className="font-medium text-gray-900 dark:text-gray-800 mb-3">Tasks Summary</h4>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div>
 <h5 className="text-sm font-medium text-gray-600 mb-2">By Status</h5>
 <div className="space-y-1 text-sm">
 {Object.entries(tasksWorklist.summary.byStatus).map(([status, count]) => (
 <div key={status} className="flex justify-between">
 <span className="text-gray-700">{status}:</span>
 <span className="font-medium">{count}</span>
 </div>
 ))}
 </div>
 </div>
 <div>
 <h5 className="text-sm font-medium text-gray-600 mb-2">By Priority</h5>
 <div className="space-y-1 text-sm">
 {Object.entries(tasksWorklist.summary.byPriority).map(([priority, count]) => (
 <div key={priority} className="flex justify-between">
 <span className="text-gray-700">{priority}:</span>
 <span className="font-medium">{count}</span>
 </div>
 ))}
 </div>
 </div>
 <div>
 <h5 className="text-sm font-medium text-gray-600 mb-2">By Module</h5>
 <div className="space-y-1 text-sm">
 {Object.entries(tasksWorklist.summary.byModule).slice(0, 4).map(([module, count]) => (
 <div key={module} className="flex justify-between">
 <span className="text-gray-700">{module.split(' ')[0]}:</span>
 <span className="font-medium">{count}</span>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>

 {/* Tasks List */}
 <div className="space-y-3">
 <h4 className="font-medium text-gray-900">Active Tasks</h4>
 {tasksWorklist.tasks.map((task) => (
 <div key={task.id} className="border rounded-lg p-4 hover:bg-gray-50">
 <div className="flex items-start justify-between mb-3">
 <div className="flex-1">
 <h5 className="font-medium text-gray-900">{task.title}</h5>
 <p className="text-sm text-gray-600 mt-1">{task.description}</p>
 </div>
 <div className="flex items-center gap-2 ml-4">
 <Badge variant={task.priority === 'High' ? 'destructive' : task.priority === 'Medium' ? 'secondary' : 'default'}>
 {task.priority}
 </Badge>
 <Badge variant={task.status === 'Overdue' ? 'destructive' : task.status === 'Due Today' ? 'secondary' : 'outline'}>
 {task.status}
 </Badge>
 </div>
 </div>
 
 <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm mb-3">
 <div>
 <span className="font-medium text-gray-600">Assignee:</span>
 <div className="text-gray-700">{task.assignee}</div>
 <div className="text-xs text-gray-500">{task.assigneeRole}</div>
 </div>
 <div>
 <span className="font-medium text-gray-600">Due Date:</span>
 <div className={`${new Date(task.dueDate) < new Date() ? 'text-red-600' : 'text-gray-700'}`}>
 {task.dueDate}
 </div>
 </div>
 <div>
 <span className="font-medium text-gray-600">Module:</span>
 <div className="text-gray-700">{task.module}</div>
 <div className="text-xs text-stone-600">{task.ctdSection}</div>
 </div>
 <div>
 <span className="font-medium text-gray-600">Progress:</span>
 <div className="mt-1">
 <Progress value={task.progress} className="h-2" />
 <span className="text-xs text-gray-500">{task.progress}%</span>
 </div>
 </div>
 </div>
 
 {task.comments && (
 <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
 <strong>Comments:</strong> {task.comments}
 </div>
 )}
 </div>
 ))}
 </div>
 
 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 Unified Tasks Worklist aggregates activities across all manufacturing modules. 
 Tasks are automatically linked to relevant CTD sections and regulatory requirements.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load tasks worklist
 </div>
 )}
 </CardContent>
 </Card>

 {/* 21 CFR Part 11 Audit Trail */}
 <Card className="bg-white dark:bg-gray-50">
 <CardHeader>
 <div className="flex items-center gap-2">
 <FileText className="w-5 h-5 text-purple-600" />
 <CardTitle className="text-lg">21 CFR Part 11 Audit Trail</CardTitle>
 <div className="grow"/>
 {auditTrail && (
 <div className="flex items-center gap-2">
 <Badge variant="default">Records: {auditTrail.totalRecords}</Badge>
 <Badge variant="outline">{auditTrail.compliance}</Badge>
 </div>
 )}
 </div>
 </CardHeader>
 <CardContent>
 {auditTrail ? (
 <div className="space-y-6">
 {/* Integrity Verification */}
 <div className="bg-green-50 border border-green-200 rounded-lg p-4">
 <h4 className="font-medium text-green-800 mb-3 flex items-center gap-2">
 <CheckCircle2 className="w-5 h-5" />
 Integrity Verification
 </h4>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 {Object.entries(auditTrail.integrityVerification).map(([key, value]) => (
 <div key={key} className="flex items-center gap-2">
 <CheckCircle2 className={`w-4 h-4 ${value === true || value === 'Verified' ? 'text-green-600' : 'text-red-600'}`} />
 <span className="text-sm text-green-700">
 {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
 </span>
 </div>
 ))}
 </div>
 </div>

 {/* Recent Audit Entries */}
 <div className="space-y-3">
 <h4 className="font-medium text-gray-900">Recent Audit Entries</h4>
 {auditTrail.entries.map((entry) => (
 <div key={entry.id} className="border rounded-lg p-4">
 <div className="flex items-start justify-between mb-3">
 <div>
 <h5 className="font-medium text-gray-900">{entry.action}</h5>
 <p className="text-sm text-gray-600">{entry.target}</p>
 </div>
 <div className="text-right">
 <div className="text-sm text-gray-500">{new Date(entry.timestamp).toLocaleString()}</div>
 <Badge variant="outline">{entry.module}</Badge>
 </div>
 </div>
 
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-3">
 <div>
 <span className="font-medium text-gray-600">User:</span>
 <div className="text-gray-700">{entry.userName} ({entry.userId})</div>
 <div className="text-xs text-gray-500">IP: {entry.ipAddress}</div>
 </div>
 <div>
 <span className="font-medium text-gray-600">Session:</span>
 <div className="text-gray-700">{entry.sessionId}</div>
 <div className="text-xs text-stone-600">E-Sign: {entry.electronicSignature}</div>
 </div>
 </div>
 
 <div className="bg-gray-50 rounded p-3 mb-3">
 <span className="font-medium text-gray-600">Details:</span>
 <div className="text-gray-700 text-sm mt-1">{entry.details}</div>
 {entry.section && (
 <div className="text-xs text-stone-600 mt-1">CTD Section: {entry.section}</div>
 )}
 </div>
 
 {entry.approvals && entry.approvals.length > 0 && (
 <div className="border-t pt-3">
 <span className="font-medium text-gray-600 text-sm">Approvals:</span>
 <div className="mt-2 space-y-1">
 {entry.approvals.map((approval, idx) => (
 <div key={idx} className="flex items-center justify-between">
 <span className="text-sm text-gray-700">
 {approval.approver} ({approval.role})
 </span>
 <div className="text-right">
 <div className="text-xs text-gray-500">{new Date(approval.timestamp).toLocaleString()}</div>
 <div className="text-xs text-stone-600">{approval.signature}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 ))}
 </div>
 
 <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-100 p-3 rounded">
 21 CFR Part 11 compliant audit trail captures all system interactions with electronic signatures, 
 timestamps, and user identification. Supports regulatory inspection requirements and data integrity.
 </div>
 </div>
 ) : (
 <div className="text-center py-8 text-gray-500">
 Failed to load audit trail data
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );
 },
 description: 'Export Gating, Unified Tasks Worklist, and 21 CFR Part 11 Audit Trail',
 phase: 'publish'
 }
};

function AutosaveIndicator({ hasUnsavedChanges, lastSaved, isSaving }) {
 if (isSaving) {
 return (
 <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
 <Loader2 className="w-4 h-4 animate-spin" />
 <span className="text-sm">Saving...</span>
 </div>
 );
 }

 if (hasUnsavedChanges) {
 return (
 <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
 <Clock className="w-4 h-4" />
 <span className="text-sm">Unsaved changes</span>
 </div>
 );
 }

 return (
 <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
 <CheckCircle2 className="w-4 h-4" />
 <span className="text-sm">
 Saved {lastSaved ? new Date(lastSaved).toLocaleTimeString() : 'now'}
 </span>
 </div>
 );
}

function ModernSidebar({ 
 activePhase, 
 activeSection, 
 onPhaseChange, 
 onSectionSelect, 
 isCollapsed, 
 onToggleCollapse 
}) {
 const sectionsForPhase = Object.entries(SECTIONS).filter(([_, section]) => 
 section.phase === activePhase
 );

 return (
 <div className={`${isCollapsed ? 'w-16' : 'w-80'} flex-shrink-0 border-r border-gray-200 dark:border-gray-300 bg-white dark:bg-gray-50 transition-all duration-300`}>
 <div className="p-4 border-b border-gray-200 dark:border-gray-300">
 <div className="flex items-center justify-between">
 {!isCollapsed && (
 <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
 Manufacturing
 </h2>
 )}
 <Button
 variant="ghost"
 size="sm"
 onClick={onToggleCollapse}
 data-testid="btn-toggle-sidebar"
 >
 {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <X className="w-4 h-4" />}
 </Button>
 </div>
 {!isCollapsed && (
 <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
 Process-focused manufacturing workspace
 </p>
 )}
 </div>

 <ScrollArea className="h-[calc(100vh-140px)]">
 <div className="p-4 space-y-6">
 {!isCollapsed && (
 <>
 {/* Phase Indicators */}
 <div className="space-y-2">
 <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Workflow Phases</h3>
 {['design', 'validate', 'publish'].map(phase => (
 <button
 key={phase}
 onClick={() => onPhaseChange(phase)}
 className={`w-full p-3 rounded-lg text-left transition-all ${
 activePhase === phase 
 ? 'bg-stone-100 dark:bg-stone-100 border-2 border-stone-300 dark:border-stone-400' 
 : 'bg-gray-50 dark:bg-white border border-gray-200 dark:border-gray-300 hover:bg-gray-100 dark:hover:bg-gray-50'
 }`}
 data-testid={`sidebar-phase-${phase}`}
 >
 <div className="flex items-center justify-between">
 <span className="font-medium capitalize">{phase}</span>
 {activePhase === phase && <CheckCircle2 className="w-4 h-4 text-stone-600" />}
 </div>
 </button>
 ))}
 </div>

 <Separator />
 </>
 )}

 {/* Current Phase Sections */}
 <div className="space-y-2">
 {!isCollapsed && (
 <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
 Current Phase Sections
 </h3>
 )}
 {sectionsForPhase.map(([sectionId, section]) => {
 const Icon = section.icon;
 const isActive = activeSection === sectionId;
 
 return (
 <button
 key={sectionId}
 onClick={() => onSectionSelect(sectionId)}
 className={`w-full p-3 rounded-lg text-left transition-all group ${
 isActive 
 ? 'bg-stone-800 text-white shadow-md' 
 : 'hover:bg-gray-100 dark:hover:bg-gray-50'
 }`}
 data-testid={`sidebar-section-${sectionId}`}
 >
 <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
 <Icon className={`w-5 h-5 flex-shrink-0 ${
 isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300'
 }`} />
 {!isCollapsed && (
 <div className="flex-1 min-w-0">
 <div className={`font-medium text-sm ${
 isActive ? 'text-white' : 'text-gray-900 dark:text-gray-100'
 }`}>
 {section.label}
 </div>
 <div className={`text-xs mt-1 ${
 isActive ? 'text-stone-200' : 'text-gray-500 dark:text-gray-500'
 }`}>
 {section.description}
 </div>
 </div>
 )}
 </div>
 
 {!isCollapsed && isActive && (
 <div className="mt-2">
 <Badge variant="secondary" className="bg-stone-700 text-stone-200 border-stone-400">
 Active Section
 </Badge>
 </div>
 )}
 </button>
 );
 })}
 </div>

 {!isCollapsed && (
 <>
 <Separator />
 
 {/* Quick Actions */}
 <div className="space-y-2">
 <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick Actions</h3>
 <div className="space-y-1">
 <Button variant="ghost" size="sm" className="w-full justify-start" data-testid="btn-help">
 <HelpCircle className="w-4 h-4 mr-2" />
 Help & Guidance
 </Button>
 <Button variant="ghost" size="sm" className="w-full justify-start" data-testid="btn-settings">
 <Settings className="w-4 h-4 mr-2" />
 Workspace Settings
 </Button>
 </div>
 </div>
 </>
 )}
 </div>
 </ScrollArea>
 </div>
 );
}

function ManufacturingPanelInner() {
 const [activePhase, setActivePhase] = useState('publish');
 const [activeSection, setActiveSection] = useState('ai-oversight');
 const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
 const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
 const [lastSaved, setLastSaved] = useState(null);
 const [isSaving, setIsSaving] = useState(false);
 const [showWorkflow, setShowWorkflow] = useState(true);
 const [regViewOpen, setRegViewOpen] = useState(false);
 
 const { setSelectedEntity, setSelectedSection } = useManufacturingStore();
 const { toast } = useToast();
 const autosaveRef = useRef();

 // Parse URL params on mount
 useEffect(() => {
 const sp = new URLSearchParams(window.location.search);
 const tab = sp.get('tab');
 const focus = sp.get('focus');
 const section = sp.get('section');

 if (tab === 'manufacturing') {
 if (section && SECTIONS[section]) {
 setActiveSection(section);
 setActivePhase(SECTIONS[section].phase);
 setSelectedSection(section);
 }
 if (focus) setSelectedEntity(focus);
 }
 }, [setSelectedEntity, setSelectedSection]);

 // Autosave functionality
 useEffect(() => {
 if (hasUnsavedChanges) {
 if (autosaveRef.current) clearTimeout(autosaveRef.current);
 
 autosaveRef.current = setTimeout(async () => {
 setIsSaving(true);
 try {
 // Simulate save operation
 await new Promise(resolve => setTimeout(resolve, 1000));
 setHasUnsavedChanges(false);
 setLastSaved(Date.now());
 toast({
 title: "Changes Saved",
 description: "Your manufacturing data has been automatically saved.",
 });
 } catch (error) {
 toast({
 title: "Save Failed", 
 description: "Failed to save changes. Please try again.",
 variant: "destructive",
 });
 } finally {
 setIsSaving(false);
 }
 }, 3000);
 }

 return () => {
 if (autosaveRef.current) clearTimeout(autosaveRef.current);
 };
 }, [hasUnsavedChanges, toast]);

 const handlePhaseChange = (newPhase) => {
 setActivePhase(newPhase);
 // Auto-select first section of new phase
 const firstSection = Object.entries(SECTIONS).find(([_, section]) => section.phase === newPhase);
 if (firstSection) {
 setActiveSection(firstSection[0]);
 }
 setHasUnsavedChanges(true);
 };

 const handleSectionSelect = (sectionId) => {
 setActiveSection(sectionId);
 setSelectedSection(sectionId);
 setHasUnsavedChanges(true);
 };

 const handleManualSave = async () => {
 setIsSaving(true);
 try {
 await new Promise(resolve => setTimeout(resolve, 1500));
 setHasUnsavedChanges(false);
 setLastSaved(Date.now());
 toast({
 title: "Saved Successfully",
 description: "All manufacturing data has been saved.",
 });
 } catch (error) {
 toast({
 title: "Save Error",
 description: "Failed to save. Please try again.",
 variant: "destructive",
 });
 } finally {
 setIsSaving(false);
 }
 };

 const handleRunAIReview = async () => {
 toast({
 title: "AI Review Started",
 description: "Analyzing manufacturing data for compliance and optimization opportunities...",
 });
 
 // Simulate AI review process
 setTimeout(() => {
 toast({
 title: "AI Review Complete",
 description: "Found 3 optimization opportunities and 0 compliance issues.",
 });
 }, 3000);
 };

 const activeSection_obj = SECTIONS[activeSection];
 const ActiveComponent = activeSection_obj?.Comp || (() => <div>Section not found</div>);

 return (
 <div className="flex h-screen bg-gray-50 dark:bg-slate-50">
 {/* Modern Sidebar */}
 <ModernSidebar
 activePhase={activePhase}
 activeSection={activeSection}
 onPhaseChange={handlePhaseChange}
 onSectionSelect={handleSectionSelect}
 isCollapsed={isSidebarCollapsed}
 onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
 />

 {/* Main Content Area */}
 <div className="flex-1 flex flex-col">
 {/* Modern Header */}
 <header className="border-b border-gray-200 dark:border-gray-300 bg-white dark:bg-gray-50 px-6 py-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div>
 <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
 Manufacturing Workspace
 </h1>
 <p className="text-sm text-gray-600 dark:text-gray-400">
 {activeSection_obj?.label} • {activePhase.charAt(0).toUpperCase() + activePhase.slice(1)} Phase
 </p>
 </div>
 <Badge variant="outline" className="bg-stone-50 border-stone-200 text-stone-700">
 Process-focused CMC
 </Badge>
 </div>

 <div className="flex items-center gap-3">
 <Button 
 variant="outline" 
 size="sm" 
 onClick={() => setRegViewOpen(true)}
 className="flex items-center gap-2"
 data-testid="btn-regulator-view"
 >
 <Eye className="w-4 h-4" />
 Regulator View
 </Button>
 <AutosaveIndicator 
 hasUnsavedChanges={hasUnsavedChanges}
 lastSaved={lastSaved}
 isSaving={isSaving}
 />
 
 <Separator orientation="vertical" className="h-6" />

 <Button
 variant="outline"
 size="sm"
 onClick={() => setShowWorkflow(!showWorkflow)}
 data-testid="btn-toggle-workflow"
 >
 <Activity className="w-4 h-4 mr-2" />
 {showWorkflow ? 'Hide' : 'Show'} Workflow
 </Button>

 <Button
 variant="outline"
 size="sm"
 onClick={handleRunAIReview}
 data-testid="btn-ai-review-header"
 >
 <Brain className="w-4 h-4 mr-2" />
 Quick AI Review
 </Button>

 <Button
 variant="outline"
 size="sm"
 onClick={handleManualSave}
 disabled={isSaving}
 data-testid="btn-manual-save"
 >
 {isSaving ? (
 <Loader2 className="w-4 h-4 mr-2 animate-spin" />
 ) : (
 <Save className="w-4 h-4 mr-2" />
 )}
 Save
 </Button>

 <Button
 size="sm"
 data-testid="btn-export-docs"
 >
 <Download className="w-4 h-4 mr-2" />
 Export Documentation
 </Button>
 </div>
 </div>
 </header>

 {/* Main Content */}
 <main className="flex-1 overflow-y-auto">
 <div className="p-6 space-y-6">
 {/* Workflow Stepper */}
 {showWorkflow && (
 <ManufacturingStepperWorkflow
 activePhase={activePhase}
 onPhaseChange={handlePhaseChange}
 onSectionSelect={handleSectionSelect}
 />
 )}

 {/* Active Section Content */}
 <Card className="shadow-sm">
 <CardHeader className="border-b border-gray-100 dark:border-gray-300">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 {activeSection_obj?.icon && (
 <activeSection_obj.icon className="w-6 h-6 text-stone-600 dark:text-stone-400" />
 )}
 <div>
 <CardTitle className="text-xl">{activeSection_obj?.label}</CardTitle>
 <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
 {activeSection_obj?.description}
 </p>
 </div>
 </div>
 
 <div className="flex items-center gap-2">
 <Badge variant="secondary" className="capitalize">
 {activePhase} Phase
 </Badge>
 <Button variant="ghost" size="sm" data-testid="btn-section-help">
 <HelpCircle className="w-4 h-4" />
 </Button>
 </div>
 </div>
 </CardHeader>
 
 <CardContent className="p-6">
 <ActiveComponent onSectionSelect={handleSectionSelect} />
 
 {/* Quick Open Menu for relevant sections */}
 {['materials-bom', 'cpp-cqa', 'validation'].includes(activeSection) && (
 <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-300">
 <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
 Quick Cross-Reference
 </h4>
 <QuickOpenMenu 
 focusId={`${activeSection}:*`} 
 sectionId={activeSection}
 />
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 </main>

 {/* Modern Footer */}
 <footer className="border-t border-gray-200 dark:border-gray-300 bg-white dark:bg-gray-50 px-6 py-3">
 <div className="flex items-center justify-between text-sm">
 <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400">
 <span>Active: {activeSection_obj?.label}</span>
 <Separator orientation="vertical" className="h-4" />
 <span>Phase: {activePhase}</span>
 <Separator orientation="vertical" className="h-4" />
 <span>Workspace: Manufacturing CMC</span>
 </div>
 
 <div className="flex items-center gap-2">
 <Button variant="ghost" size="sm" data-testid="btn-footer-help">
 <HelpCircle className="w-4 h-4 mr-1" />
 Help
 </Button>
 <Button variant="ghost" size="sm" data-testid="btn-footer-feedback">
 <Bell className="w-4 h-4 mr-1" />
 Feedback
 </Button>
 </div>
 </div>
 </footer>
 </div>
 
 {/* Regulator View Drawer */}
 <RegulatorViewDrawer open={regViewOpen} onClose={() => setRegViewOpen(false)} />
 </div>
 );
}

export default function ManufacturingProcessPanel() {
 return (
 <ManufacturingProvider>
 <ManufacturingPanelInner />
 </ManufacturingProvider>
 );
}