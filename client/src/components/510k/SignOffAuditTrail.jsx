import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  Clock,
  User,
  CalendarClock,
  MailCheck,
  ClipboardList,
  FileCheck,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import ManagerSignOffService from '../../services/ManagerSignOffService';

/**
 * Sign-Off Audit Trail Component
 *
 * Displays a timeline of all manager sign-offs for a 510(k) submission
 * with detailed information and audit capabilities.
 */
const SignOffAuditTrail = ({ deviceName, exportable = false }) => {
  const [signOffHistory, setSignOffHistory] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState({});

  useEffect(() => {
    if (deviceName) {
      try {
        // Get sign-off history from the service
        const deviceSignOffs = ManagerSignOffService.getApprovalHistory(deviceName);
        setSignOffHistory(deviceSignOffs);
      } catch (error) {
        console.error('[SignOffAuditTrail] Error loading sign-off history:', error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [deviceName]);

  // Toggle expanded view for a sign-off record
  const toggleExpand = stageId => {
    setExpandedItems(prev => ({
      ...prev,
      [stageId]: !prev[stageId],
    }));
  };

  // Generate PDF audit report
  const generateAuditReport = () => {
    console.log('[SignOffAuditTrail] Generating PDF audit report');
    // In a real implementation, this would generate a PDF report
    // For now, we'll just log the data
    const auditData = Object.values(signOffHistory);
    console.log('[SignOffAuditTrail] Audit data:', auditData);

    alert('Audit report generation would be implemented in production.');
  };

  // Sort sign-offs chronologically
  const getSortedSignOffs = () => {
    const stageOrder = {
      'Predicate Device Selection': 1,
      'Substantial Equivalence': 2,
      'FDA Compliance Check': 3,
      'Final Submission': 4,
    };

    return Object.values(signOffHistory).sort((a, b) => {
      // First sort by predefined stage order
      const stageOrderDiff = stageOrder[a.stageName] - stageOrder[b.stageName];
      if (stageOrderDiff !== 0) return stageOrderDiff;

      // Then sort by timestamp (most recent first)
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  };

  // Check if there are any sign-offs
  const hasSignOffs = Object.keys(signOffHistory).length > 0;

  // Map stage names to icon components
  const stageIcons = {
    'Predicate Device Selection': <SearchCheck className="h-5 w-5 text-blue-600" />,
    'Substantial Equivalence': <GitCompare className="h-5 w-5 text-purple-600" />,
    'FDA Compliance Check': <CheckCircle className="h-5 w-5 text-green-600" />,
    'Final Submission': <FileArchive className="h-5 w-5 text-orange-600" />,
  };

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-white border-b">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl font-bold text-gray-800">
              <div className="flex items-center">
                <ShieldCheck className="h-5 w-5 text-blue-600 mr-2" />
                Sign-Off Audit Trail
              </div>
            </CardTitle>
            <CardDescription className="text-gray-600">
              Complete timeline of manager approvals for {deviceName}
            </CardDescription>
          </div>

          {exportable && hasSignOffs && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateAuditReport}
              className="flex items-center text-xs"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Export Audit Report
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex items-center justify-center p-6">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
            <span className="ml-2 text-gray-500">Loading sign-off history...</span>
          </div>
        ) : !hasSignOffs ? (
          <div className="text-center py-8 text-gray-500">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="text-lg font-medium text-gray-600">No Sign-Off Records</p>
            <p className="mt-1">Manager approvals will appear here when completed.</p>
          </div>
        ) : (
          <ScrollArea className="h-[380px] pr-4">
            <div className="space-y-6">
              {getSortedSignOffs().map((signOff, index) => {
                const isExpanded = !!expandedItems[signOff.id];
                const SignOffIcon = stageIcons[signOff.stageName] || (
                  <FileCheck className="h-5 w-5 text-blue-600" />
                );

                return (
                  <div key={signOff.id} className="relative">
                    {/* Vertical timeline line */}
                    {index < getSortedSignOffs().length - 1 && (
                      <div className="absolute top-12 bottom-0 left-4 w-0.5 bg-gray-200"></div>
                    )}

                    <div className="relative">
                      {/* Circle for timeline point */}
                      <div className="absolute left-2 top-1 w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-500 z-10"></div>

                      <div className="ml-10 pb-6">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                              {SignOffIcon}
                              <span className="ml-2">{signOff.stageName}</span>
                            </h3>
                            <p className="text-sm text-gray-500 flex items-center mt-1">
                              <CalendarClock className="h-3.5 w-3.5 mr-1" />
                              {new Date(signOff.timestamp).toLocaleString()}
                            </p>
                          </div>

                          <Badge className="bg-green-100 text-green-800">Approved</Badge>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center">
                            <User className="h-3.5 w-3.5 text-gray-400 mr-1" />
                            <span className="text-sm font-medium">{signOff.managerName}</span>
                          </div>

                          <div className="flex items-center mt-1">
                            <MailCheck className="h-3.5 w-3.5 text-gray-400 mr-1" />
                            <span className="text-sm">{signOff.managerEmail}</span>
                          </div>
                        </div>

                        {/* Expandable content */}
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpand(signOff.id)}
                            className="text-xs p-0 h-6 text-blue-600 hover:text-blue-800"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                                Hide Details
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                                Show Details
                              </>
                            )}
                          </Button>

                          {isExpanded && (
                            <div className="mt-3 bg-gray-50 p-3 rounded-md">
                              {/* Requirements checked */}
                              <div className="mb-3">
                                <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1">
                                  Requirements Confirmed
                                </h4>
                                <ul className="text-sm">
                                  {Object.entries(signOff.requirementsChecked || {}).map(
                                    ([reqId, checked]) => {
                                      if (!checked) return null;

                                      // Use requirement text from the service based on ID
                                      const stageReqs = ManagerSignOffService.getStageRequirements(
                                        signOff.stageName
                                      );
                                      const requirement = stageReqs.find(r => r.id === reqId);

                                      return (
                                        <li key={reqId} className="flex items-center mb-1">
                                          <ShieldCheck className="h-3.5 w-3.5 text-green-500 mr-1" />
                                          <span>
                                            {requirement?.text || `Requirement #${reqId}`}
                                          </span>
                                        </li>
                                      );
                                    }
                                  )}
                                </ul>
                              </div>

                              {/* Notes */}
                              {signOff.notes && (
                                <div>
                                  <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1">
                                    Additional Notes
                                  </h4>
                                  <p className="text-sm whitespace-pre-line">{signOff.notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

// Icons for the different stage types
const CheckCircle = props => (
  <svg
    {...props}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const GitCompare = props => (
  <svg
    {...props}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
    />
  </svg>
);

const SearchCheck = props => (
  <svg
    {...props}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
  </svg>
);

const FileArchive = props => (
  <svg
    {...props}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
    />
  </svg>
);

export default SignOffAuditTrail;
