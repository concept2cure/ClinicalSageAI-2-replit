import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Package, Truck, Factory, AlertTriangle, CheckCircle2, Clock, TrendingUp, BarChart3, Users, MapPin, Award, Eye, Edit, Plus, Search, Filter, Download, Upload, RefreshCcw, Globe, Shield } from 'lucide-react'

const CMCSupplyChain = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  // Supply Chain Data
  const suppliers = [
    {
      id: 'SUP-001',
      name: 'BioChem Solutions Ltd.',
      category: 'API Manufacturer',
      location: 'Basel, Switzerland',
      status: 'Qualified',
      qualificationDate: '2024-03-15',
      riskLevel: 'Low',
      qualityScore: 94.5,
      deliveryPerformance: 98.2,
      certifications: ['ISO 9001', 'ICH Q7', 'FDA Registered'],
      products: ['Adalimumab API', 'Bevacizumab API'],
      lastAudit: '2024-07-20',
      nextAudit: '2025-07-20',
      contact: 'Dr. Maria Weber',
      alternativeSuppliers: 2,
    },
    {
      id: 'SUP-002',
      name: 'Global Excipients Corp',
      category: 'Excipient Supplier',
      location: 'New Jersey, USA',
      status: 'Qualified',
      qualificationDate: '2023-11-22',
      riskLevel: 'Low',
      qualityScore: 91.8,
      deliveryPerformance: 96.7,
      certifications: ['ISO 9001', 'USP-NF', 'Ph.Eur'],
      products: ['Lactose Monohydrate', 'Magnesium Stearate', 'HPMC'],
      lastAudit: '2024-05-10',
      nextAudit: '2025-05-10',
      contact: 'John Martinez',
      alternativeSuppliers: 3,
    },
    {
      id: 'SUP-003',
      name: 'AseptiPack Manufacturing',
      category: 'Primary Packaging',
      location: 'Dublin, Ireland',
      status: 'Qualified',
      qualificationDate: '2024-01-08',
      riskLevel: 'Medium',
      qualityScore: 89.3,
      deliveryPerformance: 94.1,
      certifications: ['ISO 15378', 'Good Storage Practice'],
      products: ['Vials', 'Stoppers', 'Caps', 'Pre-filled Syringes'],
      lastAudit: '2024-06-15',
      nextAudit: '2025-06-15',
      contact: "Sarah O'Connor",
      alternativeSuppliers: 1,
    },
    {
      id: 'SUP-004',
      name: 'TechAnalytica Services',
      category: 'Testing Laboratory',
      location: 'Cambridge, UK',
      status: 'Qualified',
      qualificationDate: '2024-02-12',
      riskLevel: 'Low',
      qualityScore: 96.2,
      deliveryPerformance: 99.1,
      certifications: ['ISO 17025', 'UKAS Accredited'],
      products: ['Analytical Testing', 'Method Development', 'Stability Studies'],
      lastAudit: '2024-08-05',
      nextAudit: '2025-08-05',
      contact: 'Dr. James Thompson',
      alternativeSuppliers: 4,
    },
  ];

  const inventoryData = [
    {
      id: 'INV-001',
      material: 'Adalimumab API',
      supplier: 'BioChem Solutions Ltd.',
      currentStock: 45.2,
      unit: 'kg',
      reorderPoint: 20.0,
      maxStock: 100.0,
      status: 'Normal',
      lastReceived: '2025-08-10',
      expiryDate: '2026-02-10',
      batchNumber: 'ADA-240810-01',
      location: 'Cold Storage A-1',
    },
    {
      id: 'INV-002',
      material: 'Lactose Monohydrate',
      supplier: 'Global Excipients Corp',
      currentStock: 156.8,
      unit: 'kg',
      reorderPoint: 200.0,
      maxStock: 500.0,
      status: 'Low Stock',
      lastReceived: '2025-07-25',
      expiryDate: '2027-07-25',
      batchNumber: 'LAC-240725-03',
      location: 'Warehouse B-2',
    },
    {
      id: 'INV-003',
      material: 'Glass Vials (10mL)',
      supplier: 'AseptiPack Manufacturing',
      currentStock: 2450,
      unit: 'units',
      reorderPoint: 5000,
      maxStock: 15000,
      status: 'Critical',
      lastReceived: '2025-08-01',
      expiryDate: 'N/A',
      batchNumber: 'VL10-240801-12',
      location: 'Packaging Store C-1',
    },
    {
      id: 'INV-004',
      material: 'HPMC K100M',
      supplier: 'Global Excipients Corp',
      currentStock: 89.5,
      unit: 'kg',
      reorderPoint: 50.0,
      maxStock: 200.0,
      status: 'Normal',
      lastReceived: '2025-08-05',
      expiryDate: '2027-08-05',
      batchNumber: 'HPMC-240805-07',
      location: 'Warehouse B-3',
    },
  ];

  const environmentalMonitoring = [
    {
      location: 'Cold Storage A-1',
      temperature: 4.2,
      humidity: 45,
      status: 'Normal',
      lastUpdate: '2 mins ago',
    },
    {
      location: 'Warehouse B-2',
      temperature: 22.1,
      humidity: 48,
      status: 'Normal',
      lastUpdate: '1 min ago',
    },
    {
      location: 'Packaging Store C-1',
      temperature: 23.5,
      humidity: 52,
      status: 'Alert',
      lastUpdate: '30 secs ago',
    },
    {
      location: 'QC Laboratory',
      temperature: 21.8,
      humidity: 47,
      status: 'Normal',
      lastUpdate: '1 min ago',
    },
  ];

  const getStatusColor = status => {
    const colors = {
      Qualified: 'bg-green-100 text-green-800',
      Pending: 'bg-yellow-100 text-yellow-800',
      'Under Review': 'bg-blue-100 text-blue-800',
      Suspended: 'bg-red-100 text-red-800',
      Normal: 'bg-green-100 text-green-800',
      'Low Stock': 'bg-yellow-100 text-yellow-800',
      Critical: 'bg-red-100 text-red-800',
      Alert: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getRiskColor = risk => {
    const colors = {
      Low: 'text-green-600',
      Medium: 'text-yellow-600',
      High: 'text-red-600',
    };
    return colors[risk] || 'text-gray-600';
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    if (filterStatus === 'all') return true;
    return supplier.status.toLowerCase() === filterStatus;
  });

  const criticalInventoryItems = inventoryData.filter(
    item => item.status === 'Critical' || item.status === 'Low Stock'
  ).length;

  return (
    <div className="space-y-6">
      {/* Supply Chain Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Supply Chain Management</h2>
          <p className="text-gray-600 mt-1">
            Comprehensive supplier management and inventory tracking
          </p>
        </div>
        <div className="flex space-x-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="under review">Under Review</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Sync Data
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
        </div>
      </div>

      {/* Supply Chain Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Suppliers</CardTitle>
            <Factory className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suppliers.length}</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              All qualified
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
            <Award className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">93.2</div>
            <p className="text-xs text-green-600">Average across all suppliers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Performance</CardTitle>
            <Truck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">97.0%</div>
            <p className="text-xs text-gray-600">On-time delivery rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{criticalInventoryItems}</div>
            <p className="text-xs text-gray-600">Items need attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Low</div>
            <p className="text-xs text-green-600">Overall supply risk</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Supplier Overview</TabsTrigger>
          <TabsTrigger value="qualification">Qualification</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="monitoring">Environmental</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            {filteredSuppliers.map(supplier => (
              <Card
                key={supplier.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedSupplier(supplier)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{supplier.name}</CardTitle>
                      <CardDescription>
                        {supplier.id} • {supplier.category} • {supplier.location}
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Badge className={getStatusColor(supplier.status)}>{supplier.status}</Badge>
                      <Badge className={`bg-gray-100 ${getRiskColor(supplier.riskLevel)}`}>
                        {supplier.riskLevel} Risk
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600 mb-1">Quality Score</div>
                      <div className="font-bold text-green-600">{supplier.qualityScore}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">Delivery Performance</div>
                      <div className="font-bold">{supplier.deliveryPerformance}%</div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">Last Audit</div>
                      <div className="font-medium">{supplier.lastAudit}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">Products</div>
                      <div className="font-medium">{supplier.products.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 mb-1">Alternatives</div>
                      <div className="font-medium">{supplier.alternativeSuppliers}</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4">
                    <div className="flex flex-wrap gap-1">
                      {supplier.certifications.slice(0, 3).map((cert, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {cert}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                      <Button variant="outline" size="sm">
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="qualification">
          <Card>
            <CardHeader>
              <CardTitle>Supplier Qualification Status</CardTitle>
              <CardDescription>Track qualification progress and audit schedules</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {suppliers.map(supplier => (
                  <div key={supplier.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium">{supplier.name}</h4>
                        <p className="text-sm text-gray-600">{supplier.category}</p>
                      </div>
                      <Badge className={getStatusColor(supplier.status)}>{supplier.status}</Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-gray-600">Qualification Date:</span>
                        <div className="font-medium">{supplier.qualificationDate}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Last Audit:</span>
                        <div className="font-medium">{supplier.lastAudit}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Next Audit Due:</span>
                        <div className="font-medium">{supplier.nextAudit}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {supplier.certifications.map((cert, index) => (
                        <Badge key={index} variant="outline">
                          {cert}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        Schedule Audit
                      </Button>
                      <Button variant="outline" size="sm">
                        View Documentation
                      </Button>
                      <Button variant="outline" size="sm">
                        Update Status
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Management</CardTitle>
                <CardDescription>
                  Real-time inventory tracking and stock level management
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Material</th>
                        <th className="text-left p-2">Supplier</th>
                        <th className="text-left p-2">Current Stock</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Location</th>
                        <th className="text-left p-2">Expiry Date</th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryData.map(item => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="p-2">
                            <div className="font-medium">{item.material}</div>
                            <div className="text-xs text-gray-600">{item.batchNumber}</div>
                          </td>
                          <td className="p-2">{item.supplier}</td>
                          <td className="p-2">
                            <div className="font-medium">
                              {item.currentStock} {item.unit}
                            </div>
                            <div className="w-20 bg-gray-200 rounded-full h-1 mt-1">
                              <div
                                className={`h-1 rounded-full ${
                                  item.status === 'Critical'
                                    ? 'bg-red-500'
                                    : item.status === 'Low Stock'
                                      ? 'bg-yellow-500'
                                      : 'bg-green-500'
                                }`}
                                style={{
                                  width: `${Math.min(100, (item.currentStock / item.maxStock) * 100)}%`,
                                }}
                              ></div>
                            </div>
                          </td>
                          <td className="p-2">
                            <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                          </td>
                          <td className="p-2">{item.location}</td>
                          <td className="p-2">{item.expiryDate}</td>
                          <td className="p-2">
                            <div className="flex space-x-1">
                              <Button variant="outline" size="sm">
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button variant="outline" size="sm">
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle>Environmental Monitoring</CardTitle>
              <CardDescription>
                Real-time temperature and humidity monitoring across storage locations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {environmentalMonitoring.map((location, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-medium">{location.location}</h4>
                      <Badge className={getStatusColor(location.status)}>{location.status}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="text-center p-3 bg-blue-50 rounded">
                        <div className="text-2xl font-bold text-blue-600">
                          {location.temperature}°C
                        </div>
                        <div className="text-sm text-gray-600">Temperature</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded">
                        <div className="text-2xl font-bold text-green-600">
                          {location.humidity}%
                        </div>
                        <div className="text-sm text-gray-600">Humidity</div>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">Last updated: {location.lastUpdate}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Supplier Quality Trends</CardTitle>
                <CardDescription>Quality score trends over the past 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {suppliers.map(supplier => (
                    <div key={supplier.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{supplier.name}</span>
                        <span className="font-medium">{supplier.qualityScore}</span>
                      </div>
                      <Progress value={supplier.qualityScore} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Supply Chain Risk Assessment</CardTitle>
                <CardDescription>Risk distribution across supplier categories</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-green-50 rounded">
                      <div className="text-lg font-bold text-green-600">
                        {suppliers.filter(s => s.riskLevel === 'Low').length}
                      </div>
                      <div className="text-sm text-gray-600">Low Risk</div>
                    </div>
                    <div className="p-3 bg-yellow-50 rounded">
                      <div className="text-lg font-bold text-yellow-600">
                        {suppliers.filter(s => s.riskLevel === 'Medium').length}
                      </div>
                      <div className="text-sm text-gray-600">Medium Risk</div>
                    </div>
                    <div className="p-3 bg-red-50 rounded">
                      <div className="text-lg font-bold text-red-600">
                        {suppliers.filter(s => s.riskLevel === 'High').length}
                      </div>
                      <div className="text-sm text-gray-600">High Risk</div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">Risk Mitigation Actions</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Backup suppliers identified</span>
                        <Badge className="bg-green-100 text-green-800">Complete</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Alternative sourcing strategies</span>
                        <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Supply chain monitoring</span>
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CMCSupplyChain;
