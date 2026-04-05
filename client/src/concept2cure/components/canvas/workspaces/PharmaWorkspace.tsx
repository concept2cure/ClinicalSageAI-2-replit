/**
 * @fileoverview Pharma Industry Workspace
 * @module concept2cure/components/canvas/workspaces/PharmaWorkspace
 */

import React from 'react';
import { Building2, FileText, Beaker, TrendingUp, BarChart2 } from 'lucide-react';

interface PharmaWorkspaceProps {
  projectId?: string;
  userId: string;
  onNavigate?: (destination: string) => void;
}

export const PharmaWorkspace: React.FC<PharmaWorkspaceProps> = ({
  projectId,
  userId,
  onNavigate,
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <h2 className="text-base font-medium text-stone-900">Pharma Workspace</h2>
        <p className="text-sm text-stone-500">IND, NDA, BLA & Global Regulatory Tools</p>
      </div>
      
      <div className="flex-1 p-6">
        <div className="grid grid-cols-3 gap-6">
          {[
            { icon: FileText, title: 'IND Module', description: 'IND submission preparation' },
            { icon: Beaker, title: 'CMC Wizard', description: 'Chemistry, Manufacturing, Controls' },
            { icon: TrendingUp, title: 'Clinical Hub', description: 'Protocol & trial management' },
            { icon: Building2, title: 'Global RA', description: 'Multi-region submissions' },
            { icon: BarChart2, title: 'Portfolio', description: 'Pipeline analytics' },
          ].map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-stone-200 p-4 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              <div className="w-12 h-12 rounded-lg bg-stone-200 flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6 text-stone-600" />
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

export default PharmaWorkspace;
