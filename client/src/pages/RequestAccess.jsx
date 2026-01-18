import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Select, message } from 'antd';
import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { onboardingService } from '../services/onboardingService';

const { Title, Text, Paragraph } = Typography;

const Container = styled.div`
  min-height: 100vh;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const FormCard = styled(Card)`
  width: 100%;
  max-width: 640px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
  border-radius: 16px;

  .ant-card-body {
    padding: 48px;
  }
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 32px;

  .logo {
    width: 56px;
    height: 56px;
    background: #2563eb;
    border-radius: 12px;
    margin: 0 auto 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: white;
    font-size: 20px;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
  }

  .subtitle {
    margin-top: 8px;
    color: #6b7280;
    font-size: 16px;
  }
`;

const StyledForm = styled(Form)`
  .ant-form-item {
    margin-bottom: 20px;
  }

  .ant-form-item-label > label {
    font-weight: 600;
    color: #1f2937;
  }

  .ant-input,
  .ant-input-password,
  .ant-select-selector {
    border-radius: 8px;
    padding: 12px 16px;
    border: 1px solid #e5e7eb;

    &:hover,
    &:focus-within {
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
    }
  }

  .ant-select-selector {
    height: 48px !important;
  }

  .ant-select-selection-placeholder {
    line-height: 48px;
  }
`;

const SubmitButton = styled(Button)`
  width: 100%;
  height: 48px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 16px;
  background: #059669;
  border-color: #059669;

  &:hover {
    background: #047857 !important;
    border-color: #047857 !important;
  }
`;

const SuccessContainer = styled.div`
  text-align: center;
  padding: 60px 40px;

  .success-icon {
    font-size: 64px;
    color: #059669;
    margin-bottom: 24px;
  }

  h2 {
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 16px;
  }

  p {
    font-size: 16px;
    color: #6b7280;
    line-height: 1.6;
    margin-bottom: 32px;
  }

  .checklist {
    text-align: left;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 20px;
    margin: 24px 0;

    .checklist-item {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      color: #166534;
      font-weight: 500;

      &:last-child {
        margin-bottom: 0;
      }
    }
  }
`;

export default function RequestAccess() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async values => {
    setLoading(true);
    try {
      await onboardingService.requestAccess({
        fullName: values.fullName,
        email: values.email,
        companyName: values.companyName,
        jobTitle: values.jobTitle,
        industry: values.industry,
        useCase: values.useCase,
      });

      setSubmitted(true);
      message.success('Access request submitted successfully!');
    } catch (error) {
      message.error(error.message || 'Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Container>
        <SuccessContainer>
          <CheckCircleOutlined className="success-icon" />
          <h2>Request Submitted Successfully!</h2>
          <p>
            Thank you for your interest in Concept2Cure. Our team has received your request and
            will review it within 24 hours.
          </p>

          <div className="checklist">
            <div className="checklist-item">
              <CheckCircleOutlined /> We'll review your information
            </div>
            <div className="checklist-item">
              <CheckCircleOutlined /> Send approval email to your admin
            </div>
            <div className="checklist-item">
              <CheckCircleOutlined /> You'll receive login credentials
            </div>
          </div>

          <Paragraph>
            <Text type="secondary">
              Questions? Contact us at{' '}
              <a href="mailto:support@concept2cure.com">support@concept2cure.com</a>
            </Text>
          </Paragraph>

          <Button type="primary" size="large" onClick={() => (window.location.href = '/')}>
            Return to Home
          </Button>
        </SuccessContainer>
      </Container>
    );
  }

  return (
    <Container>
      <FormCard>
        <Header>
          <div className="logo">C2C</div>
          <Title level={1}>Request Access</Title>
          <Text className="subtitle">Join leading medical device companies using Concept2Cure</Text>
        </Header>

        <StyledForm form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
          <Form.Item
            name="fullName"
            label="Full Name"
            rules={[{ required: true, message: 'Please enter your full name' }]}
          >
            <Input placeholder="John Doe" size="large" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Work Email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="john@medtech.com" size="large" />
          </Form.Item>

          <Form.Item
            name="companyName"
            label="Company Name"
            rules={[{ required: true, message: 'Please enter your company name' }]}
          >
            <Input placeholder="MedTech Innovations Inc." size="large" />
          </Form.Item>

          <Form.Item
            name="jobTitle"
            label="Job Title"
            rules={[{ required: true, message: 'Please enter your job title' }]}
          >
            <Input placeholder="Regulatory Affairs Manager" size="large" />
          </Form.Item>

          <Form.Item
            name="industry"
            label="Industry"
            rules={[{ required: true, message: 'Please select your industry' }]}
          >
            <Select placeholder="Select your industry" size="large">
              <Select.Option value="medical_device">Medical Device Manufacturer</Select.Option>
              <Select.Option value="pharma">Pharmaceutical</Select.Option>
              <Select.Option value="cro">Contract Research Organization (CRO)</Select.Option>
              <Select.Option value="consultant">Regulatory Consultant</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="useCase"
            label="How do you plan to use Concept2Cure?"
            rules={[{ required: true, message: 'Please describe your use case' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="e.g., Generate FDA 510(k) submissions, manage clinical evidence, track regulatory compliance..."
            />
          </Form.Item>

          <Form.Item>
            <SubmitButton
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={loading ? <LoadingOutlined /> : null}
            >
              {loading ? 'Submitting Request...' : 'Request Access'}
            </SubmitButton>
          </Form.Item>
        </StyledForm>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Text type="secondary">
            Already have an account? <a href="/login">Sign in</a>
          </Text>
        </div>
      </FormCard>
    </Container>
  );
}
