import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
import { Skeleton } from '@/components/ui/skeleton';

interface Version {
  timestamp: number;
  source: string;
  version_text: string;
}

interface ProtocolVersionCompareProps {
  protocolId: string;
}

export default function ProtocolVersionCompare({ protocolId }: ProtocolVersionCompareProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/protocol/versions/${protocolId}`);
        const data = await res.json();
        setVersions(data || []);
      } catch (error) {
        console.error('Error fetching protocol versions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVersions();
  }, [protocolId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500">No saved versions found for this protocol.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {versions.slice(0, 2).map((v, idx) => (
        <Card key={idx} className="border shadow-sm">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 italic">
                {new Date(v.timestamp * 1000).toLocaleString()} — {v.source}
              </p>
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                {idx === 0 ? 'Latest' : 'Previous'}
              </span>
            </div>
            <div className="h-[1px] bg-gray-200 my-2"></div>
            <pre className="text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap max-h-[400px] overflow-y-auto">
              {v.version_text}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
