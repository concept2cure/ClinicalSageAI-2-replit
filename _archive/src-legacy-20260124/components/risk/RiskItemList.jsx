import React from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Clock,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  ArrowUpRight,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

/**
 * RiskItemList Component
 *
 * Displays a filterable, interactive list of document risks with
 * key metrics, status indicators, and actions.
 */
const RiskItemList = ({ risks = [], isLoading, selectedRiskId, onSelectRisk, onUpdateStatus }) => {
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  // Filter risks based on status and search query
  const filteredRisks = risks.filter(risk => {
    const matchesStatus = filterStatus === 'all' || risk.mitigationStatus === filterStatus;
    const matchesSearch =
      searchQuery === '' ||
      risk.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.section.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  // Sort risks by severity (high to low) and then by status
  const sortedRisks = [...filteredRisks].sort((a, b) => {
    // First sort by severity
    const severityOrder = { high: 1, medium: 2, low: 3 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];

    if (severityDiff !== 0) return severityDiff;

    // Then sort by status
    const statusOrder = { open: 1, in_progress: 2, resolved: 3 };
    return statusOrder[a.mitigationStatus] - statusOrder[b.mitigationStatus];
  });

  // Helper to get severity badge
  const getSeverityBadge = severity => {
    switch (severity) {
      case 'high':
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100">
            <AlertCircle className="h-3 w-3 mr-1" />
            High
          </Badge>
        );
      case 'medium':
        return (
          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Medium
          </Badge>
        );
      case 'low':
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Low
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Helper to get status badge
  const getStatusBadge = status => {
    switch (status) {
      case 'open':
        return (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 capitalize"
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Open
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 capitalize"
          >
            <Clock className="h-3 w-3 mr-1" />
            In Progress
          </Badge>
        );
      case 'resolved':
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 capitalize"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Resolved
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="capitalize">
            {status || 'Unknown'}
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Document Risks</CardTitle>
          <CardDescription>Loading risk items...</CardDescription>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (!risks.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Document Risks</CardTitle>
          <CardDescription>No risks found</CardDescription>
        </CardHeader>
        <CardContent className="h-80 flex flex-col items-center justify-center">
          <FileText className="h-16 w-16 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">No risk items have been identified</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Document Risks</CardTitle>
            <CardDescription>
              {filteredRisks.length} {filteredRisks.length === 1 ? 'risk' : 'risks'} found
            </CardDescription>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Search risks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="max-w-[200px]"
            />

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Severity</TableHead>
                <TableHead className="w-[120px]">Section</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {sortedRisks.length > 0 ? (
                sortedRisks.map(risk => (
                  <TableRow
                    key={risk.id}
                    className={
                      selectedRiskId === risk.id ? 'bg-muted' : 'hover:bg-muted/50 cursor-pointer'
                    }
                    onClick={() => onSelectRisk(risk.id)}
                  >
                    <TableCell>{getSeverityBadge(risk.severity)}</TableCell>
                    <TableCell className="font-medium">{risk.section}</TableCell>
                    <TableCell>
                      <div className="truncate max-w-[400px]">{risk.description}</div>
                    </TableCell>
                    <TableCell>
                      {risk.mitigationStatus === 'resolved' ? (
                        getStatusBadge(risk.mitigationStatus)
                      ) : (
                        <Select
                          value={risk.mitigationStatus}
                          onValueChange={value => {
                            // Prevent triggering select risk
                            onUpdateStatus(risk.id, value);
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue>{getStatusBadge(risk.mitigationStatus)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => {
                          e.stopPropagation();
                          onSelectRisk(risk.id);
                        }}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No risks match your search criteria
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default RiskItemList;
