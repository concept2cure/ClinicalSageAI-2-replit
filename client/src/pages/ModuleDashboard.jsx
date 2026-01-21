import React from 'react';
import UnifiedTopNavV5 from '../components/navigation/UnifiedTopNavV5';
import Breadcrumbs from '../components/navigation/Breadcrumbs';
import ModuleCard from '../components/dashboard/ModuleCard';
import { Button } from '@/components/ui/button';
import './ModuleDashboard.css';

export default function ModuleDashboard() {
  // Hard-coded for demo; replace with fetch from /api/modules
  const modules = [
    {
      id: '1',
      title: 'Module 1: Administrative',
      to: '/coauthor?module=1',
      progress: 100,
      risk: 'low',
    },
    {
      id: '2',
      title: 'Module 2: CTD Summaries',
      to: '/coauthor?module=2',
      progress: 75,
      risk: 'med',
    },
    { id: '3', title: 'Module 3: Quality', to: '/coauthor?module=3', progress: 50, risk: 'high' },
    {
      id: '4',
      title: 'Module 4: Nonclinical',
      to: '/coauthor?module=4',
      progress: 20,
      risk: 'high',
    },
    {
      id: '5',
      title: 'Module 5: Clinical Study Reports',
      to: '/coauthor?module=5',
      progress: 0,
      risk: 'high',
    },
  ];

  const trialsageModules = [
    {
      id: 'cer',
      title: 'Medical Device & Diagnostics Regulatory Module',
      to: '/cerv2',
      progress: 80,
      risk: 'low',
    },
    { id: 'ind', title: 'IND Wizard™', to: '/ind-wizard', progress: 65, risk: 'med' },
    { id: 'vault', title: 'TrialSage Vault™', to: '/vault', progress: 90, risk: 'low' },
  ];

  return (
    <div className="dashboard-page">
      <UnifiedTopNavV5
        tabs={[
          { path: '/dashboard', label: 'Dashboard' },
          { path: '/coauthor', label: 'Co-Author' },
          { path: '/coauthor/canvas', label: 'Canvas' },
          { path: '/coauthor/timeline', label: 'Timeline' },
        ]}
      />

      <Breadcrumbs
        items={[
          { label: 'TrialSage™', to: '/' },
          { label: 'Client Portal', to: '/client-portal' },
          { label: 'eCTD Co-Author™', to: '/coauthor' },
          { label: 'Dashboard' },
        ]}
      />

      <div className="flex justify-between items-center mb-6">
        <h1 className="dashboard-title">CTD Module Dashboard</h1>
        <div className="space-x-4">
          <Button
            onClick={() => (window.location.href = '/')}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
          >
            Home
          </Button>
          <Button
            onClick={() => (window.location.href = '/client-portal')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
          >
            Go to Client Portal
          </Button>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">CTD Module Navigator</h2>
        <div className="dashboard-grid">
          {modules.map(mod => (
            <ModuleCard
              key={mod.id}
              title={mod.title}
              to={mod.to}
              progress={mod.progress}
              risk={mod.risk}
            />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">TrialSage™ Modules</h2>
        <div className="dashboard-grid">
          {trialsageModules.map(mod => (
            <ModuleCard
              key={mod.id}
              title={mod.title}
              to={mod.to}
              progress={mod.progress}
              risk={mod.risk}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Button
          onClick={() => (window.location.href = '/cerv2')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg text-lg font-semibold"
        >
          Go to Medical Device & Diagnostics Regulatory Module
        </Button>
      </div>
    </div>
  );
}
