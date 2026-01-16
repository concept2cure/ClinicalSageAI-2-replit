import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Database, BarChart2, PieChart as PieChartIcon, LineChart as LineChartIcon, Link, Download, Plus } from 'lucide-react'

// Mock Data Sources
const DATA_SOURCES = [
  { id: 'ds1', name: 'Study 101 - Adverse Events', type: 'safety', lastUpdated: '2024-05-15' },
  { id: 'ds2', name: 'Study 101 - Demographics', type: 'demographics', lastUpdated: '2024-05-10' },
  { id: 'ds3', name: 'Study 102 - Efficacy (Primary Endpoint)', type: 'efficacy', lastUpdated: '2024-06-01' },
  { id: 'ds4', name: 'Integrated Safety Summary (ISS)', type: 'safety', lastUpdated: '2024-06-10' },
];

// Mock Chart Data
const AE_DATA = [
  { name: 'Headache', mild: 45, moderate: 20, severe: 5 },
  { name: 'Nausea', mild: 30, moderate: 15, severe: 2 },
  { name: 'Dizziness', mild: 25, moderate: 10, severe: 1 },
  { name: 'Fatigue', mild: 40, moderate: 25, severe: 3 },
  { name: 'Rash', mild: 15, moderate: 5, severe: 0 },
];

const DEMO_DATA = [
  { name: '18-30', male: 20, female: 25 },
  { name: '31-45', male: 35, female: 30 },
  { name: '46-60', male: 40, female: 45 },
  { name: '60+', male: 15, female: 20 },
];

const EFFICACY_DATA = [
  { month: 'Baseline', placebo: 100, drug: 100 },
  { month: 'Month 1', placebo: 98, drug: 95 },
  { month: 'Month 3', placebo: 95, drug: 85 },
  { month: 'Month 6', placebo: 92, drug: 70 }, // Lower is better (e.g., symptom score)
  { month: 'Month 12', placebo: 90, drug: 60 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function IntegratedDataVisualization() {
  const [selectedSource, setSelectedSource] = useState(DATA_SOURCES[0].id);
  const [chartType, setChartType] = useState('bar');

  const handleEmbed = () => {
    // In a real app, this would insert a placeholder or image into the editor
    alert("Chart embedded into document with live data link!");
  };

  const renderChart = () => {
    if (selectedSource === 'ds1' || selectedSource === 'ds4') {
      // Safety Data (AEs)
      if (chartType === 'bar') {
        return (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={AE_DATA}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="mild" stackId="a" fill="#82ca9d" name="Mild" />
              <Bar dataKey="moderate" stackId="a" fill="#8884d8" name="Moderate" />
              <Bar dataKey="severe" stackId="a" fill="#ff8042" name="Severe" />
            </BarChart>
          </ResponsiveContainer>
        );
      } else if (chartType === 'pie') {
        // Simplified for Pie (just total events)
        const pieData = AE_DATA.map(item => ({
          name: item.name,
          value: item.mild + item.moderate + item.severe
        }));
        return (
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      }
    } else if (selectedSource === 'ds2') {
      // Demographics
      return (
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={DEMO_DATA}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="male" fill="#8884d8" name="Male" />
            <Bar dataKey="female" fill="#82ca9d" name="Female" />
          </BarChart>
        </ResponsiveContainer>
      );
    } else if (selectedSource === 'ds3') {
      // Efficacy (Line Chart)
      return (
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={EFFICACY_DATA}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="placebo" stroke="#8884d8" name="Placebo" />
            <Line type="monotone" dataKey="drug" stroke="#82ca9d" name="Drug (Active)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      );
    }
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Select a valid visualization type</div>;
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      {/* Sidebar: Data Sources */}
      <div className="col-span-3 border-r pr-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" /> Data Sources
          </h3>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100%-40px)]">
          <div className="space-y-2">
            {DATA_SOURCES.map((source) => (
              <div
                key={source.id}
                onClick={() => setSelectedSource(source.id)}
                className={`p-3 rounded-md cursor-pointer transition-colors border ${
                  selectedSource === source.id
                    ? 'bg-primary/10 border-primary'
                    : 'hover:bg-muted border-transparent'
                }`}
              >
                <div className="font-medium text-sm">{source.name}</div>
                <div className="flex items-center justify-between mt-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {source.type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{source.lastUpdated}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content: Visualization Studio */}
      <div className="col-span-9 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Data Studio</h2>
            <p className="text-muted-foreground">Create and embed interactive visualizations linked to source data.</p>
          </div>
          <div className="flex gap-2">
             <Select value={chartType} onValueChange={setChartType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Chart Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar"><div className="flex items-center gap-2"><BarChart2 className="h-4 w-4"/> Bar Chart</div></SelectItem>
                <SelectItem value="line"><div className="flex items-center gap-2"><LineChartIcon className="h-4 w-4"/> Line Chart</div></SelectItem>
                <SelectItem value="pie"><div className="flex items-center gap-2"><PieChartIcon className="h-4 w-4"/> Pie Chart</div></SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleEmbed} className="gap-2">
              <Link className="h-4 w-4" /> Embed in Document
            </Button>
          </div>
        </div>

        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {DATA_SOURCES.find(s => s.id === selectedSource)?.name}
              </CardTitle>
              <Badge variant="secondary" className="gap-1">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Live Link Active
              </Badge>
            </div>
            <CardDescription>
              Visualizing {chartType} chart for {DATA_SOURCES.find(s => s.id === selectedSource)?.type} data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px] flex flex-col justify-center">
            {renderChart()}
          </CardContent>
        </Card>

        <div className="mt-6 grid grid-cols-3 gap-4">
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Source Integrity</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-green-600">Verified</div><p className="text-xs text-muted-foreground">Hash: 8a7f...9c2d</p></CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Data Points</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">1,240</div><p className="text-xs text-muted-foreground">Rows processed</p></CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Last Sync</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">Just now</div><p className="text-xs text-muted-foreground">Auto-sync enabled</p></CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
