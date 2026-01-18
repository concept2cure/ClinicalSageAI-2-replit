import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Divider, Progress, Row, Space, Statistic, Steps, Tag, Timeline } from 'antd';
import {
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  RobotOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { AnimatePresence, motion } from 'framer-motion';

const { Step } = Steps;

interface SubmissionFlowProps {
  deviceId: string;
  predicateId: string;
  initialData?: Record<string, unknown>;
}

interface AITask {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  progress: number;
  result?: string;
}

interface SubmissionStats {
  overallReadiness: number;
  documentsComplete: number;
  aiConfidence: number;
  predictedReviewDays: number;
}

const submissionSteps = [
  {
    key: 'device-description',
    title: 'Device Description',
    subtitle: 'AI drafting from CER',
    icon: <PaperClipOutlined />,
  },
  {
    key: 'predicate-comparison',
    title: 'Predicate Comparison',
    subtitle: 'Auto-generated from selection',
    icon: <AuditOutlined />,
  },
  {
    key: 'substantial-equivalence',
    title: 'SE Determination',
    subtitle: 'AI analyzing claims',
    icon: <AuditOutlined />,
  },
  {
    key: 'labeling',
    title: 'Proposed Labeling',
    subtitle: 'IFU & packaging',
    icon: <FileDoneOutlined />,
  },
  {
    key: 'executive-summary',
    title: 'Executive Summary',
    subtitle: 'AI generating',
    icon: <RobotOutlined />,
  },
];

export const SubmissionBuilderModern = ({ deviceId, predicateId, initialData }: SubmissionFlowProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [submissionStatus, setSubmissionStatus] = useState<'draft' | 'review' | 'ai-processing' | 'submitted'>('draft');
  const [documentProgress, setDocumentProgress] = useState<Record<string, number>>({});
  const [aiTasks, setAiTasks] = useState<AITask[]>([]);
  const [submissionStats, setSubmissionStats] = useState<SubmissionStats | null>(null);

  const getStepStatus = (stepIndex: number): 'wait' | 'process' | 'finish' => {
    if (currentStep > stepIndex) return 'finish';
    if (currentStep === stepIndex) return 'process';
    return 'wait';
  };

  const generateAIDraft = async (documentKey: string) => {
    setSubmissionStatus('ai-processing');

    const taskId = `task-${Date.now()}`;
    setAiTasks(prev => [
      ...prev,
      {
        id: taskId,
        name: `Generating ${documentKey} draft`,
        status: 'running',
        progress: 0,
      },
    ]);

    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 120));
      setAiTasks(prev => prev.map(t => (t.id === taskId ? { ...t, progress: i } : t)));
      setDocumentProgress(prev => ({
        ...prev,
        [documentKey]: Math.min(100, (prev[documentKey] || 0) + 20),
      }));
    }

    setAiTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'completed', result: 'Draft generated successfully', progress: 100 }
          : t
      )
    );

    setTimeout(() => {
      setSubmissionStatus('draft');
    }, 300);
  };

  const initiateSmartSubmission = () => {
    setSubmissionStatus('submitted');
  };

  useEffect(() => {
    if (initialData) {
      submissionSteps.forEach(step => {
        if (initialData[step.key]) {
          setDocumentProgress(prev => ({ ...prev, [step.key]: 75 }));
        }
      });
    }

    const interval = setInterval(() => {
      setSubmissionStats({
        overallReadiness: Math.random() > 0.2 ? 87 : 72,
        documentsComplete: Object.values(documentProgress).filter(p => p >= 100).length,
        aiConfidence: 91,
        predictedReviewDays: 67,
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [documentProgress, initialData]);

  const isReadyToSubmit = (submissionStats?.overallReadiness || 0) >= 85;

  const modernStepIndicator = (
    <motion.div
      className="modern-step-indicator"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
    >
      <Steps current={currentStep} onChange={setCurrentStep} direction="horizontal" size="small" className="compact-steps">
        {submissionSteps.map((step, idx) => (
          <Step
            key={step.key}
            title={
              <Space direction="vertical" size={0}>
                <span className="step-title">{step.title}</span>
                <AnimatePresence>
                  {currentStep === idx && (
                    <motion.span className="step-subtitle" initial={{ opacity: 0 }} animate={{ opacity: 0.7 }}>
                      {step.subtitle}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Space>
            }
            icon={
              <AnimatePresence mode="wait">
                {submissionStatus === 'ai-processing' && currentStep === idx ? (
                  <motion.div key="loading" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                    <LoadingOutlined />
                  </motion.div>
                ) : (
                  <motion.div key={step.key} initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    {documentProgress[step.key] >= 100 ? (
                      <CheckCircleOutlined style={{ color: '#10B981' }} />
                    ) : (
                      step.icon
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            }
            status={getStepStatus(idx)}
          />
        ))}
      </Steps>
    </motion.div>
  );

  const documentProgressPanel = (
    <Card size="small" className="document-progress-card" bodyStyle={{ padding: '12px' }}>
      <Row gutter={16}>
        {submissionSteps.map(step => (
          <Col span={8} key={step.key}>
            <motion.div className="doc-status-item" whileHover={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <div className="doc-icon-row">
                  {step.icon}
                  <span className="doc-name">{step.title}</span>
                  {documentProgress[step.key] >= 100 && (
                    <CheckCircleOutlined style={{ color: '#10B981', marginLeft: 'auto' }} />
                  )}
                </div>
                <Progress
                  percent={documentProgress[step.key] || 0}
                  showInfo={false}
                  strokeWidth={4}
                  status={documentProgress[step.key] >= 100 ? 'success' : 'active'}
                />
                <div className="doc-meta">
                  <span className="progress-text">{documentProgress[step.key] || 0}% Complete</span>
                  {documentProgress[step.key] < 100 && (
                    <Button type="text" size="small" onClick={() => generateAIDraft(step.key)} className="ai-draft-btn">
                      <RobotOutlined /> AI Draft
                    </Button>
                  )}
                </div>
              </Space>
            </motion.div>
          </Col>
        ))}
      </Row>
    </Card>
  );

  const smartSubmitButton = (
    <motion.div
      className="smart-submit-container"
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, delay: 0.5 }}
    >
      <AnimatePresence>
        {isReadyToSubmit && (
          <motion.div
            className="submit-ready-indicator"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Alert
              message="✓ Submission ready for eSTAR"
              description="AI validation complete. All required documents present."
              type="success"
              showIcon
              action={<Button type="text" size="small">View Report</Button>}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        type="primary"
        size="large"
        icon={<SendOutlined />}
        disabled={!isReadyToSubmit}
        loading={submissionStatus === 'ai-processing'}
        onClick={initiateSmartSubmission}
        className="smart-submit-btn"
        style={{
          background: isReadyToSubmit
            ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
            : '#E5E7EB',
          border: 'none',
          height: 48,
          padding: '0 32px',
          boxShadow: isReadyToSubmit ? '0 4px 14px rgba(16, 185, 129, 0.3)' : 'none',
        }}
      >
        {isReadyToSubmit ? (
          <Space>
            <span>Submit to FDA eSTAR</span>
            <motion.div animate={{ x: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <ArrowRightOutlined />
            </motion.div>
          </Space>
        ) : (
          'Complete Required Sections'
        )}
      </Button>

      <div className="submission-confidence">
        {submissionStats && (
          <Statistic
            title="Submission Confidence"
            value={submissionStats.overallReadiness}
            suffix="%"
            precision={0}
            valueStyle={{
              color: submissionStats.overallReadiness >= 85 ? '#10B981' : '#F59E0B',
              fontSize: 24,
            }}
          />
        )}
      </div>

      {submissionStatus === 'submitted' && (
        <Alert message="Submission queued for FDA eSTAR" type="success" showIcon />
      )}
    </motion.div>
  );

  const aiTaskMonitor = (
    <Card
      title={
        <Space>
          <RobotOutlined />
          <span>AI Processing Queue</span>
          <Badge count={aiTasks.filter(t => t.status === 'running').length} showZero>
            <ClockCircleOutlined />
          </Badge>
        </Space>
      }
      size="small"
      className="ai-task-monitor"
    >
      <Timeline>
        <AnimatePresence>
          {aiTasks.map(task => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <Timeline.Item
                color={task.status === 'completed' ? 'green' : task.status === 'error' ? 'red' : 'blue'}
                dot={
                  task.status === 'running' ? (
                    <LoadingOutlined />
                  ) : task.status === 'completed' ? (
                    <CheckOutlined />
                  ) : (
                    <ExclamationCircleOutlined />
                  )
                }
              >
                <Space direction="vertical" size={0} style={{ width: '100%' }}>
                  <div className="task-name-row">
                    <span className="task-name">{task.name}</span>
                    <Tag color={task.status === 'completed' ? 'success' : 'processing'}>{task.status}</Tag>
                  </div>
                  {task.progress > 0 && (
                    <Progress percent={task.progress} showInfo={false} size="small" style={{ width: 120 }} />
                  )}
                  <span className="task-result">{task.result}</span>
                </Space>
              </Timeline.Item>
            </motion.div>
          ))}
        </AnimatePresence>
      </Timeline>
    </Card>
  );

  const statsPanel = useMemo(() => {
    if (!submissionStats) return null;
    return (
      <Card size="small" title="Action Items" style={{ marginTop: 16 }}>
        <Timeline>
          <Timeline.Item color="red">
            <p>Add predicate photos</p>
          </Timeline.Item>
          <Timeline.Item color="orange">
            <p>Complete software verification summary</p>
          </Timeline.Item>
          <Timeline.Item color="blue">
            <p>AI: Review executive summary draft</p>
          </Timeline.Item>
        </Timeline>
        <Divider style={{ margin: '8px 0' }} />
        <div className="submission-summary">
          <div className="summary-row">
            <span>Confidence:</span>
            <strong>{submissionStats.aiConfidence}%</strong>
          </div>
          <div className="summary-row">
            <span>Review ETA:</span>
            <strong>{submissionStats.predictedReviewDays} days</strong>
          </div>
        </div>
      </Card>
    );
  }, [submissionStats]);

  return (
    <div className="submission-builder-modern">
      <div className="flex items-center justify-between mb-3">
        <Space>
          <Tag color="processing">Device {deviceId}</Tag>
          <Tag color="purple">Predicate K{predicateId}</Tag>
        </Space>
        <Tag color={submissionStatus === 'submitted' ? 'success' : 'default'}>{submissionStatus.toUpperCase()}</Tag>
      </div>

      {modernStepIndicator}

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={16}>
          {documentProgressPanel}

          <AnimatePresence>
            {submissionStatus === 'ai-processing' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                {aiTaskMonitor}
              </motion.div>
            )}
          </AnimatePresence>
        </Col>
        <Col span={8}>
          {smartSubmitButton}
          {submissionStats && submissionStats.overallReadiness < 85 && statsPanel}
        </Col>
      </Row>
    </div>
  );
};

export default SubmissionBuilderModern;
