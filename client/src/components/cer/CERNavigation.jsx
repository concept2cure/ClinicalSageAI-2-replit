import React from 'react';

/**
 * Simple navigation component for CER interface
 * Uses basic HTML elements instead of Radix UI components to avoid RovingFocusGroup errors
 */
export default function CERNavigation({ activeTab, onTabChange }) {
  // Navigation row definitions
  const rows = [
    {
      label: 'Preparation:',
      tabs: [
        { id: 'builder', label: 'Builder', icon: 'FileText' },
        { id: 'cep', label: 'Evaluation Plan', icon: 'ClipboardList' },
        { id: 'documents', label: 'Documents', icon: 'FolderOpen' },
        { id: 'data-retrieval', label: 'Data Retrieval', icon: 'Database' },
      ],
    },
    {
      label: 'Evidence:',
      tabs: [
        { id: 'literature', label: 'Literature', icon: 'BookOpen' },
        { id: 'literature-review', label: 'Literature Review', icon: 'BookOpen' },
        { id: 'internal-clinical-data', label: 'Internal Clinical Data', icon: 'FileSpreadsheet' },
        { id: 'sota', label: 'State of Art', icon: 'BookMarked' },
      ],
    },
    {
      label: 'Analysis:',
      tabs: [
        { id: 'equivalence', label: 'Equivalence', icon: 'GitCompare' },
        { id: 'gspr-mapping', label: 'GSPR Mapping', icon: 'BarChart' },
        { id: 'compliance', label: 'Compliance', icon: 'CheckSquare' },
        { id: 'assistant', label: 'Assistant', icon: 'Lightbulb' },
      ],
    },
  ];

  // Render icon based on name (assumes icons are passed as components from parent)
  const renderIcon = iconName => {
    const icons = {
      FileText: () => <span className="h-3.5 w-3.5 mr-1.5">📄</span>,
      ClipboardList: () => <span className="h-3.5 w-3.5 mr-1.5">📋</span>,
      FolderOpen: () => <span className="h-3.5 w-3.5 mr-1.5">📂</span>,
      Database: () => <span className="h-3.5 w-3.5 mr-1.5">🗄️</span>,
      BookOpen: () => <span className="h-3.5 w-3.5 mr-1.5">📖</span>,
      FileSpreadsheet: () => <span className="h-3.5 w-3.5 mr-1.5">📊</span>,
      BookMarked: () => <span className="h-3.5 w-3.5 mr-1.5">🔖</span>,
      GitCompare: () => <span className="h-3.5 w-3.5 mr-1.5">⚖️</span>,
      BarChart: () => <span className="h-3.5 w-3.5 mr-1.5">📊</span>,
      CheckSquare: () => <span className="h-3.5 w-3.5 mr-1.5">✅</span>,
      Lightbulb: () => <span className="h-3.5 w-3.5 mr-1.5">💡</span>,
    };

    return icons[iconName] ? icons[iconName]() : null;
  };

  return (
    <nav className="w-full">
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`overflow-x-auto whitespace-nowrap bg-white border-b border-[#e8e6dc] py-2 ${rowIndex === rows.length - 1 ? 'mb-4' : ''}`}
        >
          <div className="flex items-center px-6">
            <div className="flex items-center mr-4 flex-shrink-0">
              <span className="text-xs font-medium text-[#6b6963]">{row.label}</span>
            </div>

            <div className="inline-flex items-center">
              {row.tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`
                    flex-shrink-0 mx-1 rounded-none border-b-2 px-3 py-1 
                    font-normal text-xs sm:text-sm flex items-center
                    ${
                      activeTab === tab.id
                        ? 'border-[#d97757] text-[#d97757]'
                        : 'border-transparent text-[#616161] hover:text-[#d97757]'
                    }
                  `}
                >
                  {renderIcon(tab.icon)}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </nav>
  );
}
