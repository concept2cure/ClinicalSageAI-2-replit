/**
 * @fileoverview Regulatory Consulting Workspace
 * @module concept2cure/components/canvas/workspaces/RegulatoryWorkspace
 */

import React from 'react';
import { Scale, FileText, Globe, TrendingUp, AlertTriangle, Calendar } from 'lucide-react';

interface RegulatoryWorkspaceProps {
  projectId?: string;
  userId: string;
  onNavigate?: (destination: string) => void;
}

export const RegulatoryWorkspace: React.FC<RegulatoryWorkspaceProps> = ({
  projectId,
  userId,
  onNavigate,
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <h2 className="text-xl font-semibold text-zinc-900">Regulatory Consulting Workspace</h2>
        <p className="text-sm text-zinc-500">Multi-Client Strategy & Intelligence</p>
      </div>
      
      <div className="flex-1 p-6">
        <div className="grid grid-cols-3 gap-6">
          {[
            { icon: Scale, title: 'Strategy Builder', description: 'Regulatory pathway planning' },
            { icon: Globe, title: 'Global Intel', description: 'Multi-region updates' },
            { icon: FileText, title: 'Gap Analysis', description: 'Submission readiness' },
            { icon: AlertTriangle, title: 'Risk Assessment', description: 'Regulatory risk scoring' },
            { icon: Calendar, title: 'Meeting Prep', description: 'FDA/EMA meeting support' },
            { icon: TrendingUp, title: 'Client Dashboard', description: 'Portfolio overview' },
          ].map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-zinc-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-zinc-900 mb-1">{item.title}</h3>
              <p className="text-sm text-zinc-500">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RegulatoryWorkspace;
