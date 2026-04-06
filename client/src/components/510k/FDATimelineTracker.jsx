import React, { useState, useEffect, useCallback } from 'react';
import {
 Card,
 CardContent,
 CardDescription,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from '@/components/ui/tooltip';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
} from '@/components/ui/dialog';
import {
 Clock,
 Calendar,
 CheckCircle2,
 AlertCircle,
 Timer,
 TrendingUp,
 Activity,
 FileCheck,
 Mail,
 Phone,
 Flag,
 Target,
 AlertTriangle,
 Info,
 ChevronRight,
 Download,
 RefreshCw,
 Milestone,
 CalendarDays,
 Play,
 Pause,
} from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import { format, addDays, differenceInDays, isWeekend } from 'date-fns';

/**
 * FDA 510(k) Day 1-100 Timeline Tracker
 * 
 * Tracks the FDA review process timeline with specific milestones:
 * - Day 1: FDA receives submission
 * - Day 7: Acceptance review complete
 * - Day 15: Substantive review begins or RTA issued
 * - Day 60: Interactive review - Additional Information (AI) request possible
 * - Day 90: FDA decision target
 * - Day 100: Extended review if needed
 * 
 * Features:
 * - Real-time day counting with business days
 * - Milestone tracking and alerts
 * - FDA correspondence tracking
 * - Predictive timeline based on review type
 * - Clock stop/restart for Additional Information periods
 */

// FDA Review Milestones based on MDUFA V commitments
const FDA_MILESTONES = [
 {
 day: 1,
 title: 'Submission Received',
 description: 'FDA acknowledges receipt of 510(k) submission',
 type: 'start',
 icon: <Play className="h-4 w-4" />,
 color: 'bg-stone-700',
 },
 {
 day: 7,
 title: 'Acceptance Review',
 description: 'FDA completes acceptance review (RTA decision)',
 type: 'review',
 icon: <FileCheck className="h-4 w-4" />,
 color: 'bg-amber-500',
 critical: true,
 },
 {
 day: 15,
 title: 'Substantive Review Start',
 description: 'Substantive review begins if accepted',
 type: 'review',
 icon: <Activity className="h-4 w-4" />,
 color: 'bg-purple-500',
 },
 {
 day: 30,
 title: 'Initial Assessment',
 description: 'FDA completes initial technical assessment',
 type: 'checkpoint',
 icon: <Target className="h-4 w-4" />,
 color: 'bg-indigo-500',
 },
 {
 day: 60,
 title: 'Interactive Review',
 description: 'Additional Information (AI) request deadline',
 type: 'decision',
 icon: <Mail className="h-4 w-4" />,
 color: 'bg-orange-500',
 critical: true,
 },
 {
 day: 90,
 title: 'FDA Decision Target',
 description: 'Target date for FDA decision (SE/NSE)',
 type: 'decision',
 icon: <Flag className="h-4 w-4" />,
 color: 'bg-green-500',
 critical: true,
 },
 {
 day: 100,
 title: 'Extended Review',
 description: 'Extended review period if needed',
 type: 'extended',
 icon: <Timer className="h-4 w-4" />,
 color: 'bg-red-500',
 },
];

// Review types and their typical timelines
const REVIEW_TYPES = {
 traditional: {
 name: 'Traditional 510(k)',
 days: 90,
 description: 'Standard review timeline',
 },
 special: {
 name: 'Special 510(k)',
 days: 30,
 description: 'Expedited review for device modifications',
 },
 abbreviated: {
 name: 'Abbreviated 510(k)',
 days: 90,
 description: 'Guidance document or consensus standard pathway',
 },
};

export default function FDATimelineTracker({
 submissionId,
 projectId,
 submissionDate: initialSubmissionDate,
 reviewType: initialReviewType = 'traditional',
 onMilestoneReached,
 onTimelineUpdate,
}) {
 const { toast } = useToast();
 const [submissionDate, setSubmissionDate] = useState(initialSubmissionDate || null);
 const [reviewType, setReviewType] = useState(initialReviewType);
 const [currentDay, setCurrentDay] = useState(0);
 const [milestoneStatus, setMilestoneStatus] = useState({});
 const [clockStopped, setClockStopped] = useState(false);
 const [clockStopDate, setClockStopDate] = useState(null);
 const [clockStopDays, setClockStopDays] = useState(0);
 const [correspondences, setCorrespondences] = useState([]);
 const [activeTab, setActiveTab] = useState('timeline');
 const [showStartDialog, setShowStartDialog] = useState(false);
 const [notes, setNotes] = useState({});

 // Calculate business days (excluding weekends)
 const calculateBusinessDays = useCallback((startDate, endDate) => {
 let days = 0;
 let current = new Date(startDate);
 const end = new Date(endDate);
 
 while (current <= end) {
 if (!isWeekend(current)) {
 days++;
 }
 current = addDays(current, 1);
 }
 return days;
 }, []);

 // Calculate current review day
 useEffect(() => {
 if (!submissionDate) return;

 const calculateCurrentDay = () => {
 const now = new Date();
 const start = new Date(submissionDate);
 
 if (clockStopped && clockStopDate) {
 // Clock is stopped, use the day when it was stopped
 const stopDate = new Date(clockStopDate);
 return calculateBusinessDays(start, stopDate);
 } else if (clockStopDays > 0) {
 // Clock was stopped but now running, subtract stopped days
 const totalDays = calculateBusinessDays(start, now);
 return totalDays - clockStopDays;
 } else {
 // Normal counting
 return calculateBusinessDays(start, now);
 }
 };

 const updateDay = () => {
 const day = calculateCurrentDay();
 setCurrentDay(day);
 
 // Check for milestone alerts
 FDA_MILESTONES.forEach(milestone => {
 if (day === milestone.day && !milestoneStatus[milestone.day]) {
 handleMilestoneReached(milestone);
 }
 });
 };

 updateDay();
 const interval = setInterval(updateDay, 60000); // Update every minute

 return () => clearInterval(interval);
 }, [submissionDate, clockStopped, clockStopDate, clockStopDays, milestoneStatus]);

 // Handle milestone reached
 const handleMilestoneReached = (milestone) => {
 setMilestoneStatus(prev => ({
 ...prev,
 [milestone.day]: 'reached',
 }));

 toast({
 title: `Milestone Reached: Day ${milestone.day}`,
 description: milestone.title,
 variant: milestone.critical ? 'destructive' : 'default',
 });

 if (onMilestoneReached) {
 onMilestoneReached(milestone);
 }
 };

 // Start submission timeline
 const startTimeline = (date) => {
 setSubmissionDate(date);
 setCurrentDay(0);
 setMilestoneStatus({});
 setClockStopped(false);
 setClockStopDays(0);
 
 // Add initial correspondence
 addCorrespondence({
 type: 'submission',
 date: date,
 description: '510(k) Submission Filed',
 day: 1,
 });

 toast({
 title: 'Timeline Started',
 description: 'FDA 510(k) review timeline is now active',
 });
 };

 // Stop/Start clock for Additional Information period
 const toggleClock = () => {
 if (clockStopped) {
 // Restart clock
 const stopDate = new Date(clockStopDate);
 const now = new Date();
 const stoppedDays = calculateBusinessDays(stopDate, now);
 
 setClockStopDays(prev => prev + stoppedDays);
 setClockStopped(false);
 setClockStopDate(null);
 
 addCorrespondence({
 type: 'clock_restart',
 date: now,
 description: 'FDA Clock Restarted - Response Submitted',
 day: currentDay,
 });
 
 toast({
 title: 'Clock Restarted',
 description: `Review timeline resumed after ${stoppedDays} business days`,
 });
 } else {
 // Stop clock
 const now = new Date();
 setClockStopped(true);
 setClockStopDate(now);
 
 addCorrespondence({
 type: 'ai_request',
 date: now,
 description: 'FDA Additional Information Request - Clock Stopped',
 day: currentDay,
 });
 
 toast({
 title: 'Clock Stopped',
 description: 'FDA review clock paused for Additional Information',
 variant: 'destructive',
 });
 }
 };

 // Add correspondence
 const addCorrespondence = (correspondence) => {
 setCorrespondences(prev => [...prev, {
 ...correspondence,
 id: Date.now(),
 timestamp: new Date().toISOString(),
 }]);
 };

 // Calculate predicted decision date
 const getPredictedDecisionDate = useCallback(() => {
 if (!submissionDate) return null;
 
 const targetDays = REVIEW_TYPES[reviewType].days;
 let workingDays = 0;
 let currentDate = new Date(submissionDate);
 
 while (workingDays < targetDays + clockStopDays) {
 currentDate = addDays(currentDate, 1);
 if (!isWeekend(currentDate)) {
 workingDays++;
 }
 }
 
 return currentDate;
 }, [submissionDate, reviewType, clockStopDays]);

 // Export timeline report
 const exportTimelineReport = () => {
 const report = {
 submissionId,
 projectId,
 submissionDate,
 reviewType: REVIEW_TYPES[reviewType].name,
 currentDay,
 clockStopDays,
 predictedDecisionDate: getPredictedDecisionDate(),
 milestones: FDA_MILESTONES.map(m => ({
 ...m,
 status: milestoneStatus[m.day] || 'pending',
 notes: notes[m.day],
 })),
 correspondences,
 };

 const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `FDA_Timeline_Report_${new Date().toISOString().split('T')[0]}.json`;
 a.click();
 
 toast({
 title: 'Report Exported',
 description: 'Timeline report downloaded successfully',
 });
 };

 const progress = Math.min(100, (currentDay / REVIEW_TYPES[reviewType].days) * 100);
 const predictedDate = getPredictedDecisionDate();
 const daysRemaining = predictedDate ? differenceInDays(predictedDate, new Date()) : null;

 return (
 <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
 {/* Header Card */}
 <Card className="border-2 border-purple-200 bg-purple-50/50">
 <CardHeader>
 <div className="flex justify-between items-start">
 <div>
 <CardTitle className="text-2xl flex items-center gap-2">
 <Clock className="h-6 w-6 text-purple-600" />
 FDA 510(k) Review Timeline
 </CardTitle>
 <CardDescription className="mt-2">
 Track your submission through the FDA Day 1-100 review process
 </CardDescription>
 </div>
 <div className="flex gap-2">
 <Select value={reviewType} onValueChange={setReviewType}>
 <SelectTrigger className="w-[200px]">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(REVIEW_TYPES).map(([key, type]) => (
 <SelectItem key={key} value={key}>
 {type.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button
 variant="outline"
 onClick={exportTimelineReport}
 className="gap-2"
 >
 <Download className="h-4 w-4" />
 Export Report
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {submissionDate ? (
 <div className="space-y-4">
 {/* Timeline Status */}
 <div className="grid grid-cols-4 gap-4">
 <div className="text-center p-4 bg-white rounded-lg">
 <p className="text-sm text-gray-600">Current Day</p>
 <p className="text-3xl font-bold text-purple-600">
 {clockStopped ? (
 <span className="flex items-center justify-center gap-1">
 {currentDay}
 <Pause className="h-5 w-5 text-red-500" />
 </span>
 ) : (
 currentDay
 )}
 </p>
 {clockStopped && (
 <Badge variant="destructive" className="mt-1 text-xs">
 Clock Stopped
 </Badge>
 )}
 </div>
 <div className="text-center p-4 bg-white rounded-lg">
 <p className="text-sm text-gray-600">Target Decision</p>
 <p className="text-xl font-semibold">
 Day {REVIEW_TYPES[reviewType].days}
 </p>
 <p className="text-xs text-gray-500 mt-1">
 {REVIEW_TYPES[reviewType].description}
 </p>
 </div>
 <div className="text-center p-4 bg-white rounded-lg">
 <p className="text-sm text-gray-600">Predicted Date</p>
 <p className="text-lg font-semibold">
 {predictedDate ? format(predictedDate, 'MMM dd, yyyy') : 'N/A'}
 </p>
 {daysRemaining !== null && (
 <p className="text-xs text-gray-500 mt-1">
 {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Overdue'}
 </p>
 )}
 </div>
 <div className="text-center p-4 bg-white rounded-lg">
 <p className="text-sm text-gray-600">Clock Stop Days</p>
 <p className="text-2xl font-bold text-orange-600">
 {clockStopDays}
 </p>
 <Button
 size="sm"
 variant={clockStopped ? 'destructive' : 'outline'}
 onClick={toggleClock}
 className="mt-2"
 >
 {clockStopped ? 'Restart Clock' : 'Stop Clock'}
 </Button>
 </div>
 </div>

 {/* Progress Bar */}
 <div>
 <div className="flex justify-between text-sm mb-2">
 <span>Progress</span>
 <span>{Math.round(progress)}%</span>
 </div>
 <Progress value={progress} className="h-2" />
 </div>

 {/* Clock Stop Alert */}
 {clockStopped && (
 <Alert variant="destructive">
 <AlertTriangle className="h-4 w-4" />
 <AlertDescription>
 <strong>FDA Clock Stopped</strong> - The review timeline is paused pending your response to FDA's Additional Information request. 
 The clock will restart when you submit your response.
 </AlertDescription>
 </Alert>
 )}
 </div>
 ) : (
 <div className="text-center py-8">
 <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
 <p className="text-gray-600 mb-4">No submission date set</p>
 <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
 <DialogTrigger asChild>
 <Button>Start Timeline</Button>
 </DialogTrigger>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Start FDA Review Timeline</DialogTitle>
 <DialogDescription>
 Enter the date FDA received your 510(k) submission to begin tracking the review timeline.
 </DialogDescription>
 </DialogHeader>
 <div className="space-y-4 mt-4">
 <input
 type="date"
 className="w-full p-2 border rounded"
 onChange={(e) => {
 if (e.target.value) {
 startTimeline(e.target.value);
 setShowStartDialog(false);
 }
 }}
 />
 </div>
 </DialogContent>
 </Dialog>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Main Timeline Content */}
 {submissionDate && (
 <Card>
 <CardContent className="p-6">
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <TabsList className="grid w-full grid-cols-3">
 <TabsTrigger value="timeline">Timeline View</TabsTrigger>
 <TabsTrigger value="milestones">Milestones</TabsTrigger>
 <TabsTrigger value="correspondence">Correspondence</TabsTrigger>
 </TabsList>

 {/* Timeline View */}
 <TabsContent value="timeline" className="space-y-4">
 <div className="relative">
 {/* Timeline Line */}
 <div className="absolute left-12 top-0 bottom-0 w-0.5 bg-gray-200"></div>
 
 {/* Milestones */}
 {FDA_MILESTONES.map((milestone, index) => {
 const isPast = currentDay >= milestone.day;
 const isCurrent = currentDay === milestone.day;
 const isReached = milestoneStatus[milestone.day] === 'reached';
 
 return (
 <div key={milestone.day} className="relative flex items-start mb-8">
 {/* Day Marker */}
 <div className={`
 absolute left-8 w-8 h-8 rounded-full flex items-center justify-center
 ${isPast ? milestone.color : 'bg-gray-300'}
 ${isCurrent ? 'ring-4 ring-offset-2 ring-stone-400' : ''}
 `}>
 {isReached ? (
 <CheckCircle2 className="h-5 w-5 text-white" />
 ) : (
 milestone.icon
 )}
 </div>
 
 {/* Content */}
 <div className="ml-20 flex-1">
 <div className="flex items-center gap-2 mb-1">
 <span className="text-sm font-medium text-gray-500">
 Day {milestone.day}
 </span>
 {milestone.critical && (
 <Badge variant="destructive" className="text-xs">
 Critical
 </Badge>
 )}
 {isCurrent && (
 <Badge className="text-xs">
 Today
 </Badge>
 )}
 </div>
 <h4 className={`font-semibold ${isPast ? '' : 'text-gray-400'}`}>
 {milestone.title}
 </h4>
 <p className={`text-sm ${isPast ? 'text-gray-600' : 'text-gray-400'} mt-1`}>
 {milestone.description}
 </p>
 
 {/* Add notes for reached milestones */}
 {isReached && (
 <div className="mt-2">
 <input
 type="text"
 placeholder="Add notes..."
 className="text-sm p-1 border rounded w-full max-w-md"
 value={notes[milestone.day] || ''}
 onChange={(e) => setNotes(prev => ({
 ...prev,
 [milestone.day]: e.target.value,
 }))}
 />
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </TabsContent>

 {/* Milestones Grid */}
 <TabsContent value="milestones">
 <div className="grid grid-cols-2 gap-4 mt-4">
 {FDA_MILESTONES.map(milestone => {
 const isPast = currentDay >= milestone.day;
 const status = milestoneStatus[milestone.day];
 
 return (
 <Card
 key={milestone.day}
 className={`p-4 ${isPast ? '' : 'opacity-50'}`}
 >
 <div className="flex items-start justify-between">
 <div className="flex items-start gap-3">
 <div className={`p-2 rounded-lg ${milestone.color}`}>
 {milestone.icon}
 </div>
 <div>
 <h4 className="font-medium">Day {milestone.day}</h4>
 <p className="text-sm text-gray-600">{milestone.title}</p>
 <p className="text-xs text-gray-500 mt-1">
 {milestone.description}
 </p>
 </div>
 </div>
 {status === 'reached' && (
 <CheckCircle2 className="h-5 w-5 text-green-500" />
 )}
 </div>
 </Card>
 );
 })}
 </div>
 </TabsContent>

 {/* Correspondence Log */}
 <TabsContent value="correspondence">
 <div className="space-y-4 mt-4">
 {correspondences.length === 0 ? (
 <div className="text-center py-8 text-gray-500">
 No correspondence recorded yet
 </div>
 ) : (
 correspondences.map(corr => (
 <Card key={corr.id} className="p-4">
 <div className="flex items-start justify-between">
 <div className="flex items-start gap-3">
 {corr.type === 'submission' && <FileCheck className="h-5 w-5 text-stone-500 mt-1" />}
 {corr.type === 'ai_request' && <Mail className="h-5 w-5 text-orange-500 mt-1" />}
 {corr.type === 'clock_restart' && <Play className="h-5 w-5 text-green-500 mt-1" />}
 {corr.type === 'phone' && <Phone className="h-5 w-5 text-purple-500 mt-1" />}
 <div>
 <p className="font-medium">{corr.description}</p>
 <p className="text-sm text-gray-500">
 {format(new Date(corr.date), 'MMM dd, yyyy')} - Day {corr.day}
 </p>
 </div>
 </div>
 <Badge variant="outline">
 {corr.type.replace('_', ' ').toUpperCase()}
 </Badge>
 </div>
 </Card>
 ))
 )}
 
 <Button
 variant="outline"
 onClick={() => {
 const type = prompt('Type (submission/ai_request/phone/clock_restart):');
 const description = prompt('Description:');
 if (type && description) {
 addCorrespondence({
 type,
 date: new Date(),
 description,
 day: currentDay,
 });
 }
 }}
 className="w-full"
 >
 Add Correspondence
 </Button>
 </div>
 </TabsContent>
 </Tabs>
 </CardContent>
 </Card>
 )}

 {/* Tips Card */}
 <Card className="border-stone-200 bg-stone-50/30">
 <CardHeader>
 <CardTitle className="text-lg flex items-center gap-2">
 <Info className="h-5 w-5 text-stone-600" />
 FDA Review Timeline Tips
 </CardTitle>
 </CardHeader>
 <CardContent>
 <ul className="space-y-2 text-sm text-gray-600">
 <li className="flex items-start gap-2">
 <ChevronRight className="h-4 w-4 mt-0.5 text-stone-500" />
 The FDA clock stops when Additional Information is requested and restarts when you respond
 </li>
 <li className="flex items-start gap-2">
 <ChevronRight className="h-4 w-4 mt-0.5 text-stone-500" />
 Business days exclude weekends and federal holidays
 </li>
 <li className="flex items-start gap-2">
 <ChevronRight className="h-4 w-4 mt-0.5 text-stone-500" />
 Special 510(k)s have a 30-day review target instead of 90 days
 </li>
 <li className="flex items-start gap-2">
 <ChevronRight className="h-4 w-4 mt-0.5 text-stone-500" />
 Keep detailed records of all FDA correspondence for your files
 </li>
 </ul>
 </CardContent>
 </Card>
 </div>
 );
}