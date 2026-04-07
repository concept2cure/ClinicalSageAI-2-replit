import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Timeline, TimelineItem } from '../lightweight-wrappers.js';
import {
  FileText,
  Calendar,
  Download,
  Edit,
  History,
  Info,
  Code,
  ArrowLeft,
  Tags,
  Lock,
  CheckCircle,
  Users,
  BookOpen,
  Database,
  BellRing,
} from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

// Mock metadata detail
const mockMetadataDetail = {
  id: '1',
  name: 'SDTM Demographics Domain',
  type: 'Domain',
  source: 'CDISC',
  version: '3.2',
  description:
    'The Demographics domain (DM) contains demographic data and other identifying characteristics that are constant over the course of the clinical study. This domain should include a record for every subject who entered the study.',
  lastUpdated: '2025-03-15',
  createdBy: 'John Smith',
  status: 'Active',
  tags: ['Demographics', 'SDTM', 'Patient Data', 'Core Domain'],
  schemaDefinition: `{
  "type": "object",
  "properties": {
    "USUBJID": {
      "type": "string",
      "description": "Unique Subject Identifier"
    },
    "SUBJID": {
      "type": "string",
      "description": "Subject Identifier for the Study"
    },
    "SITEID": {
      "type": "string",
      "description": "Study Site Identifier"
    },
    "AGE": {
      "type": "number",
      "description": "Age"
    },
    "AGEU": {
      "type": "string",
      "enum": ["YEARS", "MONTHS", "DAYS"],
      "description": "Age Units"
    },
    "SEX": {
      "type": "string",
      "enum": ["M", "F", "U", "UNDIFFERENTIATED"],
      "description": "Sex"
    },
    "RACE": {
      "type": "string",
      "description": "Race"
    },
    "ETHNIC": {
      "type": "string",
      "description": "Ethnicity"
    },
    "COUNTRY": {
      "type": "string",
      "description": "Country"
    },
    "DMDTC": {
      "type": "string",
      "format": "date",
      "description": "Date/Time of Collection"
    }
  },
  "required": ["USUBJID", "SUBJID", "SITEID", "AGE", "AGEU", "SEX"]
}`,
  relatedAssets: [
    { id: '2', name: 'SDTM Adverse Events Domain', type: 'Domain' },
    { id: '7', name: 'CRF Standard Library', type: 'Library' },
    { id: '9', name: 'Study Data Tabulation Model', type: 'Model' },
  ],
  changeHistory: [
    {
      date: '2025-03-15',
      version: '3.2',
      author: 'John Smith',
      changes: 'Added ETHNIC field as recommended by FDA guidance',
    },
    {
      date: '2024-11-10',
      version: '3.1',
      author: 'Jane Doe',
      changes: 'Updated RACE field to align with latest ICH recommendations',
    },
    {
      date: '2024-06-22',
      version: '3.0',
      author: 'Alex Johnson',
      changes: 'Major version update to align with CDISC SDTM v3.3',
    },
  ],
  usage: [
    { studyId: 'STUDY-001', sponsor: 'Pharma Corp', date: '2025-02-10' },
    { studyId: 'ONCO-452', sponsor: 'BioTech Inc', date: '2025-01-05' },
    { studyId: 'CARD-123', sponsor: 'MedDevice Co', date: '2024-12-15' },
  ],
  validationRules: [
    'USUBJID must be unique within the study',
    'AGE must be a positive number',
    'SEX must be one of: M, F, U, UNDIFFERENTIATED',
    'DMDTC must be a valid ISO date format',
  ],
};

interface AssetDetailProps {
  assetId: string;
  onBack?: () => void;
}

export default function AssetDetail({ assetId, onBack }: AssetDetailProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

  // In a real application, you would fetch the asset details based on the assetId
  // For this example, we'll just use the mock data
  const metadata = mockMetadataDetail;

  const handleDownload = () => {
    toast({
      title: 'Download started',
      description: 'Metadata definition is being prepared for download.',
    });
  };

  const handleEdit = () => {
    toast({
      title: 'Edit mode',
      description: 'Edit mode will be available in the next release.',
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-2 text-muted-foreground"
              onClick={onBack}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to repository
            </Button>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">{metadata.name}</CardTitle>
              <Badge>{metadata.version}</Badge>
              <Badge
                className={
                  metadata.status === 'Active'
                    ? 'bg-green-100 text-green-800 border-green-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }
              >
                {metadata.status}
              </Badge>
            </div>
            <div className="flex gap-2 mt-1 flex-wrap">
              {metadata.tags.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-1 h-4 w-4" />
              Download
            </Button>
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Edit className="mr-1 h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>
        <CardDescription className="mt-2">{metadata.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex-grow overflow-hidden">
        <Tabs
          defaultValue="overview"
          value={activeTab}
          onValueChange={setActiveTab}
          className="h-full flex flex-col"
        >
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="overview">
              <Info className="h-4 w-4 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="schema">
              <Code className="h-4 w-4 mr-1" />
              Schema
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1" />
              History
            </TabsTrigger>
            <TabsTrigger value="usage">
              <Users className="h-4 w-4 mr-1" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="validation">
              <CheckCircle className="h-4 w-4 mr-1" />
              Validation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-grow overflow-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <Info className="h-4 w-4 mr-1 text-muted-foreground" />
                    Basic Information
                  </h3>
                  <dl className="grid grid-cols-3 gap-1 text-sm">
                    <dt className="text-muted-foreground">Type:</dt>
                    <dd className="col-span-2">{metadata.type}</dd>

                    <dt className="text-muted-foreground">Source:</dt>
                    <dd className="col-span-2">{metadata.source}</dd>

                    <dt className="text-muted-foreground">Version:</dt>
                    <dd className="col-span-2">{metadata.version}</dd>

                    <dt className="text-muted-foreground">Status:</dt>
                    <dd className="col-span-2">
                      <Badge
                        className={
                          metadata.status === 'Active'
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }
                      >
                        {metadata.status}
                      </Badge>
                    </dd>
                  </dl>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                    Dates & Authors
                  </h3>
                  <dl className="grid grid-cols-3 gap-1 text-sm">
                    <dt className="text-muted-foreground">Last Updated:</dt>
                    <dd className="col-span-2">{metadata.lastUpdated}</dd>

                    <dt className="text-muted-foreground">Created By:</dt>
                    <dd className="col-span-2">{metadata.createdBy}</dd>
                  </dl>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <Lock className="h-4 w-4 mr-1 text-muted-foreground" />
                    Permissions
                  </h3>
                  <Badge variant="outline" className="mr-1">
                    Read: All Users
                  </Badge>
                  <Badge variant="outline" className="mr-1">
                    Write: Admin, Metadata Specialists
                  </Badge>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <Database className="h-4 w-4 mr-1 text-muted-foreground" />
                    Related Assets
                  </h3>
                  <ul className="space-y-1">
                    {metadata.relatedAssets.map((asset, index) => (
                      <li key={index} className="text-sm flex items-center">
                        <FileText className="h-3 w-3 mr-1 text-blue-500" />
                        <span className="hover:underline cursor-pointer">{asset.name}</span>
                        <Badge className="ml-1 text-xs" variant="outline">
                          {asset.type}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <Tags className="h-4 w-4 mr-1 text-muted-foreground" />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {metadata.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs">
                    <Tags className="h-3 w-3 mr-1" />
                    Manage Tags
                  </Button>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <BellRing className="h-4 w-4 mr-1 text-muted-foreground" />
                    Notifications
                  </h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    Subscribe to Updates
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="schema" className="flex-grow overflow-auto">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Schema Definition</h3>
                <pre className="bg-muted p-4 rounded-md overflow-auto text-xs whitespace-pre">
                  {metadata.schemaDefinition}
                </pre>
              </div>

              <div className="flex mt-4">
                <Button variant="outline" size="sm" className="mr-2">
                  <Download className="h-4 w-4 mr-1" />
                  Download Schema
                </Button>
                <Button variant="outline" size="sm">
                  <BookOpen className="h-4 w-4 mr-1" />
                  View Documentation
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-grow overflow-auto">
            <Timeline lineColor="#ddd">
              {metadata.changeHistory.map((change, index) => (
                <TimelineItem
                  key={index}
                  dateText={change.date}
                  style={{ color: '#333' }}
                  dateInnerStyle={{ background: '#f4f3ee', color: '#4a4a46' }}
                >
                  <div className="bg-white p-4 rounded-md border border-gray-200">
                    <h3 className="text-sm font-medium">Version {change.version}</h3>
                    <p className="text-xs text-muted-foreground">Author: {change.author}</p>
                    <p className="text-sm mt-2">{change.changes}</p>
                  </div>
                </TimelineItem>
              ))}
            </Timeline>
          </TabsContent>

          <TabsContent value="usage" className="flex-grow overflow-auto">
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Recent Usage</h3>
              <div className="overflow-hidden rounded-md border">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Study ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sponsor
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {metadata.usage.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 text-sm">{item.studyId}</td>
                        <td className="px-4 py-3 text-sm">{item.sponsor}</td>
                        <td className="px-4 py-3 text-sm">{item.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <Button variant="outline" size="sm">
                  View Complete Usage Analytics
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="validation" className="flex-grow overflow-auto">
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Validation Rules</h3>
              <ul className="space-y-2">
                {metadata.validationRules.map((rule, index) => (
                  <li key={index} className="flex items-start bg-muted/30 p-3 rounded-md">
                    <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                    <span className="text-sm">{rule}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <Button variant="outline" size="sm">
                  Add Custom Validation Rule
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="border-t pt-4 flex justify-between">
        <div className="text-xs text-muted-foreground">
          Last updated: {metadata.lastUpdated} by {metadata.createdBy}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button size="sm">
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
