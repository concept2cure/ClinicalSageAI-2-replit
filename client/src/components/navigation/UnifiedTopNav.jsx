// /client/src/components/navigation/UnifiedTopNav.jsx

import { useLocation } from 'wouter'; // wouter doesn't have useNavigate, it has useLocation

export default function UnifiedTopNav({ activeTab, onTabChange }) {
  const [location, navigate] = useLocation();

  return (
    <div className="w-full bg-white shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50">
      {/* Left Side - Navigation Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.history.back()}
          className="px-3 py-1 text-xs font-medium bg-gray-100 rounded hover:bg-gray-200"
        >
          ← Back
        </button>

        <button
          onClick={() => window.history.forward()}
          className="px-3 py-1 text-xs font-medium bg-gray-100 rounded hover:bg-gray-200"
        >
          → Forward
        </button>

        <button
          onClick={() => navigate('/client-portal')}
          className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Return to Client Portal
        </button>
      </div>

      {/* Center Tabs */}
      <div className="flex items-center gap-6">
        <button
          onClick={() => onTabChange('RiskHeatmap')}
          className={`text-sm font-semibold ${
            activeTab === 'RiskHeatmap'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-indigo-600'
          }`}
        >
          Risk Heatmap
        </button>

        <button
          onClick={() => onTabChange('TimelineSimulator')}
          className={`text-sm font-semibold ${
            activeTab === 'TimelineSimulator'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-indigo-600'
          }`}
        >
          Timeline Simulator
        </button>

        <button
          onClick={() => onTabChange('AskLumenAI')}
          className={`text-sm font-semibold ${
            activeTab === 'AskLumenAI'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-indigo-600'
          }`}
        >
          Ask AnA
        </button>
      </div>
    </div>
  );
}
