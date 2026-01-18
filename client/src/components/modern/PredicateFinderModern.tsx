import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Progress, Row, Space, Statistic, Table, Tag, Tooltip, Tabs } from 'antd';
    const columns = useMemo(
      () => [
        {
          title: 'Predicate Device',
          dataIndex: 'deviceName',
          key: 'deviceName',
          width: 280,
          render: (name: string, record: PredicateMatch) => (
            <Space direction="vertical" size={0}>
              <div className="predicate-name">{name}</div>
              <Space size={4}>
                <Tag>K{record.kNumber}</Tag>
                {record.clearanceDate ? <Tag color="default">{record.clearanceDate}</Tag> : null}
              </Space>
            </Space>
          ),
        },
        {
          title: 'Manufacturer',
          dataIndex: 'manufacturer',
          key: 'manufacturer',
          width: 180,
          render: (value: string) => value || 'Unknown',
        },
        {
          title: 'Product Code',
          dataIndex: 'productCode',
          key: 'productCode',
          width: 140,
          render: (value: string) => value || 'N/A',
        },
        {
          title: 'Device Class',
          dataIndex: 'deviceClass',
          key: 'deviceClass',
          width: 120,
          render: (value: string) => value || 'N/A',
        },
        {
          title: 'Decision Summary',
          dataIndex: 'decisionSummaryURL',
          key: 'decisionSummaryURL',
          width: 180,
          render: (url: string | undefined) =>
            url ? (
              <a href={url} target="_blank" rel="noreferrer" className="text-blue-600">
                View summary
              </a>
            ) : (
              <span className="text-slate-400">Unavailable</span>
            ),
        },
        {
          title: 'Action',
          key: 'action',
          width: 150,
          render: (_: unknown, record: PredicateMatch) => (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                size="small"
                type={selectedPredicate === record.kNumber ? 'primary' : 'default'}
                onClick={() => setSelectedPredicate(record.kNumber)}
                block
              >
                {selectedPredicate === record.kNumber ? 'Selected' : 'Select'}
              </Button>
              <Button
                size="small"
                icon={<InfoCircleOutlined />}
                onClick={() => onPredicateSelect?.(record.kNumber)}
                block
              >
                Details
              </Button>
            </Space>
          ),
        },
      ],
      [onPredicateSelect, selectedPredicate]
    );
      setSearchState('complete');
      setLastSearchAt(new Date());
      setAiInsights([
        {
          type: 'risk',
          category: 'Predicate Search',
          message: error?.message || 'Unable to complete predicate search.',
        },
      ]);
    }
  };

  const SearchHeader = () => (
    <motion.div
      className="search-header-compact"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Row gutter={16} align="middle">
        <Col flex="auto">
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <div className="device-profile-chip">
              <Badge status="processing" text={deviceProfile.deviceCode || deviceId} />
              <Tag color="blue">{deviceProfile.specialty || 'General'}</Tag>
            </div>
            <div className="search-prompt-text">
              <ThunderboltOutlined style={{ marginRight: 4 }} />
              Searching the FDA 510(k) database using your device profile...
            </div>
          </Space>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={searchState === 'searching'}
            onClick={executeSmartSearch}
            className="primary-search-btn"
          >
            {searchState === 'searching' ? 'Analyzing...' : 'Find Predicates'}
          </Button>
        </Col>
      </Row>
    </motion.div>
  );

  const SearchProgress = () => (
    <AnimatePresence>
      {searchState === 'searching' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="search-progress-panel"
        >
          <Row gutter={24}>
            <Col span={8}>
              <Statistic
                title="Results returned"
                value={searchResults.length}
                prefix={<SearchOutlined />}
                valueStyle={{ color: '#10B981' }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Status"
                value={searchState === 'searching' ? 'Searching' : 'Complete'}
                prefix={<SyncOutlined spin={searchState === 'searching'} />}
                valueStyle={{ color: '#3B82F6' }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Last updated"
                value={lastSearchAt ? lastSearchAt.toLocaleTimeString() : '--'}
                prefix={<DashboardOutlined />}
                valueStyle={{ color: '#F59E0B' }}
              />
            </Col>
          </Row>
          <Progress
            percent={searchResults.length > 0 ? Math.min(95, searchResults.length * 2) : 30}
            showInfo={false}
            strokeLinecap="round"
            trailColor="#E5E7EB"
          />
          <div className="ai-insights-strip">
            {aiInsights.slice(0, 3).map((insight, idx) => (
              <Tag key={idx} color="processing" icon={<RobotOutlined />} className="insight-tag">
                {insight.message}
              </Tag>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const PredicateResultsTable = () => {
    const columns = useMemo(
      () => [
        {
          title: 'Predicate Device',
          dataIndex: 'deviceName',
          key: 'deviceName',
          width: 280,
          render: (name: string, record: PredicateMatch) => (
            <Space direction="vertical" size={0}>
              <div className="predicate-name">{name}</div>
              <Space size={4}>
                <Tag>K{record.kNumber}</Tag>
                {record.clearanceDate ? <Tag color="default">{record.clearanceDate}</Tag> : null}
              </Space>
            </Space>
          ),
        },
        {
          title: 'Manufacturer',
          dataIndex: 'manufacturer',
          key: 'manufacturer',
          width: 180,
          render: (value: string) => value || 'Unknown',
        },
        {
          title: 'Product Code',
          dataIndex: 'productCode',
          key: 'productCode',
          width: 140,
          render: (value: string) => value || 'N/A',
        },
        {
          title: 'Device Class',
          dataIndex: 'deviceClass',
          key: 'deviceClass',
          width: 120,
          render: (value: string) => value || 'N/A',
        },
        {
          title: 'Decision Summary',
          dataIndex: 'decisionSummaryURL',
          key: 'decisionSummaryURL',
          width: 180,
          render: (url: string | undefined) =>
            url ? (
              <a href={url} target="_blank" rel="noreferrer" className="text-blue-600">
                View summary
              </a>
            ) : (
              <span className="text-slate-400">Unavailable</span>
            ),
        },
        {
          title: 'Action',
          key: 'action',
          width: 150,
          render: (_: unknown, record: PredicateMatch) => (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type={selectedPredicate === record.kNumber ? 'primary' : 'default'}
                size="small"
                block
                onClick={() => {
                  setSelectedPredicate(record.kNumber);
                  onPredicateSelect?.(record.kNumber);
                }}
                className="select-predicate-btn"
              >
                {selectedPredicate === record.kNumber ? 'Selected' : 'Select'}
              </Button>
              <Button size="small" type="link" block>
                Compare
              </Button>
            </Space>
          ),
        },
      ],
      [onPredicateSelect, selectedPredicate]
    );

    return (
      <Table
        dataSource={searchResults}
        columns={columns}
        rowKey="kNumber"
        rowClassName={(record: PredicateMatch) =>
          selectedPredicate === record.kNumber ? 'selected-predicate-row' : ''
        }
        pagination={false}
        scroll={{ y: 400 }}
        size="small"
        locale={{ emptyText: 'Execute search to find predicates' }}
        className="compact-predicate-table"
      />
    );
  };

  const PrimaryActionBar = () => (
    <motion.div
      className="primary-action-bar"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      {selectedPredicate ? (
        <Space size="large" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Tag color="success" style={{ padding: '8px 12px' }}>
              <CheckCircleTwoTone twoToneColor="#10B981" />
              <strong style={{ marginLeft: 8 }}>Predicate Selected: K{selectedPredicate}</strong>
            </Tag>
            <Tag color="blue">
              {searchResults.find(p => p.kNumber === selectedPredicate)?.manufacturer || 'Manufacturer unknown'}
            </Tag>
            <Tag color="default">
              {searchResults.find(p => p.kNumber === selectedPredicate)?.clearanceDate || 'Clearance date unknown'}
            </Tag>
          </Space>

          <Space>
            <Button size="large" onClick={() => setSelectedPredicate(null)}>
              Change Predicate
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<ArrowRightOutlined />}
              className="proceed-to-submission-btn"
              onClick={() => selectedPredicate && onProceed?.(selectedPredicate)}
            >
              {proceedLabel}
            </Button>
          </Space>
        </Space>
      ) : (
        <Alert
          message="Select a predicate device to continue to submission workflow"
          type="info"
          showIcon
          action={<Button size="small" disabled>Select Predicate First</Button>}
        />
      )}
    </motion.div>
  );

  const AIAnalysisView = () => (
    <Card
      title={
        <Space>
          <RobotOutlined />
          <span>Predicate Insights</span>
        </Space>
      }
      className="ai-analysis-card"
    >
      <Row gutter={24}>
        <Col span={16}>
          <div className="ai-insights-scroll">
            {aiInsights.map((insight, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="ai-insight-bubble"
              >
                <div className="insight-icon">
                  {insight.type === 'risk' && <WarningTwoTone twoToneColor="#EF4444" />}
                  {insight.type === 'opportunity' && (
                    <CheckCircleTwoTone twoToneColor="#10B981" />
                  )}
                  {insight.type === 'note' && <InfoCircleOutlined style={{ color: '#3B82F6' }} />}
                </div>
                <div className="insight-content">
                  <strong>{insight.category}</strong>
                  <p>{insight.message}</p>
                </div>
                {typeof insight.confidence === 'number' ? (
                  <div className="insight-confidence">
                    <Progress type="circle" percent={insight.confidence} width={40} format={p => `${p}%`} />
                  </div>
                ) : null}
              </motion.div>
            ))}
          </div>
        </Col>
        <Col span={8}>
          <Card size="small" title="Selected Predicate" className="probability-card">
            {selectedPredicate ? (
              <div className="space-y-2 text-sm text-slate-700">
                <div>
                  <span className="font-medium">K-Number:</span> K{selectedPredicate}
                </div>
                <div>
                  <span className="font-medium">Manufacturer:</span>{' '}
                  {searchResults.find(p => p.kNumber === selectedPredicate)?.manufacturer || 'Unknown'}
                </div>
                <div>
                  <span className="font-medium">Product Code:</span>{' '}
                  {searchResults.find(p => p.kNumber === selectedPredicate)?.productCode || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Device Class:</span>{' '}
                  {searchResults.find(p => p.kNumber === selectedPredicate)?.deviceClass || 'N/A'}
                </div>
                {searchResults.find(p => p.kNumber === selectedPredicate)?.decisionSummaryURL ? (
                  <a
                    href={searchResults.find(p => p.kNumber === selectedPredicate)?.decisionSummaryURL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600"
                  >
                    View FDA decision summary
                  </a>
                ) : (
                  <div className="text-slate-400">Decision summary unavailable</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a predicate to view metadata.</div>
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );

  return (
    <div className="predicate-finder-modern">
      <SearchHeader />
      <SearchProgress />

      <Tabs
        activeKey={comparisonView}
        onChange={key => setComparisonView(key as 'list' | 'ai-analysis')}
        tabBarStyle={{ marginBottom: 0 }}
        items={[
          {
            key: 'ai-analysis',
            label: (
              <Space>
                <RobotOutlined />
                AI Analysis
              </Space>
            ),
            children: <AIAnalysisView />,
          },
          {
            key: 'list',
            label: 'Predicate List',
            children: <PredicateResultsTable />,
          },
        ]}
      />

      <PrimaryActionBar />
    </div>
  );
};

export default PredicateFinderModern;
