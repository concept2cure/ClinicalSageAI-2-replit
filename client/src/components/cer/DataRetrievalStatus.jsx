import React from 'react';
import {
 Card,
 CardHeader,
 CardTitle,
 CardDescription,
 CardContent,
 CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, RefreshCw, Zap, AlertCircle, Database, BookOpen, ArrowRight } from 'lucide-react';
import CerTooltipWrapper from './CerTooltipWrapper';

/**
 * Render a text-based progress bar using block characters
 * @param {number} percent - Progress percentage (0-100)
 * @returns {string} - A text progress bar
 */
const renderProgressBar = percent => {
 const blocks = 10;
 const filled = Math.round((percent / 100) * blocks);

 return '▉'.repeat(filled) + '▁'.repeat(Math.max(0, blocks - filled));
};

/**
 * Data Retrieval Status Component
 *
 * This component displays the status of autonomous data retrieval for a CER report
 * and provides a button to trigger the data retrieval process.
 *
 * Enhanced with:
 * - Contextual tooltips for guidance
 * - Evidence snapshots
 * - Progress indicators
 * - Next step recommendations
 */
const DataRetrievalStatus = ({ reportId, status, isLoading, onTriggerRetrieval }) => {
 // No status to display yet
 if (!reportId) return null;

 // Helpers for displaying evidence counts
 const getFaersCount = () => {
 return status?.faersData?.eventCount || 0;
 };

 const getLiteratureCount = () => {
 return status?.literatureData?.studyCount || 0;
 };

 // Determine if data retrieval is complete
 const isDataRetrievalComplete =
 status?.faersStatus === 'completed' && status?.literatureStatus === 'completed';

 return (
 <div className="space-y-4">
 {/* Data Retrieval Status */}
 {status && (
 <Card
 className={`${isDataRetrievalComplete ? 'bg-green-50/50 border-green-200' : 'bg-muted/20'} transition-colors duration-500`}
 >
 <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center">
 {status.status === 'in_progress' ? (
 <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
 ) : isDataRetrievalComplete ? (
 <Database className="h-5 w-5 mr-2 text-green-600" />
 ) : (
 <AlertCircle className="h-5 w-5 mr-2 text-amber-500" />
 )}
 <CerTooltipWrapper
 content={
 <div>
 <p className="font-semibold mb-1">Data Retrieval Status</p>
 <p>
 This panel tracks the real-time progress of data collection from authentic
 sources:
 </p>
 <ul className="list-disc pl-4 mt-1 space-y-1">
 <li>FAERS: FDA Adverse Event Reporting System data</li>
 <li>Literature: Relevant clinical studies and publications</li>
 </ul>
 </div>
 }
 showIcon={false}
 >
 Autonomous Data Retrieval Status
 </CerTooltipWrapper>
 </CardTitle>
 </CardHeader>
 <CardContent className="pb-3">
 <div className="space-y-3">
 {/* Text-based progress bars as requested */}
 <div className="font-mono text-xs mt-3 mb-4">
 FAERS:{' '}
 {renderProgressBar(
 status.faersStatus === 'completed'
 ? 100
 : status.faersStatus === 'in_progress'
 ? 85
 : 0
 )}{' '}
 {status.faersStatus === 'completed'
 ? 100
 : status.faersStatus === 'in_progress'
 ? 85
 : 0}
 % | Literature:{' '}
 {renderProgressBar(
 status.literatureStatus === 'completed'
 ? 100
 : status.literatureStatus === 'in_progress'
 ? 95
 : 0
 )}{' '}
 {status.literatureStatus === 'completed'
 ? 100
 : status.literatureStatus === 'in_progress'
 ? 95
 : 0}
 %
 </div>

 {/* Status badges */}
 <div className="flex justify-between">
 <div className="flex items-center">
 <CerTooltipWrapper
 content={
 <div>
 <p className="font-semibold mb-1">FAERS Data</p>
 <p>
 Real adverse event data from the FDA's system that helps identify
 potential safety signals.
 </p>
 <p className="mt-1">
 These reports provide essential post-market surveillance data required by
 regulators.
 </p>
 </div>
 }
 >
 <span>FAERS Status</span>
 </CerTooltipWrapper>
 <Badge
 variant={
 status.faersStatus === 'completed'
 ? 'success'
 : status.faersStatus === 'failed'
 ? 'destructive'
 : 'secondary'
 }
 className="ml-2"
 >
 {status.faersStatus === 'completed'
 ? 'Completed'
 : status.faersStatus === 'in_progress'
 ? 'In Progress'
 : status.faersStatus === 'failed'
 ? 'Failed'
 : 'Pending'}
 </Badge>
 </div>

 <div className="flex items-center">
 <CerTooltipWrapper
 content={
 <div>
 <p className="font-semibold mb-1">Literature Data</p>
 <p>
 Relevant studies and publications that support your device's safety and
 performance claims.
 </p>
 <p className="mt-1">
 Required by MEDDEV 2.7/1 Rev 4 and EU MDR regulations.
 </p>
 </div>
 }
 >
 <span>Literature Status</span>
 </CerTooltipWrapper>
 <Badge
 variant={
 status.literatureStatus === 'completed'
 ? 'success'
 : status.literatureStatus === 'failed'
 ? 'destructive'
 : 'secondary'
 }
 className="ml-2"
 >
 {status.literatureStatus === 'completed'
 ? 'Completed'
 : status.literatureStatus === 'in_progress'
 ? 'In Progress'
 : status.literatureStatus === 'failed'
 ? 'Failed'
 : 'Pending'}
 </Badge>
 </div>
 </div>
 </div>

 {/* Evidence Snapshot - simple format as requested */}
 {isDataRetrievalComplete && (
 <div className="mt-4 p-3 bg-white rounded-md border border-green-200 shadow-sm">
 <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center">
 <Database className="h-4 w-4 mr-1" />
 Evidence Snapshot
 </h4>
 <div className="space-y-2 font-medium text-xs">
 <div className="text-stone-700">📊 {getFaersCount()} FAERS reports retrieved</div>
 <div className="text-purple-700">📚 {getLiteratureCount()} studies fetched</div>
 <div className="text-gray-600 text-xs mt-1">
 This reinforces the payoff—users see exactly how much data just landed.
 </div>
 </div>

 {/* Next step guidance */}
 <div className="mt-3 text-xs text-gray-500 flex items-center">
 <ArrowRight className="h-3.5 w-3.5 mr-1 text-green-600" />
 Next: Proceed to the Builder tab to generate sections using this data
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 )}

 {/* Autonomous Data Retrieval Button */}
 <Card className="border-dashed border-primary/50">
 <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center">
 <CerTooltipWrapper
 content={
 <div>
 <p className="font-semibold mb-1">Enhanced Data Retrieval</p>
 <p>This critical step fetches real-world data from authentic sources:</p>
 <ul className="list-disc pl-4 mt-1 space-y-1">
 <li>FDA FAERS adverse event reports</li>
 <li>Clinical literature from peer-reviewed sources</li>
 </ul>
 <p className="mt-2 text-green-700">
 Running this ensures your CER contains genuine evidence required by regulatory
 authorities.
 </p>
 </div>
 }
 showIcon={true}
 >
 Enhanced Data Retrieval
 </CerTooltipWrapper>
 </CardTitle>
 <CardDescription>
 Automatically retrieve and analyze FAERS and literature data for this report
 </CardDescription>
 </CardHeader>
 <CardContent className="pb-3">
 <div className="flex items-center justify-between">
 <div className="text-sm text-muted-foreground">
 <p>
 Report ID: <span className="font-mono text-xs">{reportId}</span>
 </p>
 <p className="text-xs text-gray-500 mt-1">
 <span className="text-amber-600 font-medium">Why run this?</span> AI drafts will
 auto-incorporate FAERS + literature evidence.
 </p>
 </div>
 <Button
 onClick={onTriggerRetrieval}
 disabled={isLoading || status?.status === 'in_progress'}
 variant={isDataRetrievalComplete ? 'outline' : 'default'}
 size="sm"
 className="gap-2"
 >
 {isLoading ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Zap className="h-4 w-4" />
 )}
 {isLoading
 ? 'Processing'
 : isDataRetrievalComplete
 ? 'Refresh Data'
 : '1-Click Evidence Fetch'}
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 );
};

export default DataRetrievalStatus;
