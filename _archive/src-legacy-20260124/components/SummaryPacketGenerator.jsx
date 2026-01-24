// /client/components/SummaryPacketGenerator.jsx
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { isValidSessionId } from '@/components/ProtocolUploadPanel';

export default function SummaryPacketGenerator({ sessionId }) {
  const [inputs, setInputs] = useState({
    protocol: '',
    ind25: '',
    ind27: '',
    sap: '',
    risks: '',
    success_probability: '',
    sample_size: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field, value) => {
    setInputs({ ...inputs, [field]: value });
  };

  const handleGenerate = async () => {
    if (!isValidSessionId(sessionId)) {
      alert('Session ID is missing or invalid. Please start or select a study session.');
      return;
    }

    const res = await fetch('/api/export/summary-packet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: inputs.protocol,
        ind25: inputs.ind25,
        ind27: inputs.ind27,
        sap: inputs.sap,
        risks: inputs.risks.split('\n'),
        success_probability: parseFloat(inputs.success_probability),
        sample_size: parseInt(inputs.sample_size),
        session_id: sessionId,
      }),
    });
    const data = await res.json();
    if (data.pdf_url) {
      window.open(data.pdf_url, '_blank');
      setSubmitted(true);
    }
  };

  return (
    <div className="space-y-4 mt-8">
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-lg font-semibold">📦 Generate Clinical Summary Packet</h3>

          <Textarea
            rows={4}
            placeholder="Paste protocol content"
            value={inputs.protocol}
            onChange={e => handleChange('protocol', e.target.value)}
          />
          <Textarea
            rows={3}
            placeholder="Paste IND Module 2.5 text"
            value={inputs.ind25}
            onChange={e => handleChange('ind25', e.target.value)}
          />
          <Textarea
            rows={3}
            placeholder="Paste IND Module 2.7 text"
            value={inputs.ind27}
            onChange={e => handleChange('ind27', e.target.value)}
          />
          <Textarea
            rows={3}
            placeholder="Paste SAP draft"
            value={inputs.sap}
            onChange={e => handleChange('sap', e.target.value)}
          />
          <Textarea
            rows={2}
            placeholder="Paste risk flags (one per line)"
            value={inputs.risks}
            onChange={e => handleChange('risks', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Success probability %"
              value={inputs.success_probability}
              onChange={e => handleChange('success_probability', e.target.value)}
            />
            <Input
              placeholder="Sample size estimate"
              value={inputs.sample_size}
              onChange={e => handleChange('sample_size', e.target.value)}
            />
          </div>

          <Button onClick={handleGenerate}>📄 Generate Summary Packet</Button>
          {submitted && (
            <p className="text-sm text-green-700">Packet generated and opened in new tab.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
