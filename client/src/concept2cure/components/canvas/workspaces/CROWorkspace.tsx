/**
 * @fileoverview CRO Industry Workspace
 * @module concept2cure/components/canvas/workspaces/CROWorkspace
 */

import React from 'react';
import { Building2, Users, FileText, TrendingUp, Calendar, CheckCircle2 } from 'lucide-react';

interface CROWorkspaceProps {
  projectId?: string;
  userId: string;
  onNavigate?: (destination: string) => void;
}

export const CROWorkspace: React.FC<CROWorkspaceProps> = ({
  projectId,
  userId,
  onNavigate,
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <h2 className="text-xl font-semibold text-stone-900">CRO Workspace</h2>
        <p className="text-sm text-stone-500">Client & Study Management</p>
      </div>
      
      <div className="flex-1 p-6">
        <div className="grid grid-cols-3 gap-6">
          {[
            { icon: Building2, title: 'Client Portal', description: 'Multi-sponsor dashboard' },
            { icon: Users, title: 'Resource Hub', description: 'Team allocation & utilization' },
            { icon: FileText, title: 'Deliverables', description: 'Document tracking & handoff' },
            { icon: Calendar, title: 'Timeline Manager', description: 'Milestone tracking' },
            { icon: TrendingUp, title: 'Study Metrics', description: 'Performance analytics' },
            { icon: CheckCircle2, title: 'Quality', description: 'QC & audit readiness' },
          ].map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-stone-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-stone-900 mb-1">{item.title}</h3>
              <p className="text-sm text-stone-500">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CROWorkspace;
