import React, { useState } from 'react';
import { FileText, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

/**
 * VaultDocumentViewer Component
 * Displays and manages documents from the vault with search and filter capabilities
 */
const VaultDocumentViewer = () => {
  const { toast } = useToast();
  const [documents] = useState([
    { id: 1, name: 'Clinical Overview v2.1.pdf', type: 'Clinical', status: 'Approved', date: '2025-06-25', size: '2.3 MB' },
    { id: 2, name: 'Quality Summary - Drug Substance.pdf', type: 'Quality', status: 'Under Review', date: '2025-06-24', size: '1.8 MB' },
    { id: 3, name: 'Clinical Study Report - Phase II.pdf', type: 'Clinical', status: 'Draft', date: '2025-06-23', size: '5.2 MB' },
    { id: 4, name: 'Risk Management Plan v3.0.pdf', type: 'Administrative', status: 'Approved', date: '2025-06-22', size: '976 KB' },
    { id: 5, name: 'Investigator Brochure v4.1.pdf', type: 'Clinical', status: 'Final', date: '2025-06-21', size: '3.1 MB' }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || doc.type.toLowerCase() === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-gray-500" />
        <Input 
          placeholder="Search documents..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1" 
        />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="clinical">Clinical</SelectItem>
            <SelectItem value="quality">Quality</SelectItem>
            <SelectItem value="administrative">Administrative</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {filteredDocuments.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">{doc.name}</p>
                <p className="text-xs text-gray-500">{doc.type} • {doc.date} • {doc.size}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={doc.status === 'Approved' || doc.status === 'Final' ? 'default' : doc.status === 'Draft' ? 'secondary' : 'outline'}>
                {doc.status}
              </Badge>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => {
                  toast({
                    title: "Opening Document",
                    description: `Loading ${doc.name}...`
                  });
                  // Simulate document opening with real navigation
                  setTimeout(() => {
                    window.open(`/editor?document=${doc.id}&name=${encodeURIComponent(doc.name)}`, '_blank');
                  }, 500);
                }}
              >
                Open
              </Button>
            </div>
          </div>
        ))}
        {filteredDocuments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No documents found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VaultDocumentViewer;