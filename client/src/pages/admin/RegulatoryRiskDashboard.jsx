// client/src/pages/RegulatoryRiskDashboard.jsx
import { useState } from 'react';
import AdvisorRiskHeatmapV2 from '../../components/advisor/AdvisorRiskHeatmapV2';
import AdvisorSidebarV3 from '../../components/advisor/AdvisorSidebarV3';

export default function RegulatoryRiskDashboard() {
 // Define hardcoded mock data for immediate visualization
 const [selectedPlaybook, setSelectedPlaybook] = useState('Fast IND Playbook');

 const playbookData = {
 'Fast IND Playbook': {
 missingSections: [
 'CMC Stability Study',
 'Clinical Study Reports (CSR)',
 'Toxicology Reports',
 'Drug Substance Specs',
 'Pharmacology Reports',
 'Investigator Brochure Updates',
 ],
 readinessScore: 65,
 riskLevel: 'Medium',
 estimatedDelayDays: 49,
 },
 'Full NDA Playbook': {
 missingSections: [
 'CMC Stability Study',
 'Clinical Study Reports (CSR)',
 'Toxicology Reports',
 'ADME Studies',
 'Carcinogenicity Reports',
 'Genotoxicity Reports',
 'Quality Overall Summary',
 'Nonclinical Overview',
 'Clinical Summary',
 'Drug Substance Specs',
 'Drug Product Specs',
 'Clinical Safety Reports',
 ],
 readinessScore: 35,
 riskLevel: 'High',
 estimatedDelayDays: 128,
 },
 'EMA IMPD Playbook': {
 missingSections: [
 'CMC Stability Study',
 'GMP Certificates',
 'Clinical Overview',
 'Clinical Safety Reports',
 ],
 readinessScore: 75,
 riskLevel: 'Medium',
 estimatedDelayDays: 28,
 },
 };

 const currentData = playbookData[selectedPlaybook];

 const handlePlaybookChange = e => {
 setSelectedPlaybook(e.target.value);
 };

 return (
 <div className="container mx-auto p-4 max-w-7xl">
 <div className="mb-6">
 <h1 className="text-2xl font-bold text-gray-900 mb-2">
 Regulatory Risk Intelligence Dashboard
 </h1>
 <p className="text-gray-600">
 Comprehensive visualization of CTD readiness, risk levels, and critical submission gaps.
 </p>
 </div>

 <div className="mb-4">
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Select Regulatory Strategy:
 </label>
 <select
 className="px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm w-full sm:w-64"
 value={selectedPlaybook}
 onChange={handlePlaybookChange}
 >
 {Object.keys(playbookData).map(playbook => (
 <option key={playbook} value={playbook}>
 {playbook}
 </option>
 ))}
 </select>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
 {/* Enhanced Risk Visualization */}
 <div className="lg:col-span-3">
 <div className="bg-white rounded-lg shadow-lg p-6">
 <h2 className="text-xl font-bold mb-4">CTD Critical Risk Analysis</h2>

 {/* Summary cards */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
 <div className="bg-stone-50 p-4 rounded-lg">
 <h3 className="text-sm font-medium text-stone-700">Readiness</h3>
 <p className="text-2xl font-bold text-stone-800">{currentData.readinessScore}%</p>
 </div>

 <div className="bg-red-50 p-4 rounded-lg">
 <h3 className="text-sm font-medium text-red-700">Risk Level</h3>
 <p className="text-2xl font-bold text-red-800">{currentData.riskLevel}</p>
 </div>

 <div className="bg-amber-50 p-4 rounded-lg">
 <h3 className="text-sm font-medium text-amber-700">Delay Estimate</h3>
 <p className="text-2xl font-bold text-amber-800">
 {currentData.estimatedDelayDays} days
 </p>
 </div>

 <div className="bg-purple-50 p-4 rounded-lg">
 <h3 className="text-sm font-medium text-purple-700">Financial Impact</h3>
 <p className="text-2xl font-bold text-purple-800">
 ${(currentData.estimatedDelayDays * 50000).toLocaleString()}
 </p>
 </div>
 </div>

 <div className="bg-gray-50 p-4 rounded mb-6">
 <h3 className="text-lg font-semibold mb-3">Critical CTD Gaps</h3>
 {/* This is the heatmap component*/}
 <AdvisorRiskHeatmapV2 missingSections={currentData.missingSections} />
 </div>
 </div>
 </div>

 {/* Sidebar */}
 <div>
 <AdvisorSidebarV3 />
 </div>
 </div>

 {/* Disclaimer */}
 <div className="mt-8 bg-stone-50 border border-stone-100 rounded-lg p-4">
 <h3 className="text-sm font-medium text-stone-700 mb-1">Information</h3>
 <p className="text-xs text-stone-600">
 This dashboard visualizes submission readiness across CTD sections, highlighting critical
 regulatory gaps and risks. Select different regulatory playbooks to see how strategy
 changes affect submission timelines and requirements. Each missing section displays its
 risk level, delay impact, and estimated financial cost.
 </p>
 </div>
 </div>
 );
}
