/**
 * @fileoverview Medical Writing Workspace
 * @module concept2cure/components/canvas/workspaces/MedicalWritingWorkspace
 */

import React from 'react';
import { PenTool, FileText, BookOpen, CheckCircle2, RefreshCw, Target } from 'lucide-react';

interface MedicalWritingWorkspaceProps {
  projectId?: string;
  userId: string;
  onNavigate?: (destination: string) => void;
}

export const MedicalWritingWorkspace: React.FC<MedicalWritingWorkspaceProps> = ({
  projectId,
  userId,
  onNavigate,
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <h2 className="text-base font-medium text-stone-900">Medical Writing Workspace</h2>
        <p className="text-sm text-stone-500">Document Authoring & Review</p>
      </div>

      <div className="flex-1 p-6">
        <div className="grid grid-cols-3 gap-6">
          {[
            { icon: PenTool, title: 'eCTD CoAuthor', description: 'RI-assisted authoring' },
            { icon: FileText, title: 'Document Queue', description: 'Active assignments' },
            { icon: BookOpen, title: 'Style Guide', description: 'Templates & standards' },
            { icon: CheckCircle2, title: 'QC Checklist', description: 'Review workflows' },
            { icon: RefreshCw, title: 'Version Control', description: 'Redline management' },
            { icon: Target, title: 'Citations', description: 'Reference management' },
          ].map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-stone-200 p-4 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              <div className="w-12 h-12 rounded-lg bg-rose-100 flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6 text-rose-600" />
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

export default MedicalWritingWorkspace;
