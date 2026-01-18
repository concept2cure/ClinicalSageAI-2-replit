import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Select, message } from 'antd';
import styled from 'styled-components';
import { apiRequest } from '@/lib/queryClient';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const Container = styled.div`
  min-height: 100vh;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const FormCard = styled(Card)`
  width: 100%;
  max-width: 720px;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);

  .ant-card-body {
    padding: 48px;
  }
`;

const StyledForm = styled(Form)`
  .ant-form-item-label > label {
    font-weight: 600;
    color: #1f2937;
  }

  .ant-input,
  .ant-input-affix-wrapper,
  .ant-select-selector {
    border-radius: 8px !important;
    padding: 10px 14px;
    border-color: #e5e7eb !important;
  }

  .ant-select-selector {
    height: 46px !important;
    align-items: center;
  }
`;

const SubmitButton = styled(Button)`
  width: 100%;
  height: 48px;
  font-weight: 600;
  border-radius: 8px;
`;

const TempPassword = styled.div`
  margin-top: 24px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 16px;
  color: #1e3a8a;

  .label {
    font-weight: 600;
  }

  .value {
    margin-top: 8px;
    font-size: 16px;
    font-weight: 600;
    word-break: break-all;
  }
`;

export default function AdminOnboarding() {
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [form] = Form.useForm();

  const handleSubmit = async values => {
    setLoading(true);
    setTempPassword('');
    try {
      const response = await apiRequest('POST', '/api/admin/create-client', {
        companyName: values.companyName,
        adminEmail: values.adminEmail,
        adminName: values.adminName,
        industry: values.industry,
        useCase: values.useCase,
      });
      const payload = await response.json();
      setTempPassword(payload?.tempPassword || '');
      message.success('Client created and welcome email sent.');
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to create client.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <FormCard>
        <Title level={2} style={{ marginBottom: 8 }}>
          Client Onboarding
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 32 }}>
          Create organizations and admin users for manual onboarding approvals.
        </Paragraph>

        <StyledForm form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="companyName"
            label="Company Name"
            rules={[{ required: true, message: 'Please enter the company name' }]}
          >
            <Input placeholder="MedTech Innovations Inc." size="large" />
          </Form.Item>

          <Form.Item
            name="adminName"
            label="Admin Name"
            rules={[{ required: true, message: 'Please enter the admin name' }]}
          >
            <Input placeholder="Jane Smith" size="large" />
          </Form.Item>

          <Form.Item
            name="adminEmail"
            label="Admin Email"
            rules={[
              { required: true, message: 'Please enter the admin email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="admin@company.com" size="large" />
          </Form.Item>

          <Form.Item
            name="industry"
            label="Industry"
            rules={[{ required: true, message: 'Please select an industry' }]}
          >
            <Select
              placeholder="Select industry"
              options={[
                { value: 'medical_device', label: 'Medical Device' },
                { value: 'pharma', label: 'Pharmaceutical' },
                { value: 'cro', label: 'CRO' },
                { value: 'consultant', label: 'Consultant' },
              ]}
            />
          </Form.Item>

          <Form.Item name="useCase" label="Primary Use Case">
            <TextArea rows={4} placeholder="Describe the primary use case" />
          </Form.Item>

          <SubmitButton type="primary" htmlType="submit" loading={loading}>
            Create Client & Send Welcome
          </SubmitButton>
        </StyledForm>

        {tempPassword ? (
          <TempPassword>
            <div className="label">Temporary password</div>
            <div className="value">{tempPassword}</div>
            <Text type="secondary">
              Share this with the client admin if email delivery fails.
            </Text>
          </TempPassword>
        ) : null}
      </FormCard>
    </Container>
  );
}
