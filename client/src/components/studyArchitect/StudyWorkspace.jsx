import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
 Users,
 FileText,
 MessageSquare,
 Clock,
 Calendar,
 BarChart2,
 Database,
 Brain,
 Clipboard,
 CheckSquare,
 AlertTriangle,
 Download,
 Search,
 Share2,
 Edit,
 Plus,
 Save,
 RefreshCw,
 X,
} from 'lucide-react';

const StudyWorkspace = ({ session }) => {
 const [activeTab, setActiveTab] = useState('overview');
 const [commentMode, setCommentMode] = useState(false);
 const [saving, setSaving] = useState(false);
 const [activeSections, setActiveSections] = useState([
 'studyTitle',
 'studyObjectives',
 'studyDesign',
 'endpoints',
 ]);

 // Sample study data
 const [studyData, setStudyData] = useState({
 title: session?.name || 'Enzymax Phase 2b Study Design',
 indication: session?.indication || 'Type 2 Diabetes',
 phase: 'Phase 2b',
 objectives: {
 primary:
 'To evaluate the efficacy of Enzymax Forte compared to placebo in reducing HbA1c levels in patients with Type 2 Diabetes.',
 secondary: [
 'To assess the effect of Enzymax Forte on fasting plasma glucose levels',
 'To evaluate the safety and tolerability of Enzymax Forte',
 'To assess changes in body weight over the treatment period',
 ],
 },
 design: 'Randomized, double-blind, placebo-controlled, parallel-group study',
 population:
 'Adult patients (18-75 years) with Type 2 Diabetes with HbA1c between 7.0% and 10.0%',
 duration: '24 weeks',
 endpoints: {
 primary: 'Change from baseline in HbA1c at Week 24',
 secondary: [
 'Change from baseline in fasting plasma glucose at Week 24',
 'Proportion of patients achieving HbA1c < 7.0% at Week 24',
 'Change from baseline in body weight at Week 24',
 ],
 },
 statistics:
 'Mixed-model repeated measures (MMRM) analysis will be used for the primary endpoint analysis',
 safety:
 'Adverse events, laboratory parameters, vital signs, and physical examination findings will be monitored throughout the study',
 });

 // Sample comments
 const comments = [
 {
 id: 1,
 user: 'Dr. Sarah Johnson',
 timestamp: '10:15 AM today',
 text: 'I suggest we add a tertiary endpoint related to quality of life measures.',
 section: 'endpoints',
 },
 {
 id: 2,
 user: 'Dr. Michael Chen',
 timestamp: '9:32 AM today',
 text: 'The inclusion criteria might be too restrictive. Consider broadening the HbA1c range.',
 section: 'population',
 },
 {
 id: 3,
 user: 'Dr. Sarah Johnson',
 timestamp: 'Yesterday',
 text: 'Based on CSR insights, we should adjust the statistical approach to use multiple imputation methods.',
 section: 'statistics',
 csrReference: 'CSR-2023-B241',
 },
 ];

 // CSR relevant insights
 const csrInsights = [
 {
 id: 'insight-1',
 title: 'Endpoint Selection Optimization',
 description:
 'PRO measures as secondary endpoints correlate with 34% higher approval rates in Type 2 Diabetes studies.',
 relevance: 'high',
 source: 'CSR-2023-A109',
 applicable: true,
 },
 {
 id: 'insight-2',
 title: 'Sample Size Recommendation',
 description:
 'For similar studies in T2DM, a minimum of 120 patients per arm is recommended based on observed effect sizes.',
 relevance: 'medium',
 source: 'CSR-2022-C094',
 applicable: true,
 },
 {
 id: 'insight-3',
 title: 'Inclusion Criteria Adjustment',
 description:
 'Broadening HbA1c eligibility from 7.0-9.0% to 7.0-10.0% improved recruitment rates by 38% without impacting study outcomes.',
 relevance: 'high',
 source: 'CSR-2023-B186',
 applicable: true,
 },
 ];

 const handleSave = async () => {
 setSaving(true);

 // Simulated save operation
 await new Promise(resolve => setTimeout(resolve, 1200));

 setSaving(false);
 // Would save the study data to the backend in a real implementation
 };

 const toggleSection = section => {
 if (activeSections.includes(section)) {
 setActiveSections(activeSections.filter(s => s !== section));
 } else {
 setActiveSections([...activeSections, section]);
 }
 };

 const handleChange = (field, value) => {
 setStudyData(prev => {
 const newData = { ...prev };

 if (field.includes('.')) {
 const [parent, child] = field.split('.');
 if (Array.isArray(newData[parent][child])) {
 // If the field is an array, handle it differently
 const arrayValue = value.split('\n').filter(v => v.trim() !== '');
 newData[parent][child] = arrayValue;
 } else {
 newData[parent][child] = value;
 }
 } else {
 newData[field] = value;
 }

 return newData;
 });
 };

 return (
 <div className="space-y-6">
 {/* Workspace Header */}
 <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
 <div>
 <h2 className="text-2xl font-bold tracking-tight">{studyData.title}</h2>
 <p className="text-muted-foreground">
 {studyData.indication} · {studyData.phase}
 </p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button
 variant={commentMode ? 'default' : 'outline'}
 size="sm"
 onClick={() => setCommentMode(!commentMode)}
 >
 <MessageSquare className="h-4 w-4 mr-2" />
 {commentMode ? 'Exit Comment Mode' : 'Comment Mode'}
 </Button>
 <Button variant="outline" size="sm">
 <Share2 className="h-4 w-4 mr-2" />
 Share
 </Button>
 <Button size="sm" onClick={handleSave} disabled={saving}>
 {saving ? (
 <>
 <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
 Saving...
 </>
 ) : (
 <>
 <Save className="h-4 w-4 mr-2" />
 Save
 </>
 )}
 </Button>
 </div>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2 space-y-6">
 {/* Main Study Content Area */}
 <Card>
 <CardHeader className="pb-3">
 <div className="flex justify-between items-center">
 <CardTitle>Study Workspace</CardTitle>
 <div className="flex items-center gap-1">
 <Button variant="ghost" size="sm">
 <Edit className="h-4 w-4 mr-1" />
 Edit All
 </Button>
 <Button variant="ghost" size="sm">
 <Download className="h-4 w-4 mr-1" />
 Export
 </Button>
 </div>
 </div>
 <CardDescription>Collaborative workspace for study design elements</CardDescription>
 </CardHeader>
 <CardContent className="space-y-6">
 {/* Study Title Section */}
 <div className="border rounded-md">
 <div
 className="p-4 flex justify-between items-center border-b bg-gray-50 cursor-pointer"
 onClick={() => toggleSection('studyTitle')}
 >
 <div className="font-medium">Study Title and Indication</div>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0"
 onClick={e => {
 e.stopPropagation();
 toggleSection('studyTitle');
 }}
 >
 {activeSections.includes('studyTitle') ? (
 <X className="h-4 w-4" />
 ) : (
 <Plus className="h-4 w-4" />
 )}
 </Button>
 </div>
 {activeSections.includes('studyTitle') && (
 <div className="p-4 space-y-4">
 <div>
 <label className="text-sm font-medium block mb-1">Study Title</label>
 <Input
 value={studyData.title}
 onChange={e => handleChange('title', e.target.value)}
 placeholder="Enter the study title"
 />
 {commentMode && (
 <div className="mt-2 p-2 bg-stone-50 rounded-md text-sm">
 <MessageSquare className="h-4 w-4 text-stone-500 inline mr-1" />
 <span className="text-stone-500">Comment mode: </span>
 Click to add a comment to this section
 </div>
 )}
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="text-sm font-medium block mb-1">Indication</label>
 <Input
 value={studyData.indication}
 onChange={e => handleChange('indication', e.target.value)}
 placeholder="Enter the indication"
 />
 </div>
 <div>
 <label className="text-sm font-medium block mb-1">Phase</label>
 <Input
 value={studyData.phase}
 onChange={e => handleChange('phase', e.target.value)}
 placeholder="Enter the study phase"
 />
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Study Objectives Section */}
 <div className="border rounded-md">
 <div
 className="p-4 flex justify-between items-center border-b bg-gray-50 cursor-pointer"
 onClick={() => toggleSection('studyObjectives')}
 >
 <div className="font-medium">Study Objectives</div>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0"
 onClick={e => {
 e.stopPropagation();
 toggleSection('studyObjectives');
 }}
 >
 {activeSections.includes('studyObjectives') ? (
 <X className="h-4 w-4" />
 ) : (
 <Plus className="h-4 w-4" />
 )}
 </Button>
 </div>
 {activeSections.includes('studyObjectives') && (
 <div className="p-4 space-y-4">
 <div>
 <label className="text-sm font-medium block mb-1">Primary Objective</label>
 <Textarea
 value={studyData.objectives.primary}
 onChange={e => handleChange('objectives.primary', e.target.value)}
 placeholder="Enter the primary objective"
 rows={2}
 />
 </div>
 <div>
 <label className="text-sm font-medium block mb-1">Secondary Objectives</label>
 <Textarea
 value={studyData.objectives.secondary.join('\n')}
 onChange={e => handleChange('objectives.secondary', e.target.value)}
 placeholder="Enter secondary objectives, one per line"
 rows={4}
 />
 </div>
 </div>
 )}
 </div>

 {/* Study Design Section */}
 <div className="border rounded-md">
 <div
 className="p-4 flex justify-between items-center border-b bg-gray-50 cursor-pointer"
 onClick={() => toggleSection('studyDesign')}
 >
 <div className="font-medium">Study Design and Population</div>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0"
 onClick={e => {
 e.stopPropagation();
 toggleSection('studyDesign');
 }}
 >
 {activeSections.includes('studyDesign') ? (
 <X className="h-4 w-4" />
 ) : (
 <Plus className="h-4 w-4" />
 )}
 </Button>
 </div>
 {activeSections.includes('studyDesign') && (
 <div className="p-4 space-y-4">
 <div>
 <label className="text-sm font-medium block mb-1">Study Design</label>
 <Textarea
 value={studyData.design}
 onChange={e => handleChange('design', e.target.value)}
 placeholder="Describe the study design"
 rows={2}
 />
 {/* CSR Insight Badge */}
 <div className="mt-2 flex items-start gap-2 p-3 bg-stone-50 rounded-md">
 <Brain className="h-5 w-5 text-stone-500 flex-shrink-0 mt-0.5" />
 <div>
 <div className="text-sm font-medium text-stone-700">
 CSR Intelligence Insight
 </div>
 <p className="text-sm text-stone-600">
 Adaptive designs show 28% fewer protocol deviations in T2DM studies
 </p>
 <div className="flex items-center mt-1 text-xs text-stone-500">
 <span>Source: CSR-2023-A109</span>
 <Button variant="link" className="p-0 h-auto text-xs text-stone-600">
 Apply Insight
 </Button>
 </div>
 </div>
 </div>
 </div>
 <div>
 <label className="text-sm font-medium block mb-1">Target Population</label>
 <Textarea
 value={studyData.population}
 onChange={e => handleChange('population', e.target.value)}
 placeholder="Describe the target population"
 rows={2}
 />
 {/* Comment example */}
 {comments
 .filter(c => c.section === 'population')
 .map(comment => (
 <div
 key={comment.id}
 className="mt-2 p-3 border border-amber-200 bg-amber-50 rounded-md"
 >
 <div className="flex items-start gap-2">
 <MessageSquare className="h-4 w-4 text-amber-500 flex-shrink-0 mt-1" />
 <div>
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium">{comment.user}</span>
 <span className="text-xs text-gray-500">{comment.timestamp}</span>
 </div>
 <p className="text-sm mt-1">{comment.text}</p>
 {comment.csrReference && (
 <div className="flex items-center mt-1 text-xs text-stone-600">
 <Brain className="h-3 w-3 mr-1" />
 <span>Based on {comment.csrReference}</span>
 </div>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 <div>
 <label className="text-sm font-medium block mb-1">Study Duration</label>
 <Input
 value={studyData.duration}
 onChange={e => handleChange('duration', e.target.value)}
 placeholder="Enter the study duration"
 />
 </div>
 </div>
 )}
 </div>

 {/* Study Endpoints Section */}
 <div className="border rounded-md">
 <div
 className="p-4 flex justify-between items-center border-b bg-gray-50 cursor-pointer"
 onClick={() => toggleSection('endpoints')}
 >
 <div className="font-medium">Endpoints</div>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0"
 onClick={e => {
 e.stopPropagation();
 toggleSection('endpoints');
 }}
 >
 {activeSections.includes('endpoints') ? (
 <X className="h-4 w-4" />
 ) : (
 <Plus className="h-4 w-4" />
 )}
 </Button>
 </div>
 {activeSections.includes('endpoints') && (
 <div className="p-4 space-y-4">
 <div>
 <label className="text-sm font-medium block mb-1">Primary Endpoint</label>
 <Textarea
 value={studyData.endpoints.primary}
 onChange={e => handleChange('endpoints.primary', e.target.value)}
 placeholder="Enter the primary endpoint"
 rows={2}
 />
 </div>
 <div>
 <label className="text-sm font-medium block mb-1">Secondary Endpoints</label>
 <Textarea
 value={studyData.endpoints.secondary.join('\n')}
 onChange={e => handleChange('endpoints.secondary', e.target.value)}
 placeholder="Enter secondary endpoints, one per line"
 rows={4}
 />
 {/* Comment example */}
 {comments
 .filter(c => c.section === 'endpoints')
 .map(comment => (
 <div
 key={comment.id}
 className="mt-2 p-3 border border-amber-200 bg-amber-50 rounded-md"
 >
 <div className="flex items-start gap-2">
 <MessageSquare className="h-4 w-4 text-amber-500 flex-shrink-0 mt-1" />
 <div>
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium">{comment.user}</span>
 <span className="text-xs text-gray-500">{comment.timestamp}</span>
 </div>
 <p className="text-sm mt-1">{comment.text}</p>
 {comment.csrReference && (
 <div className="flex items-center mt-1 text-xs text-stone-600">
 <Brain className="h-3 w-3 mr-1" />
 <span>Based on {comment.csrReference}</span>
 </div>
 )}
 </div>
 </div>
 </div>
 ))}
 {/* CSR Insight Badge */}
 <div className="mt-2 flex items-start gap-2 p-3 bg-stone-50 rounded-md">
 <Brain className="h-5 w-5 text-stone-500 flex-shrink-0 mt-0.5" />
 <div>
 <div className="text-sm font-medium text-stone-700">
 CSR Intelligence Insight
 </div>
 <p className="text-sm text-stone-600">
 Integration of PROs as secondary endpoints correlates with 34% higher
 approval rates
 </p>
 <div className="flex items-center mt-1 text-xs text-stone-500">
 <span>Source: CSR-2023-A109</span>
 <Button variant="link" className="p-0 h-auto text-xs text-stone-600">
 Apply Insight
 </Button>
 </div>
 </div>
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Statistical Considerations Section */}
 <div className="border rounded-md">
 <div
 className="p-4 flex justify-between items-center border-b bg-gray-50 cursor-pointer"
 onClick={() => toggleSection('statistics')}
 >
 <div className="font-medium">Statistical Considerations</div>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0"
 onClick={e => {
 e.stopPropagation();
 toggleSection('statistics');
 }}
 >
 {activeSections.includes('statistics') ? (
 <X className="h-4 w-4" />
 ) : (
 <Plus className="h-4 w-4" />
 )}
 </Button>
 </div>
 {activeSections.includes('statistics') && (
 <div className="p-4 space-y-4">
 <div>
 <label className="text-sm font-medium block mb-1">
 Statistical Analysis Approach
 </label>
 <Textarea
 value={studyData.statistics}
 onChange={e => handleChange('statistics', e.target.value)}
 placeholder="Describe the statistical analysis approach"
 rows={3}
 />
 {/* Comment example */}
 {comments
 .filter(c => c.section === 'statistics')
 .map(comment => (
 <div
 key={comment.id}
 className="mt-2 p-3 border border-amber-200 bg-amber-50 rounded-md"
 >
 <div className="flex items-start gap-2">
 <MessageSquare className="h-4 w-4 text-amber-500 flex-shrink-0 mt-1" />
 <div>
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium">{comment.user}</span>
 <span className="text-xs text-gray-500">{comment.timestamp}</span>
 </div>
 <p className="text-sm mt-1">{comment.text}</p>
 {comment.csrReference && (
 <div className="flex items-center mt-1 text-xs text-stone-600">
 <Brain className="h-3 w-3 mr-1" />
 <span>Based on {comment.csrReference}</span>
 </div>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* Safety Considerations Section */}
 <div className="border rounded-md">
 <div
 className="p-4 flex justify-between items-center border-b bg-gray-50 cursor-pointer"
 onClick={() => toggleSection('safety')}
 >
 <div className="font-medium">Safety Considerations</div>
 <Button
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0"
 onClick={e => {
 e.stopPropagation();
 toggleSection('safety');
 }}
 >
 {activeSections.includes('safety') ? (
 <X className="h-4 w-4" />
 ) : (
 <Plus className="h-4 w-4" />
 )}
 </Button>
 </div>
 {activeSections.includes('safety') && (
 <div className="p-4 space-y-4">
 <div>
 <label className="text-sm font-medium block mb-1">Safety Monitoring</label>
 <Textarea
 value={studyData.safety}
 onChange={e => handleChange('safety', e.target.value)}
 placeholder="Describe the safety monitoring approach"
 rows={3}
 />
 </div>
 </div>
 )}
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Sidebar Content */}
 <div className="space-y-6">
 {/* Activity Tracker */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base">Recent Activity</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 <div className="flex items-start gap-3">
 <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 flex-shrink-0">
 SJ
 </div>
 <div>
 <div className="text-sm font-medium">Dr. Sarah Johnson</div>
 <p className="text-sm text-muted-foreground">Added a comment on endpoints</p>
 <p className="text-xs text-gray-400">10:15 AM today</p>
 </div>
 </div>

 <div className="flex items-start gap-3">
 <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 flex-shrink-0">
 MC
 </div>
 <div>
 <div className="text-sm font-medium">Dr. Michael Chen</div>
 <p className="text-sm text-muted-foreground">
 Updated the study population definition
 </p>
 <p className="text-xs text-gray-400">9:32 AM today</p>
 </div>
 </div>

 <div className="flex items-start gap-3">
 <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0">
 <Brain className="h-4 w-4" />
 </div>
 <div>
 <div className="text-sm font-medium">CSR Intelligence</div>
 <p className="text-sm text-muted-foreground">
 Applied endpoint selection insights
 </p>
 <p className="text-xs text-gray-400">Yesterday</p>
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* CSR Intelligence Insights */}
 <Card className="bg-stone-50">
 <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center gap-2">
 <Brain className="h-5 w-5 text-stone-600" />
 CSR Intelligence
 </CardTitle>
 <CardDescription>Relevant insights for your study</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-3">
 {csrInsights.map(insight => (
 <div key={insight.id} className="bg-white p-3 rounded-md shadow-sm">
 <div className="flex justify-between items-start">
 <div className="font-medium text-sm">{insight.title}</div>
 <Badge
 variant={insight.relevance === 'high' ? 'default' : 'secondary'}
 className="text-xs"
 >
 {insight.relevance === 'high' ? 'High Relevance' : 'Medium Relevance'}
 </Badge>
 </div>
 <p className="text-sm mt-1">{insight.description}</p>
 <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
 <div className="flex items-center">
 <Database className="h-3 w-3 mr-1" />
 Source: {insight.source}
 </div>
 <Button variant="link" className="h-6 p-0 text-xs text-stone-600">
 Apply
 </Button>
 </div>
 </div>
 ))}

 <Button variant="outline" className="w-full text-sm bg-white">
 <Search className="h-4 w-4 mr-2" />
 Find More Insights
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* Collaborators */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base">Collaborators</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-3">
 {session?.users?.map(user => (
 <div key={user.id} className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-medium">
 {user.name
 .split(' ')
 .map(n => n[0])
 .join('')}
 </div>
 <div>
 <div className="text-sm font-medium">{user.name}</div>
 <div className="text-xs text-muted-foreground">{user.role}</div>
 </div>
 </div>
 <div className="h-2 w-2 rounded-full bg-green-500"></div>
 </div>
 ))}

 <Button variant="outline" className="w-full text-sm">
 <Plus className="h-4 w-4 mr-2" />
 Add Collaborator
 </Button>
 </div>
 </CardContent>
 </Card>

 {/* Next Steps */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base">Next Steps</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
 <div className="flex items-center gap-2">
 <CheckSquare className="h-4 w-4 text-stone-500" />
 <span className="text-sm">Complete study objectives</span>
 </div>
 <Badge variant="outline">In Progress</Badge>
 </div>

 <div className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
 <div className="flex items-center gap-2">
 <CheckSquare className="h-4 w-4 text-stone-500" />
 <span className="text-sm">Define endpoints</span>
 </div>
 <Badge variant="outline">In Progress</Badge>
 </div>

 <div className="flex items-center justify-between p-2 rounded-md">
 <div className="flex items-center gap-2">
 <CheckSquare className="h-4 w-4 text-gray-300" />
 <span className="text-sm">Generate protocol blueprint</span>
 </div>
 <Badge variant="outline">Pending</Badge>
 </div>

 <div className="flex items-center justify-between p-2 rounded-md">
 <div className="flex items-center gap-2">
 <CheckSquare className="h-4 w-4 text-gray-300" />
 <span className="text-sm">Run success prediction</span>
 </div>
 <Badge variant="outline">Pending</Badge>
 </div>

 <Button variant="outline" className="w-full text-sm mt-2">
 <Plus className="h-4 w-4 mr-2" />
 Add Task
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 </div>
 </div>
 );
};

export default StudyWorkspace;
