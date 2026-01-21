import React from 'react';
import { Folder, FileText, ChevronDown } from 'lucide-react';

export interface EctdTreeNode {
  id: string;
  title: string;
  children: { id: string; title: string }[];
}

export const ECTD_TREE: EctdTreeNode[] = [
  {
    id: 'm1',
    title: 'Module 1: Administrative',
    children: [
      { id: '1.1', title: '1.1 Cover Letter' },
      { id: '1.3', title: '1.3 Administrative Information' },
    ],
  },
  {
    id: 'm2',
    title: 'Module 2: Summaries',
    children: [
      { id: '2.1', title: '2.1 510(k) Summary' },
      { id: '2.2', title: '2.2 Indications for Use' },
    ],
  },
  {
    id: 'm5',
    title: 'Module 5: Clinical',
    children: [{ id: '5.1', title: '5.1 Clinical Reports' }],
  },
];

interface NavigatorProps {
  activeDoc: string;
  onSelect: (id: string) => void;
}

export const ECTDNavigator: React.FC<NavigatorProps> = ({ activeDoc, onSelect }) => {
  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-full">
      <div className="p-4 border-b border-slate-100 font-bold text-slate-700 text-sm flex items-center gap-2">
        <Folder size={16} className="text-blue-600" /> eCTD HIERARCHY
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {ECTD_TREE.map(module => (
          <div key={module.id} className="mb-2">
            <div className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1 px-2">
              <ChevronDown size={12} /> {module.title}
            </div>
            <div className="pl-4 space-y-1">
              {module.children.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => onSelect(doc.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                    activeDoc === doc.id
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText size={12} /> {doc.title}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};