// /client/src/pages/RegulatoryDashboard.jsx

import React, { useState } from 'react';
import UnifiedTopNav from '../components/navigation/UnifiedTopNav';
import AdvisorSummaryPanel from '../components/advisor/AdvisorSummaryPanel';
import AdvisorRiskHeatmapV2 from '../components/advisor/AdvisorRiskHeatmapV2';
import AdvisorTimelineSimulator from '../components/advisor/AdvisorTimelineSimulator';
import AskLumenAI from '../components/advisor/AskLumenAI';
import LumenAssistantButton from '../components/assistant/LumenAssistantButton'; // Chat Co-Pilot button

export default function RegulatoryDashboard() {
  const [activeTab, setActiveTab] = useState('RiskHeatmap');

  return (
    <div className="min-h-screen bg-zinc-50">
      <UnifiedTopNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Top Metrics Section - Always visible */}
      <div className="p-8 pb-0">
        <AdvisorSummaryPanel />
      </div>

      {/* Conditional Tab Display */}
      <div className="p-8">
        {activeTab === 'RiskHeatmap' && (
          <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-6 text-zinc-900">CTD Critical Gap Risk Analysis</h2>
            <AdvisorRiskHeatmapV2 />
          </div>
        )}

        {activeTab === 'TimelineSimulator' && (
          <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm p-6">
            <AdvisorTimelineSimulator />
          </div>
        )}

        {activeTab === 'AskLumenAI' && (
          <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm p-6">
            <AskLumenAI />
          </div>
        )}
      </div>

      {/* Floating Ask AnA RI Co-Pilot - Only visible when not on AskLumenAI tab */}
      {activeTab !== 'AskLumenAI' && (
        <div className="fixed bottom-8 right-8 z-50">
          <LumenAssistantButton variant="default" size="lg" tooltip="Ask AnA — RI Co-pilot" />
        </div>
      )}
    </div>
  );
}
