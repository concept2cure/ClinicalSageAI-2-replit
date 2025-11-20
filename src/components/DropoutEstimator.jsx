// /client/src/components/DropoutEstimator.jsx
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function DropoutEstimator() {
  const [inputs, setInputs] = useState({ duration: '', controlType: '', arms: '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => setInputs({ ...inputs, [field]: value });

  const handleEstimate = async () => {
    setLoading(true);
    const res = await fetch('/api/analytics/dropout-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration_weeks: parseFloat(inputs.duration),
        control: inputs.controlType,
        arms: parseInt(inputs.arms),
      }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="space-y-4 mt-8">
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-lg font-semibold">Dropout Estimator</h3>

          <div className="grid grid-cols-2 gap-4">
            <Input
              placeholder="Trial duration (weeks)"
              value={inputs.duration}
              onChange={e => handleChange('duration', e.target.value)}
            />
            <Input
              placeholder="Control type (e.g. placebo)"
              value={inputs.controlType}
              onChange={e => handleChange('controlType', e.target.value)}
            />
            <Input
              placeholder="Number of arms"
              value={inputs.arms}
              onChange={e => handleChange('arms', e.target.value)}
            />
          </div>

          <Button onClick={handleEstimate} disabled={loading}>
            Estimate
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold text-base mb-2">Estimated Dropout Rate</h4>
            <p className="text-sm text-red-600">{result.dropout_rate}% predicted</p>
            <h5 className="mt-2 text-sm font-medium">Rationale</h5>
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap">
              {result.reasoning}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
