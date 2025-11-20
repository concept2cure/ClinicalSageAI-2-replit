import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Target, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Settings,
  Plus,
  Edit,
  Eye,
  ArrowRight,
  Activity
} from 'lucide-react';

const PROCESS_PARAMETERS = [
  {
    id: 'cpp-001',
    name: 'Mixing Time',
    category: 'Blending',
    type: 'Critical',
    range: '15-25 min',
    target: '20 min',
    current: '19.5 min',
    status: 'in-control',
    linkedCQA: ['Content Uniformity', 'Blend Uniformity']
  },
  {
    id: 'cpp-002', 
    name: 'Compression Force',
    category: 'Tableting',
    type: 'Critical',
    range: '8-12 kN',
    target: '10 kN',
    current: '10.2 kN',
    status: 'in-control',
    linkedCQA: ['Tablet Hardness', 'Friability']
  },
  {
    id: 'cpp-003',
    name: 'Coating Temperature',
    category: 'Coating',
    type: 'Critical',
    range: '45-55°C',
    target: '50°C',
    current: '52°C',
    status: 'monitor',
    linkedCQA: ['Appearance', 'Coating Thickness']
  },
  {
    id: 'cpp-004',
    name: 'Drying Time',
    category: 'Granulation', 
    type: 'Key',
    range: '5-15 min',
    target: '10 min',
    current: '8.5 min',
    status: 'in-control',
    linkedCQA: ['Moisture Content', 'Granule Size']
  }
];

const QUALITY_ATTRIBUTES = [
  {
    id: 'cqa-001',
    name: 'Assay',
    category: 'Identity',
    specification: '95.0-105.0%',
    target: '100%',
    current: '99.2%',
    status: 'compliant',
    linkedCPP: ['Mixing Time', 'Compression Force']
  },
  {
    id: 'cqa-002',
    name: 'Content Uniformity',
    category: 'Content',
    specification: 'AV ≤ 15.0',
    target: 'AV ≤ 10.0',
    current: 'AV = 8.2',
    status: 'compliant',
    linkedCPP: ['Mixing Time', 'Drying Time']
  },
  {
    id: 'cqa-003',
    name: 'Dissolution Q45min',
    category: 'Performance',
    specification: '≥ 80%',
    target: '≥ 85%',
    current: '87%',
    status: 'compliant',
    linkedCPP: ['Compression Force', 'Coating Temperature']
  },
  {
    id: 'cqa-004',
    name: 'Tablet Hardness',
    category: 'Physical',
    specification: '80-120 N',
    target: '100 N',
    current: '95 N',
    status: 'compliant',
    linkedCPP: ['Compression Force']
  }
];

const STATUS_CONFIG = {
  'in-control': { color: 'text-green-600', badge: 'bg-green-100 text-green-800' },
  'monitor': { color: 'text-orange-600', badge: 'bg-orange-100 text-orange-800' },
  'out-of-control': { color: 'text-red-600', badge: 'bg-red-100 text-red-800' },
  'compliant': { color: 'text-green-600', badge: 'bg-green-100 text-green-800' },
  'non-compliant': { color: 'text-red-600', badge: 'bg-red-100 text-red-800' }
};

function ParameterCard({ parameter }) {
  const statusConfig = STATUS_CONFIG[parameter.status] || STATUS_CONFIG['monitor'];
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className={`w-5 h-5 ${statusConfig.color}`} />
            <div>
              <CardTitle className="text-sm font-medium">{parameter.name}</CardTitle>
              <div className="text-xs text-gray-500">{parameter.category}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={parameter.type === 'Critical' ? 'destructive' : 'secondary'}>
              {parameter.type}
            </Badge>
            <Badge className={statusConfig.badge}>
              {parameter.status.replace('-', ' ')}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-600">Current</div>
            <div className="font-semibold">{parameter.current}</div>
          </div>
          <div>
            <div className="text-gray-600">Target</div>
            <div className="font-semibold">{parameter.target}</div>
          </div>
        </div>
        
        <div>
          <div className="text-xs text-gray-600 mb-1">Acceptable Range</div>
          <div className="text-sm font-mono bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
            {parameter.range}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-gray-600 mb-2">Linked CQAs</div>
          <div className="flex flex-wrap gap-1">
            {parameter.linkedCQA.map(cqa => (
              <Badge key={cqa} variant="outline" className="text-xs">
                {cqa}
              </Badge>
            ))}
          </div>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" data-testid={`btn-view-cpp-${parameter.id}`}>
            <Eye className="w-3 h-3 mr-1" />
            View
          </Button>
          <Button variant="outline" size="sm" data-testid={`btn-edit-cpp-${parameter.id}`}>
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QualityAttributeCard({ attribute }) {
  const statusConfig = STATUS_CONFIG[attribute.status] || STATUS_CONFIG['monitor'];
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-5 h-5 ${statusConfig.color}`} />
            <div>
              <CardTitle className="text-sm font-medium">{attribute.name}</CardTitle>
              <div className="text-xs text-gray-500">{attribute.category}</div>
            </div>
          </div>
          <Badge className={statusConfig.badge}>
            {attribute.status.replace('-', ' ')}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-600">Current</div>
            <div className="font-semibold">{attribute.current}</div>
          </div>
          <div>
            <div className="text-gray-600">Target</div>
            <div className="font-semibold">{attribute.target}</div>
          </div>
        </div>
        
        <div>
          <div className="text-xs text-gray-600 mb-1">Specification</div>
          <div className="text-sm font-mono bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
            {attribute.specification}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-gray-600 mb-2">Controlled by CPPs</div>
          <div className="flex flex-wrap gap-1">
            {attribute.linkedCPP.map(cpp => (
              <Badge key={cpp} variant="outline" className="text-xs">
                {cpp}
              </Badge>
            ))}
          </div>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" data-testid={`btn-view-cqa-${attribute.id}`}>
            <Eye className="w-3 h-3 mr-1" />
            View
          </Button>
          <Button variant="outline" size="sm" data-testid={`btn-edit-cqa-${attribute.id}`}>
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InteractionMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          CPP ↔ CQA Interaction Matrix
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium">Process Parameters</th>
                {QUALITY_ATTRIBUTES.map(cqa => (
                  <th key={cqa.id} className="text-center p-3 font-medium text-sm">
                    {cqa.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROCESS_PARAMETERS.map(cpp => (
                <tr key={cpp.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={cpp.type === 'Critical' ? 'destructive' : 'secondary'} className="text-xs">
                        {cpp.type}
                      </Badge>
                      <span className="font-medium text-sm">{cpp.name}</span>
                    </div>
                  </td>
                  {QUALITY_ATTRIBUTES.map(cqa => {
                    const isLinked = cpp.linkedCQA.includes(cqa.name) || cqa.linkedCPP.includes(cpp.name);
                    return (
                      <td key={`${cpp.id}-${cqa.id}`} className="text-center p-3">
                        {isLinked ? (
                          <div className="inline-flex items-center justify-center w-8 h-8 bg-green-100 text-green-600 rounded-full">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-400 rounded-full">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span>Direct Impact</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 rounded-full flex items-center justify-center">—</div>
            <span>No Impact</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ParameterMatrix() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            CPP ↔ CQA Matrix & Control Strategy
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Critical process parameters and quality attributes mapping and control
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="btn-control-strategy">
            <Target className="w-4 h-4 mr-2" />
            Control Strategy
          </Button>
          <Button variant="outline" size="sm" data-testid="btn-add-parameter">
            <Plus className="w-4 h-4 mr-2" />
            Add Parameter
          </Button>
        </div>
      </div>

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matrix" data-testid="tab-matrix">
            <Activity className="w-4 h-4 mr-2" />
            Interaction Matrix
          </TabsTrigger>
          <TabsTrigger value="cpp" data-testid="tab-cpp">
            <Target className="w-4 h-4 mr-2" />
            Process Parameters
          </TabsTrigger>
          <TabsTrigger value="cqa" data-testid="tab-cqa">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Quality Attributes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-4">
          <InteractionMatrix />
        </TabsContent>

        <TabsContent value="cpp" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {PROCESS_PARAMETERS.map(parameter => (
              <ParameterCard key={parameter.id} parameter={parameter} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cqa" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {QUALITY_ATTRIBUTES.map(attribute => (
              <QualityAttributeCard key={attribute.id} attribute={attribute} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}