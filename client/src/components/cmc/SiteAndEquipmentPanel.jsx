import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  Factory, MapPin, CheckCircle2, AlertTriangle, Clock, Settings, Users, Calendar, FileCheck, Plus, Eye, Shield, AlertCircle, Timer, Filter, Search, Download, RefreshCw, Bell, Loader2, TrendingUp, Wrench, Zap } from 'lucide-react'

const MANUFACTURING_SITES = [
  {
    id: 'site-001',
    name: 'Main Manufacturing Facility',
    location: 'Rahway, NJ, USA',
    status: 'qualified',
    capacity: '95%',
    lines: 3,
    qualification: { iq: 100, oq: 100, pq: 85 },
    lastInspection: '2024-08-15',
    certifications: ['FDA', 'EMA', 'Health Canada']
  },
  {
    id: 'site-002', 
    name: 'Secondary Production Site',
    location: 'Cork, Ireland',
    status: 'in-qualification',
    capacity: '60%',
    lines: 2,
    qualification: { iq: 100, oq: 95, pq: 30 },
    lastInspection: '2024-09-01',
    certifications: ['EMA', 'MHRA']
  },
  {
    id: 'site-003',
    name: 'Contract Manufacturing',
    location: 'Singapore',
    status: 'planned',
    capacity: '0%',
    lines: 1,
    qualification: { iq: 0, oq: 0, pq: 0 },
    lastInspection: null,
    certifications: ['HSA']
  }
];

const EQUIPMENT_DATA = [
  {
    id: 'eq-001',
    name: 'Tablet Press #1',
    type: 'Production Equipment',
    site: 'site-001',
    status: 'qualified',
    qualification: { iq: 100, oq: 100, pq: 100 },
    nextMaintenance: '2025-01-15',
    utilization: 82
  },
  {
    id: 'eq-002',
    name: 'Coating Pan A',
    type: 'Secondary Processing',
    site: 'site-001', 
    status: 'qualified',
    qualification: { iq: 100, oq: 100, pq: 95 },
    nextMaintenance: '2024-12-10',
    utilization: 65
  },
  {
    id: 'eq-003',
    name: 'Blender Unit B2',
    type: 'Preparation Equipment',
    site: 'site-002',
    status: 'in-qualification',
    qualification: { iq: 100, oq: 90, pq: 0 },
    nextMaintenance: '2024-11-20',
    utilization: 45
  }
];

const STATUS_CONFIG = {
  'qualified': { color: 'text-green-600', bg: 'bg-green-100', badge: 'bg-green-100 text-green-800' },
  'in-qualification': { color: 'text-orange-600', bg: 'bg-orange-100', badge: 'bg-orange-100 text-orange-800' },
  'planned': { color: 'text-gray-600', bg: 'bg-gray-100', badge: 'bg-gray-100 text-gray-800' },
  'maintenance': { color: 'text-blue-600', bg: 'bg-blue-100', badge: 'bg-blue-100 text-blue-800' }
};

function SiteCard({ site }) {
  const statusConfig = STATUS_CONFIG[site.status] || STATUS_CONFIG.planned;
  const avgQualification = Math.round((site.qualification.iq + site.qualification.oq + site.qualification.pq) / 3);
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Factory className={`w-5 h-5 ${statusConfig.color}`} />
            <div>
              <CardTitle className="text-base">{site.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">{site.location}</span>
              </div>
            </div>
          </div>
          <Badge className={statusConfig.badge}>{site.status.replace('-', ' ')}</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600">Capacity</div>
            <div className="text-xl font-semibold">{site.capacity}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Production Lines</div>
            <div className="text-xl font-semibold">{site.lines}</div>
          </div>
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Qualification Progress</span>
            <span className="text-sm text-gray-600">{avgQualification}%</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>IQ: {site.qualification.iq}%</span>
              <span>OQ: {site.qualification.oq}%</span>
              <span>PQ: {site.qualification.pq}%</span>
            </div>
            <Progress value={avgQualification} className="h-2" />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-1">
          {site.certifications.map(cert => (
            <Badge key={cert} variant="outline" className="text-xs">
              {cert}
            </Badge>
          ))}
        </div>
        
        {site.lastInspection && (
          <div className="text-xs text-gray-500">
            Last inspection: {new Date(site.lastInspection).toLocaleDateString()}
          </div>
        )}
        
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" data-testid={`btn-view-site-${site.id}`}>
            <Eye className="w-4 h-4 mr-1" />
            View Details
          </Button>
          <Button variant="outline" size="sm" data-testid={`btn-edit-site-${site.id}`}>
            <Settings className="w-4 h-4 mr-1" />
            Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EquipmentTable({ equipment, selectedSite }) {
  const filteredEquipment = selectedSite === 'all' ? equipment : equipment.filter(eq => eq.site === selectedSite);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Equipment Qualification Status</h4>
        <Button variant="outline" size="sm" data-testid="btn-add-equipment">
          <Plus className="w-4 h-4 mr-1" />
          Add Equipment
        </Button>
      </div>
      
      <div className="border rounded-lg">
        <div className="grid grid-cols-6 gap-4 p-3 bg-gray-50 dark:bg-gray-800 text-sm font-medium border-b">
          <div>Equipment</div>
          <div>Type</div>
          <div>Status</div>
          <div>IQ/OQ/PQ</div>
          <div>Utilization</div>
          <div>Actions</div>
        </div>
        
        {filteredEquipment.map(equipment => {
          const statusConfig = STATUS_CONFIG[equipment.status] || STATUS_CONFIG.planned;
          const avgQual = Math.round((equipment.qualification.iq + equipment.qualification.oq + equipment.qualification.pq) / 3);
          
          return (
            <div key={equipment.id} className="grid grid-cols-6 gap-4 p-3 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800">
              <div>
                <div className="font-medium">{equipment.name}</div>
                <div className="text-xs text-gray-500">ID: {equipment.id}</div>
              </div>
              <div className="text-sm text-gray-600">{equipment.type}</div>
              <div>
                <Badge className={statusConfig.badge}>{equipment.status.replace('-', ' ')}</Badge>
              </div>
              <div>
                <div className="text-sm">{equipment.qualification.iq}/{equipment.qualification.oq}/{equipment.qualification.pq}%</div>
                <Progress value={avgQual} className="h-1 mt-1" />
              </div>
              <div className="text-sm">{equipment.utilization}%</div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" data-testid={`btn-view-equipment-${equipment.id}`}>
                  <Eye className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" data-testid={`btn-edit-equipment-${equipment.id}`}>
                  <Settings className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SiteAndEquipmentPanel() {
  const [selectedSite, setSelectedSite] = useState('all');
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Manufacturing Sites & Equipment
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Production facilities, equipment qualification, and capacity management
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="btn-site-qualification">
            <FileCheck className="w-4 h-4 mr-2" />
            Qualification Report
          </Button>
          <Button variant="outline" size="sm" data-testid="btn-add-site">
            <Plus className="w-4 h-4 mr-2" />
            Add Site
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sites" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sites" data-testid="tab-sites">
            <Factory className="w-4 h-4 mr-2" />
            Manufacturing Sites
          </TabsTrigger>
          <TabsTrigger value="equipment" data-testid="tab-equipment">
            <Settings className="w-4 h-4 mr-2" />
            Equipment
          </TabsTrigger>
          <TabsTrigger value="qualifications" data-testid="tab-qualifications">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Qualifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MANUFACTURING_SITES.map(site => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="equipment" className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm font-medium">Filter by site:</label>
            <select 
              value={selectedSite} 
              onChange={(e) => setSelectedSite(e.target.value)}
              className="px-3 py-1 border rounded-md text-sm"
              data-testid="select-site-filter"
            >
              <option value="all">All Sites</option>
              {MANUFACTURING_SITES.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </div>
          
          <EquipmentTable equipment={EQUIPMENT_DATA} selectedSite={selectedSite} />
        </TabsContent>

        <TabsContent value="qualifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Qualification Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">3</div>
                  <div className="text-sm text-gray-600">Sites Qualified</div>
                </div>
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">6</div>
                  <div className="text-sm text-gray-600">Equipment Units</div>
                </div>
                <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">2</div>
                  <div className="text-sm text-gray-600">In Progress</div>
                </div>
              </div>
              
              <div className="mt-6 text-center">
                <Button data-testid="btn-qualification-details">
                  <FileCheck className="w-4 h-4 mr-2" />
                  View Detailed Qualification Status
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}