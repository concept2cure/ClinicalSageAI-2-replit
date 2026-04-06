import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import {
 CheckCircle2,
 Clock,
 AlertTriangle,
 FileText,
 User,
 Calendar,
 ArrowRight,
} from 'lucide-react';

const GapResolutionModal = ({ isOpen, onClose, data }) => {
 const [currentStep, setCurrentStep] = useState(1);
 const [stepData, setStepData] = useState({});
 const [isCompleting, setIsCompleting] = useState(false);

 if (!data) return null;

 const { methodId, gap, workflow, onComplete } = data;
 const progress = (currentStep / workflow.totalSteps) * 100;

 const handleStepComplete = async stepNumber => {
 const stepInfo = workflow.steps.find(s => s.step === stepNumber);
 if (!stepInfo) return;

 try {
 setIsCompleting(true);

 // Record step completion
 const currentOrgId = localStorage.getItem('currentOrganization') || '7';
 const headers = {
 'x-tenant-id': currentOrgId,
 'x-user-name': 'Current User',
 'Content-Type': 'application/json',
 };

 const response = await fetch(`/api/analytical/methods/${methodId}/gaps/${gap.id}/resolve`, {
 method: 'POST',
 headers,
 body: JSON.stringify({
 resolutionData: {
 step: stepNumber,
 stepTitle: stepInfo.title,
 completedData: stepData[stepNumber] || {},
 timestamp: new Date().toISOString(),
 },
 assignedTo: 'Current User',
 }),
 });

 if (response.ok) {
 if (stepNumber < workflow.totalSteps) {
 setCurrentStep(stepNumber + 1);
 } else {
 // All steps completed
 toast({ title: 'Gap resolution completed successfully!' });
 onComplete?.();
 onClose();
 }
 }
 } catch (error) {
 console.error('Error completing step:', error);
 toast({ title: 'Failed to complete step' });
 } finally {
 setIsCompleting(false);
 }
 };

 const updateStepData = (stepNumber, field, value) => {
 setStepData(prev => ({
 ...prev,
 [stepNumber]: {
 ...prev[stepNumber],
 [field]: value,
 },
 }));
 };

 const severityColor = severity => {
 switch (severity) {
 case 'CRITICAL':
 return 'bg-red-600';
 case 'HIGH':
 return 'bg-orange-600';
 case 'MEDIUM':
 return 'bg-yellow-600';
 default:
 return 'bg-gray-600';
 }
 };

 return (
 <Dialog open={isOpen} onOpenChange={onClose}>
 <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-3">
 <AlertTriangle className="h-5 w-5 text-red-500" />
 Gap Resolution Workflow
 </DialogTitle>
 </DialogHeader>

 <div className="space-y-6">
 {/* Gap Information */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <CardTitle className="text-lg">{gap.title}</CardTitle>
 <Badge className={severityColor(gap.severity)}>{gap.severity}</Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 <div>
 <strong>ICH Rule:</strong> {gap.ruleId}
 </div>
 <div>
 <strong>Section:</strong> {gap.section}
 </div>
 <div>
 <strong>Reason:</strong> {gap.why}
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Workflow Progress */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-lg">{workflow.title}</CardTitle>
 <div className="text-sm text-gray-600">
 Estimated Time: {workflow.estimatedTime} • Step {currentStep} of{' '}
 {workflow.totalSteps}
 </div>
 </CardHeader>
 <CardContent>
 <Progress value={progress} className="h-3 mb-4" />

 {/* Workflow Steps */}
 <div className="space-y-4">
 {workflow.steps.map((step, index) => {
 const isCurrentStep = step.step === currentStep;
 const isCompleted = step.step < currentStep;
 const isUpcoming = step.step > currentStep;

 return (
 <div
 key={step.step}
 className={`border rounded-lg p-4 ${
 isCurrentStep
 ? 'border-stone-500 bg-stone-50'
 : isCompleted
 ? 'border-green-500 bg-green-50'
 : 'border-gray-200'
 }`}
 >
 <div className="flex items-start gap-3">
 <div
 className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
 isCompleted
 ? 'bg-green-600 text-white'
 : isCurrentStep
 ? 'bg-stone-800 text-white'
 : 'bg-gray-300 text-gray-600'
 }`}
 >
 {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.step}
 </div>

 <div className="flex-1">
 <div className="flex items-center justify-between mb-2">
 <h4 className="font-medium">{step.title}</h4>
 <div className="flex items-center gap-2 text-sm text-gray-500">
 <Clock className="h-4 w-4" />
 {step.timeEstimate}
 </div>
 </div>

 <p className="text-sm text-gray-600 mb-3">{step.description}</p>

 <div className="text-sm">
 <strong>Deliverables:</strong>
 <ul className="list-disc list-inside mt-1 text-gray-600">
 {step.deliverables.map((deliverable, i) => (
 <li key={i}>{deliverable}</li>
 ))}
 </ul>
 </div>

 {/* Current Step Input Fields */}
 {isCurrentStep && (
 <div className="mt-4 space-y-3 border-t pt-3">
 <div>
 <Label htmlFor={`notes-${step.step}`}>Notes & Results</Label>
 <Textarea
 id={`notes-${step.step}`}
 placeholder="Document your work, results, and any observations..."
 value={stepData[step.step]?.notes || ''}
 onChange={e => updateStepData(step.step, 'notes', e.target.value)}
 className="mt-1"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div>
 <Label htmlFor={`assignee-${step.step}`}>Completed By</Label>
 <Input
 id={`assignee-${step.step}`}
 value={stepData[step.step]?.assignee || 'Current User'}
 onChange={e =>
 updateStepData(step.step, 'assignee', e.target.value)
 }
 className="mt-1"
 />
 </div>
 <div>
 <Label htmlFor={`date-${step.step}`}>Completion Date</Label>
 <Input
 id={`date-${step.step}`}
 type="date"
 value={
 stepData[step.step]?.completionDate ||
 new Date().toISOString().split('T')[0]
 }
 onChange={e =>
 updateStepData(step.step, 'completionDate', e.target.value)
 }
 className="mt-1"
 />
 </div>
 </div>

 <Button
 onClick={() => handleStepComplete(step.step)}
 disabled={isCompleting}
 className="w-full"
 >
 {isCompleting
 ? 'Completing...'
 : step.step === workflow.totalSteps
 ? 'Complete Resolution'
 : 'Complete Step & Continue'}
 {step.step < workflow.totalSteps && (
 <ArrowRight className="ml-2 h-4 w-4" />
 )}
 </Button>
 </div>
 )}

 {/* Completed Step Summary */}
 {isCompleted && stepData[step.step] && (
 <div className="mt-3 p-3 bg-green-100 rounded border-l-4 border-green-500">
 <div className="text-sm">
 <div className="font-medium text-green-800">Completed</div>
 {stepData[step.step].notes && (
 <div className="mt-1 text-green-700">
 {stepData[step.step].notes}
 </div>
 )}
 <div className="flex items-center gap-4 mt-2 text-xs text-green-600">
 <div className="flex items-center gap-1">
 <User className="h-3 w-3" />
 {stepData[step.step].assignee}
 </div>
 <div className="flex items-center gap-1">
 <Calendar className="h-3 w-3" />
 {stepData[step.step].completionDate}
 </div>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </CardContent>
 </Card>
 </div>

 <div className="flex justify-end gap-3 pt-4 border-t">
 <Button variant="outline" onClick={onClose}>
 Close
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 );
};

export default GapResolutionModal;
