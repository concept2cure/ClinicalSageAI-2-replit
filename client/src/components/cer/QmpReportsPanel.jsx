import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toaster';
import {
  BarChart3, FileText, History, Network, Layers, Download, ClipboardCheck, AlertCircle } from 'lucide-react'
import QmpAuditTrailPanel from './QmpAuditTrailPanel';
import QmpTraceabilityHeatmap from './QmpTraceabilityHeatmap';

/**
 * QMP Reports Panel Component
 *
 * This component consolidates all reporting functionality for the Quality Management Plan,
 * including the Audit Trail and Traceability Heatmap.
 *
 * @param {Object} props - Component props
 * @param {Object} props.qmpData - Quality Management Plan data
 * @param {Array} props.objectives - Quality objectives
 * @param {Array} props.ctqFactors - Critical-to-Quality factors
 * @param {Object} props.complianceMetrics - Compliance metrics for the plan
 */
const QmpReportsPanel = ({ qmpData, objectives, ctqFactors, complianceMetrics }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('audit-trail');

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <BarChart3 className="h-5 w-5 text-blue-600 mr-2" />
              <CardTitle className="text-lg text-gray-800">Quality Management Reports</CardTitle>
            </div>
            <Badge variant="outline" className="font-normal text-xs">
              ICH E6(R3) &amp; 21 CFR Part 11 Compliant
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-2 mb-6 bg-gray-100">
              <TabsTrigger
                value="audit-trail"
                className="data-[state=active]:bg-white flex items-center"
              >
                <History className="h-4 w-4 mr-2" />
                <span>Audit Trail</span>
              </TabsTrigger>
              <TabsTrigger
                value="traceability"
                className="data-[state=active]:bg-white flex items-center"
              >
                <Network className="h-4 w-4 mr-2" />
                <span>Traceability Heatmap</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="audit-trail" className="mt-0">
              <div className="flex items-center mb-3">
                <FileText className="h-5 w-5 text-blue-600 mr-2" />
                <h3 className="text-lg font-medium text-gray-800">
                  Quality Management Plan Audit Trail
                </h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This audit trail provides a complete history of all changes made to the Quality
                Management Plan, including modifications to quality objectives and
                critical-to-quality factors.
              </p>

              <QmpAuditTrailPanel />
            </TabsContent>

            <TabsContent value="traceability" className="mt-0">
              <div className="flex items-center mb-3">
                <Layers className="h-5 w-5 text-blue-600 mr-2" />
                <h3 className="text-lg font-medium text-gray-800">
                  Quality Factor Traceability Heatmap
                </h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This interactive heatmap visualizes the relationships between quality objectives,
                critical-to-quality factors, and CER sections to provide a comprehensive view of
                quality coverage.
              </p>

              <QmpTraceabilityHeatmap
                objectives={objectives}
                ctqFactors={ctqFactors}
                complianceMetrics={complianceMetrics}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default QmpReportsPanel;
