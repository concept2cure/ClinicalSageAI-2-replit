import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  History,
  Clock,
  User,
  Shield,
  FileText,
  GitBranch,
  Download,
  Eye,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Tag,
  Building,
} from 'lucide-react';
import { format } from 'date-fns';

/**
 * Document Version History Component
 *
 * Displays comprehensive version history, audit trails, and regulatory metadata
 * for documents stored in the unified document system.
 */
const DocumentVersionHistory = ({ documentId, currentVersionId }) => {
  const [versions, setVersions] = useState([]);
  const [auditTrail, setAuditTrail] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [activeTab, setActiveTab] = useState('versions');

  useEffect(() => {
    if (documentId) {
      fetchDocumentHistory();
    }
  }, [documentId]);

  const fetchDocumentHistory = async () => {
    try {
      setLoading(true);

      // Fetch version history
      const versionsRes = await fetch(`/api/unified/documents/${documentId}/versions`);
      const versionsData = await versionsRes.json();
      setVersions(versionsData.versions || []);

      // Fetch audit trail
      const auditRes = await fetch(`/api/unified/documents/${documentId}/audit-trail`);
      const auditData = await auditRes.json();
      setAuditTrail(auditData.auditTrail || []);
    } catch (error) {
      console.error('Failed to fetch document history:', error);
    } finally {
      setLoading(false);
    }
  };

  const compareVersions = versionId => {
    setSelectedVersion(versionId);
    // Implementation for version comparison
  };

  const downloadVersion = async versionId => {
    try {
      const response = await fetch(`/api/unified/documents/version/${versionId}/download`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document_v${versionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download version:', error);
    }
  };

  const formatDate = dateString => {
    return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
  };

  const getPathwayBadge = pathway => {
    const pathwayColors = {
      '510k': 'bg-blue-100 text-blue-800',
      PMA: 'bg-purple-100 text-purple-800',
      IND: 'bg-green-100 text-green-800',
      NDA: 'bg-orange-100 text-orange-800',
      BLA: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={pathwayColors[pathway] || 'bg-gray-100 text-gray-800'}>{pathway}</Badge>
    );
  };

  const getActionIcon = action => {
    const icons = {
      document_ingested: <Upload className="w-4 h-4" />,
      version_created: <GitBranch className="w-4 h-4" />,
      document_viewed: <Eye className="w-4 h-4" />,
      document_downloaded: <Download className="w-4 h-4" />,
      metadata_updated: <RefreshCw className="w-4 h-4" />,
      compliance_checked: <Shield className="w-4 h-4" />,
    };

    return icons[action] || <FileText className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          Document History & Compliance
        </CardTitle>
        <CardDescription>
          Version control, audit trail, and regulatory compliance tracking
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="versions">
              <GitBranch className="w-4 h-4 mr-2" />
              Versions
            </TabsTrigger>
            <TabsTrigger value="audit">
              <Shield className="w-4 h-4 mr-2" />
              Audit Trail
            </TabsTrigger>
            <TabsTrigger value="metadata">
              <Tag className="w-4 h-4 mr-2" />
              Metadata
            </TabsTrigger>
          </TabsList>

          <TabsContent value="versions" className="space-y-4 mt-4">
            {versions.length === 0 ? (
              <Alert>
                <AlertDescription>No version history available</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {versions.map(version => (
                  <div
                    key={version.document_version_id}
                    className={`
                      p-4 rounded-lg border transition-colors cursor-pointer
                      ${version.is_latest_version ? 'border-blue-200 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}
                    `}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium flex items-center gap-2">
                            Version {version.version_number}
                            {version.version_label && (
                              <Badge variant="outline">{version.version_label}</Badge>
                            )}
                          </h4>
                          {version.is_latest_version && (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Latest
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {version.ingested_by || 'System'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(version.created_at)}
                          </span>
                          {version.source_system && (
                            <span className="flex items-center gap-1">
                              <Building className="w-3 h-3" />
                              {version.source_system}
                            </span>
                          )}
                        </div>

                        {version.version_notes && (
                          <p className="text-sm text-gray-600 mt-2">{version.version_notes}</p>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                          {version.regulatory_pathway &&
                            getPathwayBadge(version.regulatory_pathway)}
                          {version.ectd_module && (
                            <Badge variant="secondary">Module {version.ectd_module}</Badge>
                          )}
                          {version.compliance_score && (
                            <Badge
                              className={
                                version.compliance_score >= 90
                                  ? 'bg-green-100 text-green-800'
                                  : version.compliance_score >= 70
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }
                            >
                              {version.compliance_score}% Compliant
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadVersion(version.document_version_id)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        {!version.is_latest_version && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => compareVersions(version.document_version_id)}
                          >
                            Compare
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="space-y-4 mt-4">
            {auditTrail.length === 0 ? (
              <Alert>
                <AlertDescription>No audit trail entries found</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                {auditTrail.map(entry => (
                  <div
                    key={entry.audit_id}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50"
                  >
                    <div className="mt-1">{getActionIcon(entry.action)}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {entry.action.replace(/_/g, ' ').toUpperCase()}
                        </p>
                        <span className="text-xs text-gray-500">
                          {formatDate(entry.performed_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">by {entry.performed_by}</p>
                      {entry.details && (
                        <div className="mt-1 text-xs text-gray-500">
                          {Object.entries(entry.details).map(([key, value]) => (
                            <span key={key} className="mr-3">
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="metadata" className="space-y-4 mt-4">
            {versions.length > 0 && versions[0] && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Regulatory Information
                    </h4>
                    <div className="space-y-2">
                      {versions[0].regulatory_pathway && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Pathway:</span>
                          {getPathwayBadge(versions[0].regulatory_pathway)}
                        </div>
                      )}
                      {versions[0].regulatory_agency && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Agency:</span>
                          <span className="text-sm font-medium">
                            {versions[0].regulatory_agency}
                          </span>
                        </div>
                      )}
                      {versions[0].submission_type && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Submission Type:</span>
                          <span className="text-sm font-medium">{versions[0].submission_type}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Clinical Information</h4>
                    <div className="space-y-2">
                      {versions[0].therapeutic_area && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Therapeutic Area:</span>
                          <span className="text-sm font-medium">
                            {versions[0].therapeutic_area}
                          </span>
                        </div>
                      )}
                      {versions[0].study_id && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Study ID:</span>
                          <span className="text-sm font-medium">{versions[0].study_id}</span>
                        </div>
                      )}
                      {versions[0].product_name && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Product:</span>
                          <span className="text-sm font-medium">{versions[0].product_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {versions[0].ectd_module && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">eCTD Information</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Module:</span>
                        <Badge variant="secondary">Module {versions[0].ectd_module}</Badge>
                      </div>
                      {versions[0].ectd_section && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Section:</span>
                          <span className="text-sm font-medium">{versions[0].ectd_section}</span>
                        </div>
                      )}
                      {versions[0].ectd_operation_type && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Operation:</span>
                          <Badge>{versions[0].ectd_operation_type}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DocumentVersionHistory;
