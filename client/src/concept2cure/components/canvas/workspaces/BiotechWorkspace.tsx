/**
 * @fileoverview Biotech Industry Workspace
 * @module concept2cure/components/canvas/workspaces/BiotechWorkspace
 */

import React from 'react';
import { Dna, FileText, Microscope, TrendingUp, Target, Beaker } from 'lucide-react';

interface BiotechWorkspaceProps {
  projectId?: string;
  userId: string;
  onNavigate?: (destination: string) => void;
}

export const BiotechWorkspace: React.FC<BiotechWorkspaceProps> = ({
  projectId,
  userId,
  onNavigate,
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <h2 className="text-base font-medium text-stone-900">Biotech Workspace</h2>
        <p className="text-sm text-stone-500">Biologics, Gene Therapy & Advanced Therapies</p>
      </div>
      
      <div className="flex-1 p-6">
        <div className="grid grid-cols-3 gap-6">
          {[
            { icon: Dna, title: 'BLA Module', description: 'Biologics license application' },
            { icon: Microscope, title: 'CMC Biologics', description: 'Bioprocess characterization' },
            { icon: Target, title: 'IND-Enabling', description: 'Pre-IND strategy & planning' },
            { icon: Beaker, title: 'Analytical Dev', description: 'Method development tracking' },
            { icon: TrendingUp, title: 'Program Dashboard', description: 'Pipeline milestones' },
            { icon: FileText, title: 'Regulatory Intel', description: 'Biologics guidance tracker' },
          ].map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-stone-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6 text-emerald-600" />
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

export default BiotechWorkspace;
