import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Tag, Card, Typography, Modal, message, Space } from 'antd';
import { CheckOutlined, EyeOutlined, LoadingOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { adminService } from '../../services/adminService';
import { onboardingService } from '../../services/onboardingService';

const { Title, Paragraph, Text } = Typography;

const Container = styled.div`
  max-width: 1400px;
  margin: 40px auto;
  padding: 0 24px;
  background: #ffffff;
`;

const HeaderCard = styled(Card)`
  margin-bottom: 24px;

  .ant-card-body {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
`;

const StatusTag = styled(Tag)`
  font-weight: 600;
  text-transform: uppercase;
`;

const ApproveButton = styled(Button)`
  background: #059669;
  border-color: #059669;

  &:hover {
    background: #047857 !important;
    border-color: #047857 !important;
  }
`;

const DetailsModal = styled(Modal)`
  .detail-item {
    margin-bottom: 16px;

    .label {
      font-weight: 600;
      color: #1f2937;
      display: block;
      margin-bottom: 4px;
    }

    .value {
      color: #6b7280;
    }
  }
`;

export default function AdminApprovals() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, total: 0 });
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  useEffect(() => {
    loadPendingRequests();
  }, []);

  const loadPendingRequests = async () => {
    setLoading(true);
    try {
      const [requestsData, statsData] = await Promise.all([
        adminService.getPendingRequests(),
        adminService.getStats(),
      ]);
      setRequests(Array.isArray(requestsData) ? requestsData : []);
      if (statsData) {
        setStats({
          pending: statsData.pending ?? 0,
          approved: statsData.approved ?? 0,
          total: statsData.total ?? 0,
        });
      }
    } catch (error) {
      message.error(error.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async record => {
    if (!record) return;
    Modal.confirm({
      title: 'Approve Access Request',
      content: `This will activate ${record.org?.name || 'this organization'} and grant ${record.user?.name || 'the requester'} admin access.`,
      okText: 'Approve',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await adminService.approveRequest(record.user.id);
          message.success(`${record.org?.name || 'Organization'} approved successfully!`);
          await loadPendingRequests();
          await onboardingService.sendApprovalEmail(record.user.email, record.org?.name || '');
        } catch (error) {
          message.error(error.message || 'Failed to approve request');
        }
      },
    });
  };

  const showDetails = record => {
    setSelectedRequest(record);
    setDetailsVisible(true);
  };

  const columns = useMemo(
    () => [
      {
        title: 'Company',
        dataIndex: 'org',
        key: 'company',
        render: org => <strong>{org?.name || 'Unknown'}</strong>,
        sorter: (a, b) => (a.org?.name || '').localeCompare(b.org?.name || ''),
      },
      {
        title: 'Requester',
        dataIndex: 'user',
        key: 'requester',
        render: user => (
          <div>
            <div>{user?.name || 'Unknown'}</div>
            <div style={{ color: '#6b7280', fontSize: '12px' }}>{user?.email || 'N/A'}</div>
          </div>
        ),
      },
      {
        title: 'Industry',
        dataIndex: 'org',
        key: 'industry',
        render: org => org?.settings?.industry || 'N/A',
        filters: [
          { text: 'Medical Device', value: 'medical_device' },
          { text: 'Pharma', value: 'pharma' },
          { text: 'CRO', value: 'cro' },
          { text: 'Consultant', value: 'consultant' },
        ],
        onFilter: (value, record) => record.org?.settings?.industry === value,
      },
      {
        title: 'Requested',
        dataIndex: 'createdAt',
        key: 'requested',
        render: date => (date ? new Date(date).toLocaleDateString() : 'N/A'),
        sorter: (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
      },
      {
        title: 'Status',
        dataIndex: 'user',
        key: 'status',
        render: user => {
          const status = user?.role === 'admin' ? 'approved' : 'pending';
          const color = status === 'pending' ? 'gold' : 'green';
          return <StatusTag color={color}>{status}</StatusTag>;
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_, record) => {
          if (record.user?.role === 'admin') {
            return <Tag color="green">Already Approved</Tag>;
          }

          return (
            <Space>
              <ApproveButton size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)}>
                Approve
              </ApproveButton>

              <Button size="small" icon={<EyeOutlined />} onClick={() => showDetails(record)}>
                Details
              </Button>
            </Space>
          );
        },
      },
    ],
    []
  );

  return (
    <Container>
      <HeaderCard>
        <div>
          <Title level={2}>Client Onboarding</Title>
          <Paragraph type="secondary">
            Review and approve access requests from new organizations.
          </Paragraph>
        </div>

        <Space size="large">
          <div>
            <Text type="secondary">Pending: </Text>
            <Text strong style={{ fontSize: '20px' }}>
              {stats.pending}
            </Text>
          </div>
          <div>
            <Text type="secondary">Approved: </Text>
            <Text strong style={{ fontSize: '20px' }}>
              {stats.approved}
            </Text>
          </div>
          <div>
            <Text type="secondary">Total: </Text>
            <Text strong style={{ fontSize: '20px' }}>
              {stats.total}
            </Text>
          </div>
          <Button type="primary" onClick={loadPendingRequests} icon={<LoadingOutlined />}>
            Refresh
          </Button>
        </Space>
      </HeaderCard>

      <Card>
        <Table
          columns={columns}
          dataSource={requests}
          rowKey={record => record.id}
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 800 }}
        />
      </Card>

      <DetailsModal
        title="Request Details"
        open={detailsVisible}
        onCancel={() => setDetailsVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setDetailsVisible(false)}>
            Close
          </Button>,
          <ApproveButton
            key="approve"
            onClick={() => handleApprove(selectedRequest)}
            disabled={selectedRequest?.user?.role === 'admin'}
          >
            Approve
          </ApproveButton>,
        ]}
      >
        {selectedRequest && (
          <div>
            <div className="detail-item">
              <span className="label">Company</span>
              <span className="value">{selectedRequest.org?.name || 'N/A'}</span>
            </div>

            <div className="detail-item">
              <span className="label">Requester</span>
              <span className="value">
                {selectedRequest.user?.name || 'N/A'} ({selectedRequest.user?.email || 'N/A'})
              </span>
            </div>

            <div className="detail-item">
              <span className="label">Job Title</span>
              <span className="value">{selectedRequest.user?.title || 'N/A'}</span>
            </div>

            <div className="detail-item">
              <span className="label">Industry</span>
              <span className="value">{selectedRequest.org?.settings?.industry || 'N/A'}</span>
            </div>

            <div className="detail-item">
              <span className="label">Use Case</span>
              <span className="value">{selectedRequest.org?.settings?.useCase || 'N/A'}</span>
            </div>

            <div className="detail-item">
              <span className="label">Requested</span>
              <span className="value">
                {selectedRequest.createdAt
                  ? new Date(selectedRequest.createdAt).toLocaleString()
                  : 'N/A'}
              </span>
            </div>
          </div>
        )}
      </DetailsModal>
    </Container>
  );
}
