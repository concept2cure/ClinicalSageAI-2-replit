import React, { useState, useEffect } from 'react';
import ProjectForm from '../components/ProjectForm';
import ProjectList from '../components/ProjectList';
import Module1Forms from '../components/Module1Forms';
import Module3Benchling from '../components/Module3Benchling';
import Module3Manual from '../components/Module3Manual';
import HistoryTable from '../components/HistoryTable';
import Module2Narratives from '../components/Module2Narratives';
import EctdBuilder from '../components/EctdBuilder';
import EsgSubmit from '../components/EsgSubmit';
import AuditDashboard from '../components/AuditDashboard';
import RulesSettings from '../components/RulesSettings';
import ComplianceInsights from '../components/ComplianceInsights';
import KPIDashboard from '../components/kpi/KPIDashboard';
import RoleManager from '../components/RoleManager';
import DataPrivacy from '../components/DataPrivacy';
import RedactionLog from '../components/RedactionLog';
import WorkflowDashboard from '../components/ind-automation/WorkflowDashboard';
import { getJson } from '../services/api';

export default function IndAutomationPage() {
  const [tab, setTab] = useState('Dashboard');
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [projectHistory, setProjectHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch project history when a project is selected
  useEffect(() => {
    if (!selected?.project_id) return;

    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        const data = await getJson(`/api/ind/${selected.project_id}/history`);
        if (Array.isArray(data)) {
          setProjectHistory(data);
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [selected, refreshKey]);

  // Handle refreshing the page data
  const refreshData = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">IND Automation</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ProjectForm onCreated={refreshData} />
        <ProjectList
          key={refreshKey}
          onSelect={proj => {
            setSelected(proj);
            // Default to Dashboard tab when selecting a new project
            setTab('Dashboard');
          }}
        />
      </div>

      {selected && (
        <div className="border-t pt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              'Dashboard',
              'Module1',
              'Module2',
              'Module3',
              'eCTD GA',
              'ESG',
              'Compliance Rules',
              'Compliance Insights',
              'KPI Dashboard',
              'User Management',
              'Data Privacy',
              'Redaction Log',
              'Audit',
              'History',
            ].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-full transition-all ${
                  t === tab
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <h2 className="text-xl font-semibold mb-4">
            {tab === 'Dashboard'
              ? `${selected.project_id} - Submission Status`
              : `${tab} - ${selected.project_id}`}
          </h2>

          {tab === 'Dashboard' && (
            <WorkflowDashboard project={{ ...selected, history: projectHistory }} />
          )}

          {tab === 'Module1' && <Module1Forms project={selected} onComplete={refreshData} />}

          {tab === 'Module2' && (
            <div className="space-y-4">
              <Module2Narratives project={selected} onComplete={refreshData} />
            </div>
          )}

          {tab === 'Module3' && (
            <div className="space-y-4">
              <Module3Benchling project={selected} onComplete={refreshData} />
              <Module3Manual project={selected} onComplete={refreshData} />
            </div>
          )}

          {tab === 'eCTD GA' && (
            <div className="space-y-4">
              <EctdBuilder project={selected} onComplete={refreshData} />
            </div>
          )}

          {tab === 'ESG' && (
            <div className="space-y-4">
              <EsgSubmit project={selected} onComplete={refreshData} />
            </div>
          )}

          {tab === 'Compliance Rules' && (
            <div className="space-y-4">
              <RulesSettings org={selected.project_id} />
            </div>
          )}

          {tab === 'Compliance Insights' && (
            <div className="space-y-4">
              <ComplianceInsights org={selected.project_id} />
            </div>
          )}

          {tab === 'KPI Dashboard' && (
            <div className="space-y-4">
              <KPIDashboard org={selected.project_id} />
            </div>
          )}

          {tab === 'User Management' && (
            <div className="space-y-4">
              <RoleManager org={selected.project_id} />
            </div>
          )}

          {tab === 'Data Privacy' && (
            <div className="space-y-4">
              <DataPrivacy org={selected.project_id} />
            </div>
          )}

          {tab === 'Redaction Log' && (
            <div className="space-y-4">
              <RedactionLog org={selected.project_id} />
            </div>
          )}

          {tab === 'Audit' && (
            <div className="space-y-4">
              <AuditDashboard org={selected.project_id} />
            </div>
          )}

          {tab === 'History' && (
            <div className="space-y-4">
              <HistoryTable
                project={selected}
                history={projectHistory}
                loading={loadingHistory}
                onRefresh={refreshData}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
