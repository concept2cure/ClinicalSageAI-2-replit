import React from 'react';
import { Trophy, ShieldCheck, FileCheck, CheckCircle, FileBarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * ExecutiveDashboard Component
 *
 * This component displays executive-level metrics and KPIs in a
 * visually appealing dashboard format for the CER module.
 */
const ExecutiveDashboard = () => {
  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center text-blue-700">
              <FileCheck className="h-5 w-5 mr-2 text-blue-600" />
              Compliance Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <div className="relative h-24 w-24">
                <svg className="h-full w-full" viewBox="0 0 100 100">
                  <circle
                    className="text-gray-200"
                    strokeWidth="10"
                    stroke="currentColor"
                    fill="transparent"
                    r="40"
                    cx="50"
                    cy="50"
                  />
                  <circle
                    className="text-blue-600"
                    strokeWidth="10"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - 85 / 100)}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="40"
                    cx="50"
                    cy="50"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold text-blue-700">85%</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center mt-2">
              <span className="text-green-600 text-sm font-medium flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                +3% from last quarter
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-white border-green-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center text-green-700">
              <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
              Safety Indicators
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center h-[100px]">
              <div className="text-3xl font-bold text-green-700">92%</div>
              <div className="text-sm text-gray-500 mb-2">Safety Requirements Met</div>
              <div className="w-full bg-gray-200 h-2 rounded-full">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '92%' }}></div>
              </div>
            </div>
            <div className="flex justify-center mt-2">
              <span className="text-green-600 text-sm font-medium flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                Exceeds regulatory threshold
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center text-purple-700">
              <FileBarChart2 className="h-5 w-5 mr-2 text-purple-600" />
              Clinical Evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center h-[100px]">
              <div className="text-3xl font-bold text-purple-700">78%</div>
              <div className="text-sm text-gray-500 mb-2">Literature Coverage</div>
              <div className="w-full bg-gray-200 h-2 rounded-full">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: '78%' }}></div>
              </div>
            </div>
            <div className="flex justify-center mt-2">
              <span className="text-amber-600 text-sm font-medium flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-1"></span>
                Needs 2 more literature sources
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Regulatory Compliance Summary */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-lg flex items-center">
            <ShieldCheck className="h-5 w-5 mr-2 text-blue-600" />
            Regulatory Framework Compliance
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">EU MDR</span>
                <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded-full text-xs">
                  Compliant
                </span>
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '92%' }}></div>
              </div>
              <div className="text-xs text-gray-500">54 of 58 requirements met</div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">FDA CFR 21</span>
                <span className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full text-xs">
                  In Progress
                </span>
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full">
                <div className="bg-amber-500 h-2 rounded-full" style={{ width: '78%' }}></div>
              </div>
              <div className="text-xs text-gray-500">42 of 54 requirements met</div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">ISO 14155</span>
                <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded-full text-xs">
                  Compliant
                </span>
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '89%' }}></div>
              </div>
              <div className="text-xs text-gray-500">32 of 36 requirements met</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Critical to Quality Factors */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-lg flex items-center">
            <Trophy className="h-5 w-5 mr-2 text-amber-500" />
            Critical-to-Quality Factors
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">Risk Level Coverage</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">High Risk (8)</span>
                    <span className="text-sm font-medium">100%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">Medium Risk (8)</span>
                    <span className="text-sm font-medium">75%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full">
                    <div className="bg-amber-500 h-2 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">Low Risk (6)</span>
                    <span className="text-sm font-medium">67%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '67%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-2">Top Action Items</h3>
              <div className="space-y-2">
                <div className="border rounded p-2 bg-amber-50 border-amber-100">
                  <div className="flex justify-between">
                    <span className="font-medium text-sm">Complete Clinical Data Analysis</span>
                    <span className="text-amber-600 text-xs bg-amber-100 px-1.5 py-0.5 rounded">
                      Medium
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    2 sections remaining - Performance data needed
                  </p>
                </div>
                <div className="border rounded p-2 bg-red-50 border-red-100">
                  <div className="flex justify-between">
                    <span className="font-medium text-sm">Document Risk Mitigation</span>
                    <span className="text-red-600 text-xs bg-red-100 px-1.5 py-0.5 rounded">
                      High
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">FDA compliance - Due in 5 days</p>
                </div>
                <div className="border rounded p-2 bg-blue-50 border-blue-100">
                  <div className="flex justify-between">
                    <span className="font-medium text-sm">Update Literature Review</span>
                    <span className="text-blue-600 text-xs bg-blue-100 px-1.5 py-0.5 rounded">
                      Low
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Add 2 recent publications - ISO requirement
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExecutiveDashboard;
