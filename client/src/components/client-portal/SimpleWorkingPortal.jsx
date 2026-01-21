/**
 * Simple Working Portal
 *
 * A minimalist portal that provides direct navigation to all modules.
 * This is a temporary solution to ensure you can access your important modules
 * while the more complex portal issues are resolved.
 */

import React from 'react';
import { Link, useLocation } from 'wouter';
import {
  FileText,
  BookOpen,
  BarChart2,
  Database,
  Settings,
  AlertTriangle,
  BookMarked,
  ClipboardCheck,
  Layout,
  Beaker,
} from 'lucide-react';

const modules = [
  { id: 'dashboard', name: 'Dashboard', path: '/dashboard', color: 'blue', icon: Layout },
  {
    id: 'cerv2',
    name: 'Medical Device & Diagnostics Regulatory Module',
    path: '/cerv2',
    color: 'green',
    icon: FileText,
  },
  {
    id: 'ind-wizard',
    name: 'IND Wizard™',
    path: '/ind-wizard',
    color: 'indigo',
    icon: ClipboardCheck,
  },
  { id: 'ectd', name: 'eCTD Author™', path: '/ectd-author', color: 'purple', icon: BookOpen },
  { id: 'cmc', name: 'CMC Module™', path: '/cmc-blueprint', color: 'yellow', icon: Beaker },
  { id: 'csr', name: 'CSR Intelligence™', path: '/csr', color: 'teal', icon: BookOpen },
  {
    id: 'study',
    name: 'Study Architect™',
    path: '/study-architect',
    color: 'orange',
    icon: ClipboardCheck,
  },
  { id: 'reports', name: 'Reports', path: '/reports', color: 'pink', icon: BarChart2 },
  { id: 'vault', name: 'Vault™', path: '/vault', color: 'slate', icon: Database },
  {
    id: 'regulatory',
    name: 'Regulatory Hub™',
    path: '/regulatory-intelligence-hub',
    color: 'indigo',
    icon: BookMarked,
  },
  {
    id: 'risk',
    name: 'Risk Heatmap™',
    path: '/regulatory-risk-dashboard',
    color: 'red',
    icon: AlertTriangle,
  },
  { id: 'analytics', name: 'Analytics', path: '/analytics', color: 'cyan', icon: BarChart2 },
];

const SimpleWorkingPortal = () => {
  const [location] = useLocation();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold">
                <span className="text-blue-600">TrialSage</span>
                <span className="text-xs ml-1 bg-blue-100 text-blue-800 px-1 rounded">
                  Enterprise
                </span>
              </h1>
              <p className="text-sm text-gray-500">AI-Powered Regulatory Platform</p>
            </div>
            <div className="flex space-x-4">
              <select className="border rounded px-2 py-1 text-sm">
                <option>Acme CRO</option>
                <option>BioTech Innovations</option>
                <option>Clari-Pharm</option>
              </select>
              <select className="border rounded px-2 py-1 text-sm">
                <option>NeuroPharma Inc.</option>
                <option>GeneTech Labs</option>
                <option>MedAlliance</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 flex-grow">
        <h2 className="text-2xl font-bold mb-6">Access Your Modules</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map(module => (
            <div
              key={module.id}
              onClick={() => (window.location.href = module.path)}
              className="cursor-pointer"
            >
              <div className="block p-6 bg-white shadow rounded-lg hover:shadow-md transition-shadow">
                <div className="flex items-center mb-3">
                  <div className="p-2 rounded-full bg-blue-50 mr-3">
                    {module.icon && <module.icon className="h-6 w-6 text-blue-600" />}
                  </div>
                  <h3 className="text-lg font-semibold">{module.name}</h3>
                </div>
                <p className="text-sm text-gray-500 mt-1">Click to access this module</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="container mx-auto px-4 py-4">
          <div className="text-sm text-gray-500 text-center">
            TrialSage Enterprise Platform © 2025
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SimpleWorkingPortal;
