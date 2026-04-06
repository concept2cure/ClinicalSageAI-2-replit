import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
 Globe, 
 Activity, 
 TrendingUp, 
 AlertTriangle, 
 Settings,
 Play,
 Pause,
 RotateCcw,
 Maximize,
 Eye,
 Download,
 RefreshCw
} from 'lucide-react';

const PROCESS_STEPS = [
 {
 id: 'step-001',
 name: 'Raw Material Dispensing',
 status: 'active',
 duration: '15 min',
 progress: 75,
 temperature: '22°C',
 parameters: { accuracy: '99.8%', rate: '45 kg/min' }
 },
 {
 id: 'step-002', 
 name: 'Dry Blending',
 status: 'active',
 duration: '20 min',
 progress: 60,
 temperature: '24°C',
 parameters: { speed: '15 RPM', uniformity: '97.2%' }
 },
 {
 id: 'step-003',
 name: 'Wet Granulation',
 status: 'pending',
 duration: '25 min',
 progress: 0,
 temperature: '—',
 parameters: { moisture: '—', particle_size: '—' }
 },
 {
 id: 'step-004',
 name: 'Drying',
 status: 'pending',
 duration: '45 min',
 progress: 0,
 temperature: '—',
 parameters: { inlet_temp: '—', moisture_content: '—' }
 },
 {
 id: 'step-005',
 name: 'Final Blending',
 status: 'pending',
 duration: '10 min',
 progress: 0,
 temperature: '—',
 parameters: { blend_time: '—', uniformity: '—' }
 },
 {
 id: 'step-006',
 name: 'Tablet Compression',
 status: 'pending',
 duration: '60 min',
 progress: 0,
 temperature: '—',
 parameters: { force: '—', hardness: '—' }
 }
];

const REAL_TIME_DATA = [
 { parameter: 'Batch Temperature', value: '24.2°C', status: 'normal', trend: 'stable' },
 { parameter: 'Humidity', value: '45%', status: 'normal', trend: 'down' },
 { parameter: 'Pressure', value: '1.02 bar', status: 'normal', trend: 'stable' },
 { parameter: 'Mix Speed', value: '15.3 RPM', status: 'normal', trend: 'up' },
 { parameter: 'Material Flow Rate', value: '44.8 kg/min', status: 'normal', trend: 'stable' },
 { parameter: 'Power Consumption', value: '12.5 kW', status: 'warning', trend: 'up' }
];

const STATUS_CONFIG = {
 'active': { color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-300' },
 'pending': { color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-300' },
 'warning': { color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-300' },
 'error': { color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-300' }
};

function ProcessFlowVisualization() {
 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between mb-4">
 <h4 className="font-medium">Process Flow Visualization</h4>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" data-testid="btn-simulation-play">
 <Play className="w-4 h-4 mr-1" />
 Run Simulation
 </Button>
 <Button variant="outline" size="sm" data-testid="btn-simulation-reset">
 <RotateCcw className="w-4 h-4 mr-1" />
 Reset
 </Button>
 </div>
 </div>
 
 <div className="grid gap-4 lg:grid-cols-2">
 {PROCESS_STEPS.map((step, index) => {
 const statusConfig = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
 const isActive = step.status === 'active';
 
 return (
 <Card key={step.id} className={`${statusConfig.bg} ${statusConfig.border} border-l-4`}>
 <CardHeader className="pb-2">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className={`w-8 h-8 rounded-full ${statusConfig.bg} ${statusConfig.color} flex items-center justify-center font-bold border-2 ${statusConfig.border}`}>
 {index + 1}
 </div>
 <div>
 <CardTitle className="text-sm">{step.name}</CardTitle>
 <div className="text-xs text-gray-500">Duration: {step.duration}</div>
 </div>
 </div>
 <Badge className={`${statusConfig.color.replace('text-', 'text-')} ${statusConfig.bg}`}>
 {step.status}
 </Badge>
 </div>
 </CardHeader>
 
 <CardContent className="space-y-3">
 {isActive && (
 <>
 <div>
 <div className="flex justify-between text-sm mb-1">
 <span>Progress</span>
 <span>{step.progress}%</span>
 </div>
 <Progress value={step.progress} className="h-2" />
 </div>
 
 <div className="grid grid-cols-2 gap-2 text-xs">
 <div>
 <div className="text-gray-600">Temperature</div>
 <div className="font-semibold">{step.temperature}</div>
 </div>
 {Object.entries(step.parameters).map(([key, value]) => (
 <div key={key}>
 <div className="text-gray-600 capitalize">{key.replace('_', ' ')}</div>
 <div className="font-semibold">{value}</div>
 </div>
 ))}
 </div>
 </>
 )}
 
 {!isActive && (
 <div className="text-xs text-gray-500 py-2">
 Awaiting previous step completion
 </div>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 );
}

function RealTimeMonitoring() {
 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h4 className="font-medium">Real-Time Process Monitoring</h4>
 <Button variant="outline" size="sm" data-testid="btn-refresh-data">
 <RefreshCw className="w-4 h-4 mr-1" />
 Refresh
 </Button>
 </div>
 
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {REAL_TIME_DATA.map(data => {
 const isWarning = data.status === 'warning';
 
 return (
 <Card key={data.parameter} className={isWarning ? 'border-orange-200 bg-orange-50' : ''}>
 <CardContent className="p-4">
 <div className="flex items-center justify-between mb-2">
 <div className="text-sm font-medium">{data.parameter}</div>
 {data.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
 {data.trend === 'down' && <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />}
 {data.trend === 'stable' && <Activity className="w-4 h-4 text-gray-500" />}
 </div>
 
 <div className="text-xl font-bold mb-1">{data.value}</div>
 
 <div className="flex items-center gap-2">
 <Badge variant={isWarning ? 'destructive' : 'secondary'} className="text-xs">
 {data.status}
 </Badge>
 <div className="text-xs text-gray-500">
 {data.trend}
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 );
}

function DigitalTwinDashboard() {
 return (
 <div className="space-y-6">
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
 <Card className="bg-stone-50 border-stone-200">
 <CardContent className="p-4 text-center">
 <div className="text-2xl font-bold text-stone-600">2</div>
 <div className="text-sm text-gray-600">Active Steps</div>
 </CardContent>
 </Card>
 
 <Card className="bg-green-50 border-green-200">
 <CardContent className="p-4 text-center">
 <div className="text-2xl font-bold text-green-600">68%</div>
 <div className="text-sm text-gray-600">Overall Progress</div>
 </CardContent>
 </Card>
 
 <Card className="bg-orange-50 border-orange-200">
 <CardContent className="p-4 text-center">
 <div className="text-2xl font-bold text-orange-600">1</div>
 <div className="text-sm text-gray-600">Warnings</div>
 </CardContent>
 </Card>
 
 <Card className="bg-purple-50 border-purple-200">
 <CardContent className="p-4 text-center">
 <div className="text-2xl font-bold text-purple-600">4.2h</div>
 <div className="text-sm text-gray-600">Est. Remaining</div>
 </CardContent>
 </Card>
 </div>
 
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Globe className="w-5 h-5 text-stone-600" />
 Digital Twin Status
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
 <div className="flex items-center gap-3">
 <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
 <div>
 <div className="font-medium text-green-800">Digital Twin Active</div>
 <div className="text-sm text-green-600">Real-time synchronization enabled</div>
 </div>
 </div>
 <div className="text-sm text-green-600">
 Last sync: {new Date().toLocaleTimeString()}
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

export default function DigitalTwinCanvas() {
 const [activeView, setActiveView] = useState('flow');
 
 return (
 <div className="space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
 Process Digital Twin
 </h3>
 <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
 Real-time digital representation of manufacturing processes
 </p>
 </div>
 
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm" data-testid="btn-export-twin">
 <Download className="w-4 h-4 mr-2" />
 Export Model
 </Button>
 <Button variant="outline" size="sm" data-testid="btn-fullscreen-twin">
 <Maximize className="w-4 h-4 mr-2" />
 Fullscreen
 </Button>
 </div>
 </div>

 <Tabs value={activeView} onValueChange={setActiveView} className="space-y-4">
 <TabsList>
 <TabsTrigger value="flow" data-testid="tab-process-flow">
 <Activity className="w-4 h-4 mr-2" />
 Process Flow
 </TabsTrigger>
 <TabsTrigger value="monitoring" data-testid="tab-monitoring">
 <TrendingUp className="w-4 h-4 mr-2" />
 Real-Time Data
 </TabsTrigger>
 <TabsTrigger value="dashboard" data-testid="tab-dashboard">
 <Globe className="w-4 h-4 mr-2" />
 Twin Dashboard
 </TabsTrigger>
 </TabsList>

 <TabsContent value="flow" className="space-y-4">
 <ProcessFlowVisualization />
 </TabsContent>

 <TabsContent value="monitoring" className="space-y-4">
 <RealTimeMonitoring />
 </TabsContent>

 <TabsContent value="dashboard" className="space-y-4">
 <DigitalTwinDashboard />
 </TabsContent>
 </Tabs>
 </div>
 );
}