import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function UnitSOPList({ units, onRefresh }) {
  const [files, setFiles] = useState({});
  const [titles, setTitles] = useState({});
  const [uploading, setUploading] = useState({});

  const handleFileChange = (unitId, file) => {
    setFiles(prev => ({ ...prev, [unitId]: file }));
    if (file && !titles[unitId]) {
      setTitles(prev => ({ ...prev, [unitId]: file.name }));
    }
  };

  const upload = async unit => {
    const file = files[unit.unit_id];
    if (!file) return;

    setUploading(prev => ({ ...prev, [unit.unit_id]: true }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', titles[unit.unit_id] || file.name);

      const response = await fetch(`/api/process/units/${unit.unit_id}/sop/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        toast({ title: 'SOP uploaded successfully!' });
        setFiles(prev => ({ ...prev, [unit.unit_id]: null }));
        setTitles(prev => ({ ...prev, [unit.unit_id]: '' }));
        onRefresh && onRefresh();
      } else {
        toast({ title: 'Upload failed' });
      }
    } catch (error) {
      console.error('Error uploading SOP:', error);
      toast({ title: 'Upload failed' });
    } finally {
      setUploading(prev => ({ ...prev, [unit.unit_id]: false }));
    }
  };

  return (
    <Card data-testid="card-unit-sops">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Unit SOPs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {units.map(unit => (
          <div
            key={unit.unit_id}
            className="rounded border p-4 space-y-3"
            data-testid={`unit-sop-${unit.unit_id}`}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">{unit.name}</div>
              <Badge variant="outline">{unit.type}</Badge>
            </div>

            {unit.sop_url && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <FileText className="h-4 w-4" />
                <a
                  href={unit.sop_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  data-testid={`link-current-sop-${unit.unit_id}`}
                >
                  {unit.sop_title || 'Current SOP'}
                </a>
              </div>
            )}

            <div className="space-y-2">
              <Input
                placeholder="SOP Title"
                value={titles[unit.unit_id] || ''}
                onChange={e => setTitles(prev => ({ ...prev, [unit.unit_id]: e.target.value }))}
                className="text-sm"
                data-testid={`input-sop-title-${unit.unit_id}`}
              />

              <div className="flex gap-2">
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={e => handleFileChange(unit.unit_id, e.target.files[0])}
                  className="text-sm"
                  data-testid={`input-sop-file-${unit.unit_id}`}
                />
                <Button
                  size="sm"
                  onClick={() => upload(unit)}
                  disabled={!files[unit.unit_id] || uploading[unit.unit_id]}
                  data-testid={`button-upload-sop-${unit.unit_id}`}
                >
                  {uploading[unit.unit_id] ? (
                    'Uploading...'
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-1" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
        {units.length === 0 && (
          <div className="text-sm text-slate-500 text-center py-4" data-testid="text-no-units">
            No units available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
