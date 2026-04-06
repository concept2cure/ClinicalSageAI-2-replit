/**
 * Unified eCTD System
 * 
 * Complete eCTD management interface combining submission building,
 * module navigation, document management, and validation.
 * 
 * @version 3.0.0
 * @author Concept2Cure Engineering
 */

import React from 'react';
import { Folder, FileText, CheckCircle, AlertTriangle, Upload, Settings } from 'lucide-react';

// eCTD Module structure
const eCTDModules = [
 { id: 'm1', name: 'Module 1', title: 'Administrative Information', region: 'Regional' },
 { id: 'm2', name: 'Module 2', title: 'Common Technical Document Summaries', region: 'Common' },
 { id: 'm3', name: 'Module 3', title: 'Quality', region: 'Common' },
 { id: 'm4', name: 'Module 4', title: 'Nonclinical Study Reports', region: 'Common' },
 { id: 'm5', name: 'Module 5', title: 'Clinical Study Reports', region: 'Common' },
];

export default function UnifiedECTDSystem() {
 return (
 <div className="min-h-screen bg-gray-50 p-6">
 <div className="max-w-7xl mx-auto">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-3xl font-bold text-gray-900">eCTD Submission Builder</h1>
 <p className="text-gray-600 mt-2">
 Build and manage electronic Common Technical Documents for regulatory submissions
 </p>
 </div>

 {/* Quick Actions */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
 <button className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-stone-500 hover:shadow-md transition-all">
 <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
 <Upload className="w-5 h-5 text-stone-600" />
 </div>
 <div className="text-left">
 <p className="font-medium text-gray-900">New Submission</p>
 <p className="text-sm text-gray-500">Start a new eCTD</p>
 </div>
 </button>
 <button className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-stone-500 hover:shadow-md transition-all">
 <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
 <CheckCircle className="w-5 h-5 text-green-600" />
 </div>
 <div className="text-left">
 <p className="font-medium text-gray-900">Validate</p>
 <p className="text-sm text-gray-500">Run validation</p>
 </div>
 </button>
 <button className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-stone-500 hover:shadow-md transition-all">
 <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
 <FileText className="w-5 h-5 text-purple-600" />
 </div>
 <div className="text-left">
 <p className="font-medium text-gray-900">Templates</p>
 <p className="text-sm text-gray-500">Browse templates</p>
 </div>
 </button>
 <button className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-stone-500 hover:shadow-md transition-all">
 <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
 <Settings className="w-5 h-5 text-gray-600" />
 </div>
 <div className="text-left">
 <p className="font-medium text-gray-900">Settings</p>
 <p className="text-sm text-gray-500">Configure eCTD</p>
 </div>
 </button>
 </div>

 {/* Module Navigator */}
 <div className="bg-white rounded-xl border border-gray-200 p-6">
 <h2 className="text-lg font-semibold text-gray-900 mb-4">eCTD Module Structure</h2>
 <div className="space-y-3">
 {eCTDModules.map((module) => (
 <div
 key={module.id}
 className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
 >
 <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
 <Folder className="w-5 h-5 text-stone-600" />
 </div>
 <div className="flex-1">
 <p className="font-medium text-gray-900">{module.name}: {module.title}</p>
 <p className="text-sm text-gray-500">{module.region} Technical Document</p>
 </div>
 <span className="px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-full">
 {module.region}
 </span>
 </div>
 ))}
 </div>
 </div>

 {/* Info Banner */}
 <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
 <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
 <div>
 <p className="text-amber-800 font-medium">eCTD System Enhancement In Progress</p>
 <p className="text-amber-700 text-sm mt-1">
 We're upgrading the eCTD builder with V3 UI components. Enhanced features coming soon.
 </p>
 </div>
 </div>
 </div>
 </div>
 );
}
