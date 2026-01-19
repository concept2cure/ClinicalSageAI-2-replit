import { useEffect, useState } from 'react';
import { Badge, Button, Card, Progress, Table, Tag, Tooltip } from 'antd';
import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import {
  getDocumentAuditTrail,
  getDocumentMetadata,
  getDocumentVersions,
} from '../services/vaultService';

export default function VaultMetadataPanel({ documentId, programId }) {
  const [metadata, setMetadata] = useState(null);
  const [versions, setVersions] = useState([]);
  const [auditTrail, setAuditTrail] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('metadata');

  useEffect(() => {
    if (!documentId) {
      setMetadata(null);
      setVersions([]);
      setAuditTrail([]);
      setLoading(false);
      return;
    }

    const loadVaultData = async () => {
      try {
        setLoading(true);
        const [meta, vers, audit] = await Promise.all([
          getDocumentMetadata(documentId),
          getDocumentVersions(documentId),
          getDocumentAuditTrail(documentId),
        ]);

        setMetadata(meta);
        setVersions(vers);
        setAuditTrail(audit);
      } catch (error) {
        console.error('Failed to load vault data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVaultData();
  }, [documentId]);

  if (loading) {
    return <div className="p-5 text-center">🔍 Loading vault intelligence...</div>;
  }

  if (!metadata) {
    return <div className="p-5 text-slate-500">📄 No vault record found for this document</div>;
  }

  return (
    <div className="rounded-lg bg-slate-50 p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="m-0 text-lg font-semibold">📁 Vault Record</h3>
          <p className="mt-1 text-sm text-slate-500">
            {metadata.name || metadata.title} • Version {metadata.currentVersion || '1.0'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => window.open(`/api/vault/documents/${documentId}/download`, '_blank')}
          >
            Download File
          </Button>

          <Button
            icon={<HistoryOutlined />}
            onClick={() => setActiveTab(activeTab === 'versions' ? 'metadata' : 'versions')}
          >
            Versions ({versions.length})
          </Button>

          <Button
            icon={<AuditOutlined />}
            onClick={() => setActiveTab(activeTab === 'audit' ? 'metadata' : 'audit')}
          >
            Audit ({auditTrail.length})
          </Button>
        </div>
      </div>

      {activeTab === 'metadata' && <MetadataTab metadata={metadata} programId={programId} />}
      {activeTab === 'versions' && (
        <VersionsTab versions={versions} documentId={documentId} />
      )}
      {activeTab === 'audit' && <AuditTab auditTrail={auditTrail} />}
    </div>
  );
}

function MetadataTab({ metadata, programId }) {
  const qualityScore = calculateQualityScore(metadata);

  return (
    <Card title="📊 Document Intelligence" bordered={false}>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card size="small" title="Source & Quality">
          <div className="mb-3">
            <strong>Data Source:</strong>
            <div>
              <Tag color={metadata.metadata?.source === 'HEALTH_CANADA_API' ? 'green' : 'orange'}>
                {metadata.metadata?.source || 'UNKNOWN'}
              </Tag>
            </div>
          </div>

          <div className="mb-3">
            <strong>Completeness:</strong>
            <div className="flex items-center gap-2">
              <Progress percent={metadata.metadata?.dataCompleteness || 0} size="small" />
              <span>{metadata.metadata?.dataCompleteness || 0}%</span>
            </div>
          </div>

          <div>
            <strong>Quality Score:</strong>
            <div>
              <Badge
                count={`${qualityScore}/100`}
                style={{
                  backgroundColor:
                    qualityScore >= 80 ? '#52c41a' : qualityScore >= 60 ? '#faad14' : '#f5222d',
                }}
              />
            </div>
          </div>
        </Card>

        <Card size="small" title="Validation Status">
          <div className="mb-3">
            <strong>Status:</strong>
            <div>
              <Tag color={metadata.status === 'APPROVED' ? 'green' : 'gold'}>
                {metadata.status}
              </Tag>
            </div>
          </div>

          <div className="mb-3">
            <strong>Validation Errors:</strong>
            <div>
              {metadata.metadata?.validationErrors || 0} issues
              {metadata.metadata?.validationErrors > 0 && (
                <Tooltip
                  title={(metadata.metadata?.validationErrorDetails || []).join(', ')}
                >
                  <ExclamationCircleOutlined className="ml-1 text-amber-500" />
                </Tooltip>
              )}
            </div>
          </div>

          <div>
            <strong>QC Flags:</strong>
            <div className="mt-1">
              {metadata.metadata?.qcFlags?.length ? (
                metadata.metadata.qcFlags.map(flag => (
                  <Tag key={flag} color="orange" className="mb-1">
                    {flag}
                  </Tag>
                ))
              ) : (
                <Tag color="green">✅ None</Tag>
              )}
            </div>
          </div>
        </Card>

        <Card size="small" title="Traceability">
          <div className="mb-3">
            <strong>Linked Claims:</strong>
            <div>
              {metadata.links?.claims?.length || 0} claims
              <Button
                size="small"
                type="link"
                onClick={() => window.open(`/programs/${programId}/claims`, '_blank')}
              >
                View
              </Button>
            </div>
          </div>

          <div className="mb-3">
            <strong>Linked Standards:</strong>
            <div>
              {metadata.links?.standards?.length || 0} standards
              <Button
                size="small"
                type="link"
                onClick={() => window.open(`/programs/${programId}/standards`, '_blank')}
              >
                View
              </Button>
            </div>
          </div>

          <div>
            <strong>Linked Outcomes:</strong>
            <div>
              {metadata.links?.outcomes?.length || 0} outcomes
              <Button
                size="small"
                type="link"
                onClick={() => window.open(`/programs/${programId}/outcomes`, '_blank')}
              >
                View
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card size="small" title="File Information" className="mt-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <strong>Filename:</strong> {metadata.name || metadata.title}
          </div>
          <div>
            <strong>Size:</strong> {formatFileSize(metadata.metadata?.fileSize || 0)}
          </div>
          <div>
            <strong>Checksum:</strong> <code>{metadata.checksum || 'N/A'}</code>
          </div>
          <div>
            <strong>Uploaded:</strong>{' '}
            {metadata.uploadedAt ? new Date(metadata.uploadedAt).toLocaleString() : 'N/A'}
          </div>
          <div>
            <strong>Uploaded By:</strong> {metadata.uploadedBy || 'System Pipeline'}
          </div>
          <div>
            <strong>Program:</strong> {programId}
          </div>
        </div>
      </Card>
    </Card>
  );
}

function VersionsTab({ versions, documentId }) {
  const columns = [
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      sorter: (a, b) => a.version - b.version,
      render: version => <Badge count={`v${version}`} />,
    },
    {
      title: 'Created',
      dataIndex: 'uploadedAt',
      key: 'uploadedAt',
      render: date => (date ? new Date(date).toLocaleString() : 'N/A'),
    },
    {
      title: 'Created By',
      dataIndex: 'uploadedBy',
      key: 'uploadedBy',
    },
    {
      title: 'Size',
      dataIndex: 'fileSize',
      key: 'fileSize',
      render: size => formatFileSize(size || 0),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={() =>
            window.open(`/api/vault/documents/${documentId}/download?version=${record.version}`, '_blank')
          }
        >
          Download
        </Button>
      ),
    },
  ];

  return (
    <Card title={`Version History (${versions.length})`} bordered={false}>
      <Table columns={columns} dataSource={versions} rowKey="version" pagination={false} size="small" />
    </Card>
  );
}

function AuditTab({ auditTrail }) {
  const columns = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: ts => (ts ? new Date(ts).toLocaleString() : 'N/A'),
    },
    {
      title: 'User',
      dataIndex: 'userId',
      key: 'userId',
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: action => {
        const icons = {
          UPLOADED: <ClockCircleOutlined className="text-blue-500" />,
          APPROVED: <CheckCircleOutlined className="text-green-500" />,
          VERSIONED: <HistoryOutlined className="text-amber-500" />,
          DELETED: <ExclamationCircleOutlined className="text-red-500" />,
        };
        return (
          <span>
            {icons[action] || ''} {action}
          </span>
        );
      },
    },
    {
      title: 'Details',
      dataIndex: 'details',
      key: 'details',
      render: details => details || '-',
    },
  ];

  return (
    <Card title={`Audit Trail (${auditTrail.length})`} bordered={false}>
      <Table
        columns={columns}
        dataSource={auditTrail}
        rowKey="id"
        pagination={{ pageSize: 10 }}
        size="small"
      />
    </Card>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function calculateQualityScore(metadata) {
  let score = 0;

  score += (metadata.metadata?.dataCompleteness || 0) * 0.4;
  score += metadata.metadata?.source === 'HEALTH_CANADA_API' ? 20 : 10;
  score += (metadata.metadata?.validationErrors || 0) === 0 ? 20 : 10;
  score += (metadata.metadata?.qcFlags?.length || 0) === 0 ? 20 : 10;

  return Math.round(score);
}
