// client/src/components/AssistantResponsePanel.jsx
import { Card, CardContent } from '@/components/ui/card';

export default function AssistantResponsePanel({ data }) {
  if (!data) return null;

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardContent>
          <h3 className="font-semibold text-lg mb-1">🧠 Assistant Response</h3>
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{data.answer}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold text-lg mb-1">📋 Recommended Study Design</h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">{data.recommended_design}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold text-lg mb-1">📎 CSR Justification</h3>
          <ul className="list-disc list-inside text-sm text-muted-foreground">
            {data.justification?.map((j, idx) => (
              <li key={idx}>{j}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold text-lg mb-1">⚠️ Risk Factors</h3>
          <pre className="whitespace-pre-wrap text-sm text-red-600">{data.risk_flags}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
