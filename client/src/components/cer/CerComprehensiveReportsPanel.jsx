import React, { useState, useEffect } from 'react';
import {
 BarChart3,
 FileText,
 Download,
 Calendar,
 Users,
 CheckCircle,
 AlertTriangle,
 FileBarChart2,
 FileCheck,
} from 'lucide-react';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

/**
 * CerComprehensiveReportsPanel Component
 *
 * This component provides a comprehensive reporting interface for the CER module,
 * displaying various metrics, compliance scores, and generating PDF reports.
 */
const CerComprehensiveReportsPanel = () => {
 const [activeReportType, setActiveReportType] = useState('compliance');
 const [reportTimeframe, setReportTimeframe] = useState('last30days');
 const [isGeneratingReport, setIsGeneratingReport] = useState(false);
 const [selectedRegulatory, setSelectedRegulatory] = useState('all');
 const [drilldownSection, setDrilldownSection] = useState(null);
 const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
 const [reportData, setReportData] = useState({
 compliance: {
 overall: 85,
 bySection: [
 { section: 'Device Description', score: 92, status: 'compliant' },
 { section: 'Clinical Evaluation Strategy', score: 78, status: 'minor-issues' },
 { section: 'Literature Review', score: 88, status: 'compliant' },
 { section: 'Risk Assessment', score: 90, status: 'compliant' },
 { section: 'Clinical Data Analysis', score: 75, status: 'minor-issues' },
 { section: 'Post-Market Surveillance', score: 95, status: 'compliant' },
 ],
 },
 activity: {
 totalEdits: 127,
 lastActivityDate: '2025-05-07',
 userActivity: [
 { user: 'John Doe', edits: 45, sections: ['Device Description', 'Literature Review'] },
 {
 user: 'Jane Smith',
 edits: 38,
 sections: ['Risk Assessment', 'Post-Market Surveillance'],
 },
 {
 user: 'Robert Johnson',
 edits: 44,
 sections: ['Clinical Data Analysis', 'Clinical Evaluation Strategy'],
 },
 ],
 },
 quality: {
 ctqFactorsCompleted: 18,
 ctqFactorsTotal: 22,
 riskBreakdown: {
 high: { completed: 8, total: 8 },
 medium: { completed: 6, total: 8 },
 low: { completed: 4, total: 6 },
 },
 },
 });

 // Additional report data for trend analysis and regulatory-specific views
 const [trendData] = useState({
 compliance: {
 monthly: [
 { month: 'Jan', score: 72 },
 { month: 'Feb', score: 75 },
 { month: 'Mar', score: 79 },
 { month: 'Apr', score: 82 },
 { month: 'May', score: 85 },
 ],
 byRegulation: {
 'EU MDR': [
 { month: 'Jan', score: 76 },
 { month: 'Feb', score: 78 },
 { month: 'Mar', score: 84 },
 { month: 'Apr', score: 88 },
 { month: 'May', score: 92 },
 ],
 'FDA CFR 21': [
 { month: 'Jan', score: 68 },
 { month: 'Feb', score: 70 },
 { month: 'Mar', score: 73 },
 { month: 'Apr', score: 75 },
 { month: 'May', score: 78 },
 ],
 'ISO 14155': [
 { month: 'Jan', score: 74 },
 { month: 'Feb', score: 78 },
 { month: 'Mar', score: 82 },
 { month: 'Apr', score: 86 },
 { month: 'May', score: 89 },
 ],
 },
 },
 activity: {
 monthly: [
 { month: 'Jan', edits: 52 },
 { month: 'Feb', edits: 68 },
 { month: 'Mar', edits: 87 },
 { month: 'Apr', edits: 102 },
 { month: 'May', edits: 127 },
 ],
 bySection: {
 'Device Description': [
 { month: 'Jan', edits: 14 },
 { month: 'Feb', edits: 18 },
 { month: 'Mar', edits: 22 },
 { month: 'Apr', edits: 25 },
 { month: 'May', edits: 32 },
 ],
 'Literature Review': [
 { month: 'Jan', edits: 11 },
 { month: 'Feb', edits: 16 },
 { month: 'Mar', edits: 19 },
 { month: 'Apr', edits: 24 },
 { month: 'May', edits: 30 },
 ],
 'Risk Assessment': [
 { month: 'Jan', edits: 8 },
 { month: 'Feb', edits: 11 },
 { month: 'Mar', edits: 14 },
 { month: 'Apr', edits: 17 },
 { month: 'May', edits: 22 },
 ],
 },
 },
 quality: {
 monthly: [
 { month: 'Jan', completed: 12, total: 22 },
 { month: 'Feb', completed: 14, total: 22 },
 { month: 'Mar', completed: 15, total: 22 },
 { month: 'Apr', completed: 17, total: 22 },
 { month: 'May', completed: 18, total: 22 },
 ],
 byRiskLevel: {
 high: [
 { month: 'Jan', completed: 6, total: 8 },
 { month: 'Feb', completed: 7, total: 8 },
 { month: 'Mar', completed: 7, total: 8 },
 { month: 'Apr', completed: 8, total: 8 },
 { month: 'May', completed: 8, total: 8 },
 ],
 medium: [
 { month: 'Jan', completed: 4, total: 8 },
 { month: 'Feb', completed: 4, total: 8 },
 { month: 'Mar', completed: 5, total: 8 },
 { month: 'Apr', completed: 5, total: 8 },
 { month: 'May', completed: 6, total: 8 },
 ],
 low: [
 { month: 'Jan', completed: 2, total: 6 },
 { month: 'Feb', completed: 3, total: 6 },
 { month: 'Mar', completed: 3, total: 6 },
 { month: 'Apr', completed: 4, total: 6 },
 { month: 'May', completed: 4, total: 6 },
 ],
 },
 },
 });

 // List of regulatory frameworks for filtering
 const regulatoryFrameworks = [
 { id: 'all', name: 'All Frameworks' },
 { id: 'eu-mdr', name: 'EU MDR 2017/745' },
 { id: 'fda-cfr-21', name: 'FDA CFR 21' },
 { id: 'iso-14155', name: 'ISO 14155:2020' },
 { id: 'gspr', name: 'EU GSPR' },
 { id: 'icmedtech', name: 'ICMedTech Consensus Standards' },
 ];

 // Simulated API call to fetch report data
 useEffect(() => {
 // This would be replaced with an actual API call
 console.log(`Fetching ${activeReportType} report data for ${reportTimeframe}`);

 // In a real implementation, we would include the regulatory framework and other filters
 if (selectedRegulatory !== 'all') {
 console.log(`Filtering by regulatory framework: ${selectedRegulatory}`);
 }

 if (showAdvancedFilters) {
 console.log('Using advanced filters');
 }

 // setReportData(fetchedData) would happen here in a real implementation
 }, [activeReportType, reportTimeframe, selectedRegulatory, showAdvancedFilters]);

 const generatePDFReport = async () => {
 setIsGeneratingReport(true);

 try {
 // Simulate PDF generation
 await new Promise(resolve => setTimeout(resolve, 1500));

 toast({
 title: 'Report Generated Successfully',
 description: `Your ${getReportTypeName(activeReportType)} report has been generated and is ready for download.`,
 variant: 'default',
 });

 // In a real implementation, this would trigger a file download
 } catch (error) {
 toast({
 title: 'Report Generation Failed',
 description: error.message || 'There was an error generating your report.',
 variant: 'destructive',
 });
 } finally {
 setIsGeneratingReport(false);
 }
 };

 const getReportTypeName = reportType => {
 const reportTypes = {
 compliance: 'Compliance',
 activity: 'Activity',
 quality: 'Quality Management',
 };
 return reportTypes[reportType] || reportType;
 };

 const getTimeframeName = timeframe => {
 const timeframes = {
 last7days: 'Last 7 Days',
 last30days: 'Last 30 Days',
 last90days: 'Last 90 Days',
 allTime: 'All Time',
 };
 return timeframes[timeframe] || timeframe;
 };

 const renderComplianceReport = () => (
 <div className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">Overall Compliance</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-center py-4">
 <div className="relative h-24 w-24">
 <svg className="h-full w-full" viewBox="0 0 100 100">
 <circle
 className="text-gray-200"
 strokeWidth="10"
 stroke="currentColor"
 fill="transparent"
 r="40"
 cx="50"
 cy="50"
 />
 <circle
 className="text-stone-600"
 strokeWidth="10"
 strokeDasharray={2 * Math.PI * 40}
 strokeDashoffset={2 * Math.PI * 40 * (1 - reportData.compliance.overall / 100)}
 strokeLinecap="round"
 stroke="currentColor"
 fill="transparent"
 r="40"
 cx="50"
 cy="50"
 />
 </svg>
 <div className="absolute inset-0 flex items-center justify-center">
 <span className="text-2xl font-bold">{reportData.compliance.overall}%</span>
 </div>
 </div>
 </div>
 </CardContent>
 <CardFooter className="pt-0">
 {reportData.compliance.overall >= 80 ? (
 <div className="w-full flex items-center text-sm text-green-600">
 <CheckCircle className="h-4 w-4 mr-1" />
 <span>Meets regulatory threshold</span>
 </div>
 ) : (
 <div className="w-full flex items-center text-sm text-amber-600">
 <AlertTriangle className="h-4 w-4 mr-1" />
 <span>Below regulatory threshold</span>
 </div>
 )}
 </CardFooter>
 </Card>

 <Card className="col-span-1 md:col-span-2">
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">Compliance by Section</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 {reportData.compliance.bySection.map((section, index) => (
 <div key={index} className="flex flex-col">
 <div className="flex justify-between text-sm mb-1">
 <span>{section.section}</span>
 <span className="font-medium">{section.score}%</span>
 </div>
 <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
 <div
 className={`h-full rounded-full ${
 section.status === 'compliant'
 ? 'bg-green-500'
 : section.status === 'minor-issues'
 ? 'bg-amber-500'
 : 'bg-red-500'
 }`}
 style={{ width: `${section.score}%` }}
 />
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 </div>

 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">Regulatory Frameworks Compliance</CardTitle>
 <CardDescription>
 Analysis of CER compliance with major regulatory frameworks
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
 <div className="border rounded-lg p-4">
 <div className="flex items-center justify-between mb-2">
 <h3 className="font-medium">EU MDR 2017/745</h3>
 <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded text-xs">
 Compliant
 </span>
 </div>
 <div className="flex justify-between text-sm">
 <span>Overall Score:</span>
 <span className="font-medium">92%</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>Requirements Met:</span>
 <span className="font-medium">54/58</span>
 </div>
 </div>

 <div className="border rounded-lg p-4">
 <div className="flex items-center justify-between mb-2">
 <h3 className="font-medium">FDA CFR 21</h3>
 <span className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded text-xs">
 Needs Review
 </span>
 </div>
 <div className="flex justify-between text-sm">
 <span>Overall Score:</span>
 <span className="font-medium">78%</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>Requirements Met:</span>
 <span className="font-medium">42/54</span>
 </div>
 </div>

 <div className="border rounded-lg p-4">
 <div className="flex items-center justify-between mb-2">
 <h3 className="font-medium">ISO 14155:2020</h3>
 <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded text-xs">
 Compliant
 </span>
 </div>
 <div className="flex justify-between text-sm">
 <span>Overall Score:</span>
 <span className="font-medium">89%</span>
 </div>
 <div className="flex justify-between text-sm">
 <span>Requirements Met:</span>
 <span className="font-medium">32/36</span>
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 );

 const renderActivityReport = () => (
 <div className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">Total Edits</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-center py-4">
 <span className="text-4xl font-bold">{reportData.activity.totalEdits}</span>
 </div>
 </CardContent>
 <CardFooter className="pt-0">
 <div className="w-full flex items-center text-sm text-gray-600">
 <Calendar className="h-4 w-4 mr-1" />
 <span>Last activity: {reportData.activity.lastActivityDate}</span>
 </div>
 </CardFooter>
 </Card>

 <Card className="col-span-1 md:col-span-2">
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">User Activity</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {reportData.activity.userActivity.map((user, index) => (
 <div key={index} className="border-b pb-3 last:border-0 last:pb-0">
 <div className="flex justify-between mb-1">
 <span className="font-medium">{user.user}</span>
 <span>{user.edits} edits</span>
 </div>
 <div className="text-sm text-gray-600">Sections: {user.sections.join(', ')}</div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 </div>
 </div>
 );

 const renderQualityReport = () => (
 <div className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">CtQ Factors</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-center py-4">
 <div className="relative h-24 w-24">
 <svg className="h-full w-full" viewBox="0 0 100 100">
 <circle
 className="text-gray-200"
 strokeWidth="10"
 stroke="currentColor"
 fill="transparent"
 r="40"
 cx="50"
 cy="50"
 />
 <circle
 className="text-green-600"
 strokeWidth="10"
 strokeDasharray={2 * Math.PI * 40}
 strokeDashoffset={
 2 *
 Math.PI *
 40 *
 (1 -
 reportData.quality.ctqFactorsCompleted / reportData.quality.ctqFactorsTotal)
 }
 strokeLinecap="round"
 stroke="currentColor"
 fill="transparent"
 r="40"
 cx="50"
 cy="50"
 />
 </svg>
 <div className="absolute inset-0 flex items-center justify-center">
 <div className="text-center">
 <div className="text-2xl font-bold">
 {reportData.quality.ctqFactorsCompleted}/{reportData.quality.ctqFactorsTotal}
 </div>
 <div className="text-xs">completed</div>
 </div>
 </div>
 </div>
 </div>
 </CardContent>
 <CardFooter className="pt-0">
 <div className="w-full flex items-center text-sm text-gray-600">
 <CheckCircle className="h-4 w-4 mr-1" />
 <span>
 {Math.round(
 (reportData.quality.ctqFactorsCompleted / reportData.quality.ctqFactorsTotal) *
 100
 )}
 % completion rate
 </span>
 </div>
 </CardFooter>
 </Card>

 <Card className="col-span-1 md:col-span-2">
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">CtQ Completion by Risk Level</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 <div>
 <div className="flex justify-between mb-1">
 <span className="font-medium text-red-600">High Risk</span>
 <span>
 {reportData.quality.riskBreakdown.high.completed}/
 {reportData.quality.riskBreakdown.high.total} completed
 </span>
 </div>
 <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
 <div
 className="h-full bg-red-500 rounded-full"
 style={{
 width: `${(reportData.quality.riskBreakdown.high.completed / reportData.quality.riskBreakdown.high.total) * 100}%`,
 }}
 />
 </div>
 </div>

 <div>
 <div className="flex justify-between mb-1">
 <span className="font-medium text-amber-600">Medium Risk</span>
 <span>
 {reportData.quality.riskBreakdown.medium.completed}/
 {reportData.quality.riskBreakdown.medium.total} completed
 </span>
 </div>
 <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
 <div
 className="h-full bg-amber-500 rounded-full"
 style={{
 width: `${(reportData.quality.riskBreakdown.medium.completed / reportData.quality.riskBreakdown.medium.total) * 100}%`,
 }}
 />
 </div>
 </div>

 <div>
 <div className="flex justify-between mb-1">
 <span className="font-medium text-green-600">Low Risk</span>
 <span>
 {reportData.quality.riskBreakdown.low.completed}/
 {reportData.quality.riskBreakdown.low.total} completed
 </span>
 </div>
 <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
 <div
 className="h-full bg-green-500 rounded-full"
 style={{
 width: `${(reportData.quality.riskBreakdown.low.completed / reportData.quality.riskBreakdown.low.total) * 100}%`,
 }}
 />
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 </div>
 );

 // Render a line chart for trends
 const renderLineChart = (data, valueKey, color, label, showPercentage = false) => (
 <div className="relative h-64 pt-6">
 {/* Y-axis labels */}
 <div className="absolute left-0 top-6 bottom-6 w-10 flex flex-col justify-between text-xs text-gray-500">
 <div>100{showPercentage ? '%' : ''}</div>
 <div>75{showPercentage ? '%' : ''}</div>
 <div>50{showPercentage ? '%' : ''}</div>
 <div>25{showPercentage ? '%' : ''}</div>
 <div>0{showPercentage ? '%' : ''}</div>
 </div>

 {/* Chart grid */}
 <div className="absolute left-10 right-0 top-6 bottom-6">
 {/* Horizontal grid lines */}
 <div className="absolute left-0 right-0 top-0 border-t border-gray-200"></div>
 <div className="absolute left-0 right-0 top-1/4 border-t border-gray-200"></div>
 <div className="absolute left-0 right-0 top-2/4 border-t border-gray-200"></div>
 <div className="absolute left-0 right-0 top-3/4 border-t border-gray-200"></div>
 <div className="absolute left-0 right-0 bottom-0 border-t border-gray-200"></div>

 {/* Line chart */}
 <svg className="absolute inset-0 h-full w-full overflow-visible">
 <defs>
 <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
 <stop
 offset="0%"
 stopColor={color.replace('border-', 'rgb(59, 130, 246)')}
 stopOpacity="0.2"
 />
 <stop
 offset="100%"
 stopColor={color.replace('border-', 'rgb(59, 130, 246)')}
 stopOpacity="0"
 />
 </linearGradient>
 </defs>

 {/* Line path */}
 <path
 d={`
 M ${0} ${(1 - data[0][valueKey] / 100) * 100}
 ${data
 .map((item, i) => {
 const x = (i / (data.length - 1)) * 100;
 const y = (1 - item[valueKey] / 100) * 100;
 return `L ${x} ${y}`;
 })
 .join(' ')}
 `}
 fill="none"
 stroke={color.replace('border-', 'rgb(59, 130, 246)')}
 strokeWidth="2"
 strokeLinecap="round"
 />

 {/* Area below the line */}
 <path
 d={`
 M ${0} ${(1 - data[0][valueKey] / 100) * 100}
 ${data
 .map((item, i) => {
 const x = (i / (data.length - 1)) * 100;
 const y = (1 - item[valueKey] / 100) * 100;
 return `L ${x} ${y}`;
 })
 .join(' ')}
 L ${100} ${(1 - data[data.length - 1][valueKey] / 100) * 100}
 L ${100} ${100}
 L ${0} ${100}
 Z
 `}
 fill={`url(#gradient-${color})`}
 />

 {/* Data points */}
 {data.map((item, i) => {
 const x = (i / (data.length - 1)) * 100;
 const y = (1 - item[valueKey] / 100) * 100;

 return (
 <g key={i}>
 <circle
 cx={`${x}%`}
 cy={`${y}%`}
 r="3"
 fill="white"
 stroke={color.replace('border-', 'rgb(59, 130, 246)')}
 strokeWidth="2"
 />

 {/* Value labels */}
 <text
 x={`${x}%`}
 y={`${y - 8}%`}
 textAnchor="middle"
 fontSize="10"
 fill="currentColor"
 >
 {item[valueKey]}
 {showPercentage ? '%' : ''}
 </text>
 </g>
 );
 })}
 </svg>
 </div>

 {/* X-axis labels */}
 <div className="absolute left-10 right-0 bottom-0 flex justify-between text-xs text-gray-500">
 {data.map((item, i) => (
 <div key={i} className="flex-1 text-center">
 {item.month}
 </div>
 ))}
 </div>

 {/* Chart title */}
 <div className="absolute top-0 left-0 text-sm font-medium">{label}</div>
 </div>
 );

 // Render an area chart for comparing multiple metrics
 const renderComparisonChart = () => {
 const euMdrData = trendData.compliance.byRegulation['EU MDR'];
 const fdaData = trendData.compliance.byRegulation['FDA CFR 21'];
 const isoData = trendData.compliance.byRegulation['ISO 14155'];

 return (
 <div className="relative h-80 pt-6">
 {/* Y-axis labels */}
 <div className="absolute left-0 top-6 bottom-6 w-10 flex flex-col justify-between text-xs text-gray-500">
 <div>100%</div>
 <div>75%</div>
 <div>50%</div>
 <div>25%</div>
 <div>0%</div>
 </div>

 {/* Chart grid */}
 <div className="absolute left-10 right-0 top-6 bottom-20">
 {/* Horizontal grid lines */}
 <div className="absolute left-0 right-0 top-0 border-t border-gray-200"></div>
 <div className="absolute left-0 right-0 top-1/4 border-t border-gray-200"></div>
 <div className="absolute left-0 right-0 top-2/4 border-t border-gray-200"></div>
 <div className="absolute left-0 right-0 top-3/4 border-t border-gray-200"></div>
 <div className="absolute left-0 right-0 bottom-0 border-t border-gray-200"></div>

 {/* Line chart */}
 <svg className="absolute inset-0 h-full w-full overflow-visible">
 {/* EU MDR Line */}
 <path
 d={`
 M ${0} ${(1 - euMdrData[0].score / 100) * 100}
 ${euMdrData
 .map((item, i) => {
 const x = (i / (euMdrData.length - 1)) * 100;
 const y = (1 - item.score / 100) * 100;
 return `L ${x} ${y}`;
 })
 .join(' ')}
 `}
 fill="none"
 stroke="rgb(79, 70, 229)"
 strokeWidth="2"
 strokeLinecap="round"
 />

 {/* FDA Line */}
 <path
 d={`
 M ${0} ${(1 - fdaData[0].score / 100) * 100}
 ${fdaData
 .map((item, i) => {
 const x = (i / (fdaData.length - 1)) * 100;
 const y = (1 - item.score / 100) * 100;
 return `L ${x} ${y}`;
 })
 .join(' ')}
 `}
 fill="none"
 stroke="rgb(217, 119, 6)"
 strokeWidth="2"
 strokeLinecap="round"
 />

 {/* ISO Line */}
 <path
 d={`
 M ${0} ${(1 - isoData[0].score / 100) * 100}
 ${isoData
 .map((item, i) => {
 const x = (i / (isoData.length - 1)) * 100;
 const y = (1 - item.score / 100) * 100;
 return `L ${x} ${y}`;
 })
 .join(' ')}
 `}
 fill="none"
 stroke="rgb(16, 185, 129)"
 strokeWidth="2"
 strokeLinecap="round"
 />

 {/* Target line at 80% */}
 <line
 x1="0%"
 y1="20%"
 x2="100%"
 y2="20%"
 stroke="rgb(239, 68, 68)"
 strokeWidth="1.5"
 strokeDasharray="4"
 />
 <text x="2%" y="18%" fontSize="10" fill="rgb(239, 68, 68)">
 Target (80%)
 </text>
 </svg>
 </div>

 {/* X-axis labels */}
 <div className="absolute left-10 right-0 bottom-14 flex justify-between text-xs text-gray-500">
 {euMdrData.map((item, i) => (
 <div key={i} className="flex-1 text-center">
 {item.month}
 </div>
 ))}
 </div>

 {/* Legend */}
 <div className="absolute bottom-0 left-0 right-0 flex justify-center space-x-6 py-3">
 <div className="flex items-center">
 <div className="w-3 h-3 bg-indigo-600 rounded-full mr-1"></div>
 <span className="text-xs">EU MDR</span>
 </div>
 <div className="flex items-center">
 <div className="w-3 h-3 bg-amber-600 rounded-full mr-1"></div>
 <span className="text-xs">FDA CFR 21</span>
 </div>
 <div className="flex items-center">
 <div className="w-3 h-3 bg-emerald-600 rounded-full mr-1"></div>
 <span className="text-xs">ISO 14155</span>
 </div>
 </div>
 </div>
 );
 };

 // Render a progress dashboard
 const renderProgressDashboard = () => {
 // Calculate improvement from first to last month
 const calcImprovement = (data, valueKey) => {
 const first = data[0][valueKey];
 const last = data[data.length - 1][valueKey];
 return last - first;
 };

 // Compliance improvement
 const complianceImprovement = calcImprovement(trendData.compliance.monthly, 'score');

 // CtQ completion improvement
 const ctqCompletionStart =
 (trendData.quality.monthly[0].completed / trendData.quality.monthly[0].total) * 100;
 const ctqCompletionEnd =
 (trendData.quality.monthly[trendData.quality.monthly.length - 1].completed /
 trendData.quality.monthly[trendData.quality.monthly.length - 1].total) *
 100;
 const ctqImprovement = ctqCompletionEnd - ctqCompletionStart;

 return (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="bg-white border rounded-lg p-5">
 <div className="flex items-center mb-4">
 <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0">
 <FileCheck className="w-5 h-5 text-stone-600" />
 </div>
 <div className="ml-3">
 <h3 className="text-sm font-medium text-gray-900">Compliance</h3>
 <p className="text-xs text-gray-500">Overall regulatory compliance</p>
 </div>
 </div>

 <div className="flex items-baseline justify-between">
 <div className="text-2xl font-semibold">
 {trendData.compliance.monthly[trendData.compliance.monthly.length - 1].score}%
 </div>
 <div
 className={`flex items-center ${complianceImprovement >= 0 ? 'text-green-600' : 'text-red-600'}`}
 >
 <span className="text-sm font-medium">
 {complianceImprovement > 0 ? '+' : ''}
 {complianceImprovement}%
 </span>
 {complianceImprovement >= 0 ? (
 <svg
 className="w-4 h-4 ml-1"
 fill="none"
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth="2"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
 </svg>
 ) : (
 <svg
 className="w-4 h-4 ml-1"
 fill="none"
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth="2"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
 </svg>
 )}
 </div>
 </div>

 <div className="mt-4 pt-3 border-t">
 <p className="text-xs text-gray-500">Current Month</p>
 </div>
 </div>

 <div className="bg-white border rounded-lg p-5">
 <div className="flex items-center mb-4">
 <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
 <Users className="w-5 h-5 text-green-600" />
 </div>
 <div className="ml-3">
 <h3 className="text-sm font-medium text-gray-900">Activity</h3>
 <p className="text-xs text-gray-500">Content edits this month</p>
 </div>
 </div>

 <div className="flex items-baseline justify-between">
 <div className="text-2xl font-semibold">
 {trendData.activity.monthly[trendData.activity.monthly.length - 1].edits}
 </div>
 <div className="text-green-600 flex items-center">
 <span className="text-sm font-medium">
 +
 {trendData.activity.monthly[trendData.activity.monthly.length - 1].edits -
 trendData.activity.monthly[trendData.activity.monthly.length - 2].edits}
 </span>
 <svg
 className="w-4 h-4 ml-1"
 fill="none"
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth="2"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
 </svg>
 </div>
 </div>

 <div className="mt-4 pt-3 border-t">
 <p className="text-xs text-gray-500">vs. Previous Month</p>
 </div>
 </div>

 <div className="bg-white border rounded-lg p-5">
 <div className="flex items-center mb-4">
 <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
 <FileBarChart2 className="w-5 h-5 text-indigo-600" />
 </div>
 <div className="ml-3">
 <h3 className="text-sm font-medium text-gray-900">Quality</h3>
 <p className="text-xs text-gray-500">CtQ factor completion</p>
 </div>
 </div>

 <div className="flex items-baseline justify-between">
 <div className="text-2xl font-semibold">{Math.round(ctqCompletionEnd)}%</div>
 <div
 className={`flex items-center ${ctqImprovement >= 0 ? 'text-green-600' : 'text-red-600'}`}
 >
 <span className="text-sm font-medium">
 {ctqImprovement > 0 ? '+' : ''}
 {Math.round(ctqImprovement)}%
 </span>
 {ctqImprovement >= 0 ? (
 <svg
 className="w-4 h-4 ml-1"
 fill="none"
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth="2"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
 </svg>
 ) : (
 <svg
 className="w-4 h-4 ml-1"
 fill="none"
 strokeLinecap="round"
 strokeLinejoin="round"
 strokeWidth="2"
 viewBox="0 0 24 24"
 stroke="currentColor"
 >
 <path d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
 </svg>
 )}
 </div>
 </div>

 <div className="mt-4 pt-3 border-t">
 <p className="text-xs text-gray-500">
 {reportData.quality.ctqFactorsCompleted}/{reportData.quality.ctqFactorsTotal} factors
 complete
 </p>
 </div>
 </div>
 </div>
 );
 };

 // Render trend report with improved visualizations
 const renderTrendReport = () => (
 <div className="space-y-6">
 {/* Top KPI cards showing improvement */}
 {renderProgressDashboard()}

 {/* Main trend charts */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">Regulatory Framework Comparison</CardTitle>
 <CardDescription>Compliance trends across key regulatory frameworks</CardDescription>
 </CardHeader>
 <CardContent>{renderComparisonChart()}</CardContent>
 </Card>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">Compliance Score Trend</CardTitle>
 <CardDescription>5-month compliance score history</CardDescription>
 </CardHeader>
 <CardContent>
 {renderLineChart(
 trendData.compliance.monthly,
 'score',
 'border-stone-500',
 'Overall Compliance Progress',
 true
 )}
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">Activity Volume Trend</CardTitle>
 <CardDescription>5-month edit history</CardDescription>
 </CardHeader>
 <CardContent>
 {renderLineChart(
 trendData.activity.monthly,
 'edits',
 'border-green-500',
 'Document Edit Activity'
 )}
 </CardContent>
 </Card>
 </div>

 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">Insight Summary</CardTitle>
 <CardDescription>Key observations based on report data</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="space-y-3">
 <h3 className="text-sm font-medium text-stone-600">Compliance Insights</h3>
 <ul className="space-y-2 text-sm">
 <li className="flex items-start">
 <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5 flex-shrink-0" />
 <span>Overall compliance has improved by 13% in the last 5 months.</span>
 </li>
 <li className="flex items-start">
 <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5 flex-shrink-0" />
 <span>EU MDR compliance has seen the most significant improvement (16%).</span>
 </li>
 <li className="flex items-start">
 <AlertTriangle className="h-4 w-4 mr-2 text-amber-500 mt-0.5 flex-shrink-0" />
 <span>FDA CFR 21 compliance is still below the required threshold (80%).</span>
 </li>
 </ul>
 </div>

 <div className="space-y-3">
 <h3 className="text-sm font-medium text-green-600">Quality Insights</h3>
 <ul className="space-y-2 text-sm">
 <li className="flex items-start">
 <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5 flex-shrink-0" />
 <span>All high-risk Critical-to-Quality factors are now complete.</span>
 </li>
 <li className="flex items-start">
 <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5 flex-shrink-0" />
 <span>Overall CtQ factor completion rate has improved from 55% to 82%.</span>
 </li>
 <li className="flex items-start">
 <AlertTriangle className="h-4 w-4 mr-2 text-amber-500 mt-0.5 flex-shrink-0" />
 <span>Low-risk factors need attention (only 67% complete).</span>
 </li>
 </ul>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 );

 // Render the active report based on selection
 const renderActiveReport = () => {
 switch (activeReportType) {
 case 'compliance':
 return renderComplianceReport();
 case 'activity':
 return renderActivityReport();
 case 'quality':
 return renderQualityReport();
 case 'trends':
 return renderTrendReport();
 default:
 return <div>Select a report type to view</div>;
 }
 };

 return (
 <div className="space-y-8">
 <div className="p-4 bg-white rounded-lg border">
 <div className="flex flex-col md:flex-row justify-between space-y-4 md:space-y-0 md:items-center mb-6">
 <div>
 <h2 className="text-2xl font-bold mb-1">Comprehensive Reports</h2>
 <p className="text-gray-500">
 Generate detailed reports to monitor compliance, activity, and quality metrics
 </p>
 </div>

 <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
 <Button
 onClick={generatePDFReport}
 disabled={isGeneratingReport}
 className="flex items-center space-x-1"
 >
 <FileText className="h-4 w-4" />
 <span>Generate PDF Report</span>
 </Button>

 <Button
 variant="outline"
 onClick={generatePDFReport}
 disabled={isGeneratingReport}
 className="flex items-center space-x-1"
 >
 <Download className="h-4 w-4" />
 <span>Export Data</span>
 </Button>
 </div>
 </div>

 <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 mb-6">
 <Tabs
 defaultValue="compliance"
 value={activeReportType}
 onValueChange={setActiveReportType}
 className="w-full md:w-auto"
 >
 <TabsList>
 <TabsTrigger value="compliance" className="flex items-center">
 <FileCheck className="h-4 w-4 mr-1" />
 Compliance
 </TabsTrigger>
 <TabsTrigger value="activity" className="flex items-center">
 <Users className="h-4 w-4 mr-1" />
 Activity
 </TabsTrigger>
 <TabsTrigger value="quality" className="flex items-center">
 <FileBarChart2 className="h-4 w-4 mr-1" />
 Quality
 </TabsTrigger>
 <TabsTrigger value="trends" className="flex items-center">
 <BarChart3 className="h-4 w-4 mr-1" />
 Trends
 </TabsTrigger>
 </TabsList>
 </Tabs>

 <div className="flex flex-col md:flex-row gap-2 items-start md:items-center">
 <div className="w-full md:w-48">
 <Select value={reportTimeframe} onValueChange={setReportTimeframe}>
 <SelectTrigger>
 <SelectValue placeholder="Select timeframe" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="last7days">Last 7 Days</SelectItem>
 <SelectItem value="last30days">Last 30 Days</SelectItem>
 <SelectItem value="last90days">Last 90 Days</SelectItem>
 <SelectItem value="allTime">All Time</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <Button
 variant="outline"
 size="sm"
 onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
 className="flex items-center"
 >
 {showAdvancedFilters ? 'Hide Filters' : 'Advanced Filters'}
 </Button>
 </div>
 </div>

 {/* Advanced Filters Panel */}
 {showAdvancedFilters && (
 <div className="mb-6 p-4 border rounded-md bg-gray-50">
 <h3 className="text-sm font-medium mb-3">Advanced Filters</h3>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div>
 <label className="text-xs text-gray-500 mb-1 block">Regulatory Framework</label>
 <Select value={selectedRegulatory} onValueChange={setSelectedRegulatory}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select framework" />
 </SelectTrigger>
 <SelectContent>
 {regulatoryFrameworks.map(framework => (
 <SelectItem key={framework.id} value={framework.id}>
 {framework.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div>
 <label className="text-xs text-gray-500 mb-1 block">Section Focus</label>
 <Select
 value={drilldownSection || 'all'}
 onValueChange={val => setDrilldownSection(val === 'all' ? null : val)}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="All sections" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">All sections</SelectItem>
 {reportData.compliance.bySection.map((section, index) => (
 <SelectItem key={index} value={section.section}>
 {section.section}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="flex items-end">
 <Button
 variant="secondary"
 size="sm"
 className="flex items-center gap-1"
 onClick={() => {
 setSelectedRegulatory('all');
 setDrilldownSection(null);
 }}
 >
 Reset Filters
 </Button>
 </div>
 </div>
 </div>
 )}

 {renderActiveReport()}
 </div>
 </div>
 );
};

export default CerComprehensiveReportsPanel;
