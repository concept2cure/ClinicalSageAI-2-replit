import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

export default function CSRAlignmentBanner({ sessionId }) {
  const [alignment, setAlignment] = useState(null);

  useEffect(() => {
    const fetchAlignment = async () => {
      const res = await fetch(
        `/static/lumen_reports_backend/sessions/${sessionId}/alignment_score_report.json`
      );
      if (res.ok) {
        const data = await res.json();
        setAlignment(data);
      }
    };
    fetchAlignment();
  }, [sessionId]);

  if (!alignment) return null;

  const score = Math.round(alignment.alignment_score * 100);

  return (
    <Card
      className={`border-l-4 ${score >= 70 ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'} p-4 mb-6`}
    >
      <p className="text-sm text-gray-900">
        ✅ Protocol aligned with source CSR. Overall match score: <strong>{score}%</strong>.
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        <a
          href={`/static/lumen_reports_backend/sessions/${sessionId}/alignment_score_report.json`}
          target="_blank"
          className="underline hover:text-blue-600"
          rel="noopener noreferrer"
        >
          View full alignment report
        </a>
      </p>
    </Card>
  );
}
