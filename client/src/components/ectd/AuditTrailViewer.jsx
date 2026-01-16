import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, Search, Filter, Download, User, Clock, FileText, AlertTriangle } from 'lucide-react'

// Mock Audit Data
const MOCK_LOGS = [
  { id: 'LOG-001', timestamp: '2024-01-15 09:30:15', user: 'Dr. Sarah Smith', action: 'LOGIN', resource: 'System', details: 'Successful login from IP 192.168.1.1', severity: 'info' },
  { id: 'LOG-002', timestamp: '2024-01-15 09:35:22', user: 'Dr. Sarah Smith', action: 'CREATE', resource: 'Doc-2.5-Clinical-Overview', details: 'Created new document version 0.1', severity: 'info' },
  { id: 'LOG-003', timestamp: '2024-01-15 10:15:00', user: 'James Wilson', action: 'EDIT', resource: 'Doc-2.5-Clinical-Overview', details: 'Modified Section 3.1 (Efficacy)', severity: 'info' },
  { id: 'LOG-004', timestamp: '2024-01-15 11:20:45', user: 'System', action: 'VALIDATION', resource: 'Sequence-0001', details: 'Validation failed: Missing MD5 checksum', severity: 'error' },
  { id: 'LOG-005', timestamp: '2024-01-15 13:45:10', user: 'Dr. Sarah Smith', action: 'SIGN', resource: 'Doc-2.5-Clinical-Overview', details: 'Electronic Signature applied (Meaning: Approval)', severity: 'warning' },
  { id: 'LOG-006', timestamp: '2024-01-15 14:00:00', user: 'Admin', action: 'ACCESS_CHANGE', resource: 'User-James Wilson', details: 'Granted "Publisher" role', severity: 'warning' },
  { id: 'LOG-007', timestamp: '2024-01-15 14:30:22', user: 'James Wilson', action: 'PUBLISH', resource: 'Sequence-0001', details: 'Initiated publishing for Sequence 0001', severity: 'info' },
];

export default function AuditTrailViewer() {
  const [logs, setLogs] = useState(MOCK_LOGS);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');

  const filteredLogs = logs.filter(log => {
    const matchUser = log.user.toLowerCase().includes(filterUser.toLowerCase());
    const matchAction = filterAction === 'ALL' || log.action === filterAction;
    return matchUser && matchAction;
  });

  return (
    <div className="grid grid-cols-1 gap-6 h-[calc(100vh-140px)]">
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" /> 21 CFR Part 11 Audit Trail
              </CardTitle>
              <CardDescription>
                Secure, immutable logs of all system activities, document changes, and access events.
              </CardDescription>
            </div>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Export Report
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4">
          {/* Filters */}
          <div className="flex gap-4 p-4 bg-gray-50 rounded-lg border">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input 
                  placeholder="Search by user..." 
                  className="pl-9 bg-white"
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                />
              </div>
            </div>
            <div className="w-[200px]">
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Filter by Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Actions</SelectItem>
                  <SelectItem value="LOGIN">Login/Access</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="EDIT">Edit</SelectItem>
                  <SelectItem value="SIGN">E-Signature</SelectItem>
                  <SelectItem value="PUBLISH">Publishing</SelectItem>
                  <SelectItem value="VALIDATION">Validation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Logs Table */}
          <div className="flex-1 border rounded-md overflow-hidden">
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader className="bg-gray-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[150px]">User</TableHead>
                    <TableHead className="w-[120px]">Action</TableHead>
                    <TableHead className="w-[200px]">Resource</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-xs text-gray-500 flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {log.timestamp}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-gray-400" />
                          <span className="font-medium text-sm">{log.user}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          log.action === 'VALIDATION' ? 'border-red-200 text-red-700 bg-red-50' :
                          log.action === 'SIGN' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                          'border-blue-200 text-blue-700 bg-blue-50'
                        }>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3 w-3" />
                          {log.resource}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.severity === 'error' && <AlertTriangle className="h-3 w-3 text-red-500 inline mr-1" />}
                        {log.details}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
          
          <div className="text-xs text-gray-400 text-center">
            System ID: SYS-88291 • Audit Log Integrity Verified • Last Backup: 10 mins ago
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
